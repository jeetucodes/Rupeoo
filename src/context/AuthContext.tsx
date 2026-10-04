import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getStartingBalanceProfile, getUserSettings, saveUserSettings, setPremiumStatus, UserSettings } from '@/lib/database';

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
  adMobRewardedEnabled: true,
  adMobAppOpenEnabled: false,
  adMobNativeEnabled: true,
  adMobAppId: 'ca-app-pub-2106211536803561~5812952031',
  adMobBannerUnitId: 'ca-app-pub-2106211536803561/4086148848',
  adMobInterstitialUnitId: 'ca-app-pub-2106211536803561/1459985503',
  adMobRewardedUnitId: 'ca-app-pub-3940256099942544/5224354917',
  adMobAppOpenUnitId: 'ca-app-pub-3940256099942544/9257395921',
  adMobNativeUnitId: 'ca-app-pub-3940256099942544/2247696110',
  maintenanceMode: false,
  maintenanceTitle: 'App Under Maintenance',
  maintenanceMessage: 'We are performing critical upgrades. Please check back shortly.',
  supportPhone: '+91 98765 43210',
  supportEmail: 'innovatexlab.services@gmail.com',
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
    adMobTestMode: parseBool(d.adMobTestMode, false),
    interstitialInterval: typeof d.interstitialInterval === 'number' && d.interstitialInterval > 0 ? d.interstitialInterval : 3,
    adMobBannerEnabled: parseBool(d.adMobBannerEnabled ?? d.admob_banner_enabled ?? d.bannerAdsEnabled, true),
    adMobInterstitialEnabled: parseBool(d.adMobInterstitialEnabled ?? d.admob_interstitial_enabled ?? d.interstitialAdsEnabled, true),
    adMobRewardedEnabled: parseBool(d.adMobRewardedEnabled ?? d.admob_rewarded_enabled, true),
    adMobAppOpenEnabled: parseBool(d.adMobAppOpenEnabled ?? d.admob_app_open_enabled, false),
    adMobNativeEnabled: parseBool(d.adMobNativeEnabled ?? d.admob_native_enabled, true),
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

  // Real-time Admin Config State
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);

  // Initial load from AsyncStorage for instant offline/cached settings
  useEffect(() => {
    AsyncStorage.getItem('@rupeo_app_config')
      .then((raw) => {
        if (raw) {
          try {
            setAppConfig(JSON.parse(raw));
          } catch {}
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
        console.warn('App config real-time listener error:', err);
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
      console.warn('Error refreshing app config:', e);
    }
  };

  const fetchUserProfile = async (currentUser: User) => {
    try {
      if (db && currentUser?.uid) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const balanceProfile = await getStartingBalanceProfile(currentUser.uid);
        if (userDoc.exists()) {
          const data = userDoc.data();
          return {
            ...currentUser,
            displayName: data.name || data.displayName || currentUser.displayName,
            photoURL: data.photoURL || currentUser.photoURL,
            email: currentUser.email,
            phone: data.phone || '',
            defaultPaymentMode: data.defaultPaymentMode || 'UPI',
            startingBalance: balanceProfile.startingBalance,
            hasSetStartingBalance: balanceProfile.hasSetStartingBalance,
            isPremium: Boolean(data.is_premium),
            premiumPlan: data.premium_plan,
          } as any;
        }
        return {
          ...currentUser,
          startingBalance: balanceProfile.startingBalance,
          hasSetStartingBalance: balanceProfile.hasSetStartingBalance,
          isPremium: false,
        } as RupeoUser;
      }
    } catch (err) {
      console.warn('Error fetching Firestore user profile:', err);
    }
    return {
      ...currentUser,
      startingBalance: 0,
      hasSetStartingBalance: true,
      isPremium: false,
    } as RupeoUser;
  };

  const fetchSettings = async (currentUser: User) => {
    try {
      const userSettings = await getUserSettings(currentUser.uid);
      setSettings(userSettings);
    } catch (error) {
      setSettings(null);
      console.warn('Could not load settings; using defaults.', error);
    }
  };

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const profileUser = await fetchUserProfile(currentUser);
        setUser(profileUser);
        await fetchSettings(currentUser);
      } else {
        setUser(null);
        setSettings(null);
      }
      setLoading(false);
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
        console.warn('Auth reload error:', e);
      }
      const profileUser = await fetchUserProfile(auth.currentUser);
      setUser(profileUser);
    }
  };

  const upgradeToPremium = async (plan: 'monthly' | '3_months' | '6_months' | 'yearly' | 'lifetime' | string = 'lifetime') => {
    if (!user?.uid) return;
    try {
      await setPremiumStatus(user.uid, true, plan);
      setSettings(prev => prev ? { ...prev, isPremium: true, premiumPlan: plan } : { language: 'English', currency: '₹', isPremium: true, premiumPlan: plan });
      setUser(prev => prev ? { ...prev, isPremium: true, premiumPlan: plan } : null);
    } catch (e) {
      console.error('Failed to upgrade to premium:', e);
      throw e;
    }
  };

  const downgradeFromPremium = async () => {
    if (!user?.uid) return;
    try {
      await setPremiumStatus(user.uid, false);
      setSettings(prev => prev ? { ...prev, isPremium: false } : null);
      setUser(prev => prev ? { ...prev, isPremium: false } : null);
    } catch (e) {
      console.error('Failed to downgrade from premium:', e);
      throw e;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
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
