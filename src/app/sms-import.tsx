import React, { useState, useEffect, useRef } from 'react';
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
} from '@/lib/smsImporter';
import { undoImportBatch } from '@/lib/smsBatchUndo';
import {
  hasCompletedSmsPrivacyDisclosure,
  markSmsPrivacyDisclosureDone,
} from '@/lib/smsSettings';

type ImportRange = '30d' | '90d' | '365d' | 'all';

export default function SmsImportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === 'true';
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.uid || 'local';

  // Feature detection for direct flavor on Android
  const hasInboxFeature = isSmsInboxSupported();

  // Active Tab: 'inbox' (direct flavor only) or 'paste' (both flavors)
  const [activeTab, setActiveTab] = useState<'inbox' | 'paste'>(hasInboxFeature ? 'inbox' : 'paste');
  const [selectedRange, setSelectedRange] = useState<ImportRange>('30d');

  // Multi-message paste state
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

  // Privacy Disclosure Modal
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  useEffect(() => {
    checkDisclosure();
  }, [userId]);

  const checkDisclosure = async () => {
    if (hasInboxFeature) {
      const done = await hasCompletedSmsPrivacyDisclosure(userId);
      if (!done) {
        setShowPrivacyModal(true);
      }
    }
  };

  const handleStartInboxImport = async () => {
    if (!hasInboxFeature) {
      Toast.show({
        type: 'info',
        text1: 'Direct APK Flavor Only',
        text2: 'Inbox scanning is available on direct builds. Use Paste on Google Play flavor.',
      });
      return;
    }

    const disclosureDone = await hasCompletedSmsPrivacyDisclosure(userId);
    if (!disclosureDone) {
      setShowPrivacyModal(true);
      return;
    }

    const hasPermission = await requestSmsPermission();
    if (!hasPermission) {
      Toast.show({
        type: 'error',
        text1: 'SMS Permission Denied',
        text2: 'Permission is required to import bank messages from inbox.',
      });
      return;
    }

    // Determine minDate based on selected range
    const now = Date.now();
    let minDate: number | undefined;
    if (selectedRange === '30d') minDate = now - 30 * 86400000;
    else if (selectedRange === '90d') minDate = now - 90 * 86400000;
    else if (selectedRange === '365d') minDate = now - 365 * 86400000;
    else minDate = 0; // 'all'

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

  const handleStartPasteImport = async () => {
    if (!pasteText.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Empty Text',
        text2: 'Please paste one or more bank/UPI alerts.',
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
        text2: 'Stopping after current message chunk.',
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

  const handleAcceptDisclosure = async () => {
    await markSmsPrivacyDisclosureDone(userId);
    setShowPrivacyModal(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
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
          accessibilityRole="button"
          accessibilityLabel={fromOnboarding ? 'Close' : 'Back'}
        >
          <Ionicons name={fromOnboarding ? 'close' : 'arrow-back'} size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Import from Messages</Text>
          <Text style={styles.headerSubtitle}>Pure on-device bank & UPI alert engine</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          {hasInboxFeature && (
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'inbox' && styles.tabBtnActive]}
              onPress={() => {
                setActiveTab('inbox');
                setImportSummary(null);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chatbox-ellipses-outline"
                size={16}
                color={activeTab === 'inbox' ? '#4F46E5' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabBtnText, activeTab === 'inbox' && styles.tabBtnTextActive]}>
                Inbox Scan
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'paste' && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab('paste');
              setImportSummary(null);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="clipboard-outline"
              size={16}
              color={activeTab === 'paste' ? '#4F46E5' : '#64748B'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'paste' && styles.tabBtnTextActive]}>
              Paste Messages
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab 1: Inbox Scan (Direct Flavor Only) */}
        {activeTab === 'inbox' && (
          <View style={styles.sectionWrap}>
            <View style={styles.infoBanner}>
              <Ionicons name="shield-checkmark" size={18} color="#059669" style={{ marginRight: 8 }} />
              <Text style={styles.infoBannerText}>
                100% Private. Messages are parsed entirely on your device. OTPs, promos, and balance inquiries are strictly ignored.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Select Scan Range</Text>
            <View style={styles.rangeGrid}>
              {[
                { key: '30d' as const, label: 'Last 30 Days', desc: 'Recent spend' },
                { key: '90d' as const, label: 'Last 3 Months', desc: 'Quarterly review' },
                { key: '365d' as const, label: 'Last 1 Year', desc: 'Annual history' },
                { key: 'all' as const, label: 'All Time', desc: 'Complete inbox' },
              ].map((item) => {
                const isSel = selectedRange === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.rangeCard, isSel && styles.rangeCardActive]}
                    onPress={() => setSelectedRange(item.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.rangeLabel, isSel && styles.rangeLabelActive]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.rangeDesc, isSel && styles.rangeDescActive]}>
                      {item.desc}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Start Button */}
            {!isImporting && !importSummary && (
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={handleStartInboxImport}
                activeOpacity={0.85}
              >
                <Ionicons name="scan-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primaryActionBtnText}>Scan & Import Messages</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Tab 2: Paste / Share (Both Flavors) */}
        {activeTab === 'paste' && (
          <View style={styles.sectionWrap}>
            <View style={styles.infoBanner}>
              <Ionicons name="sparkles" size={18} color="#4F46E5" style={{ marginRight: 8 }} />
              <Text style={styles.infoBannerText}>
                Paste one or multiple messages at once. Rupeo splits alerts by blank lines or timestamps and checks each for duplicates.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Paste Alert Text</Text>
            <TextInput
              style={styles.pasteArea}
              value={pasteText}
              onChangeText={setPasteText}
              placeholder="Paste bank debit/credit messages or UPI confirmations here... Multiple messages separated by blank lines are automatically detected."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            {!isImporting && !importSummary && (
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={handleStartPasteImport}
                activeOpacity={0.85}
              >
                <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primaryActionBtnText}>Parse & Process</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Live Progress Card */}
        {isImporting && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <ActivityIndicator size="small" color="#4F46E5" />
              <Text style={styles.progressTitle}>
                {importProgress.phase === 'reading'
                  ? 'Reading inbox messages...'
                  : importProgress.phase === 'deduping'
                  ? 'Checking 4-layer deduplication...'
                  : 'Adding verified transactions...'}
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
              <View style={styles.progressStatItem}>
                <Text style={[styles.statNumber, { color: '#64748B' }]}>
                  {importProgress.duplicatesSkipped}
                </Text>
                <Text style={styles.statLabel}>Skipped</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel Import</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Post-Import Summary Card */}
        {importSummary && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryBadge}>
                <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
              </View>
              <View>
                <Text style={styles.summaryTitle}>Import Finished</Text>
                <Text style={styles.summarySubtitle}>
                  {importSummary.addedCount} added • {importSummary.duplicatesSkipped} duplicates avoided
                </Text>
              </View>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{importSummary.scannedCount}</Text>
                <Text style={styles.summaryLbl}>Messages Scanned</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryVal}>{importSummary.detectedCount}</Text>
                <Text style={styles.summaryLbl}>Financial Alerts</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: '#16A34A' }]}>
                  +{importSummary.addedCount}
                </Text>
                <Text style={styles.summaryLbl}>Auto-Added</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: '#D97706' }]}>
                  {importSummary.reviewCount}
                </Text>
                <Text style={styles.summaryLbl}>Pending Review</Text>
              </View>
            </View>

            {/* Quick Actions after import */}
            <View style={styles.summaryActions}>
              {importSummary.reviewCount > 0 && (
                <TouchableOpacity
                  style={styles.reviewInboxBtn}
                  onPress={() => router.push('/pending-inbox')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="mail-unread-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.reviewInboxBtnText}>
                    Review ({importSummary.reviewCount}) in Inbox
                  </Text>
                </TouchableOpacity>
              )}

              {importSummary.addedCount > 0 && (
                <TouchableOpacity
                  style={styles.undoBatchBtn}
                  onPress={handleUndoBatch}
                  disabled={isUndoing}
                  activeOpacity={0.8}
                >
                  {isUndoing ? (
                    <ActivityIndicator size="small" color="#DC2626" />
                  ) : (
                    <>
                      <Ionicons name="arrow-undo-outline" size={16} color="#DC2626" style={{ marginRight: 4 }} />
                      <Text style={styles.undoBatchBtnText}>Undo This Import Batch</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.goToDashboardBtn}
                onPress={() => router.replace('/(tabs)/dashboard')}
                activeOpacity={0.85}
              >
                <Text style={styles.goToDashboardBtnText}>Continue to Dashboard</Text>
                <Ionicons name="arrow-forward" size={16} color="#0F172A" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* One-time Privacy Disclosure Modal (Direct Flavor) */}
      <Modal
        visible={showPrivacyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={styles.disclosureOverlay}>
          <View style={styles.disclosureCard}>
            <View style={styles.disclosureIconWrap}>
              <Ionicons name="shield-checkmark" size={32} color="#4F46E5" />
            </View>
            <Text style={styles.disclosureTitle}>Private On-Device Message Import</Text>
            <Text style={styles.disclosureText}>
              Rupeo reads incoming and past bank SMS messages solely on your device to detect debit, credit, and UPI payments.{'\n\n'}
              • <Text style={styles.disclosureBold}>100% On-Device Parsing:</Text> Full SMS message bodies are NEVER transmitted to external analytics or third-party servers.{'\n'}
              • <Text style={styles.disclosureBold}>Strict Privacy Filters:</Text> Personal chats, OTPs, promotional spam, and verification codes are completely ignored.{'\n'}
              • <Text style={styles.disclosureBold}>Masked Accounts:</Text> Bank account numbers are strictly masked, storing only the last 4 digits.
            </Text>

            <View style={styles.disclosureActions}>
              <TouchableOpacity
                style={styles.disclosureDeclineBtn}
                onPress={() => setShowPrivacyModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.disclosureDeclineText}>Not Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.disclosureAcceptBtn}
                onPress={handleAcceptDisclosure}
                activeOpacity={0.85}
              >
                <Text style={styles.disclosureAcceptText}>Allow & Continue</Text>
              </TouchableOpacity>
            </View>
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
    marginRight: 10,
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
  content: {
    flex: 1,
    padding: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#4F46E5',
  },
  sectionWrap: {
    gap: 14,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  infoBannerText: {
    fontSize: 12,
    color: '#15803D',
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rangeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  rangeCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  rangeCardActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  rangeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  rangeLabelActive: {
    color: '#4F46E5',
  },
  rangeDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  rangeDescActive: {
    color: '#4338CA',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  pasteArea: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 120,
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 14,
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
    paddingVertical: 10,
    marginTop: 10,
  },
  cancelBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  summaryBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  summaryItem: {
    width: '47%',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
  },
  summaryVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  summaryLbl: {
    fontSize: 11,
    color: '#64748B',
  },
  summaryActions: {
    gap: 8,
  },
  reviewInboxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 11,
    borderRadius: 10,
  },
  reviewInboxBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  undoBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  undoBatchBtnText: {
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: '700',
  },
  goToDashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  goToDashboardBtnText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '700',
  },
  disclosureOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  disclosureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
  },
  disclosureIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  disclosureTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  disclosureText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    marginBottom: 18,
  },
  disclosureBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  disclosureActions: {
    flexDirection: 'row',
    gap: 10,
  },
  disclosureDeclineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
  },
  disclosureDeclineText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  disclosureAcceptBtn: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
  },
  disclosureAcceptText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
