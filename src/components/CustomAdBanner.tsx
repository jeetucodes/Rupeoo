import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { InAppCustomAd, executeAdAction, trackAdImpression } from '@/lib/customAds';
import { useAuth } from '@/context/AuthContext';

interface CustomAdBannerProps {
  ad: InAppCustomAd;
  style?: any;
  compact?: boolean;
  onDismiss?: () => void;
}

export function CustomAdBanner({ ad, style, compact = false, onDismiss }: CustomAdBannerProps) {
  const router = useRouter();
  const { appConfig } = useAuth();

  useEffect(() => {
    if (ad?.id && ad.id !== 'rupeo_pro_default') {
      trackAdImpression(ad.id);
    }
  }, [ad?.id]);

  if (!ad) return null;

  const handlePress = () => {
    executeAdAction(ad, router, appConfig?.supportPhone);
  };

  const isProAd = ad.actionType === 'in_app_pro';
  const hasImage = Boolean(ad.imageUrl);

  // If banner has a wide custom image and not in compact mode, render Hero Image Card
  if (hasImage && !compact) {
    return (
      <View style={[styles.outerWrapper, compact && styles.compactOuterWrapper, style]}>
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={handlePress}
          style={styles.heroCard}
        >
          <ExpoImage
            source={{ uri: ad.imageUrl }}
            style={styles.heroImage}
            contentFit="cover"
            transition={200}
          />
          <LinearGradient
            colors={['rgba(15, 23, 42, 0.1)', 'rgba(15, 23, 42, 0.88)']}
            style={styles.heroGradientOverlay}
          />

          {/* Top Badges Row */}
          <View style={styles.heroTopRow}>
            <View style={styles.badgeRow}>
              <View style={styles.promotedTagDark}>
                <Text style={styles.promotedTagTextDark}>SPONSORED</Text>
              </View>
              {Boolean(ad.badgeText) && (
                <View style={styles.goldBadge}>
                  <Ionicons name="sparkles" size={10} color="#F59E0B" style={{ marginRight: 3 }} />
                  <Text style={styles.goldBadgeText}>{ad.badgeText}</Text>
                </View>
              )}
            </View>

            {onDismiss && (
              <TouchableOpacity
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                style={styles.closeBtnDark}
              >
                <Ionicons name="close" size={13} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Bottom Hero Info & CTA */}
          <View style={styles.heroBottomRow}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {ad.title}
              </Text>
              {Boolean(ad.message) && (
                <Text style={styles.heroSubtitle} numberOfLines={1}>
                  {ad.message}
                </Text>
              )}
            </View>

            <View style={styles.heroCtaBtn}>
              <Text style={styles.heroCtaBtnText}>{ad.ctaText || 'View'}</Text>
              <Ionicons name="arrow-forward" size={12} color="#0F172A" style={{ marginLeft: 3 }} />
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  // Dedicated Transaction / Compact Banner (Matches sectionCard width & delivers rich fintech aesthetics)
  if (compact) {
    return (
      <View style={[styles.txOuterWrapper, style]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handlePress}
          style={styles.txCardContainer}
        >
          <LinearGradient
            colors={
              isProAd
                ? ['#0B1120', '#1A2138']
                : ['#FFFFFF', '#F8FAFC']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.txCard, isProAd ? styles.txCardBorderPro : styles.txCardBorderLight]}
          >
            {/* Top Header: Badges + Dismiss */}
            <View style={styles.txHeaderRow}>
              <View style={styles.txBadgeGroup}>
                <View style={isProAd ? styles.txTagPro : styles.txTagLight}>
                  <Text style={isProAd ? styles.txTagTextPro : styles.txTagTextLight}>
                    {isProAd ? 'OFFICIAL' : 'SPONSORED'}
                  </Text>
                </View>

                {Boolean(ad.badgeText) && (
                  <View style={styles.txHighlightBadge}>
                    <Ionicons name="flash" size={10} color="#B45309" style={{ marginRight: 3 }} />
                    <Text style={styles.txHighlightBadgeText}>{ad.badgeText}</Text>
                  </View>
                )}
              </View>

              {onDismiss && (
                <TouchableOpacity
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={(e) => {
                    e.stopPropagation();
                    onDismiss();
                  }}
                  style={isProAd ? styles.txCloseDark : styles.txCloseLight}
                >
                  <Ionicons name="close" size={13} color={isProAd ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>
              )}
            </View>

            {/* Content Body Row */}
            <View style={styles.txBodyRow}>
              {/* Graphic Icon / Thumbnail */}
              {hasImage ? (
                <View style={[styles.txImageWrap, isProAd && styles.txImageWrapPro]}>
                  <ExpoImage
                    source={{ uri: ad.imageUrl }}
                    style={styles.txImage}
                    contentFit="cover"
                    transition={200}
                  />
                </View>
              ) : (
                <View style={[styles.txIconWrap, isProAd && styles.txIconWrapPro]}>
                  <Ionicons
                    name={
                      ad.actionType === 'in_app_pro'
                        ? 'diamond'
                        : ad.actionType === 'in_app_coupons'
                        ? 'pricetag'
                        : ad.actionType === 'in_app_scanner'
                        ? 'qr-code'
                        : ad.actionType === 'open_whatsapp'
                        ? 'logo-whatsapp'
                        : 'sparkles'
                    }
                    size={22}
                    color={isProAd ? '#F59E0B' : '#2563EB'}
                  />
                </View>
              )}

              {/* Text Info Column */}
              <View style={styles.txTextColumn}>
                <Text
                  style={[styles.txTitle, isProAd && styles.txTitleDark]}
                  numberOfLines={1}
                >
                  {ad.title}
                </Text>
                {Boolean(ad.message) && (
                  <Text
                    style={[styles.txSubtitle, isProAd && styles.txSubtitleDark]}
                    numberOfLines={2}
                  >
                    {ad.message}
                  </Text>
                )}
              </View>

              {/* Action CTA Button */}
              <View style={styles.txCtaBtnWrapper}>
                <LinearGradient
                  colors={
                    isProAd
                      ? ['#F59E0B', '#D97706']
                      : ['#2563EB', '#1D4ED8']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.txCtaBtn}
                >
                  <Text
                    style={[styles.txCtaBtnText, isProAd && styles.txCtaBtnTextPro]}
                    numberOfLines={1}
                  >
                    {ad.ctaText || 'Upgrade'}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={12}
                    color={isProAd ? '#0F172A' : '#FFFFFF'}
                    style={{ marginLeft: 2 }}
                  />
                </LinearGradient>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  // Home Banner (Standard Variant) - Kept 100% untouched for home page
  return (
    <View style={[styles.outerWrapper, style]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        style={styles.cardContainer}
      >
        <LinearGradient
          colors={
            isProAd
              ? ['#0F172A', '#1E293B']
              : ['#FFFFFF', '#F8FAFC']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradientCard, compact && styles.compactGradientCard]}
        >
          {/* Top Mini Header */}
          <View style={styles.headerRow}>
            <View style={styles.badgeRow}>
              <View style={isProAd ? styles.promotedTagDark : styles.promotedTagLight}>
                <Text style={isProAd ? styles.promotedTagTextDark : styles.promotedTagTextLight}>
                  {isProAd ? 'OFFICIAL' : 'SPONSORED'}
                </Text>
              </View>

              {Boolean(ad.badgeText) && (
                <View style={styles.goldBadge}>
                  <Ionicons name="flash" size={10} color="#F59E0B" style={{ marginRight: 3 }} />
                  <Text style={styles.goldBadgeText}>{ad.badgeText}</Text>
                </View>
              )}
            </View>

            {onDismiss && (
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                style={isProAd ? styles.closeBtnDark : styles.closeBtnLight}
              >
                <Ionicons name="close" size={13} color={isProAd ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            )}
          </View>

          {/* Content Body */}
          <View style={[styles.contentRow, compact && styles.compactContentRow]}>
            {/* Leading Icon / Thumbnail */}
            {hasImage ? (
              <View style={[styles.thumbWrapper, compact && styles.compactThumbWrapper]}>
                <ExpoImage
                  source={{ uri: ad.imageUrl }}
                  style={styles.thumbImage}
                  contentFit="cover"
                  transition={200}
                />
              </View>
            ) : (
              <View
                style={[
                  styles.iconCircle,
                  compact && styles.compactIconCircle,
                  isProAd && styles.iconCirclePro,
                ]}
              >
                <Ionicons
                  name={
                    ad.actionType === 'in_app_pro'
                      ? 'diamond'
                      : ad.actionType === 'in_app_coupons'
                      ? 'pricetag'
                      : ad.actionType === 'in_app_scanner'
                      ? 'qr-code'
                      : ad.actionType === 'open_whatsapp'
                      ? 'logo-whatsapp'
                      : 'sparkles'
                  }
                  size={compact ? 18 : 22}
                  color={isProAd ? '#F59E0B' : '#2563EB'}
                />
              </View>
            )}

            {/* Text Information */}
            <View style={styles.textWrap}>
              <Text
                style={[
                  styles.titleText,
                  isProAd && styles.titleTextDark,
                  compact && styles.compactTitleText,
                ]}
                numberOfLines={1}
              >
                {ad.title}
              </Text>
              {Boolean(ad.message) && (
                <Text
                  style={[
                    styles.messageText,
                    isProAd && styles.messageTextDark,
                    compact && styles.compactMessageText,
                  ]}
                  numberOfLines={compact ? 1 : 2}
                >
                  {ad.message}
                </Text>
              )}
            </View>

            {/* Glowing Pill CTA Button */}
            <View
              style={[
                styles.ctaButton,
                isProAd && styles.ctaButtonPro,
                compact && styles.compactCtaButton,
              ]}
            >
              <Text
                style={[
                  styles.ctaButtonText,
                  isProAd && styles.ctaButtonTextPro,
                  compact && styles.compactCtaButtonText,
                ]}
              >
                {ad.ctaText || 'View'}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={12}
                color={isProAd ? '#0F172A' : '#FFFFFF'}
                style={{ marginLeft: 2 }}
              />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outer Wrapper ensuring safe, symmetric left & right margins
  outerWrapper: {
    width: '100%',
    paddingHorizontal: 20,
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactOuterWrapper: {
    paddingHorizontal: 0,
    marginVertical: 8,
  },

  // Card Container
  cardContainer: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  gradientCard: {
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingTop: 11,
    paddingBottom: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  compactGradientCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 11,
  },

  // Header Row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  promotedTagLight: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  promotedTagTextLight: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  promotedTagDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  promotedTagTextDark: {
    fontSize: 8.5,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.5,
  },
  goldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 0.5,
    borderColor: '#FDE68A',
  },
  goldBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  closeBtnLight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnDark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Content Row
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactContentRow: {
    gap: 8,
  },
  thumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginRight: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  compactThumbWrapper: {
    width: 38,
    height: 38,
    borderRadius: 9,
    marginRight: 8,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  compactIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginRight: 8,
  },
  iconCirclePro: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  textWrap: {
    flex: 1,
    marginRight: 10,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  titleTextDark: {
    color: '#FFFFFF',
  },
  compactTitleText: {
    fontSize: 12.5,
    marginBottom: 1,
  },
  messageText: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    fontWeight: '500',
  },
  messageTextDark: {
    color: '#94A3B8',
  },
  compactMessageText: {
    fontSize: 10.5,
    lineHeight: 14,
  },

  // CTA Button
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  ctaButtonPro: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  compactCtaButton: {
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  ctaButtonText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ctaButtonTextPro: {
    color: '#0F172A',
    fontWeight: '900',
  },
  compactCtaButtonText: {
    fontSize: 10.5,
  },

  // Wide Hero Image Card
  heroCard: {
    width: '100%',
    maxWidth: 480,
    height: 140,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradientOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  heroTopRow: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  heroBottomRow: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  heroTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 2,
  },
  heroSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  heroCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  heroCtaBtnText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#0F172A',
  },

  // Transaction Footer Banner (compact) Styles
  txOuterWrapper: {
    width: '100%',
    alignSelf: 'stretch',
    marginVertical: 10,
  },
  txCardContainer: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  txCard: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 13,
    overflow: 'hidden',
  },
  txCardBorderPro: {
    borderWidth: 1.2,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  txCardBorderLight: {
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  txHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  txBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txTagPro: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  txTagTextPro: {
    fontSize: 8.5,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.5,
  },
  txTagLight: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  txTagTextLight: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  txHighlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 0.5,
    borderColor: '#FDE68A',
  },
  txHighlightBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  txCloseDark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txCloseLight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txImageWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    marginRight: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  txImageWrapPro: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  txImage: {
    width: '100%',
    height: '100%',
  },
  txIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  txIconWrapPro: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  txTextColumn: {
    flex: 1,
    marginRight: 10,
    justifyContent: 'center',
  },
  txTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  txTitleDark: {
    color: '#FFFFFF',
  },
  txSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    fontWeight: '500',
  },
  txSubtitleDark: {
    color: '#94A3B8',
  },
  txCtaBtnWrapper: {
    borderRadius: 999,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 2,
  },
  txCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderRadius: 999,
  },
  txCtaBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  txCtaBtnTextPro: {
    color: '#0F172A',
    fontWeight: '900',
  },
});
