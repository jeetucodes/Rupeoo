/**
 * Onboarding Step: "Auto-track your spending"
 *
 * Implements Google Play compliant prominent disclosure before prompting
 * for Android Notification Listener permission.
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
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { isListenerEnabled, openListenerSettings } from './nativeModule';
import { setupAutoAddNotificationChannel } from './notifTask';
import { log } from '@/lib/logger';

interface OnboardingPermissionStepProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function OnboardingPermissionStep({
  onComplete,
  onSkip,
}: OnboardingPermissionStepProps) {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [hasPrompted, setHasPrompted] = useState<boolean>(false);
  const [showDisclosureModal, setShowDisclosureModal] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  // Check listener status
  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    const enabled = await isListenerEnabled();
    setIsEnabled(enabled);
    setIsChecking(false);

    if (enabled) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch { }
    }
  }, []);

  useEffect(() => {
    checkStatus();
    // Request Android 13+ POST_NOTIFICATIONS and setup notification channel
    if (Platform.OS === 'android') {
      Notifications.requestPermissionsAsync().catch(() => {});
      setupAutoAddNotificationChannel().catch(() => {});
    }
  }, [checkStatus]);

  // Re-check status when user returns from Android Settings
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkStatus();
      }
    });
    return () => subscription.remove();
  }, [checkStatus]);

  // Action: Open system settings after prominent disclosure
  const handleEnablePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }
    setShowDisclosureModal(true);
  };

  const handleConfirmDisclosure = async () => {
    setShowDisclosureModal(false);
    setHasPrompted(true);
    await openListenerSettings();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Badge */}
        <View style={styles.badgeWrap}>
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={13} color="#4F46E5" style={{ marginRight: 5 }} />
            <Text style={styles.badgeText}>SMART DETECTION</Text>
          </View>
        </View>

        {/* Hero Icon */}
        <View style={styles.iconCircle}>
          <Ionicons
            name={isEnabled ? 'shield-checkmark' : 'notifications'}
            size={40}
            color={isEnabled ? '#059669' : '#0F172A'}
          />
        </View>

        {/* Title & Subtitle */}
        <Text style={styles.title}>Auto-track your spending</Text>
        <Text style={styles.subtitle}>
          Rupeo reads bank &amp; UPI notifications on your phone to add expenses automatically without typing.
        </Text>

        {/* Success State */}
        {isEnabled ? (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={28} color="#059669" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.successTitle}>Auto-tracking is Active!</Text>
              <Text style={styles.successDesc}>
                Your transactions will be detected and recorded securely on your device.
              </Text>
            </View>
          </View>
        ) : (
          /* Privacy & Feature Guarantees Card */
          <View style={styles.benefitsCard}>
            <View style={styles.benefitRow}>
              <View style={[styles.benefitIconBg, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="shield-checkmark" size={18} color="#059669" />
              </View>
              <View style={styles.benefitTextWrap}>
                <Text style={styles.benefitTitle}>Only Bank &amp; UPI Alerts</Text>
                <Text style={styles.benefitDesc}>
                  Only notifications from verified banking and UPI apps (GPay, PhonePe, Paytm, etc.) are processed.
                </Text>
              </View>
            </View>

            <View style={styles.benefitDivider} />

            <View style={styles.benefitRow}>
              <View style={[styles.benefitIconBg, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="close-circle" size={18} color="#DC2626" />
              </View>
              <View style={styles.benefitTextWrap}>
                <Text style={styles.benefitTitle}>OTP &amp; Personal Messages Ignored</Text>
                <Text style={styles.benefitDesc}>
                  Security codes, passwords, promotional spam, and private chats are strictly dropped on-device.
                </Text>
              </View>
            </View>

            <View style={styles.benefitDivider} />

            <View style={styles.benefitRow}>
              <View style={[styles.benefitIconBg, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="lock-closed" size={18} color="#2563EB" />
              </View>
              <View style={styles.benefitTextWrap}>
                <Text style={styles.benefitTitle}>100% On-Device &amp; Private</Text>
                <Text style={styles.benefitDesc}>
                  Zero notification data ever leaves your phone or gets uploaded to external servers.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Returned from settings but still not enabled hint */}
        {!isEnabled && hasPrompted && (
          <View style={styles.helpHintCard}>
            <Text style={styles.helpHintTitle}>Steps to enable:</Text>
            <Text style={styles.helpHintStep}>1. Find &quot;Rupeo&quot; in the Notification Access list.</Text>
            <Text style={styles.helpHintStep}>2. Turn the toggle ON and tap Allow.</Text>
            <Text style={styles.helpHintNote}>
              ⚠️ Restricted setting warning? Go to Phone Settings &gt; Apps &gt; Rupeo &gt; 3 dots (top right) &gt; &quot;Allow restricted settings&quot;.
            </Text>
          </View>
        )}

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          {isEnabled ? (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#10B981', borderColor: '#059669' }]}
              onPress={onComplete}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>Continue to Dashboard</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleEnablePress}
                activeOpacity={0.85}
              >
                <Ionicons name="flash" size={19} color="#0F172A" />
                <Text style={styles.primaryButtonText}>Enable Auto-Tracking</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipButton}
                onPress={onSkip}
                activeOpacity={0.7}
              >
                <Text style={styles.skipButtonText}>Skip for now</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {/* Prominent Disclosure Modal (Google Play Requirement) */}
      <Modal
        visible={showDisclosureModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDisclosureModal(false)}
      >
        <View style={styles.disclosureOverlay}>
          <View style={styles.disclosureCard}>
            <View style={styles.disclosureIconWrap}>
              <Ionicons name="shield-checkmark" size={32} color="#4F46E5" />
            </View>

            <Text style={styles.disclosureTitle}>Prominent Disclosure: Notification Access</Text>

            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.disclosureBody}>
                Rupeo requires <Text style={{ fontWeight: '700' }}>Notification Listener access</Text> to automatically detect and log your bank and UPI transactions.
                {'\n\n'}
                • <Text style={{ fontWeight: '600' }}>What we read:</Text> Only transaction notifications from banking and payment apps (Google Pay, PhonePe, Paytm, and Indian banks).
                {'\n'}
                • <Text style={{ fontWeight: '600' }}>What we ignore:</Text> OTPs, two-factor authentication codes, passwords, and personal chats are strictly filtered out on your device.
                {'\n'}
                • <Text style={{ fontWeight: '600' }}>Your privacy:</Text> All processing occurs 100% locally on your phone. Notification text is never transmitted or uploaded.
              </Text>
            </ScrollView>

            <View style={styles.disclosureBtnRow}>
              <TouchableOpacity
                style={styles.disclosureCancelBtn}
                onPress={() => setShowDisclosureModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.disclosureCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.disclosureAgreeBtn}
                onPress={handleConfirmDisclosure}
                activeOpacity={0.85}
              >
                <Text style={styles.disclosureAgreeText}>Agree &amp; Open Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  badgeWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  badgeText: {
    color: '#4F46E5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  iconCircle: {
    alignSelf: 'center',
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: '#FFD740',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  benefitsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  benefitIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  benefitTextWrap: {
    flex: 1,
  },
  benefitTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  benefitDesc: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  benefitDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 2,
  },
  successDesc: {
    fontSize: 12,
    color: '#047857',
    lineHeight: 17,
  },
  helpHintCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 20,
  },
  helpHintTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  helpHintStep: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
    marginBottom: 2,
  },
  helpHintNote: {
    fontSize: 11,
    color: '#B45309',
    lineHeight: 16,
    marginTop: 6,
    fontWeight: '500',
  },
  buttonContainer: {
    marginTop: 8,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFD740',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  skipButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  disclosureOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  disclosureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    maxWidth: 420,
    width: '100%',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
  },
  disclosureIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  disclosureTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
  },
  disclosureBody: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
  },
  disclosureBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
  },
  disclosureCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  disclosureCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  disclosureAgreeBtn: {
    flex: 1.5,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
  },
  disclosureAgreeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
