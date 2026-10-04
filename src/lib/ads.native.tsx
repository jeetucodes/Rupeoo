import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth, AppConfig } from '@/context/AuthContext';
import {
  shouldShowAd,
  useCustomAds,
  AdPlacement,
  getActiveCustomAdsForPlacement,
  InAppCustomAd,
} from './customAds';
import { CustomAdBanner } from '@/components/CustomAdBanner';

export * from './customAds';
export { CustomAdBanner } from '@/components/CustomAdBanner';
export { CustomAdModal } from '@/components/CustomAdModal';

// Dynamically check if react-native-google-mobile-ads native binary is available
let GoogleMobileAds: any = null;
try {
  GoogleMobileAds = require('react-native-google-mobile-ads');
} catch (e) {
  // Running in Expo Go client without custom native modules
}

const mobileAds = GoogleMobileAds?.default;
const BannerAd = GoogleMobileAds?.BannerAd;
const BannerAdSize = GoogleMobileAds?.BannerAdSize;
const InterstitialAd = GoogleMobileAds?.InterstitialAd;
const AdEventType = GoogleMobileAds?.AdEventType;
const TestIds = GoogleMobileAds?.TestIds;

export const ADMOB_CONFIG = {
  appId: process.env.EXPO_PUBLIC_ADMOB_APP_ID || 'ca-app-pub-2106211536803561~5812952031',
  homeBannerId: process.env.EXPO_PUBLIC_ADMOB_HOME_BANNER_ID || 'ca-app-pub-2106211536803561/4086148848',
  transactionSaveId: process.env.EXPO_PUBLIC_ADMOB_TX_SAVE_ID || 'ca-app-pub-2106211536803561/1459985503',
};

let interstitial: any = null;
let isInterstitialLoaded = false;
let onInterstitialClosedCallback: (() => void) | null = null;
let expenseEntryCount = 0;

const TEST_INTERSTITIAL_ID = TestIds?.INTERSTITIAL || 'ca-app-pub-3940256099942544/1033173712';
const TEST_BANNER_ID = TestIds?.BANNER || 'ca-app-pub-3940256099942544/6300978111';

/**
 * Initialize Google Mobile Ads SDK (Native)
 * Strictly respects networkAdsEnabled and showAds master switches.
 */
export async function initializeAds(config?: AppConfig) {
  // If ads are killed or network ads are disabled, completely bypass SDK initialization
  if (config && (config.showAds === false || config.networkAdsEnabled === false)) {
    console.log('AdMob disabled by config: Skipping Google Mobile Ads SDK initialization');
    return;
  }

  if (!mobileAds) return;
  try {
    await mobileAds().initialize();
    preloadTransactionSaveAd(Boolean(config?.adMobTestMode), config?.adMobInterstitialUnitId);
  } catch (e) {
    console.warn('Google Mobile Ads initialization warning:', e);
  }
}

/**
 * Preload the Transaction Save Interstitial Ad
 */
export function preloadTransactionSaveAd(forceTest: boolean = false, customUnitId?: string) {
  if (!InterstitialAd || !AdEventType) return;

  const adUnitId = forceTest || __DEV__
    ? TEST_INTERSTITIAL_ID
    : customUnitId || ADMOB_CONFIG.transactionSaveId;

  try {
    interstitial = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: false,
    });

    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      console.log('✅ AdMob Interstitial loaded successfully with ID:', adUnitId);
      isInterstitialLoaded = true;
    });

    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('AdMob Interstitial closed by user');
      isInterstitialLoaded = false;
      const cb = onInterstitialClosedCallback;
      onInterstitialClosedCallback = null;
      if (cb) {
        cb();
      }
      // Preload next interstitial ad
      preloadTransactionSaveAd(forceTest, customUnitId);
    });

    interstitial.addAdEventListener(AdEventType.ERROR, (error: any) => {
      console.warn('AdMob Interstitial failed to load with unitId:', adUnitId, error);
      isInterstitialLoaded = false;
      if (!forceTest) {
        // Fallback to Google's official test interstitial ID
        preloadTransactionSaveAd(true, customUnitId);
      }
    });

    interstitial.load();
  } catch (e) {
    console.warn('Could not create InterstitialAd instance:', e);
  }
}

/**
 * Show Transaction Save Ad (Interstitial) after a transaction is successfully saved
 * Strictly honors Pro-User suppression, remote master toggles, and interstitial interval.
 */
export async function showTransactionSaveAd(
  isUserPremium: boolean = false,
  onDismiss?: () => void,
  config?: AppConfig
): Promise<void> {
  const dismiss = () => {
    if (onDismiss) onDismiss();
  };

  // 1. Pro Member VIP VIP check
  if (isUserPremium || (config && config.hideAdsForProUsers !== false && isUserPremium)) {
    dismiss();
    return;
  }

  // 2. Master Kill Switch / Network Ads Switch / Granular Interstitial switch
  if (
    config &&
    (config.showAds === false ||
      config.networkAdsEnabled === false ||
      config.adMobInterstitialEnabled === false)
  ) {
    dismiss();
    return;
  }

  // 3. Interstitial Frequency Interval check (Default: every 3 transactions)
  const interval =
    config?.interstitialInterval && config.interstitialInterval > 0
      ? config.interstitialInterval
      : 3;
  expenseEntryCount += 1;

  if (expenseEntryCount % interval !== 0) {
    console.log(`Transaction entry #${expenseEntryCount}: skipping interstitial (interval is ${interval})`);
    preloadTransactionSaveAd(Boolean(config?.adMobTestMode), config?.adMobInterstitialUnitId);
    dismiss();
    return;
  }

  // 4. Show Interstitial
  try {
    if (interstitial && isInterstitialLoaded) {
      onInterstitialClosedCallback = dismiss;
      await interstitial.show();
    } else {
      console.log('Interstitial ad not ready yet, continuing flow');
      preloadTransactionSaveAd(Boolean(config?.adMobTestMode), config?.adMobInterstitialUnitId);
      dismiss();
    }
  } catch (e) {
    console.warn('Error displaying Transaction Save Ad:', e);
    onInterstitialClosedCallback = null;
    dismiss();
    preloadTransactionSaveAd(Boolean(config?.adMobTestMode), config?.adMobInterstitialUnitId);
  }
}

/**
 * Unified Ad Banner Component (Supports all placements)
 * Implements resolution algorithm: Custom In-House vs AdMob fallback vs None.
 */
export function RupeoAdBanner({
  placement = 'home_banner',
  style,
  compact = false,
}: {
  placement?: AdPlacement;
  style?: any;
  compact?: boolean;
}) {
  const { isPremium, appConfig } = useAuth();
  const customAds = useCustomAds();
  const [admobLoaded, setAdmobLoaded] = useState(false);
  const [admobError, setAdmobError] = useState(false);
  const [useTestAd, setUseTestAd] = useState(__DEV__ || Boolean(appConfig?.adMobTestMode));

  // Run resolution algorithm
  const decision = shouldShowAd({ isPro: isPremium }, appConfig, placement, customAds);

  // Fallback custom ad candidate
  const fallbackList = getActiveCustomAdsForPlacement(customAds, placement, isPremium);
  const fallbackAd = fallbackList[0];

  if (!decision.show || decision.type === 'none') {
    return null;
  }

  // Case 1: Custom In-House Ad
  if (decision.type === 'custom' && decision.customAd) {
    return <CustomAdBanner ad={decision.customAd} style={style} compact={compact} />;
  }

  // Case 2: Google AdMob Banner
  if (decision.type === 'admob') {
    // If native module is missing (Expo Go) or AdMob failed to load
    if (!BannerAd || !BannerAdSize || admobError) {
      // If custom ads are allowed and candidate exists, fallback to custom ad!
      if (fallbackAd && appConfig?.customAdsEnabled !== false && appConfig?.showAds !== false) {
        return <CustomAdBanner ad={fallbackAd} style={style} compact={compact} />;
      }
      return null;
    }

    const isTestMode = useTestAd || Boolean(appConfig?.adMobTestMode);
    const configuredUnitId = appConfig?.adMobBannerUnitId || ADMOB_CONFIG.homeBannerId;
    const adUnitId = isTestMode ? TEST_BANNER_ID : configuredUnitId;

    return (
      <View style={[styles.outerWrapper, compact && styles.compactOuterWrapper, style]}>
        <View style={[styles.bannerContainer, !admobLoaded && styles.hiddenBanner]}>
          <BannerAd
            key={adUnitId}
            unitId={adUnitId}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{
              requestNonPersonalizedAdsOnly: false,
            }}
            onAdLoaded={() => {
              setAdmobLoaded(true);
              setAdmobError(false);
            }}
            onAdFailedToLoad={(error: any) => {
              console.warn('AdMob Banner failed to load with unitId:', adUnitId, error);
              if (!isTestMode) {
                setUseTestAd(true);
              } else {
                setAdmobError(true);
                setAdmobLoaded(false);
              }
            }}
          />
        </View>
      </View>
    );
  }

  return null;
}

/**
 * Backward compatible HomeBannerAd component
 */
export function HomeBannerAd(props: { style?: any; compact?: boolean }) {
  return <RupeoAdBanner placement="home_banner" {...props} />;
}

const styles = StyleSheet.create({
  outerWrapper: {
    width: '100%',
    paddingHorizontal: 20,
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactOuterWrapper: {
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  bannerContainer: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 14,
  },
  hiddenBanner: {
    height: 0,
    marginVertical: 0,
    paddingVertical: 0,
    opacity: 0,
    overflow: 'hidden',
  },
});
