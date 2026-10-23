# Android Finance App Package Verification Guide

This document describes how Android package names for Indian Banks, UPI/Fintech apps, and SMS handlers are verified for Rupeo's Notification Listener.

---

## 1. Google Play Store Verification

Every app published on the Google Play Store has a canonical package identifier in its web URL query parameter:
```
https://play.google.com/store/apps/details?id=<package_name>
```

### Verification Procedure:
1. Open any browser or curl command:
   ```bash
   curl -s -I "https://play.google.com/store/apps/details?id=com.phonepe.app" | head -n 5
   ```
2. **HTTP 200 OK**: Package is live and verified on the Play Store.
3. **HTTP 404 Not Found**: Package does not exist or has been unpublished.

### Quick Verification Examples:
- **PhonePe**: `https://play.google.com/store/apps/details?id=com.phonepe.app` (HTTP 200)
- **Google Pay**: `https://play.google.com/store/apps/details?id=com.google.android.apps.nbu.paisa.user` (HTTP 200)
- **Paytm**: `https://play.google.com/store/apps/details?id=net.one97.paytm` (HTTP 200)
- **YONO SBI**: `https://play.google.com/store/apps/details?id=com.sbi.SBIFreedomPlus` (HTTP 200)
- **HDFC Bank**: `https://play.google.com/store/apps/details?id=com.snapwork.hdfc` (HTTP 200)
- **ICICI iMobile**: `https://play.google.com/store/apps/details?id=com.csam.icici.bank.imobile` (HTTP 200)
- **Kotak 811**: `https://play.google.com/store/apps/details?id=com.msf.kbank.mobile` (HTTP 200)
- **Axis Mobile**: `https://play.google.com/store/apps/details?id=com.axis.mobile` (HTTP 200)

---

## 2. On-Device Verification via ADB

When testing on a physical Android phone with your bank or UPI apps installed:

### List All Installed Packages:
```bash
adb shell pm list packages -3
```

### Search for Specific Banking Apps:
```bash
# Search for SBI
adb shell pm list packages | grep -i sbi

# Search for HDFC
adb shell pm list packages | grep -i hdfc

# Search for ICICI
adb shell pm list packages | grep -i icici

# Search for UPI apps
adb shell pm list packages | grep -i upi
```

### Inspect Package Details (Version, Permissions, Activity):
```bash
adb shell dumpsys package com.phonepe.app | grep -E "versionName|firstInstallTime"
```

---

## 3. Play Store Verification Script

Run the automated package verification script:
```bash
node scripts/verify-finance-packages.mjs
```
This script queries the Google Play Store HTTP endpoint for each configured package and outputs:
- Verified active packages (HTTP 200)
- Unverified packages (HTTP 404 or redirect)
