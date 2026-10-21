import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParsedAlert } from './alertParser.ts';
import { insertTransaction, normalizeDate } from './database.ts';
import { createDeterministicTxId, markMsgsProcessedBatch } from './smsDedupe.ts';
import { getSmsImportSettings, formatTransactionNote } from './smsSettings.ts';
import { warn } from './logger.ts';

export interface PendingAlertItem {
  id: string;                       // e.g. "pending_" + payKey
  payKey: string;
  msgHash: string;
  alert: ParsedAlert;
  createdAt: number;
  batchId?: string;
}

const getInboxKey = (userId: string) => `@rupeo_sms_pending_inbox_${userId}`;

let cachedInbox = new Map<string, PendingAlertItem[]>();

/**
 * Gets all pending alert items for user.
 */
export async function getPendingAlerts(userId: string): Promise<PendingAlertItem[]> {
  if (!userId) return [];

  if (cachedInbox.has(userId)) {
    return cachedInbox.get(userId)!;
  }

  try {
    const raw = await AsyncStorage.getItem(getInboxKey(userId));
    if (raw) {
      const list: PendingAlertItem[] = JSON.parse(raw);
      cachedInbox.set(userId, list);
      return list;
    }
  } catch (err) {
    warn('Error loading pending inbox:', err);
  }

  cachedInbox.set(userId, []);
  return [];
}

/**
 * Adds an alert to the pending inbox if not already present.
 */
export async function addPendingAlert(userId: string, item: PendingAlertItem): Promise<boolean> {
  if (!userId || !item) return false;

  const current = await getPendingAlerts(userId);
  const exists = current.some((p) => p.payKey === item.payKey || p.msgHash === item.msgHash);

  if (exists) {
    return false;
  }

  const updated = [item, ...current];
  cachedInbox.set(userId, updated);

  try {
    await AsyncStorage.setItem(getInboxKey(userId), JSON.stringify(updated));
  } catch (err) {
    warn('Failed to save pending inbox item:', err);
  }

  return true;
}

/**
 * Confirms and converts a pending alert into a real Rupeo transaction via the existing insertTransaction path.
 */
export async function confirmPendingAlert(
  userId: string,
  pendingId: string,
  overrides?: {
    amount?: number;
    category?: string;
    merchant_name?: string;
    type?: 'expense' | 'income' | 'transfer';
    payment_mode?: string;
    date?: string;
  }
): Promise<string | null> {
  if (!userId || !pendingId) return null;

  const current = await getPendingAlerts(userId);
  const target = current.find((p) => p.id === pendingId);
  if (!target) return null;

  const settings = await getSmsImportSettings(userId);
  const deterministicId = createDeterministicTxId(target.payKey, target.msgHash);

  const finalAmount = overrides?.amount ?? target.alert.amount ?? 0;
  const finalType = overrides?.type ?? target.alert.type ?? 'expense';
  const finalCategory = overrides?.category ?? target.alert.category ?? 'Others';
  const finalMerchant = overrides?.merchant_name ?? target.alert.merchantNormalized ?? target.alert.merchant ?? null;

  // Format note if user enabled note saving
  const formattedNote = formatTransactionNote(target.alert.sender, target.alert.rawText, settings);

  // Map to Rupeo Transaction Payload
  const dateStr = overrides?.date
    ? normalizeDate(overrides.date)
    : normalizeDate(new Date(target.alert.timestamp || Date.now()));

  const txPayload = {
    id: deterministicId,
    amount: finalAmount,
    type: finalType === 'income' ? 'credit' : 'debit',
    category: finalCategory,
    merchant_name: finalMerchant,
    description: formattedNote,
    payment_mode: overrides?.payment_mode || (target.alert.channel === 'card' ? 'Card' : target.alert.channel === 'ATM' ? 'Cash' : 'UPI'),
    ref_no: target.alert.refNo,
    utr: target.alert.refNo,
    date: dateStr,
    source: 'sms_inbox',
    sourceHash: target.msgHash,
    payKey: target.payKey,
    batchId: target.batchId || null,
    importedAt: Date.now(),
  };

  // 1. Call existing insertTransaction
  const createdId = await insertTransaction(userId, txPayload);

  // 2. Remove from pending inbox
  const remaining = current.filter((p) => p.id !== pendingId);
  cachedInbox.set(userId, remaining);
  await AsyncStorage.setItem(getInboxKey(userId), JSON.stringify(remaining));

  // 3. Mark msgHash as processed in dedupe store
  await markMsgsProcessedBatch(userId, [{ msgHash: target.msgHash }]);

  return createdId || deterministicId;
}

/**
 * Dismisses a pending alert without adding it.
 */
export async function dismissPendingAlert(userId: string, pendingId: string): Promise<void> {
  if (!userId || !pendingId) return;

  const current = await getPendingAlerts(userId);
  const target = current.find((p) => p.id === pendingId);
  const remaining = current.filter((p) => p.id !== pendingId);
  cachedInbox.set(userId, remaining);

  await AsyncStorage.setItem(getInboxKey(userId), JSON.stringify(remaining));

  // Mark processed so it doesn't get scanned again
  if (target?.msgHash) {
    await markMsgsProcessedBatch(userId, [{ msgHash: target.msgHash }]);
  }
}

/**
 * Clears all pending alerts for user.
 */
export async function clearPendingInbox(userId: string): Promise<void> {
  if (!userId) return;
  cachedInbox.set(userId, []);
  try {
    await AsyncStorage.removeItem(getInboxKey(userId));
  } catch (err) {
    warn('Failed to clear pending inbox:', err);
  }
}
