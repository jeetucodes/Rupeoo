import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { computeIsLowEndDevice } from './devicePerfCore';

export { computeIsLowEndDevice };

let cachedIsLowEnd: boolean | null = null;

/**
 * Detects whether the current device is a low-end Android device (e.g. < 3GB RAM,
 * Android 9 / API 28 or older, or older CPU architecture).
 *
 * Result is cached in memory on first call so subsequent lookups take 0ms
 * and never block render loops or frame updates.
 */
export function isLowEndDevice(): boolean {
  if (cachedIsLowEnd !== null) {
    return cachedIsLowEnd;
  }

  try {
    cachedIsLowEnd = computeIsLowEndDevice({
      platformOS: Platform.OS,
      platformVersion: Platform.Version,
      totalMemory: Device.totalMemory,
      deviceYearClass: Device.deviceYearClass,
    });
    return cachedIsLowEnd;
  } catch {
    cachedIsLowEnd = false;
    return false;
  }
}

/**
 * Returns true if decorative animations and heavy blur shaders should be reduced/skipped.
 */
export function shouldReduceMotion(): boolean {
  return isLowEndDevice();
}
