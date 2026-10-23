import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteTransaction, getAllTransactions } from './database.ts';
import { warn } from './logger.ts';
import { safeJsonParse } from './safeStorage.ts';

export interface SmsImportBatch {
  batchId: string;
  timestamp: number;
  dateRange: string;
  totalScanned: number;
  addedCount: number;
  skippedCount: number;
  reviewCount: number;
  createdTxIds: string[];
}

const getBatchesKey = (userId: string) => `@rupeo_sms_batches_${userId}`;

/**
 * Records an import batch metadata.
 */
export async function recordImportBatch(userId: string, batch: SmsImportBatch): Promise<void> {
  if (!userId || !batch) return;
  try {
    const key = getBatchesKey(userId);
    const raw = await AsyncStorage.getItem(key);
    const list: SmsImportBatch[] = safeJsonParse(raw, [], { keyForBackup: key });
    list.unshift(batch);
    // Keep last 20 batches
    if (list.length > 20) list.pop();
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch (err) {
    warn('Failed to record SMS import batch:', err);
  }
}

/**
 * Gets all recorded import batches for user.
 */
export async function getImportBatches(userId: string): Promise<SmsImportBatch[]> {
  if (!userId) return [];
  try {
    const key = getBatchesKey(userId);
    const raw = await AsyncStorage.getItem(key);
    return safeJsonParse(raw, [], { keyForBackup: key });
  } catch {
    return [];
  }
}

/**
 * Undoes an import batch by deleting all transactions associated with that batchId.
 * Returns the number of successfully removed transactions.
 */
export async function undoImportBatch(userId: string, batchId: string): Promise<number> {
  if (!userId || !batchId) return 0;

  let undoneCount = 0;

  try {
    const batches = await getImportBatches(userId);
    const targetBatch = batches.find((b) => b.batchId === batchId);

    // If batch record has createdTxIds, delete those directly
    const txIdsToDelete = new Set<string>(targetBatch?.createdTxIds || []);

    // Also double check all user transactions to catch any that match the batchId
    const allTxs = await getAllTransactions(userId, true);
    for (const tx of allTxs) {
      if (tx.batchId === batchId && tx.id) {
        txIdsToDelete.add(tx.id);
      }
    }

    for (const txId of txIdsToDelete) {
      try {
        await deleteTransaction(userId, txId);
        undoneCount++;
      } catch (err) {
        warn(`Failed to delete transaction ${txId} during batch undo:`, err);
      }
    }

    // Remove the batch from recorded batches
    const remainingBatches = batches.filter((b) => b.batchId !== batchId);
    await AsyncStorage.setItem(getBatchesKey(userId), JSON.stringify(remainingBatches));
  } catch (err) {
    warn('Error executing undoImportBatch:', err);
  }

  return undoneCount;
}
