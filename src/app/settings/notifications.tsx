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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import Toast from 'react-native-toast-message';
import {
  isMasterNotificationsEnabled,
  setMasterNotificationsEnabled,
  requestNotificationPermissions,
} from '@/lib/notifications';

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [masterEnabled, setMasterEnabled] = useState<boolean>(true);
  const [hasSystemPermission, setHasSystemPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Check system permission and master setting
  const refreshStatus = useCallback(async () => {
    try {
      const isEnabled = await isMasterNotificationsEnabled();
      setMasterEnabled(isEnabled);

      if (Platform.OS === 'web') {
        setHasSystemPermission(false);
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
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Re-check when app regains focus from system settings
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        refreshStatus();
      }
    });
    return () => sub.remove();
  }, [refreshStatus]);

  // Handle master toggle change
  const handleToggleMaster = async (value: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    setMasterEnabled(value);
    await setMasterNotificationsEnabled(value);

    if (value) {
      // If toggled ON and system permission is not granted, prompt user
      if (hasSystemPermission === false && Platform.OS !== 'web') {
        const granted = await requestNotificationPermissions();
        setHasSystemPermission(granted);
      }
      Toast.show({
        type: 'success',
        text1: 'Notifications Enabled 🔔',
        text2: 'You will receive transaction alerts & updates.',
        visibilityTime: 2500,
      });
    } else {
      Toast.show({
        type: 'info',
        text1: 'Notifications Silenced 🔕',
        text2: 'All transaction alerts & app notifications are turned off.',
        visibilityTime: 2500,
      });
    }
  };

  // Open system settings for notification permission
  const handleOpenSystemSettings = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    if (Platform.OS === 'android') {
      try {
        const pkg = Application.applicationId || 'com.rupeo.app';
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

  const isFullyActive = masterEnabled && hasSystemPermission;

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
          <Text style={styles.headerSubtitle}>Alerts &amp; push preferences</Text>
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
                Show transaction alerts, auto-add confirmations with Undo, and budget warnings.
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

        {/* System Permission Row if not granted */}
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
                Device notifications are disabled. Tap to allow Rupeo to show alerts in your notification shade.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}

        {/* Information Callout */}
        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#64748B" style={{ marginRight: 8 }} />
          <Text style={styles.infoBoxText}>
            When Notifications are OFF, Rupeo runs silently and never triggers sound or banners in your status bar.
          </Text>
        </View>
      </ScrollView>
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
});
