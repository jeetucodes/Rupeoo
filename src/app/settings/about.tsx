import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { APP_VERSION, APP_VERSION_CODE, APP_VERSION_DISPLAY, APP_PLATFORM } from '@/constants/version';
import { safeGoBack } from '@/lib/navigation';
import { checkForInAppUpdate } from '@/lib/inAppUpdate';

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const handleOpenPlayStore = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.innovatexlabs.paisewaise';
    Linking.openURL(playStoreUrl).catch(() => {
      Toast.show({
        type: 'info',
        text1: 'Rupeo',
        text2: 'Play Store link is available on release.',
      });
    });
  };

  const handleCheckUpdate = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    Toast.show({
      type: 'info',
      text1: 'Checking for updates...',
      text2: 'Connecting with Google Play Store.',
      visibilityTime: 2000,
    });

    try {
      const res = await checkForInAppUpdate(true);
      if (!res.updateAvailable) {
        Toast.show({
          type: 'success',
          text1: 'Rupeo is Up to Date 🎉',
          text2: `You are running the latest version (${APP_VERSION}).`,
          visibilityTime: 3000,
        });
      }
    } catch {
      handleOpenPlayStore();
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleOpenPrivacy = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    router.push('/settings/privacy');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => safeGoBack(router, '/(tabs)/settings')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About Rupeo</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* App Hero */}
        <View style={styles.heroCard}>
          <View style={styles.iconContainer}>
            <Image
              source={require('../../../assets/images/icon.png')}
              style={styles.appIcon}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.appName}>Rupeo</Text>
          <Text style={styles.appTagline}>Smart Personal Finance & Expense Tracker</Text>

          <View style={styles.versionBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.versionBadgeText}>Version v{APP_VERSION} (Build {APP_VERSION_CODE})</Text>
          </View>
        </View>

        {/* Core Pillars */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Why Rupeo?</Text>

          <View style={styles.pillarRow}>
            <View style={[styles.pillarIconWrap, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="shield-checkmark" size={18} color="#15803D" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pillarTitle}>100% On-Device Privacy</Text>
              <Text style={styles.pillarDesc}>
                Your financial data, bank SMS, transactions, and statements remain strictly on your device. We never sell or share your data.
              </Text>
            </View>
          </View>

          <View style={styles.pillarRow}>
            <View style={[styles.pillarIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="flash" size={18} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pillarTitle}>Instant Auto-Add Engine</Text>
              <Text style={styles.pillarDesc}>
                Real-time UPI and bank notification intelligence catches your expenses right when you pay, without tedious manual entry.
              </Text>
            </View>
          </View>

          <View style={styles.pillarRow}>
            <View style={[styles.pillarIconWrap, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="pie-chart" size={18} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pillarTitle}>Smart Analytics & Discipline</Text>
              <Text style={styles.pillarDesc}>
                Visual spending calendar, zero-spend streaks, category budgeting, and passbook statements empower your financial discipline.
              </Text>
            </View>
          </View>

          <View style={[styles.pillarRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <View style={[styles.pillarIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="heart" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pillarTitle}>Crafted with Love in India 🇮🇳</Text>
              <Text style={styles.pillarDesc}>
                Engineered by InnovateX Labs with a mission to deliver the fastest, most beautiful financial tool for Indian users.
              </Text>
            </View>
          </View>
        </View>

        {/* Technical Details */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Application Information</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>v{APP_VERSION}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Build Code</Text>
            <Text style={styles.infoValue}>{APP_VERSION_CODE}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Display String</Text>
            <Text style={styles.infoValue}>{APP_VERSION_DISPLAY}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Platform</Text>
            <Text style={styles.infoValue}>{APP_PLATFORM} ({Platform.OS})</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Architecture</Text>
            <Text style={styles.infoValue}>SQLite Local First</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsCard}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleCheckUpdate}
            activeOpacity={0.8}
            disabled={checkingUpdate}
          >
            <Ionicons name="cloud-download-outline" size={18} color="#10B981" />
            <Text style={styles.actionBtnText}>
              {checkingUpdate ? 'Checking for updates...' : 'Check for Updates'}
            </Text>
            {checkingUpdate ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : (
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderTopWidth: 1, borderColor: '#F1F5F9' }]}
            onPress={handleOpenPlayStore}
            activeOpacity={0.8}
          >
            <Ionicons name="star" size={18} color="#D97706" />
            <Text style={styles.actionBtnText}>Rate 5-Stars on Google Play</Text>
            <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderTopWidth: 1, borderColor: '#F1F5F9' }]}
            onPress={handleOpenPrivacy}
            activeOpacity={0.8}
          >
            <Ionicons name="shield-outline" size={18} color="#2563EB" />
            <Text style={styles.actionBtnText}>Privacy Policy & Data Security</Text>
            <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.copyrightText}>
          © 2026 Rupeo. InnovateX Labs.{'\n'}All rights reserved.
        </Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  appIcon: {
    width: 68,
    height: 68,
    borderRadius: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 14,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  versionBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pillarIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  pillarTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  pillarDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  actionBtnText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  copyrightText: {
    textAlign: 'center',
    fontSize: 11.5,
    color: '#94A3B8',
    lineHeight: 16,
    marginTop: 10,
  },
});
