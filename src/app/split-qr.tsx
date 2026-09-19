import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Share,
  StatusBar,
  Linking,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';

import { useAuth } from '@/context/AuthContext';
import { safeGoBack } from '@/lib/navigation';
import {
  SplitMode,
  DEFAULT_SPLIT_LIMIT,
  LIMIT_PRESETS,
  validateUpiId,
  validateAmount,
  calculateSplitBreakdown,
  generateBreakdownShareText,
  SplitPart,
  SplitBreakdown,
} from '@/lib/splitPayment';
import { MultiPartQrCard } from '@/components/MultiPartQrCard';
import BankLogo from '@/components/BankLogo';
import {
  SavedQrPaymentCard,
  getSavedQrPayments,
  saveQrPayment,
  deleteSavedQrPayment,
  addSavedQrToTransactions,
} from '@/lib/savedQrPayments';
import { SavedQrCardItem } from '@/components/SavedQrCardItem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 32, 380);

const AMOUNT_PRESETS = [100, 500, 1000, 2000, 4000];

const POPULAR_HANDLES = [
  { id: 'hdfc', label: 'HDFC Bank', handle: '@okhdfcbank', color: '#004C8F', textColor: '#FFFFFF' },
  { id: 'icici', label: 'ICICI Bank', handle: '@icici', color: '#991B1E', textColor: '#FFFFFF' },
  { id: 'phonepe', label: 'पे PhonePe', handle: '@ybl', color: '#5F259F', textColor: '#FFFFFF' },
  { id: 'paytm', label: 'Paytm', handle: '@ptaxis', color: '#002E6E', textColor: '#FFFFFF' },
  { id: 'gpay', label: 'G Pay', handle: '@okaxis', color: '#1A73E8', textColor: '#FFFFFF' },
  { id: 'axis', label: 'Axis Bank', handle: '@axisbank', color: '#861F41', textColor: '#FFFFFF' },
  { id: 'sbi', label: 'SBI', handle: '@oksbi', color: '#1F4788', textColor: '#FFFFFF' },
];

export default function SplitQrScreen() {
  const router = useRouter();
  const { user, settings } = useAuth();
  const curr = settings?.currency || '₹';
  const { width: windowWidth } = useWindowDimensions();
  const isSmallScreen = windowWidth < 380;

  // Main Tab State: 'create' or 'saved'
  const [activeMainTab, setActiveMainTab] = useState<'create' | 'saved'>('create');
  const [savedCards, setSavedCards] = useState<SavedQrPaymentCard[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState<boolean>(false);
  const [isSavingCard, setIsSavingCard] = useState<boolean>(false);
  const [processingCardId, setProcessingCardId] = useState<string | null>(null);

  // Form Input States (Starts completely unfilled/blank when opened)
  const [totalAmountInput, setTotalAmountInput] = useState<string>('');
  const [upiIdInput, setUpiIdInput] = useState<string>('');
  const [payeeNameInput, setPayeeNameInput] = useState<string>('');
  const [noteInput, setNoteInput] = useState<string>('');
  const [isUpiFocused, setIsUpiFocused] = useState<boolean>(false);
  const [isGenerated, setIsGenerated] = useState<boolean>(false);

  // Split Configuration State
  const [isSplitEnabled, setIsSplitEnabled] = useState<boolean>(true);
  const [selectedPresetLimit, setSelectedPresetLimit] = useState<number>(DEFAULT_SPLIT_LIMIT);
  const [customLimitInput, setCustomLimitInput] = useState<string>('1999');
  const [isCustomLimit, setIsCustomLimit] = useState<boolean>(false);
  const [splitMode, setSplitMode] = useState<SplitMode>('greedy');

  // Active Selected Part Tab
  const [activePartIndex, setActivePartIndex] = useState<number>(0);

  // Paid Status Map for parts: { [partId: string]: boolean }
  const [paidStatusMap, setPaidStatusMap] = useState<Record<string, boolean>>({});

  // Show Details for NPCI MDR
  const [showMdrDetails, setShowMdrDetails] = useState<boolean>(false);

  // Scroll ref to scroll down to QR once generated
  const scrollRef = useRef<ScrollView>(null);
  const qrSectionRef = useRef<View>(null);

  // Parse amount and limit
  const parsedTotalAmount = useMemo(() => {
    const cleaned = totalAmountInput.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }, [totalAmountInput]);

  const effectiveMaxLimit = useMemo(() => {
    if (isCustomLimit) {
      const cleaned = customLimitInput.replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || DEFAULT_SPLIT_LIMIT;
    }
    return selectedPresetLimit;
  }, [isCustomLimit, customLimitInput, selectedPresetLimit]);

  // Validation
  const upiValidation = useMemo(() => validateUpiId(upiIdInput), [upiIdInput]);
  const amountValidation = useMemo(() => validateAmount(parsedTotalAmount), [parsedTotalAmount]);

  // Compute breakdown dynamically
  const breakdown: SplitBreakdown = useMemo(() => {
    if (!amountValidation.isValid || !upiValidation.isValid) {
      return {
        totalAmount: parsedTotalAmount,
        totalAmountFormatted: parsedTotalAmount.toFixed(2),
        parts: [],
        totalParts: 0,
        mode: splitMode,
        maxLimit: effectiveMaxLimit,
        isSingle: true,
        estimatedMdrSavings: 0,
        estimatedMdrSavingsFormatted: '0.00',
        hasExceededSafetyCap: false,
      };
    }

    const res = calculateSplitBreakdown(
      {
        upiId: upiIdInput.trim(),
        payeeName: payeeNameInput.trim() || undefined,
        amount: parsedTotalAmount,
        note: noteInput.trim() || undefined,
      },
      {
        enabled: isSplitEnabled,
        maxLimit: effectiveMaxLimit,
        mode: splitMode,
      }
    );

    // Apply paid status from state
    res.parts = res.parts.map((p) => ({
      ...p,
      isPaid: !!paidStatusMap[p.id],
    }));

    return res;
  }, [
    parsedTotalAmount,
    amountValidation.isValid,
    upiValidation.isValid,
    upiIdInput,
    payeeNameInput,
    noteInput,
    isSplitEnabled,
    effectiveMaxLimit,
    splitMode,
    paidStatusMap,
  ]);

  // Active Part Object
  const currentActivePart = useMemo(() => {
    if (!breakdown.parts || breakdown.parts.length === 0) return null;
    const safeIndex = Math.min(activePartIndex, breakdown.parts.length - 1);
    return breakdown.parts[safeIndex];
  }, [breakdown.parts, activePartIndex]);

  // Append or replace popular handle suffix (requires user to enter username/mobile)
  const handleSelectHandle = (handleSuffix: string) => {
    if (isGenerated) {
      setIsGenerated(false);
    }

    setUpiIdInput((prev) => {
      const trimmed = (prev || '').trim();

      // If user hasn't entered anything yet, or only has another handle (e.g. @okhdfcbank)
      if (!trimmed || trimmed.startsWith('@')) {
        Toast.show({
          type: 'info',
          text1: 'Enter UPI Username First',
          text2: `Handle ${handleSuffix} selected. Please type your username or number before @.`,
          position: 'top',
        });
        return handleSuffix;
      }

      // If user already entered username@bank, replace the bank handle
      if (trimmed.includes('@')) {
        const prefix = trimmed.split('@')[0].trim();
        if (!prefix) {
          return handleSuffix;
        }
        return `${prefix}${handleSuffix}`;
      }

      // If user typed username without @ (e.g. "storename" or "merchant"), append handle
      return `${trimmed}${handleSuffix}`;
    });
  };

  // Toggle paid status for a part
  const handleTogglePaid = useCallback((partId: string) => {
    setPaidStatusMap((prev) => ({
      ...prev,
      [partId]: !prev[partId],
    }));
  }, []);

  // Quick Amount Preset Handler
  const handleSelectAmountPreset = (amt: number) => {
    setTotalAmountInput(amt.toString());
    if (isGenerated) {
      setIsGenerated(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setTotalAmountInput('');
    setUpiIdInput('');
    setPayeeNameInput('');
    setNoteInput('');
    setPaidStatusMap({});
    setActivePartIndex(0);
    setIsGenerated(false);
    Toast.show({
      type: 'info',
      text1: 'Form Cleared',
      position: 'top',
    });
  };

  // Direct Pay Now Trigger (1-Tap device checkout)
  const handlePayNow = async (uri?: string) => {
    const targetUri = uri || currentActivePart?.upiUri;
    if (!targetUri) return;

    try {
      const canOpen = await Linking.canOpenURL(targetUri);
      if (canOpen || Platform.OS === 'android') {
        await Linking.openURL(targetUri);
      } else {
        Alert.alert(
          'No UPI App Detected',
          'Could not find a supported UPI app on this device. Please scan the QR code from another device or share the payment link.',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      try {
        await Linking.openURL(targetUri);
      } catch {
        Alert.alert('Unable to launch UPI app', 'Could not open UPI app on this device.');
      }
    }
  };

  // Share full breakdown
  const handleShareAll = async () => {
    if (!breakdown.parts || breakdown.parts.length === 0) return;
    try {
      const text = generateBreakdownShareText({
        payeeName: payeeNameInput.trim() || undefined,
        upiId: upiIdInput.trim(),
        breakdown,
      });

      await Share.share({
        title: `Rupeo Split Payment - ₹${breakdown.totalAmountFormatted}`,
        message: text,
      });
    } catch (err) {
      console.warn('Share error:', err);
    }
  };

  // Load saved QR payment cards from storage
  const loadSavedCards = useCallback(async () => {
    try {
      setIsLoadingSaved(true);
      const list = await getSavedQrPayments(user?.uid);
      setSavedCards(list);
    } catch (err) {
      console.warn('Failed to load saved cards:', err);
    } finally {
      setIsLoadingSaved(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadSavedCards();
  }, [loadSavedCards]);

  // Save current payment as a card in Rupeo
  const handleSaveCurrentPayment = async () => {
    if (!isGenerated || !breakdown.parts || breakdown.parts.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Generate QR First',
        text2: 'Please generate a payment QR before saving.',
        position: 'top',
      });
      return;
    }

    try {
      setIsSavingCard(true);
      await saveQrPayment(user?.uid, {
        totalAmount: breakdown.totalAmount,
        totalAmountFormatted: breakdown.totalAmountFormatted,
        upiId: upiIdInput.trim(),
        payeeName: payeeNameInput.trim() || undefined,
        note: noteInput.trim() || undefined,
        parts: breakdown.parts.map((p) => ({
          id: p.id,
          partIndex: p.partIndex,
          totalParts: p.totalParts,
          amount: p.amount,
          amountFormatted: p.amountFormatted,
          upiUri: p.upiUri,
          isPaid: !!paidStatusMap[p.id],
        })),
        totalParts: breakdown.totalParts,
      });

      await loadSavedCards();

      Toast.show({
        type: 'success',
        text1: 'Saved as Payment Card! 📑',
        text2: `₹${breakdown.totalAmountFormatted} saved. You can mark as paid anytime.`,
        position: 'top',
        visibilityTime: 4000,
      });
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: err?.message || 'Could not save payment card',
        position: 'top',
      });
    } finally {
      setIsSavingCard(false);
    }
  };

  // Mark a saved QR card as paid and automatically insert into Rupeo transactions
  const handleMarkCardPaid = async (card: SavedQrPaymentCard) => {
    try {
      setProcessingCardId(card.id);
      const res = await addSavedQrToTransactions(user?.uid, card.id);
      if (res.success) {
        await loadSavedCards();
        Toast.show({
          type: 'success',
          text1: 'Payment Recorded in Rupeo! 💸',
          text2: `₹${card.totalAmountFormatted} added to your expenses.`,
          position: 'top',
          visibilityTime: 4000,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: res.error || 'Failed to record transaction',
          position: 'top',
        });
      }
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: err?.message || 'Failed to record transaction',
        position: 'top',
      });
    } finally {
      setProcessingCardId(null);
    }
  };

  // Delete a saved card
  const handleDeleteCard = async (cardId: string) => {
    try {
      // Instant optimistic UI update
      setSavedCards((prev) => prev.filter((c) => c.id !== cardId));
      await deleteSavedQrPayment(user?.uid, cardId);
      await loadSavedCards();
      Toast.show({
        type: 'info',
        text1: 'Payment Card Deleted 🗑️',
        position: 'top',
        visibilityTime: 2500,
      });
    } catch (err: any) {
      await loadSavedCards();
      Toast.show({
        type: 'error',
        text1: 'Delete Failed',
        text2: err?.message || 'Could not delete card',
        position: 'top',
      });
    }
  };

  // Restore and view QRs of a saved card
  const handleViewCardQrs = (card: SavedQrPaymentCard) => {
    setTotalAmountInput(card.totalAmount.toString());
    setUpiIdInput(card.upiId);
    setPayeeNameInput(card.payeeName || '');
    setNoteInput(card.note || '');
    const paidMap: Record<string, boolean> = {};
    card.parts.forEach((p) => {
      paidMap[p.id] = p.isPaid;
    });
    setPaidStatusMap(paidMap);
    setIsGenerated(true);
    setActivePartIndex(0);
    setActiveMainTab('create');
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  // Generate / Scroll action
  const handleGenerate = () => {
    if (!totalAmountInput.trim() || !amountValidation.isValid) {
      Toast.show({
        type: 'error',
        text1: 'Amount Required',
        text2: amountValidation.error || 'Please enter an amount to receive.',
        position: 'top',
      });
      return;
    }
    if (!upiIdInput.trim() || !upiValidation.isValid) {
      Toast.show({
        type: 'error',
        text1: 'UPI ID Required',
        text2: upiValidation.error || 'Please enter recipient UPI ID.',
        position: 'top',
      });
      return;
    }

    setIsGenerated(true);
    setActivePartIndex(0);
    Toast.show({
      type: 'success',
      text1: 'Payment QR Generated! ✨',
      text2: `${breakdown.totalParts} ${breakdown.totalParts === 1 ? 'QR code' : 'Smart QR Pay codes'} ready.`,
      position: 'top',
    });

    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Navigation Bar */}
      <View style={styles.topNavBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => safeGoBack(router)}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.topNavTitleRow}>
          <View style={styles.topNavRedSquare} />
          <Text style={styles.topNavTitle}>PAYMENT DETAILS</Text>
        </View>

        <View style={styles.zeroFeesBadge}>
          <Ionicons name="checkmark-circle" size={13} color="#16A34A" />
          <Text style={styles.zeroFeesBadgeText}>ZERO FEES</Text>
        </View>
      </View>

      {/* Top Segmented Tab Switcher: Create QR vs Saved Cards */}
      <View style={styles.topTabContainer}>
        <View style={styles.topTabSegment}>
          <TouchableOpacity
            style={[styles.topTabBtn, activeMainTab === 'create' && styles.topTabBtnActive]}
            onPress={() => setActiveMainTab('create')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="qr-code-outline"
              size={15}
              color={activeMainTab === 'create' ? '#2563EB' : '#64748B'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.topTabBtnText,
                activeMainTab === 'create' && styles.topTabBtnTextActive,
              ]}
            >
              Smart QR Pay
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.topTabBtn, activeMainTab === 'saved' && styles.topTabBtnActive]}
            onPress={() => {
              setActiveMainTab('saved');
              loadSavedCards();
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name="receipt-outline"
              size={15}
              color={activeMainTab === 'saved' ? '#2563EB' : '#64748B'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.topTabBtnText,
                activeMainTab === 'saved' && styles.topTabBtnTextActive,
              ]}
            >
              Saved Cards
            </Text>
            {savedCards.length > 0 && (
              <View
                style={[
                  styles.tabCounterBadge,
                  activeMainTab === 'saved' && styles.tabCounterBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabCounterText,
                    activeMainTab === 'saved' && styles.tabCounterTextActive,
                  ]}
                >
                  {savedCards.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {activeMainTab === 'saved' ? (
        <ScrollView
          style={styles.flexOne}
          contentContainerStyle={styles.savedScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header summary of saved cards */}
          <View style={styles.savedFeedHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.savedFeedTitle}>Saved Payment Cards</Text>
              <Text style={styles.savedFeedSubtitle}>
                Pay via Smart QR Pay & tap "Mark as Paid" to auto-record in Rupeo
              </Text>
            </View>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={loadSavedCards}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={16} color="#475569" />
            </TouchableOpacity>
          </View>

          {isLoadingSaved ? (
            <View style={styles.loadingSavedContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingSavedText}>Loading saved cards...</Text>
            </View>
          ) : savedCards.length === 0 ? (
            <View style={styles.emptySavedContainer}>
              <View style={styles.emptySavedIconCircle}>
                <Ionicons name="receipt-outline" size={40} color="#94A3B8" />
              </View>
              <Text style={styles.emptySavedTitle}>No Saved Cards Yet</Text>
              <Text style={styles.emptySavedSubtitle}>
                Generate a Smart QR Pay for your bills or vendors, then tap "Save Bill" to keep a card ready. When paid, mark it to add directly to your Rupeo ledger!
              </Text>
              <TouchableOpacity
                style={styles.emptyCreateBtn}
                onPress={() => setActiveMainTab('create')}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyCreateBtnText}>Create New Smart QR Pay</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.savedCardsList}>
              {savedCards.map((card) => (
                <SavedQrCardItem
                  key={card.id}
                  card={card}
                  onMarkPaid={() => handleMarkCardPaid(card)}
                  onDelete={(id) => handleDeleteCard(id)}
                  onViewQrs={() => handleViewCardQrs(card)}
                  isProcessing={processingCardId === card.id}
                />
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={styles.flexOne}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.flexOne}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          {/* Card 1: Amount to Receive */}
          <View style={styles.cardContainer}>
            <Text style={styles.cardHeaderSmall}>AMOUNT TO RECEIVE</Text>
            <View style={styles.cardHeaderDivider} />

            {/* Giant Centered Amount Input */}
            <View style={styles.amountHeroContainer}>
              <Text style={styles.amountHeroSymbol}>₹</Text>
              <TextInput
                style={styles.amountHeroInput}
                value={totalAmountInput}
                onChangeText={(text) => {
                  setTotalAmountInput(text);
                  if (isGenerated) setIsGenerated(false);
                }}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#CBD5E1"
                maxLength={8}
              />
            </View>

            {/* Quick Amount Preset Chips */}
            <View style={styles.amountPresetsRow}>
              {AMOUNT_PRESETS.map((preset) => {
                const isSelected = parsedTotalAmount === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.amountPresetChip, isSelected && styles.amountPresetChipActive]}
                    onPress={() => handleSelectAmountPreset(preset)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.amountPresetChipText,
                        isSelected && styles.amountPresetChipTextActive,
                      ]}
                    >
                      ₹{preset}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* NPCI MDR Notice Box with Dropdown Toggle */}
            <TouchableOpacity
              style={styles.mdrInfoBox}
              onPress={() => setShowMdrDetails((prev) => !prev)}
              activeOpacity={0.8}
            >
              <View style={styles.mdrInfoLeft}>
                <View style={styles.mdrGreySquare} />
                <Text style={styles.mdrInfoText} numberOfLines={1}>
                  NPCI MDR: ₹0 Free up to ₹2,000 · 0.40% abo...
                </Text>
              </View>
              <View style={styles.mdrDetailsToggle}>
                <Text style={styles.mdrDetailsText}>Details</Text>
                <Ionicons
                  name={showMdrDetails ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#64748B"
                />
              </View>
            </TouchableOpacity>

            {/* Expanded MDR Details with 100% Verified Truth */}
            {showMdrDetails && (
              <View style={styles.mdrExpandedDetails}>
                <Text style={styles.mdrExpandedHeading}>Official NPCI & Banking Regulations (Verified Facts):</Text>

                <View style={styles.mdrFactRow}>
                  <Text style={styles.mdrFactBullet}>•</Text>
                  <Text style={styles.mdrFactText}>
                    <Text style={styles.mdrFactBold}>Standard Bank-to-Bank UPI:</Text> 100% Free (0% MDR) for both customers and merchants, irrespective of the amount.
                  </Text>
                </View>

                <View style={styles.mdrFactRow}>
                  <Text style={styles.mdrFactBullet}>•</Text>
                  <Text style={styles.mdrFactText}>
                    <Text style={styles.mdrFactBold}>P2M Commercial Transactions:</Text> Free up to ₹2,000. For merchant payments exceeding ₹2,000, an MDR of 0.40% applies under NPCI circulars (capped at ₹300 for ₹75k+).
                  </Text>
                </View>

                <View style={styles.mdrFactRow}>
                  <Text style={styles.mdrFactBullet}>•</Text>
                  <Text style={styles.mdrFactText}>
                    <Text style={styles.mdrFactBold}>PPI Wallets & Credit Cards on UPI:</Text> Free up to ₹2,000. Above ₹2,000, an interchange fee of up to 1.1% applies (borne by merchant acquirers).
                  </Text>
                </View>

                <View style={styles.mdrFactRow}>
                  <Text style={styles.mdrFactBullet}>•</Text>
                  <Text style={styles.mdrFactText}>
                    <Text style={styles.mdrFactBold}>Bank Velocity & Limits:</Text> Most banks (SBI, HDFC, ICICI) enforce a ₹2,000 single-transaction velocity cap on new payees or in the first 24h.
                  </Text>
                </View>

                <View style={styles.mdrSummaryBox}>
                  <Ionicons name="shield-checkmark" size={13} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.mdrSummaryText}>
                    Splitting amounts to ≤₹1,999 keeps transfers strictly within the 0% zero-fee bracket and eliminates banking velocity trigger blocks.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Card 2: Recipient UPI ID */}
          <View style={styles.cardContainer}>
            <View style={styles.recipientHeaderRow}>
              <View style={styles.recipientHeaderLeft}>
                <View style={styles.atSquareBox}>
                  <Text style={styles.atSquareText}>@</Text>
                </View>
                <View style={styles.recipientTitleContent}>
                  <View style={styles.recipientTitleRow}>
                    <Text style={styles.recipientTitle}>RECIPIENT UPI ID</Text>
                    <Text style={styles.asterisk}>*</Text>
                  </View>
                  <Text
                    style={styles.recipientSubtitle}
                    numberOfLines={isSmallScreen ? 1 : 2}
                    ellipsizeMode="tail"
                  >
                    Virtual Payment Address (VPA) to receive funds
                  </Text>
                </View>
              </View>

              <View style={styles.requiredBadge}>
                <View style={styles.requiredDot} />
                <Text style={styles.requiredBadgeText}>REQUIRED</Text>
              </View>
            </View>

            {/* UPI Input with [UPI] Pill & Clear/Verified Badges */}
            <View
              style={[
                styles.upiInputWrapper,
                isUpiFocused && styles.upiInputWrapperFocused,
                !upiValidation.isValid && upiIdInput.length > 0 && styles.inputError,
                upiValidation.isValid && styles.inputSuccess,
              ]}
            >
              <View style={styles.upiPillBox}>
                <Text style={styles.upiPillText}>UPI</Text>
              </View>
              <TextInput
                style={styles.upiTextInput}
                value={upiIdInput}
                onChangeText={(text) => {
                  setUpiIdInput(text);
                  if (isGenerated) setIsGenerated(false);
                }}
                onFocus={() => setIsUpiFocused(true)}
                onBlur={() => setIsUpiFocused(false)}
                placeholder={isSmallScreen ? "e.g. store@upi or shop@bank" : "e.g. storename@okhdfcbank or merchant@ptaxis"}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Clear button when typed */}
              {upiIdInput.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setUpiIdInput('');
                    if (isGenerated) setIsGenerated(false);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ marginRight: 6 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}

              {/* Verified Green Tick when Valid */}
              {upiValidation.isValid ? (
                <Ionicons name="checkmark-circle" size={19} color="#16A34A" />
              ) : null}
            </View>

            {/* Dynamic Status / Helper Message Row */}
            {upiValidation.isValid ? (
              <View style={styles.upiStatusRow}>
                <Ionicons name="shield-checkmark" size={12} color="#16A34A" />
                <Text style={styles.upiStatusTextSuccess} numberOfLines={2}>Valid UPI ID · Ready for instant payment</Text>
              </View>
            ) : upiIdInput.trim().startsWith('@') ? (
              <View style={styles.upiStatusRow}>
                <Ionicons name="alert-circle-outline" size={12} color="#D97706" />
                <Text style={styles.upiStatusTextWarning} numberOfLines={2}>
                  Please enter your username or mobile number before "{upiIdInput.trim()}"
                </Text>
              </View>
            ) : upiIdInput.length > 0 && !upiIdInput.includes('@') ? (
              <View style={styles.upiStatusRow}>
                <Ionicons name="bulb-outline" size={12} color="#2563EB" />
                <Text style={styles.upiStatusTextHint} numberOfLines={2}>Tip: Select any bank handle below to auto-complete</Text>
              </View>
            ) : upiIdInput.length > 0 && !upiValidation.isValid ? (
              <View style={styles.upiStatusRow}>
                <Ionicons name="alert-circle-outline" size={12} color="#DC2626" />
                <Text style={styles.upiStatusTextError} numberOfLines={2}>{upiValidation.error || 'Enter a valid UPI ID (e.g. username@bank)'}</Text>
              </View>
            ) : null}

            {/* Popular Handles Row */}
            <View style={styles.popularHandlesSection}>
              <View style={styles.popularHandlesHeader}>
                <View style={styles.popularHandlesLeft}>
                  <Ionicons name="flash-outline" size={13} color="#2563EB" />
                  <Text style={styles.popularHandlesTitle}>QUICK BANK HANDLES</Text>
                </View>
                <Text style={styles.tapToFillText}>Tap to append</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.handlesScrollView}
              >
                {POPULAR_HANDLES.map((bank) => {
                  const isSelected = upiIdInput.endsWith(bank.handle);
                  return (
                    <TouchableOpacity
                      key={bank.id}
                      style={[styles.bankHandleChip, isSelected && styles.bankHandleChipActive]}
                      onPress={() => handleSelectHandle(bank.handle)}
                      activeOpacity={0.7}
                    >
                      <BankLogo id={bank.id as any} height={16} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* 2-Column Responsive Payee Name and Note */}
            <View style={[styles.twoColumnGrid, isSmallScreen && styles.twoColumnGridStacked]}>
              <View style={styles.gridColumn}>
                <Text style={styles.columnLabel}>PAYEE NAME (optional)</Text>
                <View style={styles.columnInputBox}>
                  <Ionicons name="person-outline" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.columnTextInput}
                    value={payeeNameInput}
                    onChangeText={setPayeeNameInput}
                    placeholder="e.g. Rahul Sharma"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              <View style={styles.gridColumn}>
                <Text style={styles.columnLabel}>PAYMENT NOTE (optional)</Text>
                <View style={styles.columnInputBox}>
                  <Ionicons name="document-text-outline" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
                  <TextInput
                    style={styles.columnTextInput}
                    value={noteInput}
                    onChangeText={setNoteInput}
                    placeholder="e.g. Order #101, Coffee"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Card 3: Split Payments Card */}
          <View style={styles.cardContainer}>
            <View style={styles.splitHeaderRow}>
              <View style={styles.splitHeaderLeft}>
                <LinearGradient
                  colors={['#3B82F6', '#2563EB']}
                  style={styles.splitIconCircle}
                >
                  <Ionicons name="git-network-outline" size={18} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={styles.splitTitleRow}>
                    <Text style={styles.splitHeaderTitle}>Split Payments</Text>
                    <View style={styles.maxLimitPill}>
                      <Text style={styles.maxLimitPillText}>Max ₹{effectiveMaxLimit.toLocaleString('en-IN')} / QR</Text>
                    </View>
                  </View>
                  <Text style={styles.splitHeaderSubtitle}>
                    Bypasses bank limits · multiple QRs ≤ ₹{effectiveMaxLimit.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              <Switch
                value={isSplitEnabled}
                onValueChange={setIsSplitEnabled}
                trackColor={{ false: '#E2E8F0', true: '#93C5FD' }}
                thumbColor={isSplitEnabled ? '#2563EB' : '#94A3B8'}
              />
            </View>

            {/* Split Options Accordion */}
            {isSplitEnabled && (
              <View style={styles.splitExpandedContainer}>
                {/* Section 1: Limit Presets */}
                <View style={styles.splitOptionSection}>
                  <View style={styles.splitSectionHeaderRow}>
                    <Text style={styles.splitSubLabel}>MAX LIMIT PER QR CODE</Text>
                    <Text style={styles.splitSubHint}>Select threshold</Text>
                  </View>
                  <View style={styles.limitChipsRow}>
                    {LIMIT_PRESETS.map((preset) => {
                      const isSelected = !isCustomLimit && selectedPresetLimit === preset.value;
                      return (
                        <TouchableOpacity
                          key={preset.value}
                          style={[styles.limitChip, isSelected && styles.limitChipActive]}
                          onPress={() => {
                            setIsCustomLimit(false);
                            setSelectedPresetLimit(preset.value);
                          }}
                          activeOpacity={0.7}
                        >
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={13} color="#2563EB" style={{ marginRight: 4 }} />
                          )}
                          <Text style={[styles.limitChipText, isSelected && styles.limitChipTextActive]}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={[styles.limitChip, isCustomLimit && styles.limitChipActive]}
                      onPress={() => setIsCustomLimit(true)}
                      activeOpacity={0.7}
                    >
                      {isCustomLimit && (
                        <Ionicons name="checkmark-circle" size={13} color="#2563EB" style={{ marginRight: 4 }} />
                      )}
                      <Text style={[styles.limitChipText, isCustomLimit && styles.limitChipTextActive]}>
                        Custom
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {isCustomLimit && (
                    <View style={styles.customLimitRow}>
                      <Text style={styles.customLimitPrefix}>₹</Text>
                      <TextInput
                        style={styles.customLimitInput}
                        value={customLimitInput}
                        onChangeText={setCustomLimitInput}
                        keyboardType="decimal-pad"
                        placeholder="e.g. 1999"
                        placeholderTextColor="#94A3B8"
                      />
                      <Text style={styles.customLimitSuffix}>max / QR</Text>
                    </View>
                  )}
                </View>

                {/* Section 2: Mode Selector */}
                <View style={[styles.splitOptionSection, { marginTop: 10 }]}>
                  <View style={styles.splitSectionHeaderRow}>
                    <Text style={styles.splitSubLabel}>SPLIT DISTRIBUTION MODE</Text>
                    <Text style={styles.splitSubHint}>How amount divides</Text>
                  </View>

                  <View style={styles.modeSegmentContainer}>
                    <TouchableOpacity
                      style={[styles.modeSegmentBtn, splitMode === 'greedy' && styles.modeSegmentBtnActive]}
                      onPress={() => setSplitMode('greedy')}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="flash-outline"
                        size={14}
                        color={splitMode === 'greedy' ? '#2563EB' : '#64748B'}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.modeSegmentText, splitMode === 'greedy' && styles.modeSegmentTextActive]}>
                        Max per QR (Greedy)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modeSegmentBtn, splitMode === 'equal' && styles.modeSegmentBtnActive]}
                      onPress={() => setSplitMode('equal')}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="git-compare-outline"
                        size={14}
                        color={splitMode === 'equal' ? '#2563EB' : '#64748B'}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.modeSegmentText, splitMode === 'equal' && styles.modeSegmentTextActive]}>
                        Equal Parts
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Action Button Row: Generate + Reset */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={handleGenerate}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.generateButtonGradient}
              >
                <Ionicons name="qr-code-outline" size={17} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.generateButtonText}>GENERATE PAYMENT QR →</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleReset}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={16} color="#64748B" style={{ marginRight: 4 }} />
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* ============================================================== */}
          {/* SECTION 2: THE GENERATED OUTPUT (MATCHING SCREENSHOT 2)       */}
          {/* ============================================================== */}
          {isGenerated && breakdown.parts.length > 0 && (
            <View ref={qrSectionRef} style={styles.generatedResultsSection}>
              {/* Output Card 1: Split Payment Parts Selector Tab Bar */}
              {breakdown.totalParts > 1 && (
                <View style={styles.cardContainer}>
                  <View style={styles.splitPartsHeader}>
                    <View style={styles.splitPartsHeaderLeft}>
                      <Ionicons name="sparkles-outline" size={16} color="#059669" />
                      <Text style={styles.splitPartsTitle}>
                        Split Payment ({breakdown.totalParts} QRs)
                      </Text>
                    </View>

                    <View style={styles.totalBadgePill}>
                      <Text style={styles.totalBadgePillText}>Total ₹{breakdown.totalAmountFormatted}</Text>
                    </View>
                  </View>

                  {/* Horizontal Tabs for Each Part */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.partsTabsScroll}
                  >
                    {breakdown.parts.map((part, idx) => {
                      const isActive = idx === activePartIndex;
                      return (
                        <TouchableOpacity
                          key={part.id}
                          style={[
                            styles.partTab,
                            isActive ? styles.partTabActive : styles.partTabInactive,
                          ]}
                          onPress={() => setActivePartIndex(idx)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.partTabTopRow}>
                            <Text style={[styles.partTabTitle, isActive && styles.partTabTitleActive]}>
                              Part {part.partIndex}
                            </Text>
                            <View
                              style={[
                                styles.partTabDot,
                                part.isPaid ? styles.partTabDotPaid : styles.partTabDotPending,
                              ]}
                            />
                          </View>
                          <Text style={[styles.partTabAmount, isActive && styles.partTabAmountActive]}>
                            ₹{part.amountFormatted}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Output Card 2: 1-Tap Device Checkout Banner */}
              {currentActivePart && (
                <View style={styles.cardContainer}>
                  <View style={styles.checkoutBannerHeader}>
                    <View style={styles.checkoutBadge}>
                      <Ionicons name="flash" size={12} color="#059669" style={{ marginRight: 4 }} />
                      <Text style={styles.checkoutBadgeText}>1-TAP DEVICE CHECKOUT</Text>
                    </View>

                    <View style={styles.directLaunchBadge}>
                      <Ionicons name="lock-closed" size={12} color="#0F172A" style={{ marginRight: 4 }} />
                      <Text style={styles.directLaunchText}>Direct App Launch</Text>
                    </View>
                  </View>

                  {/* Checkout Row */}
                  <View style={styles.checkoutContentRow}>
                    <View style={styles.phoneIconSquare}>
                      <Ionicons name="phone-portrait-outline" size={22} color="#059669" />
                    </View>

                    <View style={styles.checkoutTextColumn}>
                      <Text style={styles.checkoutPayTitle}>
                        PAY ₹{currentActivePart.amountFormatted}{' '}
                        <Text style={styles.checkoutPartTag}>
                          (Part {currentActivePart.partIndex}/{currentActivePart.totalParts})
                        </Text>
                      </Text>
                      <Text style={styles.checkoutSubtext} numberOfLines={1}>
                        Opens UPI app directly — no typing required
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.payNowButton}
                      onPress={() => handlePayNow(currentActivePart.upiUri)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.payNowButtonText}>PAY NOW ↗</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Supported Apps Footer */}
                  <View style={styles.supportedAppsRow}>
                    <Text style={styles.supportedAppsLabel}>SUPPORTED APPS:</Text>
                    <View style={styles.supportedAppsBadges}>
                      <BankLogo id="phonepe" width={62} height={20} />
                      <BankLogo id="bhim" width={56} height={20} />
                      <BankLogo id="paytm" width={56} height={20} />
                      <BankLogo id="gpay" width={58} height={20} />
                    </View>
                  </View>
                </View>
              )}

              {/* Output Card 3: The Main Rupeo Pass QR Ticket Card */}
              {currentActivePart && (
                <View style={styles.qrCardCenteringWrapper}>
                  <MultiPartQrCard
                    part={currentActivePart}
                    upiId={upiIdInput}
                    payeeName={payeeNameInput}
                    totalAmountFormatted={breakdown.totalAmountFormatted}
                    onTogglePaid={handleTogglePaid}
                    onSavePaymentCard={handleSaveCurrentPayment}
                    cardWidth={CARD_WIDTH}
                  />
                </View>
              )}

              {/* Dedicated "Save as Payment Card" Action Banner */}
              <TouchableOpacity
                style={styles.saveBillBannerBtn}
                onPress={handleSaveCurrentPayment}
                disabled={isSavingCard}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#1E40AF', '#2563EB']}
                  style={styles.saveBillBannerGradient}
                >
                  <View style={styles.saveBillBannerLeft}>
                    <View style={styles.saveBillIconCircle}>
                      <Ionicons name="bookmark" size={18} color="#38BDF8" />
                    </View>
                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <Text style={styles.saveBillTitle}>Save this Payment as Card</Text>
                      <Text style={styles.saveBillSubtitle}>
                        Store QR details & mark as Paid to auto-record in Rupeo
                      </Text>
                    </View>
                  </View>
                  <View style={styles.saveBillBadge}>
                    <Text style={styles.saveBillBadgeText}>
                      {isSavingCard ? 'Saving...' : 'SAVE 📑'}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {/* Share Breakdown Button */}
              {breakdown.totalParts > 1 && (
                <TouchableOpacity
                  style={styles.shareBreakdownFullBtn}
                  onPress={handleShareAll}
                  activeOpacity={0.85}
                >
                  <Ionicons name="share-social" size={17} color="#0F172A" style={{ marginRight: 8 }} />
                  <Text style={styles.shareBreakdownFullBtnText}>Share Entire Breakdown with All Links</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  flexOne: {
    flex: 1,
  },
  topNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNavTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topNavRedSquare: {
    width: 10,
    height: 10,
    backgroundColor: '#DC2626',
    borderRadius: 2,
  },
  topNavTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.8,
  },
  zeroFeesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 4,
  },
  zeroFeesBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 1,
    width: '100%',
  },
  cardHeaderSmall: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  cardHeaderDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 12,
  },
  amountHeroContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  amountHeroSymbol: {
    fontSize: 44,
    fontWeight: '700',
    color: '#374151',
    marginRight: 6,
  },
  amountHeroInput: {
    fontSize: 52,
    fontWeight: '900',
    color: '#111827',
    padding: 0,
    minWidth: 60,
    textAlign: 'left',
  },
  amountPresetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 6,
  },
  amountPresetChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.2,
    borderColor: '#E5E7EB',
  },
  amountPresetChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  amountPresetChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
  },
  amountPresetChipTextActive: {
    color: '#FFFFFF',
  },
  mdrInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 14,
  },
  mdrInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  mdrGreySquare: {
    width: 8,
    height: 8,
    backgroundColor: '#9CA3AF',
    borderRadius: 1,
  },
  mdrInfoText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  mdrDetailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  mdrDetailsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  mdrExpandedDetails: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  mdrExpandedHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  mdrFactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mdrFactBullet: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '900',
    marginRight: 6,
    lineHeight: 16,
  },
  mdrFactText: {
    flex: 1,
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  mdrFactBold: {
    fontWeight: '800',
    color: '#0F172A',
  },
  mdrSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 4,
  },
  mdrSummaryText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
    lineHeight: 15,
  },
  recipientHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recipientHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  atSquareBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.2,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  atSquareText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2563EB',
  },
  recipientTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipientTitleContent: {
    flex: 1,
    marginRight: 8,
  },
  recipientTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  asterisk: {
    fontSize: 13,
    fontWeight: '900',
    color: '#EF4444',
    marginLeft: 3,
  },
  recipientSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  requiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  requiredDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  requiredBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.6,
  },
  upiInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.4,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 48,
    marginBottom: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  upiInputWrapperFocused: {
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
    shadowColor: '#2563EB',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 2,
  },
  upiPillBox: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginRight: 9,
  },
  upiPillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4338CA',
    letterSpacing: 0.5,
  },
  upiTextInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  inputSuccess: {
    borderColor: '#16A34A',
  },
  upiStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  upiStatusTextSuccess: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
  },
  upiStatusTextWarning: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  upiStatusTextHint: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#2563EB',
  },
  upiStatusTextError: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#DC2626',
  },
  popularHandlesSection: {
    marginBottom: 12,
  },
  popularHandlesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  popularHandlesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  popularHandlesTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.6,
  },
  tapToFillText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  handlesScrollView: {
    paddingVertical: 3,
    paddingHorizontal: 2,
    gap: 8,
  },
  bankHandleChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingHorizontal: 13,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  bankHandleChipActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  twoColumnGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  twoColumnGridStacked: {
    flexDirection: 'column',
    gap: 10,
  },
  gridColumn: {
    flex: 1,
    minWidth: 0,
  },
  columnLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  columnInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 42,
  },
  columnTextInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    color: '#0F172A',
    padding: 0,
    fontWeight: '600',
  },
  splitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  splitHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  splitIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  splitTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  splitHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  maxLimitPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  maxLimitPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
  },
  splitHeaderSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  splitExpandedContainer: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  splitOptionSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  splitSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  splitSubLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  splitSubHint: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  limitChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  limitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  limitChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  limitChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  limitChipTextActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
  customLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1.2,
    borderColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  customLimitPrefix: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
    marginRight: 6,
  },
  customLimitInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    padding: 0,
  },
  customLimitSuffix: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  modeSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  modeSegmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 7,
  },
  modeSegmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  modeSegmentText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  modeSegmentTextActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  generateButton: {
    flex: 3,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#2563EB',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  generateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  generateButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  resetButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
  },
  generatedResultsSection: {
    marginTop: 10,
    gap: 14,
    width: '100%',
  },
  qrCardCenteringWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitPartsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  splitPartsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  splitPartsTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },
  totalBadgePill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  totalBadgePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#374151',
  },
  partsTabsScroll: {
    flexDirection: 'row',
    gap: 10,
  },
  partTab: {
    width: 120,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1.5,
  },
  partTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  partTabInactive: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  partTabTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  partTabTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4B5563',
  },
  partTabTitleActive: {
    color: '#E5E7EB',
  },
  partTabDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  partTabDotPaid: {
    backgroundColor: '#10B981',
  },
  partTabDotPending: {
    backgroundColor: '#10B981',
  },
  partTabAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  partTabAmountActive: {
    color: '#22C55E',
  },
  checkoutBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkoutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  checkoutBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.5,
  },
  directLaunchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  directLaunchText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  checkoutContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    marginBottom: 10,
    gap: 10,
  },
  phoneIconSquare: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  checkoutTextColumn: {
    flex: 1,
  },
  checkoutPayTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  checkoutPartTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  checkoutSubtext: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  payNowButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: '#2563EB',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  payNowButtonText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  supportedAppsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  supportedAppsLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  supportedAppsBadges: {
    flexDirection: 'row',
    gap: 10,
  },
  appBadge: {
    fontSize: 11,
    fontWeight: '800',
  },
  shareBreakdownFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  shareBreakdownFullBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  topTabContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  topTabSegment: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    gap: 6,
  },
  topTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  topTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  topTabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  topTabBtnTextActive: {
    color: '#2563EB',
    fontWeight: '900',
  },
  tabCounterBadge: {
    backgroundColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginLeft: 6,
  },
  tabCounterBadgeActive: {
    backgroundColor: '#EFF6FF',
  },
  tabCounterText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  tabCounterTextActive: {
    color: '#2563EB',
  },
  savedScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  savedFeedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  savedFeedTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  savedFeedSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loadingSavedContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingSavedText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  emptySavedContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginTop: 20,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  emptySavedIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptySavedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySavedSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#2563EB',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  emptyCreateBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  savedCardsList: {
    gap: 14,
  },
  saveBillBannerBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  saveBillBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  saveBillBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  saveBillIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBillTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  saveBillSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  saveBillBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBillBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
