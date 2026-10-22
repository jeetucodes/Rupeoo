import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  AppState,
  AppStateStatus,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
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
  resumeAutoAdd,
} from '@/lib/smsSettings';
import { resetImportHistory } from '@/lib/smsDedupe';
import { getPendingAlerts } from '@/lib/pendingInbox';
import {
  isListenerEnabled,
  openListenerSettings,
  requestIgnoreBatteryOptimizations,
  isBatteryOptimizationIgnored,
  openOEMAutoStartSettings,
  getDeviceManufacturer,
} from './nativeModule';
import { resetAutoAddDedupeHistory } from './dedupe';
import { clearSQLiteAutoAddData, setSQLiteSetting } from './sqliteStorage';

export default function AutoAddSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = user?.uid || 'local';

  const [settings, setSettings] = useState<SmsImportSettings>(DEFAULT_SMS_SETTINGS);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [listenerActive, setListenerActive] = useState<boolean>(false);
  const [batteryIgnored, setBatteryIgnored] = useState<boolean>(false);
  const [manufacturer, setManufacturer] = useState<string>('');

  // Modals
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [reliabilityModalVisible, setReliabilityModalVisible] = useState(false);

  // Check listener and battery permissions
  const checkStatus = useCallback(async () => {
    const enabled = await isListenerEnabled();
    setListenerActive(enabled);

    const ignored = await isBatteryOptimizationIgnored();
    setBatteryIgnored(ignored);

    const mfg = await getDeviceManufacturer();
    setManufacturer(mfg);
  }, []);

  // Initial load
  useEffect(() => {
    getSmsImportSettings(uid).then(setSettings).catch(() => {});
    getPendingAlerts(uid).then((alerts) => setPendingCount(alerts.length)).catch(() => {});
    checkStatus();
  }, [uid, checkStatus]);

  // Re-check when screen gains focus
  useFocusEffect(
    useCallback(() => {
      checkStatus();
      getPendingAlerts(uid).then((alerts) => setPendingCount(alerts.length)).catch(() => {});
    }, [uid, checkStatus])
  );

  // Re-check on AppState transition to active
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkStatus();
      }
    });
    return () => subscription.remove();
  }, [checkStatus]);

  // Setting updates
  const handleToggle = async (key: keyof SmsImportSettings, value: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    if (key === 'autoAddEnabled' && value === true) {
      await resumeAutoAdd();
    }

    const updated = await saveSmsImportSettings(uid, { [key]: value });
    setSettings(updated);

    // Sync to SQLite for fast background lookup
    try {
      setSQLiteSetting(`setting_${key}`, String(value));
    } catch { }

    if (key === 'saveOriginalInNote' && value === true) {
      Toast.show({
        type: 'info',
        text1: 'Note Sync Notice',
        text2: 'Transaction notes sync with your cloud backup.',
        visibilityTime: 3500,
      });
    }
  };

  // Reset history
  const handleResetHistory = async () => {
    setIsResetting(true);
    await resetImportHistory(uid);
    await resetAutoAddDedupeHistory();
    clearSQLiteAutoAddData();
    setIsResetting(false);
    setResetModalVisible(false);

    Toast.show({
      type: 'success',
      text1: 'Import History Reset',
      text2: 'Duplicate tracking and notification cache cleared.',
      visibilityTime: 3500,
    });
  };

  const hasOEMAutoStart = [
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
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
          <Text style={styles.headerTitle}>Auto-Add Transactions</Text>
          <Text style={styles.headerSubtitle}>
            Detects bank &amp; UPI alerts on your device. Nothing is uploaded.
          </Text>
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
            Rupeo listens to incoming bank and UPI notifications locally to record your spending automatically. OTPs, personal chats, and security alerts are strictly ignored.
          </Text>
        </View>

        {/* SECTION 1: DETECTION & AUTOMATION */}
        <SettingsSection title="Automation">
          {/* Master Toggle */}
          <SettingsRow
            icon="flash"
            iconBg="#ECFDF5"
            iconColor="#059669"
            label="Auto-add Transactions"
            subtitle="Save high-confidence (≥90%) bank &amp; UPI alerts directly"
            isSwitch
            switchValue={settings.autoAddEnabled}
            onSwitchChange={(val) => handleToggle('autoAddEnabled', val)}
          />

          {/* Review Before Adding Toggle */}
          <SettingsRow
            icon="eye"
            iconBg="#EFF6FF"
            iconColor="#2563EB"
            label="Review Before Adding"
            subtitle="Hold detected alerts in Pending Inbox for confirmation (overrides direct auto-add)"
            isSwitch
            switchValue={settings.reviewBeforeAdding}
            onSwitchChange={(val) => handleToggle('reviewBeforeAdding', val)}
          />

          {/* Pending Alerts Inbox */}
          <SettingsRow
            icon="mail-unread"
            iconBg="#FFFBEB"
            iconColor="#D97706"
            label="Pending Alerts Inbox"
            subtitle="Review pending transactions before adding"
            badge={pendingCount > 0 ? `${pendingCount} NEW` : undefined}
            badgeBg="#FEF3C7"
            badgeColor="#B45309"
            onPress={() => router.push('/pending-inbox')}
          />

          {/* Notification Access Status */}
          <SettingsRow
            icon="notifications"
            iconBg={listenerActive ? '#ECFDF5' : '#FEF2F2'}
            iconColor={listenerActive ? '#059669' : '#DC2626'}
            label="Notification Access Status"
            subtitle={
              listenerActive
                ? 'Active · Rupeo is listening for bank & UPI alerts'
                : 'Disabled · Tap to grant Notification Listener permission'
            }
            badge={listenerActive ? 'ENABLED' : 'DISABLED'}
            badgeBg={listenerActive ? '#D1FAE5' : '#FEE2E2'}
            badgeColor={listenerActive ? '#065F46' : '#991B1B'}
            onPress={openListenerSettings}
          />

          {/* Background Reliability Guide */}
          <SettingsRow
            icon="battery-charging"
            iconBg="#F0FDF4"
            iconColor="#16A34A"
            label="Background Reliability Guide"
            subtitle="Battery optimization &amp; OEM auto-start instructions"
            onPress={() => setReliabilityModalVisible(true)}
            isLast
          />
        </SettingsSection>

        {/* SECTION 2: PRIVACY & STORAGE */}
        <SettingsSection title="Privacy & Storage">
          <SettingsRow
            icon="lock-closed"
            iconBg="#FEF2F2"
            iconColor="#DC2626"
            label="Mask Account Numbers"
            subtitle="Show only last 4 digits (e.g. *1234) for privacy"
            isSwitch
            switchValue={settings.maskAccountNumbers}
            onSwitchChange={(val) => handleToggle('maskAccountNumbers', val)}
          />

          <SettingsRow
            icon="document-text"
            iconBg="#F5F3FF"
            iconColor="#7C3AED"
            label="Save Original Alert in Note"
            subtitle="Keep masked message body in transaction description"
            isSwitch
            switchValue={settings.saveOriginalInNote}
            onSwitchChange={(val) => handleToggle('saveOriginalInNote', val)}
            isLast
          />
        </SettingsSection>

        {/* SECTION 3: MAINTENANCE */}
        <SettingsSection title="Maintenance">
          <SettingsRow
            icon="chatbubbles"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
            label="Import from Messages (Clipboard / Paste)"
            subtitle="Paste message text or read from clipboard fallback"
            onPress={() => router.push('/sms-import')}
          />

          <SettingsRow
            icon="refresh"
            iconBg="#FEF2F2"
            iconColor="#DC2626"
            label="Reset Import History"
            subtitle="Clear duplicate tracking cache to re-detect past alerts"
            isDestructive
            onPress={() => setResetModalVisible(true)}
            isLast
          />
        </SettingsSection>
      </ScrollView>

      {/* Reset Confirmation Dialog */}
      <ConfirmDialogModal
        visible={resetModalVisible}
        onCancel={() => setResetModalVisible(false)}
        onConfirm={handleResetHistory}
        title="Reset Import History?"
        message="This clears the processed notification hashes, SQLite alert caches, and duplicate tracking keys. Subsequent notifications will be parsed fresh."
        confirmText="Reset History"
        type="danger"
        icon="refresh-outline"
        loading={isResetting}
      />

      {/* Background Reliability Guide Modal */}
      <Modal
        visible={reliabilityModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setReliabilityModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setReliabilityModalVisible(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.modalIconBg, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="shield-checkmark" size={20} color="#059669" />
                </View>
                <Text style={styles.modalTitle}>Background Reliability</Text>
              </View>
              <TouchableOpacity
                onPress={() => setReliabilityModalVisible(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={styles.modalDesc}>
                Android OEMs aggressively stop background services to conserve battery. Follow these two quick steps to ensure 100% reliable auto-tracking:
              </Text>

              {/* Action 1: Battery Optimization */}
              <View style={styles.guideStepCard}>
                <View style={styles.stepNumWrap}>
                  <Text style={styles.stepNumText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>Disable Battery Optimization</Text>
                  <Text style={styles.stepSub}>
                    Allow Rupeo to run in the background without Android putting it to sleep.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.guideActionBtn,
                      batteryIgnored && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                    ]}
                    onPress={async () => {
                      await requestIgnoreBatteryOptimizations();
                      setTimeout(checkStatus, 1500);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={batteryIgnored ? 'checkmark-circle' : 'flash-outline'}
                      size={16}
                      color={batteryIgnored ? '#059669' : '#0F172A'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.guideActionBtnText,
                        batteryIgnored && { color: '#059669' },
                      ]}
                    >
                      {batteryIgnored ? 'Optimization Ignored ✓' : 'Allow Unrestricted Battery'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Action 2: OEM Auto-Start (Shown for Xiaomi/Oppo/Vivo/Samsung/Huawei) */}
              {hasOEMAutoStart && (
                <View style={[styles.guideStepCard, { marginTop: 12 }]}>
                  <View style={styles.stepNumWrap}>
                    <Text style={styles.stepNumText}>2</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>
                      Enable Auto-Start ({manufacturer.toUpperCase()})
                    </Text>
                    <Text style={styles.stepSub}>
                      Turn ON Auto-Start for Rupeo in your phone settings to receive alerts when the app is closed.
                    </Text>
                    <TouchableOpacity
                      style={styles.guideActionBtn}
                      onPress={async () => {
                        await openOEMAutoStartSettings();
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="open-outline"
                        size={16}
                        color="#0F172A"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.guideActionBtnText}>Open Auto-Start Settings</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Restricted Settings Help */}
              <View style={styles.restrictedHelpCard}>
                <Ionicons name="information-circle-outline" size={18} color="#475569" style={{ marginRight: 8 }} />
                <Text style={styles.restrictedHelpText}>
                  Seeing a &quot;Restricted setting&quot; warning? Go to Phone Settings &gt; Apps &gt; Rupeo &gt; Tap the top-right 3 dots &gt; Tap &quot;Allow restricted settings&quot;.
                </Text>
              </View>
            </ScrollView>
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
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 16,
  },
  guideStepCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  stepNumWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  stepSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 10,
  },
  guideActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD740',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F59E0B',
    alignSelf: 'flex-start',
  },
  guideActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  restrictedHelpCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  restrictedHelpText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
});
