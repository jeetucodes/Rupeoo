/**
 * Clean & Minimal Onboarding Step: "Auto-Track Spends"
 *
 * Designed to seamlessly match the primary onboarding aesthetic:
 * - 100% English copy
 * - Clean single-screen layout (NON-SCROLLABLE) fitting all elements & action button
 * - Seamless 3D claymorphism illustration matching the onboarding design system
 * - Responsive sizing for compact and large viewports
 * - Instant single-tap to open Android Notification Access settings
 * - Automatic "Done" state detection upon returning from Settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  Platform,
  Image,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { isListenerEnabled, openListenerSettings } from './nativeModule';
import { setupAutoAddNotificationChannel } from './notifTask';

interface OnboardingPermissionStepProps {
  onComplete: () => void;
  onSkip: () => void;
  onBack?: () => void;
}

export default function OnboardingPermissionStep({
  onComplete,
  onSkip,
  onBack,
}: OnboardingPermissionStepProps) {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Responsive sizing breakpoints
  const isCompact = SCREEN_HEIGHT < 720;
  const imageSize = Math.min(
    SCREEN_WIDTH * (isCompact ? 0.44 : 0.52),
    isCompact ? 165 : 210
  );

  // Ambient floating background blobs (matching onboarding slide aesthetic)
  const floatAnim1 = useSharedValue(0);
  const floatAnim2 = useSharedValue(0);

  // Check listener permission status
  const checkStatus = useCallback(async () => {
    const enabled = await isListenerEnabled();
    setIsEnabled(enabled);

    if (enabled) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }
  }, []);

  useEffect(() => {
    checkStatus();

    if (Platform.OS === 'android') {
      Notifications.requestPermissionsAsync().catch(() => {});
      setupAutoAddNotificationChannel().catch(() => {});
    }

    floatAnim1.value = withRepeat(
      withTiming(1, { duration: 4500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    floatAnim2.value = withRepeat(
      withTiming(1, { duration: 5500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [checkStatus]);

  // Re-check automatically when user returns from Android Settings
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkStatus();
      }
    });
    return () => subscription.remove();
  }, [checkStatus]);

  const animatedBlob1 = useAnimatedStyle(() => ({
    transform: [
      { translateY: floatAnim1.value * 15 },
      { scale: 1 + floatAnim1.value * 0.08 },
    ],
  }));

  const animatedBlob2 = useAnimatedStyle(() => ({
    transform: [
      { translateY: floatAnim2.value * -18 },
      { scale: 1 + floatAnim2.value * 0.1 },
    ],
  }));

  // Immediate click -> directly open Android Settings
  const handleEnablePress = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    await openListenerSettings();
  };

  const handleDonePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onComplete();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Ambient Warm Golden Blobs */}
      <Animated.View style={[styles.ambientBlobTop, animatedBlob1]} />
      <Animated.View style={[styles.ambientBlobBottom, animatedBlob2]} />

      {/* Top Bar: Back & Skip */}
      <View style={styles.topBar}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}

        <TouchableOpacity
          onPress={onSkip}
          style={styles.skipButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Center Section: Everything inside 1 screen without scrolling */}
      <View style={styles.centerSection}>
        {/* 3D Illustration matching onboarding clay style */}
        <Animated.View
          entering={FadeIn.duration(450)}
          style={[
            styles.imageWrapper,
            {
              width: imageSize,
              height: imageSize,
              marginBottom: isCompact ? 10 : 18,
            },
          ]}
        >
          <Image
            source={require('@/assets/images/onboarding_auto_track_3d.png')}
            style={styles.illustration}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Text Section */}
        <Animated.View entering={FadeInDown.duration(450)} style={styles.textContainer}>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>
            Auto-Track <Text style={styles.titleHighlight}>Spends</Text>
          </Text>

          <Text style={[styles.description, isCompact && styles.descriptionCompact]}>
            Automatically record your UPI and bank payments the moment you pay. Zero manual entry, 100% private.
          </Text>

          {/* Clean Horizontal Trust Badges */}
          <View style={styles.trustRow}>
            <View style={styles.trustBadge}>
              <Ionicons name="flash" size={12} color="#D97706" style={{ marginRight: 4 }} />
              <Text style={styles.trustBadgeText}>Instant</Text>
            </View>
            <View style={styles.trustBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.trustBadgeText}>100% On-Device</Text>
            </View>
            <View style={styles.trustBadge}>
              <Ionicons name="lock-closed" size={12} color="#4F46E5" style={{ marginRight: 4 }} />
              <Text style={styles.trustBadgeText}>No OTP Access</Text>
            </View>
          </View>

          {/* Status feedback if already allowed */}
          {isEnabled && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.statusBadge}>
              <Ionicons name="checkmark-circle" size={15} color="#059669" style={{ marginRight: 5 }} />
              <Text style={styles.statusBadgeText}>Notification Access Enabled & Ready</Text>
            </Animated.View>
          )}

          {/* Subtle Google Play compliant note */}
          <Text style={[styles.complianceNote, isCompact && { marginTop: 4 }]}>
            Rupeo only reads financial alerts on this device.
          </Text>
        </Animated.View>
      </View>

      {/* Footer: Action Buttons (Always visible on screen) */}
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, isCompact ? 12 : 20) },
        ]}
      >
        {isEnabled ? (
          <TouchableOpacity
            style={[styles.button, styles.doneButton]}
            activeOpacity={0.85}
            onPress={handleDonePress}
          >
            <Text style={[styles.buttonText, styles.doneButtonText]}>Done · Continue</Text>
            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.button}
              activeOpacity={0.85}
              onPress={handleEnablePress}
            >
              <Ionicons name="flash" size={19} color="#0F172A" />
              <Text style={styles.buttonText}>Enable Auto-Tracking</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomSkipButton}
              activeOpacity={0.7}
              onPress={onSkip}
            >
              <Text style={styles.bottomSkipText}>I&apos;ll do this later</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEFCF7', // Warm ivory cream background matching onboarding
  },
  ambientBlobTop: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(254, 240, 138, 0.45)',
  },
  ambientBlobBottom: {
    position: 'absolute',
    bottom: 80,
    left: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(253, 224, 71, 0.25)',
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      },
    }),
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      },
    }),
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  imageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  titleCompact: {
    fontSize: 24,
    marginBottom: 4,
  },
  titleHighlight: {
    color: '#EAB308', // Vibrant warm gold accent matching onboarding
  },
  description: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  descriptionCompact: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      },
    }),
  },
  trustBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  complianceNote: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 12,
  },
  footer: {
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#FFCA28', // Warm rich golden yellow from onboarding
    height: 52,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.28)',
      },
    }),
  },
  buttonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  doneButton: {
    backgroundColor: '#10B981',
  },
  doneButtonText: {
    color: '#FFFFFF',
  },
  bottomSkipButton: {
    marginTop: 6,
    alignItems: 'center',
    paddingVertical: 6,
  },
  bottomSkipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
