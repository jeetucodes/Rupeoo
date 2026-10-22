import type { NotificationLanguage, NotificationPlaceholders } from './types.ts';
import { resolveNotificationMessage } from './messages/index.ts';

export const QUIET_START_HOUR = 23; // 11:00 PM
export const QUIET_END_HOUR = 8;    // 8:00 AM
export const MAX_DAILY_SCHEDULED = 6;
export const MAX_TOTAL_NOTIFICATIONS_PER_DAY = 10;

/**
 * Checks if a given Date is within the quiet window (11:00 PM to 8:00 AM).
 * Quiet window: hours >= 23 OR hours < 8.
 */
export function isQuietWindow(date: Date): boolean {
  const hour = date.getHours();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Parses "HH:mm" time string into 0-23 hours and 0-59 minutes.
 */
export function parseTimeString(timeStr: string = '22:00'): { hour: number; minute: number } {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] || '22', 10);
  const m = parseInt(parts[1] || '0', 10);
  return {
    hour: isNaN(h) ? 22 : Math.max(0, Math.min(23, h)),
    minute: isNaN(m) ? 0 : Math.max(0, Math.min(59, m)),
  };
}

/**
 * Determines which morning notification key to use.
 * If dailyBudget <= 0, skips budget text and uses 'morning'.
 * If dailyBudget > 0, uses 'morning_with_budget'.
 */
export function getMorningTemplateKey(dailyBudget: number): 'morning' | 'morning_with_budget' {
  return dailyBudget > 0 ? 'morning_with_budget' : 'morning';
}

/**
 * Determines which lunch notification key to use based on whether spending has occurred today.
 */
export function getLunchTemplateKey(spentToday: number): 'lunch' | 'lunch_spent' {
  return spentToday > 0 ? 'lunch_spent' : 'lunch';
}

/**
 * Determines which daily report template key to use based on budget & spending.
 */
export function getDailyReportTemplateKey(
  spent: number,
  budget: number
): 'report_zero' | 'report_under' | 'report_over' {
  if (spent <= 0) return 'report_zero';
  if (budget > 0 && spent > budget) return 'report_over';
  return 'report_under';
}

/**
 * Checks if 80% budget alert should fire today.
 */
export function shouldTriggerBudget80(
  spent: number,
  dailyBudget: number,
  alreadyFiredToday: boolean
): boolean {
  if (alreadyFiredToday || dailyBudget <= 0) return false;
  return spent >= dailyBudget * 0.8 && spent <= dailyBudget;
}

/**
 * Checks if over-budget alert should fire today.
 * Fires once per day only when crossed.
 */
export function shouldTriggerBudgetOver(
  spent: number,
  dailyBudget: number,
  alreadyFiredToday: boolean
): boolean {
  if (alreadyFiredToday || dailyBudget <= 0) return false;
  return spent > dailyBudget;
}

/**
 * Determines whether a midday or evening nudge should be skipped.
 * - Skips if user logged a transaction within the last 2 hours.
 * - Skips evening nudge if user logged 3+ transactions today.
 */
export function shouldSkipNudge(params: {
  slotType: 'lunch' | 'teatime' | 'evening';
  nowMs: number;
  lastTransactionTime: number | null;
  todayCount: number;
}): boolean {
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  if (params.lastTransactionTime && params.nowMs - params.lastTransactionTime < TWO_HOURS_MS) {
    return true;
  }
  if (params.slotType === 'evening' && params.todayCount >= 3) {
    return true;
  }
  return false;
}

/**
 * Enforces the daily notification cap (max 6 scheduled slots per day).
 */
export function enforceDailyCap(scheduledCount: number): boolean {
  return scheduledCount <= MAX_DAILY_SCHEDULED;
}
