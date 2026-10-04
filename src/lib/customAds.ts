import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { db } from './firebase';
import { collection, doc, increment, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import * as WebBrowser from 'expo-web-browser';
import { AppConfig } from '@/context/AuthContext';

export type AdPlacement =
  | 'home_banner'
  | 'popup_modal'
  | 'transaction_footer'
  | 'scanner_screen'
  | 'native_feed'
  | 'rewarded_modal'
  | 'all';

export type AdAudience = 'all' | 'free_only' | 'pro_only';

export type AdActionType =
  | 'in_app_pro'
  | 'in_app_coupons'
  | 'in_app_scanner'
  | 'in_app_support'
  | 'open_whatsapp'
  | 'external_url';

export interface InAppCustomAd {
  id: string;
  title: string;
  message: string;
  imageUrl?: string;
  linkUrl?: string;
  placement: AdPlacement;
  targetAudience: AdAudience;
  actionType: AdActionType;
  ctaText: string;
  badgeText?: string;
  priority: number;
  clicksCount: number;
  impressionsCount: number;
  active: boolean;
  startDate?: string;
  endDate?: string;
  createdAt?: any;
  updatedAt?: any;
}

// In-memory cache of active custom ads shared across the app
let cachedActiveAds: InAppCustomAd[] = [];
let adsListeners: Array<(ads: InAppCustomAd[]) => void> = [];
let isListening = false;
let unsubscribeSnapshot: (() => void) | null = null;

// Track recorded impressions to avoid duplicate logs in the same session
const recordedImpressions = new Set<string>();

/**
 * Start listening to active ads from Firestore (Real-time)
 */
export function startCustomAdsListener() {
  if (isListening || !db) return;
  isListening = true;

  try {
    const q = query(collection(db, 'ads'), where('active', '==', true));
    unsubscribeSnapshot = onSnapshot(
      q,
      (snapshot) => {
        const ads: InAppCustomAd[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          ads.push({
            id: docSnap.id,
            title: d.title || 'Special Offer',
            message: d.message || '',
            imageUrl: d.imageUrl || '',
            linkUrl: d.linkUrl || '',
            placement: d.placement || 'home_banner',
            targetAudience: d.targetAudience || 'all',
            actionType: d.actionType || 'in_app_pro',
            ctaText: d.ctaText || 'Learn More',
            badgeText: d.badgeText || '',
            priority: typeof d.priority === 'number' ? d.priority : 5,
            clicksCount: typeof d.clicksCount === 'number' ? d.clicksCount : 0,
            impressionsCount: typeof d.impressionsCount === 'number' ? d.impressionsCount : 0,
            active: d.active !== false,
            startDate: d.startDate || '',
            endDate: d.endDate || '',
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          });
        });

        // Sort descending by priority, then creation time
        ads.sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5));

        cachedActiveAds = ads;
        adsListeners.forEach((listener) => listener(ads));
      },
      (err) => {
        console.warn('Custom ads listener error:', err);
      }
    );
  } catch (e) {
    console.warn('Could not initialize custom ads query:', e);
    isListening = false;
  }
}

export function stopCustomAdsListener() {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }
  isListening = false;
  adsListeners = [];
}

/**
 * React hook to access active custom ads
 */
export function useCustomAds(): InAppCustomAd[] {
  const [ads, setAds] = useState<InAppCustomAd[]>(cachedActiveAds);

  useEffect(() => {
    startCustomAdsListener();

    const listener = (newAds: InAppCustomAd[]) => {
      setAds(newAds);
    };

    adsListeners.push(listener);
    if (cachedActiveAds.length > 0 && ads.length === 0) {
      setAds(cachedActiveAds);
    }

    return () => {
      adsListeners = adsListeners.filter((l) => l !== listener);
    };
  }, []);

  return ads;
}

export const DEFAULT_PROMO_AD: InAppCustomAd = {
  id: 'rupeo_pro_default',
  title: 'Rupeo Pro Lifetime',
  message: '100% Ad-Free, Unlimited Reminders, Cloud Backup & VIP Themes.',
  placement: 'home_banner',
  targetAudience: 'free_only',
  actionType: 'in_app_pro',
  ctaText: 'Upgrade Now',
  badgeText: '👑 LIFETIME DEAL',
  priority: 0,
  clicksCount: 0,
  impressionsCount: 0,
  active: true,
};

export const DEFAULT_TRANSACTION_AD: InAppCustomAd = {
  id: 'rupeo_tx_smart_backup',
  title: 'Cloud Auto-Backup & Sync',
  message: 'Never lose receipts. Backup unlimited bills safely to cloud.',
  placement: 'transaction_footer',
  targetAudience: 'free_only',
  actionType: 'in_app_pro',
  ctaText: 'Get Pro',
  badgeText: '🔒 AUTO-SYNC',
  priority: 0,
  clicksCount: 0,
  impressionsCount: 0,
  active: true,
};

/**
 * Get active custom ads filtered by placement and user pro status
 */
export function getActiveCustomAdsForPlacement(
  ads: InAppCustomAd[],
  placement: AdPlacement,
  isPro: boolean = false
): InAppCustomAd[] {
  const list = ads !== undefined ? ads : cachedActiveAds;
  if (!list || list.length === 0) return [];
  const now = new Date().getTime();

  return list
    .filter((ad) => {
      if (!ad.active) return false;

      // 1. Placement matching
      const matchesPlacement = ad.placement === 'all' || ad.placement === placement;
      if (!matchesPlacement) return false;

      // 2. Audience filter
      if (ad.targetAudience === 'free_only' && isPro) return false;
      if (ad.targetAudience === 'pro_only' && !isPro) return false;

      // 3. Scheduling check
      if (ad.startDate) {
        const start = new Date(ad.startDate).getTime();
        if (!isNaN(start) && start > now) return false;
      }
      if (ad.endDate) {
        const end = new Date(ad.endDate).getTime();
        if (!isNaN(end) && end < now) return false;
      }

      return true;
    })
    .sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5));
}

/**
 * Check if AdMob placement is permitted in AppConfig
 */
export function isAdMobPlacementEnabled(config: AppConfig, placement: AdPlacement): boolean {
  if (!config || config.showAds === false || config.networkAdsEnabled === false) return false;
  switch (placement) {
    case 'home_banner':
    case 'transaction_footer':
    case 'scanner_screen':
      return config.adMobBannerEnabled !== false;
    case 'popup_modal':
      return config.adMobInterstitialEnabled !== false;
    case 'native_feed':
      return config.adMobNativeEnabled !== false;
    case 'rewarded_modal':
      return config.adMobRewardedEnabled !== false;
    case 'all':
    default:
      return true;
  }
}

/**
 * Main Resolution Algorithm for deciding which ad to serve
 */
export function shouldShowAd(
  user: { isPro?: boolean } | null | undefined,
  config: AppConfig,
  placement: AdPlacement,
  availableAds?: InAppCustomAd[]
): { show: boolean; type: 'custom' | 'admob' | 'none'; customAd?: InAppCustomAd } {
  const isPro = Boolean(user?.isPro);

  // 1. Pro Member VIP check
  if (config?.hideAdsForProUsers !== false && isPro) {
    return { show: false, type: 'none' };
  }

  // 2. Master Kill Switch (Admin turned off ads)
  if (!config || config.showAds === false) {
    return { show: false, type: 'none' };
  }

  // 3. If both custom and network ads are disabled by admin
  if (config.customAdsEnabled === false && config.networkAdsEnabled === false) {
    return { show: false, type: 'none' };
  }

  // 4. Resolve Custom Ad Candidates for this placement
  const adsList = availableAds !== undefined ? availableAds : cachedActiveAds;
  const customAds = getActiveCustomAdsForPlacement(adsList, placement, isPro);
  const topCustomAd = customAds[0] || undefined;

  // 5. Resolve Strategy
  const strategy = config.adsStrategy || 'custom_first';
  const customAllowed = config.customAdsEnabled !== false;
  const admobAllowed = config.networkAdsEnabled !== false && isAdMobPlacementEnabled(config, placement);

  if (strategy === 'custom_only') {
    if (customAllowed && topCustomAd) return { show: true, type: 'custom', customAd: topCustomAd };
    return { show: false, type: 'none' };
  }

  if (strategy === 'custom_first') {
    if (customAllowed && topCustomAd) return { show: true, type: 'custom', customAd: topCustomAd };
    if (admobAllowed) return { show: true, type: 'admob' };
    return { show: false, type: 'none' };
  }

  if (strategy === 'network_only') {
    if (admobAllowed) return { show: true, type: 'admob' };
    return { show: false, type: 'none' };
  }

  if (strategy === 'both') {
    if (customAllowed && topCustomAd) return { show: true, type: 'custom', customAd: topCustomAd };
    if (admobAllowed) return { show: true, type: 'admob' };
  }

  return { show: false, type: 'none' };
}

/**
 * Increment impression count in Firestore (Session deduped)
 */
export async function trackAdImpression(adId: string) {
  if (!adId || !db || recordedImpressions.has(adId)) return;
  recordedImpressions.add(adId);

  try {
    const adRef = doc(db, 'ads', adId);
    await updateDoc(adRef, {
      impressionsCount: increment(1),
    });
  } catch (err) {
    // Non-blocking telemetry
    console.warn('Ad impression tracking warning:', err);
  }
}

/**
 * Increment click count in Firestore
 */
export async function trackAdClick(adId: string) {
  if (!adId || !db) return;

  try {
    const adRef = doc(db, 'ads', adId);
    await updateDoc(adRef, {
      clicksCount: increment(1),
    });
  } catch (err) {
    console.warn('Ad click tracking warning:', err);
  }
}

/**
 * Handle custom ad click action
 */
export async function executeAdAction(
  ad: InAppCustomAd,
  router: any,
  supportPhone?: string
) {
  // Track click analytics first
  trackAdClick(ad.id);

  try {
    switch (ad.actionType) {
      case 'in_app_pro':
        if (router) {
          router.push('/premium');
        }
        break;

      case 'in_app_coupons':
        if (router) {
          router.push({
            pathname: '/premium',
            params: { showCoupons: 'true' },
          });
        }
        break;

      case 'in_app_scanner':
        if (router) {
          router.push('/split-qr');
        }
        break;

      case 'in_app_support':
      case 'open_whatsapp': {
        const phone = (supportPhone || '+919876543210').replace(/[^0-9]/g, '');
        const text = encodeURIComponent(`Hi Rupeo Team, I saw this promo: "${ad.title}" and would like more info.`);
        const waUrl = `https://wa.me/${phone}?text=${text}`;
        const canOpen = await Linking.canOpenURL(waUrl);
        if (canOpen) {
          await Linking.openURL(waUrl);
        } else {
          await WebBrowser.openBrowserAsync(waUrl);
        }
        break;
      }

      case 'external_url': {
        if (!ad.linkUrl) return;
        const targetUrl = ad.linkUrl.startsWith('http') ? ad.linkUrl : `https://${ad.linkUrl}`;
        if (Platform.OS === 'web') {
          window.open(targetUrl, '_blank');
        } else {
          try {
            await WebBrowser.openBrowserAsync(targetUrl);
          } catch {
            await Linking.openURL(targetUrl);
          }
        }
        break;
      }

      default:
        if (ad.linkUrl) {
          const url = ad.linkUrl.startsWith('http') ? ad.linkUrl : `https://${ad.linkUrl}`;
          await Linking.openURL(url);
        } else if (router) {
          router.push('/premium');
        }
        break;
    }
  } catch (err) {
    console.warn('Error executing ad action:', err);
  }
}
