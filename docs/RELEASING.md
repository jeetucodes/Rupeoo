# Rupeo App Releasing & Version Update Guide

This document describes how to release new updates to Google Play, bump version codes, and manage remote In-App / forced updates via Firestore.

---

## 1. Bumping Version in `app.json`

Before building an Android App Bundle (.aab) for Google Play release, update `app.json`:

1. Open [app.json](file:///c:/Users/pc/Desktop/Rupeo/app.json).
2. Bump `version` under `expo`:
   ```json
   "version": "2.1.10"
   ```
3. Increment `versionCode` by 1 under `expo.android`:
   ```json
   "android": {
     "versionCode": 37
   }
   ```
   > Google Play rejects any upload that does not have a strictly higher `versionCode` than the previous release.

---

## 2. Remote Version Config in Firebase Firestore

Rupeo checks Firestore `app_config/global` in real-time. You can configure update prompts dynamically from the **Firebase Console** without pushing a code update.

### Firestore Path
`app_config/global`

### Fields to Add/Edit

| Field Name | Type | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `latestVersionCode` | `number` | `37` | The latest version available on Google Play. Any user on a lower version gets a **SOFT** update prompt. |
| `minSupportedVersionCode` | `number` | `36` | The minimum required version. Any user on a lower version gets a non-dismissible **FORCE** update modal. |
| `updateTitle` | `string` | `"Update to v2.1.10"` | *(Optional)* Custom title for the modal. Falls back to localized default. |
| `updateMessage` | `string` | `"Bug fixes & performance boosts."` | *(Optional)* Custom message. Falls back to localized default. |
| `updateCooldownHours` | `number` | `24` | Hours to wait before re-showing a SOFT update prompt after user clicks "Later". Default is `24`. |

### Example Scenarios:

#### Scenario A: Optional / Routine Update (SOFT Mode)
- `latestVersionCode`: `36`
- `minSupportedVersionCode`: `30` (or omitted)
- User on `versionCode: 35`:
  - Receives "Update Available" popup with **"Update Now"** and **"Later"** buttons.
  - Tapping "Later" silences the prompt for `updateCooldownHours` (default 24 hours).
  - Tapping "Update Now" triggers the Google Play Flexible In-App Update flow (or opens the Play Store page).

#### Scenario B: Mandatory / Critical Bug Fix (FORCE Mode)
- `latestVersionCode`: `36`
- `minSupportedVersionCode`: `36`
- User on `versionCode: 35`:
  - Receives non-dismissible "Update Required" modal.
  - Android hardware back button is blocked.
  - Backdrop tap is disabled.
  - Only **"Update Now"** is available.
  - App behind the modal cannot be used until updated.

#### Scenario C: No Update Prompt
- Omit `latestVersionCode` and `minSupportedVersionCode` (or set them lower than/equal to the installed build). No modal is shown.

---

## 3. Testing Updates on Android

### A. Internal App Sharing (Recommended for Quick Verification)
1. Go to **Google Play Console** -> **Setup** -> **Internal app sharing**.
2. Upload a test build with an older `versionCode` (e.g. `34`) and install it on your device.
3. Upload a build with a newer `versionCode` (e.g. `35`) to Internal App Sharing or Internal Testing.
4. Set `latestVersionCode: 35` in Firestore `app_config/global`.
5. Launch the app on your device: the update prompt will appear.

### B. Testing Sideloaded / Debug Builds
- If the app was installed directly via USB/APK (`adb install`) instead of Google Play, Google Play Core In-App Updates will return an error (`ERROR_APP_NOT_OWNED`).
- Rupeo safely catches this and seamlessly redirects the user to the Play Store listing (`market://details?id=com.innovatexlabs.paisewaise` or web fallback).

---

## 4. Build Flavors: Play Store vs. Direct Sideload APK

Rupeo uses a Google Play Store-compliant on-device Notification Listener architecture:

### A. Production & Development Builds
- **Manifest Permissions**: **NO** `android.permission.READ_SMS` or `RECEIVE_SMS`. Completely compliant with Google Play Store SMS policy.
- **Auto-Add Capabilities**: On-device Notification Listener Service (`RupeoNotificationListener`) detects bank and UPI transaction alerts (Google Pay, PhonePe, Paytm, BHIM, iMobile, HDFC, SBI, Axis, Kotak, etc.) and processes them via Headless JS without reading the SMS inbox.
- **Import Capabilities**: On-device multi-message paste/clipboard import as a fallback.
- **Build Commands**:
  - Development build:
    ```bash
    npx expo prebuild --clean
    eas build --profile development --platform android
    ```
  - Production build:
    ```bash
    eas build --platform android --profile production
    ```
