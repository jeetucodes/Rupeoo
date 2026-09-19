import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

const REVIEW_PROMPTED_PREFIX = '@rupeo_google_review_prompted_';
const PENDING_REVIEW_PREFIX = '@rupeo_pending_first_tx_review_';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.innovatexlabs.paisewaise';
export const PLAY_STORE_MARKET_URL = 'market://details?id=com.innovatexlabs.paisewaise';

/**
 * Directly launches Google Play in-app review dialog (or iOS StoreKit).
 * Uses Google's official In-App Review API under the hood.
 * If in-app review is unavailable or unsupported on the device (e.g. sideloaded,
 * emulator without Play Store, or web), it gracefully falls back to opening Google Play Store.
 */
export async function requestGooglePlayReview(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return false;
    }

    const isAvailable = await StoreReview.isAvailableAsync();
    if (isAvailable) {
      console.log('⭐ [Review] Launching native Google In-App Review flow...');
      await StoreReview.requestReview();
      return true;
    }

    console.log('⚠️ [Review] Native StoreReview not available, opening Play Store');
    await openPlayStorePageDirectly();
    return true;
  } catch (error) {
    console.warn('❌ [Review] Could not launch Google Play Review:', error);
    try {
      await Linking.openURL(PLAY_STORE_URL);
    } catch {
      // ignore
    }
    return false;
  }
}

/**
 * Directly opens your app page on Google Play Store app or browser.
 */
export async function openPlayStorePageDirectly(): Promise<void> {
  try {
    // On Android native mobile, market:// opens the Google Play Store app directly
    if (Platform.OS === 'android') {
      try {
        const canOpen = await Linking.canOpenURL(PLAY_STORE_MARKET_URL);
        if (canOpen) {
          await Linking.openURL(PLAY_STORE_MARKET_URL);
          return;
        }
      } catch {
        // Fallback to https url
      }
    }

    // On Web/PC or fallback, opens direct Play Store web page
    await Linking.openURL(PLAY_STORE_URL);
  } catch (e) {
    try {
      await Linking.openURL(PLAY_STORE_URL);
    } catch {
      // ignore
    }
  }
}

/**
 * Checks if the user has already been asked for a review.
 */
export async function hasUserBeenPromptedForReview(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const val = await AsyncStorage.getItem(`${REVIEW_PROMPTED_PREFIX}${userId}`);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Marks that the user has been prompted for review so we never repeatedly prompt them.
 */
export async function setUserReviewPrompted(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(`${REVIEW_PROMPTED_PREFIX}${userId}`, 'true');
  } catch (err) {
    console.warn('Failed to save review prompted state:', err);
  }
}

/**
 * Marks that a first transaction was added and review is pending upon returning to dashboard.
 */
export async function markFirstTransactionReviewPending(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const alreadyPrompted = await hasUserBeenPromptedForReview(userId);
    if (!alreadyPrompted) {
      await AsyncStorage.setItem(`${PENDING_REVIEW_PREFIX}${userId}`, 'true');
    }
  } catch (err) {
    console.warn('Failed to mark first tx review pending:', err);
  }
}

/**
 * Checks if a first transaction review is pending for the user.
 * If yes, it clears the pending flag, marks user as prompted,
 * waits for the UI / dashboard transition to complete, and triggers Google In-App Review.
 */
export async function checkAndPromptPendingReview(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const alreadyPrompted = await hasUserBeenPromptedForReview(userId);
    if (alreadyPrompted) return false;

    const isPending = await AsyncStorage.getItem(`${PENDING_REVIEW_PREFIX}${userId}`);
    if (isPending === 'true') {
      // Clear pending flag immediately so it never triggers twice
      await AsyncStorage.removeItem(`${PENDING_REVIEW_PREFIX}${userId}`);
      // Mark as prompted
      await setUserReviewPrompted(userId);

      // Delay so screen transitions finish and dashboard card renders nicely
      setTimeout(() => {
        requestGooglePlayReview().catch(() => {});
      }, 800);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Error checking pending review:', err);
    return false;
  }
}

/**
 * Safety fallback: If user has exactly 1 transaction in DB and hasn't been prompted yet,
 * trigger the review flow.
 */
export async function checkFirstTransactionFallback(
  userId: string,
  totalTransactionsCount: number
): Promise<boolean> {
  if (!userId || totalTransactionsCount !== 1) return false;
  try {
    const alreadyPrompted = await hasUserBeenPromptedForReview(userId);
    if (alreadyPrompted) return false;

    await setUserReviewPrompted(userId);
    setTimeout(() => {
      requestGooglePlayReview().catch(() => {});
    }, 1000);
    return true;
  } catch (err) {
    console.warn('Error in first transaction fallback check:', err);
    return false;
  }
}

/**
 * Checks if a review is currently pending without auto-clearing it.
 */
export async function checkIsReviewPending(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const alreadyPrompted = await hasUserBeenPromptedForReview(userId);
    if (alreadyPrompted) return false;
    const isPending = await AsyncStorage.getItem(`${PENDING_REVIEW_PREFIX}${userId}`);
    return isPending === 'true';
  } catch {
    return false;
  }
}

/**
 * Clears the pending review flag.
 */
export async function clearReviewPending(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(`${PENDING_REVIEW_PREFIX}${userId}`);
  } catch {
    // ignore
  }
}

import { db } from './firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';

export interface AppReviewData {
  rating: number;
  feedback?: string;
  tags?: string[];
  userName?: string;
  userEmail?: string;
}

/**
 * Saves in-app review to Firestore and marks user as prompted.
 */
export async function saveAppReview(userId: string, data: AppReviewData): Promise<boolean> {
  try {
    if (userId) {
      await setUserReviewPrompted(userId);
      await clearReviewPending(userId);

      try {
        const reviewRef = doc(db, `users/${userId}/app_review`, 'latest');
        await setDoc(
          reviewRef,
          {
            ...data,
            updated_at: serverTimestamp(),
          },
          { merge: true }
        );

        // Also add to app_reviews collection for analytics/admin
        await addDoc(collection(db, 'app_reviews'), {
          userId,
          ...data,
          created_at: serverTimestamp(),
        });
      } catch (firestoreErr) {
        console.warn('Could not save review to Firestore:', firestoreErr);
      }
    }
    return true;
  } catch (err) {
    console.warn('Error saving app review:', err);
    return false;
  }
}


