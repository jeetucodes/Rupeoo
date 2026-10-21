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
import { restorePurchases, getPlanDisplayName } from '@/lib/iap';
import { HelpSupportModal } from '@/components/help-support-modal';
import { requestGooglePlayReview, openPlayStorePageDirectly, setUserReviewPrompted, clearReviewPending } from '@/lib/review';
import { GooglePlayReviewModal } from '@/components/GooglePlayReviewModal';
import Constants from 'expo-constants';

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
// Reusable: Info / Nav Row
// ---------------------------------------------------------------------------

function SettingsRow({
  icon,
  iconBg = '#F1F5F9',
  iconColor = '#0F172A',
  gradientColors,
  label,
  value,
  labelColor,
  onPress,
  loading = false,
  showChevron = true,
  badgeText,
  badgeBg,
  badgeColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  gradientColors?: [string, string];
  label: string;
  value?: string;
  labelColor?: string;
  onPress?: () => void;
  loading?: boolean;
  showChevron?: boolean;
  badgeText?: string;
  badgeBg?: string;
  badgeColor?: string;
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  const handlePress = () => {
    if (!onPress) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onPress();
  };

  return (
    <Wrapper
      style={styles.infoRow}
      onPress={onPress ? handlePress : undefined}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
    >
      <View style={[styles.infoIconBg, { backgroundColor: iconBg || '#F1F5F9', borderColor: iconBg || '#E2E8F0' }]}>
        <Ionicons name={icon} size={20} color={iconColor || '#0F172A'} />
      </View>
      <View style={styles.infoTextContainer}>
        <View style={styles.infoLabelRow}>
          <Text style={[styles.infoLabel, labelColor && { color: labelColor }]}>{label}</Text>
          {!!badgeText && (
            <View style={[styles.rowBadge, { backgroundColor: badgeBg || '#F1F5F9' }]}>
              <Text style={[styles.rowBadgeText, { color: badgeColor || '#475569' }]}>{badgeText}</Text>
            </View>
          )}
        </View>
        {!!value && (
          <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
            {value}
          </Text>
        )}
      </View>
      {onPress && (loading ? <ActivityIndicator size="small" color={iconColor} /> : showChevron && (
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      ))}
    </Wrapper>
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
    } catch {}
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
    } catch {}
    if (user?.uid) {
      setUserReviewPrompted(user.uid).catch(() => {});
      clearReviewPending(user.uid).catch(() => {});
    }
    await openPlayStorePageDirectly();
  };

  // Automatically sync widgets in the background when settings screen is active
  useEffect(() => {
    if (user?.uid) {
      syncWidgetWithTransactions(user.uid).catch(() => {});
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
      syncWidgetWithTransactions(user.uid).catch(() => {});
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
          {/* Profile Card */}
          <TouchableOpacity
            style={styles.profileCardWrapper}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
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

          {/* Subscription & Membership (Remotely Controlled by Admin via Firestore) */}
          {appConfig?.showSubscriptions !== false && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('subscription_membership')}</Text>
              {isPremium ? (
                <LinearGradient
                  colors={['#061A14', '#064E3B', '#0B132B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.proCardCompact}
                >
                  {/* Top Bar */}
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

                  {/* Plan Name & Tagline */}
                  <View style={styles.proCompactTitleRow}>
                    <Ionicons name="diamond" size={16} color="#F59E0B" style={{ marginRight: 6 }} />
                    <Text style={styles.proCompactPlanName}>
                      {getPlanDisplayName(currentPlan || (user as any)?.premiumPlan)}
                    </Text>
                  </View>

                  {/* Highlights Row */}
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

                  {/* Actions */}
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
                  {/* Top Bar: Badge & Price */}
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

                  {/* Headline */}
                  <View style={styles.proCompactBody}>
                    <Text style={styles.proCompactTitle}>{t('upgrade_to_pro')}</Text>
                    <Text style={styles.proCompactDesc} numberOfLines={1}>
                      {t('pro_features_desc')}
                    </Text>
                  </View>

                  {/* Compact Feature Pills */}
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

                  {/* Action Buttons Row */}
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

          {/* Planning & Categories */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleNoMargin}>{t('planning_expenses')}</Text>
            </View>
            <View style={styles.infoCard}>
              <SettingsRow
                icon="pie-chart"
                iconBg="#FEF3C7"
                iconColor="#D97706"
                label={t('budget_goals')}
                value={t('budget_goals_desc')}
                onPress={() => router.push('/budget')}
              />
              <SettingsRow
                icon="grid"
                iconBg="#EEF2FF"
                iconColor="#4F46E5"
                label={t('manage_categories')}
                value={t('manage_categories_desc')}
                onPress={() => router.push('/categories')}
              />
              <SettingsRow
                icon="wallet"
                iconBg="#ECFDF5"
                iconColor="#059669"
                label={t('update_starting_balance')}
                value={`${t('current_balance_prefix')} ${curr}${Number((user as any)?.startingBalance || 0).toLocaleString('en-IN')}`}
                onPress={openStartingBalanceEditor}
              />
            </View>
          </View>

          {/* Preferences */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleNoMargin}>{t('preferences')}</Text>
            </View>
            <View style={styles.infoCard}>
              {/* Language Card */}
              <View style={styles.prefRowCard}>
                <View style={styles.prefHeaderRow}>
                  <View style={[styles.infoIconBg, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}>
                    <Ionicons name="language" size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{t('language')}</Text>
                    <Text style={styles.infoValue}>
                      {settings?.language === 'Hindi' ? 'ऐप की भाषा चुनें' : settings?.language === 'Hinglish' ? 'App ki bhasha chunein' : 'Select app display language'}
                    </Text>
                  </View>
                </View>
                <View style={styles.prefSelectorWrap}>
                  <PillSelector
                    options={LANGUAGES}
                    activeValue={(settings?.language as Language) || 'English'}
                    onSelect={val => {
                      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                      updatePref('language', val);
                    }}
                    a11yLabel="App language"
                  />
                </View>
              </View>

              {/* Currency Row */}
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setShowCurrencyModal(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('currency')}
              >
                <View style={[styles.infoIconBg, { backgroundColor: '#F5F3FF', borderColor: '#EDE9FE' }]}>
                  <Ionicons name="cash" size={20} color="#7C3AED" />
                </View>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>{t('currency')}</Text>
                  <Text style={styles.infoValue}>
                    {selectedCurrencyObj ? `${selectedCurrencyObj.name} (${selectedCurrencyObj.symbol})` : 'Default Currency'}
                  </Text>
                </View>
                <View style={styles.currencySelectorBtnModern}>
                  <Text style={styles.currencySymbolText}>{selectedCurrencyObj?.symbol || settings?.currency || '₹'}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#64748B" style={{ marginLeft: 6 }} />
                </View>
              </TouchableOpacity>

              {/* Add Udhar to Dashboard Spends Featured Card */}
              <View style={[styles.udharPrefCard, syncUdharDashboard && styles.udharPrefCardActive]}>
                <View style={styles.udharPrefHeader}>
                  <View style={[styles.udharIconCircle, syncUdharDashboard && styles.udharIconCircleActive]}>
                    <ExpoImage cachePolicy="memory-disk"
                      source={require('@/assets/images/3D_frinds-icon.png')}
                      style={styles.udhar3dImg}
                      contentFit="contain"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.udharPrefTitle}>{t('sync_udhar_to_dashboard')}</Text>
                      <View style={[styles.udharBadge, syncUdharDashboard ? styles.udharBadgeActive : styles.udharBadgeInactive]}>
                        <View style={[styles.udharDot, syncUdharDashboard ? styles.udharDotActive : styles.udharDotInactive]} />
                        <Text style={[styles.udharBadgeText, syncUdharDashboard ? styles.udharBadgeTextActive : styles.udharBadgeTextInactive]}>
                          {syncUdharDashboard ? t('udhar_sync_active_badge') : t('udhar_sync_inactive_badge')}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.udharPrefSub}>{t('sync_udhar_to_dashboard_sub')}</Text>
                  </View>
                  <Switch
                    value={syncUdharDashboard}
                    onValueChange={handleToggleUdharDashboard}
                    trackColor={{ false: '#CBD5E1', true: '#6366F1' }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="#CBD5E1"
                  />
                </View>

                {/* Dynamic Context Explanation */}
                <View style={[styles.udharNoteBox, syncUdharDashboard && styles.udharNoteBoxActive]}>
                  <Ionicons
                    name={syncUdharDashboard ? "checkmark-circle" : "shield-checkmark-outline"}
                    size={15}
                    color={syncUdharDashboard ? "#4F46E5" : "#64748B"}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.udharNoteText, syncUdharDashboard && styles.udharNoteTextActive]}>
                    {syncUdharDashboard ? t('udhar_sync_active_desc') : t('udhar_sync_inactive_desc')}
                  </Text>
                </View>
              </View>

              {/* My UPI ID Row */}
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setUpiInput(settings?.upiId || '');
                  setShowUpiModal(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="My UPI ID"
              >
                <View style={[styles.infoIconBg, { backgroundColor: '#F3E8FF', borderColor: '#E9D5FF' }]}>
                  <Ionicons name="qr-code" size={20} color="#8B5CF6" />
                </View>
                <View style={styles.infoTextContainer}>
                  <View style={styles.infoLabelRow}>
                    <Text style={styles.infoLabel}>My UPI ID</Text>
                    {settings?.upiId ? (
                      <View style={[styles.rowBadge, { backgroundColor: '#ECFDF5' }]}>
                        <Text style={[styles.rowBadgeText, { color: '#047857' }]}>SET</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {settings?.upiId || 'Add UPI ID for statement QR'}
                  </Text>
                </View>
                <View style={styles.currencySelectorBtnModern}>
                  <Text style={[styles.currencySymbolText, { fontSize: 13, fontWeight: '700', color: '#6366F1' }]}>
                    {settings?.upiId ? 'Edit' : 'Add'}
                  </Text>
                  <Ionicons name="pencil" size={12} color="#6366F1" style={{ marginLeft: 4 }} />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Data Management */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleNoMargin}>{t('data_management')}</Text>
              <View style={styles.securityHeaderBadge}>
                <Ionicons name="shield-checkmark" size={11} color="#059669" style={{ marginRight: 4 }} />
                <Text style={styles.securityHeaderBadgeText}>{t('secure_backups')}</Text>
              </View>
            </View>
            <View style={styles.infoCard}>
              <SettingsRow
                icon="document-text"
                iconBg="#FEF2F2"
                iconColor="#DC2626"
                label={t('statement_pdf')}
                value={t('statement_pdf_desc')}
                badgeText="PDF PASSBOOK"
                badgeBg="#FEF2F2"
                badgeColor="#DC2626"
                onPress={openStatementModal}
              />
              <SettingsRow
                icon="cloud-download"
                iconBg="#ECFDF5"
                iconColor="#059669"
                label={t('export_data')}
                value={t('export_desc')}
                badgeText="JSON • CSV"
                badgeBg="#ECFDF5"
                badgeColor="#059669"
                onPress={openExportModal}
                loading={isExporting}
              />
              <SettingsRow
                icon="cloud-upload"
                iconBg="#EFF6FF"
                iconColor="#2563EB"
                label={t('import_data')}
                value={t('import_desc')}
                badgeText="RESTORE"
                badgeBg="#EFF6FF"
                badgeColor="#2563EB"
                onPress={() => setShowImportModal(true)}
              />
              <SettingsRow
                icon="trash"
                iconBg="#FEF2F2"
                iconColor="#DC2626"
                label={t('delete_all_data')}
                labelColor="#DC2626"
                value={t('delete_all_desc')}
                badgeText="RESET"
                badgeBg="#FEF2F2"
                badgeColor="#DC2626"
                onPress={() => setDeleteDataModalVisible(true)}
              />
            </View>
          </View>

          {/* Help & Support */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleNoMargin}>{t('help_support')}</Text>
            </View>
            <TouchableOpacity
              style={styles.supportCard}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                setShowSupportModal(true);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('help_support')}
            >
              <View style={styles.supportCardContent}>
                {/* Left: Support Icon */}
                <View style={styles.supportIconWrapper}>
                  <View style={[styles.supportIconBg, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}>
                    <Ionicons name="headset" size={22} color="#2563EB" />
                  </View>
                  <View style={styles.supportStatusDot} />
                </View>

                {/* Center: Title, Subtitle, Live Tag */}
                <View style={styles.supportTextWrap}>
                  <View style={styles.supportTitleRow}>
                    <Text style={styles.supportCardTitle}>{t('support_desk_faqs')}</Text>
                    <View style={styles.supportLiveBadge}>
                      <View style={styles.supportLiveDot} />
                      <Text style={styles.supportLiveText}>24/7 ACTIVE</Text>
                    </View>
                  </View>
                  <Text style={styles.supportCardDesc}>
                    {t('support_desk_desc')}
                  </Text>
                </View>

                {/* Right: Chevron */}
                <View style={styles.supportActionBtn}>
                  <Ionicons name="chevron-forward" size={18} color="#0F172A" />
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Rate & Review Card */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleNoMargin}>Rate & Review</Text>
            </View>
            <TouchableOpacity
              style={styles.reviewCard}
              onPress={handleOpenPlayStoreReview}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Rate on Google Play"
            >
              <View style={styles.supportCardContent}>
                {/* Left: Clean Amber Star Icon */}
                <View style={styles.supportIconWrapper}>
                  <View style={[styles.supportIconBg, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                    <Ionicons name="star" size={22} color="#D97706" />
                  </View>
                </View>

                {/* Center: Title, Subtitle, Rating Tag */}
                <View style={styles.supportTextWrap}>
                  <View style={styles.supportTitleRow}>
                    <Text style={styles.supportCardTitle}>Rate on Google Play</Text>
                    <View style={[styles.supportLiveBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                      <Text style={[styles.supportLiveText, { color: '#B45309' }]}>⭐ 5.0 RATING</Text>
                    </View>
                  </View>
                  <Text style={styles.supportCardDesc}>
                    Enjoying Rupeo? Support our journey with a 5-star review on Play Store!
                  </Text>
                </View>

                {/* Right: Open Store Action */}
                <View style={styles.supportActionBtn}>
                  <Ionicons name="open-outline" size={18} color="#2563EB" />
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Legal */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleNoMargin}>{t('legal')}</Text>
            </View>
            <View style={styles.infoCard}>
              <SettingsRow
                icon="document-text"
                iconBg="#F1F5F9"
                iconColor="#475569"
                label={t('terms_conditions')}
                onPress={() => setLegalDoc('terms')}
              />
              <SettingsRow
                icon="shield-checkmark"
                iconBg="#F0FDFA"
                iconColor="#0D9488"
                label={t('privacy_policy')}
                onPress={() => setLegalDoc('privacy')}
              />
            </View>
          </View>

          {/* Danger Zone */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleNoMargin}>{t('danger_zone')}</Text>
            </View>
            <View style={styles.dangerCard}>
              {/* Logout */}
              <TouchableOpacity
                style={styles.dangerRow}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setLogoutModalVisible(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('log_out')}
              >
                <View style={[styles.infoIconBg, { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' }]}>
                  <Ionicons name="log-out" size={20} color="#DC2626" />
                </View>
                <View style={styles.dangerTextWrap}>
                  <Text style={styles.dangerRowLabel}>{t('log_out')}</Text>
                  <Text style={styles.dangerRowSub}>{t('logout_msg')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </TouchableOpacity>
            </View>

            {/* Standalone Delete Account Button */}
            <TouchableOpacity
              style={styles.deleteAccountBtn}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                setDeleteAccountModalVisible(true);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('delete_my_account')}
            >
              <LinearGradient
                colors={['#EF4444', '#DC2626']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.deleteAccountGradient}
              >
                <Ionicons name="warning" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.deleteAccountBtnText}>{t('delete_my_account')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Text style={styles.versionText}>Rupeo v2.1.8</Text>
          </View>
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
                <Text style={styles.legalDateText}>Effective Date: October 6, 2026 | Version 2.2</Text>

                <Text style={styles.legalIntroText}>
                  Innovatex Labs ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how our personal finance and bookkeeping application Rupeo ("App", package: com.innovatexlabs.paisewaise, portal: https://rupeoo.vercel.app/download) collects, uses, protects, and handles your personal and financial information.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>1. Information We Collect</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>Account & Identity:</Text> When you register using Email/Password or Google Sign-In, we collect your display name, email address, profile picture URL, and Firebase Auth UID.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Financial Transactions:</Text> Income and expense amounts, transaction timestamps, payment modes (UPI, Cash, Debit/Credit Card, Net Banking), category allocations, and optional notes/memos.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Voice Input (Voice Quick Add):</Text> Spoken phrases are processed locally using on-device Speech Recognition APIs to transcribe amounts and categories. Audio recordings are never uploaded, stored, or shared remotely.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Friends & Udhar (Khata):</Text> Peer contact names and optional phone numbers entered to track shared expenses, lent ("Gave"), and borrowed ("Got") amounts.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Split UPI QR Generation:</Text> Your UPI ID (VPA) is used locally to create standard NPCI UPI payment deep links (`upi://pay?...`) and rendered into scannable passes for sharing.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Receipts & Bill Images:</Text> Physical receipt photos, invoices, and payment proof screenshots that you voluntarily take using the in-app camera or select from your photo library (stored securely via Cloudinary).{'\n'}
                  • <Text style={styles.legalTextSemibold}>Recurring Bill Reminders:</Text> Bill provider names (e.g. Jio, Airtel, Vi, BSNL, Rent, Tiffin/Mess, Milk, Maid, Electricity, EMI), bill amounts, billing cycles, and next due dates.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Widgets & Diagnostics:</Text> Home screen widgets render local spend summaries via Android RemoteViews. Device model, OS version, push notification tokens, and anonymous crash telemetry ensure app reliability.{'\n\n'}
                  <Text style={styles.legalHighlightText}>What We DO NOT Collect:</Text> Rupeo never collects or stores your bank login passwords, net banking credentials, ATM PINs, UPI MPINs, or card CVV numbers. Rupeo does not link directly to bank accounts and does not hold user funds.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>2. Device Permissions We Request</Text>
                <Text style={styles.legalText}>
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
                <Text style={styles.legalDateText}>Effective Date: October 6, 2026 | Version 2.2</Text>

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

                <Text style={styles.legalSectionHeading}>3. Voice Quick Add & Permissions</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>Voice Parsing:</Text> Speech recognition processes audio locally to transcribe amounts and categories. Audio files are not stored on remote servers.{'\n'}
                  • <Text style={styles.legalTextSemibold}>Verification:</Text> Users are responsible for confirming auto-populated transaction amounts before or after saving.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>4. Friends, Udhar & Split UPI QR Generation</Text>
                <Text style={styles.legalText}>
                  • <Text style={styles.legalTextSemibold}>Peer-to-Peer Khata:</Text> Friends & Udhar entries represent personal bookkeeping records between you and your peers. Rupeo is not a party to any loan, debt, or settlement.{'\n'}
                  • <Text style={styles.legalTextSemibold}>UPI QR Passes:</Text> QR codes generated with your UPI ID link directly to standard NPCI UPI protocols. Payments are processed entirely outside Rupeo through your third-party UPI apps (Google Pay, PhonePe, Paytm, etc.). Innovatex Labs holds no liability for payment transfers or erroneous details.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>5. User Account & Security</Text>
                <Text style={styles.legalText}>
                  • You are responsible for safeguarding your login credentials and for all activities that occur under your account.{'\n'}
                  • You agree to provide accurate information and not impersonate any person or entity.{'\n'}
                  • You must immediately notify us of any suspected unauthorized access to your account.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>6. Receipts, Barcodes & Shared Documents</Text>
                <Text style={styles.legalText}>
                  • Rupeo provides receipt sharing and ISO/IEC 16388 Code 39 barcode encoding for personal expense verification.{'\n'}
                  • You are solely responsible for ensuring the legality, authenticity, and accuracy of any images or transaction receipts that you upload, export, or share with third parties.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>7. In-App Purchases & VIP Subscriptions</Text>
                <Text style={styles.legalText}>
                  • Rupeo offers optional VIP / Pro subscriptions that remove advertisements, provide unlimited bill reminders, and unlock premium report exports.{'\n'}
                  • Payments are processed securely via Google Play In-App Billing (or Apple App Store). Subscriptions renew automatically unless cancelled at least 24 hours before the renewal date in your Google Play Store Account Settings.{'\n'}
                  • All refunds are governed by Google Play Store standard refund policies.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>8. Intellectual Property & Prohibited Activities</Text>
                <Text style={styles.legalText}>
                  • The Rupeo app, brand logo, software code, UI design, animations, and icons are the exclusive intellectual property of Innovatex Labs.{'\n'}
                  • You agree not to decompile, reverse-engineer, exploit, or disrupt any part of the service.{'\n'}
                  • We reserve the right to suspend or terminate accounts that violate these Terms or engage in abusive behavior.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>9. Limitation of Liability</Text>
                <Text style={styles.legalText}>
                  To the maximum extent permitted by applicable law, Innovatex Labs and its creators shall not be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use the service, data loss, payment disputes, or reliance on information presented in the app.{'\n\n'}
                </Text>

                <Text style={styles.legalSectionHeading}>10. Governing Law & Contact</Text>
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
});