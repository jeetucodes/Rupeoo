import { Platform, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { log, warn } from '@/lib/logger';
import { APP_VERSION } from '@/constants/version';

const LAST_CHECK_KEY = '@rupeo_last_play_update_check';
const MIN_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours throttle for automatic background checks

let inAppUpdatesInstance: any = null;
let isStatusListenerAttached = false;
let isCheckInProgress = false;

/**
 * Safely initialize SpInAppUpdates singleton with error boundary.
 * Uses dynamic require to guarantee 100% crash safety in testing and non-Android environments.
 */
function getInAppUpdates() {
  if (inAppUpdatesInstance) {
    return inAppUpdatesInstance;
  }

  if (Platform.OS !== 'android') {
    return null;
  }

  try {
    const SpInAppUpdates = require('sp-react-native-in-app-updates').default;
    inAppUpdatesInstance = new SpInAppUpdates(false);
    return inAppUpdatesInstance;
  } catch (err) {
    warn('[InAppUpdate] Native module not available or linking issue:', err);
    return null;
  }
}

/**
 * Attach status listener for Google Play FLEXIBLE downloads.
 * When the update finishes downloading in the background (Zomato style),
 * shows an interactive Toast inviting the user to restart and complete installation.
 */
function attachStatusListener(updater: any) {
  if (isStatusListenerAttached || !updater) return;

  try {
    const { IAUInstallStatus } = require('sp-react-native-in-app-updates');
    updater.addStatusUpdateListener((event: any) => {
      log('[InAppUpdate] Download Status event:', event?.status);

      if (event?.status === IAUInstallStatus.DOWNLOADED) {
        Toast.show({
          type: 'info',
          text1: 'Update Ready to Install 🚀',
          text2: 'Tap here to restart Rupeo and apply the update.',
          visibilityTime: 15000,
          autoHide: false,
          onPress: () => {
            Toast.hide();
            try {
              updater.installUpdate();
            } catch (err) {
              warn('[InAppUpdate] installUpdate error:', err);
            }
          },
        });
      }
    });

    isStatusListenerAttached = true;
  } catch (err) {
    warn('[InAppUpdate] Could not attach status listener:', err);
  }
}

export interface InAppUpdateCheckResult {
  checked: boolean;
  updateAvailable: boolean;
  storeVersion?: string;
  error?: string;
}

/**
 * Checks Google Play Store for available in-app updates.
 * If available, triggers native Google Play Flexible update dialog.
 *
 * @param force If true, bypasses 6-hour throttle (e.g. manual user tap in Settings).
 */
export async function checkForInAppUpdate(force = false): Promise<InAppUpdateCheckResult> {
  if (Platform.OS !== 'android') {
    return { checked: false, updateAvailable: false, error: 'Only Android is supported' };
  }

  if (isCheckInProgress) {
    return { checked: false, updateAvailable: false };
  }

  // Enforce throttle unless user manually requested (force = true)
  if (!force) {
    try {
      const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
      if (lastCheck) {
        const diff = Date.now() - parseInt(lastCheck, 10);
        if (diff < MIN_CHECK_INTERVAL_MS) {
          return { checked: false, updateAvailable: false };
        }
      }
    } catch {}
  }

  const updater = getInAppUpdates();
  if (!updater) {
    return { checked: false, updateAvailable: false, error: 'Module unavailable' };
  }

  isCheckInProgress = true;

  try {
    attachStatusListener(updater);

    // Record check timestamp
    await AsyncStorage.setItem(LAST_CHECK_KEY, Date.now().toString()).catch(() => {});

    // Check with Google Play
    const result = await updater.checkNeedsUpdate({
      curVersion: APP_VERSION,
    });

    log('[InAppUpdate] checkNeedsUpdate response:', result);

    if (result && result.shouldUpdate) {
      const { IAUUpdateKind } = require('sp-react-native-in-app-updates');

      // Prefer FLEXIBLE update (Zomato-style background download)
      // If flexible is not allowed by Google Play, fallback to IMMEDIATE
      const isFlexibleAllowed = (result as any)?.other?.isFlexibleUpdateAllowed !== false;
      const isImmediateAllowed = (result as any)?.other?.isImmediateUpdateAllowed === true;

      const updateType = isFlexibleAllowed
        ? IAUUpdateKind.FLEXIBLE
        : isImmediateAllowed
        ? IAUUpdateKind.IMMEDIATE
        : IAUUpdateKind.FLEXIBLE;

      await updater.startUpdate({
        updateType,
      });

      return {
        checked: true,
        updateAvailable: true,
        storeVersion: result.storeVersion,
      };
    }

    return {
      checked: true,
      updateAvailable: false,
      storeVersion: result?.storeVersion,
    };
  } catch (err: any) {
    warn('[InAppUpdate] Check/start update failed:', err);
    return {
      checked: true,
      updateAvailable: false,
      error: err?.message || String(err),
    };
  } finally {
    isCheckInProgress = false;
  }
}

/**
 * Non-blocking startup hook.
 * Executes after interaction and animation completion with a safety delay
 * so startup never experiences frame drops, jank, or black/white screens.
 */
export function startBackgroundUpdateCheck(): void {
  if (Platform.OS !== 'android') return;

  InteractionManager.runAfterInteractions(() => {
    const timer = setTimeout(() => {
      checkForInAppUpdate(false).catch((err) => {
        warn('[InAppUpdate] Background startup update check caught:', err);
      });
    }, 4000);

    return () => clearTimeout(timer);
  });
}
