import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  TextInput,
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
import { syncWidgetWithTransactions } from '@/lib/widgetSync';
import { resetImportHistory } from '@/lib/smsDedupe';
import { exportTransactions, importTransactionsFromText, pickBackupFileContent } from '@/lib/backup';
import { deleteAllTransactions, getAllTransactions } from '@/lib/database';
import { generateAndShareTransactionStatementPDF } from '@/lib/statementPdf';
import { getLocalMonthString } from '@/lib/dateUtils';
import Constants from 'expo-constants';

export default function AdvancedSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, settings } = useAuth();

  const [isSyncingWidget, setIsSyncingWidget] = useState(false);
  const [isResettingHistory, setIsResettingHistory] = useState(false);
  const [resetHistoryModalVisible, setResetHistoryModalVisible] = useState(false);
  const [deleteDataModalVisible, setDeleteDataModalVisible] = useState(false);
  const [isDeletingData, setIsDeletingData] = useState(false);

  // Quick export state
  const [isExporting, setIsExporting] = useState(false);
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

  const handleQuickExportJson = async () => {
    if (!uid) return;
    setIsExporting(true);
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
      setIsExporting(false);
    }
  };

  const handleQuickExportCsv = async () => {
    if (!uid) return;
    setIsExporting(true);
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
      setIsExporting(false);
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
            loading={isExporting}
            onPress={handleQuickExportJson}
          />
          <SettingsRow
            icon="document-attach"
            iconBg="#EFF6FF"
            iconColor="#2563EB"
            label="Export Spreadsheet (CSV)"
            subtitle="Compatible with Microsoft Excel, Google Sheets & Numbers"
            loading={isExporting}
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

        {/* SECTION 4: DIAGNOSTICS & INFO */}
        <SettingsSection title="Diagnostics & Build">
          <SettingsRow
            icon="information-circle"
            iconBg="#F1F5F9"
            iconColor="#475569"
            label="App Version"
            value="v2.1.9 (Build 219)"
            showChevron={false}
          />
          <SettingsRow
            icon="phone-portrait"
            iconBg="#F1F5F9"
            iconColor="#475569"
            label="Platform"
            value={`${Platform.OS.toUpperCase()} • Expo SDK 57`}
            showChevron={false}
          />
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
});
