import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { warn } from '@/lib/logger';

export const CHANNEL_DAILY_REMINDERS = 'rupeo_daily_reminders';
export const CHANNEL_DAILY_REPORT = 'rupeo_daily_report';
export const CHANNEL_BUDGET_ALERTS = 'rupeo_budget_alerts';
export const CHANNEL_TRANSACTIONS = 'rupeo_auto_add_alerts';

export const CATEGORY_REMINDER = 'RUPEO_REMINDER';
export const CATEGORY_REPORT = 'RUPEO_REPORT';
export const CATEGORY_BUDGET_OVER = 'RUPEO_BUDGET_OVER';
export const CATEGORY_TRANSACTION_ADDED = 'AUTO_ADD_TRANSACTION';

/**
 * Configure all Android notification channels and action categories upfront.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    if (Platform.OS === 'android') {
      // 1. Daily reminders
      await Notifications.setNotificationChannelAsync(CHANNEL_DAILY_REMINDERS, {
        name: 'Daily reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 150, 200],
        lightColor: '#F59E0B',
        sound: 'default',
        enableLights: true,
      });

      // 2. Daily report
      await Notifications.setNotificationChannelAsync(CHANNEL_DAILY_REPORT, {
        name: 'Daily report',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
        lightColor: '#10B981',
        sound: 'default',
        enableLights: true,
      });

      // 3. Budget alerts (high importance)
      await Notifications.setNotificationChannelAsync(CHANNEL_BUDGET_ALERTS, {
        name: 'Budget alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 350, 200, 350],
        lightColor: '#EF4444',
        sound: 'default',
        enableLights: true,
      });

      // 4. Transactions
      await Notifications.setNotificationChannelAsync(CHANNEL_TRANSACTIONS, {
        name: 'Transactions',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFD740',
        sound: 'default',
        enableLights: true,
      });
    }

    // Configure Action Categories for interactive notification buttons
    // Category 1: Daily Reminders
    await Notifications.setNotificationCategoryAsync(CATEGORY_REMINDER, [
      {
        identifier: 'ADD_EXPENSE_ACTION',
        buttonTitle: 'Add expense',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'NOTHING_TODAY_ACTION',
        buttonTitle: 'Nothing today',
        options: { opensAppToForeground: false },
      },
    ]);

    // Category 2: Daily Report
    await Notifications.setNotificationCategoryAsync(CATEGORY_REPORT, [
      {
        identifier: 'VIEW_DETAILS_ACTION',
        buttonTitle: 'View details',
        options: { opensAppToForeground: true },
      },
    ]);

    // Category 3: Budget Over
    await Notifications.setNotificationCategoryAsync(CATEGORY_BUDGET_OVER, [
      {
        identifier: 'SEE_SPENDING_ACTION',
        buttonTitle: "See today's spending",
        options: { opensAppToForeground: true },
      },
    ]);

    // Category 4: Auto-Add Transaction
    await Notifications.setNotificationCategoryAsync(CATEGORY_TRANSACTION_ADDED, [
      {
        identifier: 'UNDO_ACTION',
        buttonTitle: 'Undo',
        options: { opensAppToForeground: false },
      },
      {
        identifier: 'CHANGE_CATEGORY_ACTION',
        buttonTitle: 'Change category',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (error) {
    warn('Error configuring notification channels and categories:', error);
  }
}
