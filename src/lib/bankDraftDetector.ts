import { parseAlert, type ParsedAlert } from './alertParser.ts';
import {
  computeMsgHash,
  computePayKey,
  getCandidatePayKeys,
  createDeterministicTxId,
  isMsgAlreadyProcessed,
  isPayKeyIgnored,
  loadDedupeCache,
} from './smsDedupe.ts';
import { getSmsImportSettings, type SmsImportSettings } from './smsSettings.ts';
import type { RawSmsMessage } from './smsReader.ts';

// Lazy loader for database.ts to maintain pure unit testability in Node without React Native / Firebase mock overhead
let _getAllTransactions: ((userId: string, activeOnly?: boolean) => Promise<any[]>) | null = null;
async function fetchExistingTransactions(userId: string): Promise<any[]> {
  if (!_getAllTransactions) {
    const db = await import('./database.ts');
    _getAllTransactions = db.getAllTransactions;
  }
  return _getAllTransactions(userId, false);
}

export interface DraftTransactionItem {
  id: string; // deterministic transaction ID
  payKey: string;
  msgHash: string;
  nativeId?: string;
  amount: number;
  type: 'expense' | 'income' | 'transfer';
  merchant: string;
  category: string;
  bankName: string;
  accountLast4?: string | null;
  date: number;
  channel: 'UPI' | 'card' | 'ATM' | 'NEFT' | 'IMPS' | 'EMI' | 'bank' | 'wallet' | 'other';
  confidence: number;
  refNo?: string | null;
  rawText: string;
  selected: boolean;
  isAlreadyAdded: boolean;
  isLowConfidence: boolean;
}

export interface DetectionProgress {
  scanned: number;
  total: number;
  detected: number;
  duplicates: number;
}

/**
 * Detects financial draft transactions from raw SMS messages.
 * STRICT SAFETY: This function does NOT write or save anything to transactions.
 * It strictly creates an in-memory draft review list.
 */
export async function detectDraftTransactions(
  userId: string,
  messages: RawSmsMessage[],
  options: {
    onProgress?: (progress: DetectionProgress) => void;
    cancelToken?: { isCancelled: boolean };
    chunkSize?: number;
    settings?: SmsImportSettings;
    existingTransactions?: any[];
  } = {}
): Promise<DraftTransactionItem[]> {
  if (!userId || !messages || messages.length === 0) {
    return [];
  }

  const chunkSize = options.chunkSize || 100;
  const cancelToken = options.cancelToken;
  const onProgress = options.onProgress;

  // 1. Load user settings & dedupe cache into memory
  const settings = options.settings || (await getSmsImportSettings(userId));
  await loadDedupeCache(userId);

  // 2. Fetch all existing local transactions to check for duplicates
  const existingTxs = options.existingTransactions ?? (await fetchExistingTransactions(userId));
  const existingPayKeys = new Set<string>();
  const existingDocIds = new Set<string>();

  for (const t of existingTxs) {
    if (t?.id) existingDocIds.add(t.id);
    if (t?.payKey) existingPayKeys.add(t.payKey);
  }

  const drafts: DraftTransactionItem[] = [];
  let scannedCount = 0;
  let detectedCount = 0;
  let duplicatesCount = 0;

  for (let i = 0; i < messages.length; i++) {
    if (cancelToken?.isCancelled) {
      break;
    }

    const msg = messages[i];
    scannedCount++;

    const timestamp = msg.date || Date.now();

    // 1. Layer 1 Dedupe: Hash
    const msgHash = computeMsgHash(msg.address, msg.body, timestamp);
    const isMsgProcessed = isMsgAlreadyProcessed(userId, msgHash, msg._id);

    // 2. Parse SMS
    const parsed = parseAlert(msg.body, {
      sender: msg.address,
      timestamp,
      customCategoryRules: settings.customCategoryRules,
      customBanks: settings.customBanks || settings.allowedSenders,
    });

    // Skip OTPs, promos, non-financial messages, or missing amount
    if (parsed.isOtpOrPromo || parsed.amount === null || parsed.amount <= 0) {
      continue;
    }

    detectedCount++;

    // 3. Layer 2 Dedupe: PayKey
    const payKey = computePayKey(
      parsed.amount,
      parsed.type,
      parsed.refNo || parsed.merchantNormalized,
      parsed.accountLast4,
      timestamp
    );

    // 4. Layer 4 Dedupe: Check if user previously deleted this payment
    const candidateKeys = getCandidatePayKeys(
      parsed.amount,
      parsed.type,
      parsed.refNo || parsed.merchantNormalized,
      parsed.accountLast4,
      timestamp
    );

    if (isPayKeyIgnored(userId, candidateKeys)) {
      // Ignored by user previously -> hide completely
      duplicatesCount++;
      continue;
    }

    // 5. Layer 3 Dedupe: Deterministic ID
    const deterministicId = createDeterministicTxId(payKey, msgHash);

    // Check if already in existing transactions
    let isAlreadyInTxs = false;
    for (const cand of candidateKeys) {
      if (existingPayKeys.has(cand)) {
        isAlreadyInTxs = true;
        break;
      }
    }
    if (existingDocIds.has(deterministicId) || isMsgProcessed) {
      isAlreadyInTxs = true;
    }

    if (isAlreadyInTxs) {
      duplicatesCount++;
    }

    const isLowConfidence = parsed.confidence < 0.9;
    const merchantName =
      parsed.merchantNormalized || parsed.merchant || (parsed.type === 'income' ? 'Income' : 'Expense');

    drafts.push({
      id: deterministicId,
      payKey,
      msgHash,
      nativeId: msg._id,
      amount: parsed.amount,
      type: parsed.type,
      merchant: merchantName,
      category: parsed.category,
      bankName: parsed.sender || 'Bank Alert',
      accountLast4: parsed.accountLast4,
      date: timestamp,
      channel: parsed.channel,
      confidence: parsed.confidence,
      refNo: parsed.refNo,
      rawText: parsed.rawText,
      // High confidence items are selected by default; low confidence and duplicates are unselected
      selected: !isAlreadyInTxs && !isLowConfidence,
      isAlreadyAdded: isAlreadyInTxs,
      isLowConfidence,
    });

    // Yield to JS event loop every chunk so UI remains 60 FPS
    if (i % chunkSize === 0 || i === messages.length - 1) {
      if (onProgress) {
        onProgress({
          scanned: scannedCount,
          total: messages.length,
          detected: detectedCount,
          duplicates: duplicatesCount,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Sort descending by date (most recent first)
  drafts.sort((a, b) => b.date - a.date);

  return drafts;
}
