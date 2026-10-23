import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from './cryptoUtils.ts';
import { type ParsedAlert, normalizeWhitespace } from './alertParser.ts';
import { warn } from './logger.ts';
import { safeJsonParse } from './safeStorage.ts';

// ---------------------------------------------------------------------------
// Storage Keys
// ---------------------------------------------------------------------------

const getProcessedHashesKey = (userId: string) => `@rupeo_sms_processed_hashes_${userId}`;
const getProcessedIdsKey = (userId: string) => `@rupeo_sms_processed_ids_${userId}`;
const getIgnoredPayKeysKey = (userId: string) => `@rupeo_sms_ignored_paykeys_${userId}`;
const getCursorKey = (userId: string, source: string = 'inbox') => `@rupeo_sms_cursor_${userId}_${source}`;

// In-memory cache sets to eliminate disk read latency during chunked parsing
const inMemoryProcessedHashes = new Map<string, Set<string>>();
const inMemoryProcessedIds = new Map<string, Set<string>>();
const inMemoryIgnoredPayKeys = new Map<string, Set<string>>();

// ---------------------------------------------------------------------------
// Layer 1 - Message Fingerprint
// ---------------------------------------------------------------------------

/**
 * Normalizes text for fingerprinting:
 * trim, collapse whitespace, lowercase, strip zero-width characters.
 */
export function normalizeForHash(text: string): string {
  if (!text) return '';
  return normalizeWhitespace(text).toLowerCase();
}

/**
 * Computes Layer 1 message fingerprint:
 * msgHash = sha256(normalize(sender) + '|' + normalize(body) + '|' + floor(timestamp / 1000))
 */
export function computeMsgHash(sender: string, body: string, timestamp: number): string {
  const normSender = normalizeForHash(sender);
  const normBody = normalizeForHash(body);
  const secTimestamp = Math.floor((timestamp || Date.now()) / 1000);
  const rawString = `${normSender}|${normBody}|${secTimestamp}`;
  return sha256(rawString);
}

// ---------------------------------------------------------------------------
// Layer 2 - Payment Key
// ---------------------------------------------------------------------------

const TWO_MINUTES_MS = 2 * 60 * 1000;

/**
 * Computes time bucket index for ±2 min window.
 */
export function computeTimeBucket(timestamp: number): number {
  return Math.floor((timestamp || Date.now()) / TWO_MINUTES_MS);
}

/**
 * Computes Layer 2 payment key:
 * payKey = sha256(amount + '|' + type + '|' + (refNo || merchantNormalized) + '|' + accountLast4 + '|' + timeBucket(±2 min))
 */
export function computePayKey(
  amount: number | null,
  type: string,
  refNoOrMerchant: string | null,
  accountLast4: string | null,
  timestamp: number,
  bucketOffset: number = 0
): string {
  const amtStr = (amount !== null ? amount.toFixed(2) : '0.00');
  const typeStr = (type || 'expense').toLowerCase();
  const identStr = normalizeForHash(refNoOrMerchant || 'unknown');
  const acctStr = accountLast4 ? accountLast4.trim() : '';
  const bucket = computeTimeBucket(timestamp) + bucketOffset;

  const raw = `${amtStr}|${typeStr}|${identStr}|${acctStr}|${bucket}`;
  return sha256(raw);
}

/**
 * Generates all candidate payKeys for the payment (center bucket, previous bucket, next bucket)
 * to guarantee robust ±2 min matching across bucket boundary edges.
 */
export function getCandidatePayKeys(
  amount: number | null,
  type: string,
  refNoOrMerchant: string | null,
  accountLast4: string | null,
  timestamp: number
): string[] {
  const keys = new Set<string>();
  const offsets = [0, -1, 1];

  for (const offset of offsets) {
    keys.add(computePayKey(amount, type, refNoOrMerchant, accountLast4, timestamp, offset));
    if (accountLast4) {
      keys.add(computePayKey(amount, type, refNoOrMerchant, null, timestamp, offset));
    }
  }

  return Array.from(keys);
}

// ---------------------------------------------------------------------------
// Layer 3 - Deterministic Transaction ID
// ---------------------------------------------------------------------------

/**
 * Layer 3 - Deterministic transaction ID:
 * transactionId = 'sms_' + payKey (or msgHash when there is no ref/payKey)
 */
export function createDeterministicTxId(payKey: string | null, msgHash?: string): string {
  const key = payKey || msgHash || sha256(String(Date.now()));
  return `sms_${key}`;
}

// ---------------------------------------------------------------------------
// Layer 1 & 4 Persistent Storage Management
// ---------------------------------------------------------------------------

/**
 * Load processed hashes and ignored keys into memory cache.
 */
export async function loadDedupeCache(userId: string): Promise<void> {
  if (!userId) return;

  try {
    if (!inMemoryProcessedHashes.has(userId)) {
      const key = getProcessedHashesKey(userId);
      const storedHashes = await AsyncStorage.getItem(key);
      const parsedHashes: string[] = safeJsonParse(storedHashes, [], { keyForBackup: key });
      inMemoryProcessedHashes.set(userId, new Set(parsedHashes));
    }

    if (!inMemoryProcessedIds.has(userId)) {
      const key = getProcessedIdsKey(userId);
      const storedIds = await AsyncStorage.getItem(key);
      const parsedIds: string[] = safeJsonParse(storedIds, [], { keyForBackup: key });
      inMemoryProcessedIds.set(userId, new Set(parsedIds));
    }

    if (!inMemoryIgnoredPayKeys.has(userId)) {
      const key = getIgnoredPayKeysKey(userId);
      const storedIgnored = await AsyncStorage.getItem(key);
      const parsedIgnored: string[] = safeJsonParse(storedIgnored, [], { keyForBackup: key });
      inMemoryIgnoredPayKeys.set(userId, new Set(parsedIgnored));
    }
  } catch (err) {
    warn('Error loading dedupe cache from AsyncStorage:', err);
  }
}

/**
 * Checks if a message fingerprint (msgHash or native SMS _id) has already been processed.
 */
export function isMsgAlreadyProcessed(userId: string, msgHash: string, nativeId?: string): boolean {
  if (!userId) return false;

  const hashSet = inMemoryProcessedHashes.get(userId);
  if (hashSet && hashSet.has(msgHash)) {
    return true;
  }

  if (nativeId) {
    const idSet = inMemoryProcessedIds.get(userId);
    if (idSet && idSet.has(String(nativeId))) {
      return true;
    }
  }

  return false;
}

/**
 * Marks messages as processed in memory and persists to AsyncStorage.
 */
export async function markMsgsProcessedBatch(
  userId: string,
  items: Array<{ msgHash: string; nativeId?: string }>
): Promise<void> {
  if (!userId || items.length === 0) return;

  await loadDedupeCache(userId);

  const hashSet = inMemoryProcessedHashes.get(userId) || new Set<string>();
  const idSet = inMemoryProcessedIds.get(userId) || new Set<string>();

  for (const item of items) {
    if (item.msgHash) hashSet.add(item.msgHash);
    if (item.nativeId) idSet.add(String(item.nativeId));
  }

  inMemoryProcessedHashes.set(userId, hashSet);
  inMemoryProcessedIds.set(userId, idSet);

  try {
    await AsyncStorage.setItem(getProcessedHashesKey(userId), JSON.stringify(Array.from(hashSet)));
    await AsyncStorage.setItem(getProcessedIdsKey(userId), JSON.stringify(Array.from(idSet)));
  } catch (err) {
    warn('Failed to persist processed SMS hashes:', err);
  }
}

// ---------------------------------------------------------------------------
// Layer 4 - User Deleted / Ignored Keys
// ---------------------------------------------------------------------------

/**
 * Checks if a payKey was deleted by user and is in the ignored set.
 */
export function isPayKeyIgnored(userId: string, candidateKeys: string[] | string): boolean {
  if (!userId) return false;
  const ignoredSet = inMemoryIgnoredPayKeys.get(userId);
  if (!ignoredSet || ignoredSet.size === 0) return false;

  const keys = Array.isArray(candidateKeys) ? candidateKeys : [candidateKeys];
  for (const k of keys) {
    if (ignoredSet.has(k)) {
      return true;
    }
  }
  return false;
}

/**
 * Records a deleted transaction's payKey in the ignored set so it is never re-imported.
 */
export async function recordIgnoredPayKey(userId: string, payKey: string): Promise<void> {
  if (!userId || !payKey) return;

  await loadDedupeCache(userId);
  const ignoredSet = inMemoryIgnoredPayKeys.get(userId) || new Set<string>();
  ignoredSet.add(payKey);
  inMemoryIgnoredPayKeys.set(userId, ignoredSet);

  try {
    await AsyncStorage.setItem(getIgnoredPayKeysKey(userId), JSON.stringify(Array.from(ignoredSet)));
  } catch (err) {
    warn('Failed to persist ignored payKey:', err);
  }
}

/**
 * Resets import history: clears all processed hashes, cursors, and ignored sets.
 */
export async function resetImportHistory(userId: string): Promise<void> {
  if (!userId) return;

  inMemoryProcessedHashes.delete(userId);
  inMemoryProcessedIds.delete(userId);
  inMemoryIgnoredPayKeys.delete(userId);

  try {
    await AsyncStorage.multiRemove([
      getProcessedHashesKey(userId),
      getProcessedIdsKey(userId),
      getIgnoredPayKeysKey(userId),
      getCursorKey(userId, 'inbox'),
    ]);
  } catch (err) {
    warn('Failed to reset import history:', err);
  }
}

// ---------------------------------------------------------------------------
// Per-Source Resumable Import Cursor
// ---------------------------------------------------------------------------

export async function getImportCursor(userId: string, source: string = 'inbox'): Promise<number> {
  if (!userId) return 0;
  try {
    const val = await AsyncStorage.getItem(getCursorKey(userId, source));
    return val ? parseInt(val, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function setImportCursor(userId: string, timestamp: number, source: string = 'inbox'): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(getCursorKey(userId, source), timestamp.toString());
  } catch (err) {
    warn('Failed to save import cursor:', err);
  }
}

// ---------------------------------------------------------------------------
// Payment Merging: Collapse Multiple Alerts into Richest Record
// ---------------------------------------------------------------------------

export interface EnrichedAlertItem {
  alert: ParsedAlert;
  msgHash: string;
  payKey: string;
  nativeId?: string;
}

/**
 * Merges two parsed alert items for the same payment, preserving the richest fields.
 */
export function mergeTwoAlerts(primary: ParsedAlert, incoming: ParsedAlert): ParsedAlert {
  const chooseLonger = (a: string | null, b: string | null) => {
    if (!a) return b;
    if (!b) return a;
    return a.length >= b.length ? a : b;
  };

  const merchant = chooseLonger(primary.merchant, incoming.merchant);
  const merchantNormalized = chooseLonger(primary.merchantNormalized, incoming.merchantNormalized);
  const refNo = primary.refNo || incoming.refNo;
  const accountLast4 = primary.accountLast4 || incoming.accountLast4;
  const channel = (primary.channel !== 'other' && primary.channel) ? primary.channel : incoming.channel;
  const balance = primary.balance !== null ? primary.balance : incoming.balance;
  const confidence = Math.max(primary.confidence, incoming.confidence);
  const category = (primary.category && primary.category !== 'Others') ? primary.category : incoming.category;

  return {
    ...primary,
    merchant,
    merchantNormalized,
    refNo,
    accountLast4,
    channel,
    balance,
    confidence,
    category,
    rawText: primary.rawText || incoming.rawText,
    sender: primary.sender || incoming.sender,
  };
}

/**
 * Tests whether two alerts represent the exact same real-world payment event.
 */
function isSamePaymentAlert(a: ParsedAlert, b: ParsedAlert, keyA: string, keyB: string): boolean {
  if (keyA === keyB) return true;

  if (
    a.amount !== null &&
    b.amount !== null &&
    a.amount === b.amount &&
    a.type === b.type &&
    Math.abs((a.timestamp || 0) - (b.timestamp || 0)) <= TWO_MINUTES_MS
  ) {
    // If both have a refNo, exact match collapses them, different ref keeps them separate
    if (a.refNo && b.refNo) {
      return a.refNo.trim().toLowerCase() === b.refNo.trim().toLowerCase();
    }

    // If one or both have normalized merchant/ref
    const identA = normalizeForHash(a.refNo || a.merchantNormalized || '');
    const identB = normalizeForHash(b.refNo || b.merchantNormalized || '');

    if (identA && identB && identA === identB) {
      if (!a.accountLast4 || !b.accountLast4 || a.accountLast4 === b.accountLast4) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Collapses multiple incoming alerts (e.g. Bank SMS + GPay notification + UPI SMS)
 * into a single unified record per payment event.
 */
export function collapseDuplicatePaymentAlerts(items: EnrichedAlertItem[]): EnrichedAlertItem[] {
  const result: EnrichedAlertItem[] = [];

  for (const item of items) {
    let matchedIndex = -1;

    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      if (isSamePaymentAlert(existing.alert, item.alert, existing.payKey, item.payKey)) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex >= 0) {
      const existing = result[matchedIndex];
      const mergedAlert = mergeTwoAlerts(existing.alert, item.alert);
      // Retain richest payKey (prefer the one with accountLast4)
      const payKey = (existing.alert.accountLast4 ? existing.payKey : item.payKey) || existing.payKey;
      result[matchedIndex] = {
        ...existing,
        payKey,
        alert: mergedAlert,
      };
    } else {
      result.push(item);
    }
  }

  return result;
}
