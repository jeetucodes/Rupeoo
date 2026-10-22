import { Linking, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppConfig } from '@/context/AuthContext';
import { APP_VERSION, APP_VERSION_CODE } from '@/constants/version';
import {
  UpdateMode,
  CheckUpdateParams,
  AppUpdateState,
  PLAY_STORE_PACKAGE_NAME,
  PLAY_STORE_MARKET_URL,
  PLAY_STORE_WEB_URL,
  STORAGE_LAST_UPDATE_PROMPTED_KEY,
  compareSemver,
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
  compareSemver,
  determineUpdateMode,
};

// ---------------------------------------------------------------------------
// Native / Platform Version Code Helper
// ---------------------------------------------------------------------------

/**
 * Reads the installed Android versionCode from expo-constants with APP_VERSION_CODE fallback.
 * Returns APP_VERSION_CODE or 0 if unable to read or parse.
 */
export function getInstalledVersionCode(): number {
  try {
    const raw =
      Constants.expoConfig?.android?.versionCode ??
      (Constants as any).platform?.android?.versionCode ??
      (Constants as any).nativeBuildVersion ??
      (Constants as any).manifest?.android?.versionCode ??
      APP_VERSION_CODE;
    const parsed = Number(raw);
    return isNaN(parsed) || parsed < 0 ? APP_VERSION_CODE : parsed;
  } catch {
    return APP_VERSION_CODE;
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

export async function clearLastUpdatePromptedTimestamp(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_LAST_UPDATE_PROMPTED_KEY);
  } catch {}
}

// ---------------------------------------------------------------------------
// Navigation / Fallback Helper
// ---------------------------------------------------------------------------

/**
 * Opens Google Play Store listing directly using the native market intent,
 * with web browser fallback, or custom URL if provided.
 */
export async function openPlayStoreListing(customUrl?: string): Promise<void> {
  if (customUrl && typeof customUrl === 'string' && customUrl.trim().length > 0) {
    const cleanUrl = customUrl.trim();
    try {
      const canOpen = await Linking.canOpenURL(cleanUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(cleanUrl);
        return;
      }
    } catch {}
  }

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
 * Triggers the update flow by navigating the user directly to the Google Play Store or custom link.
 */
export async function startAppUpdate(customUrl?: string): Promise<void> {
  await openPlayStoreListing(customUrl);
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
    installedVersion: APP_VERSION,
    latestVersionCode: undefined,
    latestVersion: undefined,
    minSupportedVersionCode: undefined,
    minSupportedVersion: undefined,
    title: undefined,
    message: undefined,
    updateUrl: undefined,
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
        installedVersion: APP_VERSION,
        latestVersionCode: appConfig.latestVersionCode,
        latestVersion: appConfig.latestVersion,
        minSupportedVersionCode: appConfig.minSupportedVersionCode,
        minSupportedVersion: appConfig.minSupportedVersion,
        updatePromptEnabled: appConfig.updatePromptEnabled,
        forceUpdate: appConfig.forceUpdate,
        lastPromptedAt: lastPrompted,
        cooldownHours: appConfig.updateCooldownHours ?? 24,
        adminUpdatedAt: appConfig.updatedAt,
      });

      setUpdateState(prev => ({
        ...prev,
        mode,
        installedVersionCode: installed,
        installedVersion: APP_VERSION,
        latestVersionCode: appConfig.latestVersionCode,
        latestVersion: appConfig.latestVersion,
        minSupportedVersionCode: appConfig.minSupportedVersionCode,
        minSupportedVersion: appConfig.minSupportedVersion,
        forceUpdate: appConfig.forceUpdate,
        title: appConfig.updateTitle,
        message: appConfig.updateMessage,
        updateUrl: appConfig.updateUrl,
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

  // Live remote sync: Re-check whenever admin modifies appConfig in Firestore
  const prevEnabledRef = useRef<boolean | undefined>(appConfig?.updatePromptEnabled);
  const prevUpdatedAtRef = useRef<number | undefined>(appConfig?.updatedAt);

  useEffect(() => {
    if (!appConfig || !isAllowedRoute) return;

    const wasEnabled = prevEnabledRef.current;
    const isNowEnabled = appConfig.updatePromptEnabled !== false;
    const prevUpdatedAt = prevUpdatedAtRef.current;
    const nowUpdatedAt = appConfig.updatedAt;

    prevEnabledRef.current = appConfig.updatePromptEnabled;
    prevUpdatedAtRef.current = appConfig.updatedAt;

    // If admin explicitly turned the update ON or broadcasted a new update after dismissal:
    const turnedOn = wasEnabled === false && isNowEnabled === true;
    const newlyBroadcasted = Boolean(
      nowUpdatedAt && (!prevUpdatedAt || nowUpdatedAt > prevUpdatedAt)
    );

    if (turnedOn || newlyBroadcasted) {
      // Clear the 'Later' suppression timestamp so popup displays immediately
      clearLastUpdatePromptedTimestamp().finally(() => {
        performCheck();
      });
      return;
    }

    performCheck();
  }, [
    appConfig?.updatePromptEnabled,
    appConfig?.latestVersionCode,
    appConfig?.latestVersion,
    appConfig?.forceUpdate,
    appConfig?.updatedAt,
    appConfig?.updateCooldownHours,
    isAllowedRoute,
    performCheck,
  ]);

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
