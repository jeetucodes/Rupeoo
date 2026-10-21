import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalDateString } from '@/lib/dateUtils';
import {
  getAllTransactions,
  getUserSettings,
  getRecurringBills,
  getCategoryBudgets,
  getStartingBalanceProfile,
} from '@/lib/database';
import { getAllFriendsSummaries } from '@/lib/udharStorage';
import { log, warn, error } from '@/lib/logger';

export const WIDGET_SNAPSHOT_KEY = 'rupeo_widget_snapshot_v1';
export const WIDGET_LOGGED_OUT_KEY = 'rupeo_widget_logged_out_v1';

export interface WidgetSnapshot {
  version: 1;
  updatedAt: number;
  snapshotDate: string; // YYYY-MM-DD
  currency: string;
  todaySpent: number;
  todayIncome: number;
  monthSpent: number;
  monthIncome: number;
  balance: number;
  dailyLimit: number;
  budgetTotal: number;
  budgetUsed: number;
  topCategories: Array<{
    name: string;
    amount: number;
    percentage: number;
    color?: string;
  }>;
  recentTransactions: Array<{
    id: string;
    title: string;
    category: string;
    amount: number;
    type: 'debit' | 'credit';
    date: string;
    time: string;
  }>;
  udhar: {
    toReceive: number;
    toPay: number;
    topPeople: Array<{
      name: string;
      balance: number;
    }>;
  };
  goals: Array<{
    name: string;
    target: number;
    current: number;
    percentage: number;
  }>;
  upcomingBills: Array<{
    id: string;
    title: string;
    amount: number;
    dueDate: string;
    daysLeft: number;
    isDueSoon: boolean;
  }>;
  weeklySpend: Array<{
    day: string; // 'Mon', 'Tue', etc.
    date: string; // YYYY-MM-DD
    amount: number;
    isToday: boolean;
  }>;
}

/**
 * Reads raw snapshot from AsyncStorage.
 * Safe to call in headless JS context (pure AsyncStorage, no Firebase).
 */
export async function getWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    return parsed as WidgetSnapshot;
  } catch (err) {
    warn('[WidgetSnapshot] Error reading snapshot:', err);
    return null;
  }
}

/**
 * Checks whether user is explicitly logged out.
 */
export async function isWidgetLoggedOut(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(WIDGET_LOGGED_OUT_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Prepares the snapshot for rendering, adjusting for midnight rollover.
 * If the current local date is different from the snapshotDate:
 * - todaySpent & todayIncome reset to values computed only from recentTransactions matching today.
 * - weeklySpend updates `isToday` marker.
 * - if month changed, monthly totals reset.
 */
export function getRenderSnapshot(snapshot: WidgetSnapshot | null): WidgetSnapshot | null {
  if (!snapshot) return null;

  const todayStr = getLocalDateString();
  if (snapshot.snapshotDate === todayStr) {
    return snapshot;
  }

  // Midnight rollover occurred! Recalculate time-dependent fields
  const currentMonth = todayStr.substring(0, 7);
  const snapshotMonth = snapshot.snapshotDate ? snapshot.snapshotDate.substring(0, 7) : '';

  let todaySpent = 0;
  let todayIncome = 0;
  let monthSpent = currentMonth === snapshotMonth ? snapshot.monthSpent : 0;
  let monthIncome = currentMonth === snapshotMonth ? snapshot.monthIncome : 0;

  (snapshot.recentTransactions || []).forEach((tx) => {
    if (tx.date === todayStr) {
      if (tx.type === 'debit') todaySpent += Number(tx.amount) || 0;
      if (tx.type === 'credit') todayIncome += Number(tx.amount) || 0;
    }
  });

  const weeklySpend = (snapshot.weeklySpend || []).map((dayItem) => ({
    ...dayItem,
    isToday: dayItem.date === todayStr,
  }));

  return {
    ...snapshot,
    snapshotDate: todayStr,
    todaySpent,
    todayIncome,
    monthSpent,
    monthIncome,
    budgetUsed: monthSpent,
    weeklySpend,
  };
}

/**
 * Saves the widget snapshot to AsyncStorage.
 * Validates that good existing snapshots are not overwritten with null/empty payload.
 */
export async function saveWidgetSnapshot(snapshot: WidgetSnapshot): Promise<boolean> {
  try {
    if (!snapshot || !snapshot.updatedAt || typeof snapshot.todaySpent !== 'number') {
      warn('[WidgetSnapshot] Rejected invalid snapshot write');
      return false;
    }
    await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
    await AsyncStorage.removeItem(WIDGET_LOGGED_OUT_KEY);
    return true;
  } catch (err) {
    warn('[WidgetSnapshot] Error saving snapshot:', err);
    return false;
  }
}

/**
 * Clears the snapshot upon logout and sets the logged-out flag.
 */
export async function clearWidgetSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WIDGET_SNAPSHOT_KEY);
    await AsyncStorage.setItem(WIDGET_LOGGED_OUT_KEY, 'true');
  } catch (err) {
    warn('[WidgetSnapshot] Error clearing snapshot:', err);
  }
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Builds a fresh, comprehensive snapshot from current app data sources
 * (local Firestore offline cache / memory cache).
 */
export async function buildWidgetSnapshotFromApp(userId?: string): Promise<WidgetSnapshot | null> {
  if (!userId) {
    log('[WidgetSnapshot] Skipping build: No userId provided');
    return null;
  }

  try {
    const todayStr = getLocalDateString();
    const currentMonthPrefix = todayStr.substring(0, 7); // e.g. "2026-10"

    const [
      transactionsList,
      settings,
      billsList,
      udharSummary,
      categoryBudgets,
      startingProfile,
    ] = await Promise.all([
      getAllTransactions(userId).catch(() => []),
      getUserSettings(userId).catch(() => null),
      getRecurringBills(userId).catch(() => []),
      getAllFriendsSummaries(userId).catch(() => ({
        friends: [],
        totalToReceive: 0,
        totalToPay: 0,
        netBalance: 0,
      })),
      getCategoryBudgets(userId).catch(() => ({})),
      getStartingBalanceProfile(userId).catch(() => null),
    ]);

    // 1. Calculate today and monthly income & spend
    let todaySpent = 0;
    let todayIncome = 0;
    let monthSpent = 0;
    let monthIncome = 0;
    let totalDebitAllTime = 0;
    let totalCreditAllTime = 0;
    const categoryMonthSpend: Record<string, number> = {};

    // 7-day spend map: from 6 days ago up to today
    const sevenDaysMap: Record<string, { day: string; date: string; amount: number; isToday: boolean }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = getLocalDateString(d);
      const dayName = DAY_LABELS[d.getDay()];
      sevenDaysMap[dStr] = {
        day: dayName,
        date: dStr,
        amount: 0,
        isToday: dStr === todayStr,
      };
    }

    if (Array.isArray(transactionsList) && transactionsList.length > 0) {
      transactionsList.forEach((tx) => {
        if (!tx) return;
        const amt = Number(tx.amount) || 0;
        const txDate = tx.date || '';

        if (tx.type === 'debit') {
          totalDebitAllTime += amt;
          if (txDate.startsWith(todayStr)) {
            todaySpent += amt;
          }
          if (txDate.startsWith(currentMonthPrefix)) {
            monthSpent += amt;
            const cat = (tx.category || 'Others').trim();
            categoryMonthSpend[cat] = (categoryMonthSpend[cat] || 0) + amt;
          }
          if (sevenDaysMap[txDate]) {
            sevenDaysMap[txDate].amount += amt;
          }
        } else if (tx.type === 'credit') {
          totalCreditAllTime += amt;
          if (txDate.startsWith(todayStr)) {
            todayIncome += amt;
          }
          if (txDate.startsWith(currentMonthPrefix)) {
            monthIncome += amt;
          }
        }
      });
    }

    // 2. Net Balance
    const startingBalance = startingProfile?.startingBalance || 0;
    const balance = startingBalance + totalCreditAllTime - totalDebitAllTime;

    // 3. Budgets & Limits
    const monthlyBudget = Number(settings?.monthlyBudget) || 0;
    const dailyLimit =
      Number((settings as any)?.dailyLimit) ||
      (monthlyBudget > 0 ? Math.round(monthlyBudget / 30) : 0);
    const currency = settings?.currency === 'INR' ? '₹' : settings?.currency || '₹';

    // 4. Top Categories
    const topCategories = Object.entries(categoryMonthSpend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: monthSpent > 0 ? Math.min(100, Math.round((amount / monthSpent) * 100)) : 0,
      }));

    // 5. Recent 5 Transactions
    const recentTransactions = (transactionsList || [])
      .slice(0, 5)
      .map((tx: any) => ({
        id: String(tx.id || Math.random()),
        title: String(tx.description || tx.merchant_name || tx.category || 'Transaction'),
        category: String(tx.category || 'General'),
        amount: Number(tx.amount) || 0,
        type: (tx.type === 'credit' ? 'credit' : 'debit') as 'debit' | 'credit',
        date: String(tx.date || todayStr),
        time: String(tx.time || ''),
      }));

    // 6. Udhar
    const udhar = {
      toReceive: Number(udharSummary.totalToReceive) || 0,
      toPay: Number(udharSummary.totalToPay) || 0,
      topPeople: (udharSummary.friends || [])
        .filter((f) => Math.abs(f.balance || 0) > 0)
        .slice(0, 3)
        .map((f) => ({
          name: f.name,
          balance: f.balance,
        })),
    };

    // 7. Goals Progress (from Category Budgets + Overall Budget)
    const goals: WidgetSnapshot['goals'] = [];
    if (monthlyBudget > 0) {
      goals.push({
        name: 'Monthly Budget',
        target: monthlyBudget,
        current: monthSpent,
        percentage: Math.min(100, Math.round((monthSpent / monthlyBudget) * 100)),
      });
    }
    Object.entries(categoryBudgets || {}).forEach(([cat, target]) => {
      if (goals.length >= 3) return;
      const targetAmt = Number(target) || 0;
      if (targetAmt > 0) {
        const spent = categoryMonthSpend[cat] || 0;
        goals.push({
          name: cat,
          target: targetAmt,
          current: spent,
          percentage: Math.min(100, Math.round((spent / targetAmt) * 100)),
        });
      }
    });

    // 8. Upcoming Bills (sorted nearest due date, max 3)
    const nowTimestamp = Date.now();
    const upcomingBills = (billsList || [])
      .map((b: any) => {
        const dueStr = b.nextDueDate || todayStr;
        const dueMs = new Date(dueStr).getTime();
        const daysLeft = Math.ceil((dueMs - nowTimestamp) / (1000 * 60 * 60 * 24));
        return {
          id: String(b.id || Math.random()),
          title: String(b.title || 'Bill'),
          amount: Number(b.amount) || 0,
          dueDate: dueStr,
          daysLeft: isNaN(daysLeft) ? 0 : daysLeft,
          isDueSoon: daysLeft >= 0 && daysLeft <= 3,
        };
      })
      .slice(0, 3);

    // 9. Weekly Spend (ordered by date)
    const weeklySpend = Object.values(sevenDaysMap).sort((a, b) => a.date.localeCompare(b.date));

    const snapshot: WidgetSnapshot = {
      version: 1,
      updatedAt: Date.now(),
      snapshotDate: todayStr,
      currency,
      todaySpent,
      todayIncome,
      monthSpent,
      monthIncome,
      balance,
      dailyLimit,
      budgetTotal: monthlyBudget,
      budgetUsed: monthSpent,
      topCategories,
      recentTransactions,
      udhar,
      goals,
      upcomingBills,
      weeklySpend,
    };

    await saveWidgetSnapshot(snapshot);
    return snapshot;
  } catch (err) {
    error('[WidgetSnapshot] Failed to build widget snapshot:', err);
    return null;
  }
}
