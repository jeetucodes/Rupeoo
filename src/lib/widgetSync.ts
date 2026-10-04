import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getLocalDateString } from '@/lib/dateUtils';
import type { UserSettings } from '@/lib/database';
import { QuickAddWidget } from '@/widgets/QuickAddWidget';

export interface WidgetData {
  enabled?: boolean;
  todaySpent: number;
  dailyLimit: number;
  remainingDailyLimit: number | null;
  currency: string;
  theme: 'light' | 'dark';
  lastUpdated: number;
}

export const WIDGET_STORAGE_KEY = '@rupeo_widget_data';

export const DEFAULT_WIDGET_DATA: WidgetData = {
  enabled: true,
  todaySpent: 0,
  dailyLimit: 0,
  remainingDailyLimit: null,
  currency: '₹',
  theme: 'light',
  lastUpdated: Date.now(),
};

/**
 * Reads cached widget data from AsyncStorage
 */
export async function getWidgetData(): Promise<WidgetData> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_STORAGE_KEY);
    if (!raw) return DEFAULT_WIDGET_DATA;
    return { ...DEFAULT_WIDGET_DATA, ...JSON.parse(raw) };
  } catch (err) {
    console.warn('[WidgetSync] Error reading widget data:', err);
    return DEFAULT_WIDGET_DATA;
  }
}

/**
 * Triggers native Android widget UI refresh with valid renderWidget callback
 */
export async function triggerWidgetUpdate(data?: WidgetData): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const widgetData = data || (await getWidgetData());
    const { requestWidgetUpdate } = require('react-native-android-widget');
    await requestWidgetUpdate({
      widgetName: 'QuickAddWidget',
      renderWidget: () =>
        React.createElement(QuickAddWidget, {
          todaySpent: widgetData.todaySpent,
          dailyLimit: widgetData.dailyLimit,
          remainingLimit: widgetData.remainingDailyLimit,
          currency: widgetData.currency,
        }),
    });
  } catch (err) {
    console.log('[WidgetSync] Native widget update skipped or unavailable:', err);
  }
}

/**
 * Calculates current today's spend & limits and syncs with the Android widget
 */
export async function syncWidgetWithTransactions(
  userId?: string,
  transactionsList?: any[],
  settings?: UserSettings | null
): Promise<WidgetData> {
  if (Platform.OS !== 'android') {
    return DEFAULT_WIDGET_DATA;
  }
  try {
    const todayStr = getLocalDateString();
    let todaySpent = 0;

    if (transactionsList && transactionsList.length > 0) {
      transactionsList.forEach((tx) => {
        if (tx && tx.type === 'debit') {
          const txDate = tx.date || '';
          if (txDate.startsWith(todayStr)) {
            todaySpent += Number(tx.amount) || 0;
          }
        }
      });
    }

    const dailyLimit =
      Number((settings as any)?.dailyLimit) ||
      (settings?.monthlyBudget ? Math.round(Number(settings.monthlyBudget) / 30) : 0);

    const remainingDailyLimit = dailyLimit > 0 ? Math.max(0, dailyLimit - todaySpent) : null;
    const currency = settings?.currency === 'INR' ? '₹' : settings?.currency || '₹';

    const widgetData: WidgetData = {
      enabled: true,
      todaySpent,
      dailyLimit,
      remainingDailyLimit,
      currency,
      theme: 'light',
      lastUpdated: Date.now(),
    };

    await AsyncStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(widgetData));
    await triggerWidgetUpdate(widgetData);

    return widgetData;
  } catch (err) {
    console.warn('[WidgetSync] Error syncing widget:', err);
    return DEFAULT_WIDGET_DATA;
  }
}
