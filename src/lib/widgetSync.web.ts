import type { UserSettings } from '@/lib/database';

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
  theme: 'dark',
  lastUpdated: Date.now(),
};

/**
 * Web stub: Reads cached widget data
 */
export async function getWidgetData(): Promise<WidgetData> {
  return DEFAULT_WIDGET_DATA;
}

/**
 * Web stub: No native Android widget on web
 */
export async function triggerWidgetUpdate(): Promise<void> {
  // No-op on Web
}

/**
 * Web stub: Calculates spend & returns default widget data without native modules
 */
export async function syncWidgetWithTransactions(
  _userId?: string,
  _transactionsList?: any[],
  _settings?: UserSettings | null
): Promise<WidgetData> {
  return DEFAULT_WIDGET_DATA;
}
