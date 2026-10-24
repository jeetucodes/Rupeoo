import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { router } from 'expo-router';
import { getStartingBalanceProfile, getUserSettings, UserSettings, invalidateAllUserCache } from '@/lib/database';
import { clearWidgetSnapshot } from '@/lib/widgetSnapshot';
import { triggerWidgetUpdate } from '@/lib/widgetSync';
import { resetCloudPullState } from '@/lib/cloudSync';
import { stopRealtimeNotificationWatcher } from '@/lib/notifications';
import { scheduleWelcomeNotification, handleWelcomeNotificationOnLogout } from '@/lib/welcomeNotification';
import { safeJsonParse, withTimeout } from '@/lib/safeStorage';
import { warn, error } from '@/lib/logger';

export type AdsStrategy = 'custom_only' | 'custom_first' | 'network_only' | 'both';

export interface AppConfig {
  showProFeatures: boolean;
  showSubscriptions: boolean;
  // Master kill-switch
  showAds: boolean;
  // AdMob Network Switch
  networkAdsEnabled: boolean;
  // In-House Custom Ads Switch
  customAdsEnabled: boolean;
  // Strategy
  adsStrategy: AdsStrategy;
  // Pro VIP Suppress
  hideAdsForProUsers: boolean;
  // AdMob Test Mode
  adMobTestMode: boolean;
  // Interstitial Interval (default 3)
  interstitialInterval: number;
  // Granular placement switches
  adMobBannerEnabled: boolean;
  adMobInterstitialEnabled: boolean;
  adMobRewardedEnabled: boolean;
  adMobAppOpenEnabled: boolean;
  adMobNativeEnabled: boolean;
  // AdMob Unit IDs
  adMobAppId: string;
  adMobBannerUnitId: string;
  adMobInterstitialUnitId: string;
  adMobRewardedUnitId: string;
  adMobAppOpenUnitId: string;
  adMobNativeUnitId: string;
  // Maintenance Mode
  maintenanceMode: boolean;
  maintenanceTitle: string;
  maintenanceMessage: string;
  // Support
  supportPhone: string;
  supportEmail: string;
  // In-App & Remote Version Updates
  updatePromptEnabled?: boolean;
  latestVersion?: string;
  latestVersionCode?: number;
  minSupportedVersion?: string;
  minSupportedVersionCode?: number;
  forceUpdate?: boolean;
  updateTitle?: string;
  updateMessage?: string;
  updateUrl?: string;
  updateCooldownHours?: number;
  updatedAt?: number;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  showProFeatures: true,
  showSubscriptions: true,
  showAds: true,
  networkAdsEnabled: true,
  customAdsEnabled: true,
  adsStrategy: 'custom_first',
  hideAdsForProUsers: true,
  adMobTestMode: false,
  interstitialInterval: 3,
  adMobBannerEnabled: true,
  adMobInterstitialEnabled: true,
  adMobRewardedEnabled: Boolean(process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID),
  adMobAppOpenEnabled: Boolean(process.env.EXPO_PUBLIC_ADMOB_APP_OPEN_ID),
  adMobNativeEnabled: Boolean(process.env.EXPO_PUBLIC_ADMOB_NATIVE_ID),
  adMobAppId: process.env.EXPO_PUBLIC_ADMOB_APP_ID || 'ca-app-pub-2106211536803561~5812952031',
  adMobBannerUnitId: process.env.EXPO_PUBLIC_ADMOB_HOME_BANNER_ID || 'ca-app-pub-2106211536803561/4086148848',
  adMobInterstitialUnitId: process.env.EXPO_PUBLIC_ADMOB_TX_SAVE_ID || 'ca-app-pub-2106211536803561/1459985503',
  adMobRewardedUnitId: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID || '',
  adMobAppOpenUnitId: process.env.EXPO_PUBLIC_ADMOB_APP_OPEN_ID || '',
  adMobNativeUnitId: process.env.EXPO_PUBLIC_ADMOB_NATIVE_ID || '',
  maintenanceMode: false,
  maintenanceTitle: 'App Under Maintenance',
  maintenanceMessage: 'We are performing critical upgrades. Please check back shortly.',
  supportPhone: '+91 98765 43210',
  supportEmail: 'innovatexlab.services@gmail.com',
  updatePromptEnabled: true,
  latestVersion: undefined,
  latestVersionCode: undefined,
  minSupportedVersion: undefined,
  minSupportedVersionCode: undefined,
  forceUpdate: false,
  updateTitle: undefined,
  updateMessage: undefined,
  updateUrl: undefined,
  updateCooldownHours: 0,
};

/**
 * Universal boolean parser handling boolean, number (0/1), and string values ("false", "off", "0", "disabled")
 */
export function parseBool(val: any, defaultVal: boolean): boolean {
  if (val === undefined || val === null) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'off' || s === 'disabled' || s === 'no' || s === 'none') return false;
    if (s === 'true' || s === '1' || s === 'on' || s === 'enabled' || s === 'yes') return true;
  }
  return Boolean(val);
}

export function parseAppConfig(d: any): AppConfig {
  if (!d) return DEFAULT_APP_CONFIG;
  const subsVisible =
    parseBool(d.showSubscriptions, true) &&
    parseBool(d.showProFeatures, true) &&
    !parseBool(d.hideSubscriptions, false) &&
    !parseBool(d.hidePro, false);

  // Master Kill Switch: check all possible admin field names and inverted flags
  const isHideAds =
    parseBool(d.hideAds, false) ||
    parseBool(d.hide_ads, false) ||
    parseBool(d.hideAd, false) ||
    parseBool(d.hide_ad, false);

  let showAdsRaw = DEFAULT_APP_CONFIG.showAds;
  if (d.showAds !== undefined) showAdsRaw = parseBool(d.showAds, true);
  else if (d.show_ads !== undefined) showAdsRaw = parseBool(d.show_ads, true);
  else if (d.adsEnabled !== undefined) showAdsRaw = parseBool(d.adsEnabled, true);
  else if (d.ads_enabled !== undefined) showAdsRaw = parseBool(d.ads_enabled, true);
  else if (d.enableAds !== undefined) showAdsRaw = parseBool(d.enableAds, true);
  else if (d.enable_ads !== undefined) showAdsRaw = parseBool(d.enable_ads, true);
  else if (d.isAdsEnabled !== undefined) showAdsRaw = parseBool(d.isAdsEnabled, true);
  else if (d.ads !== undefined) showAdsRaw = parseBool(d.ads, true);

  const finalShowAds = showAdsRaw && !isHideAds;

  // Network Ads (AdMob) Switch
  let networkAdsRaw = DEFAULT_APP_CONFIG.networkAdsEnabled;
  if (d.networkAdsEnabled !== undefined) networkAdsRaw = parseBool(d.networkAdsEnabled, true);
  else if (d.network_ads_enabled !== undefined) networkAdsRaw = parseBool(d.network_ads_enabled, true);
  else if (d.admobEnabled !== undefined) networkAdsRaw = parseBool(d.admobEnabled, true);
  else if (d.admob_enabled !== undefined) networkAdsRaw = parseBool(d.admob_enabled, true);
  else if (d.enableAdmob !== undefined) networkAdsRaw = parseBool(d.enableAdmob, true);
  else if (d.enable_admob !== undefined) networkAdsRaw = parseBool(d.enable_admob, true);

  // In-House Custom Ads Switch
  let customAdsRaw = DEFAULT_APP_CONFIG.customAdsEnabled;
  if (d.customAdsEnabled !== undefined) customAdsRaw = parseBool(d.customAdsEnabled, true);
  else if (d.custom_ads_enabled !== undefined) customAdsRaw = parseBool(d.custom_ads_enabled, true);
  else if (d.customAds !== undefined) customAdsRaw = parseBool(d.customAds, true);
  else if (d.custom_ads !== undefined) customAdsRaw = parseBool(d.custom_ads, true);
  else if (d.enableCustomAds !== undefined) customAdsRaw = parseBool(d.enableCustomAds, true);
  else if (d.enable_custom_ads !== undefined) customAdsRaw = parseBool(d.enable_custom_ads, true);

  return {
    showProFeatures: parseBool(d.showProFeatures, true) && !parseBool(d.hidePro, false),
    showSubscriptions: subsVisible,
    showAds: finalShowAds,
    networkAdsEnabled: networkAdsRaw,
    customAdsEnabled: customAdsRaw,
    adsStrategy: (d.adsStrategy as AdsStrategy) || 'custom_first',
    hideAdsForProUsers: parseBool(d.hideAdsForProUsers, true),
    adMobTestMode: parseBool(d.adMobTestMode ?? d.admob_test_mode ?? d.testMode ?? d.test_mode, false),
    interstitialInterval: typeof d.interstitialInterval === 'number' && d.interstitialInterval > 0 ? d.interstitialInterval : 3,
    adMobBannerEnabled: parseBool(d.adMobBannerEnabled ?? d.admob_banner_enabled ?? d.bannerAdsEnabled, true),
    adMobInterstitialEnabled: parseBool(d.adMobInterstitialEnabled ?? d.admob_interstitial_enabled ?? d.interstitialAdsEnabled, true),
    adMobRewardedEnabled: Boolean(d.adMobRewardedUnitId || DEFAULT_APP_CONFIG.adMobRewardedUnitId) &&
      parseBool(d.adMobRewardedEnabled ?? d.admob_rewarded_enabled, true),
    adMobAppOpenEnabled: Boolean(d.adMobAppOpenUnitId || DEFAULT_APP_CONFIG.adMobAppOpenUnitId) &&
      parseBool(d.adMobAppOpenEnabled ?? d.admob_app_open_enabled, false),
    adMobNativeEnabled: Boolean(d.adMobNativeUnitId || DEFAULT_APP_CONFIG.adMobNativeUnitId) &&
      parseBool(d.adMobNativeEnabled ?? d.admob_native_enabled, true),
    adMobAppId: d.adMobAppId || DEFAULT_APP_CONFIG.adMobAppId,
    adMobBannerUnitId: d.adMobBannerUnitId || DEFAULT_APP_CONFIG.adMobBannerUnitId,
    adMobInterstitialUnitId: d.adMobInterstitialUnitId || DEFAULT_APP_CONFIG.adMobInterstitialUnitId,
    adMobRewardedUnitId: d.adMobRewardedUnitId || DEFAULT_APP_CONFIG.adMobRewardedUnitId,
    adMobAppOpenUnitId: d.adMobAppOpenUnitId || DEFAULT_APP_CONFIG.adMobAppOpenUnitId,
    adMobNativeUnitId: d.adMobNativeUnitId || DEFAULT_APP_CONFIG.adMobNativeUnitId,
    maintenanceMode: parseBool(d.maintenanceMode, false),
    maintenanceTitle: d.maintenanceTitle || 'App Under Maintenance',
    maintenanceMessage: d.maintenanceMessage || 'We are performing critical upgrades. Please check back shortly.',
    supportPhone: d.supportPhone || DEFAULT_APP_CONFIG.supportPhone,
    supportEmail: d.supportEmail || DEFAULT_APP_CONFIG.supportEmail,
    updatePromptEnabled: parseBool(
      d.updatePromptEnabled ?? d.update_prompt_enabled ?? d.enableUpdatePrompt ?? d.updateEnabled ?? d.update_enabled ?? d.showUpdatePopup,
      true
    ),
    latestVersion: typeof (d.latestVersion ?? d.latest_version ?? d.latestVersionName) === 'string' && (d.latestVersion ?? d.latest_version ?? d.latestVersionName).trim().length > 0
      ? (d.latestVersion ?? d.latest_version ?? d.latestVersionName).trim()
      : undefined,
    latestVersionCode: (() => {
      const v = d.latestVersionCode ?? d.latest_version_code;
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      return isNaN(n) ? undefined : n;
    })(),
    minSupportedVersion: typeof (d.minSupportedVersion ?? d.min_supported_version) === 'string' && (d.minSupportedVersion ?? d.min_supported_version).trim().length > 0
      ? (d.minSupportedVersion ?? d.min_supported_version).trim()
      : undefined,
    minSupportedVersionCode: (() => {
      const v = d.minSupportedVersionCode ?? d.min_supported_version_code;
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      return isNaN(n) ? undefined : n;
    })(),
    forceUpdate: parseBool(d.forceUpdate ?? d.force_update ?? d.isForceUpdate ?? d.mandatoryUpdate, false),
    updateTitle: typeof (d.updateTitle ?? d.update_title) === 'string' && (d.updateTitle ?? d.update_title).trim().length > 0
      ? (d.updateTitle ?? d.update_title).trim()
      : undefined,
    updateMessage: typeof (d.updateMessage ?? d.update_message) === 'string' && (d.updateMessage ?? d.update_message).trim().length > 0
      ? (d.updateMessage ?? d.update_message).trim()
      : undefined,
    updateUrl: typeof (d.updateUrl ?? d.update_url) === 'string' && (d.updateUrl ?? d.update_url).trim().length > 0
      ? (d.updateUrl ?? d.update_url).trim()
      : undefined,
    updatedAt: (() => {
      const u = d.updatedAt ?? d.updated_at ?? d.broadcastAt ?? d.broadcast_at;
      if (!u) return undefined;
      if (typeof u === 'number') return u;
      if (typeof u.toMillis === 'function') return u.toMillis();
      if (typeof u.toDate === 'function') return u.toDate().getTime();
      const parsed = new Date(u).getTime();
      return isNaN(parsed) ? undefined : parsed;
    })(),
    updateCooldownHours: typeof (d.updateCooldownHours ?? d.update_cooldown_hours) === 'number' && (d.updateCooldownHours ?? d.update_cooldown_hours) >= 0
      ? Number(d.updateCooldownHours ?? d.update_cooldown_hours)
      : 0,
  };
}

interface AuthContextType {
  user: RupeoUser | null;
  loading: boolean;
  settings: UserSettings | null;
  isPremium: boolean;
  currentPlan: string | null;
  getCurrentPlan: () => string | null;
  appConfig: AppConfig;
  setSettings: (settings: UserSettings) => void;
  refreshSettings: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  upgradeToPremium: (plan?: 'monthly' | '3_months' | '6_months' | 'yearly' | 'lifetime' | string) => Promise<void>;
  downgradeFromPremium: () => Promise<void>;
  logout: () => Promise<void>;
}

export interface RupeoUser extends User {
  startingBalance: number;
  hasSetStartingBalance: boolean;
  isPremium?: boolean;
  premiumPlan?: string;
  phone?: string;
  defaultPaymentMode?: string;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  settings: null,
  isPremium: false,
  currentPlan: null,
  getCurrentPlan: () => null,
  appConfig: DEFAULT_APP_CONFIG,
  setSettings: () => {},
  refreshSettings: async () => {},
  refreshUser: async () => {},
  refreshConfig: async () => {},
  upgradeToPremium: async () => {},
  downgradeFromPremium: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<RupeoUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  // Track initial auth check on app launch to ensure welcome notification is NEVER scheduled on app open
  const isInitialAuthCheckDoneRef = React.useRef(false);
  const previousUidRef = React.useRef<string | null>(null);

  // Real-time Admin Config State
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);

  // Initial load from AsyncStorage for instant offline/cached settings
  useEffect(() => {
    AsyncStorage.getItem('@rupeo_app_config')
      .then((raw) => {
        if (raw) {
          const parsed = safeJsonParse(raw, DEFAULT_APP_CONFIG, { keyForBackup: '@rupeo_app_config' });
          setAppConfig(parsed);
        }
      })
      .catch(() => {});
  }, []);

  // Listen to Admin Toggles from Firestore (Live Real-time)
  useEffect(() => {
    if (!db) return;
    const unsubConfig = onSnapshot(
      doc(db, 'app_config', 'global'),
      (snap) => {
        if (snap.exists()) {
          const parsed = parseAppConfig(snap.data());
          setAppConfig(parsed);
          AsyncStorage.setItem('@rupeo_app_config', JSON.stringify(parsed)).catch(() => {});
        }
      },
      (err) => {
        warn('App config real-time listener error:', err);
      }
    );
    return () => unsubConfig();
  }, []);

  const refreshConfig = async () => {
    if (!db) return;
    try {
      const snap = await getDoc(doc(db, 'app_config', 'global'));
      if (snap.exists()) {
        const parsed = parseAppConfig(snap.data());
        setAppConfig(parsed);
        AsyncStorage.setItem('@rupeo_app_config', JSON.stringify(parsed)).catch(() => {});
      }
    } catch (e) {
      warn('Error refreshing app config:', e);
    }
  };

  const fetchUserProfile = async (currentUser: User): Promise<RupeoUser> => {
    const cacheKey = `@rupeo_profile_${currentUser.uid}`;
    let cachedProfile: any = null;
    try {
      const raw = await AsyncStorage.getItem(cacheKey).catch(() => null);
      if (raw) {
        cachedProfile = safeJsonParse(raw, null, cacheKey);
      }
    } catch {}

    try {
      if (db && currentUser?.uid) {
        const userDocPromise = getDoc(doc(db, 'users', currentUser.uid));
        const userDoc = await withTimeout(userDocPromise, 2500, null as any);

        if (userDoc && userDoc.exists()) {
          const data = userDoc.data();
          const startingBalance = Number(data.starting_balance) || 0;
          const hasSetStartingBalance = data.has_set_starting_balance !== false;
          const profile: RupeoUser = {
            ...currentUser,
            displayName: data.name || data.displayName || currentUser.displayName,
            photoURL: data.photoURL || currentUser.photoURL,
            email: currentUser.email,
            phone: data.phone || '',
            defaultPaymentMode: data.defaultPaymentMode || 'UPI',
            startingBalance,
            hasSetStartingBalance,
            isPremium: Boolean(data.is_premium),
            premiumPlan: data.premium_plan,
          };
          AsyncStorage.setItem(cacheKey, JSON.stringify(profile)).catch(() => {});
          return profile;
        }

        if (cachedProfile) {
          return { ...currentUser, ...cachedProfile };
        }

        return {
          ...currentUser,
          startingBalance: 0,
          hasSetStartingBalance: true,
          isPremium: false,
        } as RupeoUser;
      }
    } catch (err) {
      warn('Error fetching Firestore user profile:', err);
    }

    if (cachedProfile) {
      return { ...currentUser, ...cachedProfile };
    }

    return {
      ...currentUser,
      startingBalance: 0,
      hasSetStartingBalance: true,
      isPremium: false,
    } as RupeoUser;
  };

  const fetchSettings = async (currentUser: User): Promise<UserSettings | null> => {
    try {
      const settingsPromise = getUserSettings(currentUser.uid);
      const userSettings = await withTimeout(settingsPromise, 2500, null);
      if (userSettings) {
        setSettings(userSettings);
        return userSettings;
      }
    } catch (error) {
      warn('Could not load settings; using defaults.', error);
    }
    return null;
  };

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          // B4: Refresh token claims in background non-blockingly so app startup is never stalled
          currentUser.getIdToken(true).catch((tokenErr) => {
            warn('Token claim refresh error:', tokenErr);
          });

          // Fetch user profile and settings concurrently in parallel
          const [profileUser, userSettings] = await Promise.all([
            fetchUserProfile(currentUser),
            fetchSettings(currentUser),
          ]);

          setUser(profileUser);
          if (userSettings) {
            setSettings(userSettings);
          }

          // Schedule welcome notification in EXACTLY ONE PLACE:
          // Right after a successful login/signup (auth session confirmed),
          // NEVER on initial app start or onboarding screens.
          const isFreshLoginOrSignup =
            isInitialAuthCheckDoneRef.current &&
            (!previousUidRef.current || previousUidRef.current !== currentUser.uid);

          if (isFreshLoginOrSignup) {
            scheduleWelcomeNotification({
              userId: currentUser.uid,
              displayName: profileUser.displayName,
              language: userSettings?.language,
            }).catch((err) => warn('Welcome notification scheduling failed:', err));
          }

          previousUidRef.current = currentUser.uid;
        } else {
          previousUidRef.current = null;
          setUser(null);
          setSettings(null);
        }
      } catch (authErr) {
        warn('onAuthStateChanged handler error:', authErr);
      } finally {
        isInitialAuthCheckDoneRef.current = true;
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const refreshSettings = async () => {
    if (user) {
      await fetchSettings(user);
    }
  };

  const refreshUser = async () => {
    if (auth?.currentUser) {
      try {
        await auth.currentUser.reload();
      } catch (e) {
        warn('Auth reload error:', e);
      }
      const profileUser = await fetchUserProfile(auth.currentUser);
      setUser(profileUser);
    }
  };

  const upgradeToPremium = async (plan: 'monthly' | '3_months' | '6_months' | 'yearly' | 'lifetime' | string = 'lifetime') => {
    if (!user?.uid) return;
    try {
      // Local state update; persistent Firestore is_premium is server-managed
      setSettings(prev => prev ? { ...prev, isPremium: true, premiumPlan: plan } : { language: 'English', currency: '₹', isPremium: true, premiumPlan: plan });
      setUser(prev => prev ? { ...prev, isPremium: true, premiumPlan: plan } : null);
    } catch (e) {
      error('Failed to upgrade to premium:', e);
      throw e;
    }
  };

  const downgradeFromPremium = async () => {
    if (!user?.uid) return;
    try {
      // Local state update; persistent Firestore is_premium is server-managed
      setSettings(prev => prev ? { ...prev, isPremium: false } : null);
      setUser(prev => prev ? { ...prev, isPremium: false } : null);
    } catch (e) {
      error('Failed to downgrade from premium:', e);
      throw e;
    }
  };

  const logout = async () => {
    try {
      // 1. FIRST navigate to login screen, resetting the navigation stack
      // This ensures protected screens are unmounted before session is cleared
      try {
        router.replace('/login');
      } catch (navErr) {
        warn('Navigation to login on logout:', navErr);
      }

      // 2. Stop listeners, clear user memory caches & active background session IDs
      await AsyncStorage.removeItem('@rupeo_active_user_id').catch(() => {});
      await AsyncStorage.removeItem('@rupeo_pending_redirect').catch(() => {});

      // Cancel pending welcome notification on logout.
      // If user logged out within 5 minutes (before shown), allows rescheduling once on next login.
      await handleWelcomeNotificationOnLogout(user?.uid).catch(() => {});
      previousUidRef.current = null;

      try {
        stopRealtimeNotificationWatcher();
      } catch {}

      try {
        invalidateAllUserCache();
      } catch {}

      try {
        resetCloudPullState();
      } catch {}

      await clearWidgetSnapshot().catch(() => {});
      await triggerWidgetUpdate().catch(() => {});

      // 3. Clear auth state in Firebase
      await signOut(auth);

      setUser(null);
      setSettings(null);
    } catch (err) {
      error('Logout error:', err);
    }
  };

  // Premium status: driven by Firestore `is_premium` field on user doc.
  // Updated by verifyAndActivatePurchase() after a successful IAP purchase.
  const isPremiumUser = Boolean(user?.isPremium);
  const userCurrentPlan = isPremiumUser ? (user?.premiumPlan ?? 'monthly') : null;
  const getCurrentPlanHelper = () => userCurrentPlan;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        settings,
        isPremium: isPremiumUser,
        currentPlan: userCurrentPlan,
        getCurrentPlan: getCurrentPlanHelper,
        appConfig,
        setSettings,
        refreshSettings,
        refreshUser,
        refreshConfig,
        upgradeToPremium,
        downgradeFromPremium,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
