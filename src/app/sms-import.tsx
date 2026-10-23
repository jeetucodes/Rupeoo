import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  BackHandler,
  useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { Clipboard } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { useBankImport } from '@/hooks/useBankImport';
import { DraftTransactionItem } from '@/lib/bankDraftDetector';
import { addCustomBank, removeCustomBank } from '@/lib/smsSettings';
import { splitMultiMessageText } from '@/lib/smsReader';
import { parseAlert } from '@/lib/alertParser';

// Components
import { TransactionDraftCard } from '@/features/import/components/TransactionDraftCard';
import { SummaryHeader } from '@/features/import/components/SummaryHeader';
import { CategorySheet } from '@/features/import/components/CategorySheet';
import { BanksSheet } from '@/features/import/components/BanksSheet';
import { EmptyState } from '@/features/import/components/EmptyState';
import { UnreadableMessagesModal } from '@/features/import/components/UnreadableMessagesModal';
import {
  groupDrafts,
  calculateSummaryTotals,
  getSelectAllState,
  shouldShowDiscardDialog,
  DraftItemLike,
} from '@/features/import/utils/importHelpers';

export default function SmsImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { user } = useAuth();
  const userId = user?.uid || 'local';

  // Orchestration Hook
  const {
    state,
    drafts,
    smsSettings,
    readFromClipboard,
    readFromPastedText,
    toggleDraft,
    selectAll,
    updateDraft,
    saveSelected,
    discard,
    refreshSettings,
  } = useBankImport({ userId });

  // UI Local States
  const [pasteInputText, setPasteInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingSkeleton, setIsLoadingSkeleton] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Modals & Sheets
  const [showBanksSheet, setShowBanksSheet] = useState(false);
  const [activeCategoryDraft, setActiveCategoryDraft] = useState<DraftItemLike | null>(null);
  const [showUnreadableModal, setShowUnreadableModal] = useState(false);
  const [unreadableMessages, setUnreadableMessages] = useState<string[]>([]);

  // Accordion state for "Already Added" section
  const [showAlreadyAddedSection, setShowAlreadyAddedSection] = useState(false);

  // Undo snackbar state
  const [recentlyRemoved, setRecentlyRemoved] = useState<DraftTransactionItem | null>(null);

  // Clipboard Auto-Detection Banner
  const [clipboardTextDetected, setClipboardTextDetected] = useState('');
  const [showClipboardBanner, setShowClipboardBanner] = useState(false);

  // Check clipboard on mount
  useEffect(() => {
    async function checkClipboardOnMount() {
      try {
        let text = '';
        if (Platform.OS === 'web') {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
            text = await navigator.clipboard.readText();
          }
        } else {
          text = await Clipboard.getString();
        }

        if (text && text.trim().length > 10) {
          if (/(?:debited|credited|spent|paid|rs\.?|inr|₹|vpa|upi|bank|a\/c)/i.test(text)) {
            setClipboardTextDetected(text);
            setShowClipboardBanner(true);
          }
        }
      } catch { }
    }

    if (state === 'ready') {
      checkClipboardOnMount();
    }
  }, [state]);

  // Grouped drafts & summary calculations
  const { readyToAdd, needsReview, alreadyAdded } = useMemo(() => {
    return groupDrafts(drafts);
  }, [drafts]);

  const summary = useMemo(() => {
    return calculateSummaryTotals(drafts);
  }, [drafts]);

  const selectableDrafts = useMemo(() => {
    return drafts.filter((d) => !d.isAlreadyAdded);
  }, [drafts]);

  const selectAllState = useMemo(() => {
    return getSelectAllState(selectableDrafts);
  }, [selectableDrafts]);

  // Discard Dialog Logic (Part B - Requirement 5)
  const executeDiscard = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    await discard();
    setPasteInputText('');
    setHasEdits(false);
    setRecentlyRemoved(null);
    setSavedCount(null);
  }, [discard]);

  const handleRequestBack = useCallback(() => {
    const showDialog = shouldShowDiscardDialog(drafts, hasEdits);
    if (!showDialog) {
      if (drafts.length > 0) {
        executeDiscard();
      }
      router.back();
      return;
    }

    if (Platform.OS === 'web') {
      if (
        typeof window !== 'undefined' &&
        window.confirm('Discard these transactions?\n\nThey won\'t be saved. You can paste again anytime.')
      ) {
        executeDiscard();
        router.back();
      }
      return;
    }

    Alert.alert(
      'Discard these transactions?',
      'They won\'t be saved. You can paste again anytime.',
      [
        { text: 'Keep reviewing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            executeDiscard();
            router.back();
          },
        },
      ]
    );
  }, [drafts, hasEdits, executeDiscard, router]);

  // Handle hardware back on Android
  useEffect(() => {
    const onBackPress = () => {
      if (drafts.length > 0 && shouldShowDiscardDialog(drafts, hasEdits)) {
        handleRequestBack();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [drafts, hasEdits, handleRequestBack]);

  // Handle Clipboard Import Action
  const handleImportClipboard = async (customText?: string) => {
    setShowClipboardBanner(false);
    setIsAnalyzing(true);
    setIsLoadingSkeleton(true);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    let textToParse = customText;
    if (!textToParse) {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
          textToParse = await navigator.clipboard.readText();
        }
      } else {
        textToParse = await Clipboard.getString();
      }
    }

    if (!textToParse || !textToParse.trim()) {
      setIsAnalyzing(false);
      setIsLoadingSkeleton(false);
      Toast.show({
        type: 'info',
        text1: 'Clipboard is Empty',
        text2: 'Copy a bank or UPI payment message first.',
      });
      return;
    }

    // Split and parse for unreadable messages detection
    const chunks = splitMultiMessageText(textToParse);
    const unreadables: string[] = [];

    for (const chunk of chunks) {
      const parsed = parseAlert(chunk.body, { sender: chunk.sender });
      if (parsed.isOtpOrPromo || parsed.amount === null || parsed.amount <= 0) {
        unreadables.push(chunk.body);
      }
    }

    setUnreadableMessages(unreadables);

    // Call underlying bank draft detector
    const res = await readFromPastedText(textToParse);

    // Wait 350ms skeleton to avoid layout jump
    await new Promise((resolve) => setTimeout(resolve, 350));
    setIsAnalyzing(false);
    setIsLoadingSkeleton(false);

    // Toast result summary
    const foundCount = res;
    if (foundCount === 0 && unreadables.length > 0) {
      Toast.show({
        type: 'info',
        text1: "Couldn't read messages",
        text2: 'The pasted text did not contain financial debit/credit alerts.',
      });
    } else {
      Toast.show({
        type: 'success',
        text1: `${foundCount} ${foundCount === 1 ? 'transaction' : 'transactions'} found`,
        text2: unreadables.length > 0 ? `${unreadables.length} could not be read.` : 'Ready for review.',
      });
    }
  };

  // Handle Pasted Text Input Submission
  const handleAnalyzePasted = () => {
    if (!pasteInputText.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Empty Text',
        text2: 'Please paste a bank or UPI message.',
      });
      return;
    }
    handleImportClipboard(pasteInputText);
  };

  // Save Selected Transactions Action
  const handleSaveTransactions = async () => {
    if (summary.selectedCount === 0) {
      Toast.show({
        type: 'info',
        text1: 'Select at least one',
        text2: 'Please select one or more transactions to add.',
      });
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    const count = await saveSelected();

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }

    setSavedCount(count);
  };

  // Toggle Select All
  const handleToggleSelectAll = () => {
    if (selectAllState === 'all') {
      selectAll(false);
    } else {
      selectAll(true);
    }
  };

  // Inline Draft Edit
  const handleSaveDraftEdit = (id: string, updated: Partial<DraftItemLike>) => {
    updateDraft(id, updated as Partial<DraftTransactionItem>);
    setHasEdits(true);
  };

  // Remove Draft with Undo
  const handleRemoveDraft = (item: DraftItemLike) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    const found = drafts.find((d) => d.id === item.id);
    if (found) {
      setRecentlyRemoved(found);
      updateDraft(item.id, { isAlreadyAdded: true, selected: false });
    }
  };

  const handleUndoRemove = () => {
    if (!recentlyRemoved) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    updateDraft(recentlyRemoved.id, { isAlreadyAdded: false, selected: true });
    setRecentlyRemoved(null);
  };

  // Theme Colors
  const bgColor = isDark ? '#0F0F11' : '#F8F9FA';
  const cardBg = isDark ? '#18191D' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#272A30' : '#E8ECF2';
  const inputBg = isDark ? '#22252B' : '#F1F5F9';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgColor }]} edges={['top', 'left', 'right']}>
      {/* App Header */}
      <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleRequestBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Import Messages</Text>
          <Text style={[styles.headerSubtitle, { color: subtextColor }]} numberOfLines={1}>
            Read on your device. Nothing is uploaded.
          </Text>
        </View>

        {/* Banks Chip Button (Replaces globe icon) */}
        <TouchableOpacity
          style={[styles.banksChipBtn, { backgroundColor: inputBg, borderColor }]}
          onPress={() => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch { }
            setShowBanksSheet(true);
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Supported Banks"
        >
          <Ionicons name="business-outline" size={15} color="#4F46E5" style={{ marginRight: 4 }} />
          <Text style={[styles.banksChipText, { color: textColor }]}>Banks</Text>
        </TouchableOpacity>
      </View>

      {/* SUCCESS STATE (Part B - Requirement 10) */}
      {savedCount !== null ? (
        <View style={styles.successContainer}>
          <View style={[styles.successIconCircle, { backgroundColor: isDark ? '#143823' : '#DCFCE7' }]}>
            <Ionicons name="checkmark-circle" size={56} color="#16A34A" />
          </View>
          <Text style={[styles.successTitle, { color: textColor }]}>
            {savedCount} {savedCount === 1 ? 'transaction' : 'transactions'} added
          </Text>
          <Text style={[styles.successSubtitle, { color: subtextColor }]}>
            Your accounts and balances have been updated successfully.
          </Text>

          <View style={styles.successActions}>
            <TouchableOpacity
              style={styles.viewHistoryBtn}
              onPress={() => router.replace('/(tabs)/transactions')}
              activeOpacity={0.85}
            >
              <Text style={styles.viewHistoryBtnText}>View in History</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.doneBtn, { borderColor }]}
              onPress={() => {
                executeDiscard();
                router.back();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.doneBtnText, { color: textColor }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : drafts.length === 0 || isLoadingSkeleton ? (
        /* ENTRY / EMPTY STATE (Part B - Requirement 6) */
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {isLoadingSkeleton ? (
            <View style={styles.skeletonContainer}>
              <View style={[styles.skeletonHeader, { backgroundColor: cardBg }]} />
              <View style={[styles.skeletonCard, { backgroundColor: cardBg }]} />
              <View style={[styles.skeletonCard, { backgroundColor: cardBg }]} />
            </View>
          ) : (
            <EmptyState
              type="import_entry"
              onPasteClipboard={() => handleImportClipboard()}
              clipboardBannerVisible={showClipboardBanner}
              onImportClipboardBanner={() => handleImportClipboard(clipboardTextDetected)}
              onDismissClipboardBanner={() => setShowClipboardBanner(false)}
              pastedText={pasteInputText}
              onChangePastedText={setPasteInputText}
              onSubmitPastedText={handleAnalyzePasted}
              isAnalyzing={isAnalyzing}
            />
          )}
        </ScrollView>
      ) : (
        /* REVIEW DRAFTS LIST */
        <View style={{ flex: 1 }}>
          {/* Summary Header */}
          <SummaryHeader
            foundText={summary.foundText}
            totalsSubtitle={summary.totalsSubtitle}
            selectedSubtitle={summary.selectedSubtitle}
            selectAllState={selectAllState}
            onToggleSelectAll={handleToggleSelectAll}
            hasSelectableItems={selectableDrafts.length > 0}
          />

          {/* Unreadable Messages Warning Card */}
          {unreadableMessages.length > 0 && (
            <View style={[styles.unreadableBanner, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.unreadableLeft}>
                <Ionicons name="alert-circle" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={[styles.unreadableText, { color: textColor }]}>
                  Couldn't read {unreadableMessages.length} {unreadableMessages.length === 1 ? 'message' : 'messages'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.viewUnreadableBtn}
                onPress={() => setShowUnreadableModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.viewUnreadableBtnText}>View</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={styles.listScrollView} contentContainerStyle={styles.listContainer}>
            {/* SECTION 1: Ready to Add */}
            {readyToAdd.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                    Ready to add ({readyToAdd.length})
                  </Text>
                  <Text style={[styles.sectionHint, { color: '#16A34A' }]}>High confidence</Text>
                </View>
                {readyToAdd.map((draft) => (
                  <TransactionDraftCard
                    key={draft.id}
                    item={draft}
                    showCheckbox={true}
                    onToggleSelect={toggleDraft}
                    onOpenCategorySheet={setActiveCategoryDraft}
                    onSaveEdit={handleSaveDraftEdit}
                    onRemove={handleRemoveDraft}
                  />
                ))}
              </View>
            )}

            {/* SECTION 2: Needs Review */}
            {needsReview.length > 0 && (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                    Needs review ({needsReview.length})
                  </Text>
                  <Text style={[styles.sectionHint, { color: '#D97706' }]}>Uncategorized or low confidence</Text>
                </View>
                {needsReview.map((draft) => (
                  <TransactionDraftCard
                    key={draft.id}
                    item={draft}
                    showCheckbox={true}
                    onToggleSelect={toggleDraft}
                    onOpenCategorySheet={setActiveCategoryDraft}
                    onSaveEdit={handleSaveDraftEdit}
                    onRemove={handleRemoveDraft}
                  />
                ))}
              </View>
            )}

            {/* SECTION 3: Already Added (Collapsed by default) */}
            {alreadyAdded.length > 0 && (
              <View style={styles.sectionWrap}>
                <TouchableOpacity
                  style={[styles.accordionToggle, { backgroundColor: cardBg, borderColor }]}
                  onPress={() => setShowAlreadyAddedSection(!showAlreadyAddedSection)}
                  activeOpacity={0.7}
                >
                  <View style={styles.accordionLeft}>
                    <Ionicons name="checkmark-done" size={16} color={subtextColor} style={{ marginRight: 6 }} />
                    <Text style={[styles.accordionTitle, { color: subtextColor }]}>
                      Already added ({alreadyAdded.length})
                    </Text>
                  </View>
                  <Ionicons
                    name={showAlreadyAddedSection ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={subtextColor}
                  />
                </TouchableOpacity>

                {showAlreadyAddedSection && (
                  <View style={{ marginTop: 8 }}>
                    {alreadyAdded.map((draft) => (
                      <TransactionDraftCard
                        key={draft.id}
                        item={draft}
                        showCheckbox={true}
                        onToggleSelect={toggleDraft}
                        onOpenCategorySheet={setActiveCategoryDraft}
                        onSaveEdit={handleSaveDraftEdit}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Undo Removed Snackbar */}
          {recentlyRemoved && (
            <View style={[styles.snackbar, { backgroundColor: isDark ? '#272A30' : '#1E293B' }]}>
              <Text style={styles.snackbarText} numberOfLines={1}>
                Removed {recentlyRemoved.merchant || 'transaction'}
              </Text>
              <TouchableOpacity onPress={handleUndoRemove} style={styles.snackbarUndoBtn}>
                <Text style={styles.snackbarUndoText}>Undo</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Sticky Bottom Bar */}
          <View
            style={[
              styles.stickyFooter,
              { backgroundColor: cardBg, borderTopColor: borderColor, paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            {summary.selectedCount === 0 && (
              <Text style={[styles.helperText, { color: subtextColor }]}>Select at least one</Text>
            )}

            <View style={styles.footerButtonsRow}>
              {/* Secondary Discard Button */}
              <TouchableOpacity
                style={[styles.discardBtn, { borderColor }]}
                onPress={handleRequestBack}
                activeOpacity={0.7}
              >
                <Text style={[styles.discardBtnText, { color: subtextColor }]}>Discard</Text>
              </TouchableOpacity>

              {/* Primary Sticky Add Button */}
              <TouchableOpacity
                style={[
                  styles.primaryAddBtn,
                  summary.selectedCount === 0 && styles.primaryAddBtnDisabled,
                ]}
                onPress={handleSaveTransactions}
                disabled={summary.selectedCount === 0}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.primaryAddBtnText}>
                  {summary.selectedCount === 0
                    ? 'Add transactions'
                    : `Add ${summary.selectedCount} ${summary.selectedCount === 1 ? 'transaction' : 'transactions'}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Category Bottom Sheet */}
      <CategorySheet
        visible={!!activeCategoryDraft}
        onClose={() => setActiveCategoryDraft(null)}
        currentCategory={activeCategoryDraft?.category}
        merchantName={activeCategoryDraft?.merchant}
        userId={user?.uid}
        onSelectCategory={(newCat, applyToAll) => {
          if (activeCategoryDraft) {
            updateDraft(activeCategoryDraft.id, { category: newCat });
            if (applyToAll && activeCategoryDraft.merchant) {
              const targetNorm = activeCategoryDraft.merchant.trim().toLowerCase();
              drafts.forEach((d) => {
                if (
                  d.id !== activeCategoryDraft.id &&
                  d.merchant &&
                  d.merchant.trim().toLowerCase() === targetNorm
                ) {
                  updateDraft(d.id, { category: newCat });
                }
              });
            }
            setHasEdits(true);
          }
        }}
      />

      {/* Supported Banks Sheet */}
      <BanksSheet
        visible={showBanksSheet}
        onClose={() => setShowBanksSheet(false)}
        customBanks={smsSettings.customBanks || []}
        onAddCustomBank={async (bank) => {
          await addCustomBank(userId, bank);
          await refreshSettings();
        }}
        onRemoveCustomBank={async (bank) => {
          await removeCustomBank(userId, bank);
          await refreshSettings();
        }}
      />

      {/* Unreadable Messages Modal */}
      <UnreadableMessagesModal
        visible={showUnreadableModal}
        onClose={() => setShowUnreadableModal(false)}
        unreadableMessages={unreadableMessages}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
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
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  banksChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 36,
  },
  banksChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    flexGrow: 1,
  },
  skeletonContainer: {
    padding: 16,
    gap: 12,
  },
  skeletonHeader: {
    height: 60,
    borderRadius: 14,
    opacity: 0.5,
  },
  skeletonCard: {
    height: 90,
    borderRadius: 16,
    opacity: 0.5,
  },
  listScrollView: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
  },
  unreadableBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  unreadableLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadableText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  viewUnreadableBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  viewUnreadableBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  sectionWrap: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: 11,
    fontWeight: '600',
  },
  accordionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  accordionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accordionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  snackbar: {
    position: 'absolute',
    bottom: 90,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  snackbarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  snackbarUndoBtn: {
    paddingLeft: 12,
  },
  snackbarUndoText: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  helperText: {
    fontSize: 11.5,
    textAlign: 'center',
    marginBottom: 6,
    fontWeight: '600',
  },
  footerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  discardBtn: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  discardBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 13,
    minHeight: 48,
  },
  primaryAddBtnDisabled: {
    opacity: 0.45,
  },
  primaryAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  successIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  successActions: {
    width: '100%',
    gap: 12,
  },
  viewHistoryBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  viewHistoryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  doneBtn: {
    borderWidth: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
