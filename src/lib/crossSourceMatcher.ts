import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeJsonParse } from './safeStorage.ts';
import { warn, log } from './logger.ts';

export const UNMATCHED_TRANSACTIONS_STORAGE_KEY = '@rupeo_cross_source_unmatched_v1';

// Time windows
export const NORMAL_MATCH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window for normal match
export const STRONG_MATCH_WINDOW_MS = 45 * 60 * 1000; // 45 minutes window for strong refNo match
export const UNMATCHED_INDEX_TTL_MS = 60 * 60 * 1000; // 60 minutes retention before purging

export type AlertSourceCategory = 'app_notification' | 'sms' | 'upi_app';

export interface TransactionSourceRecord {
  source: AlertSourceCategory;
  name: string; // e.g. "PhonePe", "Google Pay", "HDFC Bank", "Bank SMS"
  packageName?: string;
  sender?: string;
  timestamp: number;
  refNo?: string | null;
}

export interface MatcherEvent {
  id?: string;
  source: AlertSourceCategory;
  amount: number;
  type: 'debit' | 'credit' | 'expense' | 'income';
  timestamp: number;
  refNo?: string | null;
  accountLast4?: string | null;
  merchant?: string | null;
  packageName?: string;
  sender?: string;
  rawText?: string;
  balanceAfter?: number | null;
  category?: string;
  msgHash?: string;
}

export interface UnmatchedTransactionEntry {
  txId: string;
  source: AlertSourceCategory;
  amount: number;
  type: 'debit' | 'credit';
  timestamp: number;
  refNo?: string | null;
  accountLast4?: string | null;
  merchant?: string | null;
  rawText?: string;
  balanceAfter?: number | null;
  category?: string;
  userId?: string;
  sources: TransactionSourceRecord[];
  isMatched: boolean;
  createdAt: number;
}

export interface MatchResult {
  matched: boolean;
  action: 'enrich' | 'create';
  matchedTxId?: string;
  reason?: 'strong_ref_match' | 'normal_window_match';
  enrichedFields?: {
    ref_no?: string;
    utr?: string;
    accountLast4?: string;
    balance_after?: number;
    merchant_name?: string;
    description?: string;
    sources: TransactionSourceRecord[];
    category?: string;
  };
  event: MatcherEvent;
}

// In-memory index of unmatched transactions
let inMemoryUnmatched: UnmatchedTransactionEntry[] = [];
let isUnmatchedLoaded = false;

/**
 * Normalizes transaction type to strictly 'debit' | 'credit'.
 */
export function normalizeType(type: string): 'debit' | 'credit' {
  const lower = (type || '').toLowerCase();
  if (lower === 'income' || lower === 'credit' || lower === 'cr') {
    return 'credit';
  }
  return 'debit';
}

/**
 * Normalizes reference / UTR / RRN numbers for strong matching.
 * Cleans whitespace, drops non-alphanumeric, lowercases.
 */
export function normalizeRefNo(ref?: string | null): string {
  if (!ref) return '';
  return ref.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Normalizes merchant names for fuzzy matching.
 */
export function normalizeMerchant(merchant?: string | null): string {
  if (!merchant) return '';
  return merchant
    .toLowerCase()
    .replace(/\b(?:pvt|ltd|limited|private|india|store|shop|pay|payments|upi|vpa)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Checks if a merchant string is generic and lacks specific brand information.
 */
export function isGenericMerchant(merchant?: string | null): boolean {
  if (!merchant) return true;
  const lower = merchant.trim().toLowerCase();
  const genericTokens = [
    'expense',
    'income',
    'upi',
    'bank alert',
    'bank sms',
    'unknown',
    'debit',
    'credit',
    'payment',
    'transfer',
    'received',
    'sent',
    'others',
    'pos',
    'pos debit',
    'pos credit',
    'pos purchase',
    'pos txn',
    'pos transaction',
    'atm',
    'atm wdl',
    'atm withdrawal',
    'online',
    'e-commerce',
    'ecom',
    'purchase',
    'merchant',
    'card payment',
    'imps',
    'neft',
    'rtgs',
    'vpa',
    'na',
    'n/a',
    'nil',
  ];
  return genericTokens.includes(lower) || lower.length < 2;
}

/**
 * Fuzzy comparison between two merchant names.
 * Returns true if either side is missing or if names are meaningfully consistent.
 */
export function areMerchantsFuzzyEqual(m1?: string | null, m2?: string | null): boolean {
  // If either side is missing or generic, do not block matching
  if (isGenericMerchant(m1) || isGenericMerchant(m2)) {
    return true;
  }

  const norm1 = normalizeMerchant(m1);
  const norm2 = normalizeMerchant(m2);

  if (!norm1 || !norm2) return true;
  if (norm1 === norm2) return true;

  // Substring match (e.g. "Swiggy" vs "Swiggy Bangalore")
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return true;
  }

  // Token overlap check (e.g. "Chai Point Indiranagar" vs "Chai Point")
  const tokens1 = norm1.split(' ').filter((t) => t.length >= 3);
  const tokens2 = norm2.split(' ').filter((t) => t.length >= 3);

  for (const t of tokens1) {
    if (tokens2.includes(t)) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether two reference numbers match strongly:
 * - Exact alphanumeric match
 * - Or last 6 digits match (common across Indian bank SMS / UPI RRN truncations)
 */
export function areRefNosMatching(ref1?: string | null, ref2?: string | null): boolean {
  const clean1 = normalizeRefNo(ref1);
  const clean2 = normalizeRefNo(ref2);

  if (!clean1 || !clean2) return false;
  if (clean1 === clean2) return true;

  // Check last 6 characters if length >= 6
  if (clean1.length >= 6 && clean2.length >= 6) {
    const last6A = clean1.slice(-6);
    const last6B = clean2.slice(-6);
    if (last6A === last6B) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves human-readable source display name.
 */
export function getSourceDisplayName(event: MatcherEvent): string {
  if (event.source === 'sms') {
    return event.sender ? `${event.sender} SMS` : 'SMS';
  }
  if (event.packageName) {
    const pkg = event.packageName.toLowerCase();
    if (pkg.includes('phonepe')) return 'PhonePe';
    if (pkg.includes('paisa') || pkg.includes('nbu')) return 'Google Pay';
    if (pkg.includes('paytm')) return 'Paytm';
    if (pkg.includes('cred')) return 'CRED';
    if (pkg.includes('bhim') || pkg.includes('upiapp')) return 'BHIM';
    if (pkg.includes('hdfc')) return 'HDFC Bank';
    if (pkg.includes('icici')) return 'ICICI Bank';
    if (pkg.includes('sbi')) return 'SBI';
    if (pkg.includes('axis')) return 'Axis Bank';
    if (pkg.includes('kotak')) return 'Kotak Bank';
  }
  if (event.sender && !event.sender.includes('.')) {
    return event.sender;
  }
  return event.source === 'upi_app' ? 'UPI App' : 'Bank Alert';
}

/**
 * Formats user-facing multi-source explanation line for transaction details:
 * e.g. "Added from PhonePe notification, confirmed by SMS"
 */
export function formatSourcesDisplay(sources: TransactionSourceRecord[]): string {
  if (!sources || sources.length === 0) return '';
  if (sources.length === 1) return `Added via ${sources[0].name}`;

  const first = sources[0];
  const second = sources[1];

  const firstIsSms = first.source === 'sms';
  const secondIsSms = second.source === 'sms';

  if (!firstIsSms && secondIsSms) {
    return `Added from ${first.name} notification, confirmed by ${second.name}`;
  }
  if (firstIsSms && !secondIsSms) {
    return `Added from ${first.name}, confirmed by ${second.name} notification`;
  }

  return `Reported by ${first.name} and ${second.name}`;
}

/**
 * Determines the best merchant name when merging two events:
 * Source priority: app_notification > upi_app > sms, unless SMS has the more specific merchant name.
 */
export function pickBestMerchant(
  existingMerchant: string | null | undefined,
  existingSource: AlertSourceCategory,
  newMerchant: string | null | undefined,
  newSource: AlertSourceCategory
): string | null {
  const existingIsGeneric = isGenericMerchant(existingMerchant);
  const newIsGeneric = isGenericMerchant(newMerchant);

  // If one side has a specific merchant and other is generic, pick the specific one
  if (!existingIsGeneric && newIsGeneric) return existingMerchant || null;
  if (existingIsGeneric && !newIsGeneric) return newMerchant || null;
  if (existingIsGeneric && newIsGeneric) return existingMerchant || newMerchant || null;

  // Both have specific merchants:
  // If SMS has a longer, more descriptive merchant than a terse app notification, prefer SMS
  const existingStr = (existingMerchant || '').trim();
  const newStr = (newMerchant || '').trim();

  if (newSource === 'sms' && newStr.length > existingStr.length + 3) {
    return newStr;
  }
  if (existingSource === 'sms' && existingStr.length > newStr.length + 3) {
    return existingStr;
  }

  // Otherwise respect priority: app_notification > upi_app > sms
  const sourceScore: Record<AlertSourceCategory, number> = {
    app_notification: 3,
    upi_app: 2,
    sms: 1,
  };

  if (sourceScore[newSource] > sourceScore[existingSource]) {
    return newStr || existingStr || null;
  }

  return existingStr || newStr || null;
}

/**
 * Loads the unmatched transactions index from AsyncStorage.
 */
export async function loadUnmatchedIndex(): Promise<UnmatchedTransactionEntry[]> {
  if (isUnmatchedLoaded) return inMemoryUnmatched;
  try {
    const raw = await AsyncStorage.getItem(UNMATCHED_TRANSACTIONS_STORAGE_KEY);
    if (raw) {
      inMemoryUnmatched = safeJsonParse<UnmatchedTransactionEntry[]>(raw, [], UNMATCHED_TRANSACTIONS_STORAGE_KEY);
    }
    isUnmatchedLoaded = true;
    pruneExpiredUnmatched();
  } catch (err) {
    warn('[Matcher] Error loading unmatched index:', err);
  }
  return inMemoryUnmatched;
}

/**
 * Persists unmatched transactions index to storage.
 */
export async function saveUnmatchedIndex(): Promise<void> {
  try {
    await AsyncStorage.setItem(UNMATCHED_TRANSACTIONS_STORAGE_KEY, JSON.stringify(inMemoryUnmatched));
  } catch (err) {
    warn('[Matcher] Error saving unmatched index:', err);
  }
}

/**
 * Prunes expired unmatched entries older than TTL (60 mins).
 */
export function pruneExpiredUnmatched(now: number = Date.now()): void {
  const cutoff = now - UNMATCHED_INDEX_TTL_MS;
  inMemoryUnmatched = inMemoryUnmatched.filter((entry) => entry.createdAt >= cutoff && !entry.isMatched);
}

/**
 * Registers a newly created transaction as "unmatched" so a later event
 * from another source can pair with it.
 */
export async function registerUnmatchedTransaction(
  txId: string,
  event: MatcherEvent,
  userId?: string
): Promise<void> {
  await loadUnmatchedIndex();

  // Do not register duplicate IDs
  if (inMemoryUnmatched.some((u) => u.txId === txId)) {
    return;
  }

  const initialSource: TransactionSourceRecord = {
    source: event.source,
    name: getSourceDisplayName(event),
    packageName: event.packageName,
    sender: event.sender,
    timestamp: event.timestamp,
    refNo: event.refNo,
  };

  const newEntry: UnmatchedTransactionEntry = {
    txId,
    source: event.source,
    amount: Number(event.amount) || 0,
    type: normalizeType(event.type),
    timestamp: event.timestamp || Date.now(),
    refNo: event.refNo || null,
    accountLast4: event.accountLast4 || null,
    merchant: event.merchant || null,
    rawText: event.rawText,
    balanceAfter: event.balanceAfter,
    category: event.category,
    userId,
    sources: [initialSource],
    isMatched: false,
    createdAt: Date.now(),
  };

  inMemoryUnmatched.unshift(newEntry);
  // Cap at 150 items
  if (inMemoryUnmatched.length > 150) {
    inMemoryUnmatched = inMemoryUnmatched.slice(0, 150);
  }

  await saveUnmatchedIndex();
  log(`[Matcher] Registered unmatched transaction: ${txId} (${event.source}, amount: ${event.amount})`);
}

/**
 * Core Cross-Source Matcher.
 * Matches an incoming event against active unmatched transactions from a DIFFERENT source.
 * Strictly 1-to-1 matching.
 */
export async function matchIncomingEvent(
  event: MatcherEvent,
  existingTransactions?: any[]
): Promise<MatchResult> {
  await loadUnmatchedIndex();
  pruneExpiredUnmatched(event.timestamp);

  const eventType = normalizeType(event.type);
  const eventAmount = Number(event.amount) || 0;
  const eventTime = event.timestamp || Date.now();

  // 1. Identify Candidate Matches among active unmatched transactions
  interface Candidate {
    entry: UnmatchedTransactionEntry;
    matchType: 'strong_ref_match' | 'normal_window_match';
    timeDiff: number;
  }

  const candidates: Candidate[] = [];

  for (const entry of inMemoryUnmatched) {
    if (entry.isMatched) continue;

    // RULE 1: Must be from a DIFFERENT source! Same source repeats are handled by dedupe.
    if (entry.source === event.source) continue;

    // RULE 2: Amount & Type must match
    if (Math.abs(entry.amount - eventAmount) > 0.01) continue;
    if (entry.type !== eventType) continue;

    const timeDiff = Math.abs(entry.timestamp - eventTime);

    // Condition A: Strong Match via RefNo (UPI UTR / RRN / last-6)
    if (event.refNo && entry.refNo && areRefNosMatching(event.refNo, entry.refNo)) {
      if (timeDiff <= STRONG_MATCH_WINDOW_MS) {
        candidates.push({ entry, matchType: 'strong_ref_match', timeDiff });
        continue;
      }
    }

    // Condition B: Normal Match within 15 minutes window
    if (timeDiff <= NORMAL_MATCH_WINDOW_MS) {
      // Account Last 4 match (equal or one side missing it)
      const acctMatches =
        !event.accountLast4 ||
        !entry.accountLast4 ||
        event.accountLast4 === entry.accountLast4;

      if (!acctMatches) continue;

      // Merchant match (fuzzy-equal or one side missing it)
      const merchantMatches = areMerchantsFuzzyEqual(event.merchant, entry.merchant);
      if (!merchantMatches) continue;

      candidates.push({ entry, matchType: 'normal_window_match', timeDiff });
    }
  }

  // 2. Fallback check: If SMS arrives late (e.g. 40 minutes) with a refNo, check existing transactions for Strong Match
  if (candidates.length === 0 && event.refNo && existingTransactions && existingTransactions.length > 0) {
    for (const tx of existingTransactions) {
      if (!tx || !tx.id) continue;
      const txType = normalizeType(tx.type);
      const txAmount = Number(tx.amount) || 0;
      if (Math.abs(txAmount - eventAmount) > 0.01) continue;
      if (txType !== eventType) continue;

      const txRef = tx.ref_no || tx.utr;
      if (txRef && areRefNosMatching(event.refNo, txRef)) {
        const txTime = tx.created_at || (tx.date ? new Date(tx.date).getTime() : 0);
        const timeDiff = Math.abs(txTime - eventTime);
        if (timeDiff <= STRONG_MATCH_WINDOW_MS) {
          const fakeEntry: UnmatchedTransactionEntry = {
            txId: tx.id,
            source: (tx.source === 'sms_inbox' ? 'sms' : 'app_notification'),
            amount: txAmount,
            type: txType,
            timestamp: txTime,
            refNo: txRef,
            accountLast4: tx.accountLast4 || null,
            merchant: tx.merchant_name || null,
            userId: tx.userId,
            sources: tx.sources || [
              {
                source: tx.source === 'sms_inbox' ? 'sms' : 'app_notification',
                name: tx.merchant_name || 'Original',
                timestamp: txTime,
                refNo: txRef,
              },
            ],
            isMatched: false,
            createdAt: txTime,
          };
          candidates.push({ entry: fakeEntry, matchType: 'strong_ref_match', timeDiff });
          break;
        }
      }
    }
  }

  // 3. No Candidate Matches -> Proceed with standard creation
  if (candidates.length === 0) {
    return {
      matched: false,
      action: 'create',
      event,
    };
  }

  // 4. Strong Match Priority, then pick the CLOSEST in time among candidates
  candidates.sort((a, b) => {
    if (a.matchType === 'strong_ref_match' && b.matchType !== 'strong_ref_match') return -1;
    if (b.matchType === 'strong_ref_match' && a.matchType !== 'strong_ref_match') return 1;
    return a.timeDiff - b.timeDiff;
  });

  const winner = candidates[0];
  const targetEntry = winner.entry;

  // Mark strictly as matched (1-to-1 lock)
  targetEntry.isMatched = true;
  await saveUnmatchedIndex();

  // 5. Build Enriched Payload
  const newSourceRecord: TransactionSourceRecord = {
    source: event.source,
    name: getSourceDisplayName(event),
    packageName: event.packageName,
    sender: event.sender,
    timestamp: event.timestamp,
    refNo: event.refNo,
  };

  const updatedSources: TransactionSourceRecord[] = [
    ...(targetEntry.sources || []),
    newSourceRecord,
  ];

  // Pick best merchant
  const bestMerchant = pickBestMerchant(
    targetEntry.merchant,
    targetEntry.source,
    event.merchant,
    event.source
  );

  const enrichedFields: MatchResult['enrichedFields'] = {
    sources: updatedSources,
  };

  // Fill missing ref_no
  if (!targetEntry.refNo && event.refNo) {
    enrichedFields.ref_no = event.refNo;
    enrichedFields.utr = event.refNo;
  }

  // Fill missing accountLast4
  if (!targetEntry.accountLast4 && event.accountLast4) {
    enrichedFields.accountLast4 = event.accountLast4;
  }

  // Fill missing balanceAfter
  if (targetEntry.balanceAfter === undefined && event.balanceAfter !== undefined && event.balanceAfter !== null) {
    enrichedFields.balance_after = event.balanceAfter;
  }

  // Fill better merchant name if improved
  if (bestMerchant && bestMerchant !== targetEntry.merchant) {
    enrichedFields.merchant_name = bestMerchant;
  }

  // Fill category if original was Uncategorized/Others and new event has specific
  if (
    (!targetEntry.category || targetEntry.category === 'Others' || targetEntry.category === 'Uncategorized') &&
    event.category &&
    event.category !== 'Others' &&
    event.category !== 'Uncategorized'
  ) {
    enrichedFields.category = event.category;
  }

  log(`[Matcher] Successfully matched event with existing transaction ${targetEntry.txId} (type: ${winner.matchType}, timeDiff: ${winner.timeDiff}ms)`);

  return {
    matched: true,
    action: 'enrich',
    matchedTxId: targetEntry.txId,
    reason: winner.matchType,
    enrichedFields,
    event,
  };
}

/**
 * Resets the in-memory cache to simulate a cold app restart.
 */
export function resetInMemoryMatcherState(): void {
  inMemoryUnmatched = [];
  isUnmatchedLoaded = false;
}

/**
 * Resets the unmatched transactions store (for testing or user reset).
 */
export async function resetUnmatchedStore(): Promise<void> {
  resetInMemoryMatcherState();
  await AsyncStorage.removeItem(UNMATCHED_TRANSACTIONS_STORAGE_KEY);
}
