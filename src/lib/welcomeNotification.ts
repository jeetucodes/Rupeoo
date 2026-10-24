import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { isMasterNotificationsEnabled, CHANNEL_DAILY_REMINDERS } from '@/features/notifications';
import { createNotification, getOfflineTransactions, getUserSettings } from './database';
import { warn, log } from '@/lib/logger';
export * from './welcomeNotificationCore';
import {
  WELCOME_NOTIFICATION_ID,
  WELCOME_SCHEDULE_DELAY_SECONDS,
  WELCOME_SCHEDULED_KEY_PREFIX,
  WELCOME_SHOWN_KEY_PREFIX,
  WELCOME_CANCELLED_ON_LOGOUT_PREFIX,
  getWelcomeNotificationContent,
  shouldScheduleWelcomeNotification,
  shouldPresentWelcomeNotification,
  calculateRemainingWelcomeDelay,
  determineExistingUserStatus,
} from './welcomeNotificationCore';

/**
 * Returns the timestamp when welcome notification was scheduled for a given user, or null.
 */
export async function getWelcomeScheduledAt(userId: string): Promise<number | null> {
  if (!userId) return null;
  try {
    const val = await AsyncStorage.getItem(`${WELCOME_SCHEDULED_KEY_PREFIX}${userId}`);
    if (!val) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

/**
 * Stores the timestamp when welcome notification was scheduled for a user.
 */
export async function setWelcomeScheduledAt(userId: string, timestamp: number): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(`${WELCOME_SCHEDULED_KEY_PREFIX}${userId}`, String(timestamp));
  } catch {}
}

/**
 * Returns true if the welcome notification has already been shown for a user.
 */
export async function getWelcomeShown(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const val = await AsyncStorage.getItem(`${WELCOME_SHOWN_KEY_PREFIX}${userId}`);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Stores whether the welcome notification has been shown for a user.
 */
export async function setWelcomeShown(userId: string, shown: boolean): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(`${WELCOME_SHOWN_KEY_PREFIX}${userId}`, shown ? 'true' : 'false');
  } catch {}
}

/**
 * Returns true if a pending welcome notification was cancelled due to user logging out within 5 minutes.
 */
export async function getWelcomeCancelledOnLogout(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const val = await AsyncStorage.getItem(`${WELCOME_CANCELLED_ON_LOGOUT_PREFIX}${userId}`);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Sets whether the welcome notification was cancelled on logout prior to being shown.
 */
export async function setWelcomeCancelledOnLogout(userId: string, cancelled: boolean): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(`${WELCOME_CANCELLED_ON_LOGOUT_PREFIX}${userId}`, cancelled ? 'true' : 'false');
  } catch {}
}

// (Content generator & templates are exported from welcomeNotificationCore.ts)

/**
 * Checks if the user is an existing/returning user (updated from older version or has existing data/prior login).
 * Existing users must NOT receive a welcome notification.
 */
export async function checkIsExistingUser(userId: string): Promise<boolean> {
  if (!userId) return true;

  try {
    // 1. Check local transactions
    const offlineTxs = await getOfflineTransactions(userId);
    if (offlineTxs && offlineTxs.length > 0) {
      await setWelcomeShown(userId, true);
      return true;
    }

    // 2. Check remote Firestore user profile
    if (db) {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data?.welcomeShown === true || data?.welcome_shown === true || data?.welcomeScheduledAt) {
          await setWelcomeShown(userId, true);
          return true;
        }

        // Has starting balance already configured or prior activity
        if (data?.has_set_starting_balance === true || (typeof data?.starting_balance === 'number' && data.starting_balance > 0)) {
          await setWelcomeShown(userId, true);
          return true;
        }

        // Account created more than 15 minutes ago
        if (data?.createdAt) {
          const createdMs = new Date(data.createdAt).getTime();
          if (!isNaN(createdMs) && Date.now() - createdMs > 15 * 60 * 1000) {
            await setWelcomeShown(userId, true);
            return true;
          }
        }
      }
    }
  } catch (err) {
    warn('[WelcomeNotification] checkIsExistingUser error:', err);
  }

  return false;
}

export interface ScheduleWelcomeOptions {
  userId: string;
  displayName?: string | null;
  language?: string;
}

/**
 * Schedules the welcome notification in exactly ONE place:
 * Right after a successful login/signup (auth session confirmed).
 * Fires 5 minutes later (trigger: { seconds: 300 }).
 * Uses fixed identifier "welcome-notification".
 */
export async function scheduleWelcomeNotification(options: ScheduleWelcomeOptions): Promise<boolean> {
  const { userId, displayName } = options;
  if (!userId) return false;
  if (Platform.OS === 'web') return false;

  try {
    // 1. Respect OS permission: if not granted, skip scheduling (never prompt here)
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      log('[WelcomeNotification] OS permission not granted; skipping schedule.');
      return false;
    }

    // 2. Respect master Notifications toggle
    const masterEnabled = await isMasterNotificationsEnabled();
    if (!masterEnabled) {
      log('[WelcomeNotification] Master notifications toggle is OFF; skipping schedule.');
      return false;
    }

    // 3. Once-only guard: If already shown, never schedule again
    const alreadyShown = await getWelcomeShown(userId);
    if (alreadyShown) {
      log('[WelcomeNotification] Welcome notification already shown for user; skipping schedule.');
      return false;
    }

    // 4. Check if already scheduled
    const scheduledAt = await getWelcomeScheduledAt(userId);
    if (scheduledAt) {
      const wasCancelledOnLogout = await getWelcomeCancelledOnLogout(userId);
      // If NOT cancelled on logout within 5 min, do not reschedule on later logins/app opens
      if (!wasCancelledOnLogout) {
        log('[WelcomeNotification] Welcome notification already scheduled and not cancelled on logout; skipping.');
        return false;
      }
      log('[WelcomeNotification] Rescheduling once because previous schedule was cancelled on early logout.');
    }

    // 5. Existing user guard: Users who updated from older versions or have existing data must NOT get a welcome
    const isExisting = await checkIsExistingUser(userId);
    if (isExisting) {
      log('[WelcomeNotification] Existing user detected; marked as already welcomed without scheduling.');
      return false;
    }

    // 6. Use a fixed identifier "welcome-notification" so it can never be scheduled twice
    await Notifications.cancelScheduledNotificationAsync(WELCOME_NOTIFICATION_ID).catch(() => {});

    // 7. Resolve language & content
    let finalLang = options.language;
    if (!finalLang) {
      const settings = await getUserSettings(userId).catch(() => null);
      finalLang = settings?.language || 'English';
    }
    const { title, body } = getWelcomeNotificationContent(displayName, finalLang);

    // 8. Schedule exactly 5 minutes after login/signup (trigger: { seconds: 300 })
    await Notifications.scheduleNotificationAsync({
      identifier: WELCOME_NOTIFICATION_ID,
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'welcome_notification',
          userId,
          route: '/add',
        },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_DAILY_REMINDERS } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: WELCOME_SCHEDULE_DELAY_SECONDS,
        repeats: false,
      },
    });

    // 9. Persist per-user flags
    await setWelcomeScheduledAt(userId, Date.now());
    await setWelcomeCancelledOnLogout(userId, false);

    // Sync to Firestore user settings if available
    if (db && userId) {
      setDoc(doc(db, 'users', userId), { welcomeScheduledAt: Date.now() }, { merge: true }).catch(() => {});
    }

    log('[WelcomeNotification] Successfully scheduled welcome notification with 300s trigger for user:', userId);
    return true;
  } catch (error) {
    warn('[WelcomeNotification] scheduleWelcomeNotification error:', error);
    return false;
  }
}

/**
 * Updates the content of a pending welcome notification if language or name changes
 * before the 5-minute timer fires.
 */
export async function updateWelcomeNotificationContentIfPending(
  userId: string,
  language: string,
  displayName?: string | null
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!userId) return false;

  try {
    const isShown = await getWelcomeShown(userId);
    if (isShown) return false;

    const scheduledAt = await getWelcomeScheduledAt(userId);
    if (!scheduledAt) return false;

    // Calculate remaining seconds
    const elapsedSeconds = Math.floor((Date.now() - scheduledAt) / 1000);
    const remainingSeconds = Math.max(10, WELCOME_SCHEDULE_DELAY_SECONDS - elapsedSeconds);

    // Cancel existing
    await Notifications.cancelScheduledNotificationAsync(WELCOME_NOTIFICATION_ID).catch(() => {});

    // Re-schedule with new language and remaining seconds
    const { title, body } = getWelcomeNotificationContent(displayName, language);
    await Notifications.scheduleNotificationAsync({
      identifier: WELCOME_NOTIFICATION_ID,
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'welcome_notification',
          userId,
          route: '/add',
        },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_DAILY_REMINDERS } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: remainingSeconds,
        repeats: false,
      },
    });

    log(`[WelcomeNotification] Pending welcome notification updated with language: ${language}`);
    return true;
  } catch (err) {
    warn('[WelcomeNotification] updateWelcomeNotificationContentIfPending error:', err);
    return false;
  }
}

/**
 * Cancels any pending scheduled welcome notification and dismisses any presented one.
 */
export async function cancelAndDismissWelcomeNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(WELCOME_NOTIFICATION_ID).catch(() => {});
    await Notifications.dismissNotificationAsync(WELCOME_NOTIFICATION_ID).catch(() => {});
  } catch (err) {
    warn('[WelcomeNotification] cancelAndDismissWelcomeNotification error:', err);
  }
}

/**
 * Handles welcome notification state cleanup on user logout.
 * Cancels any pending schedule. If user logged out within 5 minutes (before shown),
 * records flag to allow rescheduling once on next login.
 */
export async function handleWelcomeNotificationOnLogout(userId?: string | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (userId) {
      const scheduledAt = await getWelcomeScheduledAt(userId);
      const isShown = await getWelcomeShown(userId);
      // Cancelled before it was shown (user logged out within 5 minutes)
      if (scheduledAt && !isShown) {
        await setWelcomeCancelledOnLogout(userId, true);
        log('[WelcomeNotification] User logged out before welcome was shown. Flagged for reschedule on next login.');
      }
    }
    await cancelAndDismissWelcomeNotification();
  } catch (err) {
    warn('[WelcomeNotification] handleWelcomeNotificationOnLogout error:', err);
  }
}

/**
 * Safety guard for Notification Received Handler (setNotificationHandler).
 * When notification id is "welcome-notification", shows it only if:
 * 1. Logged-in session exists
 * 2. Master Notifications toggle is ON
 * 3. welcomeShown is false
 * Otherwise suppresses it (shouldShowAlert: false).
 * After it is shown, sets welcomeShown = true.
 */
export async function evaluateWelcomeNotificationPresentation(
  notification: Notifications.Notification,
  currentUid?: string | null
): Promise<{ handled: boolean; shouldShow: boolean }> {
  const identifier = notification.request?.identifier;
  const data = notification.request?.content?.data;
  const isWelcome = identifier === WELCOME_NOTIFICATION_ID || data?.type === 'welcome_notification';

  if (!isWelcome) {
    return { handled: false, shouldShow: true };
  }

  try {
    const activeUid = currentUid || auth?.currentUser?.uid || (await AsyncStorage.getItem('@rupeo_active_user_id'));
    const targetUid = data?.userId;

    // 1. Logged-in session must exist (and match target user if specified)
    if (!activeUid || (targetUid && activeUid !== targetUid)) {
      log('[WelcomeNotification] Suppressed at fire time: No active logged-in session for target user.');
      return { handled: true, shouldShow: false };
    }

    // 2. Master Notifications toggle must be ON
    const masterEnabled = await isMasterNotificationsEnabled();
    if (!masterEnabled) {
      log('[WelcomeNotification] Suppressed at fire time: Master notifications toggle is OFF.');
      return { handled: true, shouldShow: false };
    }

    // 3. welcomeShown must be false
    const alreadyShown = await getWelcomeShown(activeUid);
    if (alreadyShown) {
      log('[WelcomeNotification] Suppressed at fire time: welcomeShown is already true.');
      return { handled: true, shouldShow: false };
    }

    // Allowed to show! Mark welcomeShown = true
    await setWelcomeShown(activeUid, true);
    if (db && activeUid) {
      setDoc(doc(db, 'users', activeUid), { welcomeShown: true }, { merge: true }).catch(() => {});
    }

    // Record in local notification center database
    createNotification(activeUid, {
      title: notification.request?.content?.title || 'Welcome to Rupeo 💛',
      message: notification.request?.content?.body || '',
      type: 'system',
      silentPush: true,
    }).catch(() => {});

    log('[WelcomeNotification] Fire-time guards passed. Welcome notification presented and welcomeShown set to true.');
    return { handled: true, shouldShow: true };
  } catch (err) {
    warn('[WelcomeNotification] evaluateWelcomeNotificationPresentation error:', err);
    return { handled: true, shouldShow: false };
  }
}
