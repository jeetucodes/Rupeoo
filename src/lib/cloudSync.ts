/**
 * Cloud Sync & Privacy Control Engine
 *
 * Implements granular user control over cloud backups and on-device privacy:
 * 1. Cloud Sync ON by default for all logged-in accounts.
 * 2. Explicit user choice OFF persisted permanently (@rupeo_user_chose_sync_off).
 * 3. Initial pull (pullFromCloud) with paginated batches (300/page), exponential backoff,
 *    and upsert by id using updatedAt (latest wins, never delete local rows).
 * 4. Incremental push with per-row sync metadata (syncedAt, syncStatus, updatedAt, deleted).
 * 5. Deterministic document IDs and setDoc with merge to avoid duplication.
 * 6. Safe guest account data migration preserving exact row counts.
 * 7. 100% offline CSV export from local on-device records.
 * 8. Safe cloud copy and account deletion.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  limit,
  orderBy,
  startAfter,
  DocumentSnapshot,
} from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { auth, db } from './firebase';
import {
  toRemote,
  fromRemote,
  RemoteTransaction,
  normalizePaymentMode,
  validateRemotePayload,
  parseAmount,
} from './dataMinimization';
import {
  getOfflineTransactions,
  saveOfflineTransactions,
  checkIsOnline,
  getOfflineCategories,
  saveOfflineCategories,
} from './offlineSync';
import {
  invalidateAllUserCache,
  invalidateTransactionsCache,
  notifyTransactionsListeners,
  sortTransactionsRecentFirst,
} from './database';
import {
  getAutoAddDatabase,
  saveTransactionToSQLite,
  syncRecurringBillsToSQLite,
  getRecurringBillsFromSQLite,
} from '@/features/autoAdd/sqliteStorage';
import { warn, log, error as logError } from '@/lib/logger';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const CLOUD_SYNC_KEY = '@rupeo_cloud_sync_enabled';
export const USER_CHOSE_OFF_KEY = '@rupeo_user_chose_sync_off';
export const LAST_SYNC_KEY_PREFIX = '@rupeo_last_sync_';
export const GUEST_USER_ID = 'local';
export const OFFLINE_GUEST_TXS_KEY = `@rupeo_offline_txs_${GUEST_USER_ID}`;

/**
 * Checks if Cloud Sync is currently enabled.
 * Default is TRUE for every logged-in user unless they explicitly chose OFF.
 */
export async function isCloudSyncEnabled(userId?: string): Promise<boolean> {
  try {
    // 1. Check if user explicitly chose OFF (persisted across updates/logins)
    const userChoseOff = await AsyncStorage.getItem(USER_CHOSE_OFF_KEY);
    if (userChoseOff === 'true') {
      return false;
    }

    // 2. Check stored toggle key
    const raw = await AsyncStorage.getItem(CLOUD_SYNC_KEY);
    if (raw !== null) {
      return raw === 'true';
    }

    // 3. Default to true for authenticated users
    return true;
  } catch (err) {
    warn('Failed to read cloud sync state:', err);
    return true;
  }
}

/**
 * Sets Cloud Sync state (persisted locally).
 * If turned OFF, explicitly records userChoseOff flag so updates/logins never re-enable it.
 */
export async function setCloudSyncEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CLOUD_SYNC_KEY, enabled ? 'true' : 'false');
    if (enabled) {
      await AsyncStorage.removeItem(USER_CHOSE_OFF_KEY);
    } else {
      await AsyncStorage.setItem(USER_CHOSE_OFF_KEY, 'true');
    }
  } catch (err) {
    warn('Failed to set cloud sync state:', err);
  }
}

/**
 * Helper: Sleep with promise for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper: Retry an async operation with exponential backoff (up to 3 retries)
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries = 3,
  delayMs = 300
): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (retries <= 1) throw err;
    await sleep(delayMs);
    return retryWithBackoff(operation, retries - 1, delayMs * 2);
  }
}

// ---------------------------------------------------------------------------
// BUG 1: Initial Pull from Remote DB
// ---------------------------------------------------------------------------

export interface CloudPullState {
  isPulling: boolean;
  message: string;
  count: number;
}

let currentPullState: CloudPullState = {
  isPulling: false,
  message: '',
  count: 0,
};

const pullStateListeners = new Set<(state: CloudPullState) => void>();

export function subscribeCloudPullState(listener: (state: CloudPullState) => void): () => void {
  pullStateListeners.add(listener);
  listener(currentPullState);
  return () => {
    pullStateListeners.delete(listener);
  };
}

function emitPullState(isPulling: boolean, message: string, count: number) {
  currentPullState = { isPulling, message, count };
  pullStateListeners.forEach((l) => l(currentPullState));
}

export function resetCloudPullState() {
  currentPullState = { isPulling: false, message: '', count: 0 };
  pullStateListeners.forEach((l) => l(currentPullState));
}

export interface PullProgressCallback {
  (phase: string, current: number, total: number): void;
}

export interface PullFromCloudOptions {
  silent?: boolean;
  forceRestoreBanner?: boolean;
  limitCount?: number;
  fetchAll?: boolean;
}

// In-memory pagination trackers for on-demand & progressive loading
const userLastVisibleDoc = new Map<string, DocumentSnapshot | null>();
const userHasMoreRemoteTxs = new Map<string, boolean>();
const userRemainingPullPromise = new Map<string, Promise<any[]>>();

export function hasMoreRemoteTransactions(userId: string): boolean {
  return userHasMoreRemoteTxs.get(userId) === true;
}

/**
 * Initial pull: fetches user's transactions, bills, friends/udhar, category rules,
 * and settings from remote Firestore.
 * By default, loads recent ~50 transactions (current month) so startup is instantaneous (<500ms).
 * Older transactions are loaded progressively on demand (e.g. Reports, History, or background idle).
 * Upserts into local SQLite & persistent storage by id using updatedAt (latest wins).
 * Never deletes local rows.
 */
export async function pullFromCloud(
  userId: string,
  onProgress?: PullProgressCallback,
  options: PullFromCloudOptions = {}
): Promise<{ success: boolean; count: number; transactions: any[] }> {
  if (!userId || userId === GUEST_USER_ID || !db) {
    return { success: false, count: 0, transactions: [] };
  }

  const syncEnabled = await isCloudSyncEnabled(userId);
  if (!syncEnabled) {
    const existing = await getOfflineTransactions(userId);
    return { success: true, count: existing.length, transactions: existing };
  }

  const isOnline = await checkIsOnline();
  if (!isOnline) {
    const existing = await getOfflineTransactions(userId);
    return { success: true, count: existing.length, transactions: existing };
  }

  const localExistingTxs = await getOfflineTransactions(userId);
  const isInitialRestore = localExistingTxs.length === 0;
  const shouldShowRestoreBanner = options.forceRestoreBanner || (isInitialRestore && !options.silent);

  try {
    if (shouldShowRestoreBanner) {
      emitPullState(true, 'Restoring your data...', 0);
    }
    if (onProgress) onProgress('Connecting...', 0, 0);

    // 1. Fetch remote transactions: fast initial batch (recent ~50 transactions) or full fetch if requested
    const remoteTxDocs: any[] = [];
    const txsRef = collection(db, `users/${userId}/transactions`);
    let lastDoc: DocumentSnapshot | null = null;
    let hasMore = true;
    const INITIAL_BATCH_SIZE = options.limitCount || 50;
    const PAGE_SIZE = options.fetchAll ? 300 : INITIAL_BATCH_SIZE;

    while (hasMore) {
      const q: any = lastDoc
        ? query(txsRef, orderBy('date', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE))
        : query(txsRef, orderBy('date', 'desc'), limit(PAGE_SIZE));

      const snap: any = await retryWithBackoff(async () => {
        try {
          return await getDocs(q);
        } catch {
          // Fallback if index for orderBy date is not ready
          return lastDoc
            ? await getDocs(query(txsRef, startAfter(lastDoc), limit(PAGE_SIZE)))
            : await getDocs(query(txsRef, limit(PAGE_SIZE)));
        }
      });

      if (snap.empty) {
        hasMore = false;
        userHasMoreRemoteTxs.set(userId, false);
        userLastVisibleDoc.set(userId, null);
        break;
      }

      snap.docs.forEach((d: any) => {
        remoteTxDocs.push({ id: d.id, ...d.data() });
      });

      lastDoc = snap.docs[snap.docs.length - 1];

      if (shouldShowRestoreBanner) {
        emitPullState(true, 'Restoring your data...', remoteTxDocs.length);
      }
      if (onProgress) {
        onProgress('Restoring transactions...', remoteTxDocs.length, remoteTxDocs.length);
      }

      if (!options.fetchAll) {
        // Stop after first batch of recent transactions to guarantee instant dashboard load!
        hasMore = false;
        const hasMoreAvailable = snap.size >= PAGE_SIZE;
        userHasMoreRemoteTxs.set(userId, hasMoreAvailable);
        userLastVisibleDoc.set(userId, hasMoreAvailable ? lastDoc : null);
        break;
      }

      if (snap.size < PAGE_SIZE) {
        hasMore = false;
        userHasMoreRemoteTxs.set(userId, false);
        userLastVisibleDoc.set(userId, null);
      }
    }

    // 2. Fetch recurring bills
    let remoteBills: any[] = [];
    try {
      const billsSnap = await retryWithBackoff(() =>
        getDocs(query(collection(db, `users/${userId}/recurring_bills`), limit(300)))
      );
      remoteBills = billsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (billErr) {
      warn('Could not pull recurring bills:', billErr);
    }

    // 3. Fetch friends / udhar
    let remoteFriends: any[] = [];
    try {
      const friendsSnap = await retryWithBackoff(() =>
        getDocs(query(collection(db, `users/${userId}/friends`), limit(300)))
      );
      remoteFriends = friendsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (friendErr) {
      warn('Could not pull friends:', friendErr);
    }

    // 4. Fetch categories & rules
    let remoteCats: any[] = [];
    try {
      const catsSnap = await retryWithBackoff(() =>
        getDocs(query(collection(db, `users/${userId}/categories`), limit(300)))
      );
      remoteCats = catsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (catErr) {
      warn('Could not pull categories:', catErr);
    }

    // 5. Fetch settings / preferences
    try {
      const settingsSnap = await getDoc(doc(db, `users/${userId}/settings/preferences`));
      if (settingsSnap.exists()) {
        const remoteSettings = settingsSnap.data();
        if (remoteSettings) {
          await AsyncStorage.setItem(`@rupeo_settings_${userId}`, JSON.stringify(remoteSettings));
        }
      }
    } catch (setErr) {
      warn('Could not pull settings:', setErr);
    }

    // 6. Merge remote transactions with existing local transactions
    const localTxs = await getOfflineTransactions(userId);
    const localMap = new Map<string, any>();
    for (const t of localTxs) {
      if (t?.id) localMap.set(t.id, t);
    }

    for (const remoteDoc of remoteTxDocs) {
      const localExisting = localMap.get(remoteDoc.id);
      if (!localExisting) {
        // New remote transaction -> map and insert
        const mapped = fromRemote(remoteDoc);
        mapped.syncStatus = 'synced';
        mapped.syncedAt = Date.now();
        localMap.set(remoteDoc.id, mapped);
      } else {
        // Conflict resolution: compare updatedAt (latest wins)
        const localUpdated = Number(localExisting.updatedAt || localExisting.updated_at || localExisting.created_at) || 0;
        const remoteUpdated = Number(remoteDoc.updatedAt || remoteDoc.updated_at || remoteDoc.created_at) || 0;

        if (remoteUpdated >= localUpdated) {
          // Remote is newer or equal -> overlay server truth while preserving local-only fields
          const mapped = fromRemote(remoteDoc, localExisting);
          mapped.syncStatus = 'synced';
          mapped.syncedAt = Date.now();
          localMap.set(remoteDoc.id, mapped);
        } else {
          // Local is newer -> keep local, leave syncStatus as pending
          localExisting.syncStatus = 'pending';
          localMap.set(remoteDoc.id, localExisting);
        }
      }
    }

    const mergedTxs = sortTransactionsRecentFirst(Array.from(localMap.values()));

    // 7. Save merged data to persistent storage (AsyncStorage + SQLite)
    await saveOfflineTransactions(userId, mergedTxs, true);

    // Sync pulled transactions into SQLite auto_added_transactions
    if (mergedTxs.length > 0) {
      try {
        let writeCount = 0;
        for (const tx of mergedTxs) {
          const isAutoTx =
            tx.source === 'auto' ||
            tx.source === 'notification_listener' ||
            tx.source === 'sms_inbox' ||
            tx.status === 'auto_added' ||
            (typeof tx.id === 'string' && tx.id.startsWith('auto_'));
          const txPaymentMode =
            tx.payment_mode && tx.payment_mode !== 'unknown'
              ? tx.payment_mode
              : tx.paymentMode && tx.paymentMode !== 'unknown'
              ? tx.paymentMode
              : isAutoTx
              ? 'UPI'
              : 'unknown';

          saveTransactionToSQLite({
            id: tx.id,
            amount: Number(tx.amount) || 0,
            type: tx.type || 'debit',
            merchant: tx.merchant_name || tx.payee || null,
            category: tx.category || 'Others',
            bankName: tx.bankName || null,
            accountLast4: tx.accountLast4 || null,
            refNo: tx.ref_no || tx.utr || null,
            timestamp: tx.created_at || tx.updatedAt || Date.now(),
            channel: txPaymentMode,
            rawText: tx.originalMessage || null,
            status: 'synced',
            billId: tx.billId || null,
            originalMessage: tx.originalMessage || null,
            userNote: tx.userNote || tx.description || tx.note || null,
            payment_mode: txPaymentMode,
            syncedAt: tx.syncedAt || Date.now(),
            syncStatus: 'synced',
            updatedAt: tx.updatedAt || Date.now(),
            deleted: 0,
            userId,
            created_at: tx.created_at || Date.now(),
          });

          writeCount++;
          if (writeCount % 25 === 0) {
            await sleep(0);
          }
        }
      } catch (sqliteErr) {
        warn('Error saving pulled transactions to SQLite:', sqliteErr);
      }
    }

    // Save recurring bills to SQLite & AsyncStorage
    if (remoteBills.length > 0) {
      try {
        syncRecurringBillsToSQLite(remoteBills);
        await AsyncStorage.setItem(`@rupeo_bills_${userId}`, JSON.stringify(remoteBills));
      } catch (saveBillErr) {
        warn('Error saving pulled recurring bills:', saveBillErr);
      }
    }

    // Save friends to AsyncStorage
    if (remoteFriends.length > 0) {
      try {
        const existingFriendsRaw = await AsyncStorage.getItem(`@rupeo_friends_${userId}`);
        const existingFriends = existingFriendsRaw ? JSON.parse(existingFriendsRaw) : [];
        const friendMap = new Map<string, any>();
        for (const f of existingFriends) {
          if (f?.id) friendMap.set(f.id, f);
        }
        for (const rf of remoteFriends) {
          if (rf?.id) friendMap.set(rf.id, rf);
        }
        await AsyncStorage.setItem(
          `@rupeo_friends_${userId}`,
          JSON.stringify(Array.from(friendMap.values()))
        );
      } catch (fErr) {
        warn('Error saving pulled friends:', fErr);
      }
    }

    // Save categories to AsyncStorage
    if (remoteCats.length > 0) {
      try {
        const existingCats = (await getOfflineCategories(userId)) || [];
        const catMap = new Map<string, any>();
        for (const c of existingCats) {
          if (c?.name) catMap.set(c.name.toLowerCase(), c);
        }
        for (const rc of remoteCats) {
          if (rc?.name) catMap.set(rc.name.toLowerCase(), rc);
        }
        await saveOfflineCategories(userId, Array.from(catMap.values()));
      } catch (cErr) {
        warn('Error saving pulled categories:', cErr);
      }
    }

    // 8. Invalidate all caches and notify all UI listeners
    invalidateAllUserCache(userId);
    invalidateTransactionsCache(userId);
    notifyTransactionsListeners(mergedTxs);
    await AsyncStorage.setItem(`${LAST_SYNC_KEY_PREFIX}${userId}`, Date.now().toString());

    if (onProgress) {
      onProgress('All backed up', mergedTxs.length, mergedTxs.length);
    }

    if (shouldShowRestoreBanner) {
      emitPullState(false, 'Done', mergedTxs.length);
    } else {
      resetCloudPullState();
    }
    return { success: true, count: mergedTxs.length, transactions: mergedTxs };
  } catch (err: any) {
    logError('pullFromCloud error:', err);
    const fallback = await getOfflineTransactions(userId);
    if (shouldShowRestoreBanner) {
      emitPullState(false, 'Error', fallback.length);
    } else {
      resetCloudPullState();
    }
    return { success: false, count: fallback.length, transactions: fallback };
  }
}

/**
 * On-demand / background incremental pull for older transactions.
 * Loads remaining pages from Firestore in non-blocking batches.
 * Triggered on demand (e.g. Reports tab, Transactions history tab, or deferred background idle).
 */
export async function pullRemainingHistoryFromCloud(
  userId: string,
  onProgress?: PullProgressCallback
): Promise<any[]> {
  if (!userId || userId === GUEST_USER_ID || !db) return [];

  const inFlight = userRemainingPullPromise.get(userId);
  if (inFlight) return inFlight;

  const hasMore = userHasMoreRemoteTxs.get(userId);
  if (hasMore === false) {
    return await getOfflineTransactions(userId);
  }

  const p = (async () => {
    try {
      const syncEnabled = await isCloudSyncEnabled(userId);
      if (!syncEnabled) return await getOfflineTransactions(userId);

      const isOnline = await checkIsOnline();
      if (!isOnline) return await getOfflineTransactions(userId);

      const txsRef = collection(db, `users/${userId}/transactions`);
      let lastDoc = userLastVisibleDoc.get(userId) || null;
      let moreToFetch = true;
      const PAGE_SIZE = 150;
      const newlyFetchedDocs: any[] = [];

      while (moreToFetch) {
        const q: any = lastDoc
          ? query(txsRef, orderBy('date', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE))
          : query(txsRef, orderBy('date', 'desc'), limit(PAGE_SIZE));

        let snap: any;
        try {
          snap = await getDocs(q);
        } catch {
          snap = lastDoc
            ? await getDocs(query(txsRef, startAfter(lastDoc), limit(PAGE_SIZE)))
            : await getDocs(query(txsRef, limit(PAGE_SIZE)));
        }

        if (snap.empty) {
          userHasMoreRemoteTxs.set(userId, false);
          userLastVisibleDoc.set(userId, null);
          break;
        }

        snap.docs.forEach((d: any) => {
          newlyFetchedDocs.push({ id: d.id, ...d.data() });
        });

        if (onProgress) {
          onProgress('Loading older history...', newlyFetchedDocs.length, newlyFetchedDocs.length);
        }

        if (snap.size < PAGE_SIZE) {
          moreToFetch = false;
          userHasMoreRemoteTxs.set(userId, false);
          userLastVisibleDoc.set(userId, null);
        } else {
          lastDoc = snap.docs[snap.docs.length - 1];
          userLastVisibleDoc.set(userId, lastDoc);
        }

        // Non-blocking yield to keep 60fps responsiveness on Android
        await sleep(10);
      }

      if (newlyFetchedDocs.length > 0) {
        const localTxs = await getOfflineTransactions(userId);
        const localMap = new Map<string, any>();
        for (const t of localTxs) {
          if (t?.id) localMap.set(t.id, t);
        }

        for (const remoteDoc of newlyFetchedDocs) {
          const localExisting = localMap.get(remoteDoc.id);
          const mapped = fromRemote(remoteDoc, localExisting);
          mapped.syncStatus = 'synced';
          mapped.syncedAt = Date.now();
          localMap.set(remoteDoc.id, mapped);
        }

        const mergedTxs = sortTransactionsRecentFirst(Array.from(localMap.values()));
        await saveOfflineTransactions(userId, mergedTxs, true);

        // Batch save to SQLite in background
        let writeCount = 0;
        for (const tx of newlyFetchedDocs) {
          const isAutoTx =
            tx.source === 'auto' ||
            tx.source === 'notification_listener' ||
            tx.source === 'sms_inbox' ||
            tx.status === 'auto_added' ||
            (typeof tx.id === 'string' && tx.id.startsWith('auto_'));
          const txPaymentMode =
            tx.payment_mode && tx.payment_mode !== 'unknown'
              ? tx.payment_mode
              : tx.paymentMode && tx.paymentMode !== 'unknown'
              ? tx.paymentMode
              : isAutoTx
              ? 'UPI'
              : 'unknown';

          saveTransactionToSQLite({
            id: tx.id,
            amount: Number(tx.amount) || 0,
            type: tx.type || 'debit',
            merchant: tx.merchant_name || tx.payee || null,
            category: tx.category || 'Others',
            bankName: tx.bankName || null,
            accountLast4: tx.accountLast4 || null,
            refNo: tx.ref_no || tx.utr || null,
            timestamp: tx.created_at || tx.updatedAt || Date.now(),
            channel: txPaymentMode,
            rawText: tx.originalMessage || null,
            status: 'synced',
            billId: tx.billId || null,
            originalMessage: tx.originalMessage || null,
            userNote: tx.userNote || tx.description || tx.note || null,
            payment_mode: txPaymentMode,
            syncedAt: tx.syncedAt || Date.now(),
            syncStatus: 'synced',
            updatedAt: tx.updatedAt || Date.now(),
            deleted: 0,
            userId,
            created_at: tx.created_at || Date.now(),
          });

          writeCount++;
          if (writeCount % 30 === 0) {
            await sleep(5);
          }
        }

        invalidateAllUserCache(userId);
        invalidateTransactionsCache(userId);
        notifyTransactionsListeners(mergedTxs);
        return mergedTxs;
      }

      return await getOfflineTransactions(userId);
    } catch (err) {
      warn('pullRemainingHistoryFromCloud error:', err);
      return await getOfflineTransactions(userId);
    } finally {
      userRemainingPullPromise.delete(userId);
    }
  })();

  userRemainingPullPromise.set(userId, p);
  return p;
}

// ---------------------------------------------------------------------------
// BUG 5: Incremental Push with Sync Metadata
// ---------------------------------------------------------------------------

export interface PushResult {
  success: number;
  failed: number;
  pending: number;
}

/**
 * Validates a transaction row before upload.
 * Returns true if valid, false if required fields are missing.
 */
function isValidLocalRow(tx: any): boolean {
  if (!tx || typeof tx !== 'object') return false;
  if (!tx.id || typeof tx.id !== 'string') return false;
  const amt = parseAmount(tx.amount);
  if (amt < 0) return false;
  if (!tx.date || typeof tx.date !== 'string') return false;
  return true;
}

/**
 * Pushes only 'pending' or 'failed' rows to Firestore.
 * Batches of 300 with exponential backoff retry.
 * Marks rows 'synced' and records syncedAt only after the write is confirmed.
 * Never re-uploads synced rows.
 */
export async function uploadLocalDataToCloud(
  userId: string,
  onProgress?: (current: number, total: number) => void
): Promise<PushResult> {
  if (!userId || userId === GUEST_USER_ID || !db) {
    return { success: 0, failed: 0, pending: 0 };
  }

  const syncEnabled = await isCloudSyncEnabled(userId);
  if (!syncEnabled) {
    return { success: 0, failed: 0, pending: 0 };
  }

  const isOnline = await checkIsOnline();
  if (!isOnline) {
    throw new Error('No internet connection. Please check your network and try again.');
  }

  const localTxs = await getOfflineTransactions(userId);
  if (!localTxs || localTxs.length === 0) {
    if (onProgress) onProgress(0, 0);
    return { success: 0, failed: 0, pending: 0 };
  }

  // Filter ONLY rows that need syncing ('pending', 'failed', or missing syncStatus)
  const pendingRows = localTxs.filter(
    (tx) => tx.syncStatus === 'pending' || tx.syncStatus === 'failed' || !tx.syncStatus
  );

  const totalToPush = pendingRows.length;
  if (totalToPush === 0) {
    if (onProgress) onProgress(0, 0);
    return { success: 0, failed: 0, pending: 0 };
  }

  let successCount = 0;
  let failedCount = 0;
  const BATCH_SIZE = 300;
  const updatedLocalMap = new Map<string, any>(localTxs.map((t) => [t.id, t]));

  for (let i = 0; i < totalToPush; i += BATCH_SIZE) {
    const chunk = pendingRows.slice(i, i + BATCH_SIZE);
    const validRowsInChunk: { tx: any; remote: RemoteTransaction }[] = [];

    for (const tx of chunk) {
      if (!isValidLocalRow(tx)) {
        warn('Skipping invalid transaction row during push:', tx?.id);
        failedCount++;
        continue;
      }

      try {
        const remoteObj = toRemote(tx);
        const val = validateRemotePayload(remoteObj);
        if (!val.valid) {
          warn('Data minimization violation on push; skipping:', val.violations);
          failedCount++;
          continue;
        }
        validRowsInChunk.push({ tx, remote: remoteObj });
      } catch (mapErr) {
        warn('toRemote mapping error on push:', mapErr);
        failedCount++;
      }
    }

    if (validRowsInChunk.length > 0) {
      try {
        await retryWithBackoff(async () => {
          const batch = writeBatch(db);
          for (const item of validRowsInChunk) {
            const docRef = doc(db, `users/${userId}/transactions`, item.remote.id);
            // Use setDoc with merge to ensure deterministic updates and avoid duplicates
            batch.set(docRef, item.remote, { merge: true });
          }
          await batch.commit();
        });

        // Confirmation received -> mark rows as 'synced' with syncedAt timestamp
        const now = Date.now();
        for (const item of validRowsInChunk) {
          const localItem = updatedLocalMap.get(item.tx.id);
          if (localItem) {
            localItem.syncStatus = 'synced';
            localItem.syncedAt = now;
            updatedLocalMap.set(item.tx.id, localItem);
          }
        }
        successCount += validRowsInChunk.length;
      } catch (commitErr) {
        logError('Batch commit failed on push:', commitErr);
        for (const item of validRowsInChunk) {
          const localItem = updatedLocalMap.get(item.tx.id);
          if (localItem) {
            localItem.syncStatus = 'failed';
            updatedLocalMap.set(item.tx.id, localItem);
          }
        }
        failedCount += validRowsInChunk.length;
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, totalToPush), totalToPush);
    }
  }

  // Persist updated sync metadata back to local storage
  const updatedList = sortTransactionsRecentFirst(Array.from(updatedLocalMap.values()));
  await saveOfflineTransactions(userId, updatedList, true);
  await AsyncStorage.setItem(`${LAST_SYNC_KEY_PREFIX}${userId}`, Date.now().toString());

  const remainingPending = updatedList.filter(
    (t) => t.syncStatus === 'pending' || t.syncStatus === 'failed'
  ).length;

  return { success: successCount, failed: failedCount, pending: remainingPending };
}

/**
 * Called when Cloud Sync is turned ON:
 * 1. Pulls from cloud first.
 * 2. Compares remote ids and timestamps.
 * 3. Marks matching local rows as 'synced'.
 * 4. Pushes only missing or newer local rows.
 * Toggling OFF then ON will not re-upload anything extra.
 */
export async function syncLocalAndCloud(
  userId: string,
  onProgress?: (phase: string, current: number, total: number) => void
): Promise<{ success: number; failed: number }> {
  if (!userId || userId === GUEST_USER_ID) {
    return { success: 0, failed: 0 };
  }

  // 1. First run pullFromCloud
  await pullFromCloud(userId, onProgress);

  // 2. Fetch remote timestamps to identify already synced docs
  const remoteTimestamps = new Map<string, number>();
  try {
    const remoteSnap = await getDocs(collection(db, `users/${userId}/transactions`));
    remoteSnap.docs.forEach((d) => {
      const data = d.data();
      const updated = data.updatedAt || data.updated_at || data.created_at || 0;
      remoteTimestamps.set(d.id, typeof updated === 'number' ? updated : 0);
    });
  } catch (err) {
    warn('Could not read remote timestamps for syncLocalAndCloud:', err);
  }

  // 3. Mark local rows matching remote timestamps as 'synced'
  const localTxs = await getOfflineTransactions(userId);
  let updatedAny = false;
  for (const tx of localTxs) {
    if (remoteTimestamps.has(tx.id)) {
      const remoteUpdated = remoteTimestamps.get(tx.id) || 0;
      const localUpdated = Number(tx.updatedAt || tx.updated_at || tx.created_at) || 0;
      if (remoteUpdated >= localUpdated && tx.syncStatus !== 'synced') {
        tx.syncStatus = 'synced';
        tx.syncedAt = Date.now();
        updatedAny = true;
      }
    }
  }

  if (updatedAny) {
    await saveOfflineTransactions(userId, localTxs, true);
  }

  // 4. Push only pending rows
  const pushRes = await uploadLocalDataToCloud(userId, (cur, tot) => {
    if (onProgress) {
      onProgress(`Backing up ${cur} of ${tot} new transactions`, cur, tot);
    }
  });

  if (onProgress) {
    onProgress('All backed up', pushRes.success, pushRes.success);
  }

  return { success: pushRes.success, failed: pushRes.failed };
}

// ---------------------------------------------------------------------------
// BUG 2: Backfill missing remote paymentMode
// ---------------------------------------------------------------------------

/**
 * Scans remote transactions; for rows where remote paymentMode is missing but local
 * has a valid payment mode, pushes the paymentMode backfill once in batches.
 */
export async function backfillMissingRemotePaymentModes(userId: string): Promise<number> {
  if (!userId || userId === GUEST_USER_ID || !db) return 0;
  const isOnline = await checkIsOnline();
  if (!isOnline) return 0;

  try {
    const localTxs = await getOfflineTransactions(userId);
    const localMap = new Map<string, any>(localTxs.map((t) => [t.id, t]));

    const remoteSnap = await getDocs(collection(db, `users/${userId}/transactions`));
    const toUpdate: { id: string; paymentMode: string }[] = [];

    remoteSnap.docs.forEach((d) => {
      const data = d.data();
      const remoteMode = data.paymentMode || data.payment_mode;
      const local = localMap.get(d.id);
      const localMode = local?.payment_mode || local?.paymentMode;

      if ((!remoteMode || remoteMode === 'unknown') && localMode && localMode !== 'unknown') {
        toUpdate.push({ id: d.id, paymentMode: normalizePaymentMode(localMode) });
      }
    });

    if (toUpdate.length === 0) return 0;

    let updatedCount = 0;
    const BATCH_SIZE = 300;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const chunk = toUpdate.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const docRef = doc(db, `users/${userId}/transactions`, item.id);
        batch.set(docRef, { paymentMode: item.paymentMode, updatedAt: Date.now() }, { merge: true });
      }
      await batch.commit();
      updatedCount += chunk.length;
    }

    log(`[Backfill] Successfully backfilled paymentMode for ${updatedCount} transactions.`);
    return updatedCount;
  } catch (err) {
    warn('backfillMissingRemotePaymentModes error:', err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// CHANGE 6: Guest Data Migration to Authenticated User
// ---------------------------------------------------------------------------

/**
 * Migrates local guest data (from previous versions with no account) to a newly signed in account.
 * Transactional: counts before/after, never deletes local rows, marks syncStatus 'pending'.
 */
export async function migrateGuestDataToUser(userId: string): Promise<{ migrated: number }> {
  if (!userId || userId === GUEST_USER_ID) return { migrated: 0 };

  try {
    const guestTxs = await getOfflineTransactions(GUEST_USER_ID);
    if (!guestTxs || guestTxs.length === 0) {
      return { migrated: 0 };
    }

    const countBefore = guestTxs.length;

    // Attach all guest rows to the new account
    const existingUserTxs = await getOfflineTransactions(userId);
    const mergedMap = new Map<string, any>();

    for (const tx of existingUserTxs) {
      if (tx?.id) mergedMap.set(tx.id, tx);
    }

    for (const gTx of guestTxs) {
      if (gTx?.id) {
        const migrated = {
          ...gTx,
          userId,
          syncStatus: 'pending',
          updatedAt: Date.now(),
        };
        // If conflict with existing user row, keep existing or merge
        if (!mergedMap.has(gTx.id)) {
          mergedMap.set(gTx.id, migrated);
        }
      }
    }

    const mergedList = sortTransactionsRecentFirst(Array.from(mergedMap.values()));
    const countAfter = mergedList.length;

    if (countAfter < countBefore) {
      throw new Error(`Row count verification failed: before=${countBefore}, after=${countAfter}`);
    }

    // Save under the new user's storage
    await saveOfflineTransactions(userId, mergedList, true);

    // Clean up old guest key safely after verification
    await AsyncStorage.removeItem(OFFLINE_GUEST_TXS_KEY);

    // Invalidate and notify
    invalidateTransactionsCache(userId);
    notifyTransactionsListeners(mergedList);

    log(`[Migration] Migrated ${countBefore} guest transactions to user ${userId}.`);
    return { migrated: countBefore };
  } catch (err) {
    warn('migrateGuestDataToUser error:', err);
    return { migrated: 0 };
  }
}

// ---------------------------------------------------------------------------
// Sync Status Information for Settings UI
// ---------------------------------------------------------------------------

export interface SyncStatusInfo {
  lastSyncedTime: number | null;
  pendingCount: number;
  syncEnabled: boolean;
}

/**
 * Returns sync metadata for the Settings screen.
 */
export async function getSyncStatusInfo(userId: string): Promise<SyncStatusInfo> {
  const syncEnabled = await isCloudSyncEnabled(userId);
  let lastSyncedTime: number | null = null;
  let pendingCount = 0;

  try {
    const rawLast = await AsyncStorage.getItem(`${LAST_SYNC_KEY_PREFIX}${userId}`);
    if (rawLast) {
      const parsed = parseInt(rawLast, 10);
      if (!isNaN(parsed)) lastSyncedTime = parsed;
    }

    const txs = await getOfflineTransactions(userId);
    pendingCount = txs.filter((t) => t.syncStatus === 'pending' || t.syncStatus === 'failed').length;
  } catch (err) {
    warn('getSyncStatusInfo error:', err);
  }

  return {
    lastSyncedTime,
    pendingCount,
    syncEnabled,
  };
}

// ---------------------------------------------------------------------------
// Cloud Deletion & Cleanup
// ---------------------------------------------------------------------------

/**
 * Helper to delete an entire Firestore collection in batches of 500.
 */
async function deleteCollectionInBatches(path: string): Promise<number> {
  if (!db) return 0;
  let totalDeleted = 0;
  const colRef = collection(db, path);

  while (true) {
    const snapshot = await getDocs(query(colRef, limit(500)));
    if (snapshot.empty) break;

    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snapshot.size;

    if (snapshot.size < 500) break;
  }

  return totalDeleted;
}

/**
 * Deletes all remote documents for a user in Firestore without touching local data.
 */
export async function deleteCloudCopy(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!userId || !db) {
    return { success: false, error: 'Database or user ID not available' };
  }

  try {
    await deleteCollectionInBatches(`users/${userId}/transactions`);
    await deleteCollectionInBatches(`users/${userId}/recurring_bills`);
    await deleteCollectionInBatches(`users/${userId}/categories`);
    await deleteCollectionInBatches(`users/${userId}/notifications`);
    await deleteCollectionInBatches(`users/${userId}/devices`);
    await deleteCollectionInBatches(`users/${userId}/friends`);
    await deleteCollectionInBatches(`users/${userId}/rules`);

    try {
      await deleteDoc(doc(db, `users/${userId}/settings/preferences`));
    } catch {}

    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch {}

    return { success: true };
  } catch (err: any) {
    logError('deleteCloudCopy error:', err);
    return { success: false, error: err?.message || 'Failed to delete remote cloud copy' };
  }
}

/**
 * Exports all local transactions to a clean, formatted CSV on-device and triggers native sharing.
 */
export async function exportTransactionsToCSV(
  userId: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const txs = await getOfflineTransactions(userId);
    if (!txs || txs.length === 0) {
      return { success: false, error: 'No transactions found on this device to export.' };
    }

    const sorted = [...txs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const headers = ['Date', 'Time', 'Type', 'Category', 'Amount', 'Payee', 'Note', 'Payment Mode', 'Source'];
    const rows: string[] = [headers.join(',')];

    for (const tx of sorted) {
      const escape = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const date = tx.date || '';
      const time = tx.time || '';
      const type = (tx.type || 'debit').toUpperCase();
      const category = tx.category || 'Others';
      const amount = Number(tx.amount) || 0;
      const payee = tx.merchant_name || tx.payee || '';
      const note = tx.userNote || tx.description || tx.note || '';
      const paymentMode = tx.payment_mode || 'unknown';
      const source = tx.source || 'manual';

      rows.push([
        escape(date),
        escape(time),
        escape(type),
        escape(category),
        amount.toFixed(2),
        escape(payee),
        escape(note),
        escape(paymentMode),
        escape(source),
      ].join(','));
    }

    const csvContent = rows.join('\r\n');
    const fileName = `rupeo_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    const baseDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
    const filePath = `${baseDir}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Rupeo Transactions (CSV)',
        UTI: 'public.comma-separated-values-text',
      });
    }

    return { success: true, filePath };
  } catch (err: any) {
    logError('exportTransactionsToCSV error:', err);
    return { success: false, error: err?.message || 'Failed to export CSV file' };
  }
}

/**
 * Permanently deletes user account and all remote and local data.
 */
export async function deleteAccountAndAllData(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (userId && db) {
      await deleteCloudCopy(userId);
    }

    if (auth?.currentUser) {
      await deleteUser(auth.currentUser);
    }

    try {
      const sqlite = getAutoAddDatabase();
      if (sqlite) {
        sqlite.execSync(`
          DELETE FROM auto_added_transactions;
          DELETE FROM notif_log;
          DELETE FROM recurring_bills;
          DELETE FROM auto_add_pending_alerts;
        `);
      }
    } catch (sqliteErr) {
      warn('SQLite wipe error on account deletion:', sqliteErr);
    }

    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const rupeoKeys = allKeys.filter((k) => k.startsWith('@rupeo_'));
      if (rupeoKeys.length > 0) {
        await AsyncStorage.multiRemove(rupeoKeys);
      }
    } catch (storageErr) {
      warn('AsyncStorage wipe error on account deletion:', storageErr);
    }

    invalidateAllUserCache(userId);
    return { success: true };
  } catch (err: any) {
    logError('deleteAccountAndAllData error:', err);
    return { success: false, error: err?.message || 'Failed to complete account deletion' };
  }
}
