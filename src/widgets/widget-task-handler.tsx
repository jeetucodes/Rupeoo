import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { QuickAddWidget } from './QuickAddWidget';
import { InsightWidget } from './InsightWidget';
import { QuickActionsWidget } from './QuickActionsWidget';
import { getWidgetData } from '@/lib/widgetSync';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetData = await getWidgetData();
  const widgetName = props.widgetInfo?.widgetName || 'QuickAddWidget';

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      if (widgetName === 'InsightWidget') {
        props.renderWidget(
          <InsightWidget
            thisMonthSpent={widgetData.thisMonthSpent}
            monthlyBudget={widgetData.monthlyBudget}
            budgetPercentage={widgetData.budgetPercentage}
            remainingMonthlyBudget={widgetData.remainingMonthlyBudget}
            todaySpent={widgetData.todaySpent}
            currency={widgetData.currency}
          />
        );
      } else if (widgetName === 'QuickActionsWidget') {
        props.renderWidget(<QuickActionsWidget currency={widgetData.currency} />);
      } else {
        props.renderWidget(
          <QuickAddWidget
            todaySpent={widgetData.todaySpent}
            dailyLimit={widgetData.dailyLimit}
            remainingLimit={widgetData.remainingDailyLimit}
            currency={widgetData.currency}
          />
        );
      }
      break;

    case 'WIDGET_CLICK':
      // OPEN_URI deep links are dispatched natively
      break;

    case 'WIDGET_DELETED':
      break;

    default:
      break;
  }
}
