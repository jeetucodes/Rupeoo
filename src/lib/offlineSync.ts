import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Firestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { AppState } from 'react-native';
import { warn } from '@/lib/logger';
import { safeJsonParse } from './safeStorage';
import { toRemote, fromRemote } from './dataMinimization';
import { isCloudSyncEnabled } from './cloudSync';

export interface SyncAction {
  id: string;
  type: 'ADD_TRANSACTION' | 'UPDATE_TRANSACTION' | 'DELETE_TRANSACTION' | 'ADD_CATEGORY' | 'DELETE_CATEGORY';
  targetId: string;
  payload?: any;
  timestamp: number;
  retryCount: number;
}

const getTxsKey = (userId: string) => `@rupeo_offline_txs_${userId}`;
const getCategoriesKey = (userId: string) => `@rupeo_offline_categories_${userId}`;
const getQueueKey = (userId: string) => `@rupeo_sync_queue_${userId}`;
const getLastSyncKey = (userId: string) => `@rupeo_last_sync_${userId}`;
const getDeletedTxsKey = (userId: string) => `@rupeo_deleted_txs_${userId}`;

const deletedTxIdCache = new Map<string, Set<string>>();

/**
 * Record a deleted transaction ID tombstone so sync and cloud pull never resurrect it.
 */
export async function recordDeletedTxId(userId: string, txId: string): Promise<void> {
  if (!userId || !txId) return;
  const idStr = String(txId);
  let idSet = deletedTxIdCache.get(userId);
  if (!idSet) {
    idSet = new Set<string>();
    deletedTxIdCache.set(userId, idSet);
  }
  idSet.add(idStr);

  try {
    const raw = await AsyncStorage.getItem(getDeletedTxsKey(userId));
    const stored: string[] = raw ? safeJsonParse<string[]>(raw, [], getDeletedTxsKey(userId), (v) => Array.isArray(v)) : [];
    if (!stored.includes(idStr)) {
      stored.push(idStr);
      // Keep last 1000 tombstones to prevent unlimited memory/storage growth
      const capped = stored.slice(-1000);
      await AsyncStorage.setItem(getDeletedTxsKey(userId), JSON.stringify(capped));
    }
  } catch (err) {
    warn('Failed to record deleted tx id:', err);
  }
}

/**
 * Get all deleted transaction ID tombstones for a user.
 */
export async function getDeletedTxIds(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  const cached = deletedTxIdCache.get(userId);
  if (cached && cached.size > 0) return cached;
  try {
    const raw = await AsyncStorage.getItem(getDeletedTxsKey(userId));
    const stored: string[] = raw ? safeJsonParse<string[]>(raw, [], getDeletedTxsKey(userId), (v) => Array.isArray(v)) : [];
    const set = new Set(stored.map(String));
    deletedTxIdCache.set(userId, set);
    return set;
  } catch {
    return new Set();
  }
}

let isSyncInProgress = false;

// Pending saves cache & debounce
const pendingSaveData = new Map<string, any[]>();
const pendingSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Deduplicate in-flight sync promises and throttle remote syncs
const lastRemoteSyncMap = new Map<string, number>();
const inFlightSyncPromises = new Map<string, Promise<any[]>>();
const REMOTE_SYNC_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Flush any debounced transaction saves immediately to persistent storage.
 */
export async function flushPendingOfflineTransactionSaves(userId?: string): Promise<void> {
  const usersToFlush = userId ? [userId] : Array.from(pendingSaveData.keys());
  for (const uid of usersToFlush) {
    const timer = pendingSaveTimers.get(uid);
    if (timer) {
      clearTimeout(timer);
      pendingSaveTimers.delete(uid);
    }
    const data = pendingSaveData.get(uid);
    if (data) {
      try {
        await AsyncStorage.setItem(getTxsKey(uid), JSON.stringify(data));
      } catch (err) {
        warn('Failed to flush offline transactions:', err);
      }
    }
  }
}

// Flush immediately when app goes to background or inactive
if (typeof AppState !== 'undefined' && AppState.addEventListener) {
  AppState.addEventListener('change', (nextState) => {
    if (nextState === 'background' || nextState === 'inactive') {
      flushPendingOfflineTransactionSaves();
    }
  });
}

/**
 * Check if the device has actual internet access by pinging Google's generate_204 endpoint.
 * Returns true if online, false if offline/timeout.
 */
export async function checkIsOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const response = await fetch('https://clients3.google.com/generate_204', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.status === 204 || response.status === 200 || response.type === 'opaque' || response.ok;
  } catch {
    return false;
  }
}

/**
 * Returns cached transactions synchronously from memory if available (0ms latency).
 */
export function getCachedOfflineTransactionsSync(userId: string): any[] | null {
  if (!userId) return null;
  if (pendingSaveData.has(userId)) {
    return pendingSaveData.get(userId) || null;
  }
  return null;
}

/**
 * Get all cached transactions from local storage for a user.
 * Returns in-memory pending save data immediately if available (0ms latency).
 */
export async function getOfflineTransactions(userId: string): Promise<any[]> {
  if (!userId) return [];
  if (pendingSaveData.has(userId)) {
    return pendingSaveData.get(userId) || [];
  }
  try {
    const txKey = getTxsKey(userId);
    const raw = await AsyncStorage.getItem(txKey);
    if (!raw) return [];
    const result = safeJsonParse<any[]>(raw, [], txKey, (v) => Array.isArray(v));
    pendingSaveData.set(userId, result);
    return result;
  } catch (err) {
    warn('Failed to load offline transactions:', err);
    return [];
  }
}

/**
 * Save all transactions to local storage cache for instant offline access.
 * Writes to in-memory cache immediately and debounces AsyncStorage writes by 400ms
 * to prevent heavy JSON serialization stalls on eMMC 5.1 storage.
 */
export async function saveOfflineTransactions(
  userId: string,
  txs: any[],
  immediate = false
): Promise<void> {
  if (!userId || !Array.isArray(txs)) return;

  // Sanitize any massive base64 images so AsyncStorage row limits are never exceeded
  const sanitized = txs.map((tx) => {
    if (
      tx?.receipt_image &&
      typeof tx.receipt_image === 'string' &&
      tx.receipt_image.length > 50000 &&
      tx.receipt_image.startsWith('data:')
    ) {
      return { ...tx, receipt_image: '[IMAGE_ATTACHED]' };
    }
    return tx;
  });

  // Always update in-memory cache immediately for 0ms reads
  pendingSaveData.set(userId, sanitized);

  const existingTimer = pendingSaveTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    pendingSaveTimers.delete(userId);
  }

  if (immediate) {
    try {
      await AsyncStorage.setItem(getTxsKey(userId), JSON.stringify(sanitized));
    } catch (err) {
      warn('Failed to save offline transactions:', err);
    }
    return;
  }

  // Debounce writes by 400ms
  const timer = setTimeout(async () => {
    pendingSaveTimers.delete(userId);
    try {
      await AsyncStorage.setItem(getTxsKey(userId), JSON.stringify(sanitized));
    } catch (err) {
      warn('Failed to save offline transactions:', err);
    }
  }, 400);
  pendingSaveTimers.set(userId, timer);
}

/**
 * Get offline categories for a user.
 */
export async function getOfflineCategories(userId: string): Promise<any[] | null> {
  if (!userId) return null;
  try {
    const catKey = getCategoriesKey(userId);
    const raw = await AsyncStorage.getItem(catKey);
    if (!raw) return null;
    return safeJsonParse<any[] | null>(raw, null, catKey, (v) => Array.isArray(v));
  } catch {
    return null;
  }
}

/**
 * Save categories to local storage cache.
 */
export async function saveOfflineCategories(userId: string, categories: any[]): Promise<void> {
  if (!userId || !Array.isArray(categories)) return;
  try {
    await AsyncStorage.setItem(getCategoriesKey(userId), JSON.stringify(categories));
  } catch (err) {
    warn('Failed to save offline categories:', err);
  }
}

/**
 * Enqueue a sync action into local queue.
 * Always writes immediately to AsyncStorage to ensure offline actions are never lost on process death.
 */
export async function enqueueSyncAction(
  userId: string,
  action: Omit<SyncAction, 'id' | 'timestamp' | 'retryCount'>
): Promise<void> {
  if (!userId) return;
  try {
    const queue = await getSyncQueue(userId);
    const newAction: SyncAction = {
      ...action,
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      retryCount: 0,
    };
    const updatedQueue = [...queue, newAction];
    await AsyncStorage.setItem(getQueueKey(userId), JSON.stringify(updatedQueue));
  } catch (err) {
    warn('Failed to enqueue sync action:', err);
  }
}

/**
 * Get the current sync queue.
 */
export async function getSyncQueue(userId: string): Promise<SyncAction[]> {
  if (!userId) return [];
  try {
    const queueKey = getQueueKey(userId);
    const raw = await AsyncStorage.getItem(queueKey);
    if (!raw) return [];
    return safeJsonParse<SyncAction[]>(raw, [], queueKey, (v) => Array.isArray(v));
  } catch {
    return [];
  }
}

/**
 * Remove an action from the queue.
 */
export async function removeSyncAction(userId: string, actionId: string): Promise<void> {
  if (!userId || !actionId) return;
  try {
    const queue = await getSyncQueue(userId);
    const updated = queue.filter((item) => item.id !== actionId);
    await AsyncStorage.setItem(getQueueKey(userId), JSON.stringify(updated));
  } catch (err) {
    warn('Failed to remove sync action:', err);
  }
}

/**
 * Process and flush the offline sync queue to Firebase Firestore.
 */
export async function flushSyncQueue(
  userId: string,
  db: Firestore
): Promise<{ success: number; failed: number }> {
  if (!userId || isSyncInProgress) return { success: 0, failed: 0 };

  // Enforce Cloud Sync setting: OFF stops all uploads; pending queue is paused, not deleted.
  const syncEnabled = await isCloudSyncEnabled(userId);
  if (!syncEnabled) {
    return { success: 0, failed: 0 };
  }

  const isOnline = await checkIsOnline();
  if (!isOnline) {
    return { success: 0, failed: 0 };
  }

  isSyncInProgress = true;
  let success = 0;
  let failed = 0;

  try {
    const queue = await getSyncQueue(userId);
    if (queue.length === 0) {
      isSyncInProgress = false;
      return { success: 0, failed: 0 };
    }

    const remainingQueue: SyncAction[] = [];
    const localTxs = await getOfflineTransactions(userId);
    let localUpdated = false;

    for (const item of queue) {
      try {
        switch (item.type) {
          case 'ADD_TRANSACTION': {
            const txDocRef = doc(db, `users/${userId}/transactions`, item.targetId);
            const remotePayload = toRemote({ ...item.payload, id: item.targetId });
            await setDoc(txDocRef, remotePayload);
            const localItem = localTxs.find((t) => t.id === item.targetId);
            if (localItem) {
              localItem.syncStatus = 'synced';
              localItem.syncedAt = Date.now();
              localUpdated = true;
            }
            success++;
            break;
          }
          case 'UPDATE_TRANSACTION': {
            const txDocRef = doc(db, `users/${userId}/transactions`, item.targetId);
            const remotePayload = toRemote({ ...item.payload, id: item.targetId });
            await setDoc(txDocRef, remotePayload, { merge: true });
            const localItem = localTxs.find((t) => t.id === item.targetId);
            if (localItem) {
              localItem.syncStatus = 'synced';
              localItem.syncedAt = Date.now();
              localUpdated = true;
            }
            success++;
            break;
          }
          case 'DELETE_TRANSACTION': {
            const txDocRef = doc(db, `users/${userId}/transactions`, item.targetId);
            await deleteDoc(txDocRef);
            success++;
            break;
          }
          case 'ADD_CATEGORY': {
            const catDocRef = doc(db, `users/${userId}/categories`, item.targetId);
            await setDoc(catDocRef, item.payload);
            success++;
            break;
          }
          case 'DELETE_CATEGORY': {
            const catDocRef = doc(db, `users/${userId}/categories`, item.targetId);
            await deleteDoc(catDocRef);
            success++;
            break;
          }
        }
      } catch (itemErr: any) {
        warn(`Sync item failed (${item.type} on ${item.targetId}):`, itemErr);
        const errMsg = String(itemErr?.message || '').toLowerCase();
        const errCode = String(itemErr?.code || '').toLowerCase();
        const isNetworkErr =
          errMsg.includes('network') ||
          errMsg.includes('offline') ||
          errMsg.includes('unavailable') ||
          errMsg.includes('failed to get document') ||
          errMsg.includes('timeout') ||
          errCode.includes('unavailable');

        if (isNetworkErr) {
          // Never drop a transaction due to temporary network failure
          remainingQueue.push(item);
        } else if (item.retryCount < 5) {
          remainingQueue.push({
            ...item,
            retryCount: item.retryCount + 1,
          });
        }
        failed++;
      }
    }

    if (localUpdated && localTxs.length > 0) {
      await saveOfflineTransactions(userId, localTxs, true);
    }

    await AsyncStorage.setItem(getQueueKey(userId), JSON.stringify(remainingQueue));
    await AsyncStorage.setItem(getLastSyncKey(userId), Date.now().toString());
  } catch (err) {
    warn('Sync queue flush error:', err);
  } finally {
    isSyncInProgress = false;
  }

  return { success, failed };
}

/**
 * Fetch remote data from Firestore, reconcile with local pending items, and save locally.
 * Throttled to once every 5 minutes unless force is true.
 * In-flight requests are deduplicated to avoid duplicate Firestore queries.
 */
export async function syncRemoteTransactions(
  userId: string,
  db: Firestore,
  force = false
): Promise<any[]> {
  if (!userId) return [];

  // Enforce Cloud Sync setting: OFF stops remote sync; operates 100% on-device
  const syncEnabled = await isCloudSyncEnabled(userId);
  if (!syncEnabled) {
    return await getOfflineTransactions(userId);
  }

  // Deduplicate in-flight sync requests for the same user
  const inFlight = inFlightSyncPromises.get(userId);
  if (inFlight) {
    return inFlight;
  }

  const now = Date.now();
  const lastSync = lastRemoteSyncMap.get(userId) || 0;
  if (!force && now - lastSync < REMOTE_SYNC_THROTTLE_MS) {
    return await getOfflineTransactions(userId);
  }

  const syncPromise = (async () => {
    try {
      const isOnline = await checkIsOnline();
      if (!isOnline) {
        return await getOfflineTransactions(userId);
      }

      // 1. Gather all pending delete IDs and tombstones BEFORE flushing queue
      const queueBeforeFlush = await getSyncQueue(userId);
      const pendingDeleteIds = new Set<string>(
        queueBeforeFlush.filter((qItem) => qItem.type === 'DELETE_TRANSACTION').map((qItem) => String(qItem.targetId))
      );
      const tombstones = await getDeletedTxIds(userId);
      for (const id of tombstones) {
        pendingDeleteIds.add(String(id));
      }

      // 2. Flush any pending outgoing changes
      await flushSyncQueue(userId, db);

      // 3. Fetch fresh data from Firestore (limited to 500 recent transactions)
      const txsRef = collection(db, `users/${userId}/transactions`);
      const q = query(txsRef, orderBy('date', 'desc'), limit(500));
      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch {
        try {
          snapshot = await getDocs(query(txsRef, limit(500)));
        } catch {
          snapshot = await getDocs(txsRef);
        }
      }

      const remoteList: any[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data({ serverTimestamps: 'estimate' }),
      }));

      // 4. Merge remote items with local items:
      // Any existing local transactions NOT marked for deletion should NEVER be discarded!
      // Remote items provide server truth for fields, while preserving any recently added local transactions.
      const localList = await getOfflineTransactions(userId);
      const mergedMap = new Map<string, any>();

      // 4a. Add all local transactions (excluding items pending deletion or tombstoned)
      for (const tx of localList) {
        const idStr = String(tx?.id || '');
        if (idStr && !pendingDeleteIds.has(idStr)) {
          mergedMap.set(idStr, tx);
        }
      }

      // 4b. Overlay / add remote transactions (excluding items pending deletion or tombstoned)
      for (const tx of remoteList) {
        const idStr = String(tx?.id || '');
        if (idStr && !pendingDeleteIds.has(idStr)) {
          const existing = mergedMap.get(idStr);
          const mapped = fromRemote(tx, existing);
          mergedMap.set(idStr, mapped);
        }
      }

      const mergedResult = Array.from(mergedMap.values());

      // 4. Save merged result to local storage (immediate save since this is remote sync result)
      await saveOfflineTransactions(userId, mergedResult, true);
      lastRemoteSyncMap.set(userId, Date.now());
      return mergedResult;
    } catch (err) {
      warn('Sync remote transactions error:', err);
      return await getOfflineTransactions(userId);
    } finally {
      inFlightSyncPromises.delete(userId);
    }
  })();

  inFlightSyncPromises.set(userId, syncPromise);
  return syncPromise;
}
