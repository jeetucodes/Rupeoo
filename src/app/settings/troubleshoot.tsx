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
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import {
  isListenerEnabled,
  openListenerSettings,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
  openOEMAutoStartSettings,
  getDeviceManufacturer,
  getAutoAddHealth,
  AutoAddHealth,
} from '@/features/autoAdd/nativeModule';
import { getRecentNotifLogs, NotifLogEntry, clearNotifLogs } from '@/features/autoAdd/sqliteStorage';
import { getFriendlySenderName } from '@/features/autoAdd/filter';
import { APP_VERSION_DISPLAY } from '@/constants/version';

export default function TroubleshootScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = user?.uid || 'local';

  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<AutoAddHealth>({
    listenerEnabled: false,
    batteryUnrestricted: false,
    notificationPermission: false,
    autoAddOn: false,
    lastEventAt: null,
  });
  const [manufacturer, setManufacturer] = useState<string>('unknown');
  const [logs, setLogs] = useState<NotifLogEntry[]>([]);

  const loadData = useCallback(async () => {
    try {
      const h = await getAutoAddHealth(uid);
      setHealth(h);
      const mfg = await getDeviceManufacturer();
      setManufacturer(mfg);
      const recentLogs = getRecentNotifLogs(100);
      setLogs(recentLogs);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        loadData();
      }
    });
    return () => sub.remove();
  }, [loadData]);

  const handleFixListener = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    await openListenerSettings();
  };

  const handleFixBattery = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    await requestIgnoreBatteryOptimizations();
  };

  const handleFixAutoStart = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    await openOEMAutoStartSettings();
  };

  const handleFixNotifPermission = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    await Notifications.requestPermissionsAsync();
    loadData();
  };

  const handleClearLogs = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    clearNotifLogs();
    setLogs([]);
    Toast.show({
      type: 'info',
      text1: 'Logs Cleared',
      text2: 'Recent alert history has been reset.',
    });
  };

  const handleCopyReport = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    const reportLines = [
      `=== Rupeo Diagnostics Report (Rupeo ${APP_VERSION_DISPLAY}) ===`,
      `App Version: Rupeo ${APP_VERSION_DISPLAY}`,
      `Date: ${new Date().toISOString()}`,
      `Platform: ${Platform.OS} (v${Platform.Version})`,
      `Device Manufacturer: ${manufacturer}`,
      '',
      '--- System Health ---',
      `Notification Listener: ${health.listenerEnabled ? 'ACTIVE (OK)' : 'DISABLED (Action Required)'}`,
      `Battery Optimization: ${health.batteryUnrestricted ? 'UNRESTRICTED (OK)' : 'RESTRICTED (May miss payments)'}`,
      `Notifications Permission: ${health.notificationPermission ? 'GRANTED' : 'DENIED'}`,
      `Auto-Add Master Setting: ${health.autoAddOn ? 'ON' : 'OFF or PAUSED'}`,
      `Last Alert Received: ${health.lastEventAt ? new Date(health.lastEventAt).toLocaleString() : 'None yet'}`,
      '',
      '--- Recent Alert Log (Last 15) ---',
    ];

    if (logs.length === 0) {
      reportLines.push('No recent notification events logged.');
    } else {
      logs.slice(0, 15).forEach((entry, idx) => {
        const timeStr = new Date(entry.timestamp).toLocaleTimeString();
        reportLines.push(
          `[${idx + 1}] ${timeStr} | ${entry.packageName} | Result: ${entry.reasonSkipped || entry.parsedStatus} | ${entry.summary}`
        );
      });
    }

    const reportText = reportLines.join('\n');

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(reportText);
    } else {
      Clipboard.setString(reportText);
    }

    Toast.show({
      type: 'success',
      text1: 'Report Copied 📋',
      text2: 'Diagnostics summary copied to clipboard.',
      visibilityTime: 3500,
    });
  };

  const isOemSpecial = [
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
  ].some((b) => manufacturer.includes(b));

  const formatLogTime = (ts: number) => {
    try {
      const d = new Date(ts);
      const hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      return `${formattedHours}:${minutes} ${ampm}`;
    } catch {
      return '';
    }
  };

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
          <Text style={styles.headerTitle}>Troubleshoot Auto-Add</Text>
          <Text style={styles.headerSubtitle}>
            System health checks &amp; live notification logs
          </Text>
        </View>
        <TouchableOpacity
          onPress={loadData}
          style={styles.refreshButton}
          activeOpacity={0.7}
          accessibilityLabel="Refresh"
        >
          <Ionicons name="refresh" size={20} color="#334155" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={18} color="#059669" style={{ marginRight: 10 }} />
          <Text style={styles.infoBannerText}>
            Rupeo works 100% on this device. If payments are ever missed, check the 4 prerequisites below to ensure Android doesn't kill the background listener.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#EAB308" />
            <Text style={styles.loadingText}>Running diagnostics...</Text>
          </View>
        ) : (
          <>
            {/* SECTION 1: 4 HEALTH CHECKS */}
            <Text style={styles.sectionHeader}>System Prerequisites</Text>
            <View style={styles.healthList}>
              {/* 1. Notification Access */}
              <View style={styles.healthCard}>
                <View style={styles.healthIconWrap}>
                  <Ionicons
                    name={health.listenerEnabled ? 'checkmark-circle' : 'close-circle'}
                    size={24}
                    color={health.listenerEnabled ? '#059669' : '#DC2626'}
                  />
                </View>
                <View style={styles.healthTextWrap}>
                  <View style={styles.healthRowHeader}>
                    <Text style={styles.healthTitle}>Notification Access</Text>
                    <View
                      style={[
                        styles.healthBadge,
                        { backgroundColor: health.listenerEnabled ? '#ECFDF5' : '#FEF2F2' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.healthBadgeText,
                          { color: health.listenerEnabled ? '#059669' : '#DC2626' },
                        ]}
                      >
                        {health.listenerEnabled ? 'ACTIVE' : 'OFF'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.healthDesc}>
                    {health.listenerEnabled
                      ? 'Granted · Listener captures incoming bank alerts'
                      : 'Missing permission · Required to read payments'}
                  </Text>
                </View>
                {!health.listenerEnabled && (
                  <TouchableOpacity
                    style={styles.fixButton}
                    onPress={handleFixListener}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.fixButtonText}>Fix</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 2. Battery Optimization */}
              <View style={styles.healthCard}>
                <View style={styles.healthIconWrap}>
                  <Ionicons
                    name={health.batteryUnrestricted ? 'checkmark-circle' : 'alert-circle'}
                    size={24}
                    color={health.batteryUnrestricted ? '#059669' : '#D97706'}
                  />
                </View>
                <View style={styles.healthTextWrap}>
                  <View style={styles.healthRowHeader}>
                    <Text style={styles.healthTitle}>Battery: Unrestricted</Text>
                    <View
                      style={[
                        styles.healthBadge,
                        { backgroundColor: health.batteryUnrestricted ? '#ECFDF5' : '#FEF3C7' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.healthBadgeText,
                          { color: health.batteryUnrestricted ? '#059669' : '#B45309' },
                        ]}
                      >
                        {health.batteryUnrestricted ? 'UNRESTRICTED' : 'OPTIMIZED'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.healthDesc}>
                    {health.batteryUnrestricted
                      ? 'Ready · Android will not kill Rupeo when screen is off'
                      : 'May miss payments when phone sleeps or screen is off'}
                  </Text>
                </View>
                {!health.batteryUnrestricted && (
                  <TouchableOpacity
                    style={styles.fixButton}
                    onPress={handleFixBattery}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.fixButtonText}>Fix</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 3. Auto-Start & Background (OEM) */}
              <View style={styles.healthCard}>
                <View style={styles.healthIconWrap}>
                  <Ionicons
                    name="refresh-circle"
                    size={24}
                    color="#4F46E5"
                  />
                </View>
                <View style={styles.healthTextWrap}>
                  <View style={styles.healthRowHeader}>
                    <Text style={styles.healthTitle}>Auto-Start Permission</Text>
                    <View style={[styles.healthBadge, { backgroundColor: '#EEF2FF' }]}>
                      <Text style={[styles.healthBadgeText, { color: '#4F46E5' }]}>
                        {manufacturer.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.healthDesc}>
                    {isOemSpecial
                      ? `${manufacturer} battery management requires Auto-Start for background services`
                      : 'Standard Android background management'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.fixButton, styles.fixButtonNeutral]}
                  onPress={handleFixAutoStart}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.fixButtonText, styles.fixButtonNeutralText]}>Open</Text>
                </TouchableOpacity>
              </View>

              {/* 4. Notification Permission */}
              <View style={styles.healthCard}>
                <View style={styles.healthIconWrap}>
                  <Ionicons
                    name={health.notificationPermission ? 'checkmark-circle' : 'close-circle'}
                    size={24}
                    color={health.notificationPermission ? '#059669' : '#DC2626'}
                  />
                </View>
                <View style={styles.healthTextWrap}>
                  <View style={styles.healthRowHeader}>
                    <Text style={styles.healthTitle}>App Notifications</Text>
                    <View
                      style={[
                        styles.healthBadge,
                        { backgroundColor: health.notificationPermission ? '#ECFDF5' : '#FEF2F2' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.healthBadgeText,
                          { color: health.notificationPermission ? '#059669' : '#DC2626' },
                        ]}
                      >
                        {health.notificationPermission ? 'GRANTED' : 'DENIED'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.healthDesc}>
                    {health.notificationPermission
                      ? 'Allowed · Shows confirmation with Undo after payments'
                      : 'Disabled · Undo notifications cannot be displayed'}
                  </Text>
                </View>
                {!health.notificationPermission && (
                  <TouchableOpacity
                    style={styles.fixButton}
                    onPress={handleFixNotifPermission}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.fixButtonText}>Grant</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* SECTION 2: RECENT ALERTS SEEN */}
            <View style={styles.logHeaderRow}>
              <View>
                <Text style={styles.sectionHeader}>Recent Alerts Seen</Text>
                <Text style={styles.sectionSub}>Live log of background listener events</Text>
              </View>
              {logs.length > 0 && (
                <TouchableOpacity
                  onPress={handleClearLogs}
                  style={styles.clearLogsBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearLogsText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {logs.length === 0 ? (
              <View style={styles.emptyLogsCard}>
                <Ionicons name="mail-unread-outline" size={32} color="#94A3B8" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyLogsTitle}>No alerts recorded yet</Text>
                <Text style={styles.emptyLogsSubtitle}>
                  When bank SMS or payment notifications arrive, their processing status (Saved, Duplicate, Filtered) will appear here in real time.
                </Text>
              </View>
            ) : (
              <View style={styles.logList}>
                {logs.map((item, index) => {
                  const friendlyName = getFriendlySenderName(item.packageName);
                  const isSaved = item.reasonSkipped === 'saved';
                  const isDup = item.reasonSkipped === 'duplicate';
                  const isOff = item.reasonSkipped === 'autoAddOff' || item.reasonSkipped === 'paused';
                  const isParseFailed = item.reasonSkipped === 'parseFailed';

                  let badgeLabel = 'Saved';
                  let badgeBg = '#ECFDF5';
                  let badgeColor = '#059669';

                  if (isSaved) {
                    badgeLabel = 'Saved';
                    badgeBg = '#ECFDF5';
                    badgeColor = '#059669';
                  } else if (isDup) {
                    badgeLabel = 'Skipped: duplicate';
                    badgeBg = '#FEF3C7';
                    badgeColor = '#B45309';
                  } else if (isOff) {
                    badgeLabel = 'Skipped: auto-add off';
                    badgeBg = '#F1F5F9';
                    badgeColor = '#475569';
                  } else if (isParseFailed) {
                    badgeLabel = 'Could not read';
                    badgeBg = '#FFF1F2';
                    badgeColor = '#E11D48';
                  } else {
                    badgeLabel = 'Filtered';
                    badgeBg = '#F8FAFC';
                    badgeColor = '#64748B';
                  }

                  return (
                    <View key={item.id || index} style={styles.logItem}>
                      <View style={styles.logTopRow}>
                        <View style={styles.logSourceWrap}>
                          <Text style={styles.logSourceName} numberOfLines={1}>
                            {friendlyName}
                          </Text>
                          <Text style={styles.logTimeText}>
                            {formatLogTime(item.timestamp)}
                          </Text>
                        </View>
                        <View style={[styles.logBadge, { backgroundColor: badgeBg }]}>
                          <Text style={[styles.logBadgeText, { color: badgeColor }]}>
                            {badgeLabel}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.logSummaryText} numberOfLines={2}>
                        {item.summary}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* SECTION 3: COPY REPORT BUTTON */}
            <TouchableOpacity
              style={styles.copyReportButton}
              onPress={handleCopyReport}
              activeOpacity={0.85}
            >
              <Ionicons name="copy-outline" size={18} color="#0F172A" style={{ marginRight: 8 }} />
              <Text style={styles.copyReportText}>Copy Diagnostics Report</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEFCF7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 6,
    marginRight: 10,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
    lineHeight: 18,
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 10,
  },
  healthList: {
    gap: 10,
    marginBottom: 24,
    marginTop: 8,
  },
  healthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  healthIconWrap: {
    marginRight: 12,
  },
  healthTextWrap: {
    flex: 1,
  },
  healthRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  healthTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  healthBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  healthBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  healthDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 16,
  },
  fixButton: {
    backgroundColor: '#EAB308',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  fixButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
  fixButtonNeutral: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  fixButtonNeutralText: {
    color: '#334155',
  },
  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  clearLogsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  clearLogsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  emptyLogsCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 6,
  },
  emptyLogsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  emptyLogsSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
  },
  logList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 20,
    marginTop: 6,
  },
  logItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  logTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logSourceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  logSourceName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  logTimeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  logBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  logBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  logSummaryText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#334155',
    lineHeight: 17,
  },
  copyReportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 14,
    borderRadius: 14,
  },
  copyReportText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
});
