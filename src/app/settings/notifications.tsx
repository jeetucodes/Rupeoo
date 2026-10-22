import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';
import {
  requestNotificationPermissions,
  sendTestNotification,
  setupPeriodicSmartNotifications,
} from '@/lib/notifications';

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const checkPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      setHasPermission(false);
      return;
    }
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setHasPermission(status === 'granted');
    } catch {
      setHasPermission(false);
    }
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const handleRequestPermission = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    if (Platform.OS === 'web') {
      Toast.show({ type: 'info', text1: 'Push Notifications', text2: 'Push notifications are available on mobile devices.' });
      return;
    }

    const granted = await requestNotificationPermissions();
    setHasPermission(granted);

    if (granted) {
      await setupPeriodicSmartNotifications(true);
      Toast.show({
        type: 'success',
        text1: 'Notifications Enabled! 🔔',
        text2: 'You will receive reminders & budget updates right on time.',
      });
    } else {
      Linking.openSettings().catch(() => {});
    }
  };

  const handleSendTest = async () => {
    if (Platform.OS === 'web') {
      Toast.show({ type: 'info', text1: 'Mobile Feature', text2: 'Test notifications are sent to mobile device trays.' });
      return;
    }
    setIsSendingTest(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }

    await sendTestNotification(user?.uid);
    setIsSendingTest(false);

    Toast.show({
      type: 'success',
      text1: 'Test Notification Sent! 🔔',
      text2: 'Check your notification tray to confirm.',
      visibilityTime: 4000,
    });
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
          <Text style={styles.headerTitle}>Notification Settings</Text>
          <Text style={styles.headerSubtitle}>Reminders, daily routines & nudges</Text>
        </View>
        <View
          style={[
            styles.headerBadge,
            { backgroundColor: hasPermission ? '#ECFDF5' : '#FEF2F2' },
          ]}
        >
          <Ionicons
            name={hasPermission ? 'checkmark-circle' : 'alert-circle'}
            size={13}
            color={hasPermission ? '#059669' : '#DC2626'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.headerBadgeText,
              { color: hasPermission ? '#059669' : '#DC2626' },
            ]}
          >
            {hasPermission === null ? 'CHECKING' : hasPermission ? 'ACTIVE' : 'OFF'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission Status Card */}
        <View
          style={[
            styles.statusCard,
            hasPermission ? styles.statusCardActive : styles.statusCardInactive,
          ]}
        >
          <View style={styles.statusLeft}>
            <View
              style={[
                styles.statusIconBg,
                { backgroundColor: hasPermission ? '#DCFCE7' : '#FEE2E2' },
              ]}
            >
              <Ionicons
                name={hasPermission ? 'notifications' : 'notifications-off'}
                size={22}
                color={hasPermission ? '#15803D' : '#DC2626'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>
                {hasPermission ? 'Notifications are Active' : 'Notifications are Disabled'}
              </Text>
              <Text style={styles.statusDesc}>
                {hasPermission
                  ? 'Daily spend reminders, bill alerts & budget limits are running.'
                  : 'Enable notifications to get reminded to log daily expenses & bills.'}
              </Text>
            </View>
          </View>
          {!hasPermission && (
            <TouchableOpacity
              style={styles.enableBtn}
              onPress={handleRequestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.enableBtnText}>Enable Notifications</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* SECTION 1: MASTER CONTROLS & TEST */}
        <SettingsSection title="System & Testing">
          <SettingsRow
            icon="notifications"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
            label="System Permission"
            subtitle={hasPermission ? 'Granted in Android system settings' : 'Tap to open settings and allow'}
            value={hasPermission ? 'Allowed' : 'Disabled'}
            onPress={() => {
              if (Platform.OS === 'android') {
                Linking.openSettings().catch(() => {});
              } else {
                handleRequestPermission();
              }
            }}
          />
          <SettingsRow
            icon="send"
            iconBg="#F0FDF4"
            iconColor="#16A34A"
            label="Send Test Notification"
            subtitle="Trigger an immediate test alert to verify delivery"
            loading={isSendingTest}
            onPress={handleSendTest}
            isLast
          />
        </SettingsSection>

        {/* SECTION 2: FIXED DAILY ROUTINE */}
        <SettingsSection title="Daily Routines (Fixed Times)">
          <SettingsRow
            icon="sunny"
            iconBg="#FEF3C7"
            iconColor="#D97706"
            label="Morning Spending Goal"
            subtitle="Start fresh & set today's target"
            value="9:00 AM"
            showChevron={false}
          />
          <SettingsRow
            icon="restaurant"
            iconBg="#EFF6FF"
            iconColor="#2563EB"
            label="Lunch & Snack Check-in"
            subtitle="Quick 5-second log for afternoon expenses"
            value="2:00 PM"
            showChevron={false}
          />
          <SettingsRow
            icon="cart"
            iconBg="#F5F3FF"
            iconColor="#7C3AED"
            label="Evening Shopping & Travel"
            subtitle="Tea, commute or evening shopping reminders"
            value="7:30 PM"
            showChevron={false}
          />
          <SettingsRow
            icon="moon"
            iconBg="#F1F5F9"
            iconColor="#475569"
            label="Day End Review"
            subtitle="Review total spend before sleep"
            value="10:00 PM"
            showChevron={false}
            isLast
          />
        </SettingsSection>

        {/* SECTION 3: BILLS & RECURRING */}
        <SettingsSection title="Bills & Payments">
          <SettingsRow
            icon="calendar"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
            label="Bill & Recurring Reminders"
            subtitle="Manage scheduled electricity, rent, recharge, and EMI alerts"
            onPress={() => router.push('/reminders')}
            badge="MANAGE"
          />
          <SettingsRow
            icon="volume-mute"
            iconBg="#FEF2F2"
            iconColor="#DC2626"
            label="Quiet Hours (Auto-Silent)"
            subtitle="No routine notifications are sent between 11:00 PM and 8:00 AM"
            value="11 PM - 8 AM"
            showChevron={false}
            isLast
          />
        </SettingsSection>
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
    paddingTop: 16,
  },
  statusCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  statusCardActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  statusCardInactive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIconBg: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  statusDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  enableBtn: {
    marginTop: 14,
    backgroundColor: '#4F46E5',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  enableBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
