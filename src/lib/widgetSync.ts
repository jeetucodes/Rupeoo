import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getLocalDateString } from '@/lib/dateUtils';
import type { UserSettings } from '@/lib/database';
import { QuickAddWidget } from '@/widgets/QuickAddWidget';
import { InsightWidget } from '@/widgets/InsightWidget';
import { QuickActionsWidget } from '@/widgets/QuickActionsWidget';

export interface WidgetData {
  enabled?: boolean;
  todaySpent: number;
  dailyLimit: number;
  remainingDailyLimit: number | null;
  thisMonthSpent: number;
  monthlyBudget: number;
  budgetPercentage: number;
  remainingMonthlyBudget: number | null;
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
  thisMonthSpent: 0,
  monthlyBudget: 0,
  budgetPercentage: 0,
  remainingMonthlyBudget: null,
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
 * Triggers native Android widget UI refresh for all active widgets
 */
export async function triggerWidgetUpdate(data?: WidgetData): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const widgetData = data || (await getWidgetData());
    const { requestWidgetUpdate } = require('react-native-android-widget');

    // 1. Update QuickAddWidget
    await requestWidgetUpdate({
      widgetName: 'QuickAddWidget',
      renderWidget: () =>
        React.createElement(QuickAddWidget, {
          todaySpent: widgetData.todaySpent,
          dailyLimit: widgetData.dailyLimit,
          remainingLimit: widgetData.remainingDailyLimit,
          currency: widgetData.currency,
        }),
    }).catch(() => {});

    // 2. Update InsightWidget
    await requestWidgetUpdate({
      widgetName: 'InsightWidget',
      renderWidget: () =>
        React.createElement(InsightWidget, {
          thisMonthSpent: widgetData.thisMonthSpent,
          monthlyBudget: widgetData.monthlyBudget,
          budgetPercentage: widgetData.budgetPercentage,
          remainingMonthlyBudget: widgetData.remainingMonthlyBudget,
          todaySpent: widgetData.todaySpent,
          currency: widgetData.currency,
        }),
    }).catch(() => {});

    // 3. Update QuickActionsWidget
    await requestWidgetUpdate({
      widgetName: 'QuickActionsWidget',
      renderWidget: () =>
        React.createElement(QuickActionsWidget, {
          currency: widgetData.currency,
        }),
    }).catch(() => {});
  } catch (err) {
    console.log('[WidgetSync] Native widget update skipped or unavailable:', err);
  }
}

/**
 * Calculates current today & month spend, budget status and syncs with Android widgets
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
    const currentMonthPrefix = todayStr.substring(0, 7); // e.g. "2026-10"
    let todaySpent = 0;
    let thisMonthSpent = 0;

    if (transactionsList && transactionsList.length > 0) {
      transactionsList.forEach((tx) => {
        if (tx && tx.type === 'debit') {
          const txDate = tx.date || '';
          const amt = Number(tx.amount) || 0;
          if (txDate.startsWith(todayStr)) {
            todaySpent += amt;
          }
          if (txDate.startsWith(currentMonthPrefix)) {
            thisMonthSpent += amt;
          }
        }
      });
    }

    const monthlyBudget = Number(settings?.monthlyBudget) || 0;
    const dailyLimit =
      Number((settings as any)?.dailyLimit) ||
      (monthlyBudget > 0 ? Math.round(monthlyBudget / 30) : 0);

    const remainingDailyLimit = dailyLimit > 0 ? Math.max(0, dailyLimit - todaySpent) : null;
    const remainingMonthlyBudget = monthlyBudget > 0 ? Math.max(0, monthlyBudget - thisMonthSpent) : null;
    const budgetPercentage =
      monthlyBudget > 0 ? Math.min(100, Math.round((thisMonthSpent / monthlyBudget) * 100)) : 0;
    const currency = settings?.currency === 'INR' ? '₹' : settings?.currency || '₹';

    const widgetData: WidgetData = {
      enabled: true,
      todaySpent,
      dailyLimit,
      remainingDailyLimit,
      thisMonthSpent,
      monthlyBudget,
      budgetPercentage,
      remainingMonthlyBudget,
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
