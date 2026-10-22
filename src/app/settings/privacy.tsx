import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import {
  isCloudSyncEnabled,
  setCloudSyncEnabled,
  deleteCloudCopy,
  uploadLocalDataToCloud,
  exportTransactionsToCSV,
  deleteAccountAndAllData,
} from '@/lib/cloudSync';
import { getOfflineTransactions } from '@/lib/offlineSync';
import { LegalModal } from '@/components/LegalModal';

export default function PrivacyAndDataScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [syncEnabled, setSyncEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [localTxCount, setLocalTxCount] = useState<number>(0);

  // Sync Progress State
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Toggle OFF Confirmation Sheet
  const [showDisableSheet, setShowDisableSheet] = useState<boolean>(false);
  const [isDeletingCloud, setIsDeletingCloud] = useState<boolean>(false);

  // Account Deletion Modal (confirm by typing "DELETE")
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState<boolean>(false);
  const [deleteInputText, setDeleteInputText] = useState<string>('');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  // Export State
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Legal Modal
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | null>(null);

  const loadInitialState = useCallback(async () => {
    try {
      const enabled = await isCloudSyncEnabled(user?.uid);
      setSyncEnabled(enabled);

      const targetUid = user?.uid || 'local';
      const localList = await getOfflineTransactions(targetUid);
      setLocalTxCount(localList.length);
    } catch {
      setSyncEnabled(true);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadInitialState();
  }, [loadInitialState]);

  // Handle Cloud Sync Switch Toggle
  const handleToggleSync = async (newValue: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (!newValue) {
      // User is attempting to turn OFF cloud sync -> show sheet with options
      setShowDisableSheet(true);
    } else {
      // User is turning ON cloud sync
      if (!user?.uid || user.uid === 'local') {
        Toast.show({
          type: 'info',
          text1: 'Sign in Required',
          text2: 'Please sign in or create an account to enable cloud sync.',
        });
        router.push('/login');
        return;
      }

      await setCloudSyncEnabled(true);
      setSyncEnabled(true);
      Toast.show({
        type: 'success',
        text1: 'Cloud Sync Enabled',
        text2: 'Your transactions will be backed up securely to your account.',
      });

      // Trigger batch upload with progress
      runInitialSync(user.uid);
    }
  };

  const runInitialSync = async (uid: string) => {
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: localTxCount || 1 });
    try {
      const result = await uploadLocalDataToCloud(uid, (current, total) => {
        setSyncProgress({ current, total });
      });
      Toast.show({
        type: 'success',
        text1: 'Backup Complete',
        text2: `Successfully backed up ${result.success} transactions.`,
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Sync Incomplete',
        text2: err?.message || 'Could not upload to cloud. Will retry automatically.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Turn OFF: Keep Cloud Copy
  const handleKeepCloudCopy = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    await setCloudSyncEnabled(false);
    setSyncEnabled(false);
    setShowDisableSheet(false);
    Toast.show({
      type: 'info',
      text1: 'Cloud Sync Paused',
      text2: 'Your data stays only on this phone. Pending uploads are paused.',
    });
  };

  // Turn OFF: Delete Cloud Copy
  const handleDeleteCloudCopy = async () => {
    if (!user?.uid) {
      await setCloudSyncEnabled(false);
      setSyncEnabled(false);
      setShowDisableSheet(false);
      return;
    }

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}

    setIsDeletingCloud(true);
    try {
      const res = await deleteCloudCopy(user.uid);
      if (res.success) {
        await setCloudSyncEnabled(false);
        setSyncEnabled(false);
        setShowDisableSheet(false);
        Toast.show({
          type: 'success',
          text1: 'Cloud Copy Deleted',
          text2: 'All remote records have been removed. Operating purely on-device.',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Deletion Error',
          text2: res.error || 'Failed to delete remote records.',
        });
      }
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Deletion Error',
        text2: e?.message || 'Failed to delete remote records.',
      });
    } finally {
      setIsDeletingCloud(false);
    }
  };

  // CSV Export
  const handleExportCSV = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    setIsExporting(true);
    try {
      const targetUid = user?.uid || 'local';
      const res = await exportTransactionsToCSV(targetUid);
      if (res.success) {
        Toast.show({
          type: 'success',
          text1: 'Export Ready',
          text2: 'CSV generated successfully from local storage.',
        });
      } else {
        Toast.show({
          type: 'info',
          text1: 'Export Notice',
          text2: res.error || 'No transactions available to export.',
        });
      }
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Export Failed',
        text2: err?.message || 'Could not export transactions.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Account & Data Deletion
  const handleExecuteDeleteAccount = async () => {
    if (deleteInputText.trim().toUpperCase() !== 'DELETE') {
      Toast.show({
        type: 'error',
        text1: 'Confirmation Required',
        text2: 'Please type DELETE exactly to confirm account deletion.',
      });
      return;
    }

    setIsDeletingAccount(true);
    try {
      const targetUid = user?.uid || 'local';
      const res = await deleteAccountAndAllData(targetUid);
      if (res.success) {
        setShowDeleteAccountModal(false);
        await logout();
        router.replace('/login');
        Toast.show({
          type: 'success',
          text1: 'Account & Data Deleted',
          text2: 'All remote and local data has been permanently cleared.',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Deletion Error',
          text2: res.error || 'Failed to complete deletion.',
        });
      }
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Deletion Error',
        text2: err?.message || 'Failed to delete account.',
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F59E0B" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Data</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Plain English Privacy Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.shieldIconWrap}>
              <Ionicons name="shield-checkmark" size={20} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Privacy Guarantees</Text>
              <Text style={styles.summarySubtitle}>Pure on-device privacy by default</Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          {/* Section A: What Stays on Device */}
          <View style={styles.summaryItem}>
            <View style={[styles.bulletDot, { backgroundColor: '#10B981' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryItemTitle}>Stays on this device only</Text>
              <Text style={styles.summaryItemDesc}>
                Bank SMS, alert texts, account numbers, UPI reference numbers (UTR), and diagnostic logs never leave your phone.
              </Text>
            </View>
          </View>

          {/* Section B: What is Synced */}
          <View style={styles.summaryItem}>
            <View style={[styles.bulletDot, { backgroundColor: '#3B82F6' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryItemTitle}>Synced to cloud (ONLY when Sync is ON)</Text>
              <Text style={styles.summaryItemDesc}>
                Transaction amount, category, date, payee name, and your personal typed memo for multi-device backup.
              </Text>
            </View>
          </View>

          {/* Section C: What is Never Collected */}
          <View style={styles.summaryItem}>
            <View style={[styles.bulletDot, { backgroundColor: '#DC2626' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryItemTitle}>NEVER collected or uploaded</Text>
              <Text style={styles.summaryItemDesc}>
                Passwords, ATM PINs, UPI MPINs, OTP codes, card CVVs, or contacts. Rupeo does not link directly to bank accounts.
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Cloud Sync Setting Section */}
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingIconWrap}>
              <Ionicons
                name={syncEnabled ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={22}
                color={syncEnabled ? '#0284C7' : '#64748B'}
              />
            </View>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.settingTitle}>Cloud Sync</Text>
              <Text style={styles.settingDesc}>
                {syncEnabled
                  ? 'Your transactions are backed up securely to your account'
                  : 'Cloud sync is paused. Your data stays 100% on this phone'}
              </Text>
            </View>
            <Switch
              value={syncEnabled}
              onValueChange={handleToggleSync}
              trackColor={{ false: '#CBD5E1', true: '#FDE047' }}
              thumbColor={syncEnabled ? '#EAB308' : '#F1F5F9'}
            />
          </View>

          {/* Sync in progress indicator */}
          {isSyncing && (
            <View style={styles.syncProgressWrap}>
              <ActivityIndicator size="small" color="#D97706" style={{ marginRight: 8 }} />
              <Text style={styles.syncProgressText}>
                Uploading backup: {syncProgress.current} / {syncProgress.total} items...
              </Text>
            </View>
          )}

          {/* Local Count Badge */}
          <View style={styles.localStatsRow}>
            <Ionicons name="phone-portrait-outline" size={14} color="#64748B" style={{ marginRight: 5 }} />
            <Text style={styles.localStatsText}>
              On-Device Records: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{localTxCount}</Text> transactions
            </Text>
          </View>
        </View>

        {/* 3. Data Portability Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>DATA PORTABILITY</Text>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleExportCSV}
            activeOpacity={0.7}
            disabled={isExporting}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="download-outline" size={20} color="#16A34A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Export My Data (CSV)</Text>
              <Text style={styles.actionDesc}>Download all local transactions in standard CSV spreadsheet format</Text>
            </View>
            {isExporting ? (
              <ActivityIndicator size="small" color="#16A34A" />
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            )}
          </TouchableOpacity>
        </View>

        {/* 4. Transparency & Legal Documents */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>LEGAL & POLICIES</Text>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setLegalModalType('privacy')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#F0FDFA' }]}>
              <Ionicons name="shield-outline" size={20} color="#0D9488" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Privacy Policy</Text>
              <Text style={styles.actionDesc}>Detailed on-device encryption and third-party policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setLegalModalType('terms')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#F1F5F9' }]}>
              <Ionicons name="document-text-outline" size={20} color="#475569" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Terms & Conditions</Text>
              <Text style={styles.actionDesc}>Terms of service, user rights, and financial disclaimers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* 5. Danger Zone: Cloud Purge & Account Deletion */}
        <View style={[styles.sectionCard, styles.dangerSectionCard]}>
          <Text style={[styles.sectionCardTitle, { color: '#DC2626' }]}>DANGER ZONE</Text>

          {user?.uid && user.uid !== 'local' && (
            <>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => setShowDisableSheet(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="cloud-offline-outline" size={20} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionTitle, { color: '#DC2626' }]}>Delete Cloud Copy</Text>
                  <Text style={styles.actionDesc}>Purge remote backups while keeping data on this device</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#DC2626" />
              </TouchableOpacity>

              <View style={styles.actionDivider} />
            </>
          )}

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setShowDeleteAccountModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: '#DC2626' }]}>Delete Account & Data</Text>
              <Text style={styles.actionDesc}>Permanently erase your account, cloud data, and local storage</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Disable Cloud Sync Confirmation Bottom Sheet */}
      <Modal
        visible={showDisableSheet}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDisableSheet(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetIconWrap}>
              <Ionicons name="cloud-offline" size={32} color="#D97706" />
            </View>

            <Text style={styles.sheetTitle}>Turn Off Cloud Sync?</Text>
            <Text style={styles.sheetMessage}>
              Your data will stay only on this phone. If you lose or reset the phone, it cannot be recovered. Delete my existing cloud data too?
            </Text>

            <View style={styles.sheetButtonsCol}>
              <TouchableOpacity
                style={[styles.sheetButton, styles.keepButton]}
                onPress={handleKeepCloudCopy}
                activeOpacity={0.85}
              >
                <Text style={styles.keepButtonText}>Keep cloud copy</Text>
              </TouchableOpacity>

              {user?.uid && user.uid !== 'local' && (
                <TouchableOpacity
                  style={[styles.sheetButton, styles.deleteCloudButton]}
                  onPress={handleDeleteCloudCopy}
                  activeOpacity={0.85}
                  disabled={isDeletingCloud}
                >
                  {isDeletingCloud ? (
                    <ActivityIndicator size="small" color="#DC2626" />
                  ) : (
                    <Text style={styles.deleteCloudButtonText}>Delete cloud copy</Text>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.sheetButton, styles.cancelButton]}
                onPress={() => setShowDisableSheet(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account & Data Modal (confirm by typing "DELETE") */}
      <Modal
        visible={showDeleteAccountModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDeleteAccountModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteAccountCard}>
            <View style={styles.dangerIconBadge}>
              <Ionicons name="warning" size={30} color="#DC2626" />
            </View>

            <Text style={styles.deleteAccountTitle}>Permanent Account Deletion</Text>
            <Text style={styles.deleteAccountDesc}>
              This action cannot be undone. All your transactions, categories, and account details will be irreversibly erased from both the cloud and this device.
            </Text>

            <Text style={styles.typeConfirmLabel}>
              Type <Text style={{ fontWeight: '800', color: '#DC2626' }}>DELETE</Text> to confirm:
            </Text>

            <TextInput
              style={styles.deleteTextInput}
              value={deleteInputText}
              onChangeText={setDeleteInputText}
              placeholder="DELETE"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <View style={styles.deleteModalButtonsRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => {
                  setDeleteInputText('');
                  setShowDeleteAccountModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmDeleteBtn,
                  deleteInputText.trim().toUpperCase() !== 'DELETE' && styles.confirmDeleteBtnDisabled,
                ]}
                onPress={handleExecuteDeleteAccount}
                disabled={deleteInputText.trim().toUpperCase() !== 'DELETE' || isDeletingAccount}
                activeOpacity={0.85}
              >
                {isDeletingAccount ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmDeleteBtnText}>Delete Permanently</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* In-App Legal Modal */}
      <LegalModal
        visible={legalModalType !== null}
        type={legalModalType}
        onClose={() => setLegalModalType(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEFCF7', // Warm ivory cream matching app design
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FEFCF7',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      },
    }),
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
      },
    }),
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shieldIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  summarySubtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#059669',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  summaryItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  summaryItemDesc: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 4px rgba(15,23,42,0.03)',
      },
    }),
  },
  dangerSectionCard: {
    borderColor: '#FECACA',
    backgroundColor: '#FFFDFD',
  },
  sectionCardTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 17,
  },
  syncProgressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  syncProgressText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#92400E',
  },
  localStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  localStatsText: {
    fontSize: 12,
    color: '#64748B',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  actionDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 16,
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheetContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
      },
    }),
  },
  sheetIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  sheetMessage: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  sheetButtonsCol: {
    width: '100%',
    gap: 10,
  },
  sheetButton: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepButton: {
    backgroundColor: '#FACC15',
  },
  keepButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  deleteCloudButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteCloudButtonText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
  },
  cancelButtonText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#475569',
  },
  deleteAccountCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
  },
  dangerIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deleteAccountTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  deleteAccountDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  typeConfirmLabel: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  deleteTextInput: {
    width: '100%',
    height: 48,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
    backgroundColor: '#F8FAFC',
    marginBottom: 18,
    textAlign: 'center',
    letterSpacing: 2,
  },
  deleteModalButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#475569',
  },
  confirmDeleteBtn: {
    flex: 1.3,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteBtnDisabled: {
    backgroundColor: '#FCA5A5',
  },
  confirmDeleteBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
