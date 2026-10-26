/**
 * Stale-While-Revalidate (SWR) Snapshot Cache for Rupeo Home Screen
 *
 * Keeps an instant in-memory & persistent cache of Home Screen data:
 * - Total Balance & Cashflow (totalSpend, totalCredit, thisMonthSpend, netBalance)
 * - Upcoming Bills (due in <= 10 days)
 * - Friends & Udhar / Khata summary
 * - Recent Transactions list
 *
 * Enables 0ms Home Screen render with zero white screen, zero spinner, and zero lag.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeJsonParse, withTimeout } from '../safeStorage.ts';
import { log, warn } from '../logger.ts';

export const HOME_SNAPSHOT_STORAGE_KEY = '@rupeo_home_snapshot_v1';

export interface HomeSnapshotData {
  timestamp: number;
  userId: string;
  totalSpend: number;
  totalCredit: number;
  thisMonthSpend: number;
  netBalance: number;
  upcomingBills: any[];
  udharDues: { totalToReceive: number; totalToPay: number } | null;
  recentTransactions: any[];
}

export const DEFAULT_HOME_SNAPSHOT: HomeSnapshotData = {
  timestamp: 0,
  userId: 'local',
  totalSpend: 0,
  totalCredit: 0,
  thisMonthSpend: 0,
  netBalance: 0,
  upcomingBills: [],
  udharDues: null,
  recentTransactions: [],
};

// Hot in-memory cache for synchronous 0ms reads
let inMemorySnapshot: HomeSnapshotData | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSaveSnapshot: HomeSnapshotData | null = null;

/**
 * Returns the cached snapshot synchronously in 0ms if loaded in memory,
 * or default fallback if nothing is loaded yet.
 */
export function getHomeSnapshotSync(userId?: string): HomeSnapshotData | null {
  if (inMemorySnapshot) {
    if (!userId || inMemorySnapshot.userId === userId || inMemorySnapshot.userId === 'local') {
      return inMemorySnapshot;
    }
  }
  return null;
}

/**
 * Reads persistent snapshot from AsyncStorage with a strict 800ms timeout
 * so slow storage reads never stall startup.
 */
export async function loadHomeSnapshotAsync(userId?: string): Promise<HomeSnapshotData> {
  const targetUid = userId || 'local';
  if (inMemorySnapshot && inMemorySnapshot.userId === targetUid) {
    return inMemorySnapshot;
  }

  try {
    const rawPromise = AsyncStorage.getItem(`${HOME_SNAPSHOT_STORAGE_KEY}_${targetUid}`);
    const raw = await withTimeout(rawPromise, 800, null);

    if (raw) {
      const parsed = safeJsonParse<HomeSnapshotData | null>(
        raw,
        null,
        `${HOME_SNAPSHOT_STORAGE_KEY}_${targetUid}`,
        (v) => typeof v === 'object' && v !== null && typeof v.totalSpend === 'number'
      );
      if (parsed) {
        // SAFETY GUARD: If in-memory already holds valid positive balances, do not overwrite with 0 on fallback read
        if (
          inMemorySnapshot &&
          (inMemorySnapshot.totalSpend > 0 || inMemorySnapshot.totalCredit > 0) &&
          parsed.totalSpend === 0 &&
          parsed.totalCredit === 0
        ) {
          parsed.totalSpend = inMemorySnapshot.totalSpend;
          parsed.totalCredit = inMemorySnapshot.totalCredit;
          parsed.thisMonthSpend = inMemorySnapshot.thisMonthSpend;
          parsed.netBalance = inMemorySnapshot.netBalance;
        }
        inMemorySnapshot = parsed;
        return parsed;
      }
    }
  } catch (err) {
    warn('[HomeSnapshotCache] Failed to load async snapshot:', err);
  }

  return inMemorySnapshot || { ...DEFAULT_HOME_SNAPSHOT, userId: targetUid };
}

/**
 * Updates the in-memory snapshot immediately (0ms) and persists to AsyncStorage debounced (500ms).
 */
export function saveHomeSnapshot(
  userId: string,
  partialData: Partial<HomeSnapshotData>,
  isExplicit = false
): HomeSnapshotData {
  const targetUid = userId || 'local';
  const base = inMemorySnapshot?.userId === targetUid ? inMemorySnapshot : DEFAULT_HOME_SNAPSHOT;

  // SAFETY GUARD: Never overwrite an existing cached positive balance with ₹0 on fallback,
  // unless this is an explicit update from user actions (such as deleting transactions)
  const isZeroFallback =
    !isExplicit &&
    partialData.totalSpend === 0 &&
    partialData.totalCredit === 0 &&
    (base.totalSpend > 0 || base.totalCredit > 0 || base.thisMonthSpend > 0);

  const safeTotalSpend = isZeroFallback ? base.totalSpend : (partialData.totalSpend ?? base.totalSpend);
  const safeTotalCredit = isZeroFallback ? base.totalCredit : (partialData.totalCredit ?? base.totalCredit);
  const safeThisMonth = isZeroFallback ? base.thisMonthSpend : (partialData.thisMonthSpend ?? base.thisMonthSpend);
  const safeNetBalance = isZeroFallback ? base.netBalance : (partialData.netBalance ?? base.netBalance);

  const updated: HomeSnapshotData = {
    ...base,
    ...partialData,
    totalSpend: safeTotalSpend,
    totalCredit: safeTotalCredit,
    thisMonthSpend: safeThisMonth,
    netBalance: safeNetBalance,
    userId: targetUid,
    timestamp: Date.now(),
  };

  inMemorySnapshot = updated;
  pendingSaveSnapshot = updated;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(async () => {
    saveDebounceTimer = null;
    if (!pendingSaveSnapshot) return;
    const toSave = pendingSaveSnapshot;
    pendingSaveSnapshot = null;
    try {
      await AsyncStorage.setItem(
        `${HOME_SNAPSHOT_STORAGE_KEY}_${toSave.userId}`,
        JSON.stringify(toSave)
      );
    } catch (saveErr) {
      warn('[HomeSnapshotCache] Debounced save failed:', saveErr);
    }
  }, 500);

  return updated;
}

/**
 * Pre-warms the hot in-memory snapshot during early app initialization.
 */
export function prewarmHomeSnapshot(userId?: string): void {
  loadHomeSnapshotAsync(userId).catch(() => {});
}

/**
 * Clears the in-memory snapshot cache (useful for testing and user logout).
 */
export function clearHomeSnapshotMemoryCache(): void {
  inMemorySnapshot = null;
  pendingSaveSnapshot = null;
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
}
