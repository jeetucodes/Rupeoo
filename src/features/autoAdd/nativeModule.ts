/**
 * TypeScript wrapper for RupeoNotifModule native Android bridge.
 * Safely feature-detects native module so iOS, Web, and Expo Go never crash.
 */

import { NativeModules, Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { warn } from '@/lib/logger';

const { RupeoNotifModule } = NativeModules;

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
 * Requests the Android system to rebind the NotificationListenerService (call on app start).
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
 * Checks whether battery optimization is ignored for Rupeo.
 */
export async function isBatteryOptimizationIgnored(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (RupeoNotifModule?.isBatteryOptimizationIgnored) {
    try {
      return await RupeoNotifModule.isBatteryOptimizationIgnored();
    } catch { }
  }
  return false;
}

/**
 * Prompts user to ignore battery optimizations for Rupeo.
 */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  // Try native module first
  if (RupeoNotifModule?.requestIgnoreBatteryOptimizations) {
    try {
      return await RupeoNotifModule.requestIgnoreBatteryOptimizations();
    } catch { }
  }

  // Fallback via expo-intent-launcher
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      {
        data: 'package:com.innovatexlabs.paisewaise',
      }
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
