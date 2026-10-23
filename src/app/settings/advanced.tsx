import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  TextInput,
  Clipboard,
  Modal,
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
import { AdminUpdateModal } from '@/components/AdminUpdateModal';
import { syncWidgetWithTransactions } from '@/lib/widgetSync';
import { resetImportHistory } from '@/lib/smsDedupe';
import { exportTransactions, importTransactionsFromText, pickBackupFileContent } from '@/lib/backup';
import { deleteAllTransactions, getAllTransactions } from '@/lib/database';
import { generateAndShareTransactionStatementPDF } from '@/lib/statementPdf';
import { getLocalMonthString } from '@/lib/dateUtils';
import Constants from 'expo-constants';
import { APP_VERSION, APP_VERSION_CODE, APP_VERSION_DISPLAY, APP_PLATFORM } from '@/constants/version';
import { repairCorruptedStorageKeys } from '@/lib/safeStorage';
import { getLastCrash, clearLastCrash, CrashReport } from '@/lib/crashReporting';

export default function AdvancedSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, settings, appConfig } = useAuth();

  const [isSyncingWidget, setIsSyncingWidget] = useState(false);
  const [isResettingHistory, setIsResettingHistory] = useState(false);
  const [resetHistoryModalVisible, setResetHistoryModalVisible] = useState(false);
  const [deleteDataModalVisible, setDeleteDataModalVisible] = useState(false);
  const [isDeletingData, setIsDeletingData] = useState(false);
  const [adminUpdateModalVisible, setAdminUpdateModalVisible] = useState(false);
  const [versionTapCount, setVersionTapCount] = useState(0);

  // Diagnostics & Reliability state
  const [isRepairingData, setIsRepairingData] = useState(false);
  const [lastCrash, setLastCrash] = useState<CrashReport | null>(null);
  const [crashModalVisible, setCrashModalVisible] = useState(false);

  useEffect(() => {
    getLastCrash().then(setLastCrash).catch(() => {});
  }, []);

  const isAdmin =
    user?.email === 'admin@rupeo.app' ||
    user?.email === 'ya041304@gmail.com' ||
    user?.email === 'innovatexlab.services@gmail.com' ||
    (user as any)?.admin === true ||
    versionTapCount >= 5;

  // Quick export state
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const uid = user?.uid;
  const curr = settings?.currency || '₹';

  const handleSyncWidgets = async () => {
    if (!uid) return;
    setIsSyncingWidget(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    await syncWidgetWithTransactions(uid);
    setIsSyncingWidget(false);
    Toast.show({
      type: 'success',
      text1: 'Widgets Synchronized! 📱',
      text2: 'Home screen balance and spend cards updated.',
    });
  };

  const handleResetHistory = async () => {
    if (!uid) return;
    setIsResettingHistory(true);
    await resetImportHistory(uid);
    setIsResettingHistory(false);
    setResetHistoryModalVisible(false);
    Toast.show({
      type: 'success',
      text1: 'Import History Reset',
      text2: 'Duplicate tracking cache cleared.',
    });
  };

  const handleRepairAppData = async () => {
    setIsRepairingData(true);
    try {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
      const repairRes = await repairCorruptedStorageKeys();
      if (repairRes.corruptedKeys.length > 0) {
        Toast.show({
          type: 'success',
          text1: 'Storage Repaired ✅',
          text2: `Cleaned ${repairRes.corruptedKeys.length} corrupt item(s). Transactions and session safe.`,
          visibilityTime: 4000,
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'All Storage Healthy ✨',
          text2: 'No corrupted cache keys found. Transactions and login intact.',
          visibilityTime: 3500,
        });
      }
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Repair Error',
        text2: err?.message || 'Failed to check storage keys.',
      });
    } finally {
      setIsRepairingData(false);
    }
  };

  const handleClearCrashLog = async () => {
    await clearLastCrash();
    setLastCrash(null);
    setCrashModalVisible(false);
    Toast.show({
      type: 'info',
      text1: 'Crash Log Cleared',
      text2: 'Diagnostic crash report was removed.',
    });
  };

  const handleQuickExportJson = async () => {
    if (!uid) return;
    setIsExportingJson(true);
    try {
      const res = await exportTransactions(uid, 'json', { periodMode: 'all' });
      if (res.success) {
        Toast.show({
          type: 'success',
          text1: 'Export Complete ✅',
          text2: `Saved ${res.count} transactions to ${res.filename}`,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Export Failed',
          text2: res.error || 'No transactions to export.',
        });
      }
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Export Error',
        text2: e?.message || 'Failed to export transactions.',
      });
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleQuickExportCsv = async () => {
    if (!uid) return;
    setIsExportingCsv(true);
    try {
      const res = await exportTransactions(uid, 'csv', { periodMode: 'all' });
      if (res.success) {
        Toast.show({
          type: 'success',
          text1: 'CSV Export Complete ✅',
          text2: `Saved ${res.count} transactions to ${res.filename}`,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Export Failed',
          text2: res.error || 'No transactions to export.',
        });
      }
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Export Error',
        text2: e?.message || 'Failed to export transactions.',
      });
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleQuickStatementPdf = async () => {
    if (!user) return;
    setIsGeneratingPdf(true);
    try {
      const txs = await getAllTransactions(user.uid, true);
      const res = await generateAndShareTransactionStatementPDF({
        userName: user.displayName || 'Rupeo User',
        userEmail: user.email || '',
        periodMode: 'all',
        monthStr: getLocalMonthString(),
        typeFilter: 'all',
        curr,
        transactions: txs,
      });

      if (res.success) {
        Toast.show({
          type: 'success',
          text1: 'Statement PDF Generated! 📑',
          text2: `${res.count} transactions exported with official Rupeo branding`,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Statement Failed',
          text2: res.error || 'No transactions found to generate statement.',
        });
      }
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'PDF Generation Error',
        text2: err?.message || 'Failed to create statement PDF.',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePickAndRestoreBackup = async () => {
    if (!uid) return;
    try {
      const { rawText } = await pickBackupFileContent();
      if (!rawText.trim()) return;
      setIsImporting(true);
      const res = await importTransactionsFromText(uid, rawText);
      await syncWidgetWithTransactions(uid).catch(() => {});
      Toast.show({
        type: 'success',
        text1: 'Backup Restored Successfully ✅',
        text2: `Imported ${res.imported} records (${res.skipped} skipped).`,
        visibilityTime: 4000,
      });
    } catch (err: any) {
      if (err?.message !== 'CANCELED' && err?.message !== 'File selection was canceled.') {
        Toast.show({
          type: 'error',
          text1: 'Restore Failed ❌',
          text2: err?.message || 'Invalid format. Please check your backup file.',
        });
      }
    } finally {
      setIsImporting(false);
    }
  };

  const executeDeleteAllData = async () => {
    if (!uid) return;
    try {
      setIsDeletingData(true);
      await deleteAllTransactions(uid);
      await syncWidgetWithTransactions(uid).catch(() => {});
      setDeleteDataModalVisible(false);
      Toast.show({ type: 'success', text1: 'All transactions deleted' });
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not delete transactions',
        text2: e?.message || 'Please try again.',
      });
    } finally {
      setIsDeletingData(false);
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
          <Text style={styles.headerTitle}>Advanced & Data Tools</Text>
          <Text style={styles.headerSubtitle}>Technical utilities, backups & diagnostics</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* SECTION 1: STATEMENTS & PASSBOOK */}
        <SettingsSection title="Statements & Passbook">
          <SettingsRow
            icon="document-text"
            iconBg="#FEF2F2"
            iconColor="#DC2626"
            label="Generate Statement PDF"
            subtitle="Export branded passbook PDF with income, expense & QR code"
            badge="OFFICIAL"
            badgeBg="#FEE2E2"
            badgeColor="#DC2626"
            loading={isGeneratingPdf}
            onPress={handleQuickStatementPdf}
            isLast
          />
        </SettingsSection>

        {/* SECTION 2: BACKUP & RESTORE */}
        <SettingsSection title="Data Backup & Restore">
          <SettingsRow
            icon="cloud-download"
            iconBg="#ECFDF5"
            iconColor="#059669"
            label="Export JSON Backup"
            subtitle="Full data snapshot with categories, notes & tags"
            loading={isExportingJson}
            disabled={isExportingJson || isExportingCsv}
            onPress={handleQuickExportJson}
          />
          <SettingsRow
            icon="document-attach"
            iconBg="#EFF6FF"
            iconColor="#2563EB"
            label="Export Spreadsheet (CSV)"
            subtitle="Compatible with Microsoft Excel, Google Sheets & Numbers"
            loading={isExportingCsv}
            disabled={isExportingJson || isExportingCsv}
            onPress={handleQuickExportCsv}
          />
          <SettingsRow
            icon="cloud-upload"
            iconBg="#F5F3FF"
            iconColor="#7C3AED"
            label="Restore Backup File"
            subtitle="Import previously exported JSON or CSV files"
            loading={isImporting}
            onPress={handlePickAndRestoreBackup}
            isLast
          />
        </SettingsSection>

        {/* SECTION 3: SYSTEM & SYNC */}
        <SettingsSection title="System Sync & Cache">
          <SettingsRow
            icon="sync"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
            label="Force Widget Synchronization"
            subtitle="Refresh Android home screen widgets with newest spend totals"
            loading={isSyncingWidget}
            onPress={handleSyncWidgets}
          />
          <SettingsRow
            icon="refresh"
            iconBg="#FEF2F2"
            iconColor="#DC2626"
            label="Reset SMS Import Cache"
            subtitle="Clear duplicate message hashes to re-evaluate transactions"
            onPress={() => setResetHistoryModalVisible(true)}
            isLast
          />
        </SettingsSection>

        {/* SECTION 4: DIAGNOSTICS & RELIABILITY */}
        <SettingsSection title="Diagnostics & Reliability">
          <SettingsRow
            icon="build-outline"
            iconBg="#FEF3C7"
            iconColor="#D97706"
            label="Repair App Data"
            subtitle="Safe non-destructive cache check. Cleans corrupted items without touching transactions or session."
            loading={isRepairingData}
            disabled={isRepairingData}
            onPress={handleRepairAppData}
          />
          <SettingsRow
            icon="bug-outline"
            iconBg={lastCrash ? '#FEF2F2' : '#F1F5F9'}
            iconColor={lastCrash ? '#DC2626' : '#64748B'}
            label="Last Crash Report"
            subtitle={
              lastCrash
                ? `${new Date(lastCrash.timestamp).toLocaleDateString()} ${new Date(lastCrash.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${lastCrash.source}`
                : 'No crashes recorded'
            }
            badge={lastCrash ? (lastCrash.fatal ? 'FATAL' : 'WARNED') : undefined}
            badgeBg={lastCrash ? (lastCrash.fatal ? '#FEE2E2' : '#FEF3C7') : undefined}
            badgeColor={lastCrash ? (lastCrash.fatal ? '#DC2626' : '#D97706') : undefined}
            onPress={() => setCrashModalVisible(true)}
            isLast
          />
        </SettingsSection>

        {/* SECTION 5: ABOUT / APP INFORMATION */}
        <SettingsSection title="About">
          <SettingsRow
            icon="information-circle"
            iconBg="#F1F5F9"
            iconColor="#475569"
            label="App version"
            value={`v${APP_VERSION}`}
            showChevron={false}
            onPress={() => {
              const next = versionTapCount + 1;
              setVersionTapCount(next);
              if (next >= 5) {
                Toast.show({
                  type: 'info',
                  text1: 'Admin Controls Unlocked 🔓',
                  text2: 'Remote update broadcast manager is now available.',
                });
              }
            }}
            onLongPress={() => {
              Clipboard.setString(`Rupeo ${APP_VERSION_DISPLAY}`);
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              Toast.show({
                type: 'success',
                text1: 'Copied',
                text2: `Rupeo ${APP_VERSION_DISPLAY}`,
                visibilityTime: 2000,
              });
            }}
          />
          <SettingsRow
            icon="code-slash-outline"
            iconBg="#F1F5F9"
            iconColor="#475569"
            label="Build number"
            value={`${APP_VERSION_CODE}`}
            showChevron={false}
            onLongPress={() => {
              Clipboard.setString(`Rupeo ${APP_VERSION_DISPLAY}`);
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              Toast.show({
                type: 'success',
                text1: 'Copied',
                text2: `Rupeo ${APP_VERSION_DISPLAY}`,
                visibilityTime: 2000,
              });
            }}
          />
          <SettingsRow
            icon="phone-portrait"
            iconBg="#F1F5F9"
            iconColor="#475569"
            label="Platform"
            value={APP_PLATFORM}
            showChevron={false}
          />
          {isAdmin && (
            <SettingsRow
              icon="cloud-upload"
              iconBg="#EEF2FF"
              iconColor="#4F46E5"
              label="Remote Update Manager"
              subtitle={
                appConfig.updatePromptEnabled !== false &&
                (appConfig.latestVersion || appConfig.latestVersionCode)
                  ? `Active: v${appConfig.latestVersion || APP_VERSION} • ${appConfig.forceUpdate ? 'Mandatory' : 'Optional'}`
                  : 'Broadcast update popup to users (Play Store)'
              }
              onPress={() => setAdminUpdateModalVisible(true)}
            />
          )}
          <SettingsRow
            icon="trash"
            iconBg="#FEF2F2"
            iconColor="#DC2626"
            label="Delete All Transactions"
            subtitle="Permanently erase all transaction records from your account"
            isDestructive
            onPress={() => setDeleteDataModalVisible(true)}
            isLast
          />
        </SettingsSection>
      </ScrollView>

      {/* Reset History Modal */}
      <ConfirmDialogModal
        visible={resetHistoryModalVisible}
        onCancel={() => setResetHistoryModalVisible(false)}
        onConfirm={handleResetHistory}
        title="Reset Import Cache?"
        message="This clears the processed SMS hashes and import timestamps. Next time you scan, past messages will be re-evaluated as new alerts."
        confirmText="Reset Cache"
        type="danger"
        icon="refresh-outline"
        loading={isResettingHistory}
      />

      {/* Delete All Data Modal */}
      <ConfirmDialogModal
        visible={deleteDataModalVisible}
        onCancel={() => setDeleteDataModalVisible(false)}
        onConfirm={executeDeleteAllData}
        title="Delete All Transactions?"
        message="Are you sure you want to delete all transactions? This action cannot be undone and will permanently erase your transaction history."
        confirmText="Delete All Data"
        type="danger"
        icon="trash-outline"
        loading={isDeletingData}
      />

      {/* Admin Remote Update Broadcast Modal */}
      <AdminUpdateModal
        visible={adminUpdateModalVisible}
        onClose={() => setAdminUpdateModalVisible(false)}
      />

      {/* Crash Diagnostics Modal */}
      <Modal
        visible={crashModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCrashModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.crashModalCard}>
            <View style={styles.crashModalHeader}>
              <View style={styles.crashModalTitleContainer}>
                <View style={[styles.crashModalIcon, { backgroundColor: lastCrash ? '#FEF2F2' : '#EFF6FF' }]}>
                  <Ionicons
                    name={lastCrash ? 'bug' : 'shield-checkmark'}
                    size={20}
                    color={lastCrash ? '#DC2626' : '#2563EB'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.crashModalTitle}>Crash Diagnostics</Text>
                  <Text style={styles.crashModalSubtitle}>
                    {lastCrash ? 'Last captured runtime exception' : 'Application health status'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setCrashModalVisible(false)}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {lastCrash ? (
              <ScrollView style={styles.crashModalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.crashMetaRow}>
                  <View style={styles.crashMetaBadge}>
                    <Text style={styles.crashMetaLabel}>SOURCE</Text>
                    <Text style={styles.crashMetaValue}>{lastCrash.source}</Text>
                  </View>
                  <View style={[styles.crashMetaBadge, { backgroundColor: lastCrash.fatal ? '#FEF2F2' : '#FEF3C7' }]}>
                    <Text style={[styles.crashMetaLabel, { color: lastCrash.fatal ? '#991B1B' : '#92400E' }]}>
                      SEVERITY
                    </Text>
                    <Text style={[styles.crashMetaValue, { color: lastCrash.fatal ? '#DC2626' : '#D97706' }]}>
                      {lastCrash.fatal ? 'Fatal Crash' : 'Startup Delay'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.crashSectionHeader}>Timestamp</Text>
                <Text style={styles.crashTimestampText}>
                  {new Date(lastCrash.timestamp).toLocaleString()}
                </Text>

                <Text style={styles.crashSectionHeader}>Error Message</Text>
                <View style={styles.crashMessageBox}>
                  <Text style={styles.crashMessageText} selectable>
                    {lastCrash.message || 'No error message provided'}
                  </Text>
                </View>

                {lastCrash.stack ? (
                  <>
                    <View style={styles.crashStackHeaderRow}>
                      <Text style={styles.crashSectionHeader}>Sanitized Call Stack</Text>
                      <TouchableOpacity
                        onPress={() => {
                          Clipboard.setString(lastCrash.stack || '');
                          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                          Toast.show({
                            type: 'success',
                            text1: 'Stack Copied',
                            text2: 'Sanitized stack trace copied to clipboard.',
                          });
                        }}
                        style={styles.copyStackBtn}
                      >
                        <Ionicons name="copy-outline" size={13} color="#4F46E5" style={{ marginRight: 4 }} />
                        <Text style={styles.copyStackBtnText}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.crashStackBox} nestedScrollEnabled>
                      <Text style={styles.crashStackText} selectable>
                        {lastCrash.stack}
                      </Text>
                    </ScrollView>
                  </>
                ) : null}

                <View style={styles.crashModalActions}>
                  <TouchableOpacity
                    style={styles.clearCrashBtn}
                    onPress={handleClearCrashLog}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                    <Text style={styles.clearCrashBtnText}>Clear Crash Report</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <View style={styles.emptyCrashState}>
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                <Text style={styles.emptyCrashTitle}>No Crashes Recorded</Text>
                <Text style={styles.emptyCrashSubtitle}>
                  Your app has been running smoothly without unhandled exceptions or watchdog timeouts.
                </Text>
              </View>
            )}
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  crashModalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
    elevation: 6,
  },
  crashModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  crashModalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  crashModalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  crashModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  crashModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  crashModalBody: {
    marginTop: 14,
  },
  crashMetaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  crashMetaBadge: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 8,
  },
  crashMetaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  crashMetaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  crashSectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  crashTimestampText: {
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 14,
    fontWeight: '500',
  },
  crashMessageBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  crashMessageText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
    fontWeight: '500',
  },
  crashStackHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  copyStackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  copyStackBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  crashStackBox: {
    maxHeight: 150,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  crashStackText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#334155',
    lineHeight: 16,
  },
  crashModalActions: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  clearCrashBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  clearCrashBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  emptyCrashState: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCrashTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyCrashSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
