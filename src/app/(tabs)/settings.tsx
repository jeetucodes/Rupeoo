import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Switch,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getCategoryTotals, deleteAllTransactions, saveStartingBalance, saveUserSettings, UserSettings, getAllTransactions, normalizeDate } from '@/lib/database';
import { syncWidgetWithTransactions } from '@/lib/widgetSync';
import { getSyncUdharToDashboardTx, setSyncUdharToDashboardTx, saveLastUsedUpiId } from '@/lib/udharStorage';
import { validateUpiId } from '@/lib/splitPayment';
import { getLocalMonthString } from '@/lib/dateUtils';
import { generateAndShareTransactionStatementPDF, formatMonthDisplay } from '@/lib/statementPdf';
import { useTranslation } from '@/lib/i18n';
import { deleteUser, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { promptGoogleSignIn } from '@/lib/google-auth';
import { exportTransactions, pickAndImportBackupFile, importTransactionsFromText, pickBackupFileContent } from '@/lib/backup';
import Toast from 'react-native-toast-message';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';
import { ALL_CURRENCIES } from '@/lib/currencies';
import { CurrencySelectorModal } from '@/components/CurrencySelectorModal';
import { VipAvatar } from '@/components/VipAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { restorePurchases } from '@/lib/iap';
import { HelpSupportModal } from '@/components/help-support-modal';
import { requestGooglePlayReview, openPlayStorePageDirectly, setUserReviewPrompted, clearReviewPending } from '@/lib/review';
import { GooglePlayReviewModal } from '@/components/GooglePlayReviewModal';
import Constants from 'expo-constants';
import {
  getSmsImportSettings,
  saveSmsImportSettings,
  SmsImportSettings,
  DEFAULT_SMS_SETTINGS,
  addCustomBank,
  removeCustomBank,
} from '@/lib/smsSettings';
import { resetImportHistory } from '@/lib/smsDedupe';
import { getPendingAlerts } from '@/lib/pendingInbox';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Language = 'English' | 'Hindi' | 'Hinglish';

const LANGUAGES: Language[] = ['English', 'Hindi', 'Hinglish'];

// ---------------------------------------------------------------------------
// Reusable: Pill Selector (replaces 3x duplicated inline pill logic)
// ---------------------------------------------------------------------------

function PillSelector<T extends string>({
  options,
  activeValue,
  onSelect,
  accent = false,
  a11yLabel,
}: {
  options: T[];
  activeValue: T;
  onSelect: (value: T) => void;
  accent?: boolean;
  a11yLabel: string;
}) {
  return (
    <View style={styles.pillContainer} accessibilityRole="radiogroup" accessibilityLabel={a11yLabel}>
      {options.map(option => {
        const isActive = activeValue === option;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.pill, isActive && (accent ? styles.activePillAccent : styles.activePill)]}
            onPress={() => onSelect(option)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option}
          >
            <Text style={[styles.pillText, isActive && (accent ? styles.activePillTextAccent : styles.activePillText)]}>
              {option}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Reusable: Bottom Sheet Modal (replaces 3x duplicated overlay/card structure)
// ---------------------------------------------------------------------------

function BottomSheetModal({
  visible,
  onClose,
  title,
  icon,
  iconBg,
  iconColor,
  gradientColors,
  autoHeight = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  gradientColors?: [string, string];
  autoHeight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalContent, autoHeight && styles.autoHeightModal]}
        >
          <View style={styles.modalDragHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              {icon && (
                <View style={[styles.infoIconBg, { backgroundColor: iconBg || '#F1F5F9', borderColor: iconBg || '#E2E8F0' }]}>
                  <Ionicons name={icon} size={20} color={iconColor || '#0F172A'} />
                </View>
              )}
              <Text style={styles.modalTitle}>{title}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.modalCloseBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
            >
              <Ionicons name="close" size={22} color="#1C1C1E" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.modalBody}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalBodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, settings, setSettings, refreshUser, isPremium, currentPlan, downgradeFromPremium, appConfig } = useAuth();
  const { t, lang } = useTranslation();

  const [totalSpend, setTotalSpend] = useState<number>(0);
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(null);
  const [syncUdharDashboard, setSyncUdharDashboard] = useState<boolean>(false);

  useEffect(() => {
    if (user?.uid) {
      getSyncUdharToDashboardTx(user.uid).then(setSyncUdharDashboard).catch(() => { });
    }
  }, [user?.uid]);

  const handleToggleUdharDashboard = async (val: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }
    setSyncUdharDashboard(val);
    await setSyncUdharToDashboardTx(user?.uid, val);
    Toast.show({
      type: val ? 'success' : 'info',
      text1: val ? (lang === 'Hindi' ? 'डैशबोर्ड में शामिल ✅' : 'Added to Dashboard Spends ✅') : (lang === 'Hindi' ? 'डैशबोर्ड से अलग' : 'Separate from Dashboard'),
      text2: val
        ? (lang === 'Hindi' ? 'उधार लेन-देन होम स्क्रीन खर्च और बजट में जुड़ेंगे' : 'Udhar transactions will record in Home spends & monthly budget')
        : (lang === 'Hindi' ? 'उधार लेन-देन सिर्फ खाताबुक में रहेंगे' : 'Udhar transactions will stay in Khata only'),
      position: 'top',
      visibilityTime: 2500,
    });
  };

  // SMS Import & Bank Alert State
  const [smsSettings, setSmsSettings] = useState<SmsImportSettings>(DEFAULT_SMS_SETTINGS);
  const [pendingAlertCount, setPendingAlertCount] = useState<number>(0);
  const [resetHistoryModalVisible, setResetHistoryModalVisible] = useState<boolean>(false);
  const [isResettingHistory, setIsResettingHistory] = useState<boolean>(false);
  const [customBankModalVisible, setCustomBankModalVisible] = useState<boolean>(false);
  const [customBankInput, setCustomBankInput] = useState<string>('');

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'web') return;
    const uid = user?.uid || 'local';
    getSmsImportSettings(uid).then((s) => setSmsSettings(s)).catch(() => {});
    getPendingAlerts(uid).then((alerts) => setPendingAlertCount(alerts.length)).catch(() => {});
  }, [user?.uid]);

  const handleUpdateSmsSetting = async (key: keyof SmsImportSettings, value: any) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    const uid = user?.uid || 'local';
    const updated = await saveSmsImportSettings(uid, { [key]: value });
    setSmsSettings(updated);

    if (key === 'saveOriginalInNote' && value === true) {
      Toast.show({
        type: 'info',
        text1: 'Note Sync Notice',
        text2: 'Transaction notes sync to the cloud with your account.',
        visibilityTime: 4000,
      });
    }
  };

  const handleResetImportHistory = async () => {
    setIsResettingHistory(true);
    const uid = user?.uid || 'local';
    await resetImportHistory(uid);
    setIsResettingHistory(false);
    setResetHistoryModalVisible(false);
    Toast.show({
      type: 'success',
      text1: 'Import History Reset',
      text2: 'Duplicate tracking and cursors have been cleared.',
      visibilityTime: 3500,
    });
  };

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [exportPeriodMode, setExportPeriodMode] = useState<'all' | 'month'>('all');
  const [exportMonth, setExportMonth] = useState<string>(getLocalMonthString());
  const [exportAvailableMonths, setExportAvailableMonths] = useState<string[]>([]);
  const [totalExportTxsCount, setTotalExportTxsCount] = useState<number>(0);
  const [exportAllTxs, setExportAllTxs] = useState<any[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [selectedImportFile, setSelectedImportFile] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showStartingBalanceModal, setShowStartingBalanceModal] = useState(false);
  const [startingBalanceInput, setStartingBalanceInput] = useState('');
  const [isSavingStartingBalance, setIsSavingStartingBalance] = useState(false);

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [deleteDataModalVisible, setDeleteDataModalVisible] = useState(false);
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);
  const [isDeletingData, setIsDeletingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const handleOpenPlayStoreReview = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }
    if (user?.uid) {
      setUserReviewPrompted(user.uid).catch(() => { });
      clearReviewPending(user.uid).catch(() => { });
    }
    await openPlayStorePageDirectly();
  };

  // Automatically sync widgets in the background when settings screen is active
  useEffect(() => {
    if (user?.uid) {
      syncWidgetWithTransactions(user.uid).catch(() => { });
    }
  }, [user?.uid]);

  const handleRestorePurchases = async () => {
    if (!user?.uid) return;
    setIsRestoring(true);
    try {
      const restored = await restorePurchases(user.uid);
      if (restored) {
        await refreshUser();
        Toast.show({
          type: 'success',
          text1: 'Subscription Restored! 🎉',
          text2: 'Aapka Rupeo Pro subscription restore ho gaya hai.',
        });
      } else {
        Toast.show({
          type: 'info',
          text1: 'No Active Subscription',
          text2: 'Is Google account pe koi active subscription nahi mila.',
        });
      }
    } catch (err: any) {
      console.error('Restore error:', err);
      Toast.show({
        type: 'error',
        text1: 'Restore Failed',
        text2: err?.message || 'Please try again later.',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const selectedCurrencyObj = ALL_CURRENCIES.find(c => c.symbol === settings?.currency || c.code === settings?.currency);
  const curr = selectedCurrencyObj?.symbol || settings?.currency || '₹';

  // ---- Statement PDF State ------------------------------------------------
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [statementPeriodMode, setStatementPeriodMode] = useState<'all' | 'month'>('all');
  const [statementMonth, setStatementMonth] = useState<string>(getLocalMonthString());
  const [statementTypeFilter, setStatementTypeFilter] = useState<'all' | 'debit' | 'credit'>('all');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statementTransactions, setStatementTransactions] = useState<any[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  const openStatementModal = async () => {
    if (!user?.uid) return;
    try {
      const txs = await getAllTransactions(user.uid, true);
      setStatementTransactions(txs);

      // Extract unique months from transactions plus current month
      const currentM = getLocalMonthString();
      const monthSet = new Set<string>();
      monthSet.add(currentM);

      const now = new Date();
      now.setMonth(now.getMonth() - 1);
      const lastM = getLocalMonthString(now);
      monthSet.add(lastM);

      txs.forEach((t: any) => {
        const norm = normalizeDate(t.date || '');
        if (norm && norm.length >= 7) {
          const m = norm.slice(0, 7);
          if (/^\d{4}-\d{2}$/.test(m)) {
            monthSet.add(m);
          }
        }
      });

      const sortedMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));
      setAvailableMonths(sortedMonths);
      setStatementMonth(currentM);
      setStatementPeriodMode('all');
      setStatementTypeFilter('all');
      setShowStatementModal(true);
    } catch (err) {
      console.error('Error preparing statement:', err);
    }
  };

  const previewTransactions = useMemo(() => {
    let list = [...statementTransactions];
    if (statementPeriodMode === 'month' && statementMonth) {
      list = list.filter(tx => tx.date && tx.date.startsWith(statementMonth));
    }
    if (statementTypeFilter !== 'all') {
      list = list.filter(tx => (tx.type || 'debit').toLowerCase() === statementTypeFilter);
    }
    return list;
  }, [statementTransactions, statementPeriodMode, statementMonth, statementTypeFilter]);

  const previewStats = useMemo(() => {
    let income = 0;
    let expense = 0;
    previewTransactions.forEach(tx => {
      const amt = Math.abs(Number(tx.amount) || 0);
      const type = (tx.type || 'debit').toLowerCase();
      if (type === 'credit' || type === 'income') {
        income += amt;
      } else {
        expense += amt;
      }
    });
    return {
      count: previewTransactions.length,
      income,
      expense,
      net: income - expense,
    };
  }, [previewTransactions]);

  const handleGenerateStatementPdf = async () => {
    if (!user) return;
    setIsGeneratingPdf(true);
    try {
      const res = await generateAndShareTransactionStatementPDF({
        userName: user.displayName || 'Rupeo User',
        userEmail: user.email || '',
        periodMode: statementPeriodMode,
        monthStr: statementMonth,
        typeFilter: statementTypeFilter,
        curr,
        transactions: statementTransactions,
      });

      if (res.success) {
        setShowStatementModal(false);
        Toast.show({
          type: 'success',
          text1: 'Statement PDF Generated! 📑',
          text2: `${res.count} transactions exported with official Rupeo branding`,
          visibilityTime: 4000,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Statement Failed ❌',
          text2: res.error || 'No transactions found to generate statement.',
          visibilityTime: 4000,
        });
      }
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'PDF Generation Error ❌',
        text2: err?.message || 'Failed to create statement PDF.',
        visibilityTime: 4000,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const refreshData = () => {
    if (user?.uid) {
      getCategoryTotals(user.uid)
        .then(cats => setTotalSpend(cats.reduce((sum, c) => sum + c.amount, 0)))
        .catch(err => {
          console.error(err);
          Toast.show({ type: 'error', text1: 'Could not load totals', text2: 'Pull to refresh and try again.' });
        });
    }
  };

  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ---- Export -------------------------------------------------------------

  const selectedMonthExportTxsCount = useMemo(() => {
    if (exportPeriodMode === 'all') return totalExportTxsCount;
    return exportAllTxs.filter((t: any) => {
      const norm = normalizeDate(t.date || '');
      return norm.startsWith(exportMonth);
    }).length;
  }, [exportPeriodMode, exportMonth, exportAllTxs, totalExportTxsCount]);

  const openExportModal = async () => {
    if (!user?.uid) return;
    try {
      const txs = await getAllTransactions(user.uid, true);
      setExportAllTxs(txs);
      setTotalExportTxsCount(txs.length);

      const currentM = getLocalMonthString();
      const monthSet = new Set<string>();
      monthSet.add(currentM);

      txs.forEach((t: any) => {
        if (t.date && typeof t.date === 'string' && t.date.length >= 7) {
          const m = t.date.slice(0, 7);
          if (/^\d{4}-\d{2}$/.test(m)) {
            monthSet.add(m);
          }
        }
      });

      const sortedMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));
      setExportAvailableMonths(sortedMonths);
      setExportMonth(currentM);
      setExportPeriodMode('all');
      setShowExportModal(true);
    } catch (err) {
      console.error('Error preparing export:', err);
      setShowExportModal(true);
    }
  };

  const handleExport = async (format: 'json' | 'csv' = exportFormat) => {
    if (!user?.uid) return;
    setIsExporting(true);
    try {
      const res = await exportTransactions(user.uid, format, {
        periodMode: exportPeriodMode,
        monthStr: exportMonth,
      });
      setShowExportModal(false);
      if (res.success) {
        Toast.show({
          type: 'success',
          text1: t('export_success_title'),
          text2: `Saved ${res.count} transactions (${exportPeriodMode === 'all' ? t('all_data') : formatMonthDisplay(exportMonth)}) to ${res.filename}`,
          visibilityTime: 4000,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: t('export_failed_title'),
          text2: res.error || t('no_txs_to_export'),
          visibilityTime: 4000,
        });
      }
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: t('export_failed_title'),
        text2: e?.message || t('no_txs_to_export'),
        visibilityTime: 4000,
      });
    } finally {
      setIsExporting(false);
    }
  };

  // ---- Import -------------------------------------------------------------

  const handlePickAndImportFile = async () => {
    try {
      const { rawText, filename } = await pickBackupFileContent();
      setImportText(rawText);
      setSelectedImportFile(filename);
    } catch (err: any) {
      if (err?.message !== 'CANCELED' && err?.message !== 'File selection was canceled.') {
        Toast.show({
          type: 'error',
          text1: 'File Selection Failed ❌',
          text2: err?.message || 'Failed to read file.',
          visibilityTime: 4000,
        });
      }
    }
  };

  const clearSelectedFile = () => {
    setImportText('');
    setSelectedImportFile(null);
  };

  const handleImportSubmit = async (textToImport?: string) => {
    const raw = textToImport || importText;
    if (!raw.trim()) {
      Toast.show({
        type: 'error',
        text1: 'No Data Provided',
        text2: 'Please paste JSON/CSV data or choose a backup file.',
      });
      return;
    }
    if (!user?.uid) return;
    setIsImporting(true);
    try {
      const result = await importTransactionsFromText(user.uid, raw);
      await getAllTransactions(user.uid, true);
      refreshData();
      setShowImportModal(false);
      setImportText('');
      setSelectedImportFile(null);
      Toast.show({
        type: 'success',
        text1: 'Backup Restored Successfully ✅',
        text2: `Imported ${result.imported} records (${result.skipped} skipped).`,
        visibilityTime: 4500,
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Import Failed ❌',
        text2: err?.message || 'Invalid format. Please check your data.',
        visibilityTime: 4000,
      });
    } finally {
      setIsImporting(false);
    }
  };

  // ---- Danger zone ----------------------------------------------------------
  // NOTE: deleteAllTransactions runs BEFORE deleteUser() in both flows below.
  // If deleteUser() throws (commonly `auth/requires-recent-login`), the
  // Firestore data is already gone but the auth account survives — an
  // inconsistent state. We surface that specific case with actionable copy
  // instead of a silent console.error, and stop the "logout" cleanup so the
  // user isn't logged out of a still-existing account without knowing why.

  const executeDeleteAllData = async () => {
    if (!user?.uid) return;
    try {
      setIsDeletingData(true);
      await deleteAllTransactions(user.uid);
      setTotalSpend(0);
      setDeleteDataModalVisible(false);
      Toast.show({ type: 'success', text1: 'All transactions deleted' });
    } catch (e: any) {
      console.error(e);
      Toast.show({
        type: 'error',
        text1: 'Could not delete transactions',
        text2: e?.message || 'Please try again.',
      });
    } finally {
      setIsDeletingData(false);
    }
  };

  const executeDeleteAccount = async () => {
    if (!user) return;
    try {
      setIsDeletingAccount(true);

      // Force a recent login before sensitive operations to prevent auth/requires-recent-login
      try {
        await promptGoogleSignIn();
      } catch (err: any) {
        // If the user cancels the re-authentication, abort the deletion process
        setIsDeletingAccount(false);
        return;
      }

      await deleteAllTransactions(user.uid);
      await deleteDoc(doc(db, `users/${user.uid}/settings/preferences`));
      await deleteDoc(doc(db, 'users', user.uid));
      if (!auth.currentUser) {
        throw new Error('No authenticated user found. Please sign in again.');
      }
      await deleteUser(auth.currentUser);
      setDeleteAccountModalVisible(false);
      logout();
    } catch (e: any) {
      console.error(e);
      if (e?.code === 'auth/requires-recent-login') {
        Toast.show({
          type: 'error',
          text1: 'Please log in again first',
          text2: 'For your security, re-login before deleting your account.',
          visibilityTime: 5000,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Account deletion failed',
          text2: e?.message || 'Your data may be partially deleted. Please contact support.',
          visibilityTime: 5000,
        });
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const updatePref = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!user?.uid || !settings) return;
    const newSettings: UserSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    try {
      await saveUserSettings(user.uid, newSettings);
      syncWidgetWithTransactions(user.uid).catch(() => { });
    } catch (e) {
      console.error(e);
      // Revert optimistic update on failure
      setSettings(settings);
      Toast.show({ type: 'error', text1: 'Could not save preference', text2: 'Please try again.' });
    }
  };

  const [showUpiModal, setShowUpiModal] = useState(false);
  const [upiInput, setUpiInput] = useState('');
  const [isSavingUpi, setIsSavingUpi] = useState(false);

  const handleSaveUpiId = async () => {
    if (!user?.uid || isSavingUpi) return;
    const cleanUpi = upiInput.trim();
    if (cleanUpi) {
      const validation = validateUpiId(cleanUpi);
      if (!validation.isValid) {
        Toast.show({
          type: 'error',
          text1: 'Invalid UPI ID',
          text2: validation.error || 'Please enter a valid UPI ID (e.g. name@bank)',
        });
        return;
      }
    }
    setIsSavingUpi(true);
    try {
      await updatePref('upiId', cleanUpi || undefined);
      await saveLastUsedUpiId(user.uid, cleanUpi);
      setShowUpiModal(false);
      Toast.show({
        type: 'success',
        text1: cleanUpi ? 'UPI ID Saved ✅' : 'UPI ID Cleared',
        text2: cleanUpi ? 'Your UPI ID will be used for QR payment on statements.' : undefined,
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not save UPI ID',
        text2: err?.message || 'Please try again.',
      });
    } finally {
      setIsSavingUpi(false);
    }
  };

  const openStartingBalanceEditor = () => {
    setStartingBalanceInput(String(Number((user as any)?.startingBalance) || 0));
    setShowStartingBalanceModal(true);
  };

  const handleSaveStartingBalance = async () => {
    if (!user?.uid || isSavingStartingBalance) return;
    setIsSavingStartingBalance(true);
    try {
      await saveStartingBalance(user.uid, Number(startingBalanceInput) || 0);
      await refreshUser();
      setShowStartingBalanceModal(false);
      Toast.show({ type: 'success', text1: 'Starting balance updated' });
    } catch (error) {
      console.error('Could not update starting balance:', error);
      Toast.show({ type: 'error', text1: 'Could not update balance', text2: 'Please try again.' });
    } finally {
      setIsSavingStartingBalance(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Please log in to view settings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const getPlanNameDisplay = (planKey?: string) => {
    if (planKey === 'monthly') return '1 Month Pro';
    if (planKey === '3_months') return '3 Months Pro';
    if (planKey === '6_months') return '6 Months Pro';
    if (planKey === 'yearly') return '1 Year Pro';
    if (planKey === 'lifetime') return 'Lifetime VIP 👑';
    return (planKey || 'PRO').toUpperCase();
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [versionTapCount, setVersionTapCount] = useState(0);

  const handleVersionTap = () => {
    const next = versionTapCount + 1;
    setVersionTapCount(next);
    if (next >= 7) {
      setVersionTapCount(0);
      Toast.show({
        type: 'info',
        text1: 'Developer Diagnostics',
        text2: `Rupeo v2.1.10 (37) • UID: ${user?.uid?.slice(0, 8)}... • Platform: ${Platform.OS}`,
        visibilityTime: 4000,
      });
    }
  };

  const searchableItems = useMemo(() => {
    return [
      {
        id: 'currency',
        section: 'MONEY',
        label: t('currency'),
        subtitle: selectedCurrencyObj ? `${selectedCurrencyObj.name} (${selectedCurrencyObj.symbol})` : 'Default Currency',
        icon: 'cash' as const,
        iconBg: '#F5F3FF',
        iconColor: '#7C3AED',
        action: () => setShowCurrencyModal(true),
        keywords: ['currency', 'rupee', 'inr', 'dollar', 'money', 'symbol', 'paisa'],
      },
      {
        id: 'categories',
        section: 'MONEY',
        label: t('manage_categories'),
        subtitle: t('manage_categories_desc'),
        icon: 'grid' as const,
        iconBg: '#EEF2FF',
        iconColor: '#4F46E5',
        action: () => router.push('/categories'),
        keywords: ['categories', 'food', 'travel', 'shopping', 'bills', 'custom category'],
      },
      {
        id: 'budget',
        section: 'MONEY',
        label: t('budget_goals'),
        subtitle: t('budget_goals_desc'),
        icon: 'pie-chart' as const,
        iconBg: '#FEF3C7',
        iconColor: '#D97706',
        action: () => router.push('/budget'),
        keywords: ['budget', 'monthly budget', 'goals', 'limit', 'spending limit'],
      },
      {
        id: 'starting_balance',
        section: 'MONEY',
        label: t('update_starting_balance'),
        subtitle: `${curr}${Number((user as any)?.startingBalance || 0).toLocaleString('en-IN')}`,
        icon: 'wallet' as const,
        iconBg: '#ECFDF5',
        iconColor: '#059669',
        action: openStartingBalanceEditor,
        keywords: ['balance', 'starting balance', 'opening balance', 'cash in hand', 'account balance'],
      },
      {
        id: 'reminders',
        section: 'MONEY',
        label: 'Recurring & Bills',
        subtitle: 'Bill reminders, scheduled electricity, rent & subscriptions',
        icon: 'calendar' as const,
        iconBg: '#EEF2FF',
        iconColor: '#4F46E5',
        action: () => router.push('/reminders'),
        keywords: ['bills', 'recurring', 'reminders', 'electricity', 'rent', 'subscription'],
      },
      {
        id: 'upi',
        section: 'MONEY',
        label: 'My UPI ID',
        subtitle: settings?.upiId || 'Add UPI ID for statement QR code',
        icon: 'qr-code' as const,
        iconBg: '#F3E8FF',
        iconColor: '#8B5CF6',
        action: () => {
          setUpiInput(settings?.upiId || '');
          setShowUpiModal(true);
        },
        keywords: ['upi', 'vpa', 'qr', 'payment qr', 'gpay', 'phonepe', 'paytm'],
      },
      {
        id: 'bank_alerts',
        section: 'AUTOMATION',
        label: 'Bank Messages & Auto-Add',
        subtitle: 'On-device bank & UPI detection, auto-add rules & senders',
        icon: 'flash' as const,
        iconBg: '#ECFDF5',
        iconColor: '#059669',
        action: () => router.push('/settings/bank-alerts'),
        keywords: ['bank', 'sms', 'messages', 'auto add', 'auto-add', 'upi alerts', 'detection', 'import'],
      },
      {
        id: 'sms_import',
        section: 'AUTOMATION',
        label: 'Import from Messages',
        subtitle: 'One-tap scan of bank messages from inbox or clipboard',
        icon: 'chatbubbles' as const,
        iconBg: '#EEF2FF',
        iconColor: '#4F46E5',
        action: () => router.push('/sms-import'),
        keywords: ['import', 'scan sms', 'paste messages', 'inbox scan'],
      },
      {
        id: 'pending_inbox',
        section: 'AUTOMATION',
        label: 'Pending Alerts Inbox',
        subtitle: 'Review detected transactions before adding',
        icon: 'mail-unread' as const,
        iconBg: '#FFFBEB',
        iconColor: '#D97706',
        action: () => router.push('/pending-inbox'),
        keywords: ['pending', 'inbox', 'review alerts', 'confirm alerts'],
      },
      {
        id: 'notifications',
        section: 'NOTIFICATIONS',
        label: 'Notification Settings',
        subtitle: 'Daily routine schedules, test alerts & quiet hours',
        icon: 'notifications' as const,
        iconBg: '#EEF2FF',
        iconColor: '#4F46E5',
        action: () => router.push('/settings/notifications'),
        keywords: ['notifications', 'reminders', 'routine', 'nudges', 'alerts', 'sound', 'daily'],
      },
      {
        id: 'advanced',
        section: 'ADVANCED',
        label: 'Advanced & Data Tools',
        subtitle: 'Statement PDF passbook, backup export/restore, widget sync',
        icon: 'construct' as const,
        iconBg: '#EEF2FF',
        iconColor: '#4F46E5',
        action: () => router.push('/settings/advanced'),
        keywords: ['advanced', 'backup', 'export', 'restore', 'pdf', 'statement', 'sync', 'widget', 'cache'],
      },
      {
        id: 'statement_pdf',
        section: 'ADVANCED',
        label: t('statement_pdf'),
        subtitle: t('statement_pdf_desc'),
        icon: 'document-text' as const,
        iconBg: '#FEF2F2',
        iconColor: '#DC2626',
        action: openStatementModal,
        keywords: ['pdf', 'statement', 'passbook', 'download', 'report'],
      },
      {
        id: 'export_data',
        section: 'ADVANCED',
        label: t('export_data'),
        subtitle: t('export_desc'),
        icon: 'cloud-download' as const,
        iconBg: '#ECFDF5',
        iconColor: '#059669',
        action: openExportModal,
        keywords: ['export', 'json', 'csv', 'excel', 'backup'],
      },
      {
        id: 'import_data',
        section: 'ADVANCED',
        label: t('import_data'),
        subtitle: t('import_desc'),
        icon: 'cloud-upload' as const,
        iconBg: '#EFF6FF',
        iconColor: '#2563EB',
        action: () => setShowImportModal(true),
        keywords: ['import', 'restore', 'load backup'],
      },
      {
        id: 'privacy_policy',
        section: 'SECURITY & PRIVACY',
        label: t('privacy_policy'),
        subtitle: 'Read our pure on-device data privacy guarantees',
        icon: 'shield-checkmark' as const,
        iconBg: '#F0FDFA',
        iconColor: '#0D9488',
        action: () => setLegalDoc('privacy'),
        keywords: ['privacy', 'policy', 'data', 'security'],
      },
      {
        id: 'terms',
        section: 'SECURITY & PRIVACY',
        label: t('terms_conditions'),
        subtitle: 'Usage terms & app conditions',
        icon: 'document-text' as const,
        iconBg: '#F1F5F9',
        iconColor: '#475569',
        action: () => setLegalDoc('terms'),
        keywords: ['terms', 'conditions', 'legal'],
      },
      {
        id: 'support',
        section: 'SUPPORT & ABOUT',
        label: t('support_desk_faqs'),
        subtitle: t('support_desk_desc'),
        icon: 'headset' as const,
        iconBg: '#EFF6FF',
        iconColor: '#2563EB',
        action: () => setShowSupportModal(true),
        keywords: ['help', 'support', 'faq', 'contact', 'customer service'],
      },
      {
        id: 'review',
        section: 'SUPPORT & ABOUT',
        label: 'Rate on Google Play',
        subtitle: 'Enjoying Rupeo? Support our journey with a 5-star review!',
        icon: 'star' as const,
        iconBg: '#FEF3C7',
        iconColor: '#D97706',
        action: handleOpenPlayStoreReview,
        keywords: ['rate', 'review', 'play store', 'google play', 'star'],
      },
    ];
  }, [t, selectedCurrencyObj, curr, user, settings, openStartingBalanceEditor, openStatementModal, openExportModal]);

  const filteredSearchItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchableItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.subtitle?.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q))
    );
  }, [searchQuery, searchableItems]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 + (insets.bottom > 0 ? insets.bottom + 8 : 0) }]}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* Top Banner */}
        <View style={styles.topHalf}>
          <SafeAreaView edges={['top']}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{t('profile')}</Text>
                <Text style={styles.subtitle}>{t('account_app_preferences')}</Text>
              </View>
              <View style={styles.headerAppBadge}>
                <Ionicons name="sparkles" size={13} color="#F59E0B" style={{ marginRight: 5 }} />
                <Text style={styles.headerAppBadgeText}>Rupeo</Text>
              </View>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.bottomHalf}>
          {/* Settings Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search settings, tools, alerts..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search settings"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {searchQuery.trim().length > 0 ? (
            <SettingsSection title={`SEARCH RESULTS (${filteredSearchItems.length})`}>
              {filteredSearchItems.length === 0 ? (
                <View style={styles.emptySearchContainer}>
                  <Ionicons name="search-outline" size={32} color="#CBD5E1" style={{ marginBottom: 6 }} />
                  <Text style={styles.emptySearchTitle}>No matching settings found</Text>
                  <Text style={styles.emptySearchSub}>
                    Try searching for "currency", "backup", "bills", "bank", or "lock"
                  </Text>
                </View>
              ) : (
                filteredSearchItems.map((item, idx) => (
                  <SettingsRow
                    key={item.id}
                    icon={item.icon}
                    iconBg={item.iconBg}
                    iconColor={item.iconColor}
                    label={item.label}
                    subtitle={item.subtitle}
                    badge={item.section}
                    badgeBg="#F1F5F9"
                    badgeColor="#475569"
                    isLast={idx === filteredSearchItems.length - 1}
                    onPress={() => {
                      setSearchQuery('');
                      item.action();
                    }}
                  />
                ))
              )}
            </SettingsSection>
          ) : (
            <>
              {/* 1. ACCOUNT */}
              <View style={{ marginBottom: 20 }}>
                <View style={styles.sectionHeaderRowSimple}>
                  <Text style={styles.sectionHeaderTitle}>ACCOUNT</Text>
                </View>

                {/* Profile Card */}
                <TouchableOpacity
                  style={styles.profileCardWrapper}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
                    router.push('/edit-profile');
                  }}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={t('edit_profile_btn')}
                >
                  <View style={styles.profileCard}>
                    <View style={{ marginBottom: 12 }}>
                      <VipAvatar
                        photoURL={user.photoURL}
                        name={user.displayName}
                        email={user.email}
                        size={92}
                        showBadge={true}
                        badgeType="edit"
                      />
                    </View>

                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{user.displayName || 'Rupeo User'}</Text>
                      {isPremium && (
                        <LinearGradient
                          colors={['#F59E0B', '#D97706']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.userVipBadge}
                        >
                          <Ionicons name="diamond" size={10} color="#FFFFFF" style={{ marginRight: 3 }} />
                          <Text style={styles.userVipBadgeText}>PRO</Text>
                        </LinearGradient>
                      )}
                    </View>
                    <Text style={styles.userEmail}>{user.email}</Text>

                    <View style={styles.editProfilePill}>
                      <Ionicons name="pencil" size={12} color="#2563EB" style={{ marginRight: 4 }} />
                      <Text style={styles.editProfilePillText}>{t('edit_profile_btn')}</Text>
                    </View>

                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                          {curr} {totalSpend.toFixed(0)}
                        </Text>
                        <Text style={styles.statLabel} numberOfLines={1}>{t('total_spend')}</Text>
                      </View>
                      <View style={styles.statDivider} />
                      <View style={styles.statItem}>
                        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                          {curr} {Number((user as any)?.startingBalance || 0).toLocaleString('en-IN')}
                        </Text>
                        <Text style={styles.statLabel} numberOfLines={1}>{t('starting_bal_short')}</Text>
                      </View>
                      <View style={styles.statDivider} />
                      <View style={styles.statItem}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 2 }}>
                          <View style={styles.activeDotPulse} />
                          <Text style={[styles.statValue, { color: '#10B981', marginBottom: 0 }]} numberOfLines={1}>
                            {t('account_active')}
                          </Text>
                        </View>
                        <Text style={styles.statLabel} numberOfLines={1}>{t('account_label')}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Subscription & Membership */}
                {appConfig?.showSubscriptions !== false && (
                  <View style={{ marginTop: 12 }}>
                    {isPremium ? (
                      <LinearGradient
                        colors={['#061A14', '#064E3B', '#0B132B']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.proCardCompact}
                      >
                        <View style={styles.proCompactHeader}>
                          <View style={styles.proCompactBadge}>
                            <Ionicons name="shield-checkmark" size={13} color="#34D399" />
                            <Text style={styles.proCompactBadgeText}>{t('rupeo_pro')}</Text>
                          </View>
                          <View style={styles.proActiveIndicatorV2}>
                            <View style={styles.proActiveDotV2} />
                            <Text style={styles.proActiveStatusTextV2}>{t('account_active')}</Text>
                          </View>
                        </View>

                        <View style={styles.proCompactTitleRow}>
                          <Ionicons name="diamond" size={16} color="#F59E0B" style={{ marginRight: 6 }} />
                          <Text style={styles.proCompactPlanName}>
                            {getPlanNameDisplay(currentPlan || (user as any)?.premiumPlan)}
                          </Text>
                        </View>

                        <View style={styles.proCompactPerksRow}>
                          <View style={styles.proCompactPerk}>
                            <Ionicons name="checkmark-circle" size={13} color="#34D399" />
                            <Text style={styles.proCompactPerkText}>{t('ad_free')}</Text>
                          </View>
                          <View style={styles.proCompactPerk}>
                            <Ionicons name="checkmark-circle" size={13} color="#34D399" />
                            <Text style={styles.proCompactPerkText}>{t('unlimited_pdfs')}</Text>
                          </View>
                          <View style={styles.proCompactPerk}>
                            <Ionicons name="checkmark-circle" size={13} color="#34D399" />
                            <Text style={styles.proCompactPerkText}>{t('reminders_perk')}</Text>
                          </View>
                        </View>

                        <View style={styles.proCompactActions}>
                          <TouchableOpacity
                            style={styles.proCompactChangeBtn}
                            onPress={() => router.push('/premium')}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel={t('change_plan')}
                          >
                            <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" style={{ marginRight: 5 }} />
                            <Text style={styles.proCompactBtnText}>{t('change_plan')}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.proCompactSyncBtn}
                            onPress={handleRestorePurchases}
                            disabled={isRestoring}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={t('sync')}
                          >
                            {isRestoring ? (
                              <ActivityIndicator size="small" color="#94A3B8" />
                            ) : (
                              <>
                                <Ionicons name="refresh-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                                <Text style={styles.proCompactSyncText}>{t('sync')}</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </LinearGradient>
                    ) : (
                      <LinearGradient
                        colors={['#0A0F1D', '#111827', '#1E1B4B']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.proCardCompact}
                      >
                        <View style={styles.proCompactHeader}>
                          <View style={styles.proBadgeGoldCompact}>
                            <Ionicons name="sparkles" size={12} color="#F59E0B" />
                            <Text style={styles.proBadgeGoldTextCompact}>{t('rupeo_pro')}</Text>
                          </View>
                          <View style={styles.proPriceTagCompact}>
                            <Text style={styles.proPriceTextCompact}>{t('from_price_mo')}</Text>
                            <View style={styles.proSavePillCompact}>
                              <Text style={styles.proSavePillTextCompact}>{t('discount_off')}</Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.proCompactBody}>
                          <Text style={styles.proCompactTitle}>{t('upgrade_to_pro')}</Text>
                          <Text style={styles.proCompactDesc} numberOfLines={1}>
                            {t('pro_features_desc')}
                          </Text>
                        </View>

                        <View style={styles.proCompactPerksRow}>
                          <View style={styles.proFeaturePill}>
                            <Ionicons name="ban" size={11} color="#EF4444" />
                            <Text style={styles.proFeaturePillText}>{t('ad_free')}</Text>
                          </View>
                          <View style={styles.proFeaturePill}>
                            <Ionicons name="document-text" size={11} color="#38BDF8" />
                            <Text style={styles.proFeaturePillText}>{t('unlimited_pdfs')}</Text>
                          </View>
                          <View style={styles.proFeaturePill}>
                            <Ionicons name="notifications" size={11} color="#FBBF24" />
                            <Text style={styles.proFeaturePillText}>{t('reminders_perk')}</Text>
                          </View>
                        </View>

                        <View style={styles.proCompactActions}>
                          <TouchableOpacity
                            style={styles.proUpgradeBtnCompact}
                            onPress={() => router.push('/premium')}
                            activeOpacity={0.88}
                            accessibilityRole="button"
                            accessibilityLabel={t('upgrade_now')}
                          >
                            <LinearGradient
                              colors={['#F59E0B', '#D97706']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={styles.proUpgradeGradientCompact}
                            >
                              <Ionicons name="diamond" size={14} color="#0B0F19" style={{ marginRight: 5 }} />
                              <Text style={styles.proUpgradeBtnTextCompact}>{t('upgrade_now')}</Text>
                              <Ionicons name="arrow-forward" size={13} color="#0B0F19" style={{ marginLeft: 5 }} />
                            </LinearGradient>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.proCompactSyncBtn}
                            onPress={handleRestorePurchases}
                            disabled={isRestoring}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={t('restore')}
                          >
                            {isRestoring ? (
                              <ActivityIndicator size="small" color="#94A3B8" />
                            ) : (
                              <Text style={styles.proCompactSyncText}>{t('restore')}</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </LinearGradient>
                    )}
                  </View>
                )}

                {/* Account Action: Sign Out */}
                <View style={styles.accountActionCard}>
                  <SettingsRow
                    icon="log-out-outline"
                    iconBg="#FEF2F2"
                    iconColor="#DC2626"
                    label={t('log_out')}
                    subtitle={t('logout_msg')}
                    isDestructive
                    showChevron={false}
                    isLast
                    onPress={() => {
                      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
                      setLogoutModalVisible(true);
                    }}
                  />
                </View>
              </View>

              {/* 2. MONEY */}
              <SettingsSection title="MONEY">
                <SettingsRow
                  icon="cash-outline"
                  iconBg="#F5F3FF"
                  iconColor="#7C3AED"
                  label={t('currency')}
                  subtitle={selectedCurrencyObj ? `${selectedCurrencyObj.name}` : 'Default Currency'}
                  value={selectedCurrencyObj?.symbol || settings?.currency || '₹'}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
                    setShowCurrencyModal(true);
                  }}
                />
                <SettingsRow
                  icon="grid-outline"
                  iconBg="#EEF2FF"
                  iconColor="#4F46E5"
                  label={t('manage_categories')}
                  subtitle={t('manage_categories_desc')}
                  onPress={() => router.push('/categories')}
                />
                <SettingsRow
                  icon="pie-chart-outline"
                  iconBg="#FEF3C7"
                  iconColor="#D97706"
                  label={t('budget_goals')}
                  subtitle={t('budget_goals_desc')}
                  onPress={() => router.push('/budget')}
                />
                <SettingsRow
                  icon="wallet-outline"
                  iconBg="#ECFDF5"
                  iconColor="#059669"
                  label={t('update_starting_balance')}
                  subtitle={t('starting_bal_short')}
                  value={`${curr}${Number((user as any)?.startingBalance || 0).toLocaleString('en-IN')}`}
                  onPress={openStartingBalanceEditor}
                />
                <SettingsRow
                  icon="calendar-outline"
                  iconBg="#EEF2FF"
                  iconColor="#4F46E5"
                  label="Recurring & Bills"
                  subtitle="Bill reminders & payment defaults"
                  onPress={() => router.push('/reminders')}
                />
                <SettingsRow
                  icon="qr-code-outline"
                  iconBg="#F3E8FF"
                  iconColor="#8B5CF6"
                  label="My UPI ID"
                  subtitle={settings?.upiId || 'Add UPI ID for statement QR'}
                  value={settings?.upiId ? 'Edit' : 'Add'}
                  badge={settings?.upiId ? 'SET' : undefined}
                  badgeBg="#ECFDF5"
                  badgeColor="#047857"
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
                    setUpiInput(settings?.upiId || '');
                    setShowUpiModal(true);
                  }}
                />
                <SettingsRow
                  icon="people-outline"
                  iconBg="#EEF2FF"
                  iconColor="#4F46E5"
                  label={t('sync_udhar_to_dashboard')}
                  subtitle={t('sync_udhar_to_dashboard_sub')}
                  isSwitch
                  switchValue={syncUdharDashboard}
                  onSwitchChange={handleToggleUdharDashboard}
                />
                <SettingsRow
                  icon="cloud-download-outline"
                  iconBg="#ECFDF5"
                  iconColor="#059669"
                  label={t('export_data')}
                  subtitle="Backup to JSON or CSV Excel"
                  badge="JSON • CSV"
                  badgeBg="#ECFDF5"
                  badgeColor="#059669"
                  loading={isExporting}
                  isLast
                  onPress={openExportModal}
                />
              </SettingsSection>

              {/* 3. AUTOMATION */}
              {(Platform.OS === 'android' || Platform.OS === 'web') && (
                <SettingsSection
                  title="AUTOMATION"
                  badge={Platform.OS === 'android' ? 'AI ENGINE' : undefined}
                  badgeBg="#EEF2FF"
                  badgeColor="#4F46E5"
                >
                  <SettingsRow
                    icon="flash-outline"
                    iconBg="#ECFDF5"
                    iconColor="#059669"
                    label="Bank messages & auto-add"
                    subtitle="On-device bank & UPI detection, rules & senders"
                    badge={smsSettings.autoAddEnabled ? 'ACTIVE' : 'CONFIG'}
                    badgeBg={smsSettings.autoAddEnabled ? '#ECFDF5' : '#F1F5F9'}
                    badgeColor={smsSettings.autoAddEnabled ? '#059669' : '#64748B'}
                    onPress={() => router.push('/settings/bank-alerts')}
                  />
                  <SettingsRow
                    icon="mail-unread-outline"
                    iconBg="#FFFBEB"
                    iconColor="#D97706"
                    label="Pending Alerts Inbox"
                    subtitle="Review detected transactions before adding"
                    badge={pendingAlertCount > 0 ? `${pendingAlertCount} NEW` : undefined}
                    badgeBg="#FEF3C7"
                    badgeColor="#B45309"
                    isLast
                    onPress={() => router.push('/pending-inbox')}
                  />
                </SettingsSection>
              )}

              {/* 4. NOTIFICATIONS */}
              <SettingsSection title="NOTIFICATIONS">
                <SettingsRow
                  icon="notifications-outline"
                  iconBg="#EEF2FF"
                  iconColor="#4F46E5"
                  label="Notification settings"
                  subtitle="Daily routine schedules, test alerts & quiet hours"
                  badge="4 DAILY"
                  badgeBg="#EEF2FF"
                  badgeColor="#4F46E5"
                  isLast
                  onPress={() => router.push('/settings/notifications')}
                />
              </SettingsSection>

              {/* 5. APPEARANCE & NOTES */}
              <SettingsSection title="APPEARANCE & NOTES">
                <View style={styles.languageCardInner}>
                  <View style={styles.prefHeaderRow}>
                    <View style={[styles.infoIconBg, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}>
                      <Ionicons name="language" size={20} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>{t('language')}</Text>
                      <Text style={styles.infoValue}>
                        {settings?.language === 'Hindi'
                          ? 'ऐप की भाषा चुनें'
                          : settings?.language === 'Hinglish'
                          ? 'App ki bhasha chunein'
                          : 'Select app display language'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.prefSelectorWrap}>
                    <PillSelector
                      options={LANGUAGES}
                      activeValue={(settings?.language as Language) || 'English'}
                      onSelect={(val) => {
                        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
                        updatePref('language', val);
                      }}
                      a11yLabel="App language"
                    />
                  </View>
                </View>
              </SettingsSection>

              {/* 6. SECURITY & PRIVACY */}
              <SettingsSection title="SECURITY & PRIVACY" badge="SAFE" badgeBg="#F0FDFA" badgeColor="#0D9488">
                <SettingsRow
                  icon="shield-checkmark-outline"
                  iconBg="#F0FDFA"
                  iconColor="#0D9488"
                  label={t('privacy_policy')}
                  subtitle="Pure on-device data privacy guarantees"
                  onPress={() => setLegalDoc('privacy')}
                />
                <SettingsRow
                  icon="document-text-outline"
                  iconBg="#F1F5F9"
                  iconColor="#475569"
                  label={t('terms_conditions')}
                  subtitle="Terms of service & user rights"
                  onPress={() => setLegalDoc('terms')}
                />
                <SettingsRow
                  icon="trash-outline"
                  iconBg="#FEF2F2"
                  iconColor="#DC2626"
                  label={t('delete_all_data')}
                  subtitle={t('delete_all_desc')}
                  badge="RESET"
                  badgeBg="#FEF2F2"
                  badgeColor="#DC2626"
                  isDestructive
                  onPress={() => setDeleteDataModalVisible(true)}
                />
                <SettingsRow
                  icon="warning-outline"
                  iconBg="#FEF2F2"
                  iconColor="#DC2626"
                  label={t('delete_my_account')}
                  subtitle="Permanently delete cloud account & data"
                  isDestructive
                  showChevron={false}
                  isLast
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { }
                    setDeleteAccountModalVisible(true);
                  }}
                />
              </SettingsSection>

              {/* 7. SUPPORT & ABOUT */}
              <SettingsSection title="SUPPORT & ABOUT">
                <SettingsRow
                  icon="headset-outline"
                  iconBg="#EFF6FF"
                  iconColor="#2563EB"
                  label={t('support_desk_faqs')}
                  subtitle={t('support_desk_desc')}
                  badge="24/7 ACTIVE"
                  badgeBg="#EFF6FF"
                  badgeColor="#2563EB"
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { }
                    setShowSupportModal(true);
                  }}
                />
                <SettingsRow
                  icon="star-outline"
                  iconBg="#FEF3C7"
                  iconColor="#D97706"
                  label="Rate on Google Play"
                  subtitle="Support Rupeo with a 5-star review!"
                  badge="⭐ 5.0"
                  badgeBg="#FEF3C7"
                  badgeColor="#B45309"
                  isLast
                  onPress={handleOpenPlayStoreReview}
                />
              </SettingsSection>

              {/* 8. ADVANCED */}
              <SettingsSection title="ADVANCED">
                <SettingsRow
                  icon="construct-outline"
                  iconBg="#EEF2FF"
                  iconColor="#4F46E5"
                  label="Advanced & Data Tools"
                  subtitle="Statement PDF passbook, backup restore, widget sync & cache"
                  badge="TOOLS"
                  badgeBg="#EEF2FF"
                  badgeColor="#4F46E5"
                  isLast
                  onPress={() => router.push('/settings/advanced')}
                />
              </SettingsSection>

              {/* Version Footer */}
              <TouchableOpacity
                onPress={handleVersionTap}
                activeOpacity={0.7}
                style={styles.versionFooter}
                accessibilityRole="button"
                accessibilityLabel="App version diagnostics"
              >
                <Text style={styles.versionText}>Rupeo Version v2.1.10</Text>
                <Text style={styles.versionSubText}>Tap 7 times for diagnostics</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      <HelpSupportModal
        visible={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        source="settings"
      />

      <CurrencySelectorModal
        visible={showCurrencyModal}
        onClose={() => setShowCurrencyModal(false)}
        selectedCurrency={settings?.currency || '₹'}
        onSelect={(val) => updatePref('currency', val)}
      />

      {/* My UPI ID Modal */}
      <BottomSheetModal
        visible={showUpiModal}
        onClose={() => setShowUpiModal(false)}
        title="My UPI ID"
        icon="qr-code"
        iconBg="#F3E8FF"
        iconColor="#8B5CF6"
        autoHeight
      >
        <Text style={styles.modalIntroText}>
          Enter your UPI ID (VPA) to generate scannable payment QR codes on Rupeo Khata statements.
        </Text>
        <View style={styles.startingBalanceInputRow}>
          <Ionicons name="at-outline" size={20} color="#64748B" style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.startingBalanceInput, { fontSize: 16, textAlign: 'left', flex: 1 }]}
            value={upiInput}
            onChangeText={setUpiInput}
            placeholder="e.g. mobile@upi or name@bank"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSavingUpi}
          />
        </View>
        <TouchableOpacity
          style={[styles.primaryBtn, isSavingUpi && styles.btnDisabled]}
          onPress={handleSaveUpiId}
          disabled={isSavingUpi}
          activeOpacity={0.8}
        >
          {isSavingUpi ? <ActivityIndicator size="small" color="#1C1C1E" /> : <Text style={styles.primaryBtnText}>{t('save')}</Text>}
        </TouchableOpacity>
      </BottomSheetModal>

      {/* Starting Balance Modal */}
      <BottomSheetModal
        visible={showStartingBalanceModal}
        onClose={() => setShowStartingBalanceModal(false)}
        title={t('update_starting_balance')}
        icon="wallet"
        iconBg="#ECFDF5"
        iconColor="#059669"
        autoHeight
      >
        <Text style={styles.modalIntroText}>
          {t('starting_balance_desc')}
        </Text>
        <View style={styles.startingBalanceInputRow}>
          <Text style={styles.startingBalanceCurrency}>{curr}</Text>
          <TextInput
            style={styles.startingBalanceInput}
            value={startingBalanceInput}
            onChangeText={setStartingBalanceInput}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#94A3B8"
            editable={!isSavingStartingBalance}
          />
        </View>
        <TouchableOpacity
          style={[styles.primaryBtn, isSavingStartingBalance && styles.btnDisabled]}
          onPress={handleSaveStartingBalance}
          disabled={isSavingStartingBalance}
          activeOpacity={0.8}
        >
          {isSavingStartingBalance ? <ActivityIndicator size="small" color="#1C1C1E" /> : <Text style={styles.primaryBtnText}>{t('save')}</Text>}
        </TouchableOpacity>
      </BottomSheetModal>

      {/* Export Modal */}
      <BottomSheetModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={t('export_data')}
        icon="cloud-download"
        iconBg="#ECFDF5"
        iconColor="#059669"
        autoHeight={false}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          <Text style={styles.modalIntroText}>
            {t('export_desc')}
          </Text>

          {/* EXPORT PERIOD SELECTION PILLS */}
          <Text style={styles.statementSectionLabel}>{t('export_scope')}</Text>
          <View style={styles.statementPeriodPillRow}>
            <TouchableOpacity
              style={[
                styles.statementPeriodBtn,
                exportPeriodMode === 'all' && styles.statementPeriodBtnActive,
              ]}
              onPress={() => setExportPeriodMode('all')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="infinite"
                size={16}
                color={exportPeriodMode === 'all' ? '#0F172A' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.statementPeriodBtnText, exportPeriodMode === 'all' && styles.statementPeriodBtnTextActive]}>
                {t('all_history')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statementPeriodBtn,
                exportPeriodMode === 'month' && styles.statementPeriodBtnActive,
              ]}
              onPress={() => setExportPeriodMode('month')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="calendar"
                size={15}
                color={exportPeriodMode === 'month' ? '#2563EB' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.statementPeriodBtnText, exportPeriodMode === 'month' && styles.statementPeriodBtnTextActive]}>
                {t('specific_month')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* MONTH SELECTOR (When 'month' is active) */}
          {exportPeriodMode === 'month' && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.statementSubLabel}>{t('select_month_label')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {exportAvailableMonths.map((m) => {
                  const isSelected = exportMonth === m;
                  const label = formatMonthDisplay(m);
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.monthChip,
                        isSelected && styles.monthChipActive,
                      ]}
                      onPress={() => setExportMonth(m)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.monthChipText, isSelected && styles.monthChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* LIVE STATUS CARD */}
          <View style={[
            styles.exportStatusCard,
            selectedMonthExportTxsCount === 0 && styles.exportStatusCardEmpty
          ]}>
            <Ionicons
              name={selectedMonthExportTxsCount > 0 ? "checkmark-circle" : "alert-circle"}
              size={18}
              color={selectedMonthExportTxsCount > 0 ? "#15803D" : "#D97706"}
              style={{ marginRight: 8 }}
            />
            <Text style={[
              styles.exportStatusText,
              selectedMonthExportTxsCount === 0 && styles.exportStatusTextEmpty
            ]}>
              {exportPeriodMode === 'all'
                ? (totalExportTxsCount > 0
                  ? t('all_data_ready_msg').replace('{count}', String(totalExportTxsCount))
                  : t('all_history_ready_generic'))
                : (selectedMonthExportTxsCount > 0
                  ? t('month_data_ready_msg').replace('{count}', String(selectedMonthExportTxsCount)).replace('{month}', formatMonthDisplay(exportMonth))
                  : t('no_month_data_msg').replace('{month}', formatMonthDisplay(exportMonth)))
              }
            </Text>
          </View>

          {/* FORMAT SELECTION */}
          <Text style={styles.statementSectionLabel}>{t('file_format')}</Text>
          {(['json', 'csv'] as const).map(format => {
            const isActive = exportFormat === format;
            const meta =
              format === 'json'
                ? {
                  icon: 'code-slash' as const,
                  bg: '#FEF3C7',
                  color: '#D97706',
                  title: t('json_backup'),
                  desc: t('json_desc'),
                  recommended: true,
                }
                : {
                  icon: 'grid-outline' as const,
                  bg: '#EFF6FF',
                  color: '#2563EB',
                  title: t('csv_backup'),
                  desc: t('csv_desc'),
                  recommended: false,
                };
            return (
              <TouchableOpacity
                key={format}
                style={[styles.formatCard, isActive && styles.formatCardActive]}
                onPress={() => setExportFormat(format)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
              >
                <View style={styles.formatCardLeft}>
                  <View style={[styles.formatIconCircle, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>
                  <View style={styles.formatTextWrap}>
                    <View style={styles.formatTitleRow}>
                      <Text style={styles.formatTitle}>{meta.title}</Text>
                      {meta.recommended && (
                        <View style={styles.recommendedBadge}>
                          <Text style={styles.recommendedBadgeText}>{t('recommended')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.formatDesc}>{meta.desc}</Text>
                  </View>
                </View>
                <Ionicons
                  name={isActive ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={isActive ? meta.color : '#CBD5E1'}
                />
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.primaryBtn, (isExporting || selectedMonthExportTxsCount === 0) && styles.btnDisabled]}
            onPress={() => handleExport(exportFormat)}
            disabled={isExporting || selectedMonthExportTxsCount === 0}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#1C1C1E" />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color="#1C1C1E" style={styles.btnIcon} />
                <Text style={styles.primaryBtnText}>
                  {selectedMonthExportTxsCount === 0
                    ? t('no_txs_found')
                    : `${t('download_backup')} (${selectedMonthExportTxsCount}) (${exportPeriodMode === 'all' ? t('all_data') : formatMonthDisplay(exportMonth)}) (.${exportFormat})`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowExportModal(false)} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheetModal>

      {/* Statement PDF Modal */}
      <BottomSheetModal
        visible={showStatementModal}
        onClose={() => setShowStatementModal(false)}
        title={t('statement_pdf')}
        icon="document-text"
        iconBg="#FEF2F2"
        iconColor="#DC2626"
        autoHeight={false}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          <Text style={styles.modalIntroText}>
            {t('statement_intro')}
          </Text>

          {/* PERIOD SELECTION PILLS */}
          <Text style={styles.statementSectionLabel}>{t('statement_period')}</Text>
          <View style={styles.statementPeriodPillRow}>
            <TouchableOpacity
              style={[
                styles.statementPeriodBtn,
                statementPeriodMode === 'all' && styles.statementPeriodBtnActive,
              ]}
              onPress={() => setStatementPeriodMode('all')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="infinite"
                size={16}
                color={statementPeriodMode === 'all' ? '#0F172A' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.statementPeriodBtnText, statementPeriodMode === 'all' && styles.statementPeriodBtnTextActive]}>
                {t('all_transactions_period')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statementPeriodBtn,
                statementPeriodMode === 'month' && styles.statementPeriodBtnActive,
              ]}
              onPress={() => setStatementPeriodMode('month')}
              activeOpacity={0.7}
            >
              <Ionicons
                name="calendar"
                size={15}
                color={statementPeriodMode === 'month' ? '#2563EB' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.statementPeriodBtnText, statementPeriodMode === 'month' && styles.statementPeriodBtnTextActive]}>
                {t('specific_month')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* MONTH SELECTOR (When 'month' is active) */}
          {statementPeriodMode === 'month' && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.statementSubLabel}>{t('select_month_label')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {availableMonths.map((m) => {
                  const isSelected = statementMonth === m;
                  const label = formatMonthDisplay(m);
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.monthChip,
                        isSelected && styles.monthChipActive,
                      ]}
                      onPress={() => setStatementMonth(m)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.monthChipText, isSelected && styles.monthChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* TRANSACTION TYPE FILTER PILLS */}
          <Text style={styles.statementSectionLabel}>{t('transaction_type')}</Text>
          <View style={styles.statementFilterPillRow}>
            {(['all', 'debit', 'credit'] as const).map((typeKey) => {
              const isSelected = statementTypeFilter === typeKey;
              const typeLabel = typeKey === 'all' ? t('all_records') : typeKey === 'debit' ? t('expenses_only') : t('income_only');
              const dotColor = typeKey === 'all' ? '#64748B' : typeKey === 'debit' ? '#DC2626' : '#16A34A';
              return (
                <TouchableOpacity
                  key={typeKey}
                  style={[
                    styles.typeFilterPill,
                    isSelected && styles.typeFilterPillActive,
                  ]}
                  onPress={() => setStatementTypeFilter(typeKey)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.typeDot, { backgroundColor: dotColor }]} />
                  <Text style={[styles.typeFilterText, isSelected && styles.typeFilterTextActive]}>
                    {typeLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* LIVE PREVIEW CARD */}
          <View style={styles.statementPreviewCard}>
            <View style={styles.statementPreviewHeader}>
              <View>
                <Text style={styles.previewTitle}>
                  {statementPeriodMode === 'all' ? t('all_transactions_period') : formatMonthDisplay(statementMonth)}
                </Text>
                <Text style={styles.previewCountText}>
                  {t('txs_included_in_pdf').replace('{count}', String(previewStats.count))}
                </Text>
              </View>
              <View style={styles.previewBadge}>
                <Ionicons name="document-text" size={12} color="#DC2626" style={{ marginRight: 4 }} />
                <Text style={styles.previewBadgeText}>{t('pdf_ready')}</Text>
              </View>
            </View>

            <View style={styles.previewStatsRow}>
              <View style={styles.previewStatItem}>
                <Text style={styles.previewStatLabel}>{t('income_only').toUpperCase()}</Text>
                <Text style={[styles.previewStatVal, { color: '#16A34A' }]}>
                  +{curr}{previewStats.income.toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.previewStatItem}>
                <Text style={styles.previewStatLabel}>{t('expenses_only').toUpperCase()}</Text>
                <Text style={[styles.previewStatVal, { color: '#DC2626' }]}>
                  -{curr}{previewStats.expense.toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.previewStatItem}>
                <Text style={styles.previewStatLabel}>{t('net_flow')}</Text>
                <Text style={[styles.previewStatVal, { color: previewStats.net >= 0 ? '#2563EB' : '#DC2626' }]}>
                  {previewStats.net >= 0 ? '+' : ''}{curr}{previewStats.net.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>

          {/* FEATURE PERKS */}
          <View style={styles.statementPerksCard}>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={15} color="#16A34A" style={{ marginRight: 6 }} />
              <Text style={styles.perkText}>{t('perk_header')}</Text>
            </View>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={15} color="#16A34A" style={{ marginRight: 6 }} />
              <Text style={styles.perkText}>{t('perk_ledger')}</Text>
            </View>
            <View style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={15} color="#16A34A" style={{ marginRight: 6 }} />
              <Text style={styles.perkText}>{t('perk_footer')}</Text>
            </View>
          </View>

          {/* ACTIONS */}
          <TouchableOpacity
            style={[styles.primaryBtn, (isGeneratingPdf || previewStats.count === 0) && styles.btnDisabled]}
            onPress={handleGenerateStatementPdf}
            disabled={isGeneratingPdf || previewStats.count === 0}
            activeOpacity={0.85}
          >
            {isGeneratingPdf ? (
              <ActivityIndicator size="small" color="#1C1C1E" />
            ) : (
              <>
                <Ionicons name="download-outline" size={18} color="#1C1C1E" style={styles.btnIcon} />
                <Text style={styles.primaryBtnText}>
                  {previewStats.count === 0 ? t('no_txs_found') : `${t('download_pdf_statement')} (${previewStats.count})`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowStatementModal(false)} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheetModal>

      {/* Import Modal */}
      <BottomSheetModal
        visible={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportText('');
        }}
        title={t('import_data')}
        icon="cloud-upload"
        iconBg="#EFF6FF"
        iconColor="#2563EB"
        autoHeight
      >
        <Text style={styles.modalIntroText}>
          {t('import_desc')}
        </Text>

        {!selectedImportFile ? (
          <TouchableOpacity
            style={[styles.fileSelectBtn, isImporting && styles.btnDisabled]}
            onPress={handlePickAndImportFile}
            disabled={isImporting}
            activeOpacity={0.8}
          >
            <>
              <Ionicons name="document-attach-outline" size={22} color="#1C1C1E" style={styles.btnIcon} />
              <Text style={styles.fileSelectBtnText}>{t('choose_backup_file')}</Text>
            </>
          </TouchableOpacity>
        ) : (
          <View style={styles.selectedFileBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
              <Ionicons name="document-text" size={24} color="#3B82F6" style={{ marginRight: 10 }} />
              <Text style={styles.selectedFileName} numberOfLines={1}>{selectedImportFile}</Text>
            </View>
            <TouchableOpacity onPress={clearSelectedFile} style={styles.removeFileBtn}>
              <Ionicons name="close-circle" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.orDividerRow}>
          <View style={styles.orDividerLine} />
          <Text style={styles.orDividerText}>{t('or_paste_text')}</Text>
          <View style={styles.orDividerLine} />
        </View>

        <TextInput
          style={[styles.importInput, { color: '#1C1C1E' }]}
          multiline
          numberOfLines={6}
          placeholder={'[{"date":"2024-01-15","amount":250,"category":"Food","type":"debit"}]'}
          placeholderTextColor="#94A3B8"
          value={importText}
          onChangeText={setImportText}
          textAlignVertical="top"
          accessibilityLabel="Paste backup JSON or CSV text"
        />

        {importText.trim().length > 0 && (
          <TouchableOpacity
            style={[styles.primaryBtn, (isImporting || !importText.trim()) && styles.btnDisabled]}
            onPress={() => handleImportSubmit()}
            disabled={isImporting || !importText.trim()}
            activeOpacity={0.8}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color="#1C1C1E" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#1C1C1E" style={styles.btnIcon} />
                <Text style={styles.primaryBtnText}>Import Backup Data</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => {
            setShowImportModal(false);
            setImportText('');
            setSelectedImportFile(null);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
        </TouchableOpacity>
      </BottomSheetModal>

      {/* Legal Modal */}
      <Modal visible={!!legalDoc} animationType="slide" onRequestClose={() => setLegalDoc(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
          <View style={styles.fullPageHeader}>
            <TouchableOpacity onPress={() => setLegalDoc(null)} style={styles.fullPageBackBtn} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={28} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.fullPageTitle}>
              {legalDoc === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
            </Text>
            <View style={{ width: 44 }} />
          </View>
          <ScrollView style={styles.fullPageContent} showsVerticalScrollIndicator={false}>
            {legalDoc === 'privacy' ? (
              <View style={{ paddingBottom: 50 }}>
                <Text style={styles.legalTextBold}>Rupeo Privacy Policy</Text>
                <Text style={styles.legalDateText}>Effective Date: October 22, 2026 | Version 2.1.10</Text>

                <Text style={styles.legalIntroText}>
                  Innovatex Labs ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how our personal finance and bookkeeping application Rupeo ("App", package: com.innovatexlabs.paisewaise, portal: https://rupeoo.vercel.app/download) collects, uses, protects, and handles your personal and financial information.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>1. Information We Collect</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>Account & Identity:</Text> When you register using Email/Password or Google Sign-In, we collect your display name, email address, profile picture URL, and Firebase Auth UID.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Financial Transactions:</Text> Income and expense amounts, transaction timestamps, payment modes (UPI, Cash, Debit/Credit Card, Net Banking), category allocations, and optional notes/memos.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Bank SMS & UPI Alerts (On-Device Local Detection):</Text> When you use Import from Messages, automatic SMS detection, or manual message paste, Rupeo processes messages locally on your device using pattern-matching algorithms. We only extract essential transaction metadata (debit/credit amount, merchant or payee name, transaction date/time, and masked account last 4 digits). Personal, promotional, OTP, and spam messages are identified and rejected immediately. Raw message texts are NEVER uploaded to any server or shared with third parties.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Voice Input (Voice Quick Add):</Text> Spoken phrases are processed locally using on-device Speech Recognition APIs to transcribe amounts and categories. Audio recordings are never uploaded, stored, or shared remotely.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Friends & Udhar (Khata):</Text> Peer contact names and optional phone numbers entered to track shared expenses, lent ("Gave"), and borrowed ("Got") amounts.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Split UPI QR Generation:</Text> Your UPI ID (VPA) is used locally to create standard NPCI UPI payment deep links (`upi://pay?...`) and rendered into scannable passes for sharing.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Receipts & Bill Images:</Text> Physical receipt photos, invoices, and payment proof screenshots that you voluntarily take using the in-app camera or select from your photo library (stored securely via Cloudinary).{'\n'}
                  • <Text style={styles.legalTextSemibold}>Recurring Bill Reminders:</Text> Bill provider names (e.g. Jio, Airtel, Vi, BSNL, Rent, Tiffin/Mess, Milk, Maid, Electricity, EMI), bill amounts, billing cycles, and next due dates.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Widgets & Diagnostics:</Text> Home screen widgets render local spend summaries via Android RemoteViews. Device model, OS version, push notification tokens, and anonymous crash telemetry ensure app reliability.{'\n\n'}
                  <Text style={styles.legalHighlightText}>What We DO NOT Collect:</Text> Rupeo never collects or stores your bank login passwords, net banking credentials, ATM PINs, UPI MPINs, OTP codes, or card CVV numbers. Rupeo does not link directly to bank accounts and does not hold user funds.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>2. Device Permissions We Request</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>SMS & Bank Alerts (READ_SMS / Notification Listener):</Text> On supported Android builds, allows Rupeo to detect incoming bank transactional SMS and payment alerts in real time so you can log or review expenses instantly. This permission is strictly optional, purely operates on-device, and never uploads your personal conversations or inbox.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Microphone (RECORD_AUDIO):</Text> Enables hands-free Voice Quick Add to transcribe expense amounts and categories. Audio is processed on-device and never stored remotely.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Contacts (READ_CONTACTS):</Text> Allows you to select friend names and numbers when adding contacts to the Friends & Udhar ledger. Your contacts list is never uploaded or scraped.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Camera (CAMERA):</Text> Used solely to allow you to photograph bills, receipts, or payment confirmations directly within the app.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Photos & Documents (System Photo Picker):</Text> Uses Android's secure system photo picker to let you attach receipt images without requiring broad media storage permissions.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Notifications (POST_NOTIFICATIONS):</Text> Used to deliver timely alerts for upcoming bill due dates, recharge expirations, and budget status.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>3. How We Use Your Data</Text>
                <Text style={styles.legalText}>
                  • To manage, display, and securely synchronize your personal accounts, friends ledger, and transactions across devices.{'\n'}
                  • To calculate financial statistics, category breakdowns, and cash flow trends.{'\n'}
                  • To generate authentic scannable ISO/IEC 16388 Code 39 barcode transaction receipts and Split UPI payment request passes.{'\n'}
                  • To provide AI-powered financial summaries and smart spending recommendations.{'\n'}
                  • To handle optional VIP / Pro subscription features.{'\n'}
                  • <Text style={styles.legalTextSemibold}>No Sale of Data:</Text> We do not sell, rent, or trade your personal or financial data to third-party advertisers or data brokers.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>4. Third-Party Services</Text>
                <Text style={styles.legalText}>
                  We integrate trusted third-party services that adhere to stringent privacy and security standards:{'\n'}
                  • <Text style={styles.legalTextSemibold}>Google Firebase (Google LLC):</Text> Secure authentication, Cloud Firestore encrypted database, and cloud infrastructure.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Google Mobile Ads (AdMob):</Text> Displays non-intrusive banner and video ads for free-tier users in accordance with Google Play Developer policies.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Cloudinary:</Text> High-speed encrypted media storage and delivery for attached bill photos.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Google Play Billing (react-native-iap):</Text> Securely processes in-app VIP/Pro subscriptions without Rupeo accessing credit card details.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>5. Data Security & Encryption</Text>
                <Text style={styles.legalText}>
                  • All network communication uses end-to-end TLS 1.3 / HTTPS encryption.{'\n'}
                  • Firestore security rules enforce strict user-level access isolation — only your authenticated account can access your records.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Account Masking & Zero Cloud Storage of Raw SMS:</Text> All financial accounts detected from SMS alerts are automatically masked to preserve only the last 4 digits. Stored original message notes (optional) and deduplication fingerprints remain under your direct control and can be purged at any time via Settings {'>'} Reset Import History or Delete Stored Messages.{'\n'}
                  • Offline local cached data is protected within your device's sandboxed storage.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>6. Your Rights: Export & Permanent Data Deletion</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>Data Ownership:</Text> You retain 100% ownership of your data.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Data Export:</Text> You can export all your records anytime in CSV, PDF, or JSON backup formats.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Account Deletion:</Text> You have the right to permanently erase your account at any time via Settings {'>'} "Delete My Account". This action permanently and irreversibly purges your profile, all transactions, friends khata records, recurring bills, notifications, and uploaded photos from our active servers.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>7. Children's Privacy</Text>
                <Text style={styles.legalText}>
                  Rupeo is not intended for use by children under 13 years of age. We do not knowingly collect personal data from children.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>8. Contact & Portal</Text>
                <Text style={styles.legalText}>
                  For any privacy questions or data requests, please contact:{'\n'}
                  <Text style={styles.legalTextSemibold}>Email:</Text> innovatexlab.services@gmail.com{'\n'}
                  <Text style={styles.legalTextSemibold}>Publisher:</Text> Innovatex Labs{'\n'}
                  <Text style={styles.legalTextSemibold}>Portal:</Text> https://rupeoo.vercel.app/download
                </Text>
              </View>
            ) : (
              <View style={{ paddingBottom: 50 }}>
                <Text style={styles.legalTextBold}>Rupeo Terms & Conditions</Text>
                <Text style={styles.legalDateText}>Effective Date: October 22, 2026 | Version 2.1.10</Text>

                <Text style={styles.legalIntroText}>
                  Please read these Terms & Conditions ("Terms") carefully before using the Rupeo mobile application (package: com.innovatexlabs.paisewaise, portal: https://rupeoo.vercel.app/download) operated by Innovatex Labs ("we", "us", or "our"). By downloading, installing, or using Rupeo, you agree to these Terms.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>1. Acceptance of Terms</Text>
                <Text style={styles.legalText}>
                  By accessing or using Rupeo, you confirm that you are at least 13 years of age and possess the legal capacity to enter into these Terms. If you do not agree to these Terms, please do not use the application.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>2. Service Description & Financial Disclaimer</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>Personal Bookkeeping Utility:</Text> Rupeo is a personal expense tracker, budgeting tool, peer khata (Friends & Udhar), voice logger, and bill reminder application.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Not a Financial Advisor:</Text> Rupeo is not a registered financial advisor, bank, or tax professional. Any spending wave graphs, AI financial insights, or category reports are for informational and personal organization purposes only. You are solely responsible for your financial decisions.{'\n'}
                  • <Text style={styles.legalTextSemibold}>No Banking or Fund Custody:</Text> Rupeo does not hold, transmit, custody, deposit, or withdraw real currency.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>3. Bank Alert Auto-Detection & Message Import</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>Bank Message Parsing Utility:</Text> Rupeo provides automated banking and UPI transaction detection solely as an on-device bookkeeping helper. Rupeo does not link to your bank accounts, cannot initiate or cancel transactions, has no access to funds or MPINs, and does not provide banking services.{'\n'}
                  • <Text style={styles.legalTextSemibold}>User Verification:</Text> Automated detection operates on local pattern matching. Users are responsible for confirming auto-populated transaction amounts before or after saving them into their ledger.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>4. Voice Quick Add & Permissions</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>Voice Parsing:</Text> Speech recognition processes audio locally to transcribe amounts and categories. Audio files are not stored on remote servers.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Verification:</Text> Users are responsible for confirming auto-populated transaction amounts before or after saving.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>5. Friends, Udhar & Split UPI QR Generation</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>Peer-to-Peer Khata:</Text> Friends & Udhar entries represent personal bookkeeping records between you and your peers. Rupeo is not a party to any loan, debt, or settlement.{'\n'}
                  • <Text style={styles.legalTextSemibold}>UPI QR Passes:</Text> QR codes generated with your UPI ID link directly to standard NPCI UPI protocols. Payments are processed entirely outside Rupeo through your third-party UPI apps (Google Pay, PhonePe, Paytm, etc.). Innovatex Labs holds no liability for payment transfers or erroneous details.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>6. User Account & Security</Text>
                <Text style={styles.legalText}>
                  • You are responsible for safeguarding your login credentials and for all activities that occur under your account.{'\n'}
                  • You agree to provide accurate information and not impersonate any person or entity.{'\n'}
                  • You must immediately notify us of any suspected unauthorized access to your account.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>7. Receipts, Barcodes & Shared Documents</Text>
                <Text style={styles.legalText}>
                  • Rupeo provides receipt sharing and ISO/IEC 16388 Code 39 barcode encoding for personal expense verification.{'\n'}
                  • You are solely responsible for ensuring the legality, authenticity, and accuracy of any images or transaction receipts that you upload, export, or share with third parties.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>8. In-App Purchases & VIP Subscriptions</Text>
                <Text style={styles.legalText}>
                  • Rupeo offers optional VIP / Pro subscriptions that remove advertisements, provide unlimited bill reminders, and unlock premium report exports.{'\n'}
                  • Payments are processed securely via Google Play In-App Billing (or Apple App Store). Subscriptions renew automatically unless cancelled at least 24 hours before the renewal date in your Google Play Store Account Settings.{'\n'}
                  • All refunds are governed by Google Play Store standard refund policies.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>9. Intellectual Property & Prohibited Activities</Text>
                <Text style={styles.legalText}>
                  • The Rupeo app, brand logo, software code, UI design, animations, and icons are the exclusive intellectual property of Innovatex Labs.{'\n'}
                  • You agree not to decompile, reverse-engineer, exploit, or disrupt any part of the service.{'\n'}
                  • We reserve the right to suspend or terminate accounts that violate these Terms or engage in abusive behavior.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>10. Limitation of Liability</Text>
                <Text style={styles.legalText}>
                  To the maximum extent permitted by applicable law, Innovatex Labs and its creators shall not be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use the service, data loss, payment disputes, or reliance on information presented in the app.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>11. Governing Law & Contact</Text>
                <Text style={styles.legalText}>
                  These Terms shall be governed by and construed in accordance with the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of India.{'\n\n'}
                  For support or inquiries, please contact:{'\n'}
                  <Text style={styles.legalTextSemibold}>Email:</Text> innovatexlab.services@gmail.com{'\n'}
                  <Text style={styles.legalTextSemibold}>Publisher:</Text> Innovatex Labs{'\n'}
                  <Text style={styles.legalTextSemibold}>Portal:</Text> https://rupeoo.vercel.app/download
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ConfirmDialogModal
        visible={logoutModalVisible}
        title={t('log_out')}
        message={t('logout_msg')}
        confirmText={t('log_out')}
        cancelText={t('cancel')}
        type="warning"
        icon="log-out-outline"
        onConfirm={() => {
          setLogoutModalVisible(false);
          logout();
        }}
        onCancel={() => setLogoutModalVisible(false)}
      />

      <ConfirmDialogModal
        visible={deleteDataModalVisible}
        title={t('delete_all_transactions')}
        message={t('delete_all_transactions_msg')}
        confirmText={t('delete_all')}
        cancelText={t('cancel')}
        type="danger"
        icon="trash-bin-outline"
        loading={isDeletingData}
        onConfirm={executeDeleteAllData}
        onCancel={() => setDeleteDataModalVisible(false)}
      />

      <ConfirmDialogModal
        visible={deleteAccountModalVisible}
        title={t('delete_my_account')}
        message={t('delete_account_msg')}
        confirmText={t('delete_my_account')}
        cancelText={t('cancel')}
        type="danger"
        icon="person-remove-outline"
        loading={isDeletingAccount}
        onConfirm={executeDeleteAccount}
        onCancel={() => setDeleteAccountModalVisible(false)}
      />

      {/* Reset Import History Confirmation Modal */}
      <ConfirmDialogModal
        visible={resetHistoryModalVisible}
        title="Reset Import History"
        message="This will clear all processed message fingerprints, native SMS ID tracking, and cursors. You will be able to re-import past messages from scratch. Existing transactions in Rupeo will not be deleted."
        confirmText="Reset History"
        cancelText="Cancel"
        type="danger"
        icon="refresh-outline"
        loading={isResettingHistory}
        onConfirm={handleResetImportHistory}
        onCancel={() => setResetHistoryModalVisible(false)}
      />

      {/* Custom & International Banks Modal */}
      <BottomSheetModal
        visible={customBankModalVisible}
        onClose={() => setCustomBankModalVisible(false)}
        title="Bank Senders & International"
        icon="globe-outline"
        iconBg="#EEF2FF"
        iconColor="#4F46E5"
        autoHeight
      >
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          {/* Pre-Configured Info Card */}
          <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#DCFCE7' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#166534' }}>75+ Indian Banks Pre-Configured</Text>
            </View>
            <Text style={{ fontSize: 12, color: '#15803D', lineHeight: 18 }}>
              SBI, HDFC, ICICI, Axis, Kotak, PNB, BOB, Canara, IndusInd, Federal, Union, PhonePe, Google Pay, Paytm, CRED &amp; all major UPI apps are verified out-of-the-box.
            </Text>
          </View>

          {/* Add Other Country / Custom Bank Section */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 4 }}>
            Add Custom Bank / Country Senders
          </Text>
          <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12, lineHeight: 18 }}>
            Users outside India or using regional banks can add bank names or SMS headers (e.g. Chase, Emirates NBD, Barclays, ADCB). Messages from added banks will be automatically parsed and auto-added.
          </Text>

          {/* Input & Add Row */}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <View style={[styles.startingBalanceInputRow, { flex: 1, marginBottom: 0 }]}>
              <Ionicons name="business-outline" size={18} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.startingBalanceInput, { fontSize: 14, textAlign: 'left', flex: 1 }]}
                value={customBankInput}
                onChangeText={setCustomBankInput}
                placeholder="e.g. Chase, Emirates NBD"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
              />
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 0, paddingHorizontal: 16, height: 46 }]}
              onPress={async () => {
                const clean = customBankInput.trim().toUpperCase();
                if (!clean) return;
                const uid = user?.uid || 'local';
                const updated = await addCustomBank(uid, clean);
                setSmsSettings(updated);
                setCustomBankInput('');
                Toast.show({
                  type: 'success',
                  text1: 'Bank Added',
                  text2: `Messages from ${clean} will now be auto-detected.`,
                });
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {/* List of Custom Banks */}
          {(smsSettings.customBanks && smsSettings.customBanks.length > 0) ? (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>
                Your Added Banks ({smsSettings.customBanks.length})
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {smsSettings.customBanks.map((bank) => (
                  <View
                    key={bank}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#EEF2FF',
                      borderColor: '#C7D2FE',
                      borderWidth: 1,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 20,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#4338CA', marginRight: 6 }}>
                      {bank}
                    </Text>
                    <TouchableOpacity
                      onPress={async () => {
                        const uid = user?.uid || 'local';
                        const updated = await removeCustomBank(uid, bank);
                        setSmsSettings(updated);
                        Toast.show({
                          type: 'info',
                          text1: 'Bank Removed',
                          text2: `Removed ${bank} from custom banks list.`,
                        });
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color="#6366F1" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Done Button */}
          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 8 }]}
            onPress={() => setCustomBankModalVisible(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </BottomSheetModal>

      <GooglePlayReviewModal
        visible={showReviewModal}
        userId={user?.uid || ''}
        onClose={() => setShowReviewModal(false)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const COLORS = {
  brand: '#FFD740',
  brandDark: '#F59E0B',
  ink: '#1C1C1E',
  navy: '#0F172A',
  navySoft: '#1E293B',
  navyBorder: '#334155',
  muted: '#9CA3AF',
  mutedSoft: '#94A3B8',
  border: '#E5E7EB',
  cardBg: '#F7F8FC',
  danger: '#E63946',
  success: '#10B981',
  info: '#3B82F6',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContainer: { flex: 1 },
  scrollContent: { flexGrow: 1, maxWidth: 500, width: '100%', alignSelf: 'center', paddingBottom: 40 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyStateText: { fontSize: 16, color: COLORS.muted, fontWeight: '800' },

  topHalf: { backgroundColor: '#F8FAFC', paddingBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 32, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontWeight: '600', color: '#64748B', marginTop: 4 },

  bottomHalf: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
  },

  profileCardWrapper: {
    marginBottom: 28,
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  profileCard: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarContainer: { position: 'relative', marginBottom: 16 },
  avatarContainerVip: {
    shadowColor: '#F59E0B',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
  },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 4, borderColor: '#EFF6FF' },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#DBEAFE',
  },
  avatarPlaceholderVip: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FFD740',
  },
  avatarLetter: { fontSize: 36, fontWeight: '900', color: '#3B82F6' },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  vipCrownBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFD740',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  editProfilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 16,
  },
  editProfilePillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  userName: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 4, letterSpacing: -0.5 },
  userEmail: { fontSize: 14, color: '#64748B', marginBottom: 8, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statItem: { alignItems: 'center', flex: 1, paddingHorizontal: 4, overflow: 'hidden' },
  statDivider: { width: 1, height: 30, backgroundColor: '#E2E8F0' },
  statValue: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginBottom: 4, textAlign: 'center' },
  statLabel: { fontSize: 10, color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },

  // RUPEO PRO BANNER STYLES
  proBannerCardWrapper: {
    marginBottom: 24,
    borderRadius: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  proBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
  },
  proBannerCardVip: {
    borderColor: '#FFD740',
  },
  proBannerCardFree: {
    borderColor: 'rgba(255, 215, 64, 0.4)',
  },
  proBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  proCrownCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  proCrownCircleVip: {
    backgroundColor: '#162032',
    borderColor: '#FFD740',
    shadowColor: '#FFD740',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  proCrownCircleFree: {
    backgroundColor: '#1C150A',
    borderColor: 'rgba(255, 215, 64, 0.5)',
  },
  proBannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  proActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  proActiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#34D399',
    letterSpacing: 0.4,
  },
  proAdFreeBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 7,
  },
  proAdFreeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#07090E',
    letterSpacing: 0.4,
  },
  proBannerSub: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
  },
  proActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 3,
  },
  proActionPillVip: {
    backgroundColor: 'rgba(255, 215, 64, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 64, 0.3)',
  },
  proActionPillFree: {
    backgroundColor: '#FFD740',
  },
  proActionPillText: {
    fontSize: 11.5,
    fontWeight: '900',
  },
  proActionPillTextVip: {
    color: '#FFD740',
  },
  proActionPillTextFree: {
    color: '#07090E',
  },

  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 16,
  },
  infoCard: {
    backgroundColor: 'transparent',
    gap: 8,
  },
  backupActions: {
    flexDirection: 'row',
    gap: 8,
  },
  backupAction: {
    flex: 1,
    minHeight: 92,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#64748B',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  backupActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  backupActionLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  infoIconBg: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoTextContainer: { flex: 1 },
  infoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  infoLabel: { fontSize: 14, color: '#0F172A', fontWeight: '700' },
  infoValue: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  infoDivider: { display: 'none' },

  rowBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  rowBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  sectionTitleNoMargin: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  securityHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  securityHeaderBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
  },

  // Help & Support Card
  supportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },

  // Dedicated Rate & Review Card
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FEF08A',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  supportCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  supportIconWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  headerAppBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  headerAppBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  userVipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  userVipBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  activeDotPulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  infoIconGradient: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  prefRowCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#64748B',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  prefHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefSelectorWrap: {
    marginTop: 12,
  },
  currencySelectorBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deleteAccountGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  supportIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  supportStatusDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  supportTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  supportTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  supportCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  supportLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  supportLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#B45309',
    marginRight: 4,
  },
  supportLiveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  supportCardDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    fontWeight: '500',
  },
  supportActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  prefRow: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#64748B',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  prefLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  aiPrefRow: {
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#64748B',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  aiPrefLabelWrap: { flex: 1, marginRight: 8, marginBottom: 10 },
  aiPrefLabelRow: { flexDirection: 'row', alignItems: 'center' },
  aiSparkIcon: { marginRight: 4 },
  aiPrefLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  aiPrefSubLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },

  pillContainer: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activePill: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  activePillAccent: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  pillText: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  activePillText: { color: '#FFFFFF' },
  activePillTextAccent: { color: '#92400E', fontWeight: '900' },

  currencySelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  currencySymbolText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },

  versionText: { textAlign: 'center', color: '#94A3B8', fontSize: 12, fontWeight: '800', marginBottom: 40 },

  // Danger Zone Card
  dangerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#64748B',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  dangerDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  dangerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dangerIconWrapRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  dangerTextWrap: {
    flex: 1,
  },
  dangerRowLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  dangerRowSub: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 2,
  },

  deleteAccountBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 16,
    shadowColor: '#EF4444',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  deleteAccountBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: '82%',
    paddingTop: 14,
    paddingHorizontal: 24,
    paddingBottom: 0,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  autoHeightModal: {
    height: '100%',
    maxHeight: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalBodyContent: {
    paddingBottom: 40,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 24, fontWeight: '900', color: COLORS.ink, letterSpacing: -0.5 },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: { flex: 1 },
  modalIntroText: { fontSize: 13.5, color: '#64748B', marginBottom: 18, lineHeight: 20, fontWeight: '600' },
  startingBalanceInputRow: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  startingBalanceCurrency: { color: '#B45309', fontSize: 22, fontWeight: '900', marginRight: 10 },
  startingBalanceInput: { flex: 1, color: '#1C1C1E', fontSize: 22, fontWeight: '800', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) } as any,

  legalText: { fontSize: 14.5, color: '#475569', lineHeight: 24, fontWeight: '500' },
  legalTextBold: { fontSize: 21, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
  legalDateText: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 12 },
  legalIntroText: { fontSize: 14, color: '#334155', lineHeight: 22, fontWeight: '500' },
  legalSectionHeading: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginTop: 16, marginBottom: 8 },
  legalTextSemibold: { fontWeight: '800', color: '#1E293B' },
  legalHighlightText: { fontWeight: '800', color: '#DC2626' },

  fullPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  fullPageBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#64748B',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  fullPageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  fullPageContent: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 8,
  },

  fileSelectBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.brand,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: COLORS.brandDark,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  fileSelectBtnText: { fontSize: 15, fontWeight: '900', color: COLORS.ink },

  selectedFileBox: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  selectedFileName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
    flexShrink: 1,
  },
  removeFileBtn: {
    padding: 4,
  },

  importInput: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    fontSize: 13,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 120,
    marginBottom: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  } as any,

  primaryBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.brand,
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: COLORS.brandDark,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '900', color: COLORS.ink },
  btnIcon: { marginRight: 8 },
  btnDisabled: { opacity: 0.65 },

  cancelBtn: { padding: 12, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.muted },

  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  formatCardActive: { backgroundColor: '#FFFBEB', borderColor: COLORS.brandDark },
  formatCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 10 },
  formatIconCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  formatTextWrap: { flex: 1 },
  formatTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  formatTitle: { fontSize: 14.5, fontWeight: '900', color: COLORS.navy },
  formatDesc: { fontSize: 11.5, color: '#64748B', lineHeight: 16, fontWeight: '500' },
  recommendedBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  recommendedBadgeText: { fontSize: 9.5, fontWeight: '900', color: '#B45309', textTransform: 'uppercase' },

  orDividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 10 },
  orDividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  orDividerText: { fontSize: 11, fontWeight: '900', color: COLORS.mutedSoft, letterSpacing: 0.5 },

  // Luxury Pro Subscription Card Styles (V2)
  proCardActiveV2: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  // Sleek Compact Pro Subscription Card Styles
  proCardCompact: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.2,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  proCompactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  proCompactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
    gap: 4,
  },
  proCompactBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#34D399',
    letterSpacing: 0.6,
  },
  proBadgeGoldCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    gap: 4,
  },
  proBadgeGoldTextCompact: {
    fontSize: 10,
    fontWeight: '900',
    color: '#F59E0B',
    letterSpacing: 0.6,
  },
  proPriceTagCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 5,
  },
  proPriceTextCompact: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  proSavePillCompact: {
    backgroundColor: '#10B981',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  proSavePillTextCompact: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  proCompactBody: {
    marginBottom: 8,
  },
  proCompactTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  proCompactDesc: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '500',
  },
  proCompactTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  proCompactPlanName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  proCompactPerksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  proFeaturePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 4,
  },
  proFeaturePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  proCompactPerk: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.2)',
    gap: 4,
  },
  proCompactPerkText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#34D399',
  },
  proCompactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proUpgradeBtnCompact: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  proUpgradeGradientCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  proUpgradeBtnTextCompact: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0B0F19',
    letterSpacing: 0.2,
  },
  proCompactChangeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  proCompactBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  proCompactSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  proCompactSyncText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  proActiveIndicatorV2: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 78, 59, 0.8)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    gap: 4,
  },
  proActiveDotV2: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#34D399',
  },
  proActiveStatusTextV2: {
    fontSize: 10,
    fontWeight: '800',
    color: '#34D399',
  },

  // STATEMENT PDF MODAL STYLES
  statementSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  statementPeriodPillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statementPeriodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  statementPeriodBtnActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 2,
  },
  statementPeriodBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  statementPeriodBtnTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  statementSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  monthChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  monthChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  statementFilterPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeFilterPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typeFilterPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#0F172A',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  typeFilterText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  typeFilterTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  statementPreviewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 14,
  },
  statementPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    paddingBottom: 10,
    marginBottom: 10,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  previewCountText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  previewBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.4,
  },
  previewStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  previewStatLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  previewStatVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  statementPerksCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  perkText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#15803D',
    flex: 1,
  },
  exportStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  exportStatusCardEmpty: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  exportStatusText: {
    flex: 1,
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
    lineHeight: 16,
  },
  exportStatusTextEmpty: {
    color: '#B45309',
  },
  // Udhar Dashboard Sync Card Styles
  udharPrefCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginVertical: 4,
  },
  udharPrefCardActive: {
    backgroundColor: '#F5F7FF',
    borderColor: '#C7D2FE',
    shadowColor: '#6366F1',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  udharPrefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  udharIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  udharIconCircleActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  udhar3dImg: {
    width: 32,
    height: 32,
  },
  udharPrefTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  udharPrefSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  udharBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  udharBadgeActive: {
    backgroundColor: '#EEF2FF',
  },
  udharBadgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  udharDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  udharDotActive: {
    backgroundColor: '#4F46E5',
  },
  udharDotInactive: {
    backgroundColor: '#64748B',
  },
  udharBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  udharBadgeTextActive: {
    color: '#4F46E5',
  },
  udharBadgeTextInactive: {
    color: '#64748B',
  },
  udharNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  udharNoteBoxActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C7D2FE',
  },
  udharNoteText: {
    flex: 1,
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    fontWeight: '600',
  },
  udharNoteTextActive: {
    color: '#4338CA',
    fontWeight: '700',
  },
  // REORGANIZED SETTINGS & SEARCH STYLES
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    padding: 0,
  },
  emptySearchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptySearchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  emptySearchSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionHeaderRowSimple: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  accountActionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    marginTop: 12,
  },
  languageCardInner: {
    padding: 16,
  },
  versionFooter: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  versionSubText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
  },
});