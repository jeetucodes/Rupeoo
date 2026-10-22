/**
 * Cloud Sync & Privacy Control Engine
 *
 * Implements granular user control over cloud backups and on-device privacy:
 * 1. Cloud Sync ON/OFF toggle (default ON for logged-in, persisted locally).
 * 2. Complete on-device operation (SQLite & local cache) when sync is OFF.
 * 3. Safe deletion of remote cloud copies without touching local data.
 * 4. Batch cloud upload with conflict resolution by updatedAt (latest wins).
 * 5. Full account & data deletion (confirm by typing "DELETE").
 * 6. 100% offline CSV export from local on-device records.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  limit,
} from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { auth, db } from './firebase';
import { toRemote, RemoteTransaction } from './dataMinimization';
import { getOfflineTransactions, saveOfflineTransactions, checkIsOnline } from './offlineSync';
import { invalidateAllUserCache } from './database';
import { getAutoAddDatabase } from '@/features/autoAdd/sqliteStorage';
import { warn, error as logError } from '@/lib/logger';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const CLOUD_SYNC_KEY = '@rupeo_cloud_sync_enabled';
export const OFFLINE_MODE_KEY = '@rupeo_offline_mode';

/**
 * Checks if Cloud Sync is currently enabled.
 * Defaults to true for authenticated users, false if in explicit offline mode or guest.
 */
export async function isCloudSyncEnabled(userId?: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CLOUD_SYNC_KEY);
    if (raw !== null) {
      return raw === 'true';
    }
    // Default to true for authenticated users, false for guests or 'local'
    const currentUid = userId || auth?.currentUser?.uid;
    return Boolean(currentUid && currentUid !== 'local');
  } catch (err) {
    warn('Failed to read cloud sync state:', err);
    return true;
  }
}

/**
 * Sets Cloud Sync state (persisted locally).
 */
export async function setCloudSyncEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CLOUD_SYNC_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    warn('Failed to set cloud sync state:', err);
  }
}

/**
 * Checks if explicit offline guest mode is active.
 */
export async function isOfflineModeActive(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_MODE_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

/**
 * Toggles explicit offline guest mode.
 */
export async function setOfflineModeActive(active: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFLINE_MODE_KEY, active ? 'true' : 'false');
    if (active) {
      await setCloudSyncEnabled(false);
    }
  } catch (err) {
    warn('Failed to set offline mode state:', err);
  }
}

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
 * Purges transactions, recurring bills, categories, notifications, devices, settings, and user doc.
 */
export async function deleteCloudCopy(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!userId || !db) {
    return { success: false, error: 'Database or user ID not available' };
  }

  try {
    // 1. Delete transactions
    await deleteCollectionInBatches(`users/${userId}/transactions`);

    // 2. Delete recurring bills
    await deleteCollectionInBatches(`users/${userId}/recurring_bills`);

    // 3. Delete categories
    await deleteCollectionInBatches(`users/${userId}/categories`);

    // 4. Delete notifications
    await deleteCollectionInBatches(`users/${userId}/notifications`);

    // 5. Delete devices
    await deleteCollectionInBatches(`users/${userId}/devices`);

    // 6. Delete friends / udhar
    await deleteCollectionInBatches(`users/${userId}/friends`);

    // 7. Delete rules
    await deleteCollectionInBatches(`users/${userId}/rules`);

    // 8. Delete settings
    try {
      await deleteDoc(doc(db, `users/${userId}/settings/preferences`));
    } catch {}

    // 9. Delete user document
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
 * Uploads local data to Firestore in batches, resolving conflicts by updatedAt (latest wins).
 * All payloads are strictly filtered through toRemote() for data minimization.
 */
export async function uploadLocalDataToCloud(
  userId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: number; failed: number }> {
  if (!userId || !db) {
    return { success: 0, failed: 0 };
  }

  const isOnline = await checkIsOnline();
  if (!isOnline) {
    throw new Error('No internet connection. Please check your network and try again.');
  }

  const localTxs = await getOfflineTransactions(userId);
  if (!localTxs || localTxs.length === 0) {
    if (onProgress) onProgress(0, 0);
    return { success: 0, failed: 0 };
  }

  const total = localTxs.length;
  let successCount = 0;
  let failedCount = 0;

  // 1. Fetch remote timestamps to resolve conflicts by updatedAt (latest wins)
  const remoteTimestamps = new Map<string, number>();
  try {
    const remoteSnap = await getDocs(collection(db, `users/${userId}/transactions`));
    remoteSnap.docs.forEach((d) => {
      const data = d.data();
      const updated = data.updatedAt || data.updated_at || data.created_at || 0;
      remoteTimestamps.set(d.id, typeof updated === 'number' ? updated : 0);
    });
  } catch (remoteErr) {
    warn('Could not pre-fetch remote timestamps for conflict resolution:', remoteErr);
  }

  // 2. Batch upload in chunks of 200
  const BATCH_SIZE = 200;
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = localTxs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    let chunkCount = 0;

    for (const tx of chunk) {
      try {
        const remoteObj: RemoteTransaction = toRemote(tx);
        const remoteUpdated = remoteTimestamps.get(remoteObj.id) || 0;

        // Conflict resolution: only write if local is newer or equal (latest wins)
        if (remoteObj.updatedAt >= remoteUpdated) {
          const docRef = doc(db, `users/${userId}/transactions`, remoteObj.id);
          batch.set(docRef, remoteObj);
          chunkCount++;
        } else {
          // Remote is newer, count as success without overwriting
          successCount++;
        }
      } catch (mapErr) {
        warn('toRemote mapping error on upload:', mapErr);
        failedCount++;
      }
    }

    if (chunkCount > 0) {
      try {
        await batch.commit();
        successCount += chunkCount;
      } catch (commitErr) {
        logError('Batch commit failed on uploadLocalDataToCloud:', commitErr);
        failedCount += chunkCount;
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, total), total);
    }
  }

  return { success: successCount, failed: failedCount };
}

/**
 * Exports all local transactions to a clean, formatted CSV on-device and triggers native sharing.
 * Works 100% offline directly from local SQLite / AsyncStorage cache.
 */
export async function exportTransactionsToCSV(
  userId: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const txs = await getOfflineTransactions(userId);
    if (!txs || txs.length === 0) {
      return { success: false, error: 'No transactions found on this device to export.' };
    }

    // Sort descending by date
    const sorted = [...txs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // CSV Headers
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
      const note = tx.description || tx.note || '';
      const paymentMode = tx.payment_mode || 'UPI';
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
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

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
 * Permanently deletes user account and all remote and local data:
 * 1. Purges all Firestore collections.
 * 2. Deletes the Firebase Auth account.
 * 3. Wipes all local SQLite tables and AsyncStorage keys.
 */
export async function deleteAccountAndAllData(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Delete remote cloud data first
    if (userId && db) {
      await deleteCloudCopy(userId);
    }

    // 2. Delete Firebase Auth account
    if (auth?.currentUser) {
      await deleteUser(auth.currentUser);
    }

    // 3. Clear SQLite tables
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

    // 4. Wipe all AsyncStorage keys matching @rupeo_*
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const rupeoKeys = allKeys.filter((k) => k.startsWith('@rupeo_'));
      if (rupeoKeys.length > 0) {
        await AsyncStorage.multiRemove(rupeoKeys);
      }
    } catch (storageErr) {
      warn('AsyncStorage wipe error on account deletion:', storageErr);
    }

    // 5. Invalidate in-memory caches
    invalidateAllUserCache(userId);

    return { success: true };
  } catch (err: any) {
    logError('deleteAccountAndAllData error:', err);
    return { success: false, error: err?.message || 'Failed to complete account deletion' };
  }
}
