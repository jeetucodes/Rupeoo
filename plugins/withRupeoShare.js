const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withRupeoShare = (config) => {
  // 1. Write Native Kotlin files and FileProvider XML
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;
      const mainDir = path.join(platformRoot, 'app', 'src', 'main');
      const javaPkgDir = path.join(mainDir, 'java', 'com', 'innovatexlabs', 'paisewaise');
      const resXmlDir = path.join(mainDir, 'res', 'xml');

      if (!fs.existsSync(javaPkgDir)) {
        fs.mkdirSync(javaPkgDir, { recursive: true });
      }
      if (!fs.existsSync(resXmlDir)) {
        fs.mkdirSync(resXmlDir, { recursive: true });
      }

      // 1.1 rupeo_file_paths.xml
      const filePathsXml = `<?xml version="1.0" encoding="utf-8"?>
<paths>
    <external-path name="external" path="." />
    <external-files-path name="external_files" path="." />
    <external-cache-path name="external_cache" path="." />
    <files-path name="files" path="." />
    <cache-path name="cache" path="." />
    <root-path name="root" path="." />
</paths>
`;
      fs.writeFileSync(path.join(resXmlDir, 'rupeo_file_paths.xml'), filePathsXml, 'utf-8');

      // 1.2 RupeoFileProvider.kt
      const fileProviderKt = `package com.innovatexlabs.paisewaise

import androidx.core.content.FileProvider

class RupeoFileProvider : FileProvider()
`;
      fs.writeFileSync(path.join(javaPkgDir, 'RupeoFileProvider.kt'), fileProviderKt, 'utf-8');

      // 1.3 RupeoSharePackage.kt
      const sharePackageKt = `package com.innovatexlabs.paisewaise

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RupeoSharePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(RupeoShareModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
      fs.writeFileSync(path.join(javaPkgDir, 'RupeoSharePackage.kt'), sharePackageKt, 'utf-8');

      // 1.3 RupeoShareModule.kt
      const shareModuleKt = `package com.innovatexlabs.paisewaise

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class RupeoShareModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RupeoShare"

  private fun shareInternal(
    filePath: String,
    text: String?,
    dialogTitle: String?,
    targetPackage: String?,
    phoneNumber: String?,
    promise: Promise
  ) {
    try {
      val currentAct = currentActivity
      val cleanPath = if (filePath.startsWith("file://")) {
        filePath.substring(7)
      } else {
        filePath
      }
      val file = File(cleanPath)
      if (!file.exists()) {
        promise.reject("FILE_NOT_FOUND", "File not found at: $filePath")
        return
      }

      val contentUri: Uri = try {
        FileProvider.getUriForFile(
          reactContext,
          "\${reactContext.packageName}.RupeoFileProvider",
          file
        )
      } catch (e: Exception) {
        FileProvider.getUriForFile(
          reactContext,
          "\${reactContext.packageName}.SharingFileProvider",
          file
        )
      }

      val title = dialogTitle ?: "Share Receipt"

      val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, contentUri)
        if (!text.isNullOrEmpty()) {
          putExtra(Intent.EXTRA_TEXT, text)
          putExtra(Intent.EXTRA_SUBJECT, title)
        }
        clipData = ClipData.newUri(reactContext.contentResolver, "Receipt", contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      var openedDirect = false
      if (targetPackage == "whatsapp" || targetPackage == "com.whatsapp") {
        for (waPkg in listOf("com.whatsapp", "com.whatsapp.w4b")) {
          try {
            val isInstalled = try {
              reactContext.packageManager.getPackageInfo(waPkg, PackageManager.GET_ACTIVITIES)
              true
            } catch (e: Exception) {
              false
            }
            if (isInstalled) {
              val waIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                setPackage(waPkg)
                putExtra(Intent.EXTRA_STREAM, contentUri)
                if (!text.isNullOrEmpty()) {
                  putExtra(Intent.EXTRA_TEXT, text)
                }
                clipData = ClipData.newUri(reactContext.contentResolver, "Receipt", contentUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
              }
              reactContext.grantUriPermission(
                waPkg,
                contentUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
              )

              if (currentAct != null) {
                currentAct.startActivity(waIntent)
              } else {
                reactContext.startActivity(waIntent)
              }
              openedDirect = true
              break
            }
          } catch (e: Exception) {
            // fallback
          }
        }
      }

      if (!openedDirect) {
        val chooser = Intent.createChooser(shareIntent, title).apply {
          clipData = ClipData.newUri(reactContext.contentResolver, "Receipt", contentUri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val resInfoList = reactContext.packageManager.queryIntentActivities(
          shareIntent,
          PackageManager.MATCH_DEFAULT_ONLY
        )
        for (resolveInfo in resInfoList) {
          val pkg = resolveInfo.activityInfo.packageName
          try {
            reactContext.grantUriPermission(
              pkg,
              contentUri,
              Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
          } catch (e: Exception) {}
        }

        if (currentAct != null) {
          currentAct.startActivity(chooser)
        } else {
          reactContext.startActivity(chooser)
        }
      }

      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SHARE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun shareImageAndText(
    filePath: String,
    text: String?,
    dialogTitle: String?,
    promise: Promise
  ) {
    shareInternal(filePath, text, dialogTitle, null, null, promise)
  }

  @ReactMethod
  fun shareToWhatsApp(
    filePath: String,
    text: String?,
    phoneNumber: String?,
    promise: Promise
  ) {
    shareInternal(filePath, text, "WhatsApp Receipt", "whatsapp", phoneNumber, promise)
  }

  @ReactMethod
  fun shareImageAndTextWithPackage(
    filePath: String,
    text: String?,
    dialogTitle: String?,
    targetPackage: String?,
    phoneNumber: String?,
    promise: Promise
  ) {
    shareInternal(filePath, text, dialogTitle, targetPackage, phoneNumber, promise)
  }
}
`;
      fs.writeFileSync(path.join(javaPkgDir, 'RupeoShareModule.kt'), shareModuleKt, 'utf-8');

      // 1.4 MainApplication.kt: ensure RupeoSharePackage() is added
      const mainAppFile = path.join(javaPkgDir, 'MainApplication.kt');
      if (fs.existsSync(mainAppFile)) {
        let mainAppContent = fs.readFileSync(mainAppFile, 'utf-8');
        if (!mainAppContent.includes('RupeoSharePackage()')) {
          if (mainAppContent.includes('PackageList(this).packages.apply {')) {
            mainAppContent = mainAppContent.replace(
              'PackageList(this).packages.apply {',
              'PackageList(this).packages.apply {\n          add(RupeoSharePackage())'
            );
          } else if (mainAppContent.includes('PackageList(this).packages')) {
            mainAppContent = mainAppContent.replace(
              'PackageList(this).packages',
              'PackageList(this).packages.apply {\n          add(RupeoSharePackage())\n        }'
            );
          }
          fs.writeFileSync(mainAppFile, mainAppContent, 'utf-8');
        }
      }

      return config;
    },
  ]);

  // 2. AndroidManifest.xml: Add FileProvider & queries
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return config;

    // Check if RupeoFileProvider is already present
    if (!application.provider) {
      application.provider = [];
    }

    const hasProvider = application.provider.some(
      (p) => p.$['android:authorities'] === '${applicationId}.RupeoFileProvider'
    );

    if (!hasProvider) {
      application.provider.push({
        $: {
          'android:name': '.RupeoFileProvider',
          'android:authorities': '${applicationId}.RupeoFileProvider',
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.support.FILE_PROVIDER_PATHS',
              'android:resource': '@xml/rupeo_file_paths',
            },
          },
        ],
      });
    }

    // Ensure queries has image/* intent
    if (!manifest.queries) {
      manifest.queries = [];
    }
    const queries = manifest.queries[0] || (manifest.queries[0] = {});
    if (!queries.intent) {
      queries.intent = [];
    }
    const hasSendIntent = queries.intent.some((i) =>
      i.action?.some((a) => a.$['android:name'] === 'android.intent.action.SEND')
    );
    if (!hasSendIntent) {
      queries.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        data: [{ $: { 'android:mimeType': 'image/*' } }],
      });
    }

    return config;
  });

  return config;
};

module.exports = withRupeoShare;
