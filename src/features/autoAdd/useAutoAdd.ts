import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import {
  getSmsImportSettings,
  saveSmsImportSettings,
  getAutoAddPausedUntil,
  AUTO_ADD_PAUSED_UNTIL_KEY,
} from '@/lib/smsSettings';
import { setSQLiteSetting } from './sqliteStorage';
import { isListenerEnabled, openListenerSettings } from './nativeModule';

import {
  AutoAddStatus,
  PauseDuration,
  calculatePauseTimestamp,
  formatResumeTime,
  formatCountdownMinutes,
} from './autoAddCore';

export {
  AutoAddStatus,
  PauseDuration,
  calculatePauseTimestamp,
  formatResumeTime,
  formatCountdownMinutes,
};

// Module-level listener to synchronize all useAutoAdd instances across the app instantly
const autoAddListeners = new Set<() => void>();

export function notifyAutoAddListeners(): void {
  autoAddListeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export interface UseAutoAddReturn {
  enabled: boolean;
  pausedUntil: number;
  isPaused: boolean;
  status: AutoAddStatus;
  pauseMinutesLeft: number;
  formattedResumeTime: string;
  countdownLabel: string;
  hasNotificationPermission: boolean;
  loading: boolean;
  toggle: () => Promise<boolean>;
  pause: (duration: PauseDuration) => Promise<number>;
  resume: () => Promise<void>;
  refresh: () => Promise<void>;
  openListenerSettings: () => Promise<boolean>;
}

/**
 * Universal Hook for Auto-Add System.
 * Shared by the Total Balance bolt button, the Auto-Add Bottom Sheet, and Settings.
 * Reads fresh values on every event with zero stale cache.
 */
export function useAutoAdd(): UseAutoAddReturn {
  const { user } = useAuth();
  const uid = user?.uid || 'local';

  const [enabled, setEnabled] = useState<boolean>(true);
  const [pausedUntil, setPausedUntil] = useState<number>(0);
  const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [, setTick] = useState<number>(0);

  const isMountedRef = useRef(true);

  // Fresh reader from storage & permissions
  const refresh = useCallback(async () => {
    try {
      const [settings, pauseVal, permissionGranted] = await Promise.all([
        getSmsImportSettings(uid, true),
        getAutoAddPausedUntil(),
        Platform.OS === 'android' ? isListenerEnabled() : Promise.resolve(true),
      ]);

      if (isMountedRef.current) {
        setEnabled(!!settings.autoAddEnabled);
        setPausedUntil(pauseVal > Date.now() ? pauseVal : 0);
        setHasNotificationPermission(permissionGranted);
        setLoading(false);
      }
    } catch {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [uid]);

  // Initial load & module subscription
  useEffect(() => {
    isMountedRef.current = true;
    refresh();

    const listener = () => {
      refresh();
    };
    autoAddListeners.add(listener);

    return () => {
      isMountedRef.current = false;
      autoAddListeners.delete(listener);
    };
  }, [refresh]);

  // Sync on App resume
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  // 30-second interval: automatically refreshes countdown & checks pause expiry
  useEffect(() => {
    const timer = setInterval(() => {
      if (pausedUntil > 0) {
        if (Date.now() >= pausedUntil) {
          // Pause period expired!
          setPausedUntil(0);
          notifyAutoAddListeners();
        } else {
          // Force re-render to update countdown label
          setTick((t) => t + 1);
        }
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [pausedUntil]);

  // Toggle Auto-Add ON/OFF immediately
  const toggle = useCallback(async (): Promise<boolean> => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    const next = !enabled;

    await saveSmsImportSettings(uid, { autoAddEnabled: next });
    if (Platform.OS !== 'web') {
      try {
        setSQLiteSetting('auto_add_enabled', next ? 'true' : 'false');
      } catch {}
    }

    if (next) {
      // If toggling on, clear any pause so auto-add resumes immediately
      await AsyncStorage.removeItem(AUTO_ADD_PAUSED_UNTIL_KEY);
      if (Platform.OS !== 'web') {
        try {
          setSQLiteSetting('auto_add_paused_until', '0');
        } catch {}
      }
      setPausedUntil(0);
    }

    setEnabled(next);
    notifyAutoAddListeners();
    return next;
  }, [enabled, uid]);

  // Pause for duration
  const pause = useCallback(
    async (duration: PauseDuration): Promise<number> => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      const targetTime = calculatePauseTimestamp(duration);
      await AsyncStorage.setItem(AUTO_ADD_PAUSED_UNTIL_KEY, targetTime.toString());
      if (Platform.OS !== 'web') {
        try {
          setSQLiteSetting('auto_add_paused_until', targetTime.toString());
        } catch {}
      }

      setPausedUntil(targetTime);
      notifyAutoAddListeners();
      return targetTime;
    },
    []
  );

  // Resume immediately
  const resume = useCallback(async (): Promise<void> => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    await AsyncStorage.removeItem(AUTO_ADD_PAUSED_UNTIL_KEY);
    if (Platform.OS !== 'web') {
      try {
        setSQLiteSetting('auto_add_paused_until', '0');
      } catch {}
    }

    setPausedUntil(0);
    notifyAutoAddListeners();
  }, []);

  const isPaused = enabled && pausedUntil > Date.now();
  const status: AutoAddStatus = !enabled ? 'off' : isPaused ? 'paused' : 'on';
  const pauseMinutesLeft = Math.max(0, Math.ceil((pausedUntil - Date.now()) / (60 * 1000)));
  const formattedResumeTime = isPaused ? formatResumeTime(pausedUntil) : '';
  const countdownLabel = isPaused ? formatCountdownMinutes(pausedUntil) : '';

  return {
    enabled,
    pausedUntil,
    isPaused,
    status,
    pauseMinutesLeft,
    formattedResumeTime,
    countdownLabel,
    hasNotificationPermission,
    loading,
    toggle,
    pause,
    resume,
    refresh,
    openListenerSettings,
  };
}
