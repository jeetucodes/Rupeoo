import React from 'react';
import { Platform } from 'react-native';
import * as webAds from './ads.web';
import * as nativeAds from './ads.native';
import { AppConfig } from '@/context/AuthContext';
import { AdPlacement } from './customAds';

export * from './customAds';
export { CustomAdBanner } from '@/components/CustomAdBanner';
export { CustomAdModal } from '@/components/CustomAdModal';

export const ADMOB_CONFIG = Platform.OS === 'web' ? webAds.ADMOB_CONFIG : nativeAds.ADMOB_CONFIG;

export function initializeAds(config?: AppConfig) {
  if (Platform.OS === 'web') {
    return webAds.initializeAds(config);
  }
  return nativeAds.initializeAds(config);
}

export function preloadTransactionSaveAd(forceTest: boolean = false, customUnitId?: string) {
  if (Platform.OS === 'web') {
    return webAds.preloadTransactionSaveAd(forceTest, customUnitId);
  }
  return nativeAds.preloadTransactionSaveAd(forceTest, customUnitId);
}

export function showTransactionSaveAd(
  isUserPremium: boolean = false,
  onDismiss?: () => void,
  config?: AppConfig
) {
  if (Platform.OS === 'web') {
    return webAds.showTransactionSaveAd(isUserPremium, onDismiss, config);
  }
  return nativeAds.showTransactionSaveAd(isUserPremium, onDismiss, config);
}

export function RupeoAdBanner(props: {
  placement?: AdPlacement;
  style?: any;
  compact?: boolean;
}) {
  if (Platform.OS === 'web') {
    return <webAds.RupeoAdBanner {...props} />;
  }
  return <nativeAds.RupeoAdBanner {...props} />;
}

export function HomeBannerAd(props: { style?: any; compact?: boolean }) {
  if (Platform.OS === 'web') {
    return <webAds.HomeBannerAd {...props} />;
  }
  return <nativeAds.HomeBannerAd {...props} />;
}
