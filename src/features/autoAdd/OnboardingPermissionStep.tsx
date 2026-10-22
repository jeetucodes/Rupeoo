/**
 * Onboarding Step: "Auto-Add Transactions"
 *
 * Provides complete instructions on how automatic transaction detection works:
 * - Direct auto-adding (no pending inbox delay)
 * - Added notification alert
 * - Clean original message saved in notes (no google.android clutter)
 * - 100% on-device privacy guarantees
 * - Step-by-step notification access setup instructions
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
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
  const [hasPrompted, setHasPrompted] = useState<boolean>(false);
  const [showDisclosureModal, setShowDisclosureModal] = useState<boolean>(false);

  // Check listener status
  const checkStatus = useCallback(async () => {
    const enabled = await isListenerEnabled();
    setIsEnabled(enabled);

    if (enabled) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch { }
    }
  }, []);

  useEffect(() => {
    checkStatus();
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
      {/* Top Bar with optional Back and Skip */}
      <View style={styles.topNav}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.navIconButton}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}

        <View style={styles.badge}>
          <Ionicons name="flash" size={13} color="#D97706" style={{ marginRight: 4 }} />
          <Text style={styles.badgeText}>AUTO-ADD PAYMENTS</Text>
        </View>

        <TouchableOpacity
          onPress={onSkip}
          style={styles.skipButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={[styles.iconCircle, isEnabled && styles.iconCircleActive]}>
            <Ionicons
              name={isEnabled ? 'shield-checkmark' : 'sparkles'}
              size={36}
              color={isEnabled ? '#059669' : '#0F172A'}
            />
          </View>

          <Text style={styles.title}>Auto-Add Transactions</Text>
          <Text style={styles.subtitle}>
            Jab bhi aap UPI (GPay, PhonePe, Paytm) ya Bank se payment karenge, Rupeo bina app khole automatically aapka kharcha add kar lega.
          </Text>
        </View>

        {/* Live Visual Mockup Preview Card */}
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Ionicons name="phone-portrait-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={styles.previewHeaderText}>HOW IT LOOKS ON YOUR PHONE</Text>
          </View>

          {/* Simulated Android Notification */}
          <View style={styles.mockNotifBox}>
            <View style={styles.mockNotifTop}>
              <View style={styles.mockRupeoLogo}>
                <Ionicons name="wallet" size={14} color="#0F172A" />
              </View>
              <Text style={styles.mockNotifAppName}>Rupeo • just now</Text>
            </View>
            <Text style={styles.mockNotifTitle}>Transaction Added ✅</Text>
            <Text style={styles.mockNotifBody}>
              ₹450 debited at Zomato (••4589) • Added to Rupeo
            </Text>
          </View>

          {/* Simulated Note Preview */}
          <View style={styles.mockNoteBox}>
            <View style={styles.mockNoteTag}>
              <Ionicons name="document-text-outline" size={13} color="#4F46E5" style={{ marginRight: 4 }} />
              <Text style={styles.mockNoteTagText}>Saved in Transaction Note:</Text>
            </View>
            <Text style={styles.mockNoteHeading}>Original Message:</Text>
            <Text style={styles.mockNoteBody}>
              Sent Rs. 450.00 from HDFC Bank A/C **4589 to ZOMATO on 22-OCT-26 via UPI Ref 629584729104.
            </Text>
          </View>

          <View style={styles.previewFooterPill}>
            <Ionicons name="checkmark-done" size={14} color="#059669" style={{ marginRight: 5 }} />
            <Text style={styles.previewFooterText}>Clean notes · No google.android or package clutter</Text>
          </View>
        </View>

        {/* Status Card (Active State) */}
        {isEnabled ? (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={26} color="#059669" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.successTitle}>Auto-Add is Enabled &amp; Ready!</Text>
              <Text style={styles.successDesc}>
                Your future UPI and bank payments will now be added directly to your expenses.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Detailed Instructions & Benefits Section */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsHeading}>✨ Kaise Kaam Karta Hai (Instructions):</Text>

          {/* Point 1: Direct Auto-Add */}
          <View style={styles.instructionRow}>
            <View style={[styles.stepIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="flash" size={17} color="#059669" />
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>1. Direct Add (No Inbox Waiting)</Text>
              <Text style={styles.stepDesc}>
                Payment hote hi transaction seedha add ho jayega. Pending Alerts Inbox mein rukna nahi padega.
              </Text>
            </View>
          </View>

          {/* Point 2: Added Notification */}
          <View style={styles.instructionRow}>
            <View style={[styles.stepIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="notifications" size={17} color="#2563EB" />
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>2. Instant Added Notification</Text>
              <Text style={styles.stepDesc}>
                Jaise hi payment record hogi, phone par &quot;Transaction Added ✅&quot; ka confirmation notification aayega.
              </Text>
            </View>
          </View>

          {/* Point 3: Clean Notes */}
          <View style={styles.instructionRow}>
            <View style={[styles.stepIconWrap, { backgroundColor: '#F5F3FF' }]}>
              <Ionicons name="document-text" size={17} color="#7C3AED" />
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>3. Clean Original Message in Note</Text>
              <Text style={styles.stepDesc}>
                Note mein bina kisi &quot;google.android&quot; ya system line ke sirf Original Message acche se save hoga.
              </Text>
            </View>
          </View>

          {/* Point 4: 100% Privacy & Security */}
          <View style={styles.instructionRow}>
            <View style={[styles.stepIconWrap, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="shield-checkmark" size={17} color="#DC2626" />
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>4. 100% Safe, On-Device &amp; Private</Text>
              <Text style={styles.stepDesc}>
                OTPs, passwords aur personal chats strictly drop kiye jate hain. Koi bank login ya password nahi chahiye.
              </Text>
            </View>
          </View>
        </View>

        {/* How to Enable Instructions Card (if not yet enabled) */}
        {!isEnabled && (
          <View style={styles.helpHintCard}>
            <View style={styles.helpHintHeader}>
              <Ionicons name="settings-outline" size={16} color="#B45309" style={{ marginRight: 6 }} />
              <Text style={styles.helpHintTitle}>How to Enable in Android:</Text>
            </View>
            <Text style={styles.helpHintStep}>1. Niche &quot;Enable Auto-Tracking&quot; button dabayein.</Text>
            <Text style={styles.helpHintStep}>2. Notification Access list mein &quot;Rupeo&quot; ko dhundh kar toggle ON karein.</Text>
            <Text style={styles.helpHintStep}>3. &quot;Allow&quot; par tap karein.</Text>

            <View style={styles.restrictedWarningBox}>
              <Text style={styles.restrictedWarningText}>
                ⚠️ <Text style={{ fontWeight: '700' }}>Xiaomi / Vivo / Realme / Samsung users:</Text> Agar &quot;Restricted setting&quot; ka notice aaye to: Phone Settings &gt; Apps &gt; Rupeo &gt; Top 3-dots &gt; &quot;Allow restricted settings&quot; karein.
              </Text>
            </View>
          </View>
        )}

        {/* Action Buttons */}
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
                style={styles.skipBottomButton}
                onPress={onSkip}
                activeOpacity={0.7}
              >
                <Text style={styles.skipBottomButtonText}>Skip for now (I&apos;ll do it later)</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {/* Prominent Disclosure Modal (Google Play Policy Compliance) */}
      <Modal
        visible={showDisclosureModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDisclosureModal(false)}
      >
        <View style={styles.disclosureOverlay}>
          <View style={styles.disclosureCard}>
            <View style={styles.disclosureIconWrap}>
              <Ionicons name="shield-checkmark" size={30} color="#4F46E5" />
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
  topNav: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  navIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  skipButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  skipText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#FFD740',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  iconCircleActive: {
    backgroundColor: '#D1FAE5',
    shadowColor: '#10B981',
  },
  title: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginVertical: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  mockNotifBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  mockNotifTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  mockRupeoLogo: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: '#FFD740',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  mockNotifAppName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  mockNotifTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  mockNotifBody: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  mockNoteBox: {
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    padding: 12,
    marginBottom: 10,
  },
  mockNoteTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  mockNoteTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  mockNoteHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E1B4B',
    marginBottom: 2,
  },
  mockNoteBody: {
    fontSize: 12,
    color: '#4338CA',
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  previewFooterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  previewFooterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  instructionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
  },
  instructionsHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  stepIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 14,
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
    marginBottom: 16,
  },
  helpHintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  helpHintTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  helpHintStep: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
    marginBottom: 2,
    fontWeight: '500',
  },
  restrictedWarningBox: {
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  restrictedWarningText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
  buttonContainer: {
    marginTop: 4,
  },
  primaryButton: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFD740',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
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
  skipBottomButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  skipBottomButtonText: {
    color: '#64748B',
    fontSize: 13,
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
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  disclosureTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
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
    marginTop: 18,
  },
  disclosureCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  disclosureCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  disclosureAgreeBtn: {
    flex: 1.5,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
  },
  disclosureAgreeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
