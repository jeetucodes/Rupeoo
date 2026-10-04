import React from 'react';
import { AppConfig, useAuth } from '@/context/AuthContext';
import {
  shouldShowAd,
  useCustomAds,
  AdPlacement,
  InAppCustomAd,
} from './customAds';
import { CustomAdBanner } from '@/components/CustomAdBanner';

export * from './customAds';
export { CustomAdBanner } from '@/components/CustomAdBanner';
export { CustomAdModal } from '@/components/CustomAdModal';

export const ADMOB_CONFIG = {
  appId: process.env.EXPO_PUBLIC_ADMOB_APP_ID || 'ca-app-pub-2106211536803561~5812952031',
  homeBannerId: process.env.EXPO_PUBLIC_ADMOB_HOME_BANNER_ID || 'ca-app-pub-2106211536803561/4086148848',
  transactionSaveId: process.env.EXPO_PUBLIC_ADMOB_TX_SAVE_ID || 'ca-app-pub-2106211536803561/1459985503',
};

export async function initializeAds(_config?: AppConfig): Promise<void> {}

export function preloadTransactionSaveAd(_forceTest: boolean = false, _customUnitId?: string): void {}

export async function showTransactionSaveAd(
  _isUserPremium: boolean = false,
  onDismiss?: () => void,
  _config?: AppConfig
): Promise<void> {
  if (onDismiss) onDismiss();
}

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

  // Run resolution algorithm
  const decision = shouldShowAd({ isPro: isPremium }, appConfig, placement, customAds);

  // If custom ad should show, render it on web too!
  if (decision.show && decision.type === 'custom' && decision.customAd) {
    return <CustomAdBanner ad={decision.customAd} style={style} compact={compact} />;
  }

  // Network AdMob is not available on web
  return null;
}

export function HomeBannerAd(props: { style?: any; compact?: boolean }) {
  return <RupeoAdBanner placement="home_banner" {...props} />;
}
