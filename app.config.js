/**
 * Dynamic Expo Configuration for Rupeo.
 *
 * SAFETY & FLAVOR NOTICE:
 * - "play" flavor (default): EXPO_PUBLIC_SMS_INBOX_IMPORT !== 'true'.
 *   Completely omits android.permission.READ_SMS and RECEIVE_SMS.
 *   This is the ONLY flavor authorized for Google Play Store upload.
 *
 * - "direct" flavor (website APK / sideload only): EXPO_PUBLIC_SMS_INBOX_IMPORT === 'true'.
 *   Adds android.permission.READ_SMS and enables full inbox background scanning.
 *   DO NOT upload builds with this flag to Google Play Console.
 */

module.exports = ({ config }) => {
  const isDirectFlavor = process.env.EXPO_PUBLIC_SMS_INBOX_IMPORT === 'true';

  if (!config.plugins) {
    config.plugins = [];
  }

  // Ensure withSmsInbox plugin is registered to manage permissions and native modules
  if (!config.plugins.includes('./plugins/withSmsInbox.js')) {
    config.plugins.push('./plugins/withSmsInbox.js');
  }

  if (config.android && Array.isArray(config.android.permissions)) {
    if (isDirectFlavor) {
      if (!config.android.permissions.includes('android.permission.READ_SMS')) {
        config.android.permissions.push('android.permission.READ_SMS');
      }
    } else {
      // Remove any SMS permissions from the play flavor
      config.android.permissions = config.android.permissions.filter(
        (p) => p !== 'android.permission.READ_SMS' && p !== 'android.permission.RECEIVE_SMS'
      );
    }
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      smsInboxImportEnabled: isDirectFlavor,
    },
  };
};
