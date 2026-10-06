import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNotification } from './database';
import { getLocalDateString } from './dateUtils';
import { db } from './firebase';
import { doc, serverTimestamp, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';

// Configure how notifications behave when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});

const WELCOME_NOTIF_KEY = '@rupeo_welcome_notif_sent_v2';
const LAST_SCHEDULE_TIMESTAMP_KEY = '@rupeo_last_schedule_time_v3';
const DELIVERED_PUSH_KEY = '@rupeo_delivered_push_ids_v1';

/**
 * Request notification permissions upfront and configure Android notification channels.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    if (Platform.OS === 'android') {
      // 1. Default Channel
      await Notifications.setNotificationChannelAsync('default', {
        name: 'General Notifications',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFD740',
        sound: 'default',
      });

      // 2. Bill & Payment Reminders Channel
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Bill & Payment Reminders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 150, 300],
        lightColor: '#F59E0B',
        sound: 'default',
      });

      // 3. Budget Alerts Channel
      await Notifications.setNotificationChannelAsync('budget_alerts', {
        name: 'Budget & Spending Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#EF4444',
        sound: 'default',
      });

      // 4. Smart Expense Reminders & Daily Habits Channel
      await Notifications.setNotificationChannelAsync('smart_nudges', {
        name: 'Smart Expense Reminders & Daily Routine',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 150, 250],
        lightColor: '#3B82F6',
        sound: 'default',
      });

      // 5. Welcome & Milestone Channel
      await Notifications.setNotificationChannelAsync('welcome', {
        name: 'Welcome & System Updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
      });
    }

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

    const isGranted = finalStatus === 'granted';
    if (isGranted) {
      // Automatically schedule daily routines & periodic notifications once permission is granted
      setupPeriodicSmartNotifications().catch(err =>
        console.warn('Error setting up periodic smart notifications:', err)
      );
    }

    return isGranted;
  } catch (error) {
    console.warn('requestNotificationPermissions error:', error);
    return false;
  }
}

/**
 * Real-time watcher that listens to new admin_notifications and personal notifications in Firestore
 * and triggers immediate local OS push notifications (with sound & popup banner).
 */
export function startRealtimeNotificationWatcher(userId?: string) {
  if (Platform.OS === 'web') return () => { };

  let isMounted = true;
  const unsubs: (() => void)[] = [];

  const handleIncomingNotification = async (notifId: string, data: any) => {
    try {
      if (!isMounted || !notifId) return;

      const rawDelivered = await AsyncStorage.getItem(DELIVERED_PUSH_KEY);
      const deliveredList: string[] = rawDelivered ? JSON.parse(rawDelivered) : [];
      const deliveredSet = new Set(deliveredList);

      if (deliveredSet.has(notifId)) {
        return; // Already pushed to system tray
      }

      const title = data.title || '🔔 Notification from Rupeo';
      const body = data.message || data.body || '';

      if (!title && !body) return;

      // Trigger native OS push notification
      await Notifications.scheduleNotificationAsync({
        identifier: `push_${notifId}`,
        content: {
          title,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: {
            notificationId: notifId,
            type: data.type || 'admin_notification',
            source: 'admin',
          },
          ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
        },
        trigger: null, // Fire immediately
      });

      // Save to delivered list (keep last 200 IDs)
      deliveredList.push(notifId);
      if (deliveredList.length > 200) {
        deliveredList.splice(0, deliveredList.length - 200);
      }
      await AsyncStorage.setItem(DELIVERED_PUSH_KEY, JSON.stringify(deliveredList));
    } catch (e) {
      console.warn('Error handling incoming push notification:', e);
    }
  };

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
    }, (err) => console.warn('Admin notification watcher error:', err));
    unsubs.push(unsubAdmin);
  } catch (e) {
    console.warn('Could not attach admin notification listener:', e);
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
      }, (err) => console.warn('User notification watcher error:', err));
      unsubs.push(unsubUser);
    } catch (e) {
      console.warn('Could not attach user notification listener:', e);
    }
  }

  return () => {
    isMounted = false;
    unsubs.forEach((u) => u());
  };
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
      console.warn('getDevicePushTokenAsync error:', e);
    }

    let expoPushToken = null;
    try {
      const exp = await Notifications.getExpoPushTokenAsync({
        projectId: 'ee85d637-f831-461b-ac14-651b7b9bd30b',
      });
      expoPushToken = exp.data;
    } catch (e) {
      console.warn('getExpoPushTokenAsync error:', e);
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
    console.warn('Could not register push device:', error);
    return null;
  }
}

/**
 * Send a delightful Welcome Notification 10 minutes after notification permission is granted / first setup.
 */
export async function sendWelcomeNotification(userId?: string) {
  if (Platform.OS === 'web') return;

  try {
    const alreadySent = await AsyncStorage.getItem(WELCOME_NOTIF_KEY);
    if (alreadySent === 'true') {
      return;
    }

    const title = '🎉 Welcome to Rupeo!';
    const body = 'Track expenses effortlessly, stay within budget & build your financial freedom. Welcome aboard! 🚀';

    // 1. Schedule OS Push Notification to trigger 10 minutes (600 seconds) later
    await Notifications.scheduleNotificationAsync({
      identifier: 'welcome_10min_push',
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { type: 'welcome' },
        ...(Platform.OS === 'android' ? { channelId: 'welcome' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10 * 60, // Arrives after 10 minutes
        repeats: false,
      },
    });

    // 2. Persist in in-app notification center if userId is provided
    if (userId) {
      await createNotification(userId, {
        title,
        message: body,
        type: 'system',
        silentPush: true,
      }).catch(e => console.warn('Could not save welcome notification to DB:', e));
    }

    // Mark as scheduled in local storage
    await AsyncStorage.setItem(WELCOME_NOTIF_KEY, 'true');
  } catch (error) {
    console.warn('sendWelcomeNotification error:', error);
  }
}

/**
 * Fixed Daily Routine Notifications (Morning, Afternoon, Evening, Night).
 * Strictly scheduled at fixed daily times to ensure:
 * 1. Morning notification arrives only in the morning (9:00 AM).
 * 2. No overlapping multiple notifications at the same time.
 * 3. No unwanted notifications during sleep / night hours.
 */
const DAILY_ROUTINE_SCHEDULE = [
  {
    id: 'daily_morning_0900',
    hour: 9,
    minute: 0,
    title: '☀️ Good Morning! Set Today\'s Spending Goal',
    body: 'Start fresh today! Track every tea, commute or shopping expense with Rupeo. ☕🎯',
  },
  {
    id: 'daily_afternoon_1400',
    hour: 14,
    minute: 0,
    title: '🍲 Lunch ya Snacks ka Kharcha?',
    body: 'Recent lunch, snacks ya groceries ka bill turant log karein in just 5 seconds! ⚡',
  },
  {
    id: 'daily_evening_1930',
    hour: 19,
    minute: 30,
    title: '🛍️ Evening Check-in: Koi UPI ya Cash Spend?',
    body: 'Chai, travel ya evening shopping ka hisaab Rupeo me add karein aur budget me rahein. 📱💳',
  },
  {
    id: 'daily_night_2200',
    hour: 22,
    minute: 0,
    title: '🌙 Din ka Hisaab-Kitaab (Day End Review)',
    body: 'Din khatam hone se pehle aaj ka total spend review karein. Sleep with peace of mind! ✨💰',
  },
];

/**
 * Schedules daily routine notifications at fixed times.
 */
export async function setupPeriodicSmartNotifications(forceRefresh = false) {
  if (Platform.OS === 'web') return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const now = Date.now();
    const lastScheduledStr = await AsyncStorage.getItem(LAST_SCHEDULE_TIMESTAMP_KEY);

    if (!forceRefresh && lastScheduledStr) {
      const diffHours = (now - parseInt(lastScheduledStr, 10)) / (1000 * 60 * 60);
      if (diffHours < 24) {
        // Daily schedule is already configured and active
        return;
      }
    }

    // Cancel old daily routine reminders cleanly by id (without wiping out welcome or bill reminders)
    for (const item of DAILY_ROUTINE_SCHEDULE) {
      await Notifications.cancelScheduledNotificationAsync(item.id).catch(() => { });
    }

    // Schedule Fixed Daily Routine Reminders (9:00 AM, 2:00 PM, 7:30 PM, 10:00 PM)
    for (const item of DAILY_ROUTINE_SCHEDULE) {
      await Notifications.scheduleNotificationAsync({
        identifier: item.id,
        content: {
          title: item.title,
          body: item.body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { type: 'daily_routine', id: item.id },
          ...(Platform.OS === 'android' ? { channelId: 'smart_nudges' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: item.hour,
          minute: item.minute,
        },
      });
    }

    await AsyncStorage.setItem(LAST_SCHEDULE_TIMESTAMP_KEY, now.toString());
  } catch (error) {
    console.warn('setupPeriodicSmartNotifications error:', error);
  }
}

/**
 * Send an immediate Test Notification to let user verify notifications work instantly.
 */
export async function sendTestNotification(userId?: string) {
  if (Platform.OS === 'web') return;

  try {
    const title = '🔔 Rupeo Notification Test Successful!';
    const body = 'Aapke notifications bilkul theek se kaam kar rahe hain. Har din reminders & budget alerts time par aayenge! 🚀';

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { type: 'test_notification' },
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
      },
      trigger: null, // Instant
    });

    if (userId) {
      await createNotification(userId, {
        title,
        message: body,
        type: 'system',
        silentPush: true,
      }).catch(e => console.warn('Could not save test notification to DB:', e));
    }
  } catch (error) {
    console.warn('sendTestNotification error:', error);
  }
}

/**
 * Send immediate Feedback Notification when user logs a transaction.
 */
export async function sendTransactionSuccessNotification(
  _tx: { amount: number; category: string; type?: string; merchant?: string },
  _currency: string = '₹',
  _userId?: string
) {
  // Disabled as per user preference: Do not show push notification when adding transactions/expenses/income.
  return;
}

/**
 * Schedule or send a Bill Reminder notification (push + in-app).
 */
export async function scheduleBillReminder(
  title: string,
  amount: number,
  dueDate: Date | string,
  currency: string = '₹',
  userId?: string,
  reminderDays: number = 1
) {
  if (Platform.OS === 'web') return;

  try {
    const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(due);
    targetDate.setHours(9, 0, 0, 0);

    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let notifTitle = '';
    let notifBody = '';

    if (diffDays <= 0) {
      notifTitle = `🚨 Bill Due Today: ${title}`;
      notifBody = `Your bill "${title}" of ${currency}${amount.toLocaleString('en-IN')} is due TODAY! Tap to pay or mark done.`;
    } else if (diffDays === 1) {
      notifTitle = `⏰ Bill Due Tomorrow: ${title}`;
      notifBody = `Your bill "${title}" of ${currency}${amount.toLocaleString('en-IN')} is due tomorrow. Keep funds ready!`;
    } else {
      notifTitle = `📅 Upcoming Bill Reminder: ${title}`;
      notifBody = `Reminder: "${title}" of ${currency}${amount.toLocaleString('en-IN')} is due in ${diffDays} days (${getLocalDateString(due)}).`;
    }

    // Schedule the configured number of days before at 9 AM, or immediately if due today.
    let trigger: any = null;
    let shouldSchedule = diffDays <= 0;
    if (diffDays > 0) {
      const triggerDate = new Date(due);
      triggerDate.setDate(triggerDate.getDate() - Math.max(0, reminderDays));
      triggerDate.setHours(9, 0, 0, 0);
      if (triggerDate.getTime() > Date.now()) {
        trigger = triggerDate;
        shouldSchedule = true;
      }
    }

    // 1. OS Push Notification
    if (shouldSchedule) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notifTitle,
          body: notifBody,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { type: 'bill_reminder', title, amount },
          ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
        },
        trigger,
      });
    }

    // 2. In-app notification center
    if (userId) {
      await createNotification(userId, {
        title: notifTitle,
        message: notifBody,
        type: 'reminder',
        silentPush: true,
      }).catch(e => console.warn('Could not save bill reminder to DB:', e));
    }
  } catch (error) {
    console.warn('scheduleBillReminder error:', error);
  }
}

/**
 * Send an immediate Budget Alert notification when budget threshold or limit is crossed.
 * Features strict monthly deduplication so the user is alerted at most ONCE per tier per month.
 */
export async function sendBudgetAlert(
  amountOver: number,
  currency: string = '₹',
  currentSpend?: number,
  budgetLimit?: number,
  categoryName?: string,
  userId?: string,
  force: boolean = false
) {
  if (Platform.OS === 'web') return;

  try {
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-09"
    const isExceeded = amountOver > 0;
    const tier = isExceeded ? 'exceeded' : 'warning_80';
    const alertKey = `@rupeo_budget_alert_${categoryName || 'monthly'}_${currentMonth}_${tier}`;

    // Don't spam: only alert once per tier per month unless forced
    if (!force) {
      const alreadySent = await AsyncStorage.getItem(alertKey);
      if (alreadySent) {
        return;
      }
    }

    let title = '';
    let body = '';

    if (isExceeded) {
      title = `Monthly Budget Exceeded 🚨`;
      const catText = categoryName ? `${categoryName} ` : 'monthly ';
      body = `You have spent ${currency}${(currentSpend || 0).toLocaleString('en-IN')}, which exceeds your ${catText}budget of ${currency}${(budgetLimit || 0).toLocaleString('en-IN')}.`;
    } else if (budgetLimit && currentSpend && currentSpend >= budgetLimit * 0.8) {
      const pct = Math.round((currentSpend / budgetLimit) * 100);
      title = `Budget Alert (80% Reached) ⚠️`;
      const catText = categoryName ? `${categoryName} ` : 'monthly ';
      body = `You have used ${pct}% of your ${catText}budget (${currency}${currentSpend.toLocaleString('en-IN')} / ${currency}${budgetLimit.toLocaleString('en-IN')}). Spend mindfully!`;
    } else {
      return;
    }

    // 1. OS Push Notification with fixed identifier to replace/collapse duplicates
    await Notifications.scheduleNotificationAsync({
      identifier: `budget_${categoryName || 'monthly'}_${currentMonth}_${tier}`,
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { type: 'budget_alert', amountOver, categoryName, currentMonth },
        ...(Platform.OS === 'android' ? { channelId: 'budget_alerts' } : {}),
      },
      trigger: null,
    });

    // 2. In-app notification center (silentPush: true ensures Firestore watcher won't fire a duplicate push)
    if (userId) {
      await createNotification(userId, {
        title,
        message: body,
        type: 'budget',
        silentPush: true,
      }).catch(e => console.warn('Could not save budget alert to DB:', e));
    }

    // 3. Mark as sent for this month
    await AsyncStorage.setItem(alertKey, 'true');
  } catch (error) {
    console.warn('sendBudgetAlert error:', error);
  }
}

/**
 * Generic helper to send any instant local push notification.
 */
export async function sendLocalPushNotification(
  title: string,
  body: string,
  channelId: 'default' | 'reminders' | 'budget_alerts' | 'smart_nudges' | 'welcome' = 'default',
  data: any = {}
) {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data,
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('sendLocalPushNotification error:', error);
  }
}
