import { parseAlert, type ParsedAlert } from './alertParser.ts';
import {
  computeMsgHash,
  computePayKey,
  getCandidatePayKeys,
  createDeterministicTxId,
  isMsgAlreadyProcessed,
  isPayKeyIgnored,
  markMsgsProcessedBatch,
  loadDedupeCache,
  setImportCursor,
} from './smsDedupe.ts';
import { getSmsImportSettings, formatTransactionNote } from './smsSettings.ts';
import { addPendingAlert } from './pendingInbox.ts';
import { recordImportBatch, type SmsImportBatch } from './smsBatchUndo.ts';
import { insertTransaction, normalizeDate, getAllTransactions } from './database.ts';
import { RawSmsMessage, readSmsInbox } from './smsReader.ts';
import { warn } from './logger.ts';

export interface ImportProgress {
  scanned: number;
  detected: number;
  duplicatesSkipped: number;
  added: number;
  needsReview: number;
  isComplete: boolean;
  isCancelled: boolean;
  statusText: string;
}

export interface SmsImportProgress {
  phase: 'idle' | 'scanning' | 'parsing' | 'saving' | 'complete' | 'cancelled' | 'reading' | 'deduping';
  scannedCount: number;
  detectedCount: number;
  duplicatesSkipped: number;
  addedCount: number;
  reviewCount: number;
  totalToScan: number;
  statusText?: string;
  isComplete?: boolean;
}

export interface DetectedItem {
  id: string;
  amount: number;
  type: 'expense' | 'income' | 'transfer';
  merchant: string;
  category: string;
  bankName: string;
  accountLast4?: string | null;
  date: number;
  channel: string;
  status: 'added' | 'pending' | 'duplicate';
  rawText: string;
}

export interface ImportResult {
  batchId: string;
  totalScanned: number;
  scannedCount: number;
  detectedCount: number;
  duplicatesSkipped: number;
  addedCount: number;
  reviewCount: number;
  createdTxIds: string[];
  isCancelled: boolean;
  detectedItems: DetectedItem[];
}

export type SmsImportResult = ImportResult;

export interface CancelToken {
  isCancelled: boolean;
}

/**
 * Calculates epoch millisecond cutoffs for standard date range selections.
 */
export function calculateDateRangeCutoff(range: '30_days' | '3_months' | '1_year' | 'all'): number {
  const now = Date.now();
  switch (range) {
    case '30_days':
      return now - 30 * 24 * 60 * 60 * 1000;
    case '3_months':
      return now - 90 * 24 * 60 * 60 * 1000;
    case '1_year':
      return now - 365 * 24 * 60 * 60 * 1000;
    case 'all':
      return 0;
    default:
      return now - 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * High-accuracy SMS import runner.
 * Processes inbox or pasted messages in chunked batches with periodic yields
 * to keep UI smooth on low-end Android phones.
 */
export async function runSmsImport(
  userId: string,
  messages: RawSmsMessage[],
  options: {
    batchId?: string;
    dateRangeLabel?: string;
    onProgress?: (progress: ImportProgress) => void;
    cancelToken?: CancelToken;
    chunkSize?: number;
  } = {}
): Promise<ImportResult> {
  const batchId = options.batchId || `batch_sms_${Date.now()}`;
  const chunkSize = options.chunkSize || 100;
  const cancelToken = options.cancelToken;
  const onProgress = options.onProgress;

  const result: ImportResult = {
    batchId,
    totalScanned: 0,
    scannedCount: 0,
    detectedCount: 0,
    duplicatesSkipped: 0,
    addedCount: 0,
    reviewCount: 0,
    createdTxIds: [],
    isCancelled: false,
    detectedItems: [],
  };

  if (!userId || !messages || messages.length === 0) {
    return result;
  }

  // 1. Load user settings & dedupe cache into memory
  const settings = await getSmsImportSettings(userId);
  await loadDedupeCache(userId);

  // 2. Fetch all existing local transactions to check existing payment keys
  const existingTxs = await getAllTransactions(userId, false);
  const existingPayKeys = new Set<string>();
  const existingDocIds = new Set<string>();

  for (const t of existingTxs) {
    if (t?.id) existingDocIds.add(t.id);
    if (t?.payKey) existingPayKeys.add(t.payKey);
  }

  const processedBatchHashes: Array<{ msgHash: string; nativeId?: string }> = [];
  let latestTimestamp = 0;

  for (let i = 0; i < messages.length; i++) {
    // Check cancel request
    if (cancelToken?.isCancelled) {
      result.isCancelled = true;
      break;
    }

    const msg = messages[i];
    result.totalScanned++;
    result.scannedCount++;

    const timestamp = msg.date || Date.now();
    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
    }

    // Layer 1 Dedupe: Message Fingerprint
    const msgHash = computeMsgHash(msg.address, msg.body, timestamp);
    if (isMsgAlreadyProcessed(userId, msgHash, msg._id)) {
      result.duplicatesSkipped++;
      continue;
    }

    // Parse the message body with custom banks support
    const parsed = parseAlert(msg.body, {
      sender: msg.address,
      timestamp,
      customCategoryRules: settings.customCategoryRules,
      customBanks: settings.customBanks || settings.allowedSenders,
    });

    // Skip OTPs, promos, non-financial messages, or missing amount
    if (parsed.isOtpOrPromo || parsed.amount === null || parsed.amount <= 0) {
      // Still mark message as processed so we don't re-parse junk next time
      processedBatchHashes.push({ msgHash, nativeId: msg._id });
      continue;
    }

    result.detectedCount++;

    // Layer 2 Dedupe: Payment Key
    const payKey = computePayKey(
      parsed.amount,
      parsed.type,
      parsed.refNo || parsed.merchantNormalized,
      parsed.accountLast4,
      timestamp
    );

    // Layer 4 Dedupe: Check if user previously deleted this payment
    const candidateKeys = getCandidatePayKeys(
      parsed.amount,
      parsed.type,
      parsed.refNo || parsed.merchantNormalized,
      parsed.accountLast4,
      timestamp
    );

    if (isPayKeyIgnored(userId, candidateKeys)) {
      result.duplicatesSkipped++;
      processedBatchHashes.push({ msgHash, nativeId: msg._id });
      continue;
    }

    // Check if this payment is already in existing transactions
    let isAlreadyInTxs = false;
    for (const cand of candidateKeys) {
      if (existingPayKeys.has(cand)) {
        isAlreadyInTxs = true;
        break;
      }
    }

    // Layer 3 Dedupe: Deterministic document ID
    const deterministicId = createDeterministicTxId(payKey, msgHash);
    if (existingDocIds.has(deterministicId)) {
      isAlreadyInTxs = true;
    }

    if (isAlreadyInTxs) {
      result.duplicatesSkipped++;
      processedBatchHashes.push({ msgHash, nativeId: msg._id });
      continue;
    }

    // Decision: Auto-add vs Pending Inbox
    const shouldAutoAdd =
      parsed.confidence >= 0.9 &&
      !settings.reviewBeforeAdding &&
      settings.autoAddEnabled;

    if (shouldAutoAdd) {
      // Auto-add via existing insertTransaction
      const formattedNote = formatTransactionNote(parsed.sender, parsed.rawText, settings);
      const dateStr = normalizeDate(new Date(timestamp).toISOString());

      const txPayload = {
        id: deterministicId,
        amount: parsed.amount,
        type: parsed.type === 'income' ? 'credit' : 'debit',
        category: parsed.category,
        merchant_name: parsed.merchantNormalized || parsed.merchant || null,
        description: formattedNote,
        payment_mode: parsed.channel === 'card' ? 'Card' : parsed.channel === 'ATM' ? 'Cash' : 'UPI',
        ref_no: parsed.refNo,
        utr: parsed.refNo,
        date: dateStr,
        source: 'sms_inbox',
        sourceHash: msgHash,
        payKey,
        batchId,
        importedAt: Date.now(),
      };

      try {
        const createdId = await insertTransaction(userId, txPayload);
        if (createdId) {
          result.addedCount++;
          result.createdTxIds.push(createdId);
          existingDocIds.add(createdId);
          existingPayKeys.add(payKey);
          result.detectedItems.push({
            id: createdId,
            amount: parsed.amount,
            type: parsed.type,
            merchant: parsed.merchantNormalized || parsed.merchant || (parsed.type === 'income' ? 'Income' : 'Expense'),
            category: parsed.category,
            bankName: parsed.sender || 'Bank Alert',
            accountLast4: parsed.accountLast4,
            date: timestamp,
            channel: parsed.channel,
            status: 'added',
            rawText: parsed.rawText,
          });
        }
      } catch (err) {
        warn('Error auto-adding transaction:', err);
      }
    } else if (parsed.confidence >= 0.6 || settings.reviewBeforeAdding) {
      // Medium/Low confidence or user requested review: send to Pending Inbox
      const addedToInbox = await addPendingAlert(userId, {
        id: `pending_${payKey}`,
        payKey,
        msgHash,
        alert: parsed,
        createdAt: Date.now(),
        batchId,
      });

      if (addedToInbox) {
        result.reviewCount++;
        result.detectedItems.push({
          id: `pending_${payKey}`,
          amount: parsed.amount,
          type: parsed.type,
          merchant: parsed.merchantNormalized || parsed.merchant || (parsed.type === 'income' ? 'Income' : 'Expense'),
          category: parsed.category,
          bankName: parsed.sender || 'Bank Alert',
          accountLast4: parsed.accountLast4,
          date: timestamp,
          channel: parsed.channel,
          status: 'pending',
          rawText: parsed.rawText,
        });
      }
    }

    // Mark as processed
    processedBatchHashes.push({ msgHash, nativeId: msg._id });

    // Yield to JS event loop every chunk to prevent UI freeze
    if (i % chunkSize === 0 || i === messages.length - 1) {
      if (processedBatchHashes.length > 0) {
        await markMsgsProcessedBatch(userId, [...processedBatchHashes]);
        processedBatchHashes.length = 0;
      }

      if (onProgress) {
        onProgress({
          scanned: result.totalScanned,
          detected: result.detectedCount,
          duplicatesSkipped: result.duplicatesSkipped,
          added: result.addedCount,
          needsReview: result.reviewCount,
          isComplete: i === messages.length - 1,
          isCancelled: Boolean(cancelToken?.isCancelled),
          statusText: `Scanned ${result.totalScanned} of ${messages.length} messages...`,
        });
      }

      // Yield execution to allow React Native UI to update smoothly
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Final flush of processed hashes
  if (processedBatchHashes.length > 0) {
    await markMsgsProcessedBatch(userId, processedBatchHashes);
  }

  // Update incremental cursor
  if (latestTimestamp > 0) {
    await setImportCursor(userId, latestTimestamp, 'inbox');
  }

  // Record batch metadata for undo support
  const batchMeta: SmsImportBatch = {
    batchId,
    timestamp: Date.now(),
    dateRange: options.dateRangeLabel || 'All',
    totalScanned: result.totalScanned,
    addedCount: result.addedCount,
    skippedCount: result.duplicatesSkipped,
    reviewCount: result.reviewCount,
    createdTxIds: result.createdTxIds,
  };
  await recordImportBatch(userId, batchMeta);

  if (onProgress) {
    onProgress({
      scanned: result.totalScanned,
      detected: result.detectedCount,
      duplicatesSkipped: result.duplicatesSkipped,
      added: result.addedCount,
      needsReview: result.reviewCount,
      isComplete: true,
      isCancelled: Boolean(result.isCancelled),
      statusText: result.isCancelled ? 'Import cancelled' : 'Import complete',
    });
  }

  return result;
}

/**
 * Imports messages directly from the device SMS inbox.
 * Only available on Android direct flavor with READ_SMS permission.
 */
export async function importFromSmsInbox(
  userId: string,
  options: {
    minDate?: number;
    maxDate?: number;
    limit?: number;
    onProgress?: (progress: SmsImportProgress) => void;
    cancelController?: { cancel: () => void; isCancelled?: boolean };
  }
): Promise<SmsImportResult> {
  const cancelToken: CancelToken = { isCancelled: false };
  if (options.cancelController) {
    options.cancelController.cancel = () => {
      cancelToken.isCancelled = true;
    };
  }

  const minDate = options.minDate ?? (Date.now() - 30 * 24 * 60 * 60 * 1000);
  const maxDate = options.maxDate ?? Date.now();
  const limit = options.limit ?? 2500;

  options.onProgress?.({
    phase: 'scanning',
    scannedCount: 0,
    detectedCount: 0,
    duplicatesSkipped: 0,
    addedCount: 0,
    reviewCount: 0,
    totalToScan: 0,
    statusText: 'Reading SMS inbox...',
  });

  const messages = await readSmsInbox({ minDate, maxDate, limit });

  return runSmsImport(userId, messages, {
    dateRangeLabel: `From ${new Date(minDate).toLocaleDateString()}`,
    cancelToken,
    onProgress: (p) => {
      options.onProgress?.({
        phase: p.isComplete ? 'complete' : p.isCancelled ? 'cancelled' : 'parsing',
        scannedCount: p.scanned,
        detectedCount: p.detected,
        duplicatesSkipped: p.duplicatesSkipped,
        addedCount: p.added,
        reviewCount: p.needsReview,
        totalToScan: messages.length,
        statusText: p.statusText,
        isComplete: p.isComplete,
      });
    },
  });
}

/**
 * Imports multiple pasted bank / UPI alerts from raw text chunks.
 */
export async function importFromPastedMessages(
  rawMessages: Array<{ sender: string; body: string; timestamp: number }>,
  userId: string,
  onProgress?: (progress: SmsImportProgress) => void,
  cancelController?: { cancel: () => void }
): Promise<SmsImportResult> {
  const cancelToken: CancelToken = { isCancelled: false };
  if (cancelController) {
    cancelController.cancel = () => {
      cancelToken.isCancelled = true;
    };
  }

  const messages: RawSmsMessage[] = rawMessages.map((m, idx) => ({
    _id: `paste_${Date.now()}_${idx}`,
    address: m.sender || 'Pasted Alert',
    body: m.body,
    date: m.timestamp || Date.now(),
  }));

  return runSmsImport(userId, messages, {
    dateRangeLabel: 'Pasted Messages',
    cancelToken,
    onProgress: (p) => {
      onProgress?.({
        phase: p.isComplete ? 'complete' : p.isCancelled ? 'cancelled' : 'parsing',
        scannedCount: p.scanned,
        detectedCount: p.detected,
        duplicatesSkipped: p.duplicatesSkipped,
        addedCount: p.added,
        reviewCount: p.needsReview,
        totalToScan: messages.length,
        statusText: p.statusText,
        isComplete: p.isComplete,
      });
    },
  });
}
