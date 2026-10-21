import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { getWidgetSnapshot, getRenderSnapshot, isWidgetLoggedOut } from '@/lib/widgetSnapshot';
import { WidgetFallbackState, WidgetLoggedOutState } from './WidgetCommon';

import { TodaySummaryWidget } from './TodaySummaryWidget';
import { QuickAddWidget } from './QuickAddWidget';
import { MonthOverviewWidget } from './MonthOverviewWidget';
import { BudgetProgressWidget } from './BudgetProgressWidget';
import { RecentTransactionsWidget } from './RecentTransactionsWidget';
import { UdharSummaryWidget } from './UdharSummaryWidget';
import { GoalsProgressWidget } from './GoalsProgressWidget';
import { UpcomingBillsWidget } from './UpcomingBillsWidget';
import { WeeklySpendingWidget } from './WeeklySpendingWidget';
import { InsightWidget } from './InsightWidget';
import { QuickActionsWidget } from './QuickActionsWidget';
import { error } from '@/lib/logger';

/**
 * Headless Android Widget Task Handler.
 * CRITICAL ARCHITECTURE RULE:
 * This handler runs in an isolated Android Headless JS background context.
 * It MUST NEVER initialize or access Firebase Auth/Firestore or React Context.
 * It ONLY reads the pre-computed snapshot from AsyncStorage.
 * Every branch is wrapped in try/catch to ensure widgets NEVER render blank.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  try {
    const { widgetAction, widgetInfo, renderWidget } = props;
    const widgetName = widgetInfo?.widgetName || 'QuickAddWidget';

    if (widgetAction === 'WIDGET_DELETED') {
      // Cleanup if necessary (none required for snapshot storage)
      return;
    }

    if (widgetAction === 'WIDGET_CLICK') {
      // OPEN_URI deep links are dispatched natively by Android
      return;
    }

    if (
      widgetAction === 'WIDGET_ADDED' ||
      widgetAction === 'WIDGET_UPDATE' ||
      widgetAction === 'WIDGET_RESIZED'
    ) {
      try {
        const loggedOut = await isWidgetLoggedOut();
        if (loggedOut) {
          renderWidget(<WidgetLoggedOutState />);
          return;
        }

        const rawSnapshot = await getWidgetSnapshot();
        if (!rawSnapshot) {
          // If no snapshot exists yet, show friendly sync prompt instead of 0 or blank
          renderWidget(<WidgetFallbackState message="Open Rupeo to sync" />);
          return;
        }

        // Adjust for midnight rollover in render time
        const snapshot = getRenderSnapshot(rawSnapshot);

        switch (widgetName) {
          case 'TodaySummaryWidget':
            renderWidget(<TodaySummaryWidget snapshot={snapshot} />);
            break;

          case 'QuickAddWidget':
            renderWidget(<QuickAddWidget snapshot={snapshot} />);
            break;

          case 'MonthOverviewWidget':
            renderWidget(<MonthOverviewWidget snapshot={snapshot} />);
            break;

          case 'BudgetProgressWidget':
            renderWidget(<BudgetProgressWidget snapshot={snapshot} />);
            break;

          case 'RecentTransactionsWidget':
            renderWidget(<RecentTransactionsWidget snapshot={snapshot} />);
            break;

          case 'UdharSummaryWidget':
            renderWidget(<UdharSummaryWidget snapshot={snapshot} />);
            break;

          case 'GoalsProgressWidget':
            renderWidget(<GoalsProgressWidget snapshot={snapshot} />);
            break;

          case 'UpcomingBillsWidget':
            renderWidget(<UpcomingBillsWidget snapshot={snapshot} />);
            break;

          case 'WeeklySpendingWidget':
            renderWidget(<WeeklySpendingWidget snapshot={snapshot} />);
            break;

          case 'InsightWidget':
            renderWidget(<InsightWidget snapshot={snapshot} />);
            break;

          case 'QuickActionsWidget':
            renderWidget(<QuickActionsWidget snapshot={snapshot} />);
            break;

          default:
            // Fallback for any unknown widget name
            renderWidget(<QuickAddWidget snapshot={snapshot} />);
            break;
        }
      } catch (renderError) {
        error('[WidgetTaskHandler] Error rendering widget:', widgetName, renderError);
        // Fallback: render safe UI, NEVER return nothing or leave blank
        try {
          renderWidget(<WidgetFallbackState message="Open Rupeo to sync" />);
        } catch (fallbackError) {
          // Native widget framework could not render fallback UI
          error('[WidgetTaskHandler] Fallback widget render failed:', fallbackError);
        }
      }
    }
  } catch (globalError) {
    error('[WidgetTaskHandler] Global exception in task handler:', globalError);
  }
}
