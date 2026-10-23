import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeAsyncStorageGet, safeAsyncStorageSet } from './safeStorage.ts';
import { warn, log } from './logger.ts';

export const ALLOWED_PACKAGES_STORAGE_KEY = '@rupeo_allowed_finance_packages_v1';
export const DETECTED_PACKAGES_STORAGE_KEY = '@rupeo_detected_finance_packages_v1';
export const IGNORED_PACKAGES_STORAGE_KEY = '@rupeo_ignored_finance_packages_v1';

export type FinanceAppCategory = 'bank' | 'upi' | 'sms';

export interface FinanceAppEntry {
  packageName: string;
  appName: string;
  category: FinanceAppCategory;
  verified: boolean;
  enabledByDefault: boolean;
  playStoreUrl: string;
  verificationNotes?: string;
}

export interface DetectedFinanceApp {
  packageName: string;
  appName: string;
  firstDetectedAt: number;
  sampleSnippet?: string;
  status: 'pending' | 'approved' | 'ignored';
}

/**
 * Canonical default packages for Indian Banks, UPI/Wallets, and SMS apps.
 * Verified against Google Play Store IDs.
 * Any unverified packages are flagged with verified: false and disabled by default.
 */
export const DEFAULT_FINANCE_APPS: FinanceAppEntry[] = [
  // ==========================================
  // UPI & WALLET APPS (10 Primary + Verified Alternates)
  // ==========================================
  {
    packageName: 'com.google.android.apps.nbu.paisa.user',
    appName: 'Google Pay',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.google.android.apps.nbu.paisa.user',
    verificationNotes: 'Official Google Pay India app package.',
  },
  {
    packageName: 'com.phonepe.app',
    appName: 'PhonePe',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.phonepe.app',
    verificationNotes: 'Official PhonePe UPI app package.',
  },
  {
    packageName: 'net.one97.paytm',
    appName: 'Paytm',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=net.one97.paytm',
    verificationNotes: 'Official Paytm Payments app package.',
  },
  {
    packageName: 'in.org.npci.upiapp',
    appName: 'BHIM UPI',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=in.org.npci.upiapp',
    verificationNotes: 'Official NPCI BHIM UPI application.',
  },
  {
    packageName: 'com.sbi.upi',
    appName: 'BHIM SBI Pay',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.sbi.upi',
    verificationNotes: 'Official State Bank of India standalone UPI app.',
  },
  {
    packageName: 'com.dreamplug.androidapp',
    appName: 'CRED',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.dreamplug.androidapp',
    verificationNotes: 'Official CRED credit card bills & UPI app.',
  },
  {
    packageName: 'money.super.payments',
    appName: 'super.money (Payments)',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=money.super.payments',
    verificationNotes: 'Official super.money UPI payments package.',
  },
  {
    packageName: 'money.super.app',
    appName: 'super.money (App)',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=money.super.app',
    verificationNotes: 'Official super.money primary package.',
  },
  {
    packageName: 'com.naviapp',
    appName: 'Navi UPI',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.naviapp',
    verificationNotes: 'Official Navi UPI & financial services app.',
  },
  {
    packageName: 'com.navi.finance',
    appName: 'Navi Finance',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.navi.finance',
    verificationNotes: 'Official Navi alternate package.',
  },
  {
    packageName: 'com.mobikwik_new',
    appName: 'MobiKwik',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.mobikwik_new',
    verificationNotes: 'Official MobiKwik UPI & Wallet app.',
  },
  {
    packageName: 'com.freecharge.android',
    appName: 'Freecharge',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.freecharge.android',
    verificationNotes: 'Official Freecharge UPI & Pay Later app.',
  },
  {
    packageName: 'org.indyfin.slice',
    appName: 'Slice',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=org.indyfin.slice',
    verificationNotes: 'Official Slice payments app.',
  },
  {
    packageName: 'com.jupiter.money',
    appName: 'Jupiter Money',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.jupiter.money',
    verificationNotes: 'Official Jupiter digital banking app.',
  },
  {
    packageName: 'com.epifi',
    appName: 'Fi Money',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.epifi',
    verificationNotes: 'Official Fi Money banking app.',
  },
  {
    packageName: 'in.amazon.mShop.android.shopping',
    appName: 'Amazon Pay',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=in.amazon.mShop.android.shopping',
    verificationNotes: 'Official Amazon India shopping & UPI app.',
  },
  {
    packageName: 'com.tatadigital.tcp',
    appName: 'Tata Neu',
    category: 'upi',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.tatadigital.tcp',
    verificationNotes: 'Official Tata Neu UPI & payments app.',
  },

  // ==========================================
  // TOP INDIAN BANKS (10 Primary + Additional Verified)
  // ==========================================
  {
    packageName: 'com.sbi.SBIFreedomPlus',
    appName: 'YONO SBI',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.sbi.SBIFreedomPlus',
    verificationNotes: 'Official State Bank of India YONO mobile banking.',
  },
  {
    packageName: 'com.sbi.lotusintouch',
    appName: 'SBI Anywhere / YONO Lite',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.sbi.lotusintouch',
    verificationNotes: 'Official SBI digital banking app package.',
  },
  {
    packageName: 'com.sbi.lotuslite',
    appName: 'YONO Lite SBI',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.sbi.lotuslite',
    verificationNotes: 'Official SBI YONO Lite package.',
  },
  {
    packageName: 'com.snapwork.hdfc',
    appName: 'HDFC Bank MobileBanking',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.snapwork.hdfc',
    verificationNotes: 'Official HDFC Bank primary mobile banking app.',
  },
  {
    packageName: 'com.enstage.wibmo.hdfc',
    appName: 'HDFC PayZapp',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.enstage.wibmo.hdfc',
    verificationNotes: 'Official HDFC Bank PayZapp UPI & payment app.',
  },
  {
    packageName: 'com.hdfcbank.payzapp',
    appName: 'HDFC PayZapp (New)',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.hdfcbank.payzapp',
    verificationNotes: 'Official HDFC PayZapp modern app package.',
  },
  {
    packageName: 'com.csam.icici.bank.imobile',
    appName: 'ICICI iMobile Pay',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.csam.icici.bank.imobile',
    verificationNotes: 'Official ICICI Bank mobile banking & UPI app.',
  },
  {
    packageName: 'com.axis.mobile',
    appName: 'Axis Mobile',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.axis.mobile',
    verificationNotes: 'Official Axis Bank mobile banking app.',
  },
  {
    packageName: 'com.msf.kbank.mobile',
    appName: 'Kotak 811 & Mobile Banking',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.msf.kbank.mobile',
    verificationNotes: 'Official Kotak Mahindra Bank mobile banking app.',
  },
  {
    packageName: 'com.bankofbaroda.mconnect',
    appName: 'bob World',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.bankofbaroda.mconnect',
    verificationNotes: 'Official Bank of Baroda bob World mobile banking app.',
  },
  {
    packageName: 'com.canarabank.mobility',
    appName: 'Canara ai1 Mobile Banking',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.canarabank.mobility',
    verificationNotes: 'Official Canara Bank mobile banking app.',
  },
  {
    packageName: 'com.infrasofttech.canarabank',
    appName: 'Canara ai1 (Alternate)',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.infrasofttech.canarabank',
    verificationNotes: 'Canara Bank mobile suite package.',
  },
  {
    packageName: 'com.idfcfirstbank.optimus',
    appName: 'IDFC FIRST Bank',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.idfcfirstbank.optimus',
    verificationNotes: 'Official IDFC FIRST Bank Mobile Banking app.',
  },
  {
    packageName: 'com.fss.pnb',
    appName: 'PNB One',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.fss.pnb',
    verificationNotes: 'Official Punjab National Bank PNB One app.',
  },
  {
    packageName: 'com.infrasofttech.uboi',
    appName: 'Union Bank of India',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.infrasofttech.uboi',
    verificationNotes: 'Official Union Bank of India mobile banking.',
  },
  {
    packageName: 'com.unionbank.vyom',
    appName: 'Union Bank Vyom',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.unionbank.vyom',
    verificationNotes: 'Official Union Bank Vyom mobile app.',
  },
  {
    packageName: 'com.boimobile',
    appName: 'BOI Mobile',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.boimobile',
    verificationNotes: 'Official Bank of India mobile banking app.',
  },
  {
    packageName: 'com.fedmobile',
    appName: 'FedMobile (Federal Bank)',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.fedmobile',
    verificationNotes: 'Official Federal Bank FedMobile app.',
  },
  {
    packageName: 'com.indusind.indusmobile',
    appName: 'IndusInd Mobile',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.indusind.indusmobile',
    verificationNotes: 'Official IndusInd Bank mobile banking.',
  },
  {
    packageName: 'com.yesbank',
    appName: 'YES Bank Mobile',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.yesbank',
    verificationNotes: 'Official YES Bank mobile banking app.',
  },
  {
    packageName: 'com.aubank.aupay',
    appName: 'AU 0101',
    category: 'bank',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.aubank.aupay',
    verificationNotes: 'Official AU Small Finance Bank mobile app.',
  },

  // ==========================================
  // SMS APPS (Default System Messaging)
  // ==========================================
  {
    packageName: 'com.google.android.apps.messaging',
    appName: 'Messages by Google',
    category: 'sms',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.google.android.apps.messaging',
    verificationNotes: 'Google Messages official app package.',
  },
  {
    packageName: 'com.samsung.android.messaging',
    appName: 'Samsung Messages',
    category: 'sms',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.samsung.android.messaging',
    verificationNotes: 'Samsung Messages default system package.',
  },
  {
    packageName: 'com.android.mms',
    appName: 'Android Messages (AOSP)',
    category: 'sms',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.android.mms',
    verificationNotes: 'Default AOSP SMS/MMS application.',
  },
  {
    packageName: 'com.miui.mms',
    appName: 'Xiaomi / Redmi Messaging',
    category: 'sms',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.miui.mms',
    verificationNotes: 'MIUI system messaging application.',
  },
  {
    packageName: 'com.coloros.mms',
    appName: 'ColorOS / Oppo Messaging',
    category: 'sms',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.coloros.mms',
    verificationNotes: 'ColorOS system messaging application.',
  },
  {
    packageName: 'com.vivo.mms',
    appName: 'Vivo Messaging',
    category: 'sms',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.vivo.mms',
    verificationNotes: 'FuntouchOS system messaging application.',
  },
  {
    packageName: 'com.oneplus.mms',
    appName: 'OnePlus Messaging',
    category: 'sms',
    verified: true,
    enabledByDefault: true,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.oneplus.mms',
    verificationNotes: 'OxygenOS system messaging application.',
  },

  // ==========================================
  // UNVERIFIED / EXPERIMENTAL PACKAGES (Marked with TODO, disabled by default)
  // ==========================================
  {
    // TODO: Verify if bandhan.bank.mobile or com.bandhan.mbandhan is current on Play Store
    packageName: 'com.bandhan.mbandhan',
    appName: 'mBandhan (Bandhan Bank)',
    category: 'bank',
    verified: false,
    enabledByDefault: false,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.bandhan.mbandhan',
    verificationNotes: 'TODO: Needs verification against current Bandhan Bank Play Store listing.',
  },
  {
    // TODO: Verify current IDBI mobile banking package name
    packageName: 'com.idbi.go_mobile',
    appName: 'IDBI Bank GO Mobile+',
    category: 'bank',
    verified: false,
    enabledByDefault: false,
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.idbi.go_mobile',
    verificationNotes: 'TODO: Needs verification against current IDBI Bank Play Store listing.',
  },
];

// In-memory cache for fast lookups in headless notification task
let cachedAllowedPackages: Map<string, boolean> | null = null;
let cachedDetectedApps: Map<string, DetectedFinanceApp> | null = null;
let cachedIgnoredPackages: Set<string> | null = null;

/**
 * Returns all default finance apps.
 */
export function getDefaultFinanceApps(): FinanceAppEntry[] {
  return [...DEFAULT_FINANCE_APPS];
}

/**
 * Loads user package override preferences: map of packageName -> boolean.
 */
export async function getUserPackageOverrides(): Promise<Record<string, boolean>> {
  return safeAsyncStorageGet<Record<string, boolean>>(ALLOWED_PACKAGES_STORAGE_KEY, {});
}

/**
 * Loads the active list of finance apps combined with user toggle settings.
 */
export async function getAllFinanceAppsWithUserPreferences(): Promise<(FinanceAppEntry & { isEnabled: boolean })[]> {
  const overrides = await getUserPackageOverrides();
  return DEFAULT_FINANCE_APPS.map((app) => ({
    ...app,
    isEnabled: overrides[app.packageName] !== undefined ? overrides[app.packageName] : app.enabledByDefault,
  }));
}

/**
 * Checks whether a package is allowed to be read by the notification listener.
 * Consults user preferences, default allowlist, and approved detected apps.
 */
export async function isPackageAllowedForAlerts(packageName: string): Promise<boolean> {
  if (!packageName) return false;
  const clean = packageName.trim().toLowerCase();

  // 1. Check in-memory fast cache
  if (cachedAllowedPackages && cachedAllowedPackages.has(clean)) {
    return Boolean(cachedAllowedPackages.get(clean));
  }

  // 2. Check user overrides
  const overrides = await getUserPackageOverrides();
  if (overrides[clean] !== undefined) {
    if (!cachedAllowedPackages) cachedAllowedPackages = new Map();
    cachedAllowedPackages.set(clean, overrides[clean]);
    return overrides[clean];
  }

  // 3. Check default allowlist
  const defaultEntry = DEFAULT_FINANCE_APPS.find((app) => app.packageName.toLowerCase() === clean);
  if (defaultEntry) {
    const isAllowed = defaultEntry.enabledByDefault && defaultEntry.verified;
    if (!cachedAllowedPackages) cachedAllowedPackages = new Map();
    cachedAllowedPackages.set(clean, isAllowed);
    return isAllowed;
  }

  // 4. Check if approved in detected apps
  const detected = await getDetectedFinanceApps();
  const detectedEntry = detected.find((d) => d.packageName.toLowerCase() === clean);
  if (detectedEntry && detectedEntry.status === 'approved') {
    if (!cachedAllowedPackages) cachedAllowedPackages = new Map();
    cachedAllowedPackages.set(clean, true);
    return true;
  }

  return false;
}

/**
 * Updates allow/deny status for a package.
 */
export async function setPackageAllowed(packageName: string, allowed: boolean): Promise<void> {
  if (!packageName) return;
  const clean = packageName.trim().toLowerCase();

  const overrides = await getUserPackageOverrides();
  overrides[clean] = allowed;
  await safeAsyncStorageSet(ALLOWED_PACKAGES_STORAGE_KEY, overrides);

  if (!cachedAllowedPackages) cachedAllowedPackages = new Map();
  cachedAllowedPackages.set(clean, allowed);

  // If approving or rejecting a detected app, update its status as well
  const detected = await getDetectedFinanceApps();
  const existingDetected = detected.find((d) => d.packageName.toLowerCase() === clean);
  if (existingDetected) {
    existingDetected.status = allowed ? 'approved' : 'ignored';
    await saveDetectedFinanceApps(detected);
  }

  log(`[FinanceApps] Package '${clean}' allowed set to: ${allowed}`);
}

/**
 * Loads detected finance apps awaiting user approval.
 */
export async function getDetectedFinanceApps(): Promise<DetectedFinanceApp[]> {
  const apps = await safeAsyncStorageGet<DetectedFinanceApp[]>(DETECTED_PACKAGES_STORAGE_KEY, []);
  if (!cachedDetectedApps) cachedDetectedApps = new Map();
  cachedDetectedApps.clear();
  for (const app of apps) {
    cachedDetectedApps.set(app.packageName.toLowerCase(), app);
  }
  return apps;
}

/**
 * Saves detected apps list.
 */
async function saveDetectedFinanceApps(apps: DetectedFinanceApp[]): Promise<void> {
  await safeAsyncStorageSet(DETECTED_PACKAGES_STORAGE_KEY, apps);
  if (!cachedDetectedApps) cachedDetectedApps = new Map();
  cachedDetectedApps.clear();
  for (const app of apps) {
    cachedDetectedApps.set(app.packageName.toLowerCase(), app);
  }
}

/**
 * Loads ignored packages set.
 */
export async function getIgnoredPackages(): Promise<Set<string>> {
  if (cachedIgnoredPackages) return cachedIgnoredPackages;
  const list = await safeAsyncStorageGet<string[]>(IGNORED_PACKAGES_STORAGE_KEY, []);
  cachedIgnoredPackages = new Set(list.map((p) => p.toLowerCase()));
  return cachedIgnoredPackages;
}

/**
 * Records an unknown package that posted a high-confidence bank alert.
 * Adds it to Detected Finance Apps with status: 'pending'.
 * Never reads it silently without user approval!
 */
export async function recordDetectedFinanceApp(
  packageName: string,
  appLabel: string,
  sampleSnippet?: string
): Promise<boolean> {
  if (!packageName) return false;
  const clean = packageName.trim().toLowerCase();

  // If already allowed or ignored, do not re-add
  const isAllowed = await isPackageAllowedForAlerts(clean);
  if (isAllowed) return false;

  const ignored = await getIgnoredPackages();
  if (ignored.has(clean)) return false;

  const detected = await getDetectedFinanceApps();
  const existing = detected.find((d) => d.packageName.toLowerCase() === clean);
  if (existing) {
    return false; // Already recorded
  }

  const newEntry: DetectedFinanceApp = {
    packageName: clean,
    appName: appLabel || clean,
    firstDetectedAt: Date.now(),
    sampleSnippet: sampleSnippet ? sampleSnippet.slice(0, 100) : undefined,
    status: 'pending',
  };

  detected.unshift(newEntry);
  await saveDetectedFinanceApps(detected);
  log(`[FinanceApps] New finance app detected: ${clean} ('${appLabel}'). Added to pending approval.`);
  return true;
}

/**
 * Approves a detected finance app.
 */
export async function approveDetectedApp(packageName: string): Promise<void> {
  await setPackageAllowed(packageName, true);
}

/**
 * Ignores a detected finance app (will not alert or ask again).
 */
export async function ignoreDetectedApp(packageName: string): Promise<void> {
  if (!packageName) return;
  const clean = packageName.trim().toLowerCase();

  // Update in detected apps
  const detected = await getDetectedFinanceApps();
  const target = detected.find((d) => d.packageName.toLowerCase() === clean);
  if (target) {
    target.status = 'ignored';
    await saveDetectedFinanceApps(detected);
  }

  // Add to ignored set
  const ignored = await getIgnoredPackages();
  ignored.add(clean);
  cachedIgnoredPackages = ignored;
  await safeAsyncStorageSet(IGNORED_PACKAGES_STORAGE_KEY, Array.from(ignored));

  // Explicitly disable in overrides
  const overrides = await getUserPackageOverrides();
  overrides[clean] = false;
  await safeAsyncStorageSet(ALLOWED_PACKAGES_STORAGE_KEY, overrides);
}

/**
 * Resets all finance apps permissions back to default.
 */
export async function resetFinanceAppsToDefault(): Promise<void> {
  await AsyncStorage.removeItem(ALLOWED_PACKAGES_STORAGE_KEY);
  await AsyncStorage.removeItem(DETECTED_PACKAGES_STORAGE_KEY);
  await AsyncStorage.removeItem(IGNORED_PACKAGES_STORAGE_KEY);
  cachedAllowedPackages = null;
  cachedDetectedApps = null;
  cachedIgnoredPackages = null;
  log('[FinanceApps] Reset finance apps allowlist to defaults.');
}

// Known bank & UPI name keywords in app title or package name
export const KNOWN_FINANCE_KEYWORDS = [
  'bank',
  'upi',
  'paisa',
  'pay',
  'wallet',
  'money',
  'credit',
  'sbi',
  'hdfc',
  'icici',
  'axis',
  'kotak',
  'baroda',
  'pnb',
  'canara',
  'union',
  'idfc',
  'indusind',
  'yes bank',
  'federal',
  'rbl',
  'paytm',
  'phonepe',
  'cred',
  'slice',
  'navi',
  'mobikwik',
  'freecharge',
];

/**
 * Determines whether an unknown package appears to be an Indian Bank or UPI app:
 * 1. Parser confidence >= 0.85
 * 2. App label, title or package name contains a known bank/fintech keyword.
 */
export function isLikelyUnknownFinanceApp(
  packageName: string,
  appLabelOrTitle: string,
  confidence: number
): boolean {
  if (confidence < 0.85) return false;
  const cleanText = `${packageName || ''} ${appLabelOrTitle || ''}`.toLowerCase();
  return KNOWN_FINANCE_KEYWORDS.some((kw) => cleanText.includes(kw));
}
