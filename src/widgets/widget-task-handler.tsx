import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { QuickAddWidget } from './QuickAddWidget';
import { getWidgetData } from '@/lib/widgetSync';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetData = await getWidgetData();

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(
        <QuickAddWidget
          enabled={widgetData.enabled}
          todaySpent={widgetData.todaySpent}
          dailyLimit={widgetData.dailyLimit}
          remainingLimit={widgetData.remainingDailyLimit}
          currency={widgetData.currency}
          theme={widgetData.theme}
        />
      );
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
