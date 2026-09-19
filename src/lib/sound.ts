import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Triggers a distinct, tactile vibration feedback when a transaction is saved/added.
 * Uses both expo-haptics and React Native core Vibration waveform patterns to guarantee
 * unmistakable physical feedback on all Android devices (Samsung, Xiaomi, OnePlus, Vivo, etc.)
 * and iOS devices.
 */
export async function triggerTransactionVibration(): Promise<void> {
  try {
    // 1. Native Haptic Feedback Engine (Taptic Engine / Android Haptic Driver)
    try {
      if (Platform.OS === 'ios') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    } catch {
      // Fallback if haptics module is not linked in a specific environment
    }

    // 2. Hardware Vibration Pattern (Guaranteed on all physical Android devices)
    if (Platform.OS === 'android') {
      // Distinct double-pulse pattern: [0ms delay, 120ms vibrate, 60ms pause, 120ms vibrate]
      // 120ms overcomes motor inertia and hardware thresholds across all Android OEMs.
      Vibration.vibrate([0, 120, 60, 120]);
    } else if (Platform.OS === 'ios') {
      Vibration.vibrate(400);
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([120, 60, 120]);
    }
  } catch (err) {
    console.warn('Vibration error:', err);
  }
}

/**
 * Backward-compatible alias for triggerTransactionVibration.
 * Ensures existing callers trigger vibration with zero voice/audio sound.
 */
export async function playTransactionSuccessSound(): Promise<void> {
  return triggerTransactionVibration();
}
