import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  Switch,
  AppState,
  AppStateStatus,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Toast from 'react-native-toast-message';

import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  getNotificationSettings,
  saveNotificationSettings,
  setMasterNotificationsEnabled,
  scheduleNext48h,
  sendSampleNotification,
  resolveNotificationMessage,
  NotificationLanguage,
  NotificationSettings,
  requestNotificationPermissions,
} from '@/features/notifications';

function parseTime24hToDate(timeStr: string = '22:00'): Date {
  const [hStr, mStr] = timeStr.split(':');
  const d = new Date();
  d.setHours(parseInt(hStr || '22', 10), parseInt(mStr || '0', 10), 0, 0);
  return d;
}

function formatDateToTime24h(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

function formatTime12hDisplay(timeStr: string = '22:00'): string {
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr || '22', 10);
  const m = parseInt(mStr || '0', 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m < 10 ? '0' : ''}${m} ${ampm}`;
}

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [masterEnabled, setMasterEnabled] = useState<boolean>(true);
  const [hasSystemPermission, setHasSystemPermission] = useState<boolean | null>(null);

  // Settings fields
  const [userName, setUserName] = useState<string>('');
  const [language, setLanguage] = useState<NotificationLanguage>('en');
  const [dailyBudget, setDailyBudget] = useState<string>('0');
  const [dailyReportTime, setDailyReportTime] = useState<string>('22:00');

  // Time picker UI
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [webTimeModalVisible, setWebTimeModalVisible] = useState<boolean>(false);
  const [sendingPreview, setSendingPreview] = useState<boolean>(false);

  // Determine fallback name from profile
  const profileFirstName = user?.displayName
    ? user.displayName.trim().split(' ')[0]
    : 'Friend';

  // Load existing settings
  const loadSettings = useCallback(async () => {
    try {
      const cfg: NotificationSettings = await getNotificationSettings(profileFirstName);
      setMasterEnabled(cfg.masterEnabled);
      setUserName(cfg.userName || profileFirstName);
      setLanguage(cfg.language || 'en');
      setDailyBudget(cfg.dailyBudget > 0 ? String(cfg.dailyBudget) : '');
      setDailyReportTime(cfg.dailyReportTime || '22:00');

      if (Platform.OS === 'web') {
        setHasSystemPermission(true);
        setLoading(false);
        return;
      }

      const { status } = await Notifications.getPermissionsAsync();
      setHasSystemPermission(status === 'granted');
    } catch {
      setHasSystemPermission(false);
    } finally {
      setLoading(false);
    }
  }, [profileFirstName]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Re-check system permissions on foreground resume
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        loadSettings();
      }
    });
    return () => sub.remove();
  }, [loadSettings]);

  // Toggle master notifications
  const handleToggleMaster = async (value: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    setMasterEnabled(value);
    await setMasterNotificationsEnabled(value);

    if (value) {
      if (hasSystemPermission === false && Platform.OS !== 'web') {
        const granted = await requestNotificationPermissions();
        setHasSystemPermission(granted);
      }
      await scheduleNext48h(user?.uid);
      Toast.show({
        type: 'success',
        text1: 'Notifications Enabled 🔔',
        text2: 'Friendly daily digests & budget nudges are active.',
        visibilityTime: 2500,
      });
    } else {
      Toast.show({
        type: 'info',
        text1: 'Notifications Silenced 🔕',
        text2: 'All scheduled & auto-add notifications are turned off.',
        visibilityTime: 2500,
      });
    }
  };

  // Change nickname
  const handleNameBlur = async () => {
    const trimmed = userName.trim() || profileFirstName;
    setUserName(trimmed);
    await saveNotificationSettings({ userName: trimmed });
    if (masterEnabled) {
      await scheduleNext48h(user?.uid);
    }
  };

  // Change language
  const handleLanguageSelect = async (newLang: NotificationLanguage) => {
    if (newLang === language) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    setLanguage(newLang);
    await saveNotificationSettings({ language: newLang });
    if (masterEnabled) {
      await scheduleNext48h(user?.uid);
    }

    const labels: Record<NotificationLanguage, string> = {
      en: 'English',
      hi: 'Hindi (हिंदी)',
      hinglish: 'Hinglish',
    };
    Toast.show({
      type: 'success',
      text1: `Language: ${labels[newLang]} 🌐`,
      text2: 'Future notifications will arrive in this language.',
      visibilityTime: 2500,
    });
  };

  // Change daily budget
  const handleDailyBudgetBlur = async () => {
    const num = parseFloat(dailyBudget) || 0;
    const cleanStr = num > 0 ? String(num) : '';
    setDailyBudget(cleanStr);
    await saveNotificationSettings({ dailyBudget: num });
    if (masterEnabled) {
      await scheduleNext48h(user?.uid);
    }
  };

  // Handle time pick
  const handleTimeChange = async (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (event.type === 'dismissed' || !selectedDate) {
      return;
    }

    const time24 = formatDateToTime24h(selectedDate);
    setDailyReportTime(time24);
    await saveNotificationSettings({ dailyReportTime: time24 });
    if (masterEnabled) {
      await scheduleNext48h(user?.uid);
    }
    Toast.show({
      type: 'success',
      text1: `Daily Report at ${formatTime12hDisplay(time24)} ⏰`,
      text2: 'Your end-of-day summary will be sent at this time.',
      visibilityTime: 2500,
    });
  };

  const handleSelectWebTime = async (time24: string) => {
    setWebTimeModalVisible(false);
    setDailyReportTime(time24);
    await saveNotificationSettings({ dailyReportTime: time24 });
    if (masterEnabled) {
      await scheduleNext48h(user?.uid);
    }
    Toast.show({
      type: 'success',
      text1: `Daily Report at ${formatTime12hDisplay(time24)} ⏰`,
      text2: 'Your end-of-day summary will be sent at this time.',
      visibilityTime: 2500,
    });
  };

  // Trigger preview sample
  const handlePreviewSample = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    setSendingPreview(true);
    await sendSampleNotification(language);
    setSendingPreview(false);

    Toast.show({
      type: 'info',
      text1: 'Sample Notification Dispatched 🔔',
      text2: 'Look in your notification bar to see the live preview!',
      visibilityTime: 3000,
    });
  };

  // Open system settings for notification permission
  const handleOpenSystemSettings = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (Platform.OS === 'android') {
      try {
        const pkg = Application.applicationId || 'com.innovatexlabs.paisewaise';
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
          {
            extra: {
              'android.provider.extra.APP_PACKAGE': pkg,
            },
          }
        );
        return;
      } catch {
        Linking.openSettings().catch(() => {});
      }
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  // Live preview message calculation
  const parsedBudget = parseFloat(dailyBudget) || 0;
  const samplePlaceholders = {
    name: userName.trim() || profileFirstName,
    spent: formatCurrency(450),
    budget: formatCurrency(parsedBudget > 0 ? parsedBudget : 1000),
    left: formatCurrency(parsedBudget > 0 ? Math.max(0, parsedBudget - 450) : 550),
    top_category: 'Food',
    top_amount: formatCurrency(220),
    count: 3,
  };
  const liveSample = resolveNotificationMessage('morning_with_budget', language, samplePlaceholders);

  const isFullyActive = masterEnabled && (hasSystemPermission !== false);

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
          <Text style={styles.headerTitle}>Notification Settings</Text>
          <Text style={styles.headerSubtitle}>Friendly reminders &amp; daily digests</Text>
        </View>
        <View
          style={[
            styles.headerBadge,
            { backgroundColor: isFullyActive ? '#ECFDF5' : '#FEF2F2' },
          ]}
        >
          <Ionicons
            name={isFullyActive ? 'checkmark-circle' : 'close-circle'}
            size={13}
            color={isFullyActive ? '#059669' : '#DC2626'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.headerBadgeText,
              { color: isFullyActive ? '#059669' : '#DC2626' },
            ]}
          >
            {loading ? '...' : isFullyActive ? 'ACTIVE' : 'OFF'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Master Toggle Card */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: masterEnabled ? '#EEF2FF' : '#F1F5F9' },
              ]}
            >
              <Ionicons
                name={masterEnabled ? 'notifications' : 'notifications-off'}
                size={22}
                color={masterEnabled ? '#4F46E5' : '#64748B'}
              />
            </View>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.toggleTitle}>Notifications</Text>
              <Text style={styles.toggleDesc}>
                Friendly daily digests, smart expense nudges, and auto-added payment alerts.
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
              <Switch
                value={masterEnabled}
                onValueChange={handleToggleMaster}
                trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
                thumbColor="#FFFFFF"
              />
            )}
          </View>
        </View>

        {/* System Permission Warning Card if denied */}
        {hasSystemPermission === false && (
          <TouchableOpacity
            style={styles.warningCard}
            onPress={handleOpenSystemSettings}
            activeOpacity={0.8}
          >
            <View style={styles.warningIconBg}>
              <Ionicons name="alert-circle" size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.warningTitle}>Allow in system settings</Text>
              <Text style={styles.warningDesc}>
                Device notifications are disabled. Tap to allow Rupeo to post notifications in your status bar.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}

        {masterEnabled && (
          <>
            {/* Section 1: Your Name & Language */}
            <Text style={styles.sectionHeader}>PERSONALIZATION</Text>
            <View style={styles.card}>
              {/* Your Name */}
              <View style={styles.inputGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Your name</Text>
                  <Text style={styles.fieldHint}>Nickname used in messages</Text>
                </View>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={userName}
                    onChangeText={setUserName}
                    onBlur={handleNameBlur}
                    placeholder="e.g. Jeetu"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="words"
                    maxLength={30}
                    returnKeyType="done"
                  />
                </View>
              </View>

              <View style={styles.divider} />

              {/* Language Segmented Control */}
              <View style={styles.inputGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Language</Text>
                  <Text style={styles.fieldHint}>Applies immediately to future alerts</Text>
                </View>
                <View style={styles.segmentedContainer}>
                  {(
                    [
                      { id: 'en', label: 'English' },
                      { id: 'hi', label: 'हिंदी' },
                      { id: 'hinglish', label: 'Hinglish' },
                    ] as const
                  ).map((item) => {
                    const isSelected = language === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.segmentButton,
                          isSelected && styles.segmentButtonActive,
                        ]}
                        onPress={() => handleLanguageSelect(item.id)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            isSelected && styles.segmentTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Section 2: Daily Budget & Report Time */}
            <Text style={styles.sectionHeader}>DAILY BUDGET &amp; DIGEST</Text>
            <View style={styles.card}>
              {/* Daily Budget */}
              <View style={styles.inputGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Daily budget</Text>
                  <Text style={styles.fieldHint}>0 or empty = skip budget alerts</Text>
                </View>
                <View style={styles.inputWrap}>
                  <Text style={styles.currencyPrefix}>{formatCurrency(0).slice(0, 1)}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={dailyBudget}
                    onChangeText={setDailyBudget}
                    onBlur={handleDailyBudgetBlur}
                    placeholder="e.g. 500"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    returnKeyType="done"
                    maxLength={7}
                  />
                </View>
              </View>

              <View style={styles.divider} />

              {/* Daily Report Time */}
              <View style={styles.inputGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Daily report time</Text>
                  <Text style={styles.fieldHint}>Default 10:00 PM</Text>
                </View>

                <TouchableOpacity
                  style={styles.timePickerButton}
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      setWebTimeModalVisible(true);
                    } else {
                      setShowTimePicker(true);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.timeIconWrap}>
                    <Ionicons name="time-outline" size={20} color="#4F46E5" />
                  </View>
                  <Text style={styles.timeText}>{formatTime12hDisplay(dailyReportTime)}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {Platform.OS !== 'web' && showTimePicker && (
                  <DateTimePicker
                    value={parseTime24hToDate(dailyReportTime)}
                    mode="time"
                    is24Hour={false}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleTimeChange}
                  />
                )}
              </View>
            </View>

            {/* Section 3: Preview a Sample */}
            <Text style={styles.sectionHeader}>SAMPLE PREVIEW</Text>
            <View style={styles.card}>
              <View style={styles.previewBox}>
                <View style={styles.previewHeaderRow}>
                  <View style={styles.previewSender}>
                    <Text style={styles.previewAppIcon}>💛</Text>
                    <Text style={styles.previewSenderTitle}>{liveSample.title}</Text>
                  </View>
                  <Text style={styles.previewTimeLabel}>now</Text>
                </View>
                <Text style={styles.previewBodyText}>{liveSample.body}</Text>
              </View>

              <TouchableOpacity
                style={styles.previewButton}
                onPress={handlePreviewSample}
                disabled={sendingPreview}
                activeOpacity={0.8}
              >
                {sendingPreview ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.previewButtonText}>Preview a sample notification</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Web Time Selector Modal */}
      {Platform.OS === 'web' && (
        <Modal
          visible={webTimeModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setWebTimeModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Choose Daily Report Time</Text>
              <Text style={styles.modalSubtitle}>Pick a convenient evening time for your summary</Text>
              <View style={styles.timePresetsGrid}>
                {[
                  { label: '8:00 PM', value: '20:00' },
                  { label: '8:30 PM', value: '20:30' },
                  { label: '9:00 PM', value: '21:00' },
                  { label: '9:30 PM', value: '21:30' },
                  { label: '10:00 PM', value: '22:00' },
                  { label: '10:30 PM', value: '22:30' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={[
                      styles.timePresetItem,
                      dailyReportTime === item.value && styles.timePresetItemActive,
                    ]}
                    onPress={() => handleSelectWebTime(item.value)}
                  >
                    <Text
                      style={[
                        styles.timePresetText,
                        dailyReportTime === item.value && styles.timePresetTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setWebTimeModalVisible(false)}
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  toggleDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 14,
  },
  warningIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  warningDesc: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 16,
  },
  inputGroup: {
    marginVertical: 4,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  fieldHint: {
    fontSize: 11,
    color: '#94A3B8',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  inputIcon: {
    marginRight: 8,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4F46E5',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    paddingVertical: 0,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  timeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  timeText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  previewSender: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewAppIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  previewSenderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewTimeLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  previewBodyText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 11,
  },
  previewButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 16,
  },
  timePresetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  timePresetItem: {
    width: '48%',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  timePresetItemActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  timePresetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  timePresetTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  modalCloseButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalCloseText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
});
