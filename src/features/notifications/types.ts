/**
 * Core type definitions for Rupeo's personalized notification system.
 */

export type NotificationLanguage = 'en' | 'hi' | 'hinglish';

export type NotificationType =
  | 'morning'
  | 'lunch'
  | 'teatime'
  | 'evening'
  | 'daily_report'
  | 'budget_80'
  | 'budget_over'
  | 'weekly_report'
  | 'transaction_added';

export interface NotificationPlaceholders {
  name?: string;
  spent?: string;
  budget?: string;
  left?: string;
  over?: string;
  category?: string;
  percent?: string;
  top_category?: string;
  top_amount?: string;
  count?: number | string;
  biggest?: string;
  amount?: string;
  merchant?: string;
  [key: string]: string | number | undefined;
}

export interface NotificationMessageVariant {
  title: string;
  body: string;
}

export interface NotificationSettings {
  masterEnabled: boolean;
  userName: string;
  language: NotificationLanguage;
  dailyBudget: number;
  dailyReportTime: string; // "HH:mm", default "22:00"
}

export interface DaySpendingStats {
  spent: number;
  count: number;
  topCategory: string;
  topAmount: number;
  biggest: number;
  lastTransactionTime: number | null;
  budgetLeft: number;
  budgetOver: number;
}
