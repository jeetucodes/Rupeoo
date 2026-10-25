/**
 * Self-Healing, Anti-Freeze & Zero-White-Screen Watchdog System
 *
 * Layers:
 * 1. Startup & Resume Watchdog (1.5-second hard limit on white-screen / hung hydration).
 * 2. UI Heartbeat & Anti-Hang Detector (ANR / event-loop starvation detection + Soft UI Reset).
 * 3. Silent Auto-Recovery and Event Hub.
 *
 * STRICT CONSTRAINT:
 * Background Auto-Add Notification and SMS listeners run 24/7 in native Android services
 * and are NEVER killed or interrupted when the UI layer resets or self-heals.
 */

const hideSplash = () => {
  try {
    const splash = require('expo-splash-screen');
    splash?.hideAsync?.().catch?.(() => {});
  } catch {}
};

const getAppState = () => {
  try {
    const rn = require('react-native');
    return rn?.AppState;
  } catch {
    return null;
  }
};

const getKeyboard = () => {
  try {
    const rn = require('react-native');
    return rn?.Keyboard;
  } catch {
    return null;
  }
};

import { warn, log, error as logError } from '../logger.ts';
import { recordCrash } from '../crashReporting.ts';
import { prewarmHomeSnapshot } from './HomeSnapshotCache.ts';

export const WATCHDOG_TIMEOUT_MS = 1500;
export const HEARTBEAT_INTERVAL_MS = 500;
export const HEARTBEAT_STALL_THRESHOLD_MS = 1600;
export const MAX_RECOVERY_RETRIES_PER_SESSION = 2;

export interface WatchdogMetrics {
  recoveryCount: number;
  lastRecoveryReason: string | null;
  lastRecoveryTimestamp: number | null;
  heartbeatRunning: boolean;
  activeDatabaseWrites: number;
  activeFormCount: number;
  isUserTyping: boolean;
  isInterruptionBlocked: boolean;
}

type VoidListener = () => void;
type ResetListener = (reason: string) => void;

class SelfHealingWatchdogService {
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatTick: number = Date.now();
  private isHomeRendered: boolean = false;
  private isInitialized: boolean = false;
  private appState: string = 'active';

  private bypassLoadingListeners: Set<VoidListener> = new Set();
  private softResetListeners: Set<ResetListener> = new Set();
  private recoveryListeners: Set<(reason: string) => void> = new Set();

  private recoveryCount: number = 0;
  private lastRecoveryReason: string | null = null;
  private lastRecoveryTimestamp: number | null = null;

  // Strict Safety Guards
  private activeDatabaseWrites: number = 0;
  private activeFormCount: number = 0;
  private isUserTyping: boolean = false;
  private activeFormTags: Set<string> = new Set();

  /**
   * Initializes the Self-Healing Watchdog system.
   * Safe to call multiple times (idempotent).
   */
  public initialize(userId?: string): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    log('[SelfHealingWatchdog] Initializing Self-Healing Watchdog & Anti-Freeze system...');

    // 1. Prewarm SWR Home snapshot cache in memory
    prewarmHomeSnapshot(userId);

    // 2. Start initial launch watchdog (1.5s max)
    this.armWatchdog('startup');

    // 3. Start lightweight UI heartbeat monitor
    this.startHeartbeat();

    // 4. Listen to AppState transitions for onResume / foreground transitions
    getAppState()?.addEventListener?.('change', (nextState: string) => {
      const wasBackground = this.appState === 'background' || this.appState === 'inactive';
      this.appState = nextState;

      if (nextState === 'active' && wasBackground) {
        log('[SelfHealingWatchdog] App resumed to foreground. Heartbeat refreshed, disarming watchdog.');
        this.lastHeartbeatTick = Date.now();
        this.disarmWatchdog();
        hideSplash();
        this.startHeartbeat();
      } else if (nextState !== 'active') {
        this.disarmWatchdog();
        this.stopHeartbeat();
      }
    });

    // 5. Install global JS unhandled exception catcher
    this.installGlobalCatcher();

    // 6. Setup automatic keyboard visibility tracking for user typing detection
    try {
      const keyboard = getKeyboard();
      if (keyboard?.addListener) {
        keyboard.addListener('keyboardDidShow', () => {
          this.isUserTyping = true;
        });
        keyboard.addListener('keyboardDidHide', () => {
          this.isUserTyping = false;
        });
      }
    } catch {}
  }

  /**
   * Marks the start of a database write operation.
   * Returns a cleanup function to be called when the write completes.
   * Ensures the UI is NEVER reset or interrupted mid-write.
   */
  public beginDatabaseWrite(): () => void {
    this.activeDatabaseWrites++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.activeDatabaseWrites = Math.max(0, this.activeDatabaseWrites - 1);
      }
    };
  }

  /**
   * Marks a form interaction as active (e.g. adding an expense via '+', filling details).
   * Returns a cleanup function to release the form lock.
   */
  public beginFormInteraction(tag: string = 'form'): () => void {
    this.activeFormCount++;
    this.activeFormTags.add(tag);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.activeFormCount = Math.max(0, this.activeFormCount - 1);
        this.activeFormTags.delete(tag);
      }
    };
  }

  public setTypingActive(typing: boolean): void {
    this.isUserTyping = typing;
  }

  public setFormActive(active: boolean, tag: string = 'form'): void {
    if (active) {
      this.activeFormCount++;
      this.activeFormTags.add(tag);
    } else {
      this.activeFormCount = Math.max(0, this.activeFormCount - 1);
      this.activeFormTags.delete(tag);
    }
  }

  /**
   * Strict Safety Guard: Verifies whether the UI can safely be interrupted or soft-reset.
   * NEVER interrupts when:
   * 1. User is actively typing
   * 2. A form is open / being filled
   * 3. A database write is currently in progress
   * 4. Session recovery limit (max 2) is reached
   */
  public isInterruptionBlocked(): { blocked: boolean; reason?: string } {
    if (this.activeDatabaseWrites > 0) {
      return { blocked: true, reason: 'database_write_in_progress' };
    }
    if (this.isUserTyping) {
      return { blocked: true, reason: 'user_actively_typing' };
    }
    if (this.activeFormCount > 0) {
      return { blocked: true, reason: `form_active: ${Array.from(this.activeFormTags).join(', ')}` };
    }
    if (this.recoveryCount >= MAX_RECOVERY_RETRIES_PER_SESSION) {
      return { blocked: true, reason: `max_retries_exceeded: ${this.recoveryCount}/${MAX_RECOVERY_RETRIES_PER_SESSION}` };
    }
    return { blocked: false };
  }

  public resetSessionRecoveryCount(): void {
    this.recoveryCount = 0;
    this.lastRecoveryReason = null;
    this.lastRecoveryTimestamp = null;
  }

  /**
   * Arms a strict 1.5-second watchdog timer.
   * If Home Screen does not report rendered in 1500ms, triggers auto-healing.
   */
  public armWatchdog(reason: 'startup' | 'resume' | 'navigation' = 'startup'): void {
    this.disarmWatchdog();

    // Only mark unrendered on initial cold startup.
    // On resume or navigation, if the app was already rendered and healthy,
    // do not falsely mark it unrendered (which causes false-positive watchdog timeouts).
    if (reason === 'startup') {
      this.isHomeRendered = false;
    }

    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      if (!this.isHomeRendered) {
        this.triggerWatchdogRecovery(`watchdog_timeout_${reason}`);
      }
    }, WATCHDOG_TIMEOUT_MS);
  }

  /**
   * Disarms the watchdog timer once Home Screen rendering completes cleanly.
   */
  public disarmWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Called by Dashboard/Home Screen when its initial paint / render completes.
   */
  public notifyHomeRendered(): void {
    this.isHomeRendered = true;
    this.disarmWatchdog();
    // Guarantee splash screen is hidden
    hideSplash();
  }

  /**
   * Called when any primary app screen (e.g. notifications, add, budget, daily report, transaction)
   * renders, cleanly disarming the startup watchdog to avoid false-positive timeout recoveries.
   */
  public notifyScreenRendered(screenName: string = 'screen'): void {
    this.isHomeRendered = true;
    this.disarmWatchdog();
    hideSplash();
  }

  /**
   * Triggers automatic healing when watchdog expires (>1.5s).
   * Bypasses hung loaders, force-renders cached state, and notifies listeners.
   */
  public triggerWatchdogRecovery(reason: string): void {
    // 1. Guard against infinite reload loops (max 2 retries per session)
    if (this.recoveryCount >= MAX_RECOVERY_RETRIES_PER_SESSION) {
      warn(`[SelfHealingWatchdog] 🛑 Max auto-recovery retries (${MAX_RECOVERY_RETRIES_PER_SESSION}) reached for this session. Halting recovery to prevent reload loops.`);
      this.disarmWatchdog();
      hideSplash();
      return;
    }

    // 2. Guard against interrupting active user typing, forms, or DB writes
    const guard = this.isInterruptionBlocked();
    if (guard.blocked) {
      warn(`[SelfHealingWatchdog] 🛑 Watchdog recovery suppressed (${guard.reason}). Active user flow preserved.`);
      this.disarmWatchdog();
      hideSplash();
      return;
    }

    log(`[SelfHealingWatchdog] ⚠️ Triggering auto-recovery: ${reason}`);
    this.recoveryCount++;
    this.lastRecoveryReason = reason;
    this.lastRecoveryTimestamp = Date.now();

    // 1. Immediately dismiss any splash screen to kill white screen
    hideSplash();

    // 2. Notify AuthContext and Home Screen to bypass stuck loading screens
    this.bypassLoadingListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        warn('[SelfHealingWatchdog] Error in bypass listener:', err);
      }
    });

    // 3. Notify recovery observers
    this.recoveryListeners.forEach((listener) => {
      try {
        listener(reason);
      } catch {}
    });

    // 4. Record diagnostic crash report (non-fatal, auto-healed)
    recordCrash(
      new Error(`[SelfHealingWatchdog] Auto-healed: ${reason}`),
      false,
      'startup_watchdog'
    ).catch(() => {});
  }

  /**
   * Triggers a lightweight "Soft UI Reset" (<1s).
   * Re-mounts the root React UI tree cleanly without killing native background services.
   */
  public triggerSoftUIReset(reason: string): void {
    // 1. Guard against infinite reload loops (max 2 retries per session)
    if (this.recoveryCount >= MAX_RECOVERY_RETRIES_PER_SESSION) {
      warn(`[SelfHealingWatchdog] 🛑 Max soft UI resets (${MAX_RECOVERY_RETRIES_PER_SESSION}) reached for this session. Halting reset to prevent reload loops.`);
      this.disarmWatchdog();
      return;
    }

    // 2. Guard against interrupting active user typing, forms, or DB writes
    const guard = this.isInterruptionBlocked();
    if (guard.blocked) {
      warn(`[SelfHealingWatchdog] 🛑 Soft UI Reset suppressed (${guard.reason}). Active user flow preserved.`);
      this.disarmWatchdog();
      return;
    }

    log(`[SelfHealingWatchdog] 🔄 Triggering Soft UI Reset: ${reason}`);
    this.recoveryCount++;
    this.lastRecoveryReason = reason;
    this.lastRecoveryTimestamp = Date.now();

    this.softResetListeners.forEach((listener) => {
      try {
        listener(reason);
      } catch (err) {
        warn('[SelfHealingWatchdog] Error in soft reset listener:', err);
      }
    });

    // Re-arm watchdog to verify recovery completes within 1.5s
    this.armWatchdog('resume');
  }

  /**
   * Starts a lightweight UI thread heartbeat monitor.
   * Detects event loop freezes / ANRs (>1.5s delay).
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.lastHeartbeatTick = Date.now();
    this.heartbeatInterval = setInterval(() => {
      // Only monitor when app is active in foreground
      if (this.appState !== 'active') {
        this.lastHeartbeatTick = Date.now();
        return;
      }

      const now = Date.now();
      const elapsed = now - this.lastHeartbeatTick;
      this.lastHeartbeatTick = now;

      // If the event loop stalled for > HEARTBEAT_STALL_THRESHOLD_MS (1.6s)
      if (elapsed > HEARTBEAT_STALL_THRESHOLD_MS) {
        warn(`[SelfHealingWatchdog] Event loop delay detected (${elapsed}ms). Triggering auto-heal.`);
        this.triggerWatchdogRecovery('event_loop_stalled');
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stops the UI thread heartbeat monitor when app is in the background
   * to allow CPU to enter deep dormant sleep (0% CPU / battery).
   */
  public stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Global uncaught exception catcher that intercepts fatal JS exceptions
   * and auto-recovers the UI rather than crashing to home screen.
   */
  private installGlobalCatcher(): void {
    try {
      const globalObj = global as any;
      if (globalObj.ErrorUtils && typeof globalObj.ErrorUtils.setGlobalHandler === 'function') {
        const defaultHandler = globalObj.ErrorUtils.getGlobalHandler();
        globalObj.ErrorUtils.setGlobalHandler((err: any, isFatal?: boolean) => {
          logError('[SelfHealingWatchdog] Intercepted unhandled exception:', err, 'fatal:', isFatal);
          recordCrash(err, false, 'global_handler').catch(() => {});

          if (isFatal) {
            // Instead of terminating the app, trigger a Soft UI Reset
            this.triggerSoftUIReset(`unhandled_fatal_exception: ${err?.message || 'unknown'}`);
          }

          if (defaultHandler && !isFatal) {
            defaultHandler(err, false);
          }
        });
      }
    } catch (setupErr) {
      warn('[SelfHealingWatchdog] Failed to install global catcher:', setupErr);
    }
  }

  /**
   * Subscribes to loading-bypass events (force loading = false).
   */
  public onBypassLoading(listener: VoidListener): () => void {
    this.bypassLoadingListeners.add(listener);
    return () => {
      this.bypassLoadingListeners.delete(listener);
    };
  }

  /**
   * Subscribes to Soft UI Reset events.
   */
  public onSoftReset(listener: ResetListener): () => void {
    this.softResetListeners.add(listener);
    return () => {
      this.softResetListeners.delete(listener);
    };
  }

  /**
   * Subscribes to general auto-recovery events.
   */
  public onRecovery(listener: (reason: string) => void): () => void {
    this.recoveryListeners.add(listener);
    return () => {
      this.recoveryListeners.delete(listener);
    };
  }

  /**
   * Returns current watchdog diagnostic metrics.
   */
  public getMetrics(): WatchdogMetrics {
    return {
      recoveryCount: this.recoveryCount,
      lastRecoveryReason: this.lastRecoveryReason,
      lastRecoveryTimestamp: this.lastRecoveryTimestamp,
      heartbeatRunning: this.heartbeatInterval !== null,
      activeDatabaseWrites: this.activeDatabaseWrites,
      activeFormCount: this.activeFormCount,
      isUserTyping: this.isUserTyping,
      isInterruptionBlocked: this.isInterruptionBlocked().blocked,
    };
  }
}

export const SelfHealingWatchdog = new SelfHealingWatchdogService();
