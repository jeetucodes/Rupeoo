/**
 * Dynamic Expo Configuration for Rupeo.
 *
 * Configures Rupeo with 100% on-device Notification Listener for bank/UPI auto-tracking.
 * Completely omits android.permission.READ_SMS and RECEIVE_SMS.
 */

module.exports = ({ config }) => {
  if (!config.plugins) {
    config.plugins = [];
  }

  // Register notification listener plugin
  if (!config.plugins.includes('./plugins/withNotificationListener.js')) {
    config.plugins.push('./plugins/withNotificationListener.js');
  }

  // Ensure expo-sqlite is in plugins
  if (!config.plugins.includes('expo-sqlite')) {
    config.plugins.push('expo-sqlite');
  }

  // Ensure absolutely no SMS permissions exist
  if (config.android && Array.isArray(config.android.permissions)) {
    config.android.permissions = config.android.permissions.filter(
      (p) => p !== 'android.permission.READ_SMS' && p !== 'android.permission.RECEIVE_SMS'
    );

    if (!config.android.permissions.includes('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS')) {
      config.android.permissions.push('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');
    }
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      notificationListenerEnabled: true,
    },
  };
};
