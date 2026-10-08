import React from 'react';
import type { WidgetSnapshot } from '@/lib/widgetSnapshot';
import { MonthOverviewWidget } from './MonthOverviewWidget';

export interface InsightWidgetProps {
  snapshot?: WidgetSnapshot | null;
  thisMonthSpent?: number;
  monthlyBudget?: number;
  budgetPercentage?: number;
  remainingMonthlyBudget?: number | null;
  todaySpent?: number;
  currency?: string;
}

/**
 * InsightWidget - Backward-compatible wrapper mapping to MonthOverviewWidget
 */
export function InsightWidget({
  snapshot,
  thisMonthSpent,
  monthlyBudget,
  currency = '₹',
}: InsightWidgetProps) {
  if (snapshot) {
    return <MonthOverviewWidget snapshot={snapshot} />;
  }

  // Fallback with synthetic snapshot from legacy props
  const syntheticSnapshot: WidgetSnapshot = {
    version: 1,
    updatedAt: Date.now(),
    snapshotDate: '',
    currency,
    todaySpent: 0,
    todayIncome: 0,
    monthSpent: thisMonthSpent || 0,
    monthIncome: 0,
    balance: 0,
    dailyLimit: 0,
    budgetTotal: monthlyBudget || 0,
    budgetUsed: thisMonthSpent || 0,
    topCategories: [],
    recentTransactions: [],
    udhar: { toReceive: 0, toPay: 0, topPeople: [] },
    goals: [],
    upcomingBills: [],
    weeklySpend: [],
  };

  return <MonthOverviewWidget snapshot={syntheticSnapshot} />;
}
