import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  addDoc,
  Timestamp,
  onSnapshot,
  arrayUnion,
  increment,
  limit,
} from 'firebase/firestore';
import { formatTime12Hour, getLocalDateString, getLocalMonthString } from './dateUtils';
import {
  getOfflineTransactions,
  getCachedOfflineTransactionsSync,
  saveOfflineTransactions,
  getOfflineCategories,
  saveOfflineCategories,
  enqueueSyncAction,
  flushSyncQueue,
  syncRemoteTransactions,
  checkIsOnline,
} from './offlineSync';
import { toRemote, fromRemote, normalizePaymentMode, formatPaymentModeDisplay } from './dataMinimization';
import { isCloudSyncEnabled, pullFromCloud, uploadLocalDataToCloud } from './cloudSync';
import { syncWidgetWithTransactions } from './widgetSync';
import { flushUdharSyncQueue } from './udharStorage';
import { formatCurrency } from './formatCurrency';
import { recordIgnoredPayKey } from './smsDedupe';
import { safeJsonParse } from './safeStorage';
import { triggerDebouncedSync } from './syncEngine';
import {
  saveRecurringBillToSQLite,
  syncRecurringBillsToSQLite,
  getRecurringBillsFromSQLite,
  deleteRecurringBillFromSQLite,
  markBillPaidInSQLite,
  undoBillPaymentInSQLite,
} from '@/features/autoAdd/sqliteStorage';
import { warn, error } from '@/lib/logger';

export {
  getOfflineTransactions,
  saveOfflineTransactions,
  getOfflineCategories,
  saveOfflineCategories,
  flushSyncQueue,
  checkIsOnline,
};

export interface CategoryItem {
  id?: string;
  name: string;
  icon: string;
  color: string;
  isCustom?: boolean;
  type?: 'debit' | 'credit' | 'all';
}

export interface Transaction {
  id?: string;
  date: string;
  time?: string;
  amount: number;
  type: 'debit' | 'credit' | string;
  merchant_name?: string | null;
  category: string;
  description?: string | null;
  utr?: string | null;
  ref_no?: string | null;
  payment_mode?: string;
  receipt_image?: string | null;
  receiptImage?: string | null;
  balance_after?: number | null;
  source?: string;
  source_statement_id?: number | null;
  is_manually_edited?: number | boolean;
  created_at?: number | string;
  billId?: string | null;
  [key: string]: unknown;
}

export const KNOWN_INCOME_CATEGORY_NAMES = new Set([
  'salary', 'job', 'business', 'freelance', 'investments', 'investment',
  'income', 'savings', 'bonus', 'dividend', 'dividends', 'cashback', 'rental', 'stipend'
]);

export const defaultCategories: CategoryItem[] = [
  { name: 'Food', icon: 'fast-food', color: '#FF6B6B', type: 'debit' },
  { name: 'Transport', icon: 'car', color: '#0284C7', type: 'debit' },
  { name: 'Shopping', icon: 'bag', color: '#9D4EDD', type: 'debit' },
  { name: 'Bills', icon: 'receipt', color: '#FF9F1C', type: 'debit' },
  { name: 'Health', icon: 'heart', color: '#E11D48', type: 'debit' },
  { name: 'Education', icon: 'school', color: '#6366F1', type: 'debit' },
  { name: 'Groceries', icon: 'cart', color: '#10B981', type: 'debit' },
  { name: 'Dining', icon: 'restaurant', color: '#EF4444', type: 'debit' },
  { name: 'Coffee', icon: 'cafe', color: '#7C3AED', type: 'debit' },
  { name: 'Travel', icon: 'airplane', color: '#4D96FF', type: 'debit' },
  { name: 'Fuel', icon: 'water', color: '#F59E0B', type: 'debit' },
  { name: 'Rent', icon: 'home', color: '#6BCB77', type: 'debit' },
  { name: 'Utilities', icon: 'bulb', color: '#3B82F6', type: 'debit' },
  { name: 'EMI', icon: 'card', color: '#E63946', type: 'debit' },
  { name: 'Entertainment', icon: 'film', color: '#FFD166', type: 'debit' },
  { name: 'Subscriptions', icon: 'play-circle', color: '#118AB2', type: 'debit' },
  { name: 'Healthcare', icon: 'medkit', color: '#06D6A0', type: 'debit' },
  { name: 'Fitness', icon: 'barbell', color: '#F97316', type: 'debit' },
  { name: 'Friend', icon: 'people', color: '#8B5CF6', type: 'debit' },
  { name: 'Others', icon: 'list', color: '#8D99AE', type: 'debit' },
  // Income default categories
  { name: 'Salary', icon: 'briefcase', color: '#10B981', type: 'credit' },
  { name: 'Job', icon: 'briefcase', color: '#14B8A6', type: 'credit' },
  { name: 'Business', icon: 'trending-up', color: '#059669', type: 'credit' },
  { name: 'Freelance', icon: 'laptop', color: '#0EA5E9', type: 'credit' },
  { name: 'Investments', icon: 'bar-chart', color: '#8B5CF6', type: 'credit' },
  { name: 'Savings', icon: 'cash', color: '#10B981', type: 'credit' },
  { name: 'Income', icon: 'wallet', color: '#10B981', type: 'credit' },
];

export function sanitizeAndDeduplicateCategories(categoriesList: CategoryItem[]): CategoryItem[] {
  const seen = new Set<string>();
  const result: CategoryItem[] = [];

  // Sort so custom categories take precedence over default categories
  const sorted = [...(categoriesList || [])].sort((a, b) => (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0));

  for (const item of sorted) {
    const rawName = (item.name || '').trim();
    const key = rawName.toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);

    let resolvedType = item.type;
    if (KNOWN_INCOME_CATEGORY_NAMES.has(key)) {
      resolvedType = 'credit';
    } else if (!resolvedType) {
      resolvedType = 'debit';
    }

    result.push({
      ...item,
      name: rawName,
      type: resolvedType,
    });
  }

  return result;
}

export async function initDatabase() {
  // No-op for Firestore
}

// ==================== HIGH-PERFORMANCE IN-MEMORY CACHE ====================
interface CacheItem<T> {
  data: T;
  timestamp: number;
}

const TX_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const CAT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const BILLS_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const NOTIF_CACHE_TTL_MS = 30 * 1000; // 30 seconds

const memoryCache = {
  transactions: new Map<string, CacheItem<any[]>>(),
  categories: new Map<string, CacheItem<CategoryItem[]>>(),
  recurringBills: new Map<string, CacheItem<any[]>>(),
  notifications: new Map<string, CacheItem<any[]>>(),
};

export function invalidateTransactionsCache(userId?: string) {
  if (userId) memoryCache.transactions.delete(userId);
  else memoryCache.transactions.clear();
}

export function invalidateCategoriesCache(userId?: string) {
  if (userId) memoryCache.categories.delete(userId);
  else memoryCache.categories.clear();
}

export function invalidateBillsCache(userId?: string) {
  if (userId) memoryCache.recurringBills.delete(userId);
  else memoryCache.recurringBills.clear();
}

export function invalidateNotificationsCache(userId?: string) {
  if (userId) memoryCache.notifications.delete(userId);
  else memoryCache.notifications.clear();
}

export function invalidateAllUserCache(userId?: string) {
  invalidateTransactionsCache(userId);
  invalidateCategoriesCache(userId);
  invalidateBillsCache(userId);
  invalidateNotificationsCache(userId);
}

/**
 * Returns cached transactions synchronously from memory or pending storage for 0ms initial render.
 */
export function getCachedTransactionsSync(userId: string): any[] | null {
  if (!userId) return null;
  const mem = memoryCache.transactions.get(userId);
  if (mem && mem.data && mem.data.length > 0) {
    return mem.data;
  }
  return getCachedOfflineTransactionsSync(userId);
}

// Transaction Listeners for Instant Cross-Component and Background Sync Updates
type TxListener = (txs: Transaction[]) => void;
const txListeners = new Set<TxListener>();

export function subscribeTransactions(listener: TxListener): () => void {
  txListeners.add(listener);
  return () => {
    txListeners.delete(listener);
  };
}

export function notifyTransactionsListeners(txs: Transaction[]) {
  txListeners.forEach((listener) => {
    try {
      listener(txs);
    } catch (e) {
      warn('Tx listener error:', e);
    }
  });
}

// Helper to normalize date to YYYY-MM-DD
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return getLocalDateString();

  const trimmed = dateStr.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmyMatch) {
    let [, d, m, y] = dmyMatch;
    if (y.length === 2) y = `20${y}`;
    const month = parseInt(m);
    if (month > 12) {
      return `${y}-${d.padStart(2, '0')}-${m.padStart(2, '0')}`;
    }
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-MMM-YYYY or DD MMM YYYY
  const dMMyMatch = trimmed.match(/^(\d{1,2})[\s-]([a-zA-Z]{3})[\s-](\d{2,4})$/);
  if (dMMyMatch) {
    let [, d, mStr, y] = dMMyMatch;
    if (y.length === 2) y = `20${y}`;
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const m = months[mStr.toLowerCase()];
    if (m) {
      return `${y}-${m}-${d.padStart(2, '0')}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return getLocalDateString(parsed);
  }

  return getLocalDateString();
}

export async function insertTransaction(userId: string, tx: any, statementId?: number) {
  if (!userId) return null;

  // 1. Generate client-side Firestore Document ID (permanent ID from creation or deterministic ID)
  const txsRef = collection(db, `users/${userId}/transactions`);
  const newDocRef = doc(txsRef);
  const txId = (tx?.id && typeof tx.id === 'string' && tx.id.trim()) ? tx.id.trim() : newDocRef.id;

  const rawPayee = tx.merchant_name || tx.payee || tx.merchant || tx.title || null;
  const rawMode = tx.payment_mode || tx.paymentMode || tx.mode;
  let payment_mode = rawMode ? normalizePaymentMode(rawMode) : 'unknown';

  const isAutoTx =
    tx.source === 'notification_listener' ||
    tx.source === 'sms_inbox' ||
    tx.source === 'auto' ||
    tx.status === 'auto_added' ||
    (typeof txId === 'string' && txId.startsWith('auto_'));

  if (isAutoTx && (payment_mode === 'unknown' || !rawMode)) {
    payment_mode = 'upi';
  }

  const userNote = tx.userNote || tx.user_note || tx.description || tx.note || null;
  const originalMessage = tx.originalMessage || tx.rawText || null;
  const nowMs = Date.now();
  const currentTime12 = formatTime12Hour(new Date());

  const txPayload = {
    id: txId,
    date: normalizeDate(tx.date),
    time: tx.time ? formatTime12Hour(tx.time) : currentTime12,
    amount: Number(tx.amount) || 0,
    type: (tx.type || 'debit').toLowerCase(),
    merchant_name: rawPayee,
    payee: rawPayee,
    category: tx.category || 'Others',
    description: userNote,
    note: userNote,
    userNote,
    originalMessage,
    utr: tx.utr || null,
    ref_no: tx.ref_no || null,
    payment_mode,
    paymentMode: payment_mode,
    receipt_image: tx.receipt_image || tx.receiptImage || null,
    balance_after: tx.balance_after ? Number(tx.balance_after) : null,
    source: tx.source || 'manual',
    source_statement_id: statementId || null,
    is_manually_edited: tx.is_manually_edited ? 1 : 0,
    created_at: tx.created_at ? (getCreatedAtMillis(tx.created_at) || nowMs) : nowMs,
    updatedAt: nowMs,
    updated_at: nowMs,
    syncedAt: null,
    syncStatus: 'pending',
    deleted: 0,
    sourceHash: tx.sourceHash || null,
    payKey: tx.payKey || null,
    batchId: tx.batchId || null,
    importedAt: tx.importedAt || null,
    sources: tx.sources || null,
    accountLast4: tx.accountLast4 || null,
  };

  // 2. Gather existing transactions from memory cache AND local persistent storage
  // to ensure previously loaded/existing transactions are NEVER lost or hidden!
  const cachedList = memoryCache.transactions.get(userId)?.data || [];
  const localTxs = await getOfflineTransactions(userId);

  const txMap = new Map<string, any>();
  for (const t of localTxs) {
    if (t?.id) txMap.set(t.id, t);
  }
  for (const t of cachedList) {
    if (t?.id) txMap.set(t.id, t);
  }

  // If local & memory cache were both completely empty, attempt remote fetch before saving
  if (txMap.size === 0) {
    try {
      const isOnline = await checkIsOnline();
      if (isOnline) {
        const q = query(collection(db, `users/${userId}/transactions`), orderBy('date', 'desc'), limit(100));
        let snap;
        try {
          snap = await getDocs(q);
        } catch {
          snap = await getDocs(query(collection(db, `users/${userId}/transactions`), limit(100)));
        }
        for (const d of snap.docs) {
          txMap.set(d.id, fromRemote({ id: d.id, ...d.data() }));
        }
      }
    } catch {
      // Intentional: offline fallback to local persistent cache
    }
  }

  // If transaction with deterministic ID already exists, return existing ID without duplicate write
  if (txMap.has(txId)) {
    return txId;
  }

  // Add the newly created transaction
  txMap.set(txId, txPayload);

  const updatedLocal = sortTransactionsRecentFirst(Array.from(txMap.values()));
  await saveOfflineTransactions(userId, updatedLocal);
  memoryCache.transactions.set(userId, { data: updatedLocal, timestamp: Date.now() });
  notifyTransactionsListeners(updatedLocal);

  // Sync with Android widget
  syncWidgetWithTransactions(userId, updatedLocal).catch(() => { });

  // 3. Queue offline sync action for Firebase
  await enqueueSyncAction(userId, {
    type: 'ADD_TRANSACTION',
    targetId: txId,
    payload: txPayload,
  });

  // 4. Background fire-and-forget sync to Firebase (debounced to protect battery/network)
  triggerDebouncedSync(userId, 1500);

  if ((tx.type || 'debit').toLowerCase() === 'debit') {
    checkAndTriggerBudgetAlert(userId).catch(() => { });
    import('@/features/notifications').then(({ triggerBudgetAlertIfNeeded, scheduleNext48h }) => {
      triggerBudgetAlertIfNeeded(Number(tx.amount) || 0, userId).catch(() => { });
      scheduleNext48h(userId).catch(() => { });
    }).catch(() => { });
  } else {
    import('@/features/notifications').then(({ scheduleNext48h }) => {
      scheduleNext48h(userId).catch(() => { });
    }).catch(() => { });
  }

  return txId;
}

export async function updateTransaction(userId: string, txId: string, txData: any) {
  if (!userId || !txId) return;

  const dataToUpdate: Record<string, any> = {
    is_manually_edited: txData.is_manually_edited !== undefined ? txData.is_manually_edited : 1,
    updated_at: Date.now(),
  };

  if (txData.date !== undefined) dataToUpdate.date = normalizeDate(txData.date);
  if (txData.time !== undefined) dataToUpdate.time = txData.time;
  if (txData.amount !== undefined) dataToUpdate.amount = Number(txData.amount) || 0;
  if (txData.type !== undefined) dataToUpdate.type = (txData.type || 'debit').toLowerCase();
  if (txData.merchant_name !== undefined || txData.payee !== undefined) {
    const val = txData.merchant_name !== undefined ? txData.merchant_name : txData.payee;
    dataToUpdate.merchant_name = val;
    dataToUpdate.payee = val;
  }
  if (txData.category !== undefined) dataToUpdate.category = txData.category;
  if (txData.description !== undefined || txData.userNote !== undefined || txData.note !== undefined) {
    const noteVal = txData.description !== undefined ? txData.description : (txData.userNote !== undefined ? txData.userNote : txData.note);
    dataToUpdate.description = noteVal;
    dataToUpdate.userNote = noteVal;
    dataToUpdate.note = noteVal;
  }
  if (txData.payment_mode !== undefined || txData.paymentMode !== undefined) {
    const rawMode = txData.payment_mode !== undefined ? txData.payment_mode : txData.paymentMode;
    const modeVal = normalizePaymentMode(rawMode);
    dataToUpdate.payment_mode = modeVal;
    dataToUpdate.paymentMode = modeVal;
  }
  if (txData.receipt_image !== undefined) dataToUpdate.receipt_image = txData.receipt_image;
  if (txData.utr !== undefined) dataToUpdate.utr = txData.utr;
  if (txData.ref_no !== undefined) dataToUpdate.ref_no = txData.ref_no;
  if (txData.sources !== undefined) dataToUpdate.sources = txData.sources;
  if (txData.accountLast4 !== undefined) dataToUpdate.accountLast4 = txData.accountLast4;
  if (txData.balance_after !== undefined) dataToUpdate.balance_after = txData.balance_after;

  // 1. Gather existing transactions from memory cache and offline storage
  const cachedList = memoryCache.transactions.get(userId)?.data || [];
  const localTxs = await getOfflineTransactions(userId);

  const txMap = new Map<string, any>();
  for (const t of localTxs) {
    if (t?.id) txMap.set(t.id, t);
  }
  for (const t of cachedList) {
    if (t?.id) txMap.set(t.id, t);
  }

  if (txMap.has(txId)) {
    txMap.set(txId, { ...txMap.get(txId), ...dataToUpdate });
  }

  const updatedLocal = sortTransactionsRecentFirst(Array.from(txMap.values()));
  await saveOfflineTransactions(userId, updatedLocal);
  memoryCache.transactions.set(userId, { data: updatedLocal, timestamp: Date.now() });
  notifyTransactionsListeners(updatedLocal);

  // Sync with Android widgets
  syncWidgetWithTransactions(userId).catch(() => { });

  // 2. Queue offline sync action
  await enqueueSyncAction(userId, {
    type: 'UPDATE_TRANSACTION',
    targetId: txId,
    payload: dataToUpdate,
  });

  // 3. Background sync (debounced to protect battery/network)
  triggerDebouncedSync(userId, 5000);

  import('@/features/notifications').then(({ scheduleNext48h }) => {
    scheduleNext48h(userId).catch(() => {});
  }).catch(() => {});
}

export async function getTransactionById(userId: string, txId: string): Promise<any | null> {
  if (!userId || !txId) return null;

  // 1. Check in-memory cache
  const memCached = memoryCache.transactions.get(userId);
  if (memCached?.data) {
    const found = memCached.data.find((t) => t.id === txId);
    if (found) return found;
  }

  // 2. Check local persistent storage
  const offlineTxs = await getOfflineTransactions(userId);
  const foundLocal = offlineTxs.find((t) => t.id === txId);
  if (foundLocal) return foundLocal;

  // 3. If not found locally, fetch from Firestore
  try {
    const docRef = doc(db, `users/${userId}/transactions`, txId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return fromRemote({ id: snap.id, ...snap.data() });
    }
  } catch (err) {
    warn('getTransactionById offline fallback caught:', err);
  }

  return null;
}

export async function insertTransactionsBatch(
  userId: string,
  transactions: any[],
  statementId?: number
): Promise<{ imported: number; skipped: number }> {
  if (!userId) return { imported: 0, skipped: 0 };
  let imported = 0;
  let skipped = 0;

  const existingTxs = await getAllTransactions(userId, true);
  const syncEnabled = await isCloudSyncEnabled(userId);
  const MAX_BATCH_SIZE = 500;
  let batch = writeBatch(db);
  let batchCount = 0;
  const newLocalTxs: any[] = [];

  for (const tx of transactions) {
    const normDate = normalizeDate(tx.date);
    const amount = Number(tx.amount) || 0;
    const ref = tx.ref_no || tx.utr;

    const isDuplicate = existingTxs.some((e: any) => {
      if (e.date !== normDate || e.amount !== amount) return false;
      if (ref && (e.ref_no === ref || e.utr === ref)) return true;
      if (!ref && e.description === tx.description) return true;
      return false;
    });

    if (isDuplicate) {
      skipped++;
      continue;
    }

    const txsRef = doc(collection(db, `users/${userId}/transactions`));
    const batchPayee = tx.merchant_name || tx.payee || tx.merchant || tx.title || null;
    const rawModeBatch = tx.payment_mode || tx.paymentMode || tx.mode;
    let batchPaymentMode = rawModeBatch ? normalizePaymentMode(rawModeBatch) : 'unknown';

    const isAutoBatch =
      tx.source === 'notification_listener' ||
      tx.source === 'sms_inbox' ||
      tx.source === 'auto' ||
      tx.status === 'auto_added' ||
      (typeof tx.id === 'string' && tx.id.startsWith('auto_'));

    if (isAutoBatch && (batchPaymentMode === 'unknown' || !rawModeBatch)) {
      batchPaymentMode = 'upi';
    }

    const batchUserNote = tx.userNote || tx.user_note || tx.description || tx.note || null;
    const batchNow = Date.now();

    const txDocData = {
      id: txsRef.id,
      date: normDate,
      time: tx.time || null,
      amount,
      type: (tx.type || 'debit').toLowerCase(),
      merchant_name: batchPayee,
      payee: batchPayee,
      category: tx.category || 'Others',
      description: batchUserNote,
      note: batchUserNote,
      userNote: batchUserNote,
      originalMessage: tx.originalMessage || null,
      utr: tx.utr || null,
      ref_no: tx.ref_no || null,
      payment_mode: batchPaymentMode,
      paymentMode: batchPaymentMode,
      receipt_image: tx.receipt_image || null,
      balance_after: tx.balance_after ? Number(tx.balance_after) : null,
      source: tx.source || 'statement',
      source_statement_id: statementId || null,
      is_manually_edited: 0,
      created_at: batchNow,
      updatedAt: batchNow,
      updated_at: batchNow,
      syncedAt: syncEnabled ? batchNow : null,
      syncStatus: syncEnabled ? 'synced' : 'pending',
      deleted: 0,
    };

    if (syncEnabled) {
      const remotePayload = toRemote(txDocData);
      batch.set(txsRef, remotePayload);
      batchCount++;
    }

    newLocalTxs.push(txDocData);
    imported++;

    if (syncEnabled && batchCount >= MAX_BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (syncEnabled && batchCount > 0) {
    await batch.commit();
  }

  // Ensure offline local storage and memory cache are immediately updated with all imported records
  if (newLocalTxs.length > 0) {
    const combined = sortTransactionsRecentFirst([...existingTxs, ...newLocalTxs]);
    await saveOfflineTransactions(userId, combined);
    memoryCache.transactions.set(userId, { data: combined, timestamp: Date.now() });
    notifyTransactionsListeners(combined);
  } else {
    invalidateTransactionsCache(userId);
  }

  return { imported, skipped };
}

export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && h < 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

export function getCreatedAtMillis(createdAt: any): number {
  if (!createdAt) return 0;
  if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  if (typeof createdAt.toDate === 'function') return createdAt.toDate().getTime();
  if (typeof createdAt.seconds === 'number') {
    return createdAt.seconds * 1000 + (createdAt.nanoseconds || 0) / 1000000;
  }
  if (typeof createdAt === 'number') return createdAt;
  if (typeof createdAt === 'string') {
    const parsed = Date.parse(createdAt);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function sortTransactionsRecentFirst<T extends Record<string, any>>(list: T[]): T[] {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a: any, b: any) => {
    // 1. Primary: Compare normalized date string (YYYY-MM-DD) descending (Newer date first)
    const dateA = normalizeDate(a?.date);
    const dateB = normalizeDate(b?.date);
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }

    // 2. Extract created_at milliseconds
    const createdA = getCreatedAtMillis(a?.created_at);
    const createdB = getCreatedAtMillis(b?.created_at);

    // 3. Secondary: If same date, compare time (e.g. "08:30 PM", "14:30") descending
    let timeA = parseTimeToMinutes(a?.time);
    let timeB = parseTimeToMinutes(b?.time);

    // If time is missing or null, derive minutes from created_at timestamp so it never drops below
    if (timeA === null && createdA > 0) {
      const dA = new Date(createdA);
      timeA = dA.getHours() * 60 + dA.getMinutes();
    }
    if (timeB === null && createdB > 0) {
      const dB = new Date(createdB);
      timeB = dB.getHours() * 60 + dB.getMinutes();
    }

    if (timeA !== null && timeB !== null && timeA !== timeB) {
      return timeB - timeA;
    }
    if (timeA !== null && timeB === null) return -1;
    if (timeA === null && timeB !== null) return 1;

    // 4. Tertiary: If same minute, compare created_at timestamp descending (Latest created first)
    if (createdA !== createdB) {
      return (createdB || 0) - (createdA || 0);
    }

    // 5. Stable fallback
    return (b?.id || '').localeCompare(a?.id || '');
  });
}

export async function getAllTransactions(userId: string, forceRefresh = false): Promise<any[]> {
  if (!userId) return [];

  const now = Date.now();
  const cached = memoryCache.transactions.get(userId);

  // 1. If memory cache is fresh and not forced, return immediately
  if (!forceRefresh && cached && (now - cached.timestamp < TX_CACHE_TTL_MS)) {
    return cached.data;
  }

  // 2. If forceRefresh is requested, fetch fresh data via pullFromCloud
  if (forceRefresh) {
    try {
      const pullRes = await pullFromCloud(userId);
      if (pullRes.transactions && pullRes.transactions.length > 0) {
        const sortedRemote = sortTransactionsRecentFirst(pullRes.transactions);
        memoryCache.transactions.set(userId, { data: sortedRemote, timestamp: Date.now() });
        notifyTransactionsListeners(sortedRemote);
        return sortedRemote;
      }
    } catch (err) {
      warn('forceRefresh remote pull error:', err);
    }
  }

  // 3. Load from local persistent storage (AsyncStorage)
  const offlineTxs = await getOfflineTransactions(userId);
  if (offlineTxs && offlineTxs.length > 0) {
    const sorted = sortTransactionsRecentFirst(offlineTxs);
    memoryCache.transactions.set(userId, { data: sorted, timestamp: now });

    // In background, sync with Firebase Firestore if online (throttled to 5 mins)
    syncRemoteTransactions(userId, db, false).then((remoteData) => {
      if (remoteData && remoteData.length > 0) {
        const sortedRemote = sortTransactionsRecentFirst(remoteData);
        memoryCache.transactions.set(userId, { data: sortedRemote, timestamp: Date.now() });
        notifyTransactionsListeners(sortedRemote);
      }
    }).catch(() => { });

    // Return instant offline data (0ms response time!)
    return sorted;
  }

  // 4. If local storage is empty (first app launch / re-login / reinstall), pull from remote Firestore
  try {
    const pullRes = await pullFromCloud(userId);
    const sorted = sortTransactionsRecentFirst(pullRes.transactions);
    memoryCache.transactions.set(userId, { data: sorted, timestamp: now });
    notifyTransactionsListeners(sorted);
    return sorted;
  } catch (err) {
    warn('getAllTransactions offline fallback:', err);
    return [];
  }
}

export async function getTransactionsByMonth(userId: string, monthYear: string): Promise<any[]> {
  if (!userId) return [];
  const txs = await getAllTransactions(userId);
  return txs.filter((tx: any) => tx.date && tx.date.startsWith(monthYear));
}

export async function deleteTransaction(userId: string, txId: string) {
  if (!userId || !txId) return;

  // 1. Gather all existing transactions from memory cache and offline storage
  const cachedList = memoryCache.transactions.get(userId)?.data || [];
  const localTxs = await getOfflineTransactions(userId);

  const txMap = new Map<string, any>();
  for (const t of localTxs) {
    if (t?.id) txMap.set(t.id, t);
  }
  for (const t of cachedList) {
    if (t?.id) txMap.set(t.id, t);
  }

  const deletedItem = txMap.get(txId);
  txMap.delete(txId);

  // Layer 4 Dedupe: If deleted transaction was imported from SMS/alerts, record in ignored set so it never re-imports
  if (deletedItem) {
    const payKey = deletedItem.payKey || (typeof txId === 'string' && txId.startsWith('sms_') ? txId.replace(/^sms_/, '') : null);
    if (payKey) {
      recordIgnoredPayKey(userId, payKey).catch(() => {});
    }
  }

  const updatedLocal = sortTransactionsRecentFirst(Array.from(txMap.values()));
  await saveOfflineTransactions(userId, updatedLocal);
  memoryCache.transactions.set(userId, { data: updatedLocal, timestamp: Date.now() });
  notifyTransactionsListeners(updatedLocal);

  // Sync with Android widget
  syncWidgetWithTransactions(userId, updatedLocal).catch(() => { });

  // 2. Queue offline sync action
  await enqueueSyncAction(userId, {
    type: 'DELETE_TRANSACTION',
    targetId: txId,
  });

  // 3. Background sync (debounced to protect battery/network)
  triggerDebouncedSync(userId, 5000);

  import('@/features/notifications').then(({ scheduleNext48h }) => {
    scheduleNext48h(userId).catch(() => {});
  }).catch(() => {});
}

export async function deleteAllTransactions(userId: string) {
  if (!userId) return;

  // 1. Clear local persistent storage & memory cache immediately
  await saveOfflineTransactions(userId, []);
  memoryCache.transactions.set(userId, { data: [], timestamp: Date.now() });
  notifyTransactionsListeners([]);

  // Sync with Android widget
  syncWidgetWithTransactions(userId, []).catch(() => { });

  // 2. Delete from Firestore in background
  try {
    const txs = await getAllTransactions(userId, true);
    const MAX_BATCH_SIZE = 500;
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const tx of txs) {
      batch.delete(doc(db, `users/${userId}/transactions`, tx.id));
      batchCount++;
      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (err) {
    warn('deleteAllTransactions remote error:', err);
  }

  invalidateTransactionsCache(userId);
}

// ==================== CATEGORIES ====================

export async function getUserCategories(userId: string, forceRefresh = false): Promise<CategoryItem[]> {
  if (!userId) return sanitizeAndDeduplicateCategories(defaultCategories);

  const now = Date.now();
  const cached = memoryCache.categories.get(userId);
  if (!forceRefresh && cached && (now - cached.timestamp < CAT_CACHE_TTL_MS)) {
    return sanitizeAndDeduplicateCategories(cached.data);
  }

  // 1. Check local offline storage first
  const offlineCats = await getOfflineCategories(userId);
  if (offlineCats && offlineCats.length > 0) {
    const cleaned = sanitizeAndDeduplicateCategories(offlineCats);
    memoryCache.categories.set(userId, { data: cleaned, timestamp: now });

    // Background check & update if online
    checkIsOnline().then((online) => {
      if (online) {
        getDocs(collection(db, `users/${userId}/categories`)).then((snapshot) => {
          if (!snapshot.empty) {
            const userCats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CategoryItem));
            const customNames = new Set(userCats.map(c => (c.name || '').trim().toLowerCase()));
            const remainingDefaults = defaultCategories.filter(
              d => !customNames.has((d.name || '').trim().toLowerCase())
            );
            const merged = sanitizeAndDeduplicateCategories([...remainingDefaults, ...userCats]);
            saveOfflineCategories(userId, merged);
            memoryCache.categories.set(userId, { data: merged, timestamp: Date.now() });
          }
        }).catch(() => { });
      }
    });

    return cleaned;
  }

  try {
    const categoriesRef = collection(db, `users/${userId}/categories`);
    const snapshot = await getDocs(categoriesRef);
    if (snapshot.empty) {
      const cleaned = sanitizeAndDeduplicateCategories(defaultCategories);
      saveOfflineCategories(userId, cleaned);
      memoryCache.categories.set(userId, { data: cleaned, timestamp: now });
      return cleaned;
    }
    const userCats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CategoryItem));

    const hasDefaults = userCats.some(c => c.isCustom === false);
    if (hasDefaults) {
      const cleaned = sanitizeAndDeduplicateCategories(userCats);
      saveOfflineCategories(userId, cleaned);
      memoryCache.categories.set(userId, { data: cleaned, timestamp: now });
      return cleaned;
    }

    const customNames = new Set(userCats.map(c => (c.name || '').trim().toLowerCase()));
    const remainingDefaults = defaultCategories.filter(
      d => !customNames.has((d.name || '').trim().toLowerCase())
    );

    const merged = sanitizeAndDeduplicateCategories([...remainingDefaults, ...userCats]);
    saveOfflineCategories(userId, merged);
    memoryCache.categories.set(userId, { data: merged, timestamp: now });
    return merged;
  } catch (err) {
    warn('Could not load categories; using defaults:', err);
    return sanitizeAndDeduplicateCategories(defaultCategories);
  }
}

export async function addCategory(userId: string, category: CategoryItem) {
  if (!userId) return;
  const categoriesRef = collection(db, `users/${userId}/categories`);
  const newCatDoc = doc(categoriesRef);
  const catId = newCatDoc.id;

  const catItem: CategoryItem = {
    ...category,
    id: catId,
    isCustom: true,
  };

  // 1. Update local storage & memory cache immediately
  const currentCats = (await getOfflineCategories(userId)) || defaultCategories;
  const updatedCats = [...currentCats, catItem];
  await saveOfflineCategories(userId, updatedCats);
  memoryCache.categories.set(userId, { data: updatedCats, timestamp: Date.now() });

  // 2. Queue offline sync action
  await enqueueSyncAction(userId, {
    type: 'ADD_CATEGORY',
    targetId: catId,
    payload: catItem,
  });

  // 3. Background sync
  flushSyncQueue(userId, db).catch(() => { });
  return catId;
}

export async function deleteCategory(userId: string, categoryId: string) {
  if (!userId || !categoryId) return;

  // 1. Update local storage & memory cache immediately
  const currentCats = (await getOfflineCategories(userId)) || defaultCategories;
  const updatedCats = currentCats.filter((c) => c.id !== categoryId);
  await saveOfflineCategories(userId, updatedCats);
  memoryCache.categories.set(userId, { data: updatedCats, timestamp: Date.now() });

  // 2. Queue offline sync action
  await enqueueSyncAction(userId, {
    type: 'DELETE_CATEGORY',
    targetId: categoryId,
  });

  // 3. Background sync
  flushSyncQueue(userId, db).catch(() => { });
}

/**
 * Fully sync offline pending queue and pull remote data from Firebase Firestore.
 */
export async function syncUserOfflineData(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await flushSyncQueue(userId, db);
    await flushUdharSyncQueue(userId);
    await uploadLocalDataToCloud(userId).catch(() => { });
    const remoteData = await syncRemoteTransactions(userId, db);
    if (remoteData && remoteData.length > 0) {
      const sorted = sortTransactionsRecentFirst(remoteData);
      memoryCache.transactions.set(userId, { data: sorted, timestamp: Date.now() });
    }
  } catch (err) {
    warn('syncUserOfflineData caught:', err);
  }
}

export async function addCustomCategory(userId: string, category: CategoryItem) {
  return addCategory(userId, category);
}

export async function updateCustomCategory(userId: string, categoryId: string, category: Partial<CategoryItem>) {
  if (!userId || !categoryId) return;
  const docRef = doc(db, `users/${userId}/categories`, categoryId);
  await updateDoc(docRef, category);
  invalidateCategoriesCache(userId);
}

export async function deleteCustomCategory(userId: string, categoryId: string) {
  return deleteCategory(userId, categoryId);
}

export async function getCategoryTotals(
  userId: string,
  monthYear?: string
): Promise<{ name: string; amount: number; color: string; icon: string }[]> {
  if (!userId) return [];
  const [txs, allCategories] = await Promise.all([
    getAllTransactions(userId),
    getUserCategories(userId),
  ]);

  const filteredTxs = monthYear
    ? txs.filter((tx: any) => tx.date && tx.date.startsWith(monthYear) && tx.type === 'debit')
    : txs.filter((tx: any) => tx.type === 'debit');

  const catMap: Record<string, number> = {};
  for (const tx of filteredTxs) {
    const cat = tx.category || 'Others';
    const amt = Number(tx.amount) || 0;
    catMap[cat] = (catMap[cat] || 0) + amt;
  }

  return allCategories.map(cat => ({
    name: cat.name,
    amount: catMap[cat.name] || 0,
    color: cat.color,
    icon: cat.icon,
  }));
}

// ==================== RECURRING BILLS & REMINDERS ====================

export interface BillPaymentRecord {
  id?: string;
  transactionId?: string;
  amount: number;
  date: string;       // YYYY-MM-DD
  paidAt: number | string;
  note?: string;
  paymentMode?: string;
}

export interface RecurringBill {
  id?: string;
  title: string;          // e.g. "Flat Rent", "Jio Recharge", "Airtel Fiber", "Electricity"
  amount: number;         // e.g. 8000
  category: string;       // e.g. "Rent", "Subscriptions", "Bills"
  type: 'monthly_date' | 'cycle_days'; // 'monthly_date' for monthly day (e.g. 30th) or 'cycle_days' (e.g. 28 days)
  frequency?: 'monthly' | 'quarterly' | 'yearly';
  provider?: string;      // e.g. 'jio', 'airtel', 'vi', 'bsnl', 'netflix', 'spotify', 'prime', 'rent'
  brandColor?: string;    // e.g. '#0A2885', '#ED1C24', '#E50914'
  brandBadge?: string;    // e.g. 'Jio', 'airtel', 'Vi', 'BSNL'
  dueDay?: number;        // 1 to 31 (e.g. 30 for 30th of every month)
  cycleDays?: number;     // e.g. 28, 56, 84, 365
  startDate?: string;     // YYYY-MM-DD
  lastPaidDate?: string;  // YYYY-MM-DD
  lastPaidAt?: number;
  nextDueDate: string;    // YYYY-MM-DD
  notes?: string;
  autoReminderDays?: number; // default 3 days
  reminderDays?: number;
  reminderEnabled?: boolean;
  receiptImage?: string;  // Last payment proof screenshot
  status?: 'due_soon' | 'due_today' | 'overdue' | 'paid' | 'pending';
  iconKey?: string;       // Optional Ionicons icon name for custom / auto-generated icon
  regionCode?: string;    // Optional region code preset (e.g. 'INR', 'USD')
  created_at?: any;
  // Bill Matching & Automation
  autoConfirm?: boolean;       // default true
  keywords?: string;           // comma-separated keywords e.g. "jio, reliance"
  amountTolerance?: number;    // default 0
  linkedTransactionId?: string;
  paymentHistory?: BillPaymentRecord[];
}

export interface CustomBillProvider {
  id?: string;
  name: string;
  normalizedName: string;
  iconKey: string;
  color: string;
  category: string;
  group?: 'sim' | 'daily' | 'ott' | 'wifi' | 'utility' | 'other';
  createdAt?: any;
}

export function calculateNextMonthlyDueDate(dueDay: number, baseDate = new Date()): string {
  const today = new Date(baseDate);
  let targetYear = today.getFullYear();
  let targetMonth = today.getMonth(); // 0-indexed

  if (today.getDate() > dueDay) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  const maxDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const actualDay = Math.min(dueDay, maxDaysInMonth);
  const mStr = String(targetMonth + 1).padStart(2, '0');
  const dStr = String(actualDay).padStart(2, '0');
  return `${targetYear}-${mStr}-${dStr}`;
}

export function calculateNextCycleDueDate(cycleDays: number, baseDateStr?: string): string {
  const base = baseDateStr ? new Date(baseDateStr) : new Date();
  if (isNaN(base.getTime())) return getLocalDateString();
  const next = new Date(base.getTime() + cycleDays * 24 * 60 * 60 * 1000);
  return getLocalDateString(next);
}

const OFFLINE_BILLS_KEY = (userId: string) => `@rupeo_offline_bills_${userId}`;

export async function getRecurringBills(userId: string, forceRefresh = false): Promise<RecurringBill[]> {
  if (!userId) return [];

  const now = Date.now();
  const cached = memoryCache.recurringBills.get(userId);
  if (!forceRefresh && cached && (now - cached.timestamp < BILLS_CACHE_TTL_MS)) {
    return cached.data;
  }

  let offlineBills: RecurringBill[] = [];
  try {
    const billsKey = OFFLINE_BILLS_KEY(userId);
    const raw = await AsyncStorage.getItem(billsKey);
    if (raw) {
      offlineBills = safeJsonParse<RecurringBill[]>(raw, [], billsKey, (v) => Array.isArray(v));
    }
  } catch {}

  try {
    const billsRef = collection(db, `users/${userId}/recurring_bills`);
    const snap = await getDocs(billsRef);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringBill));
    const sorted = list.sort((a, b) => (a.nextDueDate || '').localeCompare(b.nextDueDate || ''));
    memoryCache.recurringBills.set(userId, { data: sorted, timestamp: now });

    AsyncStorage.setItem(OFFLINE_BILLS_KEY(userId), JSON.stringify(sorted)).catch(() => {});
    syncRecurringBillsToSQLite(sorted);

    return sorted;
  } catch (err) {
    warn('Error fetching recurring bills:', err);
    if (offlineBills.length > 0) {
      memoryCache.recurringBills.set(userId, { data: offlineBills, timestamp: now });
      syncRecurringBillsToSQLite(offlineBills);
      return offlineBills;
    }
    const sqliteBills = getRecurringBillsFromSQLite();
    if (sqliteBills.length > 0) {
      return sqliteBills as RecurringBill[];
    }
    return [];
  }
}

export async function saveRecurringBill(userId: string, bill: RecurringBill): Promise<string> {
  if (!userId) throw new Error('User not logged in');
  const billsRef = collection(db, `users/${userId}/recurring_bills`);

  let nextDue = bill.nextDueDate;
  if (!nextDue) {
    if (bill.type === 'monthly_date' && bill.dueDay) {
      nextDue = calculateNextMonthlyDueDate(bill.dueDay);
    } else if (bill.type === 'cycle_days' && bill.cycleDays) {
      nextDue = calculateNextCycleDueDate(bill.cycleDays, bill.startDate || bill.lastPaidDate);
    } else {
      nextDue = getLocalDateString();
    }
  }

  const payload = {
    title: bill.title.trim(),
    amount: Number(bill.amount) || 0,
    category: bill.category || 'Bills',
    type: bill.type || 'monthly_date',
    frequency: bill.frequency || null,
    provider: bill.provider || null,
    brandColor: bill.brandColor || null,
    brandBadge: bill.brandBadge || null,
    dueDay: bill.dueDay ? Number(bill.dueDay) : null,
    cycleDays: bill.cycleDays ? Number(bill.cycleDays) : null,
    startDate: bill.startDate || getLocalDateString(),
    lastPaidDate: bill.lastPaidDate || null,
    lastPaidAt: bill.lastPaidAt ? Number(bill.lastPaidAt) : null,
    nextDueDate: nextDue,
    notes: bill.notes?.trim() || null,
    autoReminderDays: bill.autoReminderDays ?? 3,
    receiptImage: bill.receiptImage || null,
    autoConfirm: bill.autoConfirm !== false,
    keywords: bill.keywords ? String(bill.keywords).trim() : null,
    amountTolerance: Number(bill.amountTolerance) || 0,
    linkedTransactionId: bill.linkedTransactionId || null,
    paymentHistory: bill.paymentHistory || [],
    created_at: serverTimestamp(),
  };

  let resId = bill.id || '';
  if (bill.id) {
    const docRef = doc(db, `users/${userId}/recurring_bills`, bill.id);
    await updateDoc(docRef, payload);
    resId = bill.id;
  } else {
    const docRef = await addDoc(billsRef, payload);
    resId = docRef.id;
  }

  const savedBill = { ...payload, id: resId } as unknown as RecurringBill;
  saveRecurringBillToSQLite(savedBill);

  invalidateBillsCache(userId);
  syncWidgetWithTransactions(userId).catch(() => { });
  return resId;
}

export async function deleteRecurringBill(userId: string, billId: string) {
  if (!userId || !billId) return;
  try {
    await deleteDoc(doc(db, `users/${userId}/recurring_bills/${billId}`));
  } catch (err) {
    warn('Error deleting remote recurring bill:', err);
  }
  deleteRecurringBillFromSQLite(billId);
  invalidateBillsCache(userId);
  syncWidgetWithTransactions(userId).catch(() => { });
}

export async function recordMatchedBillPayment(
  userId: string,
  billId: string,
  txId: string,
  amount: number,
  dateStr: string,
  nextDueDate: string,
  paymentRecord: BillPaymentRecord
): Promise<void> {
  if (!userId || !billId) return;

  try {
    markBillPaidInSQLite(billId, txId, amount, dateStr, nextDueDate, paymentRecord);

    const billDocRef = doc(db, `users/${userId}/recurring_bills`, billId);
    const snap = await getDoc(billDocRef).catch(() => null);
    let history: BillPaymentRecord[] = [];
    if (snap && snap.exists()) {
      const data = snap.data() as RecurringBill;
      history = data.paymentHistory || [];
    }
    history = [paymentRecord, ...history];

    await updateDoc(billDocRef, {
      status: 'paid',
      lastPaidDate: dateStr,
      lastPaidAt: Date.now(),
      nextDueDate: nextDueDate,
      linkedTransactionId: txId,
      paymentHistory: history,
      updated_at: serverTimestamp(),
    }).catch(() => {});

    invalidateBillsCache(userId);
    syncWidgetWithTransactions(userId).catch(() => {});
  } catch (err) {
    warn('Error recording matched bill payment:', err);
  }
}

export async function undoBillPayment(
  userId: string,
  billId: string,
  transactionId?: string,
  prevDueDate?: string,
  deleteTx: boolean = true
): Promise<void> {
  if (!userId || !billId) return;

  try {
    undoBillPaymentInSQLite(billId, transactionId || '', prevDueDate);

    const billDocRef = doc(db, `users/${userId}/recurring_bills`, billId);
    const snap = await getDoc(billDocRef).catch(() => null);
    if (snap && snap.exists()) {
      const data = snap.data() as RecurringBill;
      const history = (data.paymentHistory || []).filter(
        (p) => !transactionId || p.transactionId !== transactionId
      );
      const targetDue = prevDueDate || data.nextDueDate;

      await updateDoc(billDocRef, {
        status: 'pending',
        linkedTransactionId: null,
        nextDueDate: targetDue,
        paymentHistory: history,
        updated_at: serverTimestamp(),
      }).catch(() => {});
    }

    if (deleteTx && transactionId) {
      await deleteTransaction(userId, transactionId).catch(() => {});
    }

    invalidateBillsCache(userId);
    syncWidgetWithTransactions(userId).catch(() => {});
  } catch (err) {
    warn('Error undoing bill payment:', err);
  }
}

// ==================== CUSTOM BILL PROVIDERS ====================

const CUSTOM_PROVIDERS_KEY = (userId: string) => `@rupeo_custom_bill_providers_${userId}`;

export async function getCustomBillProviders(userId: string, forceRefresh = false): Promise<CustomBillProvider[]> {
  if (!userId) return [];
  const now = Date.now();
  const cached = memoryCache.recurringBills.get(`custom_providers_${userId}`);
  if (!forceRefresh && cached && (now - cached.timestamp < BILLS_CACHE_TTL_MS)) {
    return cached.data;
  }

  // 1. Check local offline storage
  try {
    const provKey = CUSTOM_PROVIDERS_KEY(userId);
    const raw = await AsyncStorage.getItem(provKey);
    if (raw) {
      const parsed = safeJsonParse<CustomBillProvider[]>(raw, [], provKey, (v) => Array.isArray(v));
      if (parsed.length > 0 && !forceRefresh) {
        memoryCache.recurringBills.set(`custom_providers_${userId}`, { data: parsed, timestamp: now });
        return parsed;
      }
    }
  } catch (e) {
    warn('Error reading offline custom bill providers:', e);
  }

  // 2. Query Firestore if online
  try {
    const providersRef = collection(db, `users/${userId}/custom_bill_providers`);
    const snap = await getDocs(providersRef);
    const list: CustomBillProvider[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomBillProvider));
    list.sort((a, b) => {
      const aT = a.createdAt?.seconds || 0;
      const bT = b.createdAt?.seconds || 0;
      return bT - aT;
    });

    const capped = list.slice(0, 30);
    await AsyncStorage.setItem(CUSTOM_PROVIDERS_KEY(userId), JSON.stringify(capped));
    memoryCache.recurringBills.set(`custom_providers_${userId}`, { data: capped, timestamp: now });
    return capped;
  } catch (err) {
    warn('Error fetching custom bill providers:', err);
    try {
      const provKey = CUSTOM_PROVIDERS_KEY(userId);
      const raw = await AsyncStorage.getItem(provKey);
      return raw ? safeJsonParse<CustomBillProvider[]>(raw, [], provKey, (v) => Array.isArray(v)) : [];
    } catch {
      return [];
    }
  }
}

export async function saveCustomBillProvider(userId: string, provider: CustomBillProvider): Promise<CustomBillProvider> {
  if (!userId) throw new Error('User required');

  const existing = await getCustomBillProviders(userId, true);
  if (existing.length >= 30 && !provider.id) {
    throw new Error('Maximum limit of 30 custom providers reached');
  }

  const providersRef = collection(db, `users/${userId}/custom_bill_providers`);
  let docId = provider.id;

  const payload: any = {
    name: provider.name.trim(),
    normalizedName: provider.normalizedName || provider.name.trim().toLowerCase(),
    iconKey: provider.iconKey || 'receipt-outline',
    color: provider.color || '#4F46E5',
    category: provider.category || 'Bills',
    group: provider.group || 'other',
    updatedAt: serverTimestamp(),
  };

  if (docId) {
    await updateDoc(doc(db, `users/${userId}/custom_bill_providers`, docId), payload);
  } else {
    payload.createdAt = serverTimestamp();
    const newDoc = await addDoc(providersRef, payload);
    docId = newDoc.id;
  }

  const savedItem: CustomBillProvider = {
    ...payload,
    id: docId,
  };

  // Update local cache
  const updatedList = [
    savedItem,
    ...existing.filter(p => p.id !== docId),
  ].slice(0, 30);

  await AsyncStorage.setItem(CUSTOM_PROVIDERS_KEY(userId), JSON.stringify(updatedList));
  memoryCache.recurringBills.set(`custom_providers_${userId}`, { data: updatedList, timestamp: Date.now() });

  return savedItem;
}

export async function deleteCustomBillProvider(userId: string, providerId: string): Promise<void> {
  if (!userId || !providerId) return;

  try {
    await deleteDoc(doc(db, `users/${userId}/custom_bill_providers`, providerId));
  } catch (err) {
    warn('Error deleting custom bill provider remotely:', err);
  }

  const existing = await getCustomBillProviders(userId, false);
  const filtered = existing.filter(p => p.id !== providerId);

  await AsyncStorage.setItem(CUSTOM_PROVIDERS_KEY(userId), JSON.stringify(filtered));
  memoryCache.recurringBills.set(`custom_providers_${userId}`, { data: filtered, timestamp: Date.now() });
}

export async function payRecurringBill(
  userId: string,
  bill: RecurringBill,
  paymentMode = 'UPI',
  receiptImage?: string,
  paidAmount?: number,
  notes?: string,
  paidDate?: string,
  currencyCode?: string
) {
  if (!userId || !bill.id) return;
  const todayStr = paidDate || getLocalDateString();
  const now = new Date();
  const timeStr = formatTime12Hour(now);
  const finalAmount = typeof paidAmount === 'number' && paidAmount > 0 ? paidAmount : bill.amount;

  // 1. Record the expense transaction with attached proof screenshot
  const txnDesc = notes
    ? `${notes} (Bill Payment: ${bill.title})`
    : (bill.notes ? `${bill.notes} (Bill Payment)` : `Recurring Payment: ${bill.title}`);

  await insertTransaction(userId, {
    date: todayStr,
    time: timeStr,
    amount: finalAmount,
    type: 'debit',
    merchant_name: bill.title,
    category: bill.category || 'Bills',
    description: txnDesc,
    payment_mode: paymentMode,
    receipt_image: receiptImage || bill.receiptImage || null,
  });

  // 2. Calculate next due date
  let nextDate = todayStr;
  if (bill.type === 'monthly_date' && bill.dueDay) {
    const nextMonthDate = new Date();
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    nextDate = calculateNextMonthlyDueDate(bill.dueDay, nextMonthDate);
  } else if (bill.type === 'cycle_days' && bill.cycleDays) {
    nextDate = calculateNextCycleDueDate(bill.cycleDays, todayStr);
  }

  // 3. Update the recurring bill doc in Firestore for NEXT cycle (reset proof for next cycle)
  const billDocRef = doc(db, `users/${userId}/recurring_bills`, bill.id);
  await updateDoc(billDocRef, {
    lastPaidDate: todayStr,
    nextDueDate: nextDate,
    status: 'paid',
    receiptImage: null, // Clean slate for the next renewal cycle so fresh proof is asked next time
    lastReceiptImage: receiptImage || null,
    updated_at: serverTimestamp(),
  });

  // 4. Create in-app success notification
  const displayAmount = currencyCode ? formatCurrency(finalAmount, currencyCode) : `₹${finalAmount.toLocaleString('en-IN')}`;
  await createNotification(userId, {
    title: `Payment Recorded: ${bill.title} ✅`,
    message: `Payment of ${displayAmount} marked as paid. Next due date is ${nextDate}.`,
    type: 'reminder',
  });

  invalidateBillsCache(userId);
}

export async function checkBillReminders(userId: string) {
  // Bill reminder push notifications are removed from the app.
  // Bill matching now works silently via the notification listener.
  return;
}

// ==================== BUDGET & GOALS ====================

export interface CategoryBudget {
  category: string;
  amount: number;
}

export async function getCategoryBudgets(userId: string): Promise<Record<string, number>> {
  if (!userId) return {};
  try {
    const snap = await getDocs(collection(db, `users/${userId}/category_budgets`));
    const budgetMap: Record<string, number> = {};
    snap.forEach(doc => {
      const data = doc.data();
      if (data.category) {
        budgetMap[data.category] = Number(data.amount) || 0;
      }
    });
    return budgetMap;
  } catch (err) {
    warn('Error fetching category budgets:', err);
    return {};
  }
}

export async function saveCategoryBudget(userId: string, category: string, amount: number) {
  if (!userId || !category) return;
  const docRef = doc(db, `users/${userId}/category_budgets`, category);
  await setDoc(docRef, {
    category,
    amount: Number(amount) || 0,
    updated_at: serverTimestamp(),
  }, { merge: true });
  syncWidgetWithTransactions(userId).catch(() => { });
}

export async function deleteCategoryBudget(userId: string, category: string) {
  if (!userId || !category) return;
  const docRef = doc(db, `users/${userId}/category_budgets`, category);
  await deleteDoc(docRef);
  syncWidgetWithTransactions(userId).catch(() => { });
}

// ==================== NOTIFICATIONS ====================

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'budget' | 'tip' | 'reminder' | 'system';
  isRead: boolean;
  createdAt: string;
  source?: string;
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function mapNotification(id: string, data: Record<string, any>, fallback?: Record<string, any>): AppNotification {
  const source = { ...data, ...fallback };
  return {
    id,
    title: source.title || '',
    message: source.message || '',
    type: source.type || 'system',
    isRead: !!data.isRead,
    createdAt: timestampToIso(source.createdAt || source.created_at),
    source: source.source,
  };
}

async function loadUserNotifications(userId: string): Promise<AppNotification[]> {
  const historySnapshot = await getDocs(
    query(collection(db, `users/${userId}/notifications`), limit(100))
  );
  const history = new Map(historySnapshot.docs.map(item => [item.id, item.data()]));

  const activeAdminSnapshot = await getDocs(
    query(collection(db, 'admin_notifications'), where('active', '==', true), limit(50))
  );
  const adminNotifications = activeAdminSnapshot.docs.map(item => {
    const adminData = item.data();
    return mapNotification(item.id, history.get(item.id) || {}, adminData);
  });

  const localNotifications = historySnapshot.docs
    .filter(item => item.data().source !== 'admin_notification')
    .map(item => mapNotification(item.id, item.data()));

  return [...adminNotifications, ...localNotifications].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

export async function getUserNotifications(userId: string, forceRefresh = false): Promise<AppNotification[]> {
  if (!userId) return [];

  const now = Date.now();
  const cached = memoryCache.notifications.get(userId);
  if (!forceRefresh && cached && (now - cached.timestamp < NOTIF_CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    const list = await loadUserNotifications(userId);
    memoryCache.notifications.set(userId, { data: list, timestamp: now });
    return list;
  } catch (err) {
    warn('Error fetching notifications:', err);
    return [];
  }
}

export function subscribeToUserNotifications(
  userId: string,
  onChange: (notifications: AppNotification[]) => void,
  onError: (error: Error) => void
) {
  if (!userId) return () => { };

  let history: AppNotification[] = [];
  let admin: AppNotification[] = [];
  let historyError: Error | null = null;
  let adminError: Error | null = null;

  const emit = () => {
    if (historyError || adminError) {
      onError(historyError || adminError || new Error('Unable to load notifications'));
      return;
    }
    const historyById = new Map(history.map(item => [item.id, item]));
    const merged = admin.map(item => ({ ...item, isRead: historyById.get(item.id)?.isRead || false }));
    const local = history.filter(item => item.source !== 'admin_notification');
    onChange([...merged, ...local].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ));
  };

  const unsubscribeHistory = onSnapshot(
    collection(db, `users/${userId}/notifications`),
    snapshot => {
      historyError = null;
      history = snapshot.docs.map(item => mapNotification(item.id, item.data()));
      emit();
    },
    error => { historyError = error; emit(); }
  );
  const unsubscribeAdmin = onSnapshot(
    query(collection(db, 'admin_notifications'), where('active', '==', true)),
    snapshot => {
      adminError = null;
      admin = snapshot.docs.map(item => mapNotification(item.id, item.data()));
      emit();
    },
    error => { adminError = error; emit(); }
  );

  return () => {
    unsubscribeHistory();
    unsubscribeAdmin();
  };
}

export async function createNotification(
  userId: string,
  notification: { title: string; message: string; type?: 'budget' | 'tip' | 'reminder' | 'system'; silentPush?: boolean }
) {
  if (!userId) return;
  const colRef = collection(db, `users/${userId}/notifications`);
  const docRef = await addDoc(colRef, {
    title: notification.title,
    message: notification.message,
    type: notification.type || 'system',
    isRead: false,
    silentPush: notification.silentPush || false,
    created_at: serverTimestamp(),
  });
  invalidateNotificationsCache(userId);
  return docRef.id;
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  if (!userId || !notificationId) return;
  try {
    const docRef = doc(db, `users/${userId}/notifications`, notificationId);
    await setDoc(docRef, { isRead: true }, { merge: true });
    invalidateNotificationsCache(userId);
  } catch (err) {
    warn('Error marking notification as read:', err);
  }
}

export async function markNotificationsAsRead(userId: string) {
  if (!userId) return;
  try {
    let snap;
    try {
      snap = await getDocs(
        query(collection(db, `users/${userId}/notifications`), where('isRead', '==', false), limit(100))
      );
    } catch {
      snap = await getDocs(
        query(collection(db, `users/${userId}/notifications`), limit(100))
      );
    }
    const batch = writeBatch(db);
    let count = 0;
    snap.forEach(d => {
      if (!d.data().isRead) {
        batch.set(doc(db, `users/${userId}/notifications`, d.id), { isRead: true }, { merge: true });
        count++;
      }
    });

    // Also mark active admin notifications as read for this user in their history
    try {
      const adminSnap = await getDocs(
        query(collection(db, 'admin_notifications'), where('active', '==', true), limit(50))
      );
      adminSnap.forEach(d => {
        batch.set(doc(db, `users/${userId}/notifications`, d.id), { isRead: true, source: 'admin_notification' }, { merge: true });
        count++;
      });
    } catch {
      // Intentional: ignore admin query issues if offline
    }

    if (count > 0) {
      await batch.commit();
    }
    invalidateNotificationsCache(userId);
  } catch (err) {
    warn('Error marking notifications as read:', err);
  }
}

export async function deleteNotification(userId: string, notificationId: string) {
  if (!userId || !notificationId) return;
  try {
    await deleteDoc(doc(db, `users/${userId}/notifications`, notificationId));
  } catch (err) {
    warn('Error deleting notification:', err);
  }
}

export async function deleteAllNotifications(userId: string) {
  if (!userId) return;
  try {
    const snap = await getDocs(collection(db, `users/${userId}/notifications`));
    const batch = writeBatch(db);
    snap.forEach(d => {
      batch.delete(doc(db, `users/${userId}/notifications`, d.id));
    });
    await batch.commit();
  } catch (err) {
    warn('Error deleting all notifications:', err);
  }
}

export async function checkAndTriggerBudgetAlert(userId: string) {
  if (!userId) return;
  try {
    const [settings, txs] = await Promise.all([
      getUserSettings(userId),
      getAllTransactions(userId),
    ]);

    const budget = Number(settings?.monthlyBudget) || 0;
    if (budget <= 0) return;

    const currMonth = getLocalMonthString();
    const monthSpend = txs
      .filter(t => t.type === 'debit' && t.date?.startsWith(currMonth))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const curr = settings?.currency === 'INR' ? '₹' : (settings?.currency || '₹');

    const { sendBudgetAlert } = await import('./notifications');
    if (monthSpend >= budget) {
      await sendBudgetAlert(Math.round(monthSpend - budget), curr, monthSpend, budget, undefined, userId);
    } else if (monthSpend >= budget * 0.8) {
      await sendBudgetAlert(0, curr, monthSpend, budget, undefined, userId);
    }
  } catch (err) {
    warn('checkAndTriggerBudgetAlert error:', err);
  }
}

// ==================== MERCHANT RULES ====================

export async function getMerchantRules(userId: string): Promise<Record<string, string>> {
  if (!userId) return {};
  const rulesRef = collection(db, `users/${userId}/merchant_rules`);
  const snapshot = await getDocs(rulesRef);
  const ruleMap: Record<string, string> = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    ruleMap[data.merchant_keyword.toLowerCase()] = data.assigned_category;
  });
  return ruleMap;
}

export async function getMerchantRule(userId: string, keyword: string): Promise<string | null> {
  const rules = await getMerchantRules(userId);
  return rules[keyword.toLowerCase().trim()] || null;
}

export async function saveMerchantRule(
  userId: string,
  merchant_keyword: string,
  assigned_category: string
) {
  if (!userId || !merchant_keyword) return;
  const keyword = merchant_keyword.toLowerCase().trim();

  const rulesRef = collection(db, `users/${userId}/merchant_rules`);
  const q = query(rulesRef, where('merchant_keyword', '==', keyword));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    const docId = snapshot.docs[0].id;
    await setDoc(doc(db, `users/${userId}/merchant_rules`, docId), { assigned_category }, { merge: true });
  } else {
    await addDoc(rulesRef, {
      merchant_keyword: keyword,
      assigned_category: assigned_category,
    });
  }
}

// ==================== USER SETTINGS ====================

export interface UserSettings {
  language: string; // 'English' | 'Hindi' | 'Hinglish'
  currency: string; // '$' | '₹'
  aiLanguage?: string; // 'Hinglish' | 'Hindi' | 'English'
  monthlyBudget?: number;
  dailyLimit?: number;
  voiceLocale?: 'en-IN' | 'hi-IN';
  voicePermissionOnStartup?: boolean;
  enableWidget?: boolean;
  isPremium?: boolean;
  premiumPlan?: 'monthly' | '3_months' | '6_months' | 'yearly' | 'lifetime' | string;
  premiumActivatedAt?: string;
  upiId?: string;
}

export interface StartingBalanceProfile {
  startingBalance: number;
  hasSetStartingBalance: boolean;
}

export async function getStartingBalanceProfile(userId: string): Promise<StartingBalanceProfile> {
  if (!userId) return { startingBalance: 0, hasSetStartingBalance: true };
  const snapshot = await getDoc(doc(db, 'users', userId));
  if (!snapshot.exists()) return { startingBalance: 0, hasSetStartingBalance: true };

  const data = snapshot.data();
  return {
    startingBalance: Number(data.starting_balance) || 0,
    // Profiles created before this feature are considered already onboarded.
    hasSetStartingBalance: data.has_set_starting_balance !== false,
  };
}

export async function saveStartingBalance(userId: string, startingBalance: number) {
  if (!userId) return;
  await setDoc(doc(db, 'users', userId), {
    starting_balance: Number.isFinite(startingBalance) ? startingBalance : 0,
    has_set_starting_balance: true,
  }, { merge: true });
}

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  if (!userId) return null;
  try {
    const docRef = doc(db, `users/${userId}/settings/preferences`);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data() as UserSettings;
      if (data.currency === 'INR') {
        data.currency = '₹';
      }
      return data;
    }

    // Check legacy settings on user document root if any
    const userDocRef = doc(db, 'users', userId);
    const userSnapshot = await getDoc(userDocRef);
    if (userSnapshot.exists()) {
      const userData = userSnapshot.data();
      if (userData?.settings && (userData.settings.language || userData.settings.currency)) {
        const legacySettings: UserSettings = {
          language: userData.settings.language || 'English',
          currency: userData.settings.currency === 'INR' ? '₹' : (userData.settings.currency || '₹'),
          monthlyBudget: userData.settings.monthlyBudget,
          isPremium: userData.is_premium || userData.settings.isPremium || false,
          premiumPlan: userData.premium_plan || userData.settings.premiumPlan,
        };
        // Omit premium fields from client write to avoid permission-denied in firestore.rules
        const { isPremium: _p, premiumPlan: _pp, ...safeLegacy } = legacySettings;
        setDoc(docRef, safeLegacy, { merge: true }).catch(() => { });
        return legacySettings;
      }
    }
  } catch (err) {
    warn('Could not load user settings; using defaults:', err);
  }

  return null;
}

export async function saveUserSettings(userId: string, settings: UserSettings) {
  if (!userId) return;
  // Note: isPremium, premiumPlan, and premiumActivatedAt are server-managed
  // and deliberately omitted from client writes to comply with firestore.rules
  const normalized: UserSettings = {
    language: settings.language || 'English',
    currency: settings.currency === 'INR' ? '₹' : (settings.currency || '₹'),
    ...(settings.aiLanguage ? { aiLanguage: settings.aiLanguage } : {}),
    ...(settings.monthlyBudget !== undefined ? { monthlyBudget: settings.monthlyBudget } : {}),
    ...(settings.dailyLimit !== undefined ? { dailyLimit: settings.dailyLimit } : {}),
    ...(settings.voiceLocale ? { voiceLocale: settings.voiceLocale } : {}),
    ...(settings.voicePermissionOnStartup !== undefined ? { voicePermissionOnStartup: settings.voicePermissionOnStartup } : {}),
    ...(settings.enableWidget !== undefined ? { enableWidget: settings.enableWidget } : {}),
    ...(settings.upiId !== undefined ? { upiId: settings.upiId } : {}),
  };
  const docRef = doc(db, `users/${userId}/settings/preferences`);
  await setDoc(docRef, normalized, { merge: true });
  syncWidgetWithTransactions(userId).catch(() => { });
}

export async function setPremiumStatus(
  userId: string,
  isPremium: boolean,
  plan: string = 'lifetime'
) {
  if (!userId) return;
  // Client writes to is_premium/isPremium are blocked by firestore.rules.
  // Premium status is managed by server edge functions (verify-subscription, redeem-coupon, rtdn-webhook).
  warn('[database] setPremiumStatus called on client. Premium status is server-managed.');
}

export async function recordPremiumPayment(
  userId: string,
  paymentData: {
    plan: string;
    amount: number;
    utr?: string;
    paymentMode: string;
    couponCode?: string;
    discount?: number;
    userEmail?: string;
    userName?: string;
  }
) {
  if (!userId) return null;
  const now = new Date().toISOString();

  // Clean data so Firestore never receives undefined properties
  const cleanData: Record<string, any> = {
    plan: paymentData.plan || 'monthly',
    amount: typeof paymentData.amount === 'number' ? paymentData.amount : 0,
    paymentMode: paymentData.paymentMode || 'Google_Play',
    discount: typeof paymentData.discount === 'number' ? paymentData.discount : 0,
    userEmail: paymentData.userEmail || 'unknown',
    userName: paymentData.userName || 'Rupeo User',
    status: 'success',
    timestamp: now,
    created_at: serverTimestamp(),
  };

  if (paymentData.utr) {
    cleanData.utr = paymentData.utr;
  }
  if (paymentData.couponCode) {
    cleanData.couponCode = paymentData.couponCode;
  }

  // 1. Save payment record in user's subcollection
  const userPayRef = collection(db, `users/${userId}/premium_payments`);
  const docRes = await addDoc(userPayRef, cleanData);

  // 2. Save payment record in global 'payments' collection for Admin Panel
  try {
    const globalPayRef = collection(db, 'payments');
    await addDoc(globalPayRef, {
      id: docRes.id,
      userId,
      ...cleanData,
    });
  } catch (err) {
    warn('Could not record global payment:', err);
  }

  // 3. Increment coupon usage if used
  if (paymentData.couponCode) {
    redeemCoupon(paymentData.couponCode, userId).catch(() => { });
  }

  return docRes.id;
}

/**
 * Redeem a 100% free / promo coupon via server Edge Function.
 * The server verifies the Firebase ID token and writes verified premium status to Firestore.
 */
export async function redeemFreeCouponOnServer(
  code: string,
  plan?: string,
): Promise<{ success: boolean; plan: string; message?: string }> {
  const cleanCode = code.trim().toUpperCase();
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY;
  const endpoint = supabaseUrl
    ? `${supabaseUrl}/functions/v1/redeem-coupon`
    : 'https://us-central1-paisewaise-e545e.cloudfunctions.net/redeemCoupon';

  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('User is not authenticated');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
  };
  if (supabaseAnonKey) {
    headers['apikey'] = supabaseAnonKey;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: cleanCode, plan }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to redeem coupon (HTTP ${res.status})`);
  }

  return data;
}

// ==================== COUPON SYSTEM ====================

export interface CouponItem {
  id?: string;
  code: string;
  codeUpper?: string;
  type?: 'flat' | 'percent' | 'free';
  discountPercent?: number; // e.g. 50 for 50%
  discountAmount?: number; // e.g. 100 for ₹100 flat off
  isFree?: boolean; // 100% free upgrade to Pro
  plan?: 'all' | 'yearly' | 'quarterly' | 'monthly' | 'lifetime' | string;
  maxUses?: number;
  usedCount: number;
  isActive: boolean;
  createdAt?: string;
  expiresAt?: string;
  redeemedUsers?: string[]; // Array of user IDs who have redeemed this code
}

/**
 * Normalizes raw Firestore coupon document into a typed CouponItem.
 * Robustly parses flat amount, percentage, free flag, and applicable plan.
 */
export function parseCouponDoc(id: string, d: any, fallbackCode: string): CouponItem {
  const code = String(d.code || d.coupon_code || fallbackCode).trim().toUpperCase();
  const codeUpper = String(d.codeUpper || code).trim().toUpperCase();
  const type = d.couponType || d.type;

  // 1. Extract flat discount amount (₹)
  let discountAmount: number | undefined = undefined;
  if (d.discountAmount !== undefined && !isNaN(Number(d.discountAmount)) && Number(d.discountAmount) > 0) {
    discountAmount = Number(d.discountAmount);
  } else if (d.discount_amount !== undefined && !isNaN(Number(d.discount_amount)) && Number(d.discount_amount) > 0) {
    discountAmount = Number(d.discount_amount);
  } else if (d.flatDiscount !== undefined && !isNaN(Number(d.flatDiscount)) && Number(d.flatDiscount) > 0) {
    discountAmount = Number(d.flatDiscount);
  } else if (d.flat_discount !== undefined && !isNaN(Number(d.flat_discount)) && Number(d.flat_discount) > 0) {
    discountAmount = Number(d.flat_discount);
  } else if (d.flat !== undefined && !isNaN(Number(d.flat)) && Number(d.flat) > 0) {
    discountAmount = Number(d.flat);
  } else if (type === 'flat' && d.amount !== undefined && !isNaN(Number(d.amount)) && Number(d.amount) > 0) {
    discountAmount = Number(d.amount);
  } else if (type === 'flat' && d.discount !== undefined && !isNaN(Number(d.discount)) && Number(d.discount) > 0) {
    discountAmount = Number(d.discount);
  }

  // 2. Extract percentage discount (%)
  let discountPercent: number | undefined = undefined;
  if (!discountAmount) {
    if (d.discountPercent !== undefined && !isNaN(Number(d.discountPercent)) && Number(d.discountPercent) > 0) {
      discountPercent = Number(d.discountPercent);
    } else if (d.discount_percent !== undefined && !isNaN(Number(d.discount_percent)) && Number(d.discount_percent) > 0) {
      discountPercent = Number(d.discount_percent);
    } else if (d.discountPercentage !== undefined && !isNaN(Number(d.discountPercentage)) && Number(d.discountPercentage) > 0) {
      discountPercent = Number(d.discountPercentage);
    } else if (d.percentage !== undefined && !isNaN(Number(d.percentage)) && Number(d.percentage) > 0) {
      discountPercent = Number(d.percentage);
    } else if (type === 'percent' && d.discount !== undefined && !isNaN(Number(d.discount)) && Number(d.discount) > 0) {
      discountPercent = Number(d.discount);
    }
  }

  // 3. Fallback if only d.discount exists
  if (!discountAmount && !discountPercent && d.discount !== undefined && !isNaN(Number(d.discount))) {
    const rawDisc = Number(d.discount);
    if (rawDisc > 0) {
      if (type === 'flat' || rawDisc > 100) {
        discountAmount = rawDisc;
      } else {
        discountPercent = rawDisc;
      }
    }
  }

  // 4. Determine isFree
  // Strictly false if discountAmount exists, or if a partial discountPercent (< 100) exists
  const isFree = !discountAmount && (
    d.isFree === true ||
    type === 'free' ||
    discountPercent === 100 ||
    (!discountPercent && !discountAmount)
  );

  return {
    id,
    code,
    codeUpper,
    type: isFree ? 'free' : discountAmount ? 'flat' : 'percent',
    discountAmount: isFree ? undefined : discountAmount,
    discountPercent: isFree ? (discountPercent === 100 ? 100 : undefined) : discountPercent,
    isFree: Boolean(isFree),
    plan: d.plan || 'all',
    maxUses: d.maxUses || d.max_uses ? Number(d.maxUses || d.max_uses) : undefined,
    usedCount: Number(d.usedCount || d.used_count || 0),
    isActive: d.isActive !== false && d.is_active !== false && d.active !== false && d.status !== 'inactive',
    createdAt: d.createdAt || d.created_at,
    expiresAt: d.expiresAt || d.expires_at,
    redeemedUsers: Array.isArray(d.redeemedUsers) ? d.redeemedUsers : [],
  };
}

export async function validateCoupon(
  code: string,
  currentAmount: number = 0,
  userId?: string,
  planId?: string
): Promise<{
  valid: boolean;
  discount: number;
  finalAmount: number;
  coupon?: CouponItem;
  error?: string;
}> {
  if (!code || !code.trim()) {
    return { valid: false, discount: 0, finalAmount: currentAmount, error: 'Please enter a coupon code' };
  }

  const cleanCode = code.trim().toUpperCase();
  let matchedCoupon: CouponItem | null = null;

  try {
    const couponsRef = collection(db, 'coupons');

    // 1. Indexed lookup by normalized codeUpper (O(1), case-insensitive)
    const qUpper = query(couponsRef, where('codeUpper', '==', cleanCode), limit(1));
    const snapUpper = await getDocs(qUpper);
    if (!snapUpper.empty) {
      matchedCoupon = parseCouponDoc(snapUpper.docs[0].id, snapUpper.docs[0].data(), cleanCode);
    }

    // 2. Direct exact code query fallback (for existing coupons with code stored in original casing)
    if (!matchedCoupon) {
      const qCode = query(couponsRef, where('code', '==', cleanCode), limit(1));
      const snapCode = await getDocs(qCode);
      if (!snapCode.empty) {
        matchedCoupon = parseCouponDoc(snapCode.docs[0].id, snapCode.docs[0].data(), cleanCode);
      }
    }

    // 3. Direct document ID lookup (for coupons where doc ID is the code itself)
    if (!matchedCoupon) {
      const directDoc = await getDoc(doc(db, 'coupons', cleanCode));
      if (directDoc.exists()) {
        matchedCoupon = parseCouponDoc(directDoc.id, directDoc.data(), cleanCode);
      }
    }

    // 4. Temporary legacy collection scan fallback
    // TEMPORARY FALLBACK: Set to false once scripts/backfill-coupon-codeupper.js is run
    // in production. When false, avoids full collection scans and public coupon dumps.
    const ENABLE_LEGACY_COUPON_COLLECTION_SCAN = true;
    if (!matchedCoupon && ENABLE_LEGACY_COUPON_COLLECTION_SCAN) {
      const snapAll = await getDocs(couponsRef);
      for (const docItem of snapAll.docs) {
        const d = docItem.data();
        const docCode = String(d.code || d.coupon_code || docItem.id).trim().toUpperCase();
        if (docCode === cleanCode) {
          matchedCoupon = parseCouponDoc(docItem.id, d, cleanCode);
          break;
        }
      }
    }
  } catch (firestoreErr) {
    warn('Firestore coupon fetch error:', firestoreErr);
    return { valid: false, discount: 0, finalAmount: currentAmount, error: 'Could not connect to verify coupon. Please check network.' };
  }

  // If coupon does not exist in Firestore
  if (!matchedCoupon) {
    return {
      valid: false,
      discount: 0,
      finalAmount: currentAmount,
      error: `Coupon "${code}" not found. Please verify the code.`,
    };
  }

  // Check Active Status
  if (!matchedCoupon.isActive) {
    return { valid: false, discount: 0, finalAmount: currentAmount, error: 'This coupon is currently inactive.' };
  }

  // Check Plan match (if coupon is restricted to a specific plan)
  if (matchedCoupon.plan && matchedCoupon.plan !== 'all' && planId) {
    const couponPlan = matchedCoupon.plan.toLowerCase();
    const currentPlan = planId.toLowerCase();
    if (couponPlan !== currentPlan && !(couponPlan === 'yearly' && currentPlan === 'annual')) {
      return {
        valid: false,
        discount: 0,
        finalAmount: currentAmount,
        error: `Yeh coupon sirf "${matchedCoupon.plan.toUpperCase()}" plan ke liye valid hai.`,
      };
    }
  }

  // Check if this specific user has already used this coupon
  if (userId && matchedCoupon.redeemedUsers && matchedCoupon.redeemedUsers.includes(userId)) {
    return {
      valid: false,
      discount: 0,
      finalAmount: currentAmount,
      error: 'Aap is coupon ko pehle hi redeem kar chuke hain.',
    };
  }

  // Check Expiration Date if set
  if (matchedCoupon.expiresAt) {
    const expiryTime = new Date(matchedCoupon.expiresAt).getTime();
    if (!isNaN(expiryTime) && Date.now() > expiryTime) {
      return { valid: false, discount: 0, finalAmount: currentAmount, error: 'Yeh coupon expire ho chuka hai.' };
    }
  }

  // Check Max Uses
  if (matchedCoupon.maxUses && matchedCoupon.usedCount >= matchedCoupon.maxUses) {
    return { valid: false, discount: 0, finalAmount: currentAmount, error: 'Yeh coupon apni maximum usage limit tak pahunch gaya hai.' };
  }

  // Calculate discount amount
  let discount = 0;
  if (matchedCoupon.isFree) {
    discount = currentAmount;
  } else if (matchedCoupon.discountAmount && matchedCoupon.discountAmount > 0) {
    discount = Math.min(matchedCoupon.discountAmount, currentAmount);
  } else if (matchedCoupon.discountPercent && matchedCoupon.discountPercent > 0) {
    discount = Math.round((currentAmount * matchedCoupon.discountPercent) / 100);
  }

  const finalAmount = Math.max(0, currentAmount - discount);

  return {
    valid: true,
    discount,
    finalAmount,
    coupon: matchedCoupon,
  };
}

export async function redeemCoupon(code: string, userId: string) {
  if (!code || !db) return;
  const cleanCode = code.trim().toUpperCase();
  try {
    const couponsRef = collection(db, 'coupons');
    let docId: string | null = null;

    // 1. Check indexed codeUpper
    const qUpper = query(couponsRef, where('codeUpper', '==', cleanCode), limit(1));
    const snapUpper = await getDocs(qUpper);
    if (!snapUpper.empty) {
      docId = snapUpper.docs[0].id;
    } else {
      // 2. Check code field
      const qCode = query(couponsRef, where('code', '==', cleanCode), limit(1));
      const snapCode = await getDocs(qCode);
      if (!snapCode.empty) {
        docId = snapCode.docs[0].id;
      } else {
        // 3. Check direct doc ID
        const directSnap = await getDoc(doc(db, 'coupons', cleanCode));
        if (directSnap.exists()) {
          docId = directSnap.id;
        }
      }
    }

    if (docId) {
      await updateDoc(doc(db, 'coupons', docId), {
        usedCount: increment(1),
        used_count: increment(1),
        ...(userId ? { redeemedUsers: arrayUnion(userId) } : {}),
      });
    }
  } catch (err) {
    warn('Redeem coupon record error:', err);
  }
}

// ==================== ADMIN QUERIES ====================

export async function getAllCoupons(): Promise<CouponItem[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'coupons'));
    return snap.docs.map(d => parseCouponDoc(d.id, d.data(), d.id));
  } catch (err) {
    warn('getAllCoupons error:', err);
    return [];
  }
}

export function listenToCoupons(callback: (coupons: CouponItem[]) => void): () => void {
  if (!db) return () => { };
  return onSnapshot(
    collection(db, 'coupons'),
    (snap) => {
      const list = snap.docs.map(d => parseCouponDoc(d.id, d.data(), d.id));
      callback(list);
    },
    (err) => {
      warn('listenToCoupons error:', err);
    }
  );
}

export async function createCoupon(coupon: Omit<CouponItem, 'id' | 'usedCount'>) {
  if (!db) throw new Error('Database not initialized');
  const cleanCode = coupon.code.trim().toUpperCase();
  const clean: any = {
    code: cleanCode,
    codeUpper: cleanCode,
    plan: coupon.plan || 'all',
    usedCount: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    redeemedUsers: [],
  };

  if (coupon.isFree) {
    clean.isFree = true;
    clean.type = 'free';
  } else if (coupon.discountAmount !== undefined && !isNaN(Number(coupon.discountAmount)) && Number(coupon.discountAmount) > 0) {
    clean.isFree = false;
    clean.type = 'flat';
    clean.discountAmount = Number(coupon.discountAmount);
  } else if (coupon.discountPercent !== undefined && !isNaN(Number(coupon.discountPercent)) && Number(coupon.discountPercent) > 0) {
    clean.isFree = false;
    clean.type = 'percent';
    clean.discountPercent = Number(coupon.discountPercent);
  } else {
    clean.isFree = true;
    clean.type = 'free';
  }

  if (coupon.maxUses !== undefined && !isNaN(Number(coupon.maxUses)) && Number(coupon.maxUses) > 0) {
    clean.maxUses = Number(coupon.maxUses);
  }
  if (coupon.expiresAt) {
    clean.expiresAt = coupon.expiresAt;
  }

  const docRef = await addDoc(collection(db, 'coupons'), clean);
  return docRef.id;
}

export async function toggleCouponStatus(couponId: string, isActive: boolean) {
  if (!db) return;
  await updateDoc(doc(db, 'coupons', couponId), { isActive });
}

export async function deleteCoupon(couponId: string) {
  if (!db) return;
  await deleteDoc(doc(db, 'coupons', couponId));
}

export interface PaidUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  activatedAt: string;
}

export interface PaymentRecord {
  id: string;
  timestamp?: string;
  [key: string]: unknown;
}

export async function getAllPaidUsers(): Promise<PaidUser[]> {
  try {
    const q = query(collection(db, 'users'), where('is_premium', '==', true));
    const snap = await getDocs(q);
    const paidUsers: PaidUser[] = [];
    snap.forEach(d => {
      const data = d.data();
      paidUsers.push({
        id: d.id,
        name: data.name || data.displayName || 'Rupeo User',
        email: data.email || 'No email',
        phone: data.phone || '',
        plan: data.premium_plan || 'lifetime',
        activatedAt: data.premium_activated_at || data.created_at || '',
      });
    });
    return paidUsers;
  } catch (e) {
    warn('Error fetching paid users:', e);
    return [];
  }
}

export async function getAllPayments(): Promise<PaymentRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'payments'));
    const payments: PaymentRecord[] = [];
    snap.forEach(d => {
      payments.push({ id: d.id, ...d.data() });
    });
    return payments.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  } catch (e) {
    warn('Error fetching payments:', e);
    return [];
  }
}

// ==================== SUPPORT MESSAGES ====================

export interface SupportMessage {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  topic?: string;
  message: string;
  source: 'maintenance' | 'settings';
  userId?: string;
  status?: 'unread' | 'read' | 'resolved' | 'open' | 'in_progress' | 'closed';
  adminReply?: string;
  repliedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function submitSupportMessage(
  data: Omit<SupportMessage, 'id' | 'createdAt' | 'status'>
): Promise<string> {
  if (!db) throw new Error('Database not initialized');
  const now = new Date().toISOString();
  const docRef = await addDoc(collection(db, 'support_messages'), {
    ...data,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export function subscribeUserSupportMessages(
  userId: string,
  callback: (messages: SupportMessage[]) => void
): () => void {
  if (!db || !userId) {
    callback([]);
    return () => { };
  }

  try {
    const q = query(
      collection(db, 'support_messages'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(
      q,
      (snap) => {
        const messages: SupportMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SupportMessage, 'id'>),
        }));
        callback(messages);
      },
      (err) => {
        warn('subscribeUserSupportMessages error with orderBy, falling back:', err);
        // Fallback query without orderBy in case compound index is pending
        const fallbackQ = query(
          collection(db, 'support_messages'),
          where('userId', '==', userId)
        );
        return onSnapshot(
          fallbackQ,
          (snap) => {
            const messages: SupportMessage[] = snap.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<SupportMessage, 'id'>),
              }))
              .sort(
                (a, b) =>
                  new Date(b.createdAt || 0).getTime() -
                  new Date(a.createdAt || 0).getTime()
              );
            callback(messages);
          },
          (fallbackErr) => {
            error('subscribeUserSupportMessages fallback failed:', fallbackErr);
            callback([]);
          }
        );
      }
    );
  } catch (err) {
    error('Failed to subscribe to user support messages:', err);
    callback([]);
    return () => { };
  }
}


