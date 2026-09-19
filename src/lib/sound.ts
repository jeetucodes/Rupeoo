import { Platform, Vibration } from 'react-native';

/**
 * Triggers a subtle, tactile haptic vibration when a transaction is saved/added.
 * Voice / audio sound playback is completely disabled as per user preference.
 */
export async function triggerTransactionVibration(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      // Crisp, premium confirmation vibration (45ms pulse)
      Vibration.vibrate(45);
    } else if (Platform.OS === 'ios') {
      // Standard iOS light vibration pulse
      Vibration.vibrate();
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      // Web vibration API fallback
      navigator.vibrate(45);
    }
  } catch (err) {
    // Non-fatal if device hardware does not support vibration
  }
}

/**
 * Backward-compatible alias for triggerTransactionVibration.
 * Ensures existing callers trigger vibration with zero voice/audio sound.
 */
export async function playTransactionSuccessSound(): Promise<void> {
  return triggerTransactionVibration();
}
