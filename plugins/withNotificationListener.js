/**
 * Expo Config Plugin: withNotificationListener
 *
 * Configures the native Android NotificationListenerService and HeadlessJsTaskService
 * for Rupeo's 100% on-device bank & UPI transaction detection.
 *
 * Replaces all legacy SMS reading/receiving code.
 */

const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withNotificationListener = (config) => {
  // 1. AndroidManifest.xml configuration
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // 1.1 Permission Management: Remove SMS permissions, add notification & battery optimization permissions
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    // Strip legacy READ_SMS and RECEIVE_SMS
    manifest['uses-permission'] = manifest['uses-permission'].filter((p) => {
      const name = p.$ && p.$['android:name'];
      return name !== 'android.permission.READ_SMS' && name !== 'android.permission.RECEIVE_SMS';
    });

    const ensurePermission = (permName) => {
      const exists = manifest['uses-permission'].some(
        (p) => p.$ && p.$['android:name'] === permName
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permName },
        });
      }
    };

    ensurePermission('android.permission.POST_NOTIFICATIONS');
    ensurePermission('android.permission.RECEIVE_BOOT_COMPLETED');
    ensurePermission('android.permission.WAKE_LOCK');
    ensurePermission('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');

    // 1.2 Register NotificationListenerService and HeadlessJsTaskService in <application>
    const application = manifest.application?.[0];
    if (application) {
      if (!application.service) {
        application.service = [];
      }

      // Check if RupeoNotificationListener is already present
      const hasListener = application.service.some(
        (s) => s.$ && s.$['android:name'] === '.RupeoNotificationListener'
      );
      if (!hasListener) {
        application.service.push({
          $: {
            'android:name': '.RupeoNotificationListener',
            'android:label': 'Rupeo Notification Listener',
            'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
            'android:exported': 'true',
          },
          'intent-filter': [
            {
              action: [
                {
                  $: {
                    'android:name': 'android.service.notification.NotificationListenerService',
                  },
                },
              ],
            },
          ],
        });
      }

      // Check if RupeoNotificationHeadlessService is already present
      const hasHeadless = application.service.some(
        (s) => s.$ && s.$['android:name'] === '.RupeoNotificationHeadlessService'
      );
      if (!hasHeadless) {
        application.service.push({
          $: {
            'android:name': '.RupeoNotificationHeadlessService',
            'android:exported': 'false',
          },
        });
      }

      // Check if RupeoBootReceiver is already present
      if (!application.receiver) {
        application.receiver = [];
      }
      const hasBootReceiver = application.receiver.some(
        (r) => r.$ && r.$['android:name'] === '.RupeoBootReceiver'
      );
      if (!hasBootReceiver) {
        application.receiver.push({
          $: {
            'android:name': '.RupeoBootReceiver',
            'android:exported': 'true',
          },
          'intent-filter': [
            {
              action: [
                {
                  $: {
                    'android:name': 'android.intent.action.BOOT_COMPLETED',
                  },
                },
                {
                  $: {
                    'android:name': 'android.intent.action.MY_PACKAGE_REPLACED',
                  },
                },
              ],
            },
          ],
        });
      }

      // 1.3 Ensure notification icons and colors in meta-data
      if (!application['meta-data']) {
        application['meta-data'] = [];
      }
      const ensureMetaData = (name, resource) => {
        const exists = application['meta-data'].some((m) => m.$ && m.$['android:name'] === name);
        if (!exists) {
          application['meta-data'].push({
            $: { 'android:name': name, 'android:resource': resource },
          });
        }
      };
      ensureMetaData('expo.modules.notifications.default_notification_icon', '@drawable/notification_icon');
      ensureMetaData('expo.modules.notifications.default_notification_color', '@color/notification_icon_color');
      ensureMetaData('com.google.firebase.messaging.default_notification_icon', '@drawable/notification_icon');
      ensureMetaData('com.google.firebase.messaging.default_notification_color', '@color/notification_icon_color');

      // 1.4 Ensure MainActivity uses singleTask launchMode to prevent duplicate instances
      if (application.activity) {
        const mainActivity = application.activity.find(
          (a) => a.$ && (a.$['android:name'] === '.MainActivity' || a.$['android:name'] === 'com.innovatexlabs.paisewaise.MainActivity')
        );
        if (mainActivity && mainActivity.$) {
          mainActivity.$['android:launchMode'] = 'singleTask';
        }
      }
    }

    return config;
  });

  // 2. Dangerous Mod: Write Kotlin native module & services
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;
      const mainDir = path.join(platformRoot, 'app', 'src', 'main');
      const javaPkgDir = path.join(mainDir, 'java', 'com', 'innovatexlabs', 'paisewaise');

      if (!fs.existsSync(javaPkgDir)) {
        fs.mkdirSync(javaPkgDir, { recursive: true });
      }

      // 2.1 RupeoNotificationListener.kt
      const listenerKt = `package com.innovatexlabs.paisewaise

import android.app.Notification
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import java.util.regex.Pattern

class RupeoNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "RupeoNotifListener"

        @Volatile
        var isConnected: Boolean = false
            private set

        // Allowlisted package IDs for SMS apps and Indian UPI/Banking apps
        private val ALLOWLISTED_PACKAGES = setOf(
            // SMS Apps
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
            "com.miui.mms",
            "com.coloros.mms",
            "com.oppo.mms",
            "com.vivo.mms",
            "com.motorola.messaging",
            "com.oneplus.mms",

            // Major Indian UPI & Fintech Apps
            "com.google.android.apps.nbu.paisa.user", // Google Pay
            "com.phonepe.app",                       // PhonePe
            "net.one97.paytm",                       // Paytm
            "in.org.npci.upiapp",                    // BHIM UPI
            "com.dreamplug.androidapp",              // CRED
            "com.citrus.citruspay",                  // LazyPay
            "com.jupiter.money",                     // Jupiter
            "com.epifi",                             // Fi Money
            "com.onecard",                           // OneCard
            "com.freecharge.android",                // Freecharge
            "com.mobikwik_new",                      // MobiKwik
            "in.amazon.mShop.android.shopping",      // Amazon Pay

            // Major Indian Banks
            "com.csam.icici.bank.imobile",           // ICICI iMobile
            "com.snapwork.hdfc",                     // HDFC Bank MobileBanking
            "com.sbi.SBIFreedomPlus",                // YONO SBI
            "com.axis.mobile",                       // Axis Mobile
            "com.msf.kbank.mobile",                  // Kotak 811
            "com.rblbank.mobank",                    // RBL MoBank
            "com.bankofbaroda.mconnect",             // bob World
            "com.infrasofttech.canarabank",          // Canara ai1
            "com.fss.pnb",                           // PNB One
            "com.fedmobile",                         // Federal Bank
            "com.idfcfirstbank.optimus",             // IDFC FIRST Bank
            "com.indusind.indusmobile",              // IndusInd Bank
            "com.yesbank",                           // YES Bank
            "com.aubank.aupay"                       // AU 0101
        )

        // On-device rejection pattern for OTP, promotions, and advisory notices
        private val OTP_PROMO_REGEX = Pattern.compile(
            "(?i)\\\\b(otp|one\\\\s*time\\\\s*password|verification\\\\s*code|secret\\\\s*code|security\\\\s*code|never\\\\s*share|do\\\\s*not\\\\s*share|promo|cashback\\\\s*offer|flat\\\\s*\\\\d+%\\\\s*off|discount\\\\s*coupon|congratulations|exclusive\\\\s*deal)\\\\b"
        )

        // Strict financial transaction pattern matching debited / credited / spent
        private val FINANCIAL_PATTERN_REGEX = Pattern.compile(
            "(?i)\\\\b(rs\\\\.?|inr|₹)\\\\s*\\\\d+([.,]\\\\d+)?|\\\\b(debited|credited|spent|paid|withdrawn|deposited|sent|transferred|received|refunded|dr\\\\.?|cr\\\\.?)\\\\b"
        )
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        isConnected = true
        Log.i(TAG, "RupeoNotificationListener connected successfully.")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isConnected = false
        Log.w(TAG, "RupeoNotificationListener disconnected.")
    }

    override fun onDestroy() {
        super.onDestroy()
        isConnected = false
        Log.i(TAG, "RupeoNotificationListener destroyed.")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return

        // 1. Strict package allowlist check: Never process or store non-allowlisted apps
        if (!ALLOWLISTED_PACKAGES.contains(packageName)) {
            return
        }

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        // 2. Extract notification details
        val titleCharSequence = extras.getCharSequence(Notification.EXTRA_TITLE)
        val textCharSequence = extras.getCharSequence(Notification.EXTRA_TEXT)
        val bigTextCharSequence = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        val subTextCharSequence = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)

        val title = titleCharSequence?.toString() ?: ""
        val text = textCharSequence?.toString() ?: ""
        val bigText = bigTextCharSequence?.toString() ?: ""
        val subText = subTextCharSequence?.toString() ?: ""

        // Prefer longest text representation
        val body = if (bigText.length > text.length) bigText else text
        val combinedText = "\$title \$body \$subText".trim()

        if (combinedText.isEmpty()) {
            return
        }

        // 3. Drop OTP / promo / "do not share" messages on-device
        if (OTP_PROMO_REGEX.matcher(combinedText).find()) {
            Log.d(TAG, "Dropped OTP/Promo notification from: \$packageName")
            return
        }

        // 4. Keep only text matching debit/credit patterns
        if (!FINANCIAL_PATTERN_REGEX.matcher(combinedText).find()) {
            Log.d(TAG, "Dropped non-financial notification from: \$packageName")
            return
        }

        val postTime = sbn.postTime.takeIf { it > 0 } ?: System.currentTimeMillis()

        Log.i(TAG, "Matching financial notification detected from \$packageName. Launching Headless JS task...")

        // 5. Deliver to JS via HeadlessJsTaskService so it works even when the app is killed
        try {
            val serviceIntent = Intent(applicationContext, RupeoNotificationHeadlessService::class.java).apply {
                putExtra("packageName", packageName)
                putExtra("title", title)
                putExtra("text", body)
                putExtra("combinedText", combinedText)
                putExtra("postTime", postTime)
            }
            HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
            applicationContext.startService(serviceIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch HeadlessJsTaskService: \${e.message}", e)
        }
    }
}
`;
      fs.writeFileSync(path.join(javaPkgDir, 'RupeoNotificationListener.kt'), listenerKt, 'utf-8');

      // 2.2 RupeoNotificationHeadlessService.kt
      const headlessServiceKt = `package com.innovatexlabs.paisewaise

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class RupeoNotificationHeadlessService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras ?: return null
        return HeadlessJsTaskConfig(
            "RupeoNotificationTask",
            Arguments.fromBundle(extras),
            10000, // 10 seconds timeout
            true   // allowedInForeground
        )
    }
}
`;
      fs.writeFileSync(path.join(javaPkgDir, 'RupeoNotificationHeadlessService.kt'), headlessServiceKt, 'utf-8');

      // 2.3 RupeoBootReceiver.kt
      const bootReceiverKt = `package com.innovatexlabs.paisewaise

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.util.Log

class RupeoBootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "RupeoBootReceiver"
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return
        val action = intent.action
        if (Intent.ACTION_BOOT_COMPLETED == action || Intent.ACTION_MY_PACKAGE_REPLACED == action) {
            Log.i(TAG, "Rebinding RupeoNotificationListener on action: $action")
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    val componentName = ComponentName(context, RupeoNotificationListener::class.java)
                    NotificationListenerService.requestRebind(componentName)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to rebind on boot: \${e.message}", e)
            }
        }
    }
}
`;
      fs.writeFileSync(path.join(javaPkgDir, 'RupeoBootReceiver.kt'), bootReceiverKt, 'utf-8');

      // 2.4 RupeoNotifModule.kt
      const notifModuleKt = `package com.innovatexlabs.paisewaise

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RupeoNotifModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "RupeoNotifModule"

    @ReactMethod
    fun isListenerEnabled(promise: Promise) {
        try {
            val packageName = reactContext.packageName
            val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(reactContext)
            val isEnabled = enabledPackages.contains(packageName)
            promise.resolve(isEnabled)
        } catch (e: Exception) {
            promise.reject("ERR_CHECK_LISTENER", e.message, e)
        }
    }

    @ReactMethod
    fun openListenerSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            try {
                val fallbackIntent = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(fallbackIntent)
                promise.resolve(true)
            } catch (err: Exception) {
                promise.reject("ERR_OPEN_SETTINGS", err.message, err)
            }
        }
    }

    @ReactMethod
    fun isListenerConnected(promise: Promise) {
        promise.resolve(RupeoNotificationListener.isConnected)
    }

    @ReactMethod
    fun requestRebind(promise: Promise) {
        try {
            if (RupeoNotificationListener.isConnected) {
                // Service is already connected and actively listening 24/7 - avoid duplicate binder churn
                promise.resolve(true)
                return
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val componentName = ComponentName(reactContext, RupeoNotificationListener::class.java)
                android.service.notification.NotificationListenerService.requestRebind(componentName)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun getManufacturer(promise: Promise) {
        promise.resolve(Build.MANUFACTURER.lowercase())
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
                val isIgnoring = pm.isIgnoringBatteryOptimizations(reactContext.packageName)
                promise.resolve(isIgnoring)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun isBatteryOptimizationIgnored(promise: Promise) {
        isIgnoringBatteryOptimizations(promise)
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:" + reactContext.packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERR_BATTERY_OPT", e.message, e)
        }
    }

    @ReactMethod
    fun openOEMAutoStartSettings(promise: Promise) {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val intents = mutableListOf<Intent>()

        when {
            manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> {
                intents.add(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")))
            }
            manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus") -> {
                intents.add(Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")))
                intents.add(Intent().setComponent(ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")))
                intents.add(Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")))
            }
            manufacturer.contains("vivo") || manufacturer.contains("iqoo") -> {
                intents.add(Intent().setComponent(ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")))
                intents.add(Intent().setComponent(ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")))
            }
            manufacturer.contains("huawei") || manufacturer.contains("honor") -> {
                intents.add(Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")))
                intents.add(Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity")))
            }
            manufacturer.contains("samsung") -> {
                intents.add(Intent().setComponent(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")))
                intents.add(Intent().setComponent(ComponentName("com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity")))
            }
        }

        // Fallback: App info details screen
        intents.add(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:" + reactContext.packageName)
        })

        var opened = false
        for (intent in intents) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactContext.startActivity(intent)
                opened = true
                break
            } catch (_: Exception) {
                // Try next intent
            }
        }

        promise.resolve(opened)
    }
}
`;
      fs.writeFileSync(path.join(javaPkgDir, 'RupeoNotifModule.kt'), notifModuleKt, 'utf-8');

      // 2.4 RupeoNotifPackage.kt
      const notifPackageKt = `package com.innovatexlabs.paisewaise

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RupeoNotifPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(RupeoNotifModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;
      fs.writeFileSync(path.join(javaPkgDir, 'RupeoNotifPackage.kt'), notifPackageKt, 'utf-8');

      // 2.5 MainApplication.kt: Register RupeoNotifPackage()
      const mainAppFile = path.join(javaPkgDir, 'MainApplication.kt');
      if (fs.existsSync(mainAppFile)) {
        let mainAppContent = fs.readFileSync(mainAppFile, 'utf-8');

        // Clean up legacy RupeoSmsPackage if it was ever added
        if (mainAppContent.includes('add(RupeoSmsPackage())')) {
          mainAppContent = mainAppContent.replace(/\s*add\(RupeoSmsPackage\(\)\)/g, '');
        }

        if (!mainAppContent.includes('RupeoNotifPackage()')) {
          if (mainAppContent.includes('PackageList(this).packages.apply {')) {
            mainAppContent = mainAppContent.replace(
              'PackageList(this).packages.apply {',
              'PackageList(this).packages.apply {\n          add(RupeoNotifPackage())'
            );
          } else if (mainAppContent.includes('PackageList(this).packages')) {
            mainAppContent = mainAppContent.replace(
              'PackageList(this).packages',
              'PackageList(this).packages.apply {\n          add(RupeoNotifPackage())\n        }'
            );
          }
          fs.writeFileSync(mainAppFile, mainAppContent, 'utf-8');
        }
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withNotificationListener;
