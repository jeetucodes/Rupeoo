/**
 * Config plugin for SMS Inbox Import.
 *
 * SAFETY RULE:
 * This plugin controls the two build flavors of Rupeo:
 * 1. "play" flavor (default):
 *    - EXPO_PUBLIC_SMS_INBOX_IMPORT is false or unset.
 *    - Absolutely NO android.permission.READ_SMS or RECEIVE_SMS in AndroidManifest.xml.
 *    - Completely compliant with Google Play SMS permissions policy.
 * 2. "direct" flavor (sideload / website APK only):
 *    - Enabled by setting EXPO_PUBLIC_SMS_INBOX_IMPORT=true.
 *    - Injects android.permission.READ_SMS and compiles the native RupeoSmsModule.
 *    - NEVER upload this flavor or APK to Google Play Console.
 */

const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withSmsInbox = (config) => {
  const isDirectFlavor = process.env.EXPO_PUBLIC_SMS_INBOX_IMPORT === 'true';

  // 1. Android Manifest Permission Management
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    if (isDirectFlavor) {
      // Direct flavor: Add android.permission.READ_SMS
      const hasReadSms = manifest['uses-permission'].some(
        (p) => p.$ && p.$['android:name'] === 'android.permission.READ_SMS'
      );
      if (!hasReadSms) {
        manifest['uses-permission'].push({
          $: { 'android:name': 'android.permission.READ_SMS' },
        });
      }
    } else {
      // Play flavor (default): Strip any SMS permissions to guarantee Play Console compliance
      manifest['uses-permission'] = manifest['uses-permission'].filter((p) => {
        const name = p.$ && p.$['android:name'];
        return name !== 'android.permission.READ_SMS' && name !== 'android.permission.RECEIVE_SMS';
      });
    }

    return config;
  });

  // 2. Native Android Module Setup (only for direct flavor)
  if (isDirectFlavor) {
    config = withDangerousMod(config, [
      'android',
      async (config) => {
        const platformRoot = config.modRequest.platformProjectRoot;
        const mainDir = path.join(platformRoot, 'app', 'src', 'main');
        const javaPkgDir = path.join(mainDir, 'java', 'com', 'innovatexlabs', 'paisewaise');

        if (!fs.existsSync(javaPkgDir)) {
          fs.mkdirSync(javaPkgDir, { recursive: true });
        }

        // 2.1 RupeoSmsModule.kt
        const smsModuleKt = `package com.innovatexlabs.paisewaise

import android.content.ContentResolver
import android.database.Cursor
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class RupeoSmsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RupeoSms"

  @ReactMethod
  fun list(filterJson: ReadableMap?, promise: Promise) {
    try {
      val cr: ContentResolver = reactContext.contentResolver
      val uri = Uri.parse("content://sms/inbox")

      var minDate: Long = 0
      var maxDate: Long = Long.MAX_VALUE
      var maxCount: Int = 500

      if (filterJson != null) {
        if (filterJson.hasKey("minDate")) {
          minDate = filterJson.getDouble("minDate").toLong()
        }
        if (filterJson.hasKey("maxDate")) {
          maxDate = filterJson.getDouble("maxDate").toLong()
        }
        if (filterJson.hasKey("maxCount")) {
          maxCount = filterJson.getInt("maxCount")
        }
      }

      val projection = arrayOf("_id", "address", "body", "date")
      val selection = "date >= ? AND date <= ?"
      val selectionArgs = arrayOf(minDate.toString(), maxDate.toString())
      val sortOrder = "date DESC"

      val cursor: Cursor? = cr.query(uri, projection, selection, selectionArgs, sortOrder)
      val results = Arguments.createArray()

      if (cursor != null) {
        val idIdx = cursor.getColumnIndex("_id")
        val addrIdx = cursor.getColumnIndex("address")
        val bodyIdx = cursor.getColumnIndex("body")
        val dateIdx = cursor.getColumnIndex("date")

        var count = 0
        while (cursor.moveToNext() && count < maxCount) {
          val map = Arguments.createMap()
          val id = if (idIdx >= 0) cursor.getString(idIdx) else ""
          val address = if (addrIdx >= 0) cursor.getString(addrIdx) else ""
          val body = if (bodyIdx >= 0) cursor.getString(bodyIdx) else ""
          val date = if (dateIdx >= 0) cursor.getLong(dateIdx) else 0L

          map.putString("_id", id)
          map.putString("address", address)
          map.putString("body", body)
          map.putDouble("date", date.toDouble())
          results.pushMap(map)
          count++
        }
        cursor.close()
      }

      promise.resolve(results)
    } catch (e: Exception) {
      promise.reject("SMS_READ_ERROR", e.message, e)
    }
  }
}
`;
        fs.writeFileSync(path.join(javaPkgDir, 'RupeoSmsModule.kt'), smsModuleKt, 'utf-8');

        // 2.2 RupeoSmsPackage.kt
        const smsPackageKt = `package com.innovatexlabs.paisewaise

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RupeoSmsPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(RupeoSmsModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
        fs.writeFileSync(path.join(javaPkgDir, 'RupeoSmsPackage.kt'), smsPackageKt, 'utf-8');

        // 2.3 MainApplication.kt: register RupeoSmsPackage()
        const mainAppFile = path.join(javaPkgDir, 'MainApplication.kt');
        if (fs.existsSync(mainAppFile)) {
          let mainAppContent = fs.readFileSync(mainAppFile, 'utf-8');
          if (!mainAppContent.includes('RupeoSmsPackage()')) {
            if (mainAppContent.includes('PackageList(this).packages.apply {')) {
              mainAppContent = mainAppContent.replace(
                'PackageList(this).packages.apply {',
                'PackageList(this).packages.apply {\n          add(RupeoSmsPackage())'
              );
            } else if (mainAppContent.includes('PackageList(this).packages')) {
              mainAppContent = mainAppContent.replace(
                'PackageList(this).packages',
                'PackageList(this).packages.apply {\n          add(RupeoSmsPackage())\n        }'
              );
            }
            fs.writeFileSync(mainAppFile, mainAppContent, 'utf-8');
          }
        }

        return config;
      },
    ]);
  }

  return config;
};

module.exports = withSmsInbox;
