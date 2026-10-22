import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { formatCurrency } from '@/utils/formatCurrency';
import { NotificationLanguage, NotificationPlaceholders } from './types';
import {
  getNotificationSettings,
  isMasterNotificationsEnabled,
  getLastUsedVariantIndex,
  setLastUsedVariantIndex,
  hasBudgetAlertFiredToday,
  markBudgetAlertFiredToday,
} from './settings';
import {
  setupNotificationChannels,
  CHANNEL_DAILY_REMINDERS,
  CHANNEL_DAILY_REPORT,
  CHANNEL_BUDGET_ALERTS,
  CHANNEL_TRANSACTIONS,
  CATEGORY_REMINDER,
  CATEGORY_REPORT,
  CATEGORY_BUDGET_OVER,
  CATEGORY_TRANSACTION_ADDED,
} from './channels';
import { resolveNotificationMessage } from './messages';
import { computeDaySpendingStats, getLocalDayBoundaries } from './stats';
import {
  isQuietWindow,
  parseTimeString,
  shouldSkipNudge,
  getMorningTemplateKey,
  getLunchTemplateKey,
  getDailyReportTemplateKey,
} from './rules';
import { warn, log } from '@/lib/logger';

export { isQuietWindow, parseTimeString };

export interface ScheduleSlotConfig {
  key: string;
  hour: number;
  minute: number;
  category: string;
  channelId: string;
}

/**
 * Step 4: Master Scheduler.
 * Schedules the next 48 hours of personalized notifications with fixed identifiers.
 */
export async function scheduleNext48h(userId: string = 'local'): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const masterEnabled = await isMasterNotificationsEnabled();
    if (!masterEnabled) {
      log('[Notifications] Master toggle is OFF. Cancelling all scheduled notifications.');
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      log('[Notifications] OS permission not granted. Skipping schedule.');
      return;
    }

    await setupNotificationChannels();

    const settings = await getNotificationSettings();
    const stats = await computeDaySpendingStats(settings.dailyBudget, userId);
    const now = new Date();
    const nowMs = now.getTime();

    const reportTime = parseTimeString(settings.dailyReportTime);

    // Build slots for Day 0 (Today) and Day 1 (Tomorrow)
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + dayOffset);
      const { dateStr } = getLocalDayBoundaries(targetDate);
      const isToday = dayOffset === 0;

      // Fixed daily slots
      const slots: {
        id: string;
        typeKey: string;
        targetTime: Date;
        channelId: string;
        categoryIdentifier: string;
        skip?: boolean;
      }[] = [];

      // 1. Morning (9:00 AM)
      const morningTime = new Date(targetDate);
      morningTime.setHours(9, 0, 0, 0);
      slots.push({
        id: `rupeo_slot_morning_${dateStr}`,
        typeKey: settings.dailyBudget > 0 ? 'morning_with_budget' : 'morning_no_budget',
        targetTime: morningTime,
        channelId: CHANNEL_DAILY_REMINDERS,
        categoryIdentifier: CATEGORY_REMINDER,
      });

      // 2. Lunch (1:00 PM / 13:00)
      const lunchTime = new Date(targetDate);
      lunchTime.setHours(13, 0, 0, 0);
      const hasRecentLunchSpend = isToday && stats.lastTransactionTime && nowMs - stats.lastTransactionTime < 2 * 60 * 60 * 1000;
      slots.push({
        id: `rupeo_slot_lunch_${dateStr}`,
        typeKey: isToday && stats.spent > 0 ? 'lunch_with_spent' : 'lunch_no_spent',
        targetTime: lunchTime,
        channelId: CHANNEL_DAILY_REMINDERS,
        categoryIdentifier: CATEGORY_REMINDER,
        skip: Boolean(hasRecentLunchSpend),
      });

      // 3. Teatime (4:30 PM / 16:30)
      const teatime = new Date(targetDate);
      teatime.setHours(16, 30, 0, 0);
      slots.push({
        id: `rupeo_slot_teatime_${dateStr}`,
        typeKey: settings.dailyBudget > 0 ? 'teatime_with_budget' : 'teatime_no_budget',
        targetTime: teatime,
        channelId: CHANNEL_DAILY_REMINDERS,
        categoryIdentifier: CATEGORY_REMINDER,
      });

      // 4. Evening (8:00 PM / 20:00)
      const eveningTime = new Date(targetDate);
      eveningTime.setHours(20, 0, 0, 0);
      const skipEvening = isToday && (stats.count >= 3 || (stats.lastTransactionTime && nowMs - stats.lastTransactionTime < 2 * 60 * 60 * 1000));
      slots.push({
        id: `rupeo_slot_evening_${dateStr}`,
        typeKey: 'evening',
        targetTime: eveningTime,
        channelId: CHANNEL_DAILY_REMINDERS,
        categoryIdentifier: CATEGORY_REMINDER,
        skip: Boolean(skipEvening),
      });

      // 5. Daily Report (User defined time, default 10:00 PM / 22:00)
      const reportDate = new Date(targetDate);
      reportDate.setHours(reportTime.hour, reportTime.minute, 0, 0);

      let reportTypeKey = 'daily_report_no_budget';
      if (isToday) {
        if (stats.spent === 0 && stats.count === 0) {
          reportTypeKey = 'daily_report_zero';
        } else if (settings.dailyBudget > 0) {
          reportTypeKey = stats.spent > settings.dailyBudget ? 'daily_report_over' : 'daily_report_under';
        }
      } else {
        reportTypeKey = settings.dailyBudget > 0 ? 'daily_report_under' : 'daily_report_no_budget';
      }

      slots.push({
        id: `rupeo_slot_report_${dateStr}`,
        typeKey: reportTypeKey,
        targetTime: reportDate,
        channelId: CHANNEL_DAILY_REPORT,
        categoryIdentifier: CATEGORY_REPORT,
      });

      // 6. Optional: Weekly Summary on Sunday 7:00 PM
      if (targetDate.getDay() === 0) {
        const sundayWeeklyTime = new Date(targetDate);
        sundayWeeklyTime.setHours(19, 0, 0, 0);
        slots.push({
          id: `rupeo_slot_weekly_${dateStr}`,
          typeKey: 'weekly_report',
          targetTime: sundayWeeklyTime,
          channelId: CHANNEL_DAILY_REPORT,
          categoryIdentifier: CATEGORY_REPORT,
        });
      }

      // Schedule eligible slots
      for (const slot of slots) {
        if (slot.skip) {
          await Notifications.cancelScheduledNotificationAsync(slot.id).catch(() => {});
          continue;
        }

        const slotMs = slot.targetTime.getTime();
        // Skip if already in the past
        if (slotMs <= nowMs) {
          continue;
        }

        // Quiet window guard (11 PM - 8 AM)
        if (isQuietWindow(slot.targetTime)) {
          continue;
        }

        const placeholders: NotificationPlaceholders = {
          name: settings.userName,
          spent: formatCurrency(stats.spent),
          budget: formatCurrency(settings.dailyBudget),
          left: formatCurrency(stats.budgetLeft),
          over: formatCurrency(stats.budgetOver),
          top_category: stats.topCategory,
          top_amount: formatCurrency(stats.topAmount),
          count: stats.count,
          biggest: formatCurrency(stats.biggest),
        };

        const prevIndex = await getLastUsedVariantIndex(slot.typeKey);
        const resolved = resolveNotificationMessage(
          slot.typeKey,
          settings.language,
          placeholders,
          prevIndex
        );

        await setLastUsedVariantIndex(slot.typeKey, resolved.variantIndex);

        // Schedule with fixed identifier (overwrites previous version safely)
        await Notifications.scheduleNotificationAsync({
          identifier: slot.id,
          content: {
            title: resolved.title,
            body: resolved.body,
            sound: 'default',
            categoryIdentifier: slot.categoryIdentifier,
            data: {
              slotId: slot.id,
              typeKey: slot.typeKey,
              dateStr,
            },
            ...(Platform.OS === 'android' ? { channelId: slot.channelId } : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: slot.targetTime,
          },
        });
      }
    }

    log('[Notifications] scheduleNext48h successfully synced.');
  } catch (err) {
    warn('[Notifications] Error in scheduleNext48h:', err);
  }
}

/**
 * Event-based trigger: Budget 80% & Budget Over.
 * Called immediately when a debit is saved.
 */
export async function triggerBudgetAlertIfNeeded(
  newDebitAmount: number,
  userId: string = 'local'
): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const masterEnabled = await isMasterNotificationsEnabled();
    if (!masterEnabled) return;

    const settings = await getNotificationSettings();
    if (!settings.dailyBudget || settings.dailyBudget <= 0) return;

    const stats = await computeDaySpendingStats(settings.dailyBudget, userId);
    const { dateStr } = getLocalDayBoundaries();

    // Check Over Budget (fired once per day)
    if (stats.spent > settings.dailyBudget) {
      const alreadyFired = await hasBudgetAlertFiredToday('over', dateStr);
      if (!alreadyFired) {
        await markBudgetAlertFiredToday('over', dateStr);

        const placeholders: NotificationPlaceholders = {
          name: settings.userName,
          spent: formatCurrency(stats.spent),
          budget: formatCurrency(settings.dailyBudget),
          over: formatCurrency(stats.budgetOver),
          left: formatCurrency(0),
        };

        const resolved = resolveNotificationMessage('budget_over', settings.language, placeholders);

        await Notifications.scheduleNotificationAsync({
          identifier: `budget_over_${dateStr}`,
          content: {
            title: resolved.title,
            body: resolved.body,
            sound: 'default',
            categoryIdentifier: CATEGORY_BUDGET_OVER,
            data: { type: 'budget_over', dateStr },
            ...(Platform.OS === 'android' ? { channelId: CHANNEL_BUDGET_ALERTS } : {}),
          },
          trigger: null, // Instant
        });
        log('[Notifications] Fired instant budget_over alert.');
        return;
      }
    }

    // Check 80% Budget Threshold (fired once per day)
    if (stats.spent >= settings.dailyBudget * 0.8) {
      const alreadyFired = await hasBudgetAlertFiredToday('80', dateStr);
      if (!alreadyFired) {
        await markBudgetAlertFiredToday('80', dateStr);

        const placeholders: NotificationPlaceholders = {
          name: settings.userName,
          spent: formatCurrency(stats.spent),
          budget: formatCurrency(settings.dailyBudget),
          left: formatCurrency(stats.budgetLeft),
        };

        const resolved = resolveNotificationMessage('budget_80', settings.language, placeholders);

        await Notifications.scheduleNotificationAsync({
          identifier: `budget_80_${dateStr}`,
          content: {
            title: resolved.title,
            body: resolved.body,
            sound: 'default',
            categoryIdentifier: CATEGORY_BUDGET_OVER,
            data: { type: 'budget_80', dateStr },
            ...(Platform.OS === 'android' ? { channelId: CHANNEL_BUDGET_ALERTS } : {}),
          },
          trigger: null, // Instant
        });
        log('[Notifications] Fired instant budget_80 alert.');
      }
    }
  } catch (err) {
    warn('[Notifications] Error in triggerBudgetAlertIfNeeded:', err);
  }
}

/**
 * Event-based trigger: Auto-Added Transaction notification.
 */
export async function sendAutoAddedTransactionNotification(params: {
  transactionId: string;
  amount: number;
  merchant: string;
  userId?: string;
}): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const masterEnabled = await isMasterNotificationsEnabled();
    if (!masterEnabled) return;

    await setupNotificationChannels();
    const settings = await getNotificationSettings();

    const placeholders: NotificationPlaceholders = {
      name: settings.userName,
      amount: formatCurrency(params.amount),
      merchant: params.merchant || 'Store',
    };

    const resolved = resolveNotificationMessage('transaction_added', settings.language, placeholders);

    await Notifications.scheduleNotificationAsync({
      identifier: `tx_added_${params.transactionId}`,
      content: {
        title: resolved.title,
        body: resolved.body,
        sound: 'default',
        categoryIdentifier: CATEGORY_TRANSACTION_ADDED,
        data: {
          transactionId: params.transactionId,
          type: 'AUTO_ADD_TRANSACTION',
          amount: params.amount,
          userId: params.userId,
        },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_TRANSACTIONS } : {}),
      },
      trigger: null,
    });
    log(`[Notifications] Sent auto-added transaction notification: ${params.transactionId}`);
  } catch (err) {
    warn('[Notifications] Error sending auto-added transaction notification:', err);
  }
}

/**
 * Sends a sample notification for user preview in Settings.
 */
export async function sendSampleNotification(chosenLanguage?: NotificationLanguage): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await setupNotificationChannels();
    const settings = await getNotificationSettings();
    const lang = chosenLanguage || settings.language;

    const placeholders: NotificationPlaceholders = {
      name: settings.userName,
      spent: formatCurrency(450),
      budget: formatCurrency(settings.dailyBudget > 0 ? settings.dailyBudget : 1000),
      left: formatCurrency(settings.dailyBudget > 0 ? Math.max(0, settings.dailyBudget - 450) : 550),
      top_category: 'Food',
      top_amount: formatCurrency(220),
      count: 3,
    };

    const resolved = resolveNotificationMessage('morning_with_budget', lang, placeholders);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: resolved.title,
        body: resolved.body,
        sound: 'default',
        categoryIdentifier: CATEGORY_REMINDER,
        data: { type: 'sample' },
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_DAILY_REMINDERS } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
      },
    });
    log('[Notifications] Dispatched sample notification preview.');
  } catch (err) {
    warn('[Notifications] Error sending sample notification:', err);
  }
}
