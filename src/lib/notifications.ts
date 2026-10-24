import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNotification } from './database';
import { db } from './firebase';
import { doc, serverTimestamp, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { warn } from '@/lib/logger';
import { safeJsonParse } from './safeStorage';
import {
  isMasterNotificationsEnabled,
  setMasterNotificationsEnabled,
  runOneTimeOldNotificationMigration,
  setupNotificationChannels,
  scheduleNext48h,
  triggerBudgetAlertIfNeeded,
  sendSampleNotification,
  sendAutoAddedTransactionNotification,
  CHANNEL_DAILY_REMINDERS,
} from '@/features/notifications';

// Re-export new notification system & welcome notification system
export * from '@/features/notifications';
export * from './welcomeNotification';
import {
  evaluateWelcomeNotificationPresentation,
  scheduleWelcomeNotification,
} from './welcomeNotification';

// Configure foreground notification presentation with Welcome notification guards
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Fire-time guard for welcome-notification
    const welcomeEval = await evaluateWelcomeNotificationPresentation(notification);
    if (welcomeEval.handled && !welcomeEval.shouldShow) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      } as any;
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    } as any;
  },
});

const DELIVERED_PUSH_KEY = '@rupeo_delivered_push_ids_v1';

/**
 * Request notification permissions upfront and configure Android notification channels.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    await setupNotificationChannels();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    // Run Step 1 migration if not already run
    await runOneTimeOldNotificationMigration();

    // Schedule initial 48h lookahead
    if (finalStatus === 'granted') {
      await scheduleNext48h();
    }

    return finalStatus === 'granted';
  } catch (error) {
    warn('[Notifications] requestNotificationPermissions error:', error);
    return false;
  }
}

let activeNotificationWatcherUnsub: (() => void) | null = null;

export function stopRealtimeNotificationWatcher() {
  if (activeNotificationWatcherUnsub) {
    try {
      activeNotificationWatcherUnsub();
    } catch {}
    activeNotificationWatcherUnsub = null;
  }
}

/**
 * Real-time watcher that listens to new admin_notifications and personal notifications in Firestore.
 */
export function startRealtimeNotificationWatcher(userId?: string) {
  stopRealtimeNotificationWatcher();
  if (Platform.OS === 'web') return () => {};

  let isMounted = true;
  const unsubs: (() => void)[] = [];

  const handleIncomingNotification = async (notifId: string, data: any) => {
    try {
      if (!isMounted || !notifId) return;

      const rawDelivered = await AsyncStorage.getItem(DELIVERED_PUSH_KEY);
      const deliveredList = safeJsonParse<string[]>(rawDelivered, [], DELIVERED_PUSH_KEY, (v) => Array.isArray(v));
      const deliveredSet = new Set(deliveredList);

      if (deliveredSet.has(notifId)) {
        return; // Already pushed to system tray
      }

      const title = data.title || '🔔 Notification from Rupeo';
      const body = data.message || data.body || '';

      if (!title && !body) return;

      const masterEnabled = await isMasterNotificationsEnabled();
      if (!masterEnabled) return;

      // Trigger native OS push notification
      await Notifications.scheduleNotificationAsync({
        identifier: `push_${notifId}`,
        content: {
          title,
          body,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: {
            notificationId: notifId,
            type: data.type || 'admin_notification',
            source: 'admin',
          },
          ...(Platform.OS === 'android' ? { channelId: 'rupeo_daily_reminders' } : {}),
        },
        trigger: null,
      });

      // Save to delivered list (keep last 200 IDs)
      deliveredList.push(notifId);
      if (deliveredList.length > 200) {
        deliveredList.splice(0, deliveredList.length - 200);
      }
      await AsyncStorage.setItem(DELIVERED_PUSH_KEY, JSON.stringify(deliveredList));
    } catch (e) {
      warn('Error handling incoming push notification:', e);
    }
  };

  let activeUnsubs: (() => void)[] = [];

  const detachListeners = () => {
    activeUnsubs.forEach((u) => u());
    activeUnsubs = [];
  };

  const attachListeners = () => {
    detachListeners();
    if (!isMounted || (typeof AppState !== 'undefined' && AppState.currentState !== 'active')) {
      return;
    }

    // 1. Watch global admin_notifications collection
    try {
      const adminQuery = query(
        collection(db, 'admin_notifications'),
        where('active', '==', true)
      );
      const unsubAdmin = onSnapshot(adminQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            handleIncomingNotification(change.doc.id, change.doc.data());
          }
        });
      }, (err) => warn('Admin notification watcher error:', err));
      activeUnsubs.push(unsubAdmin);
    } catch (e) {
      warn('Could not attach admin notification listener:', e);
    }

    // 2. Watch personal user notifications collection if logged in
    if (userId) {
      try {
        const userNotifQuery = query(
          collection(db, `users/${userId}/notifications`)
        );
        const unsubUser = onSnapshot(userNotifQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const d = change.doc.data();
              if (!d.isRead && !d.silentPush) {
                handleIncomingNotification(change.doc.id, d);
              }
            }
          });
        }, (err) => warn('User notification watcher error:', err));
        activeUnsubs.push(unsubUser);
      } catch (e) {
        warn('Could not attach user notification listener:', e);
      }
    }
  };

  attachListeners();

  const appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      attachListeners();
    } else {
      detachListeners();
    }
  });

  const cleanup = () => {
    isMounted = false;
    appStateSub.remove();
    detachListeners();
    if (activeNotificationWatcherUnsub === cleanup) {
      activeNotificationWatcherUnsub = null;
    }
  };
  activeNotificationWatcherUnsub = cleanup;
  return cleanup;
}

export async function registerDeviceForPushNotifications(userId: string): Promise<string | null> {
  const isExpoGo = Constants?.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (Platform.OS === 'web' || !userId || isExpoGo) return null;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    let deviceToken = null;
    try {
      deviceToken = await Notifications.getDevicePushTokenAsync();
    } catch (e) {
      warn('getDevicePushTokenAsync error:', e);
    }

    let expoPushToken = null;
    try {
      const exp = await Notifications.getExpoPushTokenAsync({
        projectId: 'ee85d637-f831-461b-ac14-651b7b9bd30b',
      });
      expoPushToken = exp.data;
    } catch (e) {
      warn('getExpoPushTokenAsync error:', e);
    }

    const storedDeviceId = await AsyncStorage.getItem('@rupeo_push_device_id');
    const deviceId = storedDeviceId || `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem('@rupeo_push_device_id', deviceId);

    const tokenData = deviceToken?.data || expoPushToken || '';

    if (tokenData || expoPushToken) {
      await setDoc(doc(db, 'users', userId, 'devices', deviceId), {
        token: tokenData,
        fcmToken: deviceToken?.data || null,
        expoPushToken: expoPushToken || null,
        platform: Platform.OS,
        enabled: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await setDoc(doc(db, 'users', userId), {
        fcmToken: deviceToken?.data || null,
        expoPushToken: expoPushToken || null,
        lastActiveAt: serverTimestamp(),
      }, { merge: true });
    }

    return deviceId;
  } catch (error) {
    warn('Could not register push device:', error);
    return null;
  }
}

/**
 * Legacy forwarder for budget alert.
 */
export async function sendBudgetAlert(
  amountOver: number,
  _currency: string = 'INR',
  _currentSpend?: number,
  _budgetLimit?: number,
  _categoryName?: string,
  userId?: string
) {
  return triggerBudgetAlertIfNeeded(amountOver, userId);
}

/**
 * Legacy forwarder for transaction success.
 */
export async function sendTransactionSuccessNotification() {
  return;
}

/**
 * Generic helper to send any instant local push notification.
 */
export async function sendLocalPushNotification(
  title: string,
  body: string,
  channelId: string = 'rupeo_daily_reminders',
  data: any = {}
) {
  if (Platform.OS === 'web') return;

  try {
    const masterEnabled = await isMasterNotificationsEnabled();
    if (!masterEnabled) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data,
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null,
    });

    createNotification(undefined, {
      title,
      message: body,
      type: data?.type || 'system',
      source: data?.source || 'local_push',
    }).catch(() => {});
  } catch (error) {
    warn('sendLocalPushNotification error:', error);
  }
}

/**
 * Delegates welcome notification scheduling to the new robust one-place scheduling system.
 */
export async function sendWelcomeNotification(userId?: string): Promise<void> {
  if (Platform.OS === 'web' || !userId) return;
  try {
    await scheduleWelcomeNotification({ userId });
  } catch (error) {
    warn('sendWelcomeNotification error:', error);
  }
}
