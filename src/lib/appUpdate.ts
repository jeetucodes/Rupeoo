import { Linking, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppConfig } from '@/context/AuthContext';
import {
  UpdateMode,
  CheckUpdateParams,
  AppUpdateState,
  PLAY_STORE_PACKAGE_NAME,
  PLAY_STORE_MARKET_URL,
  PLAY_STORE_WEB_URL,
  STORAGE_LAST_UPDATE_PROMPTED_KEY,
  determineUpdateMode,
} from './appUpdateCore';

export {
  UpdateMode,
  CheckUpdateParams,
  AppUpdateState,
  PLAY_STORE_PACKAGE_NAME,
  PLAY_STORE_MARKET_URL,
  PLAY_STORE_WEB_URL,
  STORAGE_LAST_UPDATE_PROMPTED_KEY,
  determineUpdateMode,
};

// ---------------------------------------------------------------------------
// Native / Platform Version Code Helper
// ---------------------------------------------------------------------------

/**
 * Reads the installed Android versionCode from expo-constants.
 * Returns 0 if unable to read or parse.
 */
export function getInstalledVersionCode(): number {
  try {
    const raw =
      Constants.expoConfig?.android?.versionCode ??
      (Constants as any).platform?.android?.versionCode ??
      (Constants as any).nativeBuildVersion ??
      (Constants as any).manifest?.android?.versionCode;
    const parsed = Number(raw);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// AsyncStorage Helpers
// ---------------------------------------------------------------------------

export async function getLastUpdatePromptedTimestamp(): Promise<number | null> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_LAST_UPDATE_PROMPTED_KEY);
    if (!val) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export async function setLastUpdatePromptedTimestamp(ts: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_LAST_UPDATE_PROMPTED_KEY, String(ts));
  } catch {}
}

// ---------------------------------------------------------------------------
// Navigation / Fallback Helper
// ---------------------------------------------------------------------------

/**
 * Opens Google Play Store listing directly using the native market intent,
 * with web browser fallback.
 */
export async function openPlayStoreListing(): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(PLAY_STORE_MARKET_URL).catch(() => false);
    if (supported) {
      await Linking.openURL(PLAY_STORE_MARKET_URL);
      return;
    }
  } catch {}

  try {
    await Linking.openURL(PLAY_STORE_WEB_URL);
  } catch (err) {
    if (__DEV__) {
      console.warn('[AppUpdate] Failed to open Play Store listing:', err);
    }
  }
}

/**
 * Triggers the update flow by navigating the user directly to the Google Play Store.
 */
export async function startAppUpdate(): Promise<void> {
  await openPlayStoreListing();
}

// ---------------------------------------------------------------------------
// React Hook: useAppUpdate
// ---------------------------------------------------------------------------

export function useAppUpdate(
  appConfig: AppConfig | undefined,
  isAllowedRoute: boolean
) {
  const [updateState, setUpdateState] = useState<AppUpdateState>({
    mode: 'NONE',
    installedVersionCode: getInstalledVersionCode(),
    latestVersionCode: undefined,
    minSupportedVersionCode: undefined,
    title: undefined,
    message: undefined,
  });

  const isCheckingRef = useRef(false);

  const performCheck = useCallback(async () => {
    if (!appConfig || !isAllowedRoute || isCheckingRef.current) return;
    if (appConfig.maintenanceMode) return; // Maintenance mode has top priority

    isCheckingRef.current = true;
    try {
      const installed = getInstalledVersionCode();
      const lastPrompted = await getLastUpdatePromptedTimestamp();

      const mode = determineUpdateMode({
        installedVersionCode: installed,
        latestVersionCode: appConfig.latestVersionCode,
        minSupportedVersionCode: appConfig.minSupportedVersionCode,
        lastPromptedAt: lastPrompted,
        cooldownHours: appConfig.updateCooldownHours ?? 24,
      });

      setUpdateState(prev => ({
        ...prev,
        mode,
        installedVersionCode: installed,
        latestVersionCode: appConfig.latestVersionCode,
        minSupportedVersionCode: appConfig.minSupportedVersionCode,
        title: appConfig.updateTitle,
        message: appConfig.updateMessage,
      }));
    } catch (e) {
      if (__DEV__) {
        console.log('[AppUpdate] Check failed silently:', e);
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, [appConfig, isAllowedRoute]);

  // Check on initial load (with delay after first render so startup is never delayed)
  useEffect(() => {
    const timer = setTimeout(() => {
      performCheck();
    }, 1500);
    return () => clearTimeout(timer);
  }, [performCheck]);

  // Re-check when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        performCheck();
      }
    });
    return () => subscription.remove();
  }, [performCheck]);

  const dismissSoftUpdate = useCallback(async () => {
    await setLastUpdatePromptedTimestamp();
    setUpdateState(prev => ({ ...prev, mode: 'NONE' }));
  }, []);

  return {
    updateState,
    dismissSoftUpdate,
    performCheck,
  };
}
