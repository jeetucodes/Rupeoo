import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

import {
  getAllFinanceAppsWithUserPreferences,
  getDetectedFinanceApps,
  setPackageAllowed,
  approveDetectedApp,
  ignoreDetectedApp,
  resetFinanceAppsToDefault,
  type FinanceAppEntry,
  type DetectedFinanceApp,
  type FinanceAppCategory,
} from '@/lib/financeApps';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';

type FilterTab = 'all' | 'upi' | 'bank' | 'sms';

export default function FinanceAppsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState<boolean>(true);
  const [apps, setApps] = useState<(FinanceAppEntry & { isEnabled: boolean })[]>([]);
  const [detectedApps, setDetectedApps] = useState<DetectedFinanceApp[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [resetModalVisible, setResetModalVisible] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      const [allApps, detected] = await Promise.all([
        getAllFinanceAppsWithUserPreferences(),
        getDetectedFinanceApps(),
      ]);
      setApps(allApps);
      setDetectedApps(detected);
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to load finance apps list' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = async (packageName: string, currentVal: boolean) => {
    const newVal = !currentVal;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Optimistic UI update
      setApps((prev) =>
        prev.map((app) => (app.packageName === packageName ? { ...app, isEnabled: newVal } : app))
      );
      await setPackageAllowed(packageName, newVal);
    } catch {
      // Revert on error
      setApps((prev) =>
        prev.map((app) => (app.packageName === packageName ? { ...app, isEnabled: currentVal } : app))
      );
      Toast.show({ type: 'error', text1: 'Failed to update app status' });
    }
  };

  const handleApproveDetected = async (app: DetectedFinanceApp) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await approveDetectedApp(app.packageName);
      Toast.show({
        type: 'success',
        text1: 'App Approved',
        text2: `${app.appName} is now monitored for alerts`,
      });
      await loadData();
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to approve app' });
    }
  };

  const handleIgnoreDetected = async (app: DetectedFinanceApp) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await ignoreDetectedApp(app.packageName);
      Toast.show({
        type: 'info',
        text1: 'App Ignored',
        text2: `Rupeo will ignore alerts from ${app.appName}`,
      });
      await loadData();
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to ignore app' });
    }
  };

  const handleResetDefaults = async () => {
    setIsResetting(true);
    try {
      await resetFinanceAppsToDefault();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({
        type: 'success',
        text1: 'Reset to Defaults',
        text2: 'Official finance apps have been restored to default allowlist',
      });
      setResetModalVisible(false);
      await loadData();
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to reset finance apps' });
    } finally {
      setIsResetting(false);
    }
  };

  // Filter and search
  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      // Tab filter
      if (activeTab !== 'all' && app.category !== activeTab) {
        return false;
      }
      // Search filter
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = app.appName.toLowerCase().includes(query);
        const matchesPkg = app.packageName.toLowerCase().includes(query);
        return matchesName || matchesPkg;
      }
      return true;
    });
  }, [apps, activeTab, searchQuery]);

  const pendingDetectedApps = useMemo(() => {
    return detectedApps.filter((d) => d.status === 'pending');
  }, [detectedApps]);

  const getCategoryIcon = (category: FinanceAppCategory): { name: keyof typeof Ionicons.glyphMap; color: string; bg: string } => {
    switch (category) {
      case 'upi':
        return { name: 'flash', color: '#7C3AED', bg: '#F5F3FF' };
      case 'bank':
        return { name: 'business', color: '#059669', bg: '#ECFDF5' };
      case 'sms':
        return { name: 'chatbox-ellipses', color: '#2563EB', bg: '#EFF6FF' };
      default:
        return { name: 'apps', color: '#4F46E5', bg: '#EEF2FF' };
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
          <Text style={styles.headerTitle}>Finance Apps</Text>
          <Text style={styles.headerSubtitle}>
            Rupeo reads only transaction alerts from these apps
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setResetModalVisible(true)}
          style={styles.resetHeaderBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Reset to defaults"
        >
          <Ionicons name="refresh-outline" size={20} color="#64748B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Explanation Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={20} color="#10B981" style={{ marginRight: 10, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoBannerTitle}>Privacy & Security Guaranteed</Text>
            <Text style={styles.infoBannerText}>
              Rupeo reads only transaction alerts from these apps. Notifications from personal chats, social media, shopping apps, and OTPs are never processed or saved.
            </Text>
          </View>
        </View>

        {/* SECTION 1: DETECTED APPS AWAITING APPROVAL */}
        {pendingDetectedApps.length > 0 && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.pendingBadge}>
                <Ionicons name="alert-circle" size={14} color="#D97706" style={{ marginRight: 4 }} />
                <Text style={styles.pendingBadgeText}>
                  {pendingDetectedApps.length} AWAITING APPROVAL
                </Text>
              </View>
            </View>
            <Text style={styles.sectionNotice}>
              New apps detected that sent financial alerts on this device. Approve to enable automatic transaction tracking.
            </Text>

            <View style={styles.detectedCard}>
              {pendingDetectedApps.map((app, idx) => (
                <View
                  key={app.packageName}
                  style={[
                    styles.detectedRow,
                    idx !== pendingDetectedApps.length - 1 && styles.rowBorderBottom,
                  ]}
                >
                  <View style={styles.detectedInfoWrap}>
                    <View style={styles.detectedAppIcon}>
                      <Ionicons name="help-circle-outline" size={20} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detectedAppName}>{app.appName}</Text>
                      <Text style={styles.detectedAppPkg} numberOfLines={1}>
                        {app.packageName}
                      </Text>
                      {app.sampleSnippet ? (
                        <Text style={styles.detectedSnippet} numberOfLines={1}>
                          "{app.sampleSnippet}"
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.detectedActionButtons}>
                    <TouchableOpacity
                      onPress={() => handleApproveDetected(app)}
                      style={styles.approveButton}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.approveButtonText}>Approve</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleIgnoreDetected(app)}
                      style={styles.ignoreButton}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.ignoreButtonText}>Ignore</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* SECTION 2: MANAGED APPS LIST */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Allowed Finance Apps</Text>
            <Text style={styles.sectionCountText}>
              {filteredApps.filter((a) => a.isEnabled).length} active of {apps.length}
            </Text>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={17} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by app name or package..."
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Category Filter Tabs */}
          <View style={styles.filterTabsRow}>
            {(
              [
                { id: 'all', label: 'All Apps' },
                { id: 'upi', label: 'UPI & Wallets' },
                { id: 'bank', label: 'Banks' },
                { id: 'sms', label: 'SMS Apps' },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveTab(tab.id);
                  }}
                  style={[styles.filterTab, isActive && styles.filterTabActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Apps List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#4F46E5" />
              <Text style={styles.loadingText}>Loading verified finance apps...</Text>
            </View>
          ) : filteredApps.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No matching apps found</Text>
              <Text style={styles.emptySubtitle}>Try searching for another bank or fintech name</Text>
            </View>
          ) : (
            <View style={styles.appsCard}>
              {filteredApps.map((app, idx) => {
                const iconInfo = getCategoryIcon(app.category);
                const isLast = idx === filteredApps.length - 1;

                return (
                  <View
                    key={app.packageName}
                    style={[styles.appRow, !isLast && styles.rowBorderBottom]}
                  >
                    <View style={styles.appRowLeft}>
                      <View style={[styles.appCategoryIconWrap, { backgroundColor: iconInfo.bg }]}>
                        <Ionicons name={iconInfo.name} size={18} color={iconInfo.color} />
                      </View>
                      <View style={styles.appTextContainer}>
                        <View style={styles.appNameRow}>
                          <Text style={styles.appName}>{app.appName}</Text>
                          {app.verified ? (
                            <View style={styles.verifiedBadge}>
                              <Ionicons name="checkmark-circle" size={11} color="#059669" style={{ marginRight: 2 }} />
                              <Text style={styles.verifiedBadgeText}>Verified</Text>
                            </View>
                          ) : (
                            <View style={styles.unverifiedBadge}>
                              <Ionicons name="time-outline" size={11} color="#D97706" style={{ marginRight: 2 }} />
                              <Text style={styles.unverifiedBadgeText}>Unverified</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.appPackageName} numberOfLines={1}>
                          {app.packageName}
                        </Text>
                      </View>
                    </View>

                    <Switch
                      value={app.isEnabled}
                      onValueChange={() => handleToggle(app.packageName, app.isEnabled)}
                      trackColor={{ false: '#E2E8F0', true: '#C7D2FE' }}
                      thumbColor={app.isEnabled ? '#4F46E5' : '#FFFFFF'}
                    />
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Footer Info & Verification Docs Link */}
        <View style={styles.footerWrap}>
          <Text style={styles.footerNote}>
            Need to add a bank or custom UPI app? Read alerts from any app, and Rupeo will detect it and ask for your approval above.
          </Text>
        </View>
      </ScrollView>

      {/* Reset Confirmation Modal */}
      <ConfirmDialogModal
        visible={resetModalVisible}
        title="Reset Finance Apps?"
        message="This will restore the default list of official Indian Banks, UPI apps, and system SMS apps, clearing any custom approval overrides."
        confirmText="Reset to Defaults"
        cancelText="Cancel"
        type="danger"
        loading={isResetting}
        onConfirm={handleResetDefaults}
        onCancel={() => setResetModalVisible(false)}
      />
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
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  resetHeaderBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  infoBannerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 4,
  },
  infoBannerText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#047857',
    lineHeight: 18,
  },
  sectionWrap: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionCountText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  sectionNotice: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 12,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.3,
  },
  detectedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    overflow: 'hidden',
    shadowColor: '#D97706',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  detectedRow: {
    padding: 14,
  },
  rowBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detectedInfoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  detectedAppIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  detectedAppName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  detectedAppPkg: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#64748B',
    marginTop: 1,
  },
  detectedSnippet: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#94A3B8',
    marginTop: 2,
  },
  detectedActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  approveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  approveButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ignoreButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ignoreButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterTabTextActive: {
    color: '#4F46E5',
  },
  appsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  appRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  appCategoryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  appTextContainer: {
    flex: 1,
  },
  appNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  appName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
  },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unverifiedBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#B45309',
  },
  appPackageName: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#64748B',
    marginTop: 2,
  },
  loadingContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
    fontWeight: '500',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  footerWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerNote: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 17,
  },
});
