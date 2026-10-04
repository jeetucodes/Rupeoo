import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { checkIsOnline } from './offlineSync';

export interface FriendContact {
  id: string;
  userId?: string;
  name: string;
  phone?: string;
  photoUri?: string;
  createdAt: string;
  updatedAt: string;
}

export type UdharEntryType = 'gave' | 'got'; // 'gave' = Maine Diye (You lent); 'got' = Maine Liye (You borrowed)

export type InterestPeriod = 'monthly' | 'yearly' | 'one_time';
export type InterestCalcType = 'pro_rata' | 'cycle';

export interface UdharEntry {
  id: string;
  friendId: string;
  userId?: string;
  amount: number;
  type: UdharEntryType;
  date: string; // YYYY-MM-DD
  time?: string;
  note?: string;
  linkedTxId?: string; // Firestore transaction ID for sync with Rupeo Transactions page
  parentEntryId?: string; // If this entry is a settlement/partial payment/interest linked to a parent transaction
  settlementType?: 'full' | 'partial' | 'interest';
  isInterest?: boolean;
  interestPercent?: number;
  interestPeriod?: InterestPeriod; // 'monthly' | 'yearly' | 'one_time'
  interestStartDate?: string; // YYYY-MM-DD
  interestCalcType?: InterestCalcType; // 'pro_rata' (day-by-day) | 'cycle' (full month/year upfront)
  baseAmount?: number; // Base principal on which interest is computed
  interestStatus?: 'active' | 'paused' | 'stopped';
  paymentMode?: string; // 'Cash' | 'UPI' | 'Bank'
  createdAt: string;
}

/**
 * Calculate accrued interest dynamically from startDate to today/asOfDate
 */
export function calculateAccruedInterest(
  baseAmount: number,
  ratePercent: number,
  period: InterestPeriod,
  startDateStr: string,
  calcType: InterestCalcType = 'pro_rata',
  asOfDate: Date = new Date()
): {
  daysElapsed: number;
  monthsElapsed: number;
  yearsElapsed: number;
  accruedAmount: number;
  dailyRate: number;
  periodAmount: number;
} {
  if (!baseAmount || baseAmount <= 0 || !ratePercent || ratePercent <= 0) {
    return { daysElapsed: 0, monthsElapsed: 0, yearsElapsed: 0, accruedAmount: 0, dailyRate: 0, periodAmount: 0 };
  }

  const parts = (startDateStr || '').split('-').map(Number);
  const startYear = parts[0] || asOfDate.getFullYear();
  const startMonth = (parts[1] || 1) - 1;
  const startDay = parts[2] || 1;
  const start = new Date(startYear, startMonth, startDay, 0, 0, 0, 0);

  const now = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate(), 23, 59, 59, 999);
  const diffTime = Math.max(0, now.getTime() - start.getTime());
  const daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const monthsElapsed = Number((daysElapsed / 30.4375).toFixed(1));
  const yearsElapsed = Number((daysElapsed / 365.25).toFixed(2));

  let accruedAmount = 0;
  let periodAmount = 0;
  let dailyRate = 0;

  if (period === 'monthly') {
    periodAmount = Math.round((baseAmount * ratePercent) / 100);
    dailyRate = periodAmount / 30;
    if (calcType === 'cycle') {
      const cycleCount = Math.max(1, Math.floor(daysElapsed / 30) + 1);
      accruedAmount = cycleCount * periodAmount;
    } else {
      accruedAmount = Math.round((baseAmount * (ratePercent / 100) * Math.max(0, daysElapsed)) / 30);
    }
  } else if (period === 'yearly') {
    periodAmount = Math.round((baseAmount * ratePercent) / 100);
    dailyRate = periodAmount / 365;
    if (calcType === 'cycle') {
      const cycleCount = Math.max(1, Math.floor(daysElapsed / 365) + 1);
      accruedAmount = cycleCount * periodAmount;
    } else {
      accruedAmount = Math.round((baseAmount * (ratePercent / 100) * Math.max(0, daysElapsed)) / 365);
    }
  } else {
    // one_time
    accruedAmount = Math.round((baseAmount * ratePercent) / 100);
    periodAmount = accruedAmount;
  }

  return {
    daysElapsed,
    monthsElapsed,
    yearsElapsed,
    accruedAmount,
    dailyRate: Number(dailyRate.toFixed(2)),
    periodAmount,
  };
}

/**
 * Get dynamic entry amount accounting for accrued interest if active
 */
export function getDynamicEntryAmount(entry: UdharEntry, asOfDate: Date = new Date()): number {
  if (
    entry.isInterest &&
    entry.interestStartDate &&
    entry.interestPercent &&
    entry.interestPeriod &&
    entry.interestPeriod !== 'one_time' &&
    entry.interestStatus !== 'stopped'
  ) {
    const base = entry.baseAmount || entry.amount;
    const calc = calculateAccruedInterest(
      base,
      entry.interestPercent,
      entry.interestPeriod,
      entry.interestStartDate,
      entry.interestCalcType || 'pro_rata',
      asOfDate
    );
    return Math.max(entry.amount, calc.accruedAmount);
  }
  return entry.amount;
}

export interface FriendSummary extends FriendContact {
  totalGave: number; // You gave / lent
  totalGot: number;  // You received / borrowed
  balance: number;   // gave - got. Positive = Friend owes you (Lene hain); Negative = You owe friend (Dene hain); 0 = Settled
  entryCount: number;
  lastEntryDate?: string;
}

const getFriendsKey = (userId?: string) => `@rupeo_udhar_friends_${userId || 'guest'}`;
const getEntriesKey = (userId?: string) => `@rupeo_udhar_entries_${userId || 'guest'}`;
const getUpiKey = (userId?: string) => `@rupeo_udhar_last_upi_${userId || 'guest'}`;
const getShowOnDashboardKey = (userId?: string) => `@rupeo_show_udhar_dashboard_${userId || 'guest'}`;
const getSyncTxKey = (userId?: string) => `@rupeo_sync_udhar_tx_dashboard_${userId || 'guest'}`;
const getUdharSyncQueueKey = (userId?: string) => `@rupeo_udhar_sync_queue_${userId || 'guest'}`;

export interface UdharSyncAction {
  id: string;
  type: 'SAVE_FRIEND' | 'DELETE_FRIEND' | 'ADD_UDHAR_ENTRY' | 'DELETE_UDHAR_ENTRY';
  targetId: string;
  payload: any;
  timestamp: number;
  retryCount: number;
}

// In-memory cache for ultra-fast, zero-delay rendering (<1ms)
const friendsMemoryCache = new Map<string, FriendContact[]>();
const entriesMemoryCache = new Map<string, UdharEntry[]>();
let lastFriendsCloudSync = 0;
let lastEntriesCloudSync = 0;
let isUdharSyncing = false;

/**
 * Check if the user wants to auto-add Udhar entries to Home Dashboard transactions & spends.
 * Defaults to false so users explicitly decide per transaction or opt-in.
 */
export async function getSyncUdharToDashboardTx(userId?: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(getSyncTxKey(userId));
    if (raw === null) return false;
    return raw === 'true';
  } catch {
    return false;
  }
}

/**
 * Update user preference to auto-add Udhar entries to Home Dashboard transactions.
 */
export async function setSyncUdharToDashboardTx(userId: string | undefined, sync: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(getSyncTxKey(userId), sync ? 'true' : 'false');
    if (userId && userId !== 'guest' && db && typeof db === 'object' && Object.keys(db).length > 0) {
      try {
        await setDoc(doc(db, 'users', userId), { sync_udhar_to_dashboard: sync }, { merge: true });
      } catch (err) {
        console.warn('Could not sync sync_udhar_to_dashboard to Firestore:', err);
      }
    }
  } catch (err) {
    console.warn('Failed to save sync_udhar_to_dashboard:', err);
  }
}

/**
 * Check if the user wants to show Friends & Udhar on the home dashboard.
 * Defaults to true.
 */
export async function getShowUdharOnDashboard(userId?: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(getShowOnDashboardKey(userId));
    if (raw === null) return true; // Default is ON (true)
    return raw === 'true';
  } catch {
    return true;
  }
}

/**
 * Update the user preference to show or hide Friends & Udhar on the home dashboard.
 */
export async function setShowUdharOnDashboard(userId: string | undefined, show: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(getShowOnDashboardKey(userId), show ? 'true' : 'false');
    if (userId && userId !== 'guest' && db && typeof db === 'object' && Object.keys(db).length > 0) {
      try {
        await setDoc(doc(db, 'users', userId), { show_udhar_on_dashboard: show }, { merge: true });
      } catch (err) {
        console.warn('Could not sync show_udhar_on_dashboard to Firestore:', err);
      }
    }
  } catch (err) {
    console.warn('Failed to save show_udhar_on_dashboard:', err);
  }
}

// ==================== OFFLINE SYNC QUEUE & BACKGROUND CLOUD SYNC ====================

/**
 * Get all pending actions from the local udhar sync queue
 */
export async function getUdharSyncQueue(userId?: string): Promise<UdharSyncAction[]> {
  try {
    const raw = await AsyncStorage.getItem(getUdharSyncQueueKey(userId));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Enqueue an action into the local udhar sync queue
 */
export async function enqueueUdharSyncAction(
  userId: string | undefined,
  action: Omit<UdharSyncAction, 'id' | 'timestamp' | 'retryCount'>
): Promise<void> {
  const uid = userId || 'guest';
  if (uid === 'guest') return;
  try {
    const queue = await getUdharSyncQueue(uid);
    const item: UdharSyncAction = {
      ...action,
      id: `udhar_sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      retryCount: 0,
    };
    await AsyncStorage.setItem(getUdharSyncQueueKey(uid), JSON.stringify([...queue, item]));
  } catch (err) {
    console.warn('[UdharSync] Failed to enqueue udhar sync action:', err);
  }
}

/**
 * Flush pending udhar & friends sync actions to Firebase Firestore as soon as internet is available
 */
export async function flushUdharSyncQueue(userId?: string): Promise<{ success: number; failed: number }> {
  const uid = userId || 'guest';
  if (!uid || uid === 'guest' || !db || typeof db !== 'object' || Object.keys(db).length === 0 || isUdharSyncing) {
    return { success: 0, failed: 0 };
  }

  const isOnline = await checkIsOnline();
  if (!isOnline) {
    return { success: 0, failed: 0 };
  }

  isUdharSyncing = true;
  let success = 0;
  let failed = 0;

  try {
    const queue = await getUdharSyncQueue(uid);
    if (queue.length === 0) {
      isUdharSyncing = false;
      return { success: 0, failed: 0 };
    }

    const remaining: UdharSyncAction[] = [];

    for (const item of queue) {
      try {
        switch (item.type) {
          case 'SAVE_FRIEND': {
            const f = item.payload;
            await setDoc(
              doc(db, `users/${uid}/friends`, f.id),
              {
                name: f.name,
                phone: f.phone || null,
                photoUri: f.photoUri || null,
                createdAt: f.createdAt,
                updatedAt: f.updatedAt,
              },
              { merge: true }
            );
            success++;
            break;
          }

          case 'DELETE_FRIEND': {
            const friendId = item.payload.friendId;
            await deleteDoc(doc(db, `users/${uid}/friends`, friendId));
            const q = query(collection(db, `users/${uid}/udhar_entries`), where('friendId', '==', friendId));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const batch = writeBatch(db);
              snap.forEach((d) => batch.delete(d.ref));
              await batch.commit();
            }
            success++;
            break;
          }

          case 'ADD_UDHAR_ENTRY': {
            const e = item.payload;
            await setDoc(doc(db, `users/${uid}/udhar_entries`, e.id), {
              friendId: e.friendId,
              amount: e.amount,
              type: e.type,
              date: e.date,
              time: e.time || null,
              note: e.note || null,
              linkedTxId: e.linkedTxId || null,
              parentEntryId: e.parentEntryId || null,
              settlementType: e.settlementType || null,
              isInterest: Boolean(e.isInterest),
              interestPercent: e.interestPercent || null,
              interestPeriod: e.interestPeriod || null,
              interestStartDate: e.interestStartDate || null,
              interestCalcType: e.interestCalcType || null,
              baseAmount: e.baseAmount || null,
              interestStatus: e.interestStatus || null,
              paymentMode: e.paymentMode || null,
              createdAt: e.createdAt,
            });

            await setDoc(
              doc(db, `users/${uid}/friends`, e.friendId),
              { updatedAt: e.createdAt },
              { merge: true }
            );
            success++;
            break;
          }

          case 'DELETE_UDHAR_ENTRY': {
            const entryId = item.payload.entryId;
            await deleteDoc(doc(db, `users/${uid}/udhar_entries`, entryId));
            const q = query(
              collection(db, `users/${uid}/udhar_entries`),
              where('parentEntryId', '==', entryId)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              const batch = writeBatch(db);
              snap.forEach((d) => batch.delete(d.ref));
              await batch.commit();
            }
            success++;
            break;
          }
        }
      } catch (itemErr) {
        console.warn(`[UdharSync] Sync failed for ${item.type} (${item.targetId}):`, itemErr);
        if (item.retryCount < 5) {
          remaining.push({ ...item, retryCount: item.retryCount + 1 });
        }
        failed++;
      }
    }

    await AsyncStorage.setItem(getUdharSyncQueueKey(uid), JSON.stringify(remaining));
    return { success, failed };
  } catch (err) {
    console.warn('[UdharSync] Queue flush error:', err);
    return { success, failed };
  } finally {
    isUdharSyncing = false;
  }
}

/**
 * Background non-blocking sync of friends from Cloud Firestore.
 * Merges cloud data safely with local additions so offline changes are never overwritten.
 */
export async function syncFriendsFromCloud(userId?: string): Promise<FriendContact[]> {
  const uid = userId || 'guest';
  if (uid === 'guest' || !db || typeof db !== 'object' || Object.keys(db).length === 0) {
    return friendsMemoryCache.get(uid) || [];
  }

  // Throttle background sync to at most once every 10 seconds
  const now = Date.now();
  if (now - lastFriendsCloudSync < 10000) {
    return friendsMemoryCache.get(uid) || [];
  }
  lastFriendsCloudSync = now;

  try {
    const isOnline = await checkIsOnline();
    if (!isOnline) {
      return friendsMemoryCache.get(uid) || [];
    }

    // Flush pending queue first so remote has our latest changes
    await flushUdharSyncQueue(uid);

    const snap = await getDocs(collection(db, `users/${uid}/friends`));
    const cloudFriends: FriendContact[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: uid,
        name: data.name || '',
        phone: data.phone || undefined,
        photoUri: data.photoUri || undefined,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    });

    const localList = friendsMemoryCache.get(uid) || [];
    const queue = await getUdharSyncQueue(uid);
    const pendingDeletedIds = new Set(
      queue.filter((q) => q.type === 'DELETE_FRIEND').map((q) => q.payload?.friendId)
    );

    const mergedMap = new Map<string, FriendContact>();
    // First add cloud friends that aren't pending deletion
    cloudFriends.forEach((f) => {
      if (!pendingDeletedIds.has(f.id)) {
        mergedMap.set(f.id, f);
      }
    });

    // Merge local additions / newer changes
    localList.forEach((localF) => {
      if (pendingDeletedIds.has(localF.id)) return;
      const remote = mergedMap.get(localF.id);
      if (!remote) {
        mergedMap.set(localF.id, localF);
      } else {
        const localTime = new Date(localF.updatedAt || 0).getTime();
        const remoteTime = new Date(remote.updatedAt || 0).getTime();
        if (localTime > remoteTime) {
          mergedMap.set(localF.id, localF);
        }
      }
    });

    const mergedList = Array.from(mergedMap.values());
    friendsMemoryCache.set(uid, mergedList);
    await AsyncStorage.setItem(getFriendsKey(uid), JSON.stringify(mergedList));
    return mergedList;
  } catch (err) {
    console.warn('[UdharSync] Background friends sync failed, keeping local:', err);
    return friendsMemoryCache.get(uid) || [];
  }
}

/**
 * Background non-blocking sync of udhar entries from Cloud Firestore.
 */
export async function syncEntriesFromCloud(userId?: string): Promise<UdharEntry[]> {
  const uid = userId || 'guest';
  if (uid === 'guest' || !db || typeof db !== 'object' || Object.keys(db).length === 0) {
    return entriesMemoryCache.get(uid) || [];
  }

  const now = Date.now();
  if (now - lastEntriesCloudSync < 10000) {
    return entriesMemoryCache.get(uid) || [];
  }
  lastEntriesCloudSync = now;

  try {
    const isOnline = await checkIsOnline();
    if (!isOnline) {
      return entriesMemoryCache.get(uid) || [];
    }

    await flushUdharSyncQueue(uid);

    const snap = await getDocs(collection(db, `users/${uid}/udhar_entries`));
    const cloudEntries: UdharEntry[] = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        friendId: data.friendId,
        userId: uid,
        amount: Number(data.amount) || 0,
        type: data.type as UdharEntryType,
        date: data.date,
        time: data.time || undefined,
        note: data.note || undefined,
        linkedTxId: data.linkedTxId || undefined,
        parentEntryId: data.parentEntryId || undefined,
        settlementType: data.settlementType || undefined,
        isInterest: Boolean(data.isInterest),
        interestPercent: data.interestPercent ? Number(data.interestPercent) : undefined,
        interestPeriod: data.interestPeriod || undefined,
        interestStartDate: data.interestStartDate || undefined,
        interestCalcType: data.interestCalcType || undefined,
        baseAmount: data.baseAmount ? Number(data.baseAmount) : undefined,
        interestStatus: data.interestStatus || undefined,
        paymentMode: data.paymentMode || undefined,
        createdAt: data.createdAt || new Date().toISOString(),
      };
    });

    const localEntries = entriesMemoryCache.get(uid) || [];
    const queue = await getUdharSyncQueue(uid);
    const pendingDeletedIds = new Set(
      queue.filter((q) => q.type === 'DELETE_UDHAR_ENTRY').map((q) => q.payload?.entryId)
    );

    const mergedMap = new Map<string, UdharEntry>();
    cloudEntries.forEach((e) => {
      if (!pendingDeletedIds.has(e.id)) {
        mergedMap.set(e.id, e);
      }
    });

    localEntries.forEach((localE) => {
      if (pendingDeletedIds.has(localE.id)) return;
      if (!mergedMap.has(localE.id)) {
        mergedMap.set(localE.id, localE);
      }
    });

    const mergedList = Array.from(mergedMap.values());
    entriesMemoryCache.set(uid, mergedList);
    await AsyncStorage.setItem(getEntriesKey(uid), JSON.stringify(mergedList));
    return mergedList;
  } catch (err) {
    console.warn('[UdharSync] Background entries sync failed, keeping local:', err);
    return entriesMemoryCache.get(uid) || [];
  }
}

/**
 * Pre-loads friends and udhar entries into memory immediately (<1ms) on app launch
 * and flushes any pending offline queue.
 */
export async function preloadFriendsAndUdhar(userId?: string): Promise<void> {
  const uid = userId || 'guest';
  try {
    const [rawFriends, rawEntries] = await Promise.all([
      AsyncStorage.getItem(getFriendsKey(uid)),
      AsyncStorage.getItem(getEntriesKey(uid)),
    ]);

    if (rawFriends) {
      const parsed = JSON.parse(rawFriends);
      if (Array.isArray(parsed)) {
        friendsMemoryCache.set(uid, parsed);
      }
    }

    if (rawEntries) {
      const parsed = JSON.parse(rawEntries);
      if (Array.isArray(parsed)) {
        entriesMemoryCache.set(uid, parsed);
      }
    }

    // Background sync & flush
    if (uid !== 'guest') {
      setTimeout(() => {
        flushUdharSyncQueue(uid)
          .then(() => {
            syncFriendsFromCloud(uid).catch(() => {});
            syncEntriesFromCloud(uid).catch(() => {});
          })
          .catch(() => {});
      }, 300);
    }
  } catch (err) {
    console.warn('[UdharSync] Preload error:', err);
  }
}

// ==================== OFFLINE-FIRST FRIENDS API ====================

/**
 * Fetch all friends (Offline-first: returns memory/local cache in <1ms without network delay, then syncs in background)
 */
export async function getFriends(userId?: string): Promise<FriendContact[]> {
  const uid = userId || 'guest';

  // 1. Instant in-memory cache
  const cached = friendsMemoryCache.get(uid);
  if (cached && Array.isArray(cached)) {
    if (uid !== 'guest') {
      syncFriendsFromCloud(uid).catch(() => {});
    }
    return cached;
  }

  // 2. Local AsyncStorage cache
  try {
    const raw = await AsyncStorage.getItem(getFriendsKey(uid));
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        friendsMemoryCache.set(uid, list);
        if (uid !== 'guest') {
          syncFriendsFromCloud(uid).catch(() => {});
        }
        return list;
      }
    }
  } catch (err) {
    console.warn('Error reading local friends cache:', err);
  }

  // 3. Fallback to Cloud if local storage is completely empty
  if (uid !== 'guest' && db && typeof db === 'object' && Object.keys(db).length > 0) {
    return syncFriendsFromCloud(uid);
  }

  return [];
}

/**
 * Add or save a friend:
 * - Saves locally immediately (<1ms) so the UI responds with zero delay
 * - Enqueues a sync action and uploads to Firestore immediately if online
 */
export async function saveFriend(
  userId: string | undefined,
  friendData: { name: string; phone?: string; id?: string; photoUri?: string | null }
): Promise<FriendContact> {
  const uid = userId || 'guest';
  const existing = await getFriends(uid);
  const now = new Date().toISOString();

  let targetFriend: FriendContact;

  if (friendData.id) {
    // Update existing friend
    const updated = existing.map((f) => {
      if (f.id === friendData.id) {
        return {
          ...f,
          name: friendData.name.trim(),
          phone: friendData.phone?.trim() || undefined,
          photoUri: friendData.photoUri !== undefined ? (friendData.photoUri || undefined) : f.photoUri,
          updatedAt: now,
        };
      }
      return f;
    });
    targetFriend = updated.find((f) => f.id === friendData.id)!;
    friendsMemoryCache.set(uid, updated);
    await AsyncStorage.setItem(getFriendsKey(uid), JSON.stringify(updated));
  } else {
    // Create new friend
    targetFriend = {
      id: `friend_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: uid,
      name: friendData.name.trim(),
      phone: friendData.phone?.trim() || undefined,
      photoUri: friendData.photoUri || undefined,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [targetFriend, ...existing];
    friendsMemoryCache.set(uid, updated);
    await AsyncStorage.setItem(getFriendsKey(uid), JSON.stringify(updated));
  }

  // Enqueue for cloud sync and attempt immediate upload if internet is ON
  if (uid !== 'guest') {
    await enqueueUdharSyncAction(uid, {
      type: 'SAVE_FRIEND',
      targetId: targetFriend.id,
      payload: targetFriend,
    });
    flushUdharSyncQueue(uid).catch(() => {});
  }

  return targetFriend;
}

/**
 * Delete a friend and all their associated transactions:
 * - Deletes locally immediately so UI updates instantly
 * - Enqueues delete action to sync to Firestore
 */
export async function deleteFriend(userId: string | undefined, friendId: string): Promise<UdharEntry[]> {
  const uid = userId || 'guest';
  const friends = await getFriends(uid);
  const updatedFriends = friends.filter((f) => f.id !== friendId);
  friendsMemoryCache.set(uid, updatedFriends);
  await AsyncStorage.setItem(getFriendsKey(uid), JSON.stringify(updatedFriends));

  // Also remove all entries for this friend locally
  const entries = await getUdharEntries(uid);
  const deletedEntries = entries.filter((e) => e.friendId === friendId);
  const updatedEntries = entries.filter((e) => e.friendId !== friendId);
  entriesMemoryCache.set(uid, updatedEntries);
  await AsyncStorage.setItem(getEntriesKey(uid), JSON.stringify(updatedEntries));

  // Enqueue sync delete
  if (uid !== 'guest') {
    await enqueueUdharSyncAction(uid, {
      type: 'DELETE_FRIEND',
      targetId: friendId,
      payload: { friendId },
    });
    flushUdharSyncQueue(uid).catch(() => {});
  }

  return deletedEntries;
}

// ==================== OFFLINE-FIRST UDHAR ENTRIES API ====================

/**
 * Fetch all udhar entries (Offline-first: returns local cache in <1ms, syncs in background)
 */
export async function getUdharEntries(userId?: string, friendId?: string): Promise<UdharEntry[]> {
  const uid = userId || 'guest';

  const filterAndSort = (list: UdharEntry[]) => {
    if (friendId) {
      return list
        .filter((e) => e.friendId === friendId)
        .sort((a, b) => new Date(b.date + ' ' + (b.time || '')).getTime() - new Date(a.date + ' ' + (a.time || '')).getTime());
    }
    return list;
  };

  // 1. In-memory cache
  const cached = entriesMemoryCache.get(uid);
  if (cached && Array.isArray(cached)) {
    if (uid !== 'guest') {
      syncEntriesFromCloud(uid).catch(() => {});
    }
    return filterAndSort(cached);
  }

  // 2. Local AsyncStorage cache
  try {
    const raw = await AsyncStorage.getItem(getEntriesKey(uid));
    if (raw) {
      const list: UdharEntry[] = JSON.parse(raw);
      if (Array.isArray(list)) {
        entriesMemoryCache.set(uid, list);
        if (uid !== 'guest') {
          syncEntriesFromCloud(uid).catch(() => {});
        }
        return filterAndSort(list);
      }
    }
  } catch (err) {
    console.warn('Error reading local udhar entries:', err);
  }

  // 3. Fallback to Cloud if local storage is completely empty
  if (uid !== 'guest' && db && typeof db === 'object' && Object.keys(db).length > 0) {
    const cloudEntries = await syncEntriesFromCloud(uid);
    return filterAndSort(cloudEntries);
  }

  return [];
}

/**
 * Add a new udhar entry:
 * - Saves locally immediately (<1ms)
 * - Enqueues action and flushes to Firestore immediately when online
 */
export async function addUdharEntry(
  userId: string | undefined,
  entryData: {
    friendId: string;
    amount: number;
    type: UdharEntryType;
    date: string;
    time?: string;
    note?: string;
    linkedTxId?: string;
    parentEntryId?: string;
    settlementType?: 'full' | 'partial' | 'interest';
    isInterest?: boolean;
    interestPercent?: number;
    interestPeriod?: InterestPeriod;
    interestStartDate?: string;
    interestCalcType?: InterestCalcType;
    baseAmount?: number;
    interestStatus?: 'active' | 'paused' | 'stopped';
    paymentMode?: string;
  }
): Promise<UdharEntry> {
  const uid = userId || 'guest';
  const existing = await getUdharEntries(uid);
  const now = new Date().toISOString();
  const newEntry: UdharEntry = {
    id: `udhar_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    friendId: entryData.friendId,
    userId: uid,
    amount: Math.abs(entryData.amount),
    type: entryData.type,
    date: entryData.date,
    time: entryData.time,
    note: entryData.note?.trim() || undefined,
    linkedTxId: entryData.linkedTxId,
    parentEntryId: entryData.parentEntryId,
    settlementType: entryData.settlementType,
    isInterest: entryData.isInterest,
    interestPercent: entryData.interestPercent,
    interestPeriod: entryData.interestPeriod,
    interestStartDate: entryData.interestStartDate,
    interestCalcType: entryData.interestCalcType,
    baseAmount: entryData.baseAmount,
    interestStatus: entryData.interestStatus,
    paymentMode: entryData.paymentMode,
    createdAt: now,
  };

  const updated = [newEntry, ...existing];
  entriesMemoryCache.set(uid, updated);
  await AsyncStorage.setItem(getEntriesKey(uid), JSON.stringify(updated));

  // Touch friend's updatedAt in local cache
  const friends = await getFriends(uid);
  const updatedFriends = friends.map((f) =>
    f.id === entryData.friendId ? { ...f, updatedAt: now } : f
  );
  friendsMemoryCache.set(uid, updatedFriends);
  await AsyncStorage.setItem(getFriendsKey(uid), JSON.stringify(updatedFriends));

  // Enqueue for cloud sync and attempt immediate upload if online
  if (uid !== 'guest') {
    await enqueueUdharSyncAction(uid, {
      type: 'ADD_UDHAR_ENTRY',
      targetId: newEntry.id,
      payload: newEntry,
    });
    flushUdharSyncQueue(uid).catch(() => {});
  }

  return newEntry;
}

/**
 * Delete a specific udhar entry (also cleans up any child settlements locally & in queue)
 */
export async function deleteUdharEntry(userId: string | undefined, entryId: string): Promise<UdharEntry | null> {
  const uid = userId || 'guest';
  const existing = await getUdharEntries(uid);
  const target = existing.find((e) => e.id === entryId) || null;
  // Remove the target entry AND any child settlements that were linked to it
  const updated = existing.filter((e) => e.id !== entryId && e.parentEntryId !== entryId);
  entriesMemoryCache.set(uid, updated);
  await AsyncStorage.setItem(getEntriesKey(uid), JSON.stringify(updated));

  // Enqueue delete for cloud sync
  if (uid !== 'guest') {
    await enqueueUdharSyncAction(uid, {
      type: 'DELETE_UDHAR_ENTRY',
      targetId: entryId,
      payload: { entryId },
    });
    flushUdharSyncQueue(uid).catch(() => {});
  }

  return target;
}

/**
 * Get aggregated summaries for all friends
 */
export async function getAllFriendsSummaries(userId?: string): Promise<{
  friends: FriendSummary[];
  totalToReceive: number; // positive net balances sum
  totalToPay: number;     // negative net balances sum
  netBalance: number;
}> {
  const [friendsList, entriesList] = await Promise.all([
    getFriends(userId),
    getUdharEntries(userId),
  ]);

  let totalToReceive = 0;
  let totalToPay = 0;

  const summaries: FriendSummary[] = friendsList.map((friend) => {
    const friendEntries = entriesList.filter((e) => e.friendId === friend.id);
    let totalGave = 0;
    let totalGot = 0;
    let lastDate: string | undefined;

    friendEntries.forEach((e) => {
      const amt = getDynamicEntryAmount(e);
      if (e.type === 'gave') totalGave += amt;
      else if (e.type === 'got') totalGot += amt;
      if (!lastDate || e.date > lastDate) lastDate = e.date;
    });

    const balance = totalGave - totalGot;
    if (balance > 0) totalToReceive += balance;
    else if (balance < 0) totalToPay += Math.abs(balance);

    return {
      ...friend,
      totalGave,
      totalGot,
      balance,
      entryCount: friendEntries.length,
      lastEntryDate: lastDate,
    };
  });

  // Sort by most recently updated
  summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    friends: summaries,
    totalToReceive,
    totalToPay,
    netBalance: totalToReceive - totalToPay,
  };
}

/**
 * Last used UPI ID persistence (Cloud synced)
 */
export async function getLastUsedUpiId(userId?: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(getUpiKey(userId))) || '';
  } catch {
    return '';
  }
}

export async function saveLastUsedUpiId(userId: string | undefined, upiId: string): Promise<void> {
  try {
    if (upiId?.trim()) {
      await AsyncStorage.setItem(getUpiKey(userId), upiId.trim());
    }
  } catch (err) {
    console.warn('Error saving last used upi id:', err);
  }
}
