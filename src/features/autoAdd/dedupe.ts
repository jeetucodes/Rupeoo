/**
 * Deduplication Engine for Rupeo Auto-Add Notifications
 *
 * Implements two robust layers of deduplication:
 * Layer 1: hash(package + text + exact postTime) so distinct notification events with the same text
 *          are never merged unless they are the exact same notification event (identical postTime/key).
 * Layer 2: Cross-channel matching (SMS app vs GPay/PhonePe/Bank app) only when:
 *          - Different packages (same package never cross-dedupes)
 *          - Amount and type equal
 *          - (UPI Ref equal OR (no ref on one side AND within 2 minutes)).
 *          - Primary key = UPI Ref: different UPI refs are ALWAYS different transactions, NEVER deduped.
 *          - TTL = 10 minutes for cross-source matching so cache never grows indefinitely.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from '../../lib/cryptoUtils.ts';
import { normalizeWhitespace } from '../../lib/alertParser.ts';
import { warn } from '../../lib/logger.ts';

const NOTIF_HASHES_KEY = '@rupeo_notif_processed_hashes';
const RECENT_PAYMENTS_KEY = '@rupeo_notif_recent_payments';

export const CROSS_CHANNEL_TTL_MS = 10 * 60 * 1000; // 10-minute TTL for cross-channel matching
export const NO_REF_MATCH_WINDOW_MS = 2 * 60 * 1000; // 2-minute window when one side lacks a ref
const MAX_STORED_HASHES = 500;
const MAX_RECENT_PAYMENTS = 200;

// In-memory sets to guarantee instantaneous lookups during Headless JS execution
const memoryNotifHashes = new Set<string>();

export interface RecentPaymentEntry {
  payKey: string;
  amount: number;
  type: string; // 'expense' | 'income'
  timestamp: number;
  packageName: string;
  txId?: string;
  refNo?: string | null;
  accountLast4?: string | null;
}

let memoryRecentPayments: RecentPaymentEntry[] = [];
let isCacheLoaded = false;

/**
 * Layer 1: Computes hash(package + text + exact postTime).
 * Exact postTime (in ms) ensures two real notifications with the same text
 * (e.g. repeated payments to the same friend) are NOT merged unless they are
 * the identical notification event.
 */
export function computeNotifHash(
  packageName: string,
  text: string,
  postTime: number,
  sbnKey?: string
): string {
  const normPkg = (packageName || '').trim().toLowerCase();
  const normText = normalizeWhitespace(text || '').toLowerCase();
  const keyPart = sbnKey ? sbnKey.trim() : '';
  const raw = `${normPkg}|${normText}|${postTime || 0}|${keyPart}`;
  return sha256(raw);
}

/**
 * Prunes expired recent payments (older than TTL) from memory.
 */
function pruneRecentPayments(now: number = Date.now()): void {
  const cutoff = now - CROSS_CHANNEL_TTL_MS;
  memoryRecentPayments = memoryRecentPayments.filter((p) => p.timestamp >= cutoff);
}

/**
 * Loads deduplication cache from storage into memory.
 */
export async function loadNotifDedupeCache(): Promise<void> {
  if (isCacheLoaded) return;
  try {
    const rawHashes = await AsyncStorage.getItem(NOTIF_HASHES_KEY);
    if (rawHashes) {
      const parsed: string[] = JSON.parse(rawHashes);
      for (const h of parsed) memoryNotifHashes.add(h);
    }

    const rawPayments = await AsyncStorage.getItem(RECENT_PAYMENTS_KEY);
    if (rawPayments) {
      memoryRecentPayments = JSON.parse(rawPayments);
      pruneRecentPayments();
    }

    isCacheLoaded = true;
  } catch (err) {
    warn('Error loading notif dedupe cache:', err);
  }
}

/**
 * Layer 1 Check: Checks if the exact notification event was already processed.
 */
export async function isNotifAlreadyProcessed(notifHash: string): Promise<boolean> {
  await loadNotifDedupeCache();
  return memoryNotifHashes.has(notifHash);
}

/**
 * Layer 1 Record: Marks the notification hash as processed and persists to storage.
 */
export async function markNotifProcessed(notifHash: string): Promise<void> {
  await loadNotifDedupeCache();
  memoryNotifHashes.add(notifHash);

  // Prune set size
  if (memoryNotifHashes.size > MAX_STORED_HASHES) {
    const arr = Array.from(memoryNotifHashes);
    arr.splice(0, arr.length - MAX_STORED_HASHES);
    memoryNotifHashes.clear();
    for (const h of arr) memoryNotifHashes.add(h);
  }

  try {
    await AsyncStorage.setItem(NOTIF_HASHES_KEY, JSON.stringify(Array.from(memoryNotifHashes)));
  } catch (err) {
    warn('Failed to persist notif hashes:', err);
  }
}

/**
 * Layer 2: Checks if an identical payment event (amount + type) occurred across different sources
 * (e.g. Bank app pushed first, and SMS arrived seconds or minutes later).
 *
 * RULES:
 * 1. Same package never cross-dedupes (only different packages cross-dedupe).
 * 2. Amount and type must match.
 * 3. Primary key = UPI Ref:
 *    - If both have UPI refs: must match exactly. If different -> NEVER duplicate!
 *    - If one side has no ref: duplicate only if within 2 minutes.
 * 4. TTL: Only matches events within 10 minutes (older events cannot cross-dedupe).
 */
export async function checkCrossChannelDuplicate(
  amount: number,
  type: string,
  timestamp: number,
  packageName: string,
  refNo?: string | null,
  accountLast4?: string | null
): Promise<{ isDuplicate: boolean; existingTxId?: string }> {
  await loadNotifDedupeCache();

  const now = timestamp || Date.now();
  pruneRecentPayments(now);

  const normType = (type || 'expense').toLowerCase();
  const incomingPkg = (packageName || '').trim().toLowerCase();
  const cleanRef = (refNo || '').trim().toLowerCase();

  for (const entry of memoryRecentPayments) {
    const entryPkg = (entry.packageName || '').trim().toLowerCase();

    // RULE 1: Same package NEVER cross-dedupes (e.g. 2 SMS or 2 GPay notifications)
    if (entryPkg === incomingPkg) {
      continue;
    }

    // RULE 2: Amount & Type must match
    if (Math.abs(entry.amount - amount) > 0.01 || entry.type !== normType) {
      continue;
    }

    const timeDiff = Math.abs(entry.timestamp - now);

    // Expired beyond TTL -> cannot match
    if (timeDiff > CROSS_CHANNEL_TTL_MS) {
      continue;
    }

    const entryRef = (entry.refNo || '').trim().toLowerCase();

    // RULE 3: Primary key = UPI Ref number
    if (cleanRef && entryRef) {
      // Both have UPI refs:
      if (cleanRef === entryRef) {
        return {
          isDuplicate: true,
          existingTxId: entry.txId,
        };
      }
      // Different UPI refs = ALWAYS different transactions, NEVER deduped!
      continue;
    }

    // RULE 4: No ref on one side -> cross-dedupe ONLY if within 2 minutes
    if (timeDiff <= NO_REF_MATCH_WINDOW_MS) {
      return {
        isDuplicate: true,
        existingTxId: entry.txId,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Layer 2 Record: Records a processed transaction for cross-channel deduplication.
 */
export async function recordRecentPayment(
  amount: number,
  type: string,
  timestamp: number,
  packageName: string,
  txId?: string,
  refNo?: string | null,
  accountLast4?: string | null
): Promise<void> {
  await loadNotifDedupeCache();

  const now = timestamp || Date.now();
  pruneRecentPayments(now);

  const normType = (type || 'expense').toLowerCase();
  const payKey = `${amount.toFixed(2)}_${normType}_${now}`;

  memoryRecentPayments.unshift({
    payKey,
    amount,
    type: normType,
    timestamp: now,
    packageName,
    txId,
    refNo: refNo ? refNo.trim() : null,
    accountLast4: accountLast4 ? accountLast4.trim() : null,
  });

  if (memoryRecentPayments.length > MAX_RECENT_PAYMENTS) {
    memoryRecentPayments.pop();
  }

  try {
    await AsyncStorage.setItem(RECENT_PAYMENTS_KEY, JSON.stringify(memoryRecentPayments));
  } catch (err) {
    warn('Failed to persist recent payments for dedupe:', err);
  }
}

/**
 * Clears deduplication history for fresh testing or user reset.
 */
export async function resetAutoAddDedupeHistory(): Promise<void> {
  memoryNotifHashes.clear();
  memoryRecentPayments = [];
  isCacheLoaded = true;

  try {
    await AsyncStorage.multiRemove([NOTIF_HASHES_KEY, RECENT_PAYMENTS_KEY]);
  } catch (err) {
    warn('Failed to reset auto-add dedupe history:', err);
  }
}
