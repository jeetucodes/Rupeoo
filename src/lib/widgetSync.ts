import React from 'react';
import { Platform } from 'react-native';
import {
  getWidgetSnapshot,
  getRenderSnapshot,
  buildWidgetSnapshotFromApp,
  isWidgetLoggedOut,
  WidgetSnapshot,
  WIDGET_SNAPSHOT_KEY,
} from './widgetSnapshot';
import { WidgetFallbackState, WidgetLoggedOutState } from '@/widgets/WidgetCommon';
import { TodaySummaryWidget } from '@/widgets/TodaySummaryWidget';
import { QuickAddWidget } from '@/widgets/QuickAddWidget';
import { MonthOverviewWidget } from '@/widgets/MonthOverviewWidget';
import { BudgetProgressWidget } from '@/widgets/BudgetProgressWidget';
import { RecentTransactionsWidget } from '@/widgets/RecentTransactionsWidget';
import { UdharSummaryWidget } from '@/widgets/UdharSummaryWidget';
import { GoalsProgressWidget } from '@/widgets/GoalsProgressWidget';
import { UpcomingBillsWidget } from '@/widgets/UpcomingBillsWidget';
import { WeeklySpendingWidget } from '@/widgets/WeeklySpendingWidget';
import { InsightWidget } from '@/widgets/InsightWidget';
import { QuickActionsWidget } from '@/widgets/QuickActionsWidget';

export const REGISTERED_WIDGET_NAMES = [
  'TodaySummaryWidget',
  'QuickAddWidget',
  'MonthOverviewWidget',
  'BudgetProgressWidget',
  'RecentTransactionsWidget',
  'UdharSummaryWidget',
  'GoalsProgressWidget',
  'UpcomingBillsWidget',
  'WeeklySpendingWidget',
  'InsightWidget',
  'QuickActionsWidget',
] as const;

export type RegisteredWidgetName = (typeof REGISTERED_WIDGET_NAMES)[number];

// Legacy interfaces kept for backward compatibility
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
export const WIDGET_STORAGE_KEY = WIDGET_SNAPSHOT_KEY;

/**
 * Triggers native Android widget refresh for ALL registered widgets.
 * Safe to call anytime data changes, login/logout occurs, or app enters foreground.
 */
export async function triggerWidgetUpdate(data?: any): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const { requestWidgetUpdate } = require('react-native-android-widget');
    const loggedOut = await isWidgetLoggedOut();
    const rawSnapshot = await getWidgetSnapshot();
    const snapshot = getRenderSnapshot(rawSnapshot);

    const getWidgetElement = (widgetName: RegisteredWidgetName) => {
      if (loggedOut) {
        return React.createElement(WidgetLoggedOutState);
      }
      if (!snapshot) {
        return React.createElement(WidgetFallbackState, { message: 'Open Rupeo to sync' });
      }

      switch (widgetName) {
        case 'TodaySummaryWidget':
          return React.createElement(TodaySummaryWidget, { snapshot });
        case 'QuickAddWidget':
          return React.createElement(QuickAddWidget, { snapshot });
        case 'MonthOverviewWidget':
          return React.createElement(MonthOverviewWidget, { snapshot });
        case 'BudgetProgressWidget':
          return React.createElement(BudgetProgressWidget, { snapshot });
        case 'RecentTransactionsWidget':
          return React.createElement(RecentTransactionsWidget, { snapshot });
        case 'UdharSummaryWidget':
          return React.createElement(UdharSummaryWidget, { snapshot });
        case 'GoalsProgressWidget':
          return React.createElement(GoalsProgressWidget, { snapshot });
        case 'UpcomingBillsWidget':
          return React.createElement(UpcomingBillsWidget, { snapshot });
        case 'WeeklySpendingWidget':
          return React.createElement(WeeklySpendingWidget, { snapshot });
        case 'InsightWidget':
          return React.createElement(InsightWidget, { snapshot });
        case 'QuickActionsWidget':
          return React.createElement(QuickActionsWidget, { snapshot });
        default:
          return React.createElement(QuickAddWidget, { snapshot });
      }
    };

    // Update each registered widget independently
    for (const widgetName of REGISTERED_WIDGET_NAMES) {
      try {
        await requestWidgetUpdate({
          widgetName,
          renderWidget: () => getWidgetElement(widgetName),
        });
      } catch (err) {
        // Ignored if widget is not placed on the home screen
      }
    }
  } catch (err) {
    console.log('[WidgetSync] Native widget update skipped or unavailable:', err);
  }
}

/**
 * Legacy alias for triggerWidgetUpdate
 */
export const triggerAllWidgetsUpdate = triggerWidgetUpdate;

/**
 * Reads cached widget snapshot as legacy WidgetData format for compatibility
 */
export async function getWidgetData(): Promise<WidgetData> {
  const snapshot = await getWidgetSnapshot();
  if (!snapshot) {
    return {
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
  }

  const remainingDailyLimit =
    snapshot.dailyLimit > 0 ? Math.max(0, snapshot.dailyLimit - snapshot.todaySpent) : null;
  const remainingMonthlyBudget =
    snapshot.budgetTotal > 0 ? Math.max(0, snapshot.budgetTotal - snapshot.monthSpent) : null;
  const budgetPercentage =
    snapshot.budgetTotal > 0
      ? Math.min(100, Math.round((snapshot.monthSpent / snapshot.budgetTotal) * 100))
      : 0;

  return {
    enabled: true,
    todaySpent: snapshot.todaySpent,
    dailyLimit: snapshot.dailyLimit,
    remainingDailyLimit,
    thisMonthSpent: snapshot.monthSpent,
    monthlyBudget: snapshot.budgetTotal,
    budgetPercentage,
    remainingMonthlyBudget,
    currency: snapshot.currency,
    theme: 'light',
    lastUpdated: snapshot.updatedAt,
  };
}

/**
 * Core entry point called by app actions (transaction add/edit/delete, settings update, etc.)
 * Builds fresh snapshot from Firestore cache and requests native widget update.
 */
export async function syncWidgetWithTransactions(
  userId?: string,
  _transactionsList?: any[],
  _settings?: any
): Promise<any> {
  if (Platform.OS !== 'android') return;
  if (!userId) {
    console.log('[WidgetSync] Skipping sync: No userId provided');
    return;
  }

  try {
    const snapshot = await buildWidgetSnapshotFromApp(userId);
    await triggerWidgetUpdate(snapshot);
    return snapshot;
  } catch (err) {
    console.warn('[WidgetSync] Error syncing widget snapshot:', err);
  }
}
