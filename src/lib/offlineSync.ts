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
  serverTimestamp,
} from 'firebase/firestore';

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

let isSyncInProgress = false;

/**
 * Check if the device has actual internet access by pinging Google's generate_204 endpoint.
 * Returns true if online, false if offline/timeout.
 */
export async function checkIsOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('https://clients3.google.com/generate_204', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.status === 204 || response.status === 200 || response.type === 'opaque' || response.ok;
  } catch {
    // Graceful fallback: return true so Firestore SDK can handle its own online/offline connectivity
    return true;
  }
}

/**
 * Get all cached transactions from local storage for a user.
 */
export async function getOfflineTransactions(userId: string): Promise<any[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(getTxsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to load offline transactions:', err);
    return [];
  }
}

/**
 * Save all transactions to local storage cache for instant offline access.
 */
export async function saveOfflineTransactions(userId: string, txs: any[]): Promise<void> {
  if (!userId || !Array.isArray(txs)) return;
  try {
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
    await AsyncStorage.setItem(getTxsKey(userId), JSON.stringify(sanitized));
  } catch (err) {
    console.warn('Failed to save offline transactions:', err);
  }
}

/**
 * Get offline categories for a user.
 */
export async function getOfflineCategories(userId: string): Promise<any[] | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(getCategoriesKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
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
    console.warn('Failed to save offline categories:', err);
  }
}

/**
 * Enqueue a sync action into local queue.
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
    console.warn('Failed to enqueue sync action:', err);
  }
}

/**
 * Get the current sync queue.
 */
export async function getSyncQueue(userId: string): Promise<SyncAction[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(getQueueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
    console.warn('Failed to remove sync action:', err);
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

    for (const item of queue) {
      try {
        switch (item.type) {
          case 'ADD_TRANSACTION': {
            const txDocRef = doc(db, `users/${userId}/transactions`, item.targetId);
            await setDoc(txDocRef, {
              ...item.payload,
              created_at: item.payload?.created_at || Date.now(),
            });
            success++;
            break;
          }
          case 'UPDATE_TRANSACTION': {
            const txDocRef = doc(db, `users/${userId}/transactions`, item.targetId);
            await updateDoc(txDocRef, {
              ...item.payload,
              updated_at: serverTimestamp(),
            });
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
      } catch (itemErr) {
        console.warn(`Sync item failed (${item.type} on ${item.targetId}):`, itemErr);
        // Only retry up to 5 times to prevent poison pill tasks from blocking queue forever
        if (item.retryCount < 5) {
          remainingQueue.push({
            ...item,
            retryCount: item.retryCount + 1,
          });
        }
        failed++;
      }
    }

    await AsyncStorage.setItem(getQueueKey(userId), JSON.stringify(remainingQueue));
    await AsyncStorage.setItem(getLastSyncKey(userId), Date.now().toString());
  } catch (err) {
    console.warn('Sync queue flush error:', err);
  } finally {
    isSyncInProgress = false;
  }

  return { success, failed };
}

/**
 * Fetch remote data from Firestore, reconcile with local pending items, and save locally.
 */
export async function syncRemoteTransactions(
  userId: string,
  db: Firestore
): Promise<any[]> {
  if (!userId) return [];

  const isOnline = await checkIsOnline();
  if (!isOnline) {
    return await getOfflineTransactions(userId);
  }

  try {
    // 1. Flush any pending outgoing changes first
    await flushSyncQueue(userId, db);

    // 2. Fetch fresh data from Firestore
    const txsRef = collection(db, `users/${userId}/transactions`);
    const q = query(txsRef, orderBy('date', 'desc'));
    let snapshot;
    try {
      snapshot = await getDocs(q);
    } catch {
      snapshot = await getDocs(txsRef);
    }

    const remoteList: any[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data({ serverTimestamps: 'estimate' }),
    }));

    // 3. Merge remote items with local items:
    // Any existing local transactions NOT marked for deletion should NEVER be discarded!
    // Remote items provide server truth for fields, while preserving any recently added local transactions.
    const queue = await getSyncQueue(userId);
    const pendingDeleteIds = new Set(
      queue.filter((qItem) => qItem.type === 'DELETE_TRANSACTION').map((qItem) => qItem.targetId)
    );

    const localList = await getOfflineTransactions(userId);
    const mergedMap = new Map<string, any>();

    // 1. Add all local transactions (excluding items pending deletion)
    for (const tx of localList) {
      if (tx?.id && !pendingDeleteIds.has(tx.id)) {
        mergedMap.set(tx.id, tx);
      }
    }

    // 2. Overlay / add remote transactions (excluding items pending deletion)
    for (const tx of remoteList) {
      if (tx?.id && !pendingDeleteIds.has(tx.id)) {
        const existing = mergedMap.get(tx.id) || {};
        const remoteCreated = tx.created_at;
        const resolvedCreatedAt =
          remoteCreated !== undefined && remoteCreated !== null
            ? remoteCreated
            : existing.created_at || Date.now();
        mergedMap.set(tx.id, {
          ...existing,
          ...tx,
          created_at: resolvedCreatedAt,
        });
      }
    }

    const mergedResult = Array.from(mergedMap.values());

    // 4. Save merged result to local storage
    await saveOfflineTransactions(userId, mergedResult);
    return mergedResult;
  } catch (err) {
    console.warn('Sync remote transactions error:', err);
    return await getOfflineTransactions(userId);
  }
}
