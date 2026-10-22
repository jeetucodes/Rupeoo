/**
 * Deduplication Engine for Rupeo Auto-Add Notifications
 *
 * Implements two layers of deduplication:
 * Layer 1: hash(package + text + postTime rounded to minute)
 * Layer 2: Cross-channel matching (SMS app + UPI app duplicate detection matching amount + type within 2 minutes).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from '../../lib/cryptoUtils.ts';
import { normalizeWhitespace } from '../../lib/alertParser.ts';
import { warn } from '../../lib/logger.ts';

const NOTIF_HASHES_KEY = '@rupeo_notif_processed_hashes';
const RECENT_PAYMENTS_KEY = '@rupeo_notif_recent_payments';
const DEDUPE_WINDOW_MS = 6 * 60 * 1000; // 6-minute window for cross-channel notifications (e.g. Bank App first, SMS later)
const MAX_STORED_HASHES = 500;
const MAX_RECENT_PAYMENTS = 200;

// In-memory sets to guarantee instantaneous lookups during Headless JS execution
const memoryNotifHashes = new Set<string>();
interface RecentPaymentEntry {
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
 * Rounds a timestamp to the nearest minute (epoch in ms).
 */
export function roundToMinute(timestamp: number): number {
  return Math.floor((timestamp || Date.now()) / 60000) * 60000;
}

/**
 * Layer 1: Computes hash(package + text + postTime rounded to minute).
 */
export function computeNotifHash(packageName: string, text: string, postTime: number): string {
  const normPkg = (packageName || '').trim().toLowerCase();
  const normText = normalizeWhitespace(text || '').toLowerCase();
  const minute = roundToMinute(postTime);
  const raw = `${normPkg}|${normText}|${minute}`;
  return sha256(raw);
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
      // Evict entries older than 24 hours
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      memoryRecentPayments = memoryRecentPayments.filter((p) => p.timestamp >= cutoff);
    }

    isCacheLoaded = true;
  } catch (err) {
    warn('Error loading notif dedupe cache:', err);
  }
}

/**
 * Layer 1 Check: Checks if the exact notification was already processed.
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
  const normType = (type || 'expense').toLowerCase();
  const cleanRef = (refNo || '').trim().toLowerCase();
  const cleanAcct = (accountLast4 || '').trim();

  for (const entry of memoryRecentPayments) {
    // 1. Direct Reference Number match (highest confidence, valid across 24h)
    if (cleanRef && cleanRef.length >= 4 && entry.refNo && entry.refNo.toLowerCase() === cleanRef) {
      return {
        isDuplicate: true,
        existingTxId: entry.txId,
      };
    }

    // 2. Match amount (exact) and type ('expense' vs 'income')
    if (Math.abs(entry.amount - amount) < 0.01 && entry.type === normType) {
      const timeDiff = Math.abs(entry.timestamp - now);

      // If same bank account number and within 15 minutes
      if (cleanAcct && entry.accountLast4 && entry.accountLast4 === cleanAcct && timeDiff <= 15 * 60 * 1000) {
        return {
          isDuplicate: true,
          existingTxId: entry.txId,
        };
      }

      // Check if within 6-minute cross-channel time window (e.g., Bank app + SMS)
      if (timeDiff <= DEDUPE_WINDOW_MS) {
        return {
          isDuplicate: true,
          existingTxId: entry.txId,
        };
      }
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
  const normType = (type || 'expense').toLowerCase();
  const payKey = `${amount.toFixed(2)}_${normType}_${Math.floor(now / DEDUPE_WINDOW_MS)}`;

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
