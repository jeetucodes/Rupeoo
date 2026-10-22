import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Platform,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import { useBankImport, ImportRange } from '@/hooks/useBankImport';
import { DraftTransactionItem } from '@/lib/bankDraftDetector';
import {
  addCustomBank,
  removeCustomBank,
} from '@/lib/smsSettings';

// Categories list for draft editing
const CATEGORIES = [
  'Food',
  'Groceries',
  'Travel',
  'Shopping',
  'Bills',
  'Utilities',
  'Cash',
  'Health',
  'Entertainment',
  'Subscriptions',
  'Fuel',
  'Salary',
  'Rent',
  'Income',
  'Others',
];

export default function SmsImportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === 'true';
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.uid || 'local';

  // Feature detection for direct Android inbox access (disabled: replaced by notification listener)
  const hasInboxFeature = false;

  // Orchestration Hook
  const {
    state,
    selectedRange,
    setSelectedRange,
    drafts,
    progress,
    showAlreadyAdded,
    setShowAlreadyAdded,
    smsSettings,
    lastBatchResult,
    totals,
    startReading,
    readFromClipboard,
    readFromPastedText,
    cancelReading,
    toggleDraft,
    selectAll,
    updateDraft,
    ignoreDraft,
    saveSelected,
    discard,
    undoLastBatch,
    refreshSettings,
  } = useBankImport({ userId });

  // UI Local States
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteInputText, setPasteInputText] = useState('');
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showCustomBankModal, setShowCustomBankModal] = useState(false);
  const [customBankInput, setCustomBankInput] = useState('');

  // Draft Editing Modal State
  const [editingDraft, setEditingDraft] = useState<DraftTransactionItem | null>(null);
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editType, setEditType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [showOriginalMessage, setShowOriginalMessage] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  // 1-Tap Trigger for State 1 (Ready): Read from clipboard
  const handlePrimaryOneTap = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    const res = await readFromClipboard();
    if (res.found === 0) {
      Toast.show({
        type: 'info',
        text1: 'No Bank Alerts in Clipboard',
        text2: 'Copy your bank messages or paste them in the box below.',
      });
      setShowPasteBox(true);
    }
  };

  // Handle Pasted Text submission
  const handleAnalyzePasted = async () => {
    if (!pasteInputText.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Empty Text',
        text2: 'Please paste one or more bank/UPI alerts.',
      });
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    const count = await readFromPastedText(pasteInputText);
    if (count === 0) {
      Toast.show({
        type: 'info',
        text1: 'No Alerts Found',
        text2: 'Could not detect financial debit/credit alerts in pasted text.',
      });
    }
  };

  // Open Edit Draft Modal
  const openEditDraft = (draft: DraftTransactionItem) => {
    setEditingDraft(draft);
    setEditMerchant(draft.merchant);
    setEditAmount(draft.amount.toString());
    setEditCategory(draft.category);
    setEditType(draft.type);
    setShowOriginalMessage(false);
  };

  // Save changes to draft
  const handleSaveDraftEdit = () => {
    if (!editingDraft) return;
    const num = parseFloat(editAmount.replace(/,/g, ''));
    if (isNaN(num) || num <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid Amount', text2: 'Please enter a valid amount.' });
      return;
    }

    updateDraft(editingDraft.id, {
      merchant: editMerchant.trim() || editingDraft.merchant,
      amount: num,
      category: editCategory || editingDraft.category,
      type: editType,
    });

    setEditingDraft(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
  };

  // Save Selected Action (State 3 -> State 4)
  const handleSaveSelected = async () => {
    if (totals.selectedCount === 0) {
      Toast.show({
        type: 'info',
        text1: 'No Items Selected',
        text2: 'Please check at least one transaction to save.',
      });
      return;
    }

    setIsSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    const count = await saveSelected();
    setIsSaving(false);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }

    Toast.show({
      type: 'success',
      text1: 'Transactions Saved',
      text2: `Successfully added ${count} transactions to your accounts.`,
    });
  };

  // Discard Action
  const handleDiscard = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Discard Drafts?\n\nNone of the detected transactions will be saved. You can scan again anytime.')) {
        discard();
        setShowPasteBox(false);
        setPasteInputText('');
      }
      return;
    }

    Alert.alert(
      'Discard Drafts?',
      'None of the detected transactions will be saved. You can scan again anytime.',
      [
        { text: 'Keep Reviewing', style: 'cancel' },
        {
          text: 'Discard All',
          style: 'destructive',
          onPress: async () => {
            await discard();
            setShowPasteBox(false);
            setPasteInputText('');
          },
        },
      ]
    );
  };

  // Undo Last Batch Action
  const handleUndo = async () => {
    setIsUndoing(true);
    const count = await undoLastBatch();
    setIsUndoing(false);
    Toast.show({
      type: 'success',
      text1: 'Import Undone',
      text2: `Reverted and removed ${count} transactions.`,
    });
  };

  // Filter drafts for display: hide already added unless toggled ON
  const visibleDrafts = useMemo(() => {
    if (showAlreadyAdded) return drafts;
    return drafts.filter((d) => !d.isAlreadyAdded);
  }, [drafts, showAlreadyAdded]);

  // Visual helper for category icons
  const getCategoryIcon = (category: string, type: 'expense' | 'income' | 'transfer') => {
    if (type === 'income') return { name: 'trending-up' as const, bg: '#DCFCE7', color: '#16A34A' };
    const cat = (category || '').toLowerCase();
    if (cat.includes('food') || cat.includes('dining')) return { name: 'fast-food' as const, bg: '#FEF3C7', color: '#D97706' };
    if (cat.includes('grocer')) return { name: 'basket' as const, bg: '#ECFDF5', color: '#059669' };
    if (cat.includes('travel') || cat.includes('commute')) return { name: 'car' as const, bg: '#EFF6FF', color: '#2563EB' };
    if (cat.includes('shopping')) return { name: 'cart' as const, bg: '#F5F3FF', color: '#7C3AED' };
    if (cat.includes('bill') || cat.includes('utilities')) return { name: 'flash' as const, bg: '#FEE2E2', color: '#DC2626' };
    if (cat.includes('cash') || cat.includes('atm')) return { name: 'cash' as const, bg: '#F0FDF4', color: '#15803D' };
    if (cat.includes('health')) return { name: 'medkit' as const, bg: '#FFE4E6', color: '#E11D48' };
    return { name: 'wallet' as const, bg: '#F1F5F9', color: '#475569' };
  };

  // Date Range Label
  const rangeLabel = useMemo(() => {
    switch (selectedRange) {
      case '30d': return 'Last 30 Days';
      case '90d': return 'Last 3 Months';
      case '365d': return 'Last 1 Year';
      case 'all': return 'All Time';
    }
  }, [selectedRange]);

  // Memoized Draft Row
  const renderDraftRow = useCallback(
    ({ item }: { item: DraftTransactionItem }) => {
      const catStyle = getCategoryIcon(item.category, item.type);
      const isExpense = item.type === 'expense';
      const formattedDate = new Date(item.date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });

      return (
        <View style={[styles.draftRowCard, item.isAlreadyAdded && styles.draftRowCardDisabled]}>
          {/* Checkbox Touch Target >= 44x44 */}
          <TouchableOpacity
            style={styles.checkboxTouchTarget}
            onPress={() => toggleDraft(item.id)}
            disabled={item.isAlreadyAdded}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.selected, disabled: item.isAlreadyAdded }}
            accessibilityLabel={`Select ${item.merchant} transaction of ${item.amount} rupees`}
          >
            {item.isAlreadyAdded ? (
              <View style={styles.checkboxDisabled}>
                <Ionicons name="checkmark" size={14} color="#94A3B8" />
              </View>
            ) : (
              <View style={[styles.checkboxBox, item.selected && styles.checkboxBoxActive]}>
                {item.selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
              </View>
            )}
          </TouchableOpacity>

          {/* Row Details (Tappable to Edit) */}
          <TouchableOpacity
            style={styles.draftContentTouch}
            onPress={() => openEditDraft(item)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.merchant} details`}
          >
            {/* Category Icon */}
            <View style={[styles.categoryIconCircle, { backgroundColor: catStyle.bg }]}>
              <Ionicons name={catStyle.name} size={18} color={catStyle.color} />
            </View>

            {/* Middle Col */}
            <View style={styles.draftMiddleCol}>
              <View style={styles.draftTopLine}>
                <Text style={styles.draftMerchant} numberOfLines={1}>
                  {item.merchant}
                </Text>
                {item.isLowConfidence && !item.isAlreadyAdded && (
                  <View style={styles.checkThisBadge}>
                    <Text style={styles.checkThisBadgeText}>Check this</Text>
                  </View>
                )}
                {item.isAlreadyAdded && (
                  <View style={styles.alreadyAddedBadge}>
                    <Text style={styles.alreadyAddedBadgeText}>Already added</Text>
                  </View>
                )}
              </View>

              <View style={styles.draftMetaLine}>
                <Text style={styles.draftMetaText} numberOfLines={1}>
                  {item.bankName}
                  {item.accountLast4 ? ` • **${item.accountLast4}` : ''} • {item.channel}
                </Text>
              </View>

              <Text style={styles.draftDateText}>{formattedDate}</Text>
            </View>

            {/* Right Col: Amount */}
            <View style={styles.draftRightCol}>
              <Text
                style={[
                  styles.draftAmountText,
                  { color: isExpense ? '#DC2626' : '#16A34A' },
                  item.isAlreadyAdded && { color: '#94A3B8' },
                ]}
              >
                {isExpense ? '-' : '+'} ₹{item.amount.toLocaleString('en-IN')}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#CBD5E1" style={{ alignSelf: 'flex-end', marginTop: 4 }} />
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [toggleDraft]
  );

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
          accessibilityLabel="Back"
        >
          <Ionicons name={fromOnboarding ? 'close' : 'arrow-back'} size={24} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Import Messages</Text>
          <Text style={styles.headerSubtitle}>Pure on-device bank &amp; UPI expense detector</Text>
        </View>

        <TouchableOpacity
          style={styles.globeBtn}
          onPress={() => setShowCustomBankModal(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Custom Banks and International Senders"
        >
          <Ionicons name="globe-outline" size={20} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      {/* Pre-Configured 75+ Indian Banks Chip */}
      <View style={styles.bankChipBanner}>
        <View style={styles.bankChipLeft}>
          <Ionicons name="shield-checkmark" size={18} color="#16A34A" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bankChipTitle}>75+ Indian Banks &amp; UPI Pre-Saved</Text>
            <Text style={styles.bankChipSubtitle} numberOfLines={1}>
              {smsSettings.customBanks?.length
                ? `+ ${smsSettings.customBanks.length} custom country banks active`
                : 'SBI, HDFC, ICICI, Axis, Kotak, PNB, BOB, PhonePe, GPay...'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addBankBtnSmall}
          onPress={() => setShowCustomBankModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={14} color="#4F46E5" style={{ marginRight: 2 }} />
          <Text style={styles.addBankBtnSmallText}>Add Bank</Text>
        </TouchableOpacity>
      </View>

      {/* ==================================================================== */}
      {/* STATE 1 - READY (ONE-TAP SCREEN)                                     */}
      {/* ==================================================================== */}
      {state === 'ready' && (
        <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.readyCard}>
            <View style={styles.readyIconCircle}>
              <Ionicons
                name={hasInboxFeature ? 'chatbubbles' : 'clipboard'}
                size={34}
                color="#4F46E5"
              />
            </View>

            <Text style={styles.readyMainHeading}>
              {hasInboxFeature ? 'Read my bank messages' : 'Read from clipboard'}
            </Text>

            <Text style={styles.readyMainDesc}>
              {hasInboxFeature
                ? 'We detect bank & UPI alerts on your phone. Nothing is saved until you confirm.'
                : 'Detects copied bank & UPI message alerts. Nothing is saved until you confirm.'}
            </Text>

            {/* ONE PRIMARY BUTTON */}
            <TouchableOpacity
              style={styles.oneTapBigButton}
              onPress={handlePrimaryOneTap}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={hasInboxFeature ? 'Read my bank messages' : 'Read from clipboard'}
            >
              <Ionicons
                name={hasInboxFeature ? 'flash' : 'clipboard-outline'}
                size={20}
                color="#FFFFFF"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.oneTapBigButtonText}>
                {hasInboxFeature ? 'Read my bank messages' : 'Read from clipboard'}
              </Text>
            </TouchableOpacity>

            {/* Range Link for Android Direct */}
            {hasInboxFeature && (
              <TouchableOpacity
                style={styles.changeRangeLink}
                onPress={() => setShowRangeModal(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.changeRangeLinkText}>
                  Range: <Text style={{ fontWeight: '700' }}>{rangeLabel}</Text> ▾
                </Text>
              </TouchableOpacity>
            )}

            {/* Fallback Paste Box Trigger */}
            <View style={styles.pasteToggleRow}>
              <TouchableOpacity
                onPress={() => setShowPasteBox(!showPasteBox)}
                activeOpacity={0.7}
              >
                <Text style={styles.pasteToggleText}>
                  {showPasteBox ? 'Hide manual paste box ▴' : 'Paste messages instead ▾'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Expandable Fallback Paste Box */}
            {showPasteBox && (
              <View style={styles.pasteBoxContainer}>
                <TextInput
                  style={styles.pasteTextInput}
                  value={pasteInputText}
                  onChangeText={setPasteInputText}
                  placeholder="Paste bank debit/credit messages or UPI confirmations here... Multiple messages separated by blank lines are automatically detected."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={styles.analyzePastedBtn}
                  onPress={handleAnalyzePasted}
                  activeOpacity={0.85}
                >
                  <Ionicons name="search" size={16} color="#4F46E5" style={{ marginRight: 6 }} />
                  <Text style={styles.analyzePastedBtnText}>Analyze Pasted Text</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Privacy Note */}
          <View style={styles.privacyNoteBox}>
            <Ionicons name="lock-closed" size={15} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={styles.privacyNoteText}>
              100% on-device. Personal messages, OTPs, and spam are strictly ignored.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* ==================================================================== */}
      {/* STATE 2 - READING (AUTO-RUNNING, ZERO EXTRA TAPS)                    */}
      {/* ==================================================================== */}
      {state === 'reading' && (
        <View style={styles.readingContainer}>
          <View style={styles.readingCard}>
            <ActivityIndicator size="large" color="#4F46E5" style={{ marginBottom: 16 }} />
            <Text style={styles.readingTitle}>Reading messages...</Text>
            <Text style={styles.readingSubtitle}>
              {progress.scanned} scanned · {progress.detected} bank alerts found
            </Text>

            {progress.total > 0 && (
              <View style={styles.progressBarWrap}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(
                        100,
                        Math.round((progress.scanned / progress.total) * 100)
                      )}%`,
                    },
                  ]}
                />
              </View>
            )}

            <TouchableOpacity style={styles.cancelScanBtn} onPress={cancelReading} activeOpacity={0.8}>
              <Text style={styles.cancelScanBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ==================================================================== */}
      {/* STATE 3 - REVIEW (AUTO-APPEARS AFTER DETECTION)                       */}
      {/* ==================================================================== */}
      {state === 'review' && (
        <View style={{ flex: 1 }}>
          {/* Summary Header */}
          <View style={styles.reviewSummaryCard}>
            <Text style={styles.reviewSummaryTitle}>
              Found {totals.totalFound} transactions
            </Text>
            <Text style={styles.reviewSummarySubtitle}>
              Expense <Text style={{ color: '#DC2626', fontWeight: '800' }}>₹{totals.expenseTotal.toLocaleString('en-IN')}</Text> · Income <Text style={{ color: '#16A34A', fontWeight: '800' }}>₹{totals.incomeTotal.toLocaleString('en-IN')}</Text>
            </Text>

            {/* Controls Bar */}
            <View style={styles.reviewControlsRow}>
              <TouchableOpacity
                onPress={() => selectAll(totals.selectedCount < totals.totalFound - totals.alreadyAddedCount)}
                activeOpacity={0.7}
                style={styles.selectAllBtn}
              >
                <Ionicons
                  name={
                    totals.selectedCount === totals.totalFound - totals.alreadyAddedCount && totals.selectedCount > 0
                      ? 'checkmark-circle'
                      : 'ellipse-outline'
                  }
                  size={18}
                  color="#4F46E5"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.selectAllBtnText}>
                  {totals.selectedCount === totals.totalFound - totals.alreadyAddedCount && totals.selectedCount > 0
                    ? 'Select None'
                    : 'Select All'}
                </Text>
              </TouchableOpacity>

              {totals.alreadyAddedCount > 0 && (
                <TouchableOpacity
                  onPress={() => setShowAlreadyAdded(!showAlreadyAdded)}
                  activeOpacity={0.7}
                  style={styles.alreadyAddedToggle}
                >
                  <Text style={styles.alreadyAddedToggleText}>
                    {showAlreadyAdded
                      ? 'Hide already added ▴'
                      : `Show already added (${totals.alreadyAddedCount}) ▾`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Drafts List */}
          {visibleDrafts.length === 0 ? (
            <View style={styles.emptyReviewBox}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyReviewTitle}>No new bank messages to add</Text>
              <Text style={styles.emptyReviewDesc}>
                {totals.alreadyAddedCount > 0
                  ? `All ${totals.alreadyAddedCount} detected messages have already been imported previously.`
                  : 'No bank debit/credit messages detected.'}
              </Text>
              <TouchableOpacity style={styles.emptyBackBtn} onPress={discard} activeOpacity={0.8}>
                <Text style={styles.emptyBackBtnText}>Back to Start</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={visibleDrafts}
              keyExtractor={(item) => item.id}
              renderItem={renderDraftRow}
              contentContainerStyle={{ padding: 14, paddingBottom: 110 }}
              showsVerticalScrollIndicator={false}
              initialNumToRender={15}
              maxToRenderPerBatch={15}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          )}

          {/* Sticky Bottom Bar */}
          <View style={[styles.stickyBottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <TouchableOpacity
              style={[styles.saveSelectedBtn, (totals.selectedCount === 0 || isSaving) && styles.saveSelectedBtnDisabled]}
              onPress={handleSaveSelected}
              disabled={totals.selectedCount === 0 || isSaving}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Save ${totals.selectedCount} selected transactions`}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.saveSelectedBtnText}>
                    Save {totals.selectedCount} selected
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard} activeOpacity={0.7}>
              <Text style={styles.discardBtnText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ==================================================================== */}
      {/* STATE 4 - DONE                                                       */}
      {/* ==================================================================== */}
      {state === 'done' && (
        <ScrollView style={styles.contentScroll} contentContainerStyle={styles.doneContainer}>
          <View style={styles.doneCard}>
            <View style={styles.doneBadgeWrap}>
              <Ionicons name="checkmark-done" size={38} color="#16A34A" />
            </View>

            <Text style={styles.doneTitle}>
              {lastBatchResult?.count || 0} Transactions Added
            </Text>
            <Text style={styles.doneSubtitle}>
              Your bank &amp; UPI expenses have been saved safely to your account.
            </Text>

            {/* View Transactions (Go to Dashboard) */}
            <TouchableOpacity
              style={styles.viewTransactionsBtn}
              onPress={() => router.replace('/(tabs)/dashboard')}
              activeOpacity={0.85}
            >
              <Text style={styles.viewTransactionsBtnText}>View Transactions</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            {/* Undo Button */}
            <TouchableOpacity
              style={styles.undoBatchBtn}
              onPress={handleUndo}
              disabled={isUndoing}
              activeOpacity={0.8}
            >
              {isUndoing ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Ionicons name="arrow-undo-outline" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                  <Text style={styles.undoBatchBtnText}>Undo This Import Batch</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Import More Messages */}
            <TouchableOpacity
              style={styles.importMoreLink}
              onPress={() => {
                discard();
                setShowPasteBox(false);
                setPasteInputText('');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.importMoreLinkText}>Import more messages</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ==================================================================== */}
      {/* MODALS                                                               */}
      {/* ==================================================================== */}



      {/* 2. Range Selector Modal */}
      <Modal
        visible={showRangeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRangeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Select Scan Range</Text>
            <Text style={styles.dialogSubtitle}>Choose how far back to scan for messages</Text>

            <View style={{ gap: 8, marginVertical: 14 }}>
              {[
                { key: '30d' as const, label: 'Last 30 Days' },
                { key: '90d' as const, label: 'Last 3 Months (Recommended)' },
                { key: '365d' as const, label: 'Last 1 Year' },
                { key: 'all' as const, label: 'All Time' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.rangeOptionRow, selectedRange === item.key && styles.rangeOptionRowActive]}
                  onPress={() => {
                    setSelectedRange(item.key);
                    setShowRangeModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rangeOptionText, selectedRange === item.key && styles.rangeOptionTextActive]}>
                    {item.label}
                  </Text>
                  {selectedRange === item.key && <Ionicons name="checkmark" size={18} color="#4F46E5" />}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setShowRangeModal(false)}>
              <Text style={styles.dialogCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3. Edit Draft Bottom Sheet */}
      {editingDraft && (
        <Modal
          visible={Boolean(editingDraft)}
          transparent
          animationType="slide"
          onRequestClose={() => setEditingDraft(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.editSheetCard}>
              <View style={styles.editSheetHeader}>
                <Text style={styles.editSheetTitle}>Edit Transaction</Text>
                <TouchableOpacity onPress={() => setEditingDraft(null)} style={styles.editCloseBtn}>
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {/* Type Toggle: Expense / Income */}
                <View style={styles.typeToggleRow}>
                  <TouchableOpacity
                    style={[styles.typeBtn, editType === 'expense' && styles.typeBtnActiveExpense]}
                    onPress={() => setEditType('expense')}
                  >
                    <Text style={[styles.typeBtnText, editType === 'expense' && styles.typeBtnTextActive]}>
                      Expense
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeBtn, editType === 'income' && styles.typeBtnActiveIncome]}
                    onPress={() => setEditType('income')}
                  >
                    <Text style={[styles.typeBtnText, editType === 'income' && styles.typeBtnTextActive]}>
                      Income
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Amount Input */}
                <Text style={styles.inputLabel}>Amount (₹)</Text>
                <TextInput
                  style={styles.editInput}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="numeric"
                  placeholder="0.00"
                />

                {/* Merchant / Payee Input */}
                <Text style={styles.inputLabel}>Merchant / Payee</Text>
                <TextInput
                  style={styles.editInput}
                  value={editMerchant}
                  onChangeText={setEditMerchant}
                  placeholder="e.g. Swiggy, Amazon"
                />

                {/* Category Selector */}
                <Text style={styles.inputLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.categoryPill, editCategory === cat && styles.categoryPillActive]}
                      onPress={() => setEditCategory(cat)}
                    >
                      <Text style={[styles.categoryPillText, editCategory === cat && styles.categoryPillTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* View Original Masked Message */}
                <TouchableOpacity
                  style={styles.viewOriginalToggle}
                  onPress={() => setShowOriginalMessage(!showOriginalMessage)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewOriginalToggleText}>
                    {showOriginalMessage ? 'Hide original message ▴' : 'View original message ▾'}
                  </Text>
                </TouchableOpacity>

                {showOriginalMessage && (
                  <View style={styles.originalMessageBox}>
                    <Text style={styles.originalMessageText}>{editingDraft.rawText}</Text>
                  </View>
                )}

                {/* Actions: Ignore / Save */}
                <View style={styles.editActionRow}>
                  <TouchableOpacity
                    style={styles.ignoreDraftBtn}
                    onPress={() => {
                      ignoreDraft(editingDraft.id);
                      setEditingDraft(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                    <Text style={styles.ignoreDraftBtnText}>Ignore this</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.saveDraftBtn}
                    onPress={handleSaveDraftEdit}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.saveDraftBtnText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* 4. Custom & International Banks Modal */}
      <Modal
        visible={showCustomBankModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomBankModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dialogCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="globe-outline" size={20} color="#4F46E5" style={{ marginRight: 8 }} />
                <Text style={styles.dialogTitle}>Custom &amp; Country Banks</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCustomBankModal(false)} style={styles.editCloseBtn}>
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={styles.preSavedInfoBox}>
                <Text style={styles.preSavedInfoTitle}>✓ 75+ Indian Banks Pre-Saved</Text>
                <Text style={styles.preSavedInfoDesc}>
                  SBI, HDFC, ICICI, Axis, Kotak, PNB, BOB, Canara, PhonePe, GPay, Paytm, CRED &amp; UPI are 100% pre-configured.
                </Text>
              </View>

              <Text style={styles.inputLabel}>Add Your Country Bank or Sender ID</Text>
              <Text style={{ fontSize: 11.5, color: '#64748B', marginBottom: 8, lineHeight: 16 }}>
                For users outside India, add bank names (e.g. Chase, Emirates NBD, Barclays). SMS from added banks will be automatically parsed and auto-added.
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[styles.editInput, { flex: 1, marginBottom: 0 }]}
                  value={customBankInput}
                  onChangeText={setCustomBankInput}
                  placeholder="e.g. Chase, Emirates NBD"
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={styles.addCustomBankBtn}
                  onPress={async () => {
                    const clean = customBankInput.trim().toUpperCase();
                    if (!clean) return;
                    await addCustomBank(userId, clean);
                    await refreshSettings();
                    setCustomBankInput('');
                    Toast.show({
                      type: 'success',
                      text1: 'Bank Added',
                      text2: `${clean} will now be auto-detected in SMS.`,
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addCustomBankBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {smsSettings.customBanks && smsSettings.customBanks.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>
                    Your Added Banks ({smsSettings.customBanks.length})
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {smsSettings.customBanks.map((b) => (
                      <View key={b} style={styles.customBankTag}>
                        <Text style={styles.customBankTagText}>{b}</Text>
                        <TouchableOpacity
                          onPress={async () => {
                            await removeCustomBank(userId, b);
                            await refreshSettings();
                          }}
                        >
                          <Ionicons name="close-circle" size={16} color="#6366F1" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity style={styles.dialogDoneBtn} onPress={() => setShowCustomBankModal(false)}>
                <Text style={styles.dialogDoneBtnText}>Done</Text>
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
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  globeBtn: {
    padding: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
  },
  bankChipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
  },
  bankChipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  bankChipTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#166534',
  },
  bankChipSubtitle: {
    fontSize: 11,
    color: '#15803D',
  },
  addBankBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  addBankBtnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  contentScroll: {
    flex: 1,
    padding: 16,
  },
  readyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 2,
    marginTop: 12,
  },
  readyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  readyMainHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  readyMainDesc: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 320,
  },
  oneTapBigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 14,
    width: '100%',
    shadowColor: '#4F46E5',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  oneTapBigButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  changeRangeLink: {
    marginTop: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  changeRangeLinkText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  pasteToggleRow: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    width: '100%',
    alignItems: 'center',
  },
  pasteToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  pasteBoxContainer: {
    width: '100%',
    marginTop: 14,
  },
  pasteTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 90,
    marginBottom: 10,
  },
  analyzePastedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: 10,
  },
  analyzePastedBtnText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '700',
  },
  privacyNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 14,
  },
  privacyNoteText: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
  readingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  readingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
  },
  readingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  readingSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  progressBarWrap: {
    width: '100%',
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 18,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
  },
  cancelScanBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelScanBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  reviewSummaryCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  reviewSummaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewSummarySubtitle: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  reviewControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectAllBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#4F46E5',
  },
  alreadyAddedToggle: {
    paddingVertical: 2,
  },
  alreadyAddedToggleText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  draftRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    overflow: 'hidden',
  },
  draftRowCardDisabled: {
    backgroundColor: '#F8FAFC',
    opacity: 0.75,
  },
  checkboxTouchTarget: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  checkboxDisabled: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftContentTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 12,
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  draftMiddleCol: {
    flex: 1,
    marginRight: 8,
  },
  draftTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  draftMerchant: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
    marginRight: 6,
  },
  checkThisBadge: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  checkThisBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
  },
  alreadyAddedBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  alreadyAddedBadgeText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
  },
  draftMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  draftMetaText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  draftDateText: {
    fontSize: 10.5,
    color: '#94A3B8',
  },
  draftRightCol: {
    alignItems: 'flex-end',
  },
  draftAmountText: {
    fontSize: 14,
    fontWeight: '800',
  },
  emptyReviewBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyReviewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyReviewDesc: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyBackBtn: {
    backgroundColor: '#EEF2FF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  emptyBackBtnText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 13,
  },
  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 8,
    elevation: 8,
  },
  saveSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveSelectedBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveSelectedBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  discardBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  discardBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  doneContainer: {
    padding: 20,
    alignItems: 'center',
  },
  doneCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 2,
    marginTop: 20,
  },
  doneBadgeWrap: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  doneSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  viewTransactionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 14,
    width: '100%',
    marginBottom: 12,
  },
  viewTransactionsBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  undoBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: 12,
    width: '100%',
    marginBottom: 14,
  },
  undoBatchBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  importMoreLink: {
    paddingVertical: 6,
  },
  importMoreLinkText: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  consentSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
  },
  consentIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  consentTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  consentSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 18,
    lineHeight: 18,
  },
  consentPointsList: {
    gap: 12,
    marginBottom: 24,
  },
  consentPointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  consentPointText: {
    fontSize: 12.5,
    color: '#334155',
    flex: 1,
    lineHeight: 18,
  },
  consentActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  consentDeclineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
  },
  consentDeclineBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  consentAcceptBtn: {
    flex: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 14,
  },
  consentAcceptBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  dialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  dialogSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  rangeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rangeOptionRowActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  rangeOptionText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
  },
  rangeOptionTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  dialogCancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  dialogCancelBtnText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  dialogDoneBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  dialogDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  editSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 30,
  },
  editSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  editSheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  editCloseBtn: {
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
  },
  typeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeBtnActiveExpense: {
    backgroundColor: '#FEF2F2',
  },
  typeBtnActiveIncome: {
    backgroundColor: '#ECFDF5',
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  typeBtnTextActive: {
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  editInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  categoryPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    marginRight: 6,
  },
  categoryPillActive: {
    backgroundColor: '#4F46E5',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  viewOriginalToggle: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 6,
  },
  viewOriginalToggleText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
  },
  originalMessageBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 14,
  },
  originalMessageText: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },
  editActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  ignoreDraftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
  },
  ignoreDraftBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  saveDraftBtn: {
    flex: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
  },
  saveDraftBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  preSavedInfoBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 14,
  },
  preSavedInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 2,
  },
  preSavedInfoDesc: {
    fontSize: 11.5,
    color: '#15803D',
    lineHeight: 16,
  },
  addCustomBankBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCustomBankBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  customBankTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  customBankTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
  },
});
