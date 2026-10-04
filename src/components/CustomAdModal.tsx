import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { InAppCustomAd, executeAdAction, trackAdImpression } from '@/lib/customAds';
import { useAuth } from '@/context/AuthContext';

interface CustomAdModalProps {
  ad: InAppCustomAd | null;
  visible: boolean;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function CustomAdModal({ ad, visible, onClose }: CustomAdModalProps) {
  const router = useRouter();
  const { appConfig } = useAuth();

  useEffect(() => {
    if (visible && ad?.id) {
      trackAdImpression(ad.id);
    }
  }, [visible, ad?.id]);

  if (!ad) return null;

  const handleCtaPress = () => {
    onClose();
    executeAdAction(ad, router, appConfig?.supportPhone);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Top Close Button */}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>

              {/* Optional Hero Banner Image */}
              {Boolean(ad.imageUrl) && (
                <View style={styles.heroImageWrapper}>
                  <ExpoImage
                    source={{ uri: ad.imageUrl }}
                    style={styles.heroImage}
                    contentFit="cover"
                  />
                </View>
              )}

              {/* Body */}
              <View style={styles.body}>
                {/* Badge & Sponsor tag */}
                <View style={styles.badgeRow}>
                  <View style={styles.sponsorBadge}>
                    <Text style={styles.sponsorBadgeText}>FEATURED</Text>
                  </View>
                  {Boolean(ad.badgeText) && (
                    <View style={styles.highlightBadge}>
                      <Text style={styles.highlightBadgeText}>{ad.badgeText}</Text>
                    </View>
                  )}
                </View>

                {/* Title */}
                <Text style={styles.title}>{ad.title}</Text>

                {/* Message */}
                {Boolean(ad.message) && (
                  <Text style={styles.message}>{ad.message}</Text>
                )}

                {/* Primary Action Button */}
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleCtaPress}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>{ad.ctaText || 'Claim Offer'}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                {/* Secondary Dismiss Button */}
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dismissBtnText}>Maybe Later</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: Math.min(SCREEN_WIDTH - 48, 360),
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 0,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImageWrapper: {
    width: '100%',
    height: 160,
    backgroundColor: '#F8FAFC',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  body: {
    padding: 20,
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sponsorBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
  },
  sponsorBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  highlightBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
    borderWidth: 0.5,
    borderColor: '#FDE68A',
  },
  highlightBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#D97706',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 13,
    borderRadius: 0,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 10,
  },
  primaryBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dismissBtn: {
    paddingVertical: 6,
  },
  dismissBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
