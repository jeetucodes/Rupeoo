import { AppState, Platform, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warn, log } from './logger';
import { getSyncQueue, getOfflineTransactions } from './offlineSync';
import { syncUserOfflineData, checkIsOnline } from './database';
import { pullFromCloud } from './cloudSync';

export interface SyncEngineMetrics {
  totalRuns: number;
  totalSkipped: number;
  totalFailures: number;
  lastRunTimestamp: number | null;
  lastDurationMs: number | null;
}

// Dev-only metrics container
const metrics: SyncEngineMetrics = {
  totalRuns: 0,
  totalSkipped: 0,
  totalFailures: 0,
  lastRunTimestamp: null,
  lastDurationMs: null,
};

export function getSyncEngineMetrics(): SyncEngineMetrics | null {
  if (!__DEV__) return null;
  return { ...metrics };
}

// Single-flight execution lock
let isSyncInProgress = false;
let currentUserId: string | null = null;
let debouncedTimer: any = null;
let slowFallbackInterval: any = null;
let dirtyRetryTimer: any = null;
let backoffDelayMs = 5000;
const MAX_BACKOFF_MS = 60000;
const SLOW_FALLBACK_INTERVAL_MS = 12 * 60 * 1000; // 12 minutes
let lastSyncTimestamp = 0;

/**
 * Checks if the local database has pending changes that require remote sync.
 */
async function hasDirtyChanges(userId: string): Promise<boolean> {
  try {
    const queue = await getSyncQueue(userId);
    if (queue && queue.length > 0) return true;

    const localTxs = await getOfflineTransactions(userId);
    const hasPendingLocal = localTxs.some((t) => t.syncStatus === 'pending' || t.syncStatus === 'failed');
    if (hasPendingLocal) return true;

    // Check if cloud sync timestamp is older than slow fallback interval
    const now = Date.now();
    if (now - lastSyncTimestamp >= SLOW_FALLBACK_INTERVAL_MS) {
      return true;
    }

    return false;
  } catch {
    return true; // If check fails, run safely
  }
}

function startDirtyRetryLoop(userId: string) {
  // Never start retry loops in background, headless, or dormant states
  if (typeof AppState !== 'undefined' && AppState.currentState !== 'active') return;
  if (dirtyRetryTimer || !userId) return;
  dirtyRetryTimer = setInterval(async () => {
    if (typeof AppState !== 'undefined' && AppState.currentState !== 'active') {
      stopDirtyRetryLoop();
      return;
    }
    const dirty = await hasDirtyChanges(userId);
    if (!dirty) {
      stopDirtyRetryLoop();
      return;
    }
    const online = await checkIsOnline();
    if (online) {
      stopDirtyRetryLoop();
      await syncNow(userId, true);
    }
  }, 5000);
}

function stopDirtyRetryLoop() {
  if (dirtyRetryTimer) {
    clearInterval(dirtyRetryTimer);
    dirtyRetryTimer = null;
  }
}

/**
 * Single-flight core sync function.
 */
export async function syncNow(userId: string, force = false): Promise<boolean> {
  if (!userId) return false;

  // Single-flight lock: never allow parallel overlapping syncs
  if (isSyncInProgress) {
    if (__DEV__) {
      metrics.totalSkipped++;
    }
    return false;
  }

  // Never sync if app is in background
  if (typeof AppState !== 'undefined' && AppState.currentState !== 'active') {
    if (__DEV__) {
      metrics.totalSkipped++;
    }
    return false;
  }

  // Cooldown check: skip if last sync finished less than 60s ago unless forced
  const MIN_SYNC_INTERVAL_MS = 60000;
  if (!force && Date.now() - lastSyncTimestamp < MIN_SYNC_INTERVAL_MS) {
    if (__DEV__) {
      metrics.totalSkipped++;
    }
    return false;
  }

  // Dirty check: skip if nothing changed unless forced
  if (!force) {
    const isDirty = await hasDirtyChanges(userId);
    if (!isDirty) {
      if (__DEV__) {
        metrics.totalSkipped++;
      }
      return false;
    }
  }

  const isOnline = await checkIsOnline();
  if (!isOnline) {
    if (__DEV__) {
      metrics.totalSkipped++;
    }
    if (typeof AppState !== 'undefined' && AppState.currentState === 'active') {
      const dirty = await hasDirtyChanges(userId);
      if (dirty) {
        startDirtyRetryLoop(userId);
      }
    }
    return false;
  }

  isSyncInProgress = true;
  const startTime = Date.now();

  try {
    // 1. Flush offline sync actions & pull remote data
    await syncUserOfflineData(userId);

    // Only pull full cloud data if local database has 0 transactions (fresh install/re-login)
    const localTxs = await getOfflineTransactions(userId);
    if (localTxs.length === 0) {
      await pullFromCloud(userId, undefined, { silent: true });
    }

    lastSyncTimestamp = Date.now();
    backoffDelayMs = 5000; // Reset backoff on success
    stopDirtyRetryLoop();

    if (__DEV__) {
      metrics.totalRuns++;
      metrics.lastRunTimestamp = lastSyncTimestamp;
      metrics.lastDurationMs = Date.now() - startTime;
    }

    return true;
  } catch (err) {
    if (__DEV__) {
      metrics.totalFailures++;
    }
    warn('[SyncEngine] Sync error caught:', err);

    // Exponential backoff capped at 60 seconds (foreground active only)
    backoffDelayMs = Math.min(backoffDelayMs * 2, MAX_BACKOFF_MS);
    if (typeof AppState !== 'undefined' && AppState.currentState === 'active') {
      const dirty = await hasDirtyChanges(userId);
      if (dirty) {
        startDirtyRetryLoop(userId);
      }
    }
    return false;
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Debounced trigger after local writes (debounces rapid local edits ~1.5s).
 */
export function triggerDebouncedSync(userId: string, delayMs = 1500): void {
  if (!userId) return;

  if (debouncedTimer) {
    clearTimeout(debouncedTimer);
  }

  debouncedTimer = setTimeout(() => {
    debouncedTimer = null;
    syncNow(userId, true).catch(() => {});
  }, delayMs);
}

/**
 * Initializes the event-driven sync engine for an authenticated user.
 * Cleanly unbinds on logout or component unmount.
 */
export function initSyncEngine(userId: string): () => void {
  if (!userId) return () => {};

  currentUserId = userId;

  // 1. Initial sync after slight startup delay
  const initialTimer = setTimeout(() => {
    syncNow(userId, false).catch(() => {});
  }, 2500);

  // 2. Slow fallback interval (every 12 minutes only when active)
  slowFallbackInterval = setInterval(() => {
    if (typeof AppState !== 'undefined' && AppState.currentState === 'active') {
      syncNow(userId, false).catch(() => {});
    }
  }, SLOW_FALLBACK_INTERVAL_MS);

  // 3. Foreground resume trigger: debounce 2s, run AFTER interactions so UI is responsive first
  let resumeTimer: any = null;
  const appStateSub = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        resumeTimer = null;
        InteractionManager.runAfterInteractions(() => {
          if (typeof AppState !== 'undefined' && AppState.currentState === 'active') {
            syncNow(userId, false).catch(() => {});
          }
        });
      }, 2000);
    } else {
      stopDirtyRetryLoop();
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
      if (debouncedTimer) {
        clearTimeout(debouncedTimer);
        debouncedTimer = null;
      }
    }
  });

  // 4. Web online event listener
  const onWebOnline = () => {
    syncNow(userId, true).catch(() => {});
  };
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', onWebOnline);
  }

  return () => {
    clearTimeout(initialTimer);
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
    if (slowFallbackInterval) {
      clearInterval(slowFallbackInterval);
      slowFallbackInterval = null;
    }
    stopDirtyRetryLoop();
    if (debouncedTimer) {
      clearTimeout(debouncedTimer);
      debouncedTimer = null;
    }
    appStateSub.remove();
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('online', onWebOnline);
    }
    currentUserId = null;
  };
}
