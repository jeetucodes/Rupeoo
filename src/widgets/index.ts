import { Platform } from 'react-native';

export { TodaySummaryWidget } from './TodaySummaryWidget';
export { QuickAddWidget } from './QuickAddWidget';
export { MonthOverviewWidget } from './MonthOverviewWidget';
export { BudgetProgressWidget } from './BudgetProgressWidget';
export { RecentTransactionsWidget } from './RecentTransactionsWidget';
export { UdharSummaryWidget } from './UdharSummaryWidget';
export { GoalsProgressWidget } from './GoalsProgressWidget';
export { UpcomingBillsWidget } from './UpcomingBillsWidget';
export { WeeklySpendingWidget } from './WeeklySpendingWidget';
export { InsightWidget } from './InsightWidget';
export { QuickActionsWidget } from './QuickActionsWidget';
export { widgetTaskHandler } from './widget-task-handler';

// Register the Android headless widget task handler
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./widget-task-handler');
    registerWidgetTaskHandler(widgetTaskHandler);
    console.log('[Widget] registerWidgetTaskHandler initialized');
  } catch (err) {
    console.log('[Widget] registerWidgetTaskHandler deferred or unavailable:', err);
  }
}
