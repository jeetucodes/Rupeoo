import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Platform, Clipboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeJsonParse } from '@/lib/safeStorage';
import {
  detectDraftTransactions,
  DraftTransactionItem,
  DetectionProgress,
} from '@/lib/bankDraftDetector';
import {
  splitMultiMessageText,
  RawSmsMessage,
} from '@/lib/smsReader';
import {
  getSmsImportSettings,
  formatTransactionNote,
  SmsImportSettings,
  DEFAULT_SMS_SETTINGS,
} from '@/lib/smsSettings';
import { insertTransaction, normalizeDate } from '@/lib/database';
import { markMsgsProcessedBatch } from '@/lib/smsDedupe';
import { recordImportBatch, undoImportBatch } from '@/lib/smsBatchUndo';
import { warn } from '@/lib/logger';

export type BankImportState = 'ready' | 'reading' | 'review' | 'done';
export type ImportRange = '30d' | '90d' | '365d' | 'all';

export interface UseBankImportOptions {
  userId: string;
}

const getDraftStorageKey = (userId: string) => `@rupeo_bank_import_drafts_${userId}`;

export function useBankImport({ userId }: UseBankImportOptions) {
  const [state, setState] = useState<BankImportState>('ready');
  const [selectedRange, setSelectedRange] = useState<ImportRange>('90d');
  const [drafts, setDrafts] = useState<DraftTransactionItem[]>([]);
  const [progress, setProgress] = useState<DetectionProgress>({
    scanned: 0,
    total: 0,
    detected: 0,
    duplicates: 0,
  });
  const [showAlreadyAdded, setShowAlreadyAdded] = useState(false);
  const [smsSettings, setSmsSettings] = useState<SmsImportSettings>(DEFAULT_SMS_SETTINGS);
  const [lastBatchResult, setLastBatchResult] = useState<{ batchId: string; count: number } | null>(null);

  const cancelTokenRef = useRef<{ isCancelled: boolean }>({ isCancelled: false });

  // Load settings & restore pending drafts on mount
  useEffect(() => {
    if (!userId) return;

    getSmsImportSettings(userId).then(setSmsSettings).catch(() => {});

    const draftKey = getDraftStorageKey(userId);
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (raw) {
          const restored = safeJsonParse<DraftTransactionItem[]>(raw, [], draftKey, (v) => Array.isArray(v));
          if (restored.length > 0) {
            setDrafts(restored);
            setState('review');
          }
        }
      })
      .catch(() => {});
  }, [userId]);

  // Persist drafts locally so an app background/kill does not lose the review list
  const persistDrafts = useCallback(
    async (newDrafts: DraftTransactionItem[]) => {
      if (!userId) return;
      try {
        if (newDrafts.length > 0) {
          await AsyncStorage.setItem(getDraftStorageKey(userId), JSON.stringify(newDrafts));
        } else {
          await AsyncStorage.removeItem(getDraftStorageKey(userId));
        }
      } catch (err) {
        warn('Failed to persist bank import drafts:', err);
      }
    },
    [userId]
  );

  const refreshSettings = useCallback(async () => {
    if (!userId) return;
    const s = await getSmsImportSettings(userId);
    setSmsSettings(s);
  }, [userId]);

  // Start Reading from custom messages (clipboard / pasted text)
  const startReading = useCallback(
    async (options?: { range?: ImportRange; customMessages?: RawSmsMessage[] }) => {
      const range = options?.range || selectedRange;
      setSelectedRange(range);

      const cancelToken = { isCancelled: false };
      cancelTokenRef.current = cancelToken;

      setState('reading');
      setProgress({ scanned: 0, total: 0, detected: 0, duplicates: 0 });

      try {
        let messages: RawSmsMessage[] = [];

        if (options?.customMessages && options.customMessages.length > 0) {
          messages = options.customMessages;
        }

        if (cancelToken.isCancelled) {
          setState('ready');
          return;
        }

        const detectedDrafts = await detectDraftTransactions(userId, messages, {
          cancelToken,
          chunkSize: 80,
          settings: smsSettings,
          onProgress: (p) => setProgress(p),
        });

        if (cancelToken.isCancelled) {
          setState('ready');
          return;
        }

        setDrafts(detectedDrafts);
        await persistDrafts(detectedDrafts);

        // Automatically transition to Review state
        setState('review');
      } catch (err) {
        warn('Error in startReading:', err);
        setState('ready');
      }
    },
    [userId, selectedRange, smsSettings, persistDrafts]
  );

  // Read from Clipboard (One-tap source for Play flavor & Web)
  const readFromClipboard = useCallback(async (): Promise<{ found: number; text: string }> => {
    try {
      let text = '';
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
          text = await navigator.clipboard.readText();
        }
      } else {
        text = await Clipboard.getString();
      }

      if (!text || !text.trim()) {
        return { found: 0, text: '' };
      }

      const rawAlerts = splitMultiMessageText(text);
      const messages: RawSmsMessage[] = rawAlerts.map((m, idx) => ({
        _id: `clip_${Date.now()}_${idx}`,
        address: m.sender || 'Pasted Alert',
        body: m.body,
        date: m.timestamp || Date.now(),
      }));

      await startReading({ customMessages: messages });
      return { found: messages.length, text };
    } catch (err) {
      warn('Clipboard read error:', err);
      return { found: 0, text: '' };
    }
  }, [startReading]);

  // Read from Pasted Text
  const readFromPastedText = useCallback(
    async (text: string): Promise<number> => {
      if (!text || !text.trim()) return 0;
      const rawAlerts = splitMultiMessageText(text);
      const messages: RawSmsMessage[] = rawAlerts.map((m, idx) => ({
        _id: `paste_${Date.now()}_${idx}`,
        address: m.sender || 'Pasted Alert',
        body: m.body,
        date: m.timestamp || Date.now(),
      }));

      await startReading({ customMessages: messages });
      return messages.length;
    },
    [startReading]
  );

  const cancelReading = useCallback(() => {
    cancelTokenRef.current.isCancelled = true;
    setState('ready');
  }, []);

  // Toggle selection for a draft item
  const toggleDraft = useCallback(
    (id: string) => {
      setDrafts((prev) => {
        const next = prev.map((d) => (d.id === id && !d.isAlreadyAdded ? { ...d, selected: !d.selected } : d));
        persistDrafts(next);
        return next;
      });
    },
    [persistDrafts]
  );

  // Select all or Select none (ignoring already added items)
  const selectAll = useCallback(
    (select: boolean) => {
      setDrafts((prev) => {
        const next = prev.map((d) => (d.isAlreadyAdded ? d : { ...d, selected: select }));
        persistDrafts(next);
        return next;
      });
    },
    [persistDrafts]
  );

  // Update draft fields (amount, merchant, category, type)
  const updateDraft = useCallback(
    (id: string, patch: Partial<DraftTransactionItem>) => {
      setDrafts((prev) => {
        const next = prev.map((d) => (d.id === id ? { ...d, ...patch } : d));
        persistDrafts(next);
        return next;
      });
    },
    [persistDrafts]
  );

  // Ignore / Exclude draft
  const ignoreDraft = useCallback(
    (id: string) => {
      setDrafts((prev) => {
        const next = prev.filter((d) => d.id !== id);
        persistDrafts(next);
        return next;
      });
    },
    [persistDrafts]
  );

  // Save selected drafts to user transactions
  const saveSelected = useCallback(async (): Promise<number> => {
    const toSave = drafts.filter((d) => d.selected && !d.isAlreadyAdded);
    if (toSave.length === 0) {
      return 0;
    }

    const batchId = `batch_sms_${Date.now()}`;
    const createdTxIds: string[] = [];
    const processedHashes: Array<{ msgHash: string; nativeId?: string }> = [];

    for (const draft of toSave) {
      const formattedNote = formatTransactionNote(draft.bankName, draft.rawText, smsSettings);
      const dateStr = normalizeDate(new Date(draft.date).toISOString());

      const txPayload = {
        id: draft.id,
        amount: draft.amount,
        type: draft.type === 'income' ? ('credit' as const) : ('debit' as const),
        category: draft.category,
        merchant_name: draft.merchant || null,
        description: formattedNote,
        payment_mode: draft.channel === 'card' ? 'Card' : draft.channel === 'ATM' ? 'Cash' : 'UPI',
        ref_no: draft.refNo || null,
        utr: draft.refNo || null,
        date: dateStr,
        source: 'sms_inbox',
        sourceHash: draft.msgHash,
        payKey: draft.payKey,
        batchId,
        importedAt: Date.now(),
      };

      try {
        const createdId = await insertTransaction(userId, txPayload);
        if (createdId) {
          createdTxIds.push(createdId);
          processedHashes.push({ msgHash: draft.msgHash, nativeId: draft.nativeId });
        }
      } catch (err) {
        warn('Error saving transaction draft:', err);
      }
    }

    if (createdTxIds.length > 0) {
      await recordImportBatch(userId, {
        batchId,
        dateRange: selectedRange,
        timestamp: Date.now(),
        totalScanned: drafts.length,
        addedCount: createdTxIds.length,
        skippedCount: drafts.length - createdTxIds.length,
        reviewCount: 0,
        createdTxIds,
      });

      if (processedHashes.length > 0) {
        await markMsgsProcessedBatch(userId, processedHashes);
      }
    }

    // Clear drafts and persistence
    setDrafts([]);
    await AsyncStorage.removeItem(getDraftStorageKey(userId));

    setLastBatchResult({ batchId, count: createdTxIds.length });
    setState('done');

    return createdTxIds.length;
  }, [drafts, userId, smsSettings, selectedRange]);

  // Discard all drafts
  const discard = useCallback(async () => {
    setDrafts([]);
    await AsyncStorage.removeItem(getDraftStorageKey(userId));
    setState('ready');
  }, [userId]);

  // Undo last saved batch
  const undoLastBatch = useCallback(async (): Promise<number> => {
    if (!lastBatchResult?.batchId) return 0;
    const count = await undoImportBatch(lastBatchResult.batchId, userId);
    setLastBatchResult(null);
    setState('ready');
    return count;
  }, [lastBatchResult, userId]);

  // Computed summary totals
  const totals = useMemo(() => {
    let expenseTotal = 0;
    let incomeTotal = 0;
    let selectedCount = 0;
    let alreadyAddedCount = 0;
    let lowConfidenceCount = 0;

    for (const d of drafts) {
      if (d.isAlreadyAdded) {
        alreadyAddedCount++;
      } else {
        if (d.selected) {
          selectedCount++;
          if (d.type === 'income') {
            incomeTotal += d.amount;
          } else {
            expenseTotal += d.amount;
          }
        }
        if (d.isLowConfidence) {
          lowConfidenceCount++;
        }
      }
    }

    return {
      totalFound: drafts.length,
      selectedCount,
      expenseTotal,
      incomeTotal,
      alreadyAddedCount,
      lowConfidenceCount,
    };
  }, [drafts]);

  return {
    state,
    setState,
    selectedRange,
    setSelectedRange,
    drafts,
    progress,
    showAlreadyAdded,
    setShowAlreadyAdded,
    smsSettings,
    lastBatchResult,
    totals,
    startReading,
    readFromClipboard,
    readFromPastedText,
    cancelReading,
    toggleDraft,
    selectAll,
    updateDraft,
    ignoreDraft,
    saveSelected,
    discard,
    undoLastBatch,
    refreshSettings,
  };
}
