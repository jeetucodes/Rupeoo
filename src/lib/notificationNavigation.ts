import { SelfHealingWatchdog } from '@/lib/selfHealing/SelfHealingWatchdog';

let pendingNotificationRoute: string | null = null;
const handledNotificationResponseKeys = new Set<string>();

/**
 * Maps notification payload data to the appropriate app route.
 */
export function getNotificationTargetRoute(data: any): string {
  if (!data) return '/notifications';

  const type = data?.type || data?.typeKey;
  const typeKey = String(data?.typeKey || '');
  const typeStr = String(type || '');

  // Pending inbox alerts
  if (type === 'PENDING_INBOX_ALERT') {
    return '/pending-inbox';
  }

  // Daily, weekly or periodic reports
  if (
    type === 'daily_report' ||
    type === 'report' ||
    typeStr.includes('report') ||
    typeKey.includes('report')
  ) {
    return '/daily-report';
  }

  // Budget alerts & overspends
  if (
    typeStr.includes('budget_over') ||
    typeStr.includes('budget_80') ||
    typeStr.includes('budget_alert') ||
    type === 'budget'
  ) {
    return '/budget';
  }

  // Auto-added transactions
  if (type === 'AUTO_ADD_TRANSACTION' || type === 'transaction_added') {
    if (data?.transactionId) {
      const shouldOpenCat = data?.category === 'Uncategorized';
      return `/transaction/${data.transactionId}${shouldOpenCat ? '?openCategory=true' : ''}`;
    }
    return '/(tabs)/dashboard';
  }

  // Routine nudges & reminders (morning, lunch, teatime, evening, reminders)
  if (
    type === 'welcome_notification' ||
    data?.route === '/add' ||
    typeStr.includes('morning') ||
    typeKey.includes('morning') ||
    typeStr.includes('lunch') ||
    typeKey.includes('lunch') ||
    typeStr.includes('teatime') ||
    typeKey.includes('teatime') ||
    typeStr.includes('evening') ||
    typeKey.includes('evening') ||
    typeStr.includes('reminder') ||
    typeKey.includes('reminder')
  ) {
    return '/add';
  }

  return '/notifications';
}

/**
 * Stores a route to be navigated to once root navigation is fully ready and auth loading finishes.
 */
export function setPendingNotificationRoute(route: string | null): void {
  pendingNotificationRoute = route;
}

/**
 * Peeks at any pending notification route without consuming it.
 */
export function getPendingNotificationRoute(): string | null {
  return pendingNotificationRoute;
}

/**
 * Consumes and clears the pending notification route.
 */
export function consumePendingNotificationRoute(): string | null {
  const route = pendingNotificationRoute;
  pendingNotificationRoute = null;
  return route;
}

/**
 * Checks if a specific notification response has already been handled in the current session.
 */
export function isNotificationResponseHandled(key: string): boolean {
  return handledNotificationResponseKeys.has(key);
}

/**
 * Records that a notification response was processed.
 */
export function markNotificationResponseHandled(key: string): void {
  handledNotificationResponseKeys.add(key);
  if (handledNotificationResponseKeys.size > 100) {
    const firstKey = handledNotificationResponseKeys.values().next().value;
    if (firstKey) handledNotificationResponseKeys.delete(firstKey);
  }
}
