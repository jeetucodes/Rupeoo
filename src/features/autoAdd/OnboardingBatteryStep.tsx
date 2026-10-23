import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import {
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
  openOEMAutoStartSettings,
  getDeviceManufacturer,
} from './nativeModule';

export interface OnboardingBatteryStepProps {
  onComplete: () => void;
  onSkip: () => void;
  onBack?: () => void;
}

export const BATTERY_STEP_SKIPPED_KEY = '@rupeo_battery_step_skipped';

export default function OnboardingBatteryStep({
  onComplete,
  onSkip,
  onBack,
}: OnboardingBatteryStepProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const isCompact = height < 750;

  const [isIgnored, setIsIgnored] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [manufacturer, setManufacturer] = useState('unknown');

  // Ambient blobs animation
  const floatAnim1 = useSharedValue(0);
  const floatAnim2 = useSharedValue(0);

  useEffect(() => {
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

    getDeviceManufacturer().then(setManufacturer).catch(() => {});

    return () => {
      cancelAnimation(floatAnim1);
      cancelAnimation(floatAnim2);
    };
  }, []);

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

  // Check battery status
  const checkBatteryStatus = useCallback(async () => {
    const ignored = await isIgnoringBatteryOptimizations();
    if (ignored && !isIgnored) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch { }
    }
    setIsIgnored(ignored);
  }, [isIgnored]);

  useEffect(() => {
    checkBatteryStatus();
  }, [checkBatteryStatus]);

  // Re-check when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        checkBatteryStatus();
      }
    });
    return () => sub.remove();
  }, [checkBatteryStatus]);

  const handleAllowBattery = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    setHasAttempted(true);
    await requestIgnoreBatteryOptimizations();
  };

  const handleOpenAutoStart = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    await openOEMAutoStartSettings();
  };

  const handleSkipPress = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    await AsyncStorage.setItem(BATTERY_STEP_SKIPPED_KEY, 'true');
    onSkip();
  };

  const handleDonePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    onComplete();
  };

  const isOemDevice = [
    'xiaomi',
    'redmi',
    'poco',
    'oppo',
    'realme',
    'oneplus',
    'vivo',
    'iqoo',
    'huawei',
    'honor',
    'samsung',
  ].some((brand) => manufacturer.includes(brand));

  const iconContainerSize = isCompact ? 130 : 170;

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
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}

        <TouchableOpacity
          onPress={handleSkipPress}
          style={styles.skipButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Skip battery optimization step"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Center Section: 1 Screen No Scroll */}
      <View style={styles.centerSection}>
        {/* 3D Visual Art / Battery Shield Graphic */}
        <Animated.View
          entering={FadeIn.duration(450)}
          style={[
            styles.imageWrapper,
            {
              width: iconContainerSize,
              height: iconContainerSize,
              marginBottom: isCompact ? 12 : 20,
            },
          ]}
        >
          <View style={styles.iconCircleOuter}>
            <View style={styles.iconCircleMiddle}>
              <View style={[styles.iconCircleInner, isIgnored && styles.iconCircleInnerSuccess]}>
                <Ionicons
                  name={isIgnored ? 'checkmark-circle' : 'battery-charging'}
                  size={isCompact ? 56 : 74}
                  color={isIgnored ? '#059669' : '#D97706'}
                />
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Text Section */}
        <Animated.View entering={FadeInDown.duration(450)} style={styles.textContainer}>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>
            Stay <Text style={styles.titleHighlight}>Always On</Text>
          </Text>

          <Text style={[styles.description, isCompact && styles.descriptionCompact]}>
            Allow background activity so Rupeo never misses a payment, even when the app is closed.
          </Text>

          {/* Clean Trust Badges */}
          <View style={styles.trustRow}>
            <View style={styles.trustBadge}>
              <Ionicons name="leaf" size={12} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.trustBadgeText}>Zero Battery Drain</Text>
            </View>
            <View style={styles.trustBadge}>
              <Ionicons name="lock-closed" size={12} color="#4F46E5" style={{ marginRight: 4 }} />
              <Text style={styles.trustBadgeText}>100% On-Device</Text>
            </View>
            <View style={styles.trustBadge}>
              <Ionicons name="flash" size={12} color="#D97706" style={{ marginRight: 4 }} />
              <Text style={styles.trustBadgeText}>Instant Capture</Text>
            </View>
          </View>

          {/* Status Feedback */}
          {isIgnored ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.statusBadgeSuccess}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" style={{ marginRight: 6 }} />
              <Text style={styles.statusBadgeSuccessText}>You're all set! Background activity enabled.</Text>
            </Animated.View>
          ) : hasAttempted ? (
            <Text style={styles.instructionNote}>
              Choose <Text style={{ fontWeight: '700' }}>Allow</Text> in the system popup.
            </Text>
          ) : null}
        </Animated.View>
      </View>

      {/* Footer: Action Buttons */}
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, isCompact ? 12 : 20) },
        ]}
      >
        {isIgnored ? (
          <TouchableOpacity
            style={[styles.button, styles.doneButton]}
            activeOpacity={0.85}
            onPress={handleDonePress}
          >
            <Text style={[styles.buttonText, styles.doneButtonText]}>Continue</Text>
            <Ionicons name="arrow-forward" size={19} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              activeOpacity={0.85}
              onPress={handleAllowBattery}
            >
              <Ionicons name="battery-charging" size={19} color="#000000" style={{ marginRight: 6 }} />
              <Text style={styles.buttonText}>
                {hasAttempted ? 'Try Again' : 'Allow Background Activity'}
              </Text>
            </TouchableOpacity>

            {/* OEM Auto-Start Button for Xiaomi/Samsung/OnePlus/Oppo/Vivo */}
            {isOemDevice && (
              <TouchableOpacity
                style={[styles.button, styles.oemButton]}
                activeOpacity={0.8}
                onPress={handleOpenAutoStart}
              >
                <Ionicons name="refresh-circle-outline" size={19} color="#334155" style={{ marginRight: 6 }} />
                <Text style={styles.oemButtonText}>Enable Auto-Start ({manufacturer})</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.skipBottomButton}
              activeOpacity={0.7}
              onPress={handleSkipPress}
            >
              <Text style={styles.skipBottomText}>Skip for now</Text>
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
    backgroundColor: '#FEFCF7',
  },
  ambientBlobTop: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(254, 240, 138, 0.45)',
  },
  ambientBlobBottom: {
    position: 'absolute',
    bottom: 40,
    left: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(253, 230, 138, 0.35)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    zIndex: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
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
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
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
        shadowRadius: 2,
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
  iconCircleOuter: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
    backgroundColor: 'rgba(254, 243, 199, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  iconCircleMiddle: {
    width: '100%',
    height: '100%',
    borderRadius: 90,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  iconCircleInner: {
    width: '100%',
    height: '100%',
    borderRadius: 80,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCD34D',
    ...Platform.select({
      ios: {
        shadowColor: '#D97706',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(217,119,6,0.12)',
      },
    }),
  },
  iconCircleInnerSuccess: {
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
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
    color: '#EAB308',
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
    marginBottom: 12,
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
  statusBadgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 4,
  },
  statusBadgeSuccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  instructionNote: {
    fontSize: 12,
    fontWeight: '500',
    color: '#D97706',
    marginTop: 4,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    gap: 10,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  button: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.2,
  },
  primaryButton: {
    backgroundColor: '#FACC15',
    ...Platform.select({
      ios: {
        shadowColor: '#CA8A04',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(202,138,4,0.25)',
      },
    }),
  },
  doneButton: {
    backgroundColor: '#059669',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 4px 12px rgba(5,150,105,0.25)',
      },
    }),
  },
  doneButtonText: {
    color: '#FFFFFF',
  },
  oemButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingVertical: 12,
  },
  oemButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#334155',
  },
  skipBottomButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  skipBottomText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
});
