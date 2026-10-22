/**
 * TypeScript wrapper for RupeoNotifModule native Android bridge.
 * Safely feature-detects native module so iOS, Web, and Expo Go never crash.
 */

import { NativeModules, Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSmsImportSettings, isAutoAddPaused } from '@/lib/smsSettings';
import { getRecentNotifLogs, getSQLiteSetting } from './sqliteStorage';
import { warn } from '@/lib/logger';

const { RupeoNotifModule } = NativeModules;
const APPLICATION_ID = 'com.innovatexlabs.paisewaise';

/**
 * Checks if the Android NotificationListenerService permission is currently granted to Rupeo.
 */
export async function isListenerEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (!RupeoNotifModule?.isListenerEnabled) return false;

  try {
    return await RupeoNotifModule.isListenerEnabled();
  } catch (err) {
    warn('isListenerEnabled error:', err);
    return false;
  }
}

/**
 * Opens Android system settings for Notification Listener access.
 */
export async function openListenerSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  if (RupeoNotifModule?.openListenerSettings) {
    try {
      return await RupeoNotifModule.openListenerSettings();
    } catch { }
  }

  // Fallback via IntentLauncher or Linking
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS'
    );
    return true;
  } catch {
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Requests the Android system to rebind the NotificationListenerService (call on app start/foreground).
 */
export async function requestRebind(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (!RupeoNotifModule?.requestRebind) return false;

  try {
    return await RupeoNotifModule.requestRebind();
  } catch (err) {
    warn('requestRebind error:', err);
    return false;
  }
}

/**
 * Gets the device manufacturer (e.g. 'xiaomi', 'samsung', 'oppo', 'vivo').
 */
export async function getDeviceManufacturer(): Promise<string> {
  if (Platform.OS !== 'android') return 'unknown';
  if (RupeoNotifModule?.getManufacturer) {
    try {
      return await RupeoNotifModule.getManufacturer();
    } catch { }
  }
  return (Platform.constants as any)?.Manufacturer?.toLowerCase?.() || 'unknown';
}

/**
 * Native PowerManager check: Returns true if battery optimization is disabled / unrestricted.
 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (RupeoNotifModule?.isIgnoringBatteryOptimizations) {
    try {
      return await RupeoNotifModule.isIgnoringBatteryOptimizations();
    } catch { }
  }

  if (RupeoNotifModule?.isBatteryOptimizationIgnored) {
    try {
      return await RupeoNotifModule.isBatteryOptimizationIgnored();
    } catch { }
  }

  return false;
}

/**
 * Alias for isIgnoringBatteryOptimizations.
 */
export async function isBatteryOptimizationIgnored(): Promise<boolean> {
  return isIgnoringBatteryOptimizations();
}

/**
 * Prompts user to ignore battery optimizations for Rupeo.
 * Follows robust fallback cascade:
 * 1. Native module ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
 * 2. IntentLauncher with REQUEST_IGNORE_BATTERY_OPTIMIZATIONS and data package:<appId>
 * 3. Fallback to IGNORE_BATTERY_OPTIMIZATION_SETTINGS
 * 4. Fallback to app details settings
 */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  // 1. Try native module first
  if (RupeoNotifModule?.requestIgnoreBatteryOptimizations) {
    try {
      const ok = await RupeoNotifModule.requestIgnoreBatteryOptimizations();
      if (ok) return true;
    } catch { }
  }

  // 2. Fallback via expo-intent-launcher with package URI
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      {
        data: `package:${APPLICATION_ID}`,
      }
    );
    return true;
  } catch {
    // 3. Fallback to battery optimization list screen
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'
      );
      return true;
    } catch {
      // 4. Last resort: App settings
      try {
        await Linking.openSettings();
        return true;
      } catch {
        return false;
      }
    }
  }
}

/**
 * Opens the OEM Auto-Start / Background management screen for Xiaomi/Oppo/Vivo/Samsung/Huawei.
 */
export async function openOEMAutoStartSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  if (RupeoNotifModule?.openOEMAutoStartSettings) {
    try {
      return await RupeoNotifModule.openOEMAutoStartSettings();
    } catch { }
  }

  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}

export interface AutoAddHealth {
  listenerEnabled: boolean;
  batteryUnrestricted: boolean;
  notificationPermission: boolean;
  autoAddOn: boolean;
  lastEventAt: number | null;
}

/**
 * Comprehensive in-app health check returning status of the 4 key prerequisites
 * plus the timestamp of the last detected alert event.
 */
export async function getAutoAddHealth(userId: string = 'local'): Promise<AutoAddHealth> {
  // 1. Notification Listener Access
  const listenerEnabled = await isListenerEnabled();

  // 2. Battery unrestricted
  const batteryUnrestricted = await isIgnoringBatteryOptimizations();

  // 3. App Notification Permission
  let notificationPermission = true;
  try {
    const perm = await Notifications.getPermissionsAsync();
    notificationPermission = perm.status === 'granted';
  } catch {
    notificationPermission = true;
  }

  // 4. Master Auto-Add setting & Pause state
  let autoAddOn = false;
  try {
    const settings = await getSmsImportSettings(userId);
    const paused = await isAutoAddPaused();
    autoAddOn = Boolean(settings.autoAddEnabled && !paused);
  } catch {
    autoAddOn = false;
  }

  // 5. Last event timestamp
  let lastEventAt: number | null = null;
  try {
    const recentLogs = getRecentNotifLogs(1);
    if (recentLogs && recentLogs.length > 0 && recentLogs[0].timestamp) {
      lastEventAt = recentLogs[0].timestamp;
    } else {
      const stored = getSQLiteSetting('last_processed_timestamp', '');
      if (stored) {
        lastEventAt = parseInt(stored, 10) || null;
      } else {
        const asyncStored = await AsyncStorage.getItem('@rupeo_notif_last_processed_timestamp');
        if (asyncStored) {
          lastEventAt = parseInt(asyncStored, 10) || null;
        }
      }
    }
  } catch {
    lastEventAt = null;
  }

  return {
    listenerEnabled,
    batteryUnrestricted,
    notificationPermission,
    autoAddOn,
    lastEventAt,
  };
}
