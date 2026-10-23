import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NotificationLanguage, NotificationSettings } from './types';
import { warn, log } from '@/lib/logger';
import { safeJsonParse } from '@/lib/safeStorage';

export const MASTER_NOTIFICATIONS_KEY = '@rupeo_master_notifications_enabled';
export const USER_NAME_KEY = '@rupeo_notif_user_name';
export const LANGUAGE_KEY = '@rupeo_notif_language';
export const DAILY_BUDGET_KEY = '@rupeo_daily_budget';
export const DAILY_REPORT_TIME_KEY = '@rupeo_daily_report_time';
export const LAST_VARIANTS_KEY = '@rupeo_notif_last_variants_v1';
export const BUDGET_ALERTS_SENT_DATE_KEY = '@rupeo_budget_alerts_sent_date_v1';
export const MIGRATION_V3_KEY = '@rupeo_notifs_migrated_v3';

/**
 * Step 1: One-time migration to clear all legacy scheduled and active notifications.
 */
export async function runOneTimeOldNotificationMigration(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const alreadyMigrated = await AsyncStorage.getItem(MIGRATION_V3_KEY);
    if (alreadyMigrated === 'true') {
      return false;
    }

    log('[Notifications] Running Step 1: one-time migration to cancel legacy scheduled notifications');
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
    await AsyncStorage.setItem(MIGRATION_V3_KEY, 'true');
    log('[Notifications] Legacy notifications cancelled and dismissed.');
    return true;
  } catch (error) {
    warn('[Notifications] Error running migration:', error);
    return false;
  }
}

/**
 * Check if master notification switch is enabled.
 */
export async function isMasterNotificationsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(MASTER_NOTIFICATIONS_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

/**
 * Persist master notification switch.
 */
export async function setMasterNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(MASTER_NOTIFICATIONS_KEY, enabled ? 'true' : 'false');
    if (!enabled && Platform.OS !== 'web') {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  } catch (error) {
    warn('[Notifications] Error setting master toggle:', error);
  }
}

/**
 * Retrieve all notification settings in one place.
 */
export async function getNotificationSettings(fallbackName: string = 'Friend'): Promise<NotificationSettings> {
  try {
    const [masterVal, nameVal, langVal, budgetVal, reportTimeVal] = await Promise.all([
      AsyncStorage.getItem(MASTER_NOTIFICATIONS_KEY),
      AsyncStorage.getItem(USER_NAME_KEY),
      AsyncStorage.getItem(LANGUAGE_KEY),
      AsyncStorage.getItem(DAILY_BUDGET_KEY),
      AsyncStorage.getItem(DAILY_REPORT_TIME_KEY),
    ]);

    const masterEnabled = masterVal !== 'false';
    const userName = nameVal || fallbackName || 'Friend';
    const language: NotificationLanguage =
      langVal === 'hi' || langVal === 'hinglish' || langVal === 'en'
        ? langVal
        : 'en';
    const dailyBudget = budgetVal ? parseFloat(budgetVal) || 0 : 0;
    const dailyReportTime = reportTimeVal || '22:00';

    return {
      masterEnabled,
      userName,
      language,
      dailyBudget,
      dailyReportTime,
    };
  } catch (error) {
    warn('[Notifications] Error reading settings:', error);
    return {
      masterEnabled: true,
      userName: fallbackName || 'Friend',
      language: 'en',
      dailyBudget: 0,
      dailyReportTime: '22:00',
    };
  }
}

/**
 * Save notification settings.
 */
export async function saveNotificationSettings(
  partial: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  try {
    if (partial.masterEnabled !== undefined) {
      await setMasterNotificationsEnabled(partial.masterEnabled);
    }
    if (partial.userName !== undefined) {
      await AsyncStorage.setItem(USER_NAME_KEY, partial.userName.trim());
    }
    if (partial.language !== undefined) {
      await AsyncStorage.setItem(LANGUAGE_KEY, partial.language);
    }
    if (partial.dailyBudget !== undefined) {
      await AsyncStorage.setItem(DAILY_BUDGET_KEY, String(partial.dailyBudget));
    }
    if (partial.dailyReportTime !== undefined) {
      await AsyncStorage.setItem(DAILY_REPORT_TIME_KEY, partial.dailyReportTime);
    }

    return await getNotificationSettings();
  } catch (error) {
    warn('[Notifications] Error saving settings:', error);
    return await getNotificationSettings();
  }
}

/**
 * Variant deduplication persistence: get the variant index used yesterday.
 */
export async function getLastUsedVariantIndex(typeKey: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LAST_VARIANTS_KEY);
    if (!raw) return -1;
    const map = safeJsonParse<Record<string, number>>(raw, {}, LAST_VARIANTS_KEY);
    return typeof map[typeKey] === 'number' ? map[typeKey] : -1;
  } catch {
    return -1;
  }
}

export async function setLastUsedVariantIndex(typeKey: string, index: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LAST_VARIANTS_KEY);
    const map = raw ? safeJsonParse<Record<string, number>>(raw, {}, LAST_VARIANTS_KEY) : {};
    map[typeKey] = index;
    await AsyncStorage.setItem(LAST_VARIANTS_KEY, JSON.stringify(map));
  } catch (error) {
    warn('[Notifications] Error saving variant index:', error);
  }
}

/**
 * Budget alert daily deduplication (ensures 80% and over alerts fire at most once/day).
 */
export async function hasBudgetAlertFiredToday(
  threshold: '80' | 'over',
  dateStr: string = new Date().toISOString().slice(0, 10)
): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(BUDGET_ALERTS_SENT_DATE_KEY);
    if (!raw) return false;
    const record = safeJsonParse<Record<string, string>>(raw, {}, BUDGET_ALERTS_SENT_DATE_KEY);
    return record[threshold] === dateStr;
  } catch {
    return false;
  }
}

export async function markBudgetAlertFiredToday(
  threshold: '80' | 'over',
  dateStr: string = new Date().toISOString().slice(0, 10)
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(BUDGET_ALERTS_SENT_DATE_KEY);
    const record = raw ? safeJsonParse<Record<string, string>>(raw, {}, BUDGET_ALERTS_SENT_DATE_KEY) : {};
    record[threshold] = dateStr;
    await AsyncStorage.setItem(BUDGET_ALERTS_SENT_DATE_KEY, JSON.stringify(record));
  } catch (error) {
    warn('[Notifications] Error recording budget alert flag:', error);
  }
}
