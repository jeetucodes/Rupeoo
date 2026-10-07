import { Platform } from 'react-native';

export { QuickAddWidget } from './QuickAddWidget';
export { InsightWidget } from './InsightWidget';
export { QuickActionsWidget } from './QuickActionsWidget';
export { widgetTaskHandler } from './widget-task-handler';

// Register the task handler only on Android
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./widget-task-handler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (err) {
    console.log('[Widget] registerWidgetTaskHandler deferred or unavailable');
  }
}
