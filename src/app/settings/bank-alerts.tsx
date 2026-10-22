import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';
import {
  getSmsImportSettings,
  saveSmsImportSettings,
  SmsImportSettings,
  DEFAULT_SMS_SETTINGS,
  addCustomBank,
  removeCustomBank,
} from '@/lib/smsSettings';
import { resetImportHistory } from '@/lib/smsDedupe';
import { getPendingAlerts } from '@/lib/pendingInbox';
import { isSmsInboxSupported } from '@/lib/smsReader';

export default function BankAlertsSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [smsSettings, setSmsSettings] = useState<SmsImportSettings>(DEFAULT_SMS_SETTINGS);
  const [pendingAlertCount, setPendingAlertCount] = useState<number>(0);
  const [resetHistoryModalVisible, setResetHistoryModalVisible] = useState(false);
  const [isResettingHistory, setIsResettingHistory] = useState(false);

  // Custom bank modal
  const [customBankModalVisible, setCustomBankModalVisible] = useState(false);
  const [customBankInput, setCustomBankInput] = useState('');

  const uid = user?.uid || 'local';

  useEffect(() => {
    getSmsImportSettings(uid).then(setSmsSettings).catch(() => {});
    getPendingAlerts(uid).then((alerts) => setPendingAlertCount(alerts.length)).catch(() => {});
  }, [uid]);

  const handleUpdateSetting = async (key: keyof SmsImportSettings, value: any) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    const updated = await saveSmsImportSettings(uid, { [key]: value });
    setSmsSettings(updated);

    if (key === 'saveOriginalInNote' && value === true) {
      Toast.show({
        type: 'info',
        text1: 'Note Sync Notice',
        text2: 'Transaction notes sync to the cloud with your account.',
        visibilityTime: 4000,
      });
    }
  };

  const handleResetHistory = async () => {
    setIsResettingHistory(true);
    await resetImportHistory(uid);
    setIsResettingHistory(false);
    setResetHistoryModalVisible(false);
    Toast.show({
      type: 'success',
      text1: 'Import History Reset',
      text2: 'Duplicate tracking and cursors have been cleared.',
      visibilityTime: 3500,
    });
  };

  const handleAddCustomBank = async () => {
    const trimmed = customBankInput.trim().toUpperCase();
    if (!trimmed) return;
    const updated = await addCustomBank(uid, trimmed);
    setSmsSettings(updated);
    setCustomBankInput('');
    Toast.show({
      type: 'success',
      text1: 'Bank Added',
      text2: `Added ${trimmed} to recognized senders.`,
    });
  };

  const handleRemoveCustomBank = async (bankName: string) => {
    const updated = await removeCustomBank(uid, bankName);
    setSmsSettings(updated);
    Toast.show({
      type: 'info',
      text1: 'Bank Removed',
      text2: `Removed ${bankName}.`,
    });
  };

  const isDirectSms = isSmsInboxSupported();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Sub-Screen Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Bank Messages & Auto-Add</Text>
          <Text style={styles.headerSubtitle}>Pure on-device bank & UPI detection</Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="shield-checkmark" size={13} color="#10B981" style={{ marginRight: 4 }} />
          <Text style={styles.headerBadgeText}>LOCAL</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Info */}
        <View style={styles.infoBanner}>
          <Ionicons name="sparkles" size={18} color="#4F46E5" style={{ marginRight: 10 }} />
          <Text style={styles.infoBannerText}>
            Detects bank, card, and UPI alert SMS on your device. Zero sensitive information is ever shared or uploaded.
          </Text>
        </View>

        {/* SECTION 1: DETECTION */}
        <SettingsSection title="Detection">
          <SettingsRow
            icon="flash"
            iconBg="#ECFDF5"
            iconColor="#059669"
            label="Auto-add Transactions"
            subtitle="Automatically record high-confidence (≥90%) bank alerts"
            isSwitch
            switchValue={smsSettings.autoAddEnabled}
            onSwitchChange={(val) => handleUpdateSetting('autoAddEnabled', val)}
          />
          <SettingsRow
            icon="eye"
            iconBg="#EFF6FF"
            iconColor="#2563EB"
            label="Review Before Adding"
            subtitle="Hold detected alerts in Pending Inbox for manual confirmation"
            isSwitch
            switchValue={smsSettings.reviewBeforeAdding}
            onSwitchChange={(val) => handleUpdateSetting('reviewBeforeAdding', val)}
          />
          <SettingsRow
            icon="mail-unread"
            iconBg="#FFFBEB"
            iconColor="#D97706"
            label="Pending Alerts Inbox"
            subtitle="Review pending transactions before adding"
            badge={pendingAlertCount > 0 ? `${pendingAlertCount} NEW` : undefined}
            badgeBg="#FEF3C7"
            badgeColor="#B45309"
            onPress={() => router.push('/pending-inbox')}
          />
          <SettingsRow
            icon="chatbubbles"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
            label="Import from Messages"
            subtitle={isDirectSms ? "One-tap scan of bank messages from inbox" : "Read alerts from clipboard or paste text"}
            badge="ONE-TAP"
            onPress={() => router.push('/sms-import')}
            isLast
          />
        </SettingsSection>

        {/* SECTION 2: PRIVACY */}
        <SettingsSection title="Privacy & Storage">
          <SettingsRow
            icon="lock-closed"
            iconBg="#FEF2F2"
            iconColor="#DC2626"
            label="Mask Account Numbers"
            subtitle="Show only last 4 digits (e.g. *1234) for privacy"
            isSwitch
            switchValue={smsSettings.maskAccountNumbers}
            onSwitchChange={(val) => handleUpdateSetting('maskAccountNumbers', val)}
          />
          <SettingsRow
            icon="document-text"
            iconBg="#F5F3FF"
            iconColor="#7C3AED"
            label="Save Original Alert in Note"
            subtitle="Keep masked message body in transaction description"
            isSwitch
            switchValue={smsSettings.saveOriginalInNote}
            onSwitchChange={(val) => handleUpdateSetting('saveOriginalInNote', val)}
            isLast
          />
        </SettingsSection>

        {/* SECTION 3: BANK SENDERS & TOOLS */}
        <SettingsSection title="Senders & Tools">
          <SettingsRow
            icon="globe-outline"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
            label="Bank Senders & International"
            subtitle={
              smsSettings.customBanks?.length
                ? `${smsSettings.customBanks.length} custom banks added • 75+ Indian Banks active`
                : '75+ Indian Banks pre-configured • Add custom banks'
            }
            value={smsSettings.customBanks?.length ? `${smsSettings.customBanks.length} Custom` : '75+ Banks'}
            onPress={() => setCustomBankModalVisible(true)}
          />
          <SettingsRow
            icon="battery-charging"
            iconBg="#F0FDF4"
            iconColor="#16A34A"
            label="Background Reliability Guide"
            subtitle="Ensure MIUI/Oppo/Vivo/Samsung doesn't kill background alerts"
            onPress={() => {
              if (Platform.OS === 'android') {
                Linking.openSettings().catch(() => {});
              } else {
                Toast.show({ type: 'info', text1: 'Android Only', text2: 'Background alert detection is supported on Android.' });
              }
            }}
          />
          <SettingsRow
            icon="refresh"
            iconBg="#FEF2F2"
            iconColor="#DC2626"
            label="Reset Import History"
            subtitle="Clear duplicate tracking cache to allow fresh re-imports"
            isDestructive
            onPress={() => setResetHistoryModalVisible(true)}
            isLast
          />
        </SettingsSection>
      </ScrollView>

      {/* Reset History Modal */}
      <ConfirmDialogModal
        visible={resetHistoryModalVisible}
        onCancel={() => setResetHistoryModalVisible(false)}
        onConfirm={handleResetHistory}
        title="Reset Import History?"
        message="This clears the processed SMS hashes and import timestamps. Next time you scan, past messages will be re-evaluated as new alerts."
        confirmText="Reset History"
        type="danger"
        icon="refresh-outline"
        loading={isResettingHistory}
      />

      {/* Custom Banks Modal */}
      {customBankModalVisible && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setCustomBankModalVisible(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.modalIconBg}>
                  <Ionicons name="globe-outline" size={20} color="#4F46E5" />
                </View>
                <Text style={styles.modalTitle}>Bank Senders & Custom</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCustomBankModalVisible(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSub}>
                Rupeo automatically recognizes 75+ Indian banks (HDFC, SBI, ICICI, Axis, PNB, Kotak, BOB, etc.) and international currencies (USD, GBP, EUR, AED, CAD, AUD).
              </Text>

              <Text style={styles.modalFieldLabel}>ADD CUSTOM BANK OR WALLET CODE</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.bankInput}
                  value={customBankInput}
                  onChangeText={setCustomBankInput}
                  placeholder="e.g. CHASE, REVOLUT, MONZO"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.addBankBtn, !customBankInput.trim() && styles.btnDisabled]}
                  onPress={handleAddCustomBank}
                  disabled={!customBankInput.trim()}
                >
                  <Text style={styles.addBankBtnText}>Add</Text>
                </TouchableOpacity>
              </View>

              {smsSettings.customBanks && smsSettings.customBanks.length > 0 && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.modalFieldLabel}>CUSTOM ADDED BANKS</Text>
                  <View style={styles.tagWrap}>
                    {smsSettings.customBanks.map((b) => (
                      <View key={b} style={styles.tagPill}>
                        <Text style={styles.tagText}>{b}</Text>
                        <TouchableOpacity
                          onPress={() => handleRemoveCustomBank(b)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${b}`}
                        >
                          <Ionicons name="close-circle" size={16} color="#DC2626" style={{ marginLeft: 5 }} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.preConfiguredBox}>
                <Ionicons name="checkmark-done-circle" size={18} color="#059669" style={{ marginRight: 8 }} />
                <Text style={styles.preConfiguredText}>
                  75+ Indian Banks, Payments Banks & SFBs are pre-configured by default.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#3730A3',
    lineHeight: 18,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 16,
  },
  modalFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bankInput: {
    flex: 1,
    height: 46,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  addBankBtn: {
    height: 46,
    paddingHorizontal: 18,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBankBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  tagText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  preConfiguredBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 12,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  preConfiguredText: {
    flex: 1,
    fontSize: 12,
    color: '#15803D',
    lineHeight: 17,
  },
});
