import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import { warn } from '@/lib/logger';

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
    warn('Vibration error:', err);
  }
}

/**
 * Backward-compatible alias for triggerTransactionVibration.
 * Ensures existing callers trigger vibration with zero voice/audio sound.
 */
export async function playTransactionSuccessSound(): Promise<void> {
  return triggerTransactionVibration();
}

/**
 * Triggers a crisp, responsive tactile vibration feedback for calculator keypresses.
 * Uses Haptics.impactAsync(Medium) on iOS and Android, plus an immediate hardware
 * vibration pulse (50ms) on Android & mobile browsers to guarantee tactile physical feedback.
 */
export function triggerCalculatorKeyVibration(): void {
  try {
    // 1. iOS: Responsive tactile medium impact
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      return;
    }

    // 2. Android: Native impact + reliable hardware vibration click
    if (Platform.OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      } catch {}
      Vibration.vibrate([0, 45]);
      return;
    }

    // 3. Web / Fallback
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(45);
    }
  } catch {
    try {
      Vibration.vibrate(45);
    } catch {}
  }
}

/**
 * Triggers a firmer tactile vibration feedback for key calculator actions
 * such as Equals (=), Clear (C), or Apply Amount.
 */
export function triggerCalculatorActionVibration(): void {
  try {
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }

    if (Platform.OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      } catch {}
      Vibration.vibrate([0, 60, 40, 60]);
      return;
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([60, 40, 60]);
    }
  } catch {
    try {
      Vibration.vibrate(70);
    } catch {}
  }
}


