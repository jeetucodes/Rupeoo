import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import {
  isSmsInboxSupported,
  requestSmsPermission,
  splitMultiMessageText,
} from '@/lib/smsReader';
import {
  importFromSmsInbox,
  importFromPastedMessages,
  SmsImportProgress,
  SmsImportResult,
  DetectedItem,
} from '@/lib/smsImporter';
import { undoImportBatch } from '@/lib/smsBatchUndo';
import {
  getSmsImportSettings,
  saveSmsImportSettings,
  addCustomBank,
  removeCustomBank,
  SmsImportSettings,
  DEFAULT_SMS_SETTINGS,
  markSmsPrivacyDisclosureDone,
} from '@/lib/smsSettings';

type ImportRange = '30d' | '90d' | '365d' | 'all';
type FilterTab = 'all' | 'added' | 'pending';

export default function SmsImportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === 'true';
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.uid || 'local';

  // Feature detection for direct Android inbox access
  const hasInboxFeature = isSmsInboxSupported();

  // Mode: 'inbox' (Android direct) or 'paste' (Web & Play flavor)
  const [activeTab, setActiveTab] = useState<'inbox' | 'paste'>(hasInboxFeature ? 'inbox' : 'paste');
  const [selectedRange, setSelectedRange] = useState<ImportRange>('30d');
  const [pasteText, setPasteText] = useState('');

  // Execution states
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<SmsImportProgress>({
    phase: 'idle',
    scannedCount: 0,
    detectedCount: 0,
    duplicatesSkipped: 0,
    addedCount: 0,
    reviewCount: 0,
    totalToScan: 0,
  });

  const [importSummary, setImportSummary] = useState<SmsImportResult | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const cancelControllerRef = useRef<{ cancel: () => void } | null>(null);

  // Settings & Custom Banks State
  const [smsSettings, setSmsSettings] = useState<SmsImportSettings>(DEFAULT_SMS_SETTINGS);
  const [customBankModalVisible, setCustomBankModalVisible] = useState(false);
  const [customBankInput, setCustomBankInput] = useState('');

  // Results display filter & detail modal
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedItemDetail, setSelectedItemDetail] = useState<DetectedItem | null>(null);

  useEffect(() => {
    loadSettings();
  }, [userId]);

  const loadSettings = async () => {
    try {
      const s = await getSmsImportSettings(userId);
      setSmsSettings(s);
    } catch { }
  };

  // 1-Click Inbox Import Action
  const handleStartInboxImport = async () => {
    if (!hasInboxFeature) {
      setActiveTab('paste');
      Toast.show({
        type: 'info',
        text1: 'Paste Mode Active',
        text2: 'Inbox scanning is Android-native. Paste bank alerts below to import.',
      });
      return;
    }

    // Auto-mark privacy disclosure on action
    await markSmsPrivacyDisclosureDone(userId);

    // Request 1-time SMS permission from user
    const hasPermission = await requestSmsPermission();
    if (!hasPermission) {
      Toast.show({
        type: 'error',
        text1: 'SMS Permission Required',
        text2: 'Permission is needed once to scan your bank alerts safely on-device.',
      });
      return;
    }

    const now = Date.now();
    let minDate: number | undefined;
    if (selectedRange === '30d') minDate = now - 30 * 86400000;
    else if (selectedRange === '90d') minDate = now - 90 * 86400000;
    else if (selectedRange === '365d') minDate = now - 365 * 86400000;
    else minDate = 0;

    setIsImporting(true);
    setImportSummary(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    const controller = { cancel: () => { } };
    cancelControllerRef.current = controller;

    const result = await importFromSmsInbox(userId, {
      minDate,
      onProgress: (p: SmsImportProgress) => setImportProgress(p),
      cancelController: controller,
    });

    setIsImporting(false);
    cancelControllerRef.current = null;
    setImportSummary(result);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }
  };

  // 1-Click Paste Import Action
  const handleStartPasteImport = async () => {
    if (!pasteText.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Empty Text',
        text2: 'Please paste one or more bank/UPI message alerts.',
      });
      return;
    }

    setIsImporting(true);
    setImportSummary(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    const rawMessages = splitMultiMessageText(pasteText);
    const result = await importFromPastedMessages(rawMessages, userId, (p: SmsImportProgress) => {
      setImportProgress(p);
    });

    setIsImporting(false);
    setImportSummary(result);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }
  };

  const handleCancel = () => {
    if (cancelControllerRef.current) {
      cancelControllerRef.current.cancel();
      Toast.show({
        type: 'info',
        text1: 'Cancelling...',
        text2: 'Stopping scan gracefully.',
      });
    }
  };

  const handleUndoBatch = async () => {
    if (!importSummary?.batchId) return;

    Alert.alert(
      'Undo This Import?',
      `This will remove the ${importSummary.addedCount} transactions created in this import batch. Ignored and pending items are untouched.`,
      [
        { text: 'Keep Transactions', style: 'cancel' },
        {
          text: 'Undo & Delete',
          style: 'destructive',
          onPress: async () => {
            setIsUndoing(true);
            const count = await undoImportBatch(importSummary.batchId!, userId);
            setIsUndoing(false);
            setImportSummary(null);

            Toast.show({
              type: 'success',
              text1: 'Import Undone',
              text2: `Reverted and removed ${count} transactions.`,
            });
          },
        },
      ]
    );
  };

  // Filter detected items
  const filteredItems = useMemo(() => {
    const list = importSummary?.detectedItems || [];
    if (filterTab === 'added') return list.filter((i) => i.status === 'added');
    if (filterTab === 'pending') return list.filter((i) => i.status === 'pending');
    return list;
  }, [importSummary?.detectedItems, filterTab]);

  // Helper for category visual styling
  const getCategoryTheme = (category: string, type: 'expense' | 'income' | 'transfer') => {
    if (type === 'income') {
      return { bg: '#DCFCE7', text: '#16A34A', icon: 'trending-up' as const };
    }
    const cat = (category || '').toLowerCase();
    if (cat.includes('food') || cat.includes('dining') || cat.includes('coffee')) {
      return { bg: '#FEF3C7', text: '#D97706', icon: 'fast-food' as const };
    }
    if (cat.includes('grocer')) {
      return { bg: '#ECFDF5', text: '#059669', icon: 'basket' as const };
    }
    if (cat.includes('travel') || cat.includes('commute')) {
      return { bg: '#EFF6FF', text: '#2563EB', icon: 'car' as const };
    }
    if (cat.includes('shopping')) {
      return { bg: '#F5F3FF', text: '#7C3AED', icon: 'cart' as const };
    }
    if (cat.includes('bill') || cat.includes('utilities')) {
      return { bg: '#FEE2E2', text: '#DC2626', icon: 'flash' as const };
    }
    if (cat.includes('cash') || cat.includes('atm')) {
      return { bg: '#F0FDF4', text: '#15803D', icon: 'cash' as const };
    }
    if (cat.includes('health')) {
      return { bg: '#FFE4E6', text: '#E11D48', icon: 'medkit' as const };
    }
    return { bg: '#F1F5F9', text: '#475569', icon: 'wallet' as const };
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (fromOnboarding) {
              router.replace('/(tabs)/dashboard');
            } else {
              router.back();
            }
          }}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name={fromOnboarding ? 'close' : 'arrow-back'} size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Import Messages</Text>
          <Text style={styles.headerSubtitle}>Pure on-device bank &amp; UPI expense detector</Text>
        </View>
        <TouchableOpacity
          style={styles.headerCustomBankBtn}
          onPress={() => setCustomBankModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="globe-outline" size={20} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Pre-Configured Indian Banks Banner & Add Custom Bank Button */}
        <View style={styles.bankStatusBanner}>
          <View style={styles.bankStatusLeft}>
            <Ionicons name="shield-checkmark" size={18} color="#16A34A" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bankStatusTitle}>75+ Indian Banks &amp; UPI Pre-Saved</Text>
              <Text style={styles.bankStatusSubtitle}>
                {smsSettings.customBanks?.length
                  ? `+ ${smsSettings.customBanks.length} custom country banks active`
                  : 'SBI, HDFC, ICICI, Axis, Kotak, PNB, BOB, PhonePe, GPay...'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.addCustomBankChip}
            onPress={() => setCustomBankModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={14} color="#4F46E5" style={{ marginRight: 3 }} />
            <Text style={styles.addCustomBankChipText}>Add Bank</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Card: 1-Click Import Action */}
        {!importSummary && (
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroIconWrap}>
                <Ionicons
                  name={activeTab === 'inbox' ? 'chatbubbles' : 'clipboard'}
                  size={26}
                  color="#4F46E5"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>
                  {activeTab === 'inbox' ? '1-Tap Message Import' : 'Paste Bank Messages'}
                </Text>
                <Text style={styles.heroSubtitle}>
                  {activeTab === 'inbox'
                    ? 'Scan bank alerts in 1 click. Zero duplicate guarantee.'
                    : 'Paste multiple SMS alerts or copy from bank apps.'}
                </Text>
              </View>
            </View>

            {/* Range selector for inbox scan */}
            {activeTab === 'inbox' && (
              <View style={styles.rangePillsRow}>
                {[
                  { key: '30d' as const, label: '30 Days' },
                  { key: '90d' as const, label: '3 Months' },
                  { key: '365d' as const, label: '1 Year' },
                  { key: 'all' as const, label: 'All Time' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.rangePill, selectedRange === item.key && styles.rangePillActive]}
                    onPress={() => setSelectedRange(item.key)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.rangePillText,
                        selectedRange === item.key && styles.rangePillTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Paste Input when in Paste mode */}
            {activeTab === 'paste' && (
              <TextInput
                style={styles.pasteArea}
                value={pasteText}
                onChangeText={setPasteText}
                placeholder="Paste bank debit/credit messages or UPI confirmations here... Multiple messages separated by blank lines are automatically detected."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            )}

            {/* Primary Action Button */}
            {!isImporting && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={activeTab === 'inbox' ? handleStartInboxImport : handleStartPasteImport}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={activeTab === 'inbox' ? 'scan' : 'cloud-upload'}
                  size={19}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.primaryBtnText}>
                  {activeTab === 'inbox' ? 'Scan & Import Messages' : 'Import Pasted Alerts'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Tab switch link */}
            <View style={styles.switchModeWrap}>
              {hasInboxFeature && (
                <TouchableOpacity
                  onPress={() => setActiveTab(activeTab === 'inbox' ? 'paste' : 'inbox')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.switchModeText}>
                    {activeTab === 'inbox' ? 'Or paste messages manually →' : '← Or switch to Inbox Scan'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Live Progress Card */}
        {isImporting && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <ActivityIndicator size="small" color="#4F46E5" />
              <Text style={styles.progressTitle}>
                {importProgress.phase === 'reading'
                  ? 'Reading messages safely on device...'
                  : importProgress.phase === 'deduping'
                  ? 'Checking 4-layer smart deduplication...'
                  : 'Analyzing & detecting transactions...'}
              </Text>
            </View>

            {importProgress.totalToScan > 0 && (
              <View style={styles.progressBarWrap}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(
                        100,
                        Math.round((importProgress.scannedCount / importProgress.totalToScan) * 100)
                      )}%`,
                    },
                  ]}
                />
              </View>
            )}

            <View style={styles.progressStatsGrid}>
              <View style={styles.progressStatItem}>
                <Text style={styles.statNumber}>{importProgress.scannedCount}</Text>
                <Text style={styles.statLabel}>Scanned</Text>
              </View>
              <View style={styles.progressStatItem}>
                <Text style={styles.statNumber}>{importProgress.detectedCount}</Text>
                <Text style={styles.statLabel}>Detected</Text>
              </View>
              <View style={styles.progressStatItem}>
                <Text style={[styles.statNumber, { color: '#059669' }]}>
                  {importProgress.addedCount}
                </Text>
                <Text style={styles.statLabel}>Added</Text>
              </View>
              <View style={styles.progressStatItem}>
                <Text style={[styles.statNumber, { color: '#D97706' }]}>
                  {importProgress.reviewCount}
                </Text>
                <Text style={styles.statLabel}>Review</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel Scan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Post-Import Results & Clean Message Cards ("acche msg") */}
        {importSummary && (
          <View style={styles.resultsWrap}>
            {/* Summary Top Banner */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <View style={styles.summaryBadge}>
                  <Ionicons name="checkmark-circle" size={26} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryTitle}>Import Finished</Text>
                  <Text style={styles.summarySubtitle}>
                    {importSummary.addedCount} transactions created • {importSummary.duplicatesSkipped} duplicates skipped
                  </Text>
                </View>
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryStatBox}>
                  <Text style={styles.summaryStatNum}>{importSummary.scannedCount}</Text>
                  <Text style={styles.summaryStatLbl}>Scanned</Text>
                </View>
                <View style={styles.summaryStatBox}>
                  <Text style={[styles.summaryStatNum, { color: '#16A34A' }]}>
                    +{importSummary.addedCount}
                  </Text>
                  <Text style={styles.summaryStatLbl}>Auto-Added</Text>
                </View>
                <View style={styles.summaryStatBox}>
                  <Text style={[styles.summaryStatNum, { color: '#D97706' }]}>
                    {importSummary.reviewCount}
                  </Text>
                  <Text style={styles.summaryStatLbl}>In Inbox</Text>
                </View>
                <View style={styles.summaryStatBox}>
                  <Text style={[styles.summaryStatNum, { color: '#64748B' }]}>
                    {importSummary.duplicatesSkipped}
                  </Text>
                  <Text style={styles.summaryStatLbl}>Skipped</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.summaryActionsRow}>
                <TouchableOpacity
                  style={styles.dashboardBtn}
                  onPress={() => router.replace('/(tabs)/dashboard')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.dashboardBtnText}>Continue to Dashboard</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                {importSummary.reviewCount > 0 && (
                  <TouchableOpacity
                    style={styles.inboxBtn}
                    onPress={() => router.push('/pending-inbox')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="mail-unread-outline" size={16} color="#D97706" style={{ marginRight: 6 }} />
                    <Text style={styles.inboxBtnText}>Review ({importSummary.reviewCount})</Text>
                  </TouchableOpacity>
                )}

                {importSummary.addedCount > 0 && (
                  <TouchableOpacity
                    style={styles.undoBtn}
                    onPress={handleUndoBatch}
                    disabled={isUndoing}
                    activeOpacity={0.8}
                  >
                    {isUndoing ? (
                      <ActivityIndicator size="small" color="#DC2626" />
                    ) : (
                      <>
                        <Ionicons name="arrow-undo-outline" size={15} color="#DC2626" style={{ marginRight: 4 }} />
                        <Text style={styles.undoBtnText}>Undo Import</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Clean Detected Messages Header & Filter Tabs */}
            <View style={styles.detectedSectionHeader}>
              <Text style={styles.detectedTitle}>
                Detected Messages ({importSummary.detectedItems?.length || 0})
              </Text>
              <View style={styles.filterPills}>
                <TouchableOpacity
                  style={[styles.filterPill, filterTab === 'all' && styles.filterPillActive]}
                  onPress={() => setFilterTab('all')}
                >
                  <Text style={[styles.filterPillText, filterTab === 'all' && styles.filterPillTextActive]}>
                    All ({importSummary.detectedItems?.length || 0})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterPill, filterTab === 'added' && styles.filterPillActive]}
                  onPress={() => setFilterTab('added')}
                >
                  <Text style={[styles.filterPillText, filterTab === 'added' && styles.filterPillTextActive]}>
                    Added ({importSummary.addedCount})
                  </Text>
                </TouchableOpacity>
                {importSummary.reviewCount > 0 && (
                  <TouchableOpacity
                    style={[styles.filterPill, filterTab === 'pending' && styles.filterPillActive]}
                    onPress={() => setFilterTab('pending')}
                  >
                    <Text style={[styles.filterPillText, filterTab === 'pending' && styles.filterPillTextActive]}>
                      Review ({importSummary.reviewCount})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* List of Clean Detected Message Cards */}
            {filteredItems.length === 0 ? (
              <View style={styles.emptyItemsCard}>
                <Ionicons name="chatbubble-outline" size={32} color="#94A3B8" style={{ marginBottom: 6 }} />
                <Text style={styles.emptyItemsText}>No messages match this filter</Text>
              </View>
            ) : (
              filteredItems.map((item) => {
                const theme = getCategoryTheme(item.category, item.type);
                const isExpense = item.type === 'expense';
                const formattedDate = new Date(item.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.messageCard}
                    onPress={() => setSelectedItemDetail(item)}
                    activeOpacity={0.85}
                  >
                    {/* Category Icon */}
                    <View style={[styles.msgIconCircle, { backgroundColor: theme.bg }]}>
                      <Ionicons name={theme.icon} size={20} color={theme.text} />
                    </View>

                    {/* Transaction Details */}
                    <View style={styles.msgDetailsCol}>
                      <View style={styles.msgTopRow}>
                        <Text style={styles.msgMerchant} numberOfLines={1}>
                          {item.merchant}
                        </Text>
                        <Text
                          style={[
                            styles.msgAmount,
                            { color: isExpense ? '#DC2626' : '#16A34A' },
                          ]}
                        >
                          {isExpense ? '-' : '+'} ₹{item.amount.toLocaleString('en-IN')}
                        </Text>
                      </View>

                      <View style={styles.msgMetaRow}>
                        <Text style={styles.msgBankInfo} numberOfLines={1}>
                          {item.bankName}
                          {item.accountLast4 ? ` • A/c **${item.accountLast4}` : ''}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor: item.status === 'added' ? '#ECFDF5' : '#FFFBEB',
                              borderColor: item.status === 'added' ? '#D1FAE5' : '#FEF3C7',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: item.status === 'added' ? '#059669' : '#D97706' },
                            ]}
                          >
                            {item.status === 'added' ? '✓ Added' : 'Pending'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.msgDate}>{formattedDate}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {/* Re-scan or Import More button */}
            <TouchableOpacity
              style={styles.rescanBtn}
              onPress={() => {
                setImportSummary(null);
                setPasteText('');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={16} color="#4F46E5" style={{ marginRight: 6 }} />
              <Text style={styles.rescanBtnText}>Import More Messages</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Message Card Detail Modal */}
      {selectedItemDetail && (
        <Modal
          visible={Boolean(selectedItemDetail)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedItemDetail(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailCard}>
              <View style={styles.detailHeader}>
                <View style={styles.detailTitleWrap}>
                  <Text style={styles.detailMerchant}>{selectedItemDetail.merchant}</Text>
                  <Text style={styles.detailBank}>
                    {selectedItemDetail.bankName}
                    {selectedItemDetail.accountLast4 ? ` • A/c **${selectedItemDetail.accountLast4}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedItemDetail(null)}
                  style={styles.detailCloseBtn}
                >
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.detailAmountRow}>
                <Text style={styles.detailAmountLabel}>Transaction Amount</Text>
                <Text
                  style={[
                    styles.detailAmountVal,
                    { color: selectedItemDetail.type === 'expense' ? '#DC2626' : '#16A34A' },
                  ]}
                >
                  {selectedItemDetail.type === 'expense' ? '-' : '+'} ₹
                  {selectedItemDetail.amount.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.detailDivider} />

              <Text style={styles.detailRawLabel}>Original Message Content (Masked)</Text>
              <View style={styles.detailRawBox}>
                <Text style={styles.detailRawText}>{selectedItemDetail.rawText}</Text>
              </View>

              <TouchableOpacity
                style={styles.detailDoneBtn}
                onPress={() => setSelectedItemDetail(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.detailDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Custom & International Banks Modal */}
      <Modal
        visible={customBankModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCustomBankModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.customBankCard}>
            <View style={styles.detailHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="globe-outline" size={22} color="#4F46E5" style={{ marginRight: 8 }} />
                <Text style={styles.detailMerchant}>Bank Senders &amp; International</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCustomBankModalVisible(false)}
                style={styles.detailCloseBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {/* Pre-saved Indian Banks Note */}
              <View style={styles.preSavedCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="checkmark-circle" size={17} color="#16A34A" style={{ marginRight: 6 }} />
                  <Text style={styles.preSavedTitle}>75+ Indian Banks Pre-Configured</Text>
                </View>
                <Text style={styles.preSavedDesc}>
                  SBI, HDFC, ICICI, Axis, Kotak, PNB, BOB, Canara, IndusInd, Federal, PhonePe, Google Pay, Paytm, CRED &amp; UPI are 100% pre-configured.
                </Text>
              </View>

              {/* Add Custom Bank Section */}
              <Text style={styles.addBankSectionTitle}>Add Custom Bank / Country Senders</Text>
              <Text style={styles.addBankSectionDesc}>
                For users outside India or regional banks, add bank names (e.g. Chase, Emirates NBD, Barclays, ADCB). Messages from added banks will be automatically parsed and auto-added.
              </Text>

              {/* Input Row */}
              <View style={styles.addBankInputRow}>
                <TextInput
                  style={styles.addBankInput}
                  value={customBankInput}
                  onChangeText={setCustomBankInput}
                  placeholder="e.g. Chase, Emirates NBD, Barclays"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.addBankBtn}
                  onPress={async () => {
                    const clean = customBankInput.trim().toUpperCase();
                    if (!clean) return;
                    const updated = await addCustomBank(userId, clean);
                    setSmsSettings(updated);
                    setCustomBankInput('');
                    Toast.show({
                      type: 'success',
                      text1: 'Bank Added',
                      text2: `${clean} will now be auto-detected in SMS.`,
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addBankBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {/* List of added banks */}
              {smsSettings.customBanks && smsSettings.customBanks.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.yourBanksTitle}>Your Custom Banks ({smsSettings.customBanks.length})</Text>
                  <View style={styles.bankChipsWrap}>
                    {smsSettings.customBanks.map((b) => (
                      <View key={b} style={styles.bankChip}>
                        <Text style={styles.bankChipText}>{b}</Text>
                        <TouchableOpacity
                          onPress={async () => {
                            const updated = await removeCustomBank(userId, b);
                            setSmsSettings(updated);
                            Toast.show({
                              type: 'info',
                              text1: 'Bank Removed',
                              text2: `Removed ${b}.`,
                            });
                          }}
                        >
                          <Ionicons name="close-circle" size={16} color="#6366F1" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={styles.detailDoneBtn}
                onPress={() => setCustomBankModalVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.detailDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
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
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  headerCustomBankBtn: {
    padding: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  bankStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 14,
  },
  bankStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bankStatusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  bankStatusSubtitle: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 1,
  },
  addCustomBankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 16,
  },
  addCustomBankChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#4F46E5',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  rangePillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  rangePill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rangePillActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  rangePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  rangePillTextActive: {
    color: '#4F46E5',
  },
  pasteArea: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 110,
    marginBottom: 14,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  switchModeWrap: {
    alignItems: 'center',
    marginTop: 12,
  },
  switchModeText: {
    fontSize: 12.5,
    color: '#6366F1',
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressBarWrap: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
  },
  progressStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  progressStatItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 8,
  },
  cancelBtnText: {
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: '700',
  },
  resultsWrap: {
    gap: 14,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  summaryBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  summarySubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  summaryStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  summaryStatNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  summaryStatLbl: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  summaryActionsRow: {
    gap: 8,
  },
  dashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 12,
  },
  dashboardBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  inboxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 10,
  },
  inboxBtnText: {
    color: '#D97706',
    fontSize: 13,
    fontWeight: '700',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    paddingVertical: 9,
    borderRadius: 10,
  },
  undoBtnText: {
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: '700',
  },
  detectedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 4,
  },
  detectedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  filterPills: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  filterPillActive: {
    backgroundColor: '#EEF2FF',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  emptyItemsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyItemsText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  msgIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  msgDetailsCol: {
    flex: 1,
  },
  msgTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  msgMerchant: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  msgAmount: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  msgMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  msgBankInfo: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
    marginRight: 6,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  msgDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  rescanBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  detailTitleWrap: {
    flex: 1,
  },
  detailMerchant: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailBank: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  detailCloseBtn: {
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
  },
  detailAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  detailAmountLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  detailAmountVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  detailRawLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  detailRawBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 16,
  },
  detailRawText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  detailDoneBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  detailDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  customBankCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  preSavedCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 14,
  },
  preSavedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  preSavedDesc: {
    fontSize: 11.5,
    color: '#15803D',
    lineHeight: 16,
  },
  addBankSectionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  addBankSectionDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 10,
  },
  addBankInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  addBankInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  addBankBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
  },
  addBankBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  yourBanksTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  bankChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  bankChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
  },
});
