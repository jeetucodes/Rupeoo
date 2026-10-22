import { Platform } from 'react-native';
import { getAutoAddDatabase } from '@/features/autoAdd/sqliteStorage';
import { getOfflineTransactions } from '@/lib/offlineSync';
import { DaySpendingStats } from './types';
import { warn } from '@/lib/logger';

export interface RawTransactionItem {
  id: string;
  amount: number;
  type: string;
  category?: string;
  merchant?: string;
  date?: string;
  timestamp?: number;
  createdAt?: any;
}

/**
 * Returns epoch timestamp boundaries for the local day.
 */
export function getLocalDayBoundaries(targetDate: Date = new Date()): { startMs: number; endMs: number; dateStr: string } {
  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(targetDate);
  end.setHours(23, 59, 59, 999);

  const year = start.getFullYear();
  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  return { startMs: start.getTime(), endMs: end.getTime(), dateStr };
}

/**
 * Fetch and compute today's spending statistics from SQLite + local storage.
 */
export async function computeDaySpendingStats(
  dailyBudget: number = 0,
  userId: string = 'local',
  targetDate: Date = new Date()
): Promise<DaySpendingStats> {
  const { startMs, endMs, dateStr } = getLocalDayBoundaries(targetDate);
  const transactionsMap = new Map<string, RawTransactionItem>();

  // 1. Fetch from SQLite auto_added_transactions (Native)
  if (Platform.OS !== 'web') {
    try {
      const db = getAutoAddDatabase();
      if (db) {
        const rows = db.getAllSync<any>(
          `SELECT id, amount, type, category, merchant, timestamp FROM auto_added_transactions 
           WHERE timestamp >= ? AND timestamp <= ?`,
          [startMs, endMs]
        );
        for (const r of rows) {
          transactionsMap.set(r.id, {
            id: r.id,
            amount: Number(r.amount) || 0,
            type: r.type || 'expense',
            category: r.category || 'General',
            merchant: r.merchant || '',
            timestamp: r.timestamp,
          });
        }
      }
    } catch (err) {
      warn('[Notifications] Error querying SQLite transactions for stats:', err);
    }
  }

  // 2. Fetch from offline transactions (includes manually added & imported transactions)
  try {
    const offlineTxs = await getOfflineTransactions(userId);
    for (const tx of offlineTxs) {
      if (!tx || !tx.id) continue;

      let txTs = 0;
      if (typeof tx.timestamp === 'number') {
        txTs = tx.timestamp;
      } else if (tx.date) {
        const parsed = new Date(tx.date).getTime();
        if (!isNaN(parsed)) txTs = parsed;
      }

      // Check if within today's window or date matches YYYY-MM-DD
      const matchesDate = (txTs >= startMs && txTs <= endMs) || (tx.date && tx.date.startsWith(dateStr));
      if (matchesDate && !transactionsMap.has(tx.id)) {
        transactionsMap.set(tx.id, {
          id: tx.id,
          amount: Number(tx.amount) || 0,
          type: tx.type || 'expense',
          category: tx.category || 'General',
          merchant: tx.merchant || tx.title || '',
          timestamp: txTs,
        });
      }
    }
  } catch (err) {
    warn('[Notifications] Error querying offline transactions for stats:', err);
  }

  // 3. Compute aggregations
  let totalSpent = 0;
  let count = 0;
  let biggest = 0;
  let lastTxTime: number | null = null;
  const categoryTotals: Record<string, number> = {};

  for (const item of transactionsMap.values()) {
    // Only count expenses/debits
    const isExpense = item.type === 'expense' || item.type === 'debit';
    if (!isExpense) continue;

    const amt = Math.abs(item.amount);
    totalSpent += amt;
    count += 1;

    if (amt > biggest) {
      biggest = amt;
    }

    if (item.timestamp && (!lastTxTime || item.timestamp > lastTxTime)) {
      lastTxTime = item.timestamp;
    }

    const cat = item.category || 'General';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
  }

  // Find top category
  let topCategory = 'General';
  let topAmount = 0;
  for (const [cat, sum] of Object.entries(categoryTotals)) {
    if (sum > topAmount) {
      topAmount = sum;
      topCategory = cat;
    }
  }

  const budgetLeft = dailyBudget > 0 ? Math.max(0, dailyBudget - totalSpent) : 0;
  const budgetOver = dailyBudget > 0 ? Math.max(0, totalSpent - dailyBudget) : 0;

  return {
    spent: Math.round(totalSpent * 100) / 100,
    count,
    topCategory,
    topAmount: Math.round(topAmount * 100) / 100,
    biggest: Math.round(biggest * 100) / 100,
    lastTransactionTime: lastTxTime,
    budgetLeft: Math.round(budgetLeft * 100) / 100,
    budgetOver: Math.round(budgetOver * 100) / 100,
  };
}
