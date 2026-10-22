import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, AppConfig } from '@/context/AuthContext';
import {
  shouldShowAd,
  useCustomAds,
  AdPlacement,
  getActiveCustomAdsForPlacement,
  InAppCustomAd,
} from './customAds';
import { CustomAdBanner } from '@/components/CustomAdBanner';
import { log, warn } from '@/lib/logger';

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

let isSdkInitialized = false;
let initPromise: Promise<void> | null = null;
const initListeners: Array<(initialized: boolean) => void> = [];

let interstitialRetryCount = 0;
let interstitialRetryTimeout: any = null;
const MAX_INTERSTITIAL_RETRIES = 3;

export const TEST_INTERSTITIAL_ID = TestIds?.INTERSTITIAL || 'ca-app-pub-3940256099942544/1033173712';
export const TEST_BANNER_ID = TestIds?.BANNER || 'ca-app-pub-3940256099942544/6300978111';

/**
 * Diagnostic helper mapping AdMob error codes to readable explanations.
 */
export function formatAdError(error: any): string {
  if (!error) return 'Unknown error';
  const code = error.code ?? error.errorCode;
  const rawMessage = error.message || (typeof error === 'string' ? error : JSON.stringify(error));

  let explanation = '';
  const strCode = String(code ?? '').toLowerCase();
  const strMsg = String(rawMessage ?? '').toLowerCase();

  if (code === 0 || strCode.includes('internal') || strMsg.includes('internal')) {
    explanation = 'Code 0 (ERROR_CODE_INTERNAL_ERROR: Something happened internally; e.g. invalid response from ad server)';
  } else if (code === 1 || strCode.includes('invalid') || strMsg.includes('invalid')) {
    explanation = 'Code 1 (ERROR_CODE_INVALID_REQUEST: Invalid request; check ad unit ID, app ID, or device time)';
  } else if (code === 2 || strCode.includes('network') || strMsg.includes('network')) {
    explanation = 'Code 2 (ERROR_CODE_NETWORK_ERROR: Network connectivity issue)';
  } else if (code === 3 || strCode.includes('no-fill') || strCode.includes('nofill') || strMsg.includes('no fill') || strMsg.includes('no-fill')) {
    explanation = 'Code 3 (ERROR_CODE_NO_FILL: Ad request successful, but lack of ad inventory or newly created ad unit)';
  } else if (code !== undefined) {
    explanation = `Code ${code}`;
  }

  return explanation ? `${explanation} - ${rawMessage}` : rawMessage;
}

export function isMobileAdsInitialized(): boolean {
  return isSdkInitialized;
}

/**
 * Visual AdMob Test Banner Preview Component
 * Renders in Expo Go, non-native environments, or as fallback when test mode is active
 */
export function AdMobTestBannerPreview({
  unitId = TEST_BANNER_ID,
  style,
  compact = false,
  errorText,
}: {
  unitId?: string;
  style?: any;
  compact?: boolean;
  errorText?: string;
}) {
  return (
    <View style={[styles.outerWrapper, compact && styles.compactOuterWrapper, style]}>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => {
          Alert.alert(
            'Google AdMob Test Mode Active',
            `Status: Test Ads Enabled via Admin\nAd Unit ID: ${unitId}\nMode: Google Sample Test ID (100% Fill Rate)\n\nNote: In Expo Go, AdMob native SDK is mocked with this card. On Android APK / Dev Client builds, Google Mobile Ads SDK renders real test ads directly.`,
            [{ text: 'OK' }]
          );
        }}
        style={[styles.testBannerBox, compact && styles.compactTestBannerBox]}
      >
        <View style={styles.testBannerLeft}>
          <View style={styles.testAdBadge}>
            <Text style={styles.testAdBadgeText}>Ad</Text>
          </View>
          <View style={styles.testBannerTextWrap}>
            <View style={styles.testBannerTitleRow}>
              <Text style={styles.testBannerTitle}>Google AdMob Test Banner</Text>
              <View style={styles.testActivePill}>
                <Text style={styles.testActivePillText}>TEST MODE ON</Text>
              </View>
            </View>
            <Text style={styles.testBannerSub} numberOfLines={1}>
              {errorText ? `Notice: ${errorText}` : `Unit: ${unitId}`}
            </Text>
          </View>
        </View>
        <View style={styles.testInfoIcon}>
          <Ionicons name="information-circle-outline" size={16} color="#94A3B8" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Initialize Google Mobile Ads SDK (Native)
 * Strictly respects networkAdsEnabled and showAds master switches.
 */
export async function initializeAds(config?: AppConfig): Promise<void> {
  // If ads are killed or network ads are disabled, completely bypass SDK initialization
  if (config && (config.showAds === false || config.networkAdsEnabled === false)) {
    log('AdMob disabled by config: Skipping Google Mobile Ads SDK initialization');
    return;
  }

  if (!mobileAds) return;

  if (isSdkInitialized) {
    preloadTransactionSaveAd(Boolean(config?.adMobTestMode), config?.adMobInterstitialUnitId);
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      log('Initializing Google Mobile Ads SDK...');
      const adapterStatuses = await mobileAds().initialize();
      isSdkInitialized = true;
      log('✅ Google Mobile Ads SDK initialized successfully:', adapterStatuses);
      initListeners.forEach((fn) => {
        try {
          fn(true);
        } catch {
          // ignore callback error
        }
      });
      preloadTransactionSaveAd(Boolean(config?.adMobTestMode), config?.adMobInterstitialUnitId);
    } catch (e) {
      warn('Google Mobile Ads initialization warning:', e);
      // Mark as initialized so callers do not hang indefinitely
      isSdkInitialized = true;
      initListeners.forEach((fn) => {
        try {
          fn(true);
        } catch {
          // ignore callback error
        }
      });
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Preload the Transaction Save Interstitial Ad
 */
export function preloadTransactionSaveAd(forceTest: boolean = false, customUnitId?: string) {
  if (!InterstitialAd || !AdEventType) return;

  // Clear any pending retry timer
  if (interstitialRetryTimeout) {
    clearTimeout(interstitialRetryTimeout);
    interstitialRetryTimeout = null;
  }

  // If an interstitial is already loaded and ready, avoid redundant requests
  if (isInterstitialLoaded) return;

  // Ensure SDK initialization completes before requesting an ad
  if (!isSdkInitialized) {
    if (initPromise) {
      initPromise.then(() => preloadTransactionSaveAd(forceTest, customUnitId));
      return;
    }
  }

  const isTest = __DEV__ || forceTest;
  const adUnitId = isTest
    ? TEST_INTERSTITIAL_ID
    : customUnitId || ADMOB_CONFIG.transactionSaveId;

  if (!adUnitId) {
    log('AdMob Interstitial: No ad unit ID configured, skipping preload');
    return;
  }

  try {
    interstitial = InterstitialAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: false,
    });

    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      log('✅ AdMob Interstitial loaded successfully with ID:', adUnitId);
      isInterstitialLoaded = true;
      interstitialRetryCount = 0;
    });

    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      log('AdMob Interstitial closed by user');
      isInterstitialLoaded = false;
      interstitialRetryCount = 0;
      const cb = onInterstitialClosedCallback;
      onInterstitialClosedCallback = null;
      if (cb) {
        cb();
      }
      // Preload next interstitial ad
      preloadTransactionSaveAd(forceTest, customUnitId);
    });

    interstitial.addAdEventListener(AdEventType.ERROR, (error: any) => {
      const diagnostic = formatAdError(error);
      warn(`[AdMob Interstitial Diagnostic] Failed to load (unitId: ${adUnitId}): ${diagnostic}`);
      isInterstitialLoaded = false;

      // Capped exponential backoff (max 3 retries: 2s, 4s, 8s)
      if (interstitialRetryCount < MAX_INTERSTITIAL_RETRIES) {
        const delay = Math.pow(2, interstitialRetryCount + 1) * 1000;
        interstitialRetryCount += 1;
        log(`AdMob Interstitial: Scheduling retry #${interstitialRetryCount} in ${delay}ms`);
        interstitialRetryTimeout = setTimeout(() => {
          preloadTransactionSaveAd(forceTest, customUnitId);
        }, delay);
      } else {
        log(`AdMob Interstitial: Reached maximum retry limit (${MAX_INTERSTITIAL_RETRIES}). Stopping retries until next transaction.`);
      }
    });

    interstitial.load();
  } catch (e) {
    warn('Could not create InterstitialAd instance:', e);
  }
}

/**
 * Show Transaction Save Ad (Interstitial) after a transaction is successfully saved
 * In test mode, triggers on every transaction for instant verification.
 */
export async function showTransactionSaveAd(
  isUserPremium: boolean = false,
  onDismiss?: () => void,
  config?: AppConfig
): Promise<void> {
  const dismiss = () => {
    if (onDismiss) onDismiss();
  };

  // 1. Pro Member VIP check
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

  const isTest = __DEV__ || Boolean(config?.adMobTestMode);

  // 3. Interstitial Frequency Interval check (In test mode, test on every entry)
  const interval = isTest
    ? 1
    : (config?.interstitialInterval && config.interstitialInterval > 0
      ? config.interstitialInterval
      : 3);

  expenseEntryCount += 1;

  if (expenseEntryCount % interval !== 0) {
    log(`Transaction entry #${expenseEntryCount}: skipping interstitial (interval is ${interval})`);
    if (!isInterstitialLoaded) {
      interstitialRetryCount = 0;
      preloadTransactionSaveAd(Boolean(config?.adMobTestMode), config?.adMobInterstitialUnitId);
    }
    dismiss();
    return;
  }

  // If in Expo Go or non-native environment where InterstitialAd is undefined
  if (!InterstitialAd) {
    if (isTest) {
      log('ℹ️ AdMob Test Interstitial triggered (Expo Go preview — native ad renders on APK/Dev Build)');
    }
    dismiss();
    return;
  }

  // 4. Show Interstitial
  try {
    if (interstitial && isInterstitialLoaded) {
      onInterstitialClosedCallback = dismiss;
      await interstitial.show();
    } else {
      log('Interstitial ad not ready yet, preloading for next time and continuing flow');
      interstitialRetryCount = 0;
      preloadTransactionSaveAd(Boolean(config?.adMobTestMode), config?.adMobInterstitialUnitId);
      dismiss();
    }
  } catch (e) {
    warn('Error displaying Transaction Save Ad:', e);
    onInterstitialClosedCallback = null;
    dismiss();
    interstitialRetryCount = 0;
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
  const [sdkReady, setSdkReady] = useState(isSdkInitialized || !mobileAds);
  const [retryKey, setRetryKey] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<any>(null);

  // Subscribe to SDK initialization
  useEffect(() => {
    if (isSdkInitialized || !mobileAds) {
      setSdkReady(true);
      return;
    }
    const listener = (ready: boolean) => setSdkReady(ready);
    initListeners.push(listener);
    return () => {
      const idx = initListeners.indexOf(listener);
      if (idx > -1) initListeners.splice(idx, 1);
    };
  }, []);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Run resolution algorithm
  const decision = shouldShowAd({ isPro: isPremium }, appConfig, placement, customAds);

  // If AdMob is chosen but SDK isn't initialized yet, kick off initialization
  useEffect(() => {
    if (decision.type === 'admob' && !isSdkInitialized && mobileAds) {
      initializeAds(appConfig).catch((err) => warn('Banner auto-init warning:', err));
    }
  }, [decision.type, appConfig]);

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
    const isTestMode = __DEV__ || Boolean(appConfig?.adMobTestMode);
    const configuredUnitId = appConfig?.adMobBannerUnitId || ADMOB_CONFIG.homeBannerId;
    const adUnitId = isTestMode ? TEST_BANNER_ID : configuredUnitId;

    // Check if native module is missing (e.g. Expo Go)
    if (!BannerAd || !BannerAdSize) {
      if (isTestMode) {
        return <AdMobTestBannerPreview unitId={adUnitId} style={style} compact={compact} />;
      }
      if (fallbackAd && appConfig?.customAdsEnabled !== false && appConfig?.showAds !== false) {
        return <CustomAdBanner ad={fallbackAd} style={style} compact={compact} />;
      }
      return null;
    }

    // Check if AdMob failed after retries
    if (admobError) {
      if (isTestMode) {
        return (
          <AdMobTestBannerPreview
            unitId={adUnitId}
            style={style}
            compact={compact}
            errorText="Ad failed on device. Check internet / Google Play Services."
          />
        );
      }
      if (fallbackAd && appConfig?.customAdsEnabled !== false && appConfig?.showAds !== false) {
        return <CustomAdBanner ad={fallbackAd} style={style} compact={compact} />;
      }
      return null;
    }

    if (!adUnitId) {
      if (fallbackAd && appConfig?.customAdsEnabled !== false && appConfig?.showAds !== false) {
        return <CustomAdBanner ad={fallbackAd} style={style} compact={compact} />;
      }
      return null;
    }

    return (
      <View style={[styles.outerWrapper, compact && styles.compactOuterWrapper, style]}>
        <View style={styles.bannerContainer}>
          <BannerAd
            key={`${adUnitId}_${retryKey}`}
            unitId={adUnitId}
            size={BannerAdSize.BANNER}
            requestOptions={{
              requestNonPersonalizedAdsOnly: false,
            }}
            onAdLoaded={() => {
              log('✅ AdMob Banner loaded successfully with ID:', adUnitId);
              setAdmobLoaded(true);
              setAdmobError(false);
              retryCountRef.current = 0;
            }}
            onAdFailedToLoad={(error: any) => {
              const diagnostic = formatAdError(error);
              warn(`[AdMob Banner Diagnostic] Failed to load (unitId: ${adUnitId}): ${diagnostic}`);
              setAdmobLoaded(false);

              // Retry once after 2 seconds
              if (retryCountRef.current < 2) {
                const delay = (retryCountRef.current + 1) * 2000;
                retryCountRef.current += 1;
                log(`AdMob Banner: Scheduling retry #${retryCountRef.current} in ${delay}ms`);
                if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = setTimeout(() => {
                  setRetryKey((k) => k + 1);
                }, delay);
              } else {
                log('AdMob Banner: Reached maximum retry limit (2).');
                setAdmobError(true);
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
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  testBannerBox: {
    width: '100%',
    maxWidth: 420,
    minHeight: 52,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactTestBannerBox: {
    minHeight: 46,
    paddingVertical: 6,
  },
  testBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  testAdBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  testAdBadgeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  testBannerTextWrap: {
    flex: 1,
  },
  testBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  testBannerTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  testActivePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  testActivePillText: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '800',
  },
  testBannerSub: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  testInfoIcon: {
    marginLeft: 6,
  },
});

