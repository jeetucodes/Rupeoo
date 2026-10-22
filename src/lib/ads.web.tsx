import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

export const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';
export const TEST_INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';

export function formatAdError(error: any): string {
  return String(error?.message || error || 'Unknown error');
}

export function isMobileAdsInitialized(): boolean {
  return false;
}

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

  // If AdMob test mode is on, render simulated AdMob test banner on web
  if (decision.show && decision.type === 'admob' && (appConfig?.adMobTestMode || __DEV__)) {
    const unitId = appConfig?.adMobBannerUnitId || TEST_BANNER_ID;
    return (
      <View style={[styles.outerWrapper, compact && styles.compactOuterWrapper, style]}>
        <View style={[styles.testBannerBox, compact && styles.compactTestBannerBox]}>
          <View style={styles.testBannerLeft}>
            <View style={styles.testAdBadge}>
              <Text style={styles.testAdBadgeText}>Ad</Text>
            </View>
            <View style={styles.testBannerTextWrap}>
              <View style={styles.testBannerTitleRow}>
                <Text style={styles.testBannerTitle}>Google AdMob Test Banner</Text>
                <View style={styles.testActivePill}>
                  <Text style={styles.testActivePillText}>WEB PREVIEW</Text>
                </View>
              </View>
              <Text style={styles.testBannerSub} numberOfLines={1}>
                Unit: {unitId}
              </Text>
            </View>
          </View>
          <Ionicons name="information-circle-outline" size={16} color="#94A3B8" />
        </View>
      </View>
    );
  }

  // Live network AdMob requires native SDK (Android/iOS)
  return null;
}

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
});

