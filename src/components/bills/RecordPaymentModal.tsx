import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';

import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { RecurringBill, payRecurringBill } from '@/lib/database';
import { resolveBrandTheme } from '@/lib/billProviders';
import { formatCurrency } from '@/lib/formatCurrency';
import { triggerCalculatorActionVibration, triggerCalculatorKeyVibration } from '@/lib/sound';
import { getLocalDateString } from '@/lib/dateUtils';
import { BrandLogo } from './BrandLogo';

export interface RecordPaymentModalProps {
  visible: boolean;
  bill: RecurringBill | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const PAYMENT_MODES: Array<{ mode: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = [
  { mode: 'UPI', icon: 'flash', label: 'UPI' },
  { mode: 'Cash', icon: 'cash-outline', label: 'Cash' },
  { mode: 'Card', icon: 'card-outline', label: 'Card' },
  { mode: 'Bank', icon: 'business-outline', label: 'Bank' },
];

export function RecordPaymentModal({
  visible,
  bill,
  onClose,
  onSuccess,
}: RecordPaymentModalProps) {
  const { user, settings } = useAuth();
  const { t } = useTranslation();

  const [payMode, setPayMode] = useState<string>('UPI');
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState<string>('');
  const [isEditingAmount, setIsEditingAmount] = useState<boolean>(false);
  const [noteStr, setNoteStr] = useState<string>('');
  const [isYesterday, setIsYesterday] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Initialize or reset state when modal opens or bill changes
  useEffect(() => {
    if (visible && bill) {
      setPayMode('UPI');
      setProofImage(null);
      setAmountStr(bill.amount ? bill.amount.toString() : '');
      setIsEditingAmount(false);
      setNoteStr('');
      setIsYesterday(false);
      setFullscreenImage(null);
    }
  }, [visible, bill]);

  if (!visible || !bill) return null;

  const userCurrency = settings?.currency || 'INR';
  const brand = resolveBrandTheme(bill.provider, bill.brandColor, bill.brandBadge, bill.iconKey);

  // Payment Date Calculation
  const todayStr = getLocalDateString();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
  const activeDate = isYesterday ? yesterdayStr : todayStr;

  // Handle Photo from Camera
  const handleTakePhoto = async () => {
    triggerCalculatorKeyVibration();
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: t('permission_required') || 'Permission Required',
          text2: t('camera_permission_required') || 'Camera permission is required to take a photo',
        });
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const base64Uri = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setProofImage(base64Uri);
        Toast.show({
          type: 'success',
          text1: t('photo_attached_success') || 'Payment proof attached! 📸',
        });
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Camera Error',
        text2: 'Could not open camera',
      });
    }
  };

  // Handle Screenshot from Gallery
  const handlePickFromGallery = async () => {
    triggerCalculatorKeyVibration();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const base64Uri = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setProofImage(base64Uri);
        Toast.show({
          type: 'success',
          text1: t('photo_attached_success') || 'Payment proof attached! 📸',
        });
      }
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Gallery Error',
        text2: 'Could not select payment proof',
      });
    }
  };

  // Handle Payment Submission
  const handleConfirmPay = async () => {
    if (!user?.uid || !bill) return;

    triggerCalculatorActionVibration();
    const parsedAmount = parseFloat(amountStr);
    const finalAmount = !isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : bill.amount;

    setIsSaving(true);
    try {
      await payRecurringBill(
        user.uid,
        bill,
        payMode,
        proofImage || undefined,
        finalAmount,
        noteStr.trim() || undefined,
        activeDate,
        userCurrency
      );

      Toast.show({
        type: 'success',
        text1: 'Payment Recorded ✅',
        text2: `${bill.title} marked as paid & next cycle scheduled!`,
      });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Failed to Record Payment',
        text2: err?.message || 'Please try again',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const parsedAmount = parseFloat(amountStr);
  const displayAmount = !isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : bill.amount;

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.dismissOverlay}
            activeOpacity={1}
            onPress={onClose}
          />

          <View style={styles.sheetContainer}>
            {/* Top Drag Indicator Handle */}
            <View style={styles.dragHandle} />

            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconBadge}>
                  <Ionicons name="checkmark-done" size={20} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>{t('record_payment') || 'Record Payment & Proof'}</Text>
                  <Text style={styles.headerSub}>{t('record_payment_sub') || 'Mark bill as paid and save receipt proof'}</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Bill Hero Card */}
              <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <BrandLogo
                    id={brand.id}
                    color={brand.accent}
                    size={42}
                    iconKey={bill.iconKey}
                    badge={bill.brandBadge}
                  />

                  <View style={styles.heroMetaWrap}>
                    <Text style={styles.heroBillTitle} numberOfLines={1}>{bill.title}</Text>
                    <View style={styles.heroBadgesRow}>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>{bill.category || 'Bills'}</Text>
                      </View>
                      {bill.nextDueDate ? (
                        <View style={styles.dueDateBadge}>
                          <Ionicons name="calendar-outline" size={11} color="#64748B" style={{ marginRight: 3 }} />
                          <Text style={styles.dueDateText}>Due {bill.nextDueDate}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Amount Row with Quick Edit */}
                <View style={styles.heroAmountRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.amountLabel}>{t('amount_paid') || 'Amount Paid'}</Text>
                    {isEditingAmount ? (
                      <View style={styles.amountInputRow}>
                        <TextInput
                          style={styles.amountInput}
                          keyboardType="decimal-pad"
                          value={amountStr}
                          onChangeText={setAmountStr}
                          autoFocus
                          placeholder="0.00"
                          placeholderTextColor="#94A3B8"
                        />
                        <TouchableOpacity
                          style={styles.amountDoneBtn}
                          onPress={() => setIsEditingAmount(false)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.amountDisplayRow}>
                        <Text style={styles.heroAmountValue}>
                          {formatCurrency(displayAmount, userCurrency)}
                        </Text>
                        <TouchableOpacity
                          style={styles.editAmountIconBtn}
                          onPress={() => setIsEditingAmount(true)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Edit amount"
                        >
                          <Ionicons name="pencil" size={14} color="#6366F1" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={styles.renewalHintBadge}>
                    <Ionicons name="refresh-outline" size={13} color="#10B981" style={{ marginRight: 3 }} />
                    <Text style={styles.renewalHintText}>Auto-renews</Text>
                  </View>
                </View>
              </View>

              {/* Payment Mode Selection */}
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionLabel}>{t('payment_mode') || 'Payment Mode'}</Text>
                <View style={styles.paymentModesRow}>
                  {PAYMENT_MODES.map((item) => {
                    const isSelected = payMode === item.mode;
                    return (
                      <TouchableOpacity
                        key={item.mode}
                        style={[
                          styles.payModeChip,
                          isSelected && styles.payModeChipActive,
                        ]}
                        onPress={() => {
                          triggerCalculatorKeyVibration();
                          setPayMode(item.mode);
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Ionicons
                          name={item.icon}
                          size={16}
                          color={isSelected ? '#4F46E5' : '#64748B'}
                          style={{ marginRight: 5 }}
                        />
                        <Text
                          style={[
                            styles.payModeChipText,
                            isSelected && styles.payModeChipTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Payment Date Selection */}
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionLabel}>{t('payment_date') || 'Payment Date'}</Text>
                <View style={styles.dateSelectorRow}>
                  <TouchableOpacity
                    style={[
                      styles.datePill,
                      !isYesterday && styles.datePillActive,
                    ]}
                    onPress={() => {
                      triggerCalculatorKeyVibration();
                      setIsYesterday(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="today-outline"
                      size={15}
                      color={!isYesterday ? '#4F46E5' : '#64748B'}
                      style={{ marginRight: 5 }}
                    />
                    <Text style={[styles.datePillText, !isYesterday && styles.datePillTextActive]}>
                      Today ({todayStr})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.datePill,
                      isYesterday && styles.datePillActive,
                    ]}
                    onPress={() => {
                      triggerCalculatorKeyVibration();
                      setIsYesterday(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="time-outline"
                      size={15}
                      color={isYesterday ? '#4F46E5' : '#64748B'}
                      style={{ marginRight: 5 }}
                    />
                    <Text style={[styles.datePillText, isYesterday && styles.datePillTextActive]}>
                      Yesterday
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Payment Screenshot (Proof) Section */}
              <View style={styles.sectionWrap}>
                <View style={styles.proofHeaderRow}>
                  <Text style={styles.sectionLabel}>{t('payment_proof') || 'Payment Screenshot (Proof)'}</Text>
                  <Text style={styles.optionalTag}>(Optional)</Text>
                </View>

                {proofImage ? (
                  <View style={styles.attachedProofCard}>
                    <TouchableOpacity
                      style={styles.attachedProofRow}
                      onPress={() => setFullscreenImage(proofImage)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.thumbWrap}>
                        <Image source={{ uri: proofImage }} style={styles.thumbImg} resizeMode="cover" />
                        <View style={styles.thumbZoomOverlay}>
                          <Ionicons name="expand" size={11} color="#FFFFFF" />
                        </View>
                      </View>

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="checkmark-circle" size={15} color="#10B981" style={{ marginRight: 4 }} />
                          <Text style={styles.attachedProofTitle}>{t('screenshot_attached') || 'Screenshot Attached'}</Text>
                        </View>
                        <Text style={styles.attachedProofSub}>
                          {t('tap_to_zoom') || 'Tap photo to preview fullscreen'}
                        </Text>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                    </TouchableOpacity>

                    <View style={styles.proofActionsRow}>
                      <TouchableOpacity
                        style={styles.proofActionBtn}
                        onPress={handleTakePhoto}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="camera-outline" size={15} color="#4F46E5" style={{ marginRight: 4 }} />
                        <Text style={styles.proofActionBtnText}>Retake Photo</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.proofActionBtn}
                        onPress={handlePickFromGallery}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="images-outline" size={15} color="#4F46E5" style={{ marginRight: 4 }} />
                        <Text style={styles.proofActionBtnText}>Gallery</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.proofActionBtn, styles.removeActionBtn]}
                        onPress={() => {
                          triggerCalculatorKeyVibration();
                          setProofImage(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={15} color="#EF4444" style={{ marginRight: 4 }} />
                        <Text style={[styles.proofActionBtnText, { color: '#EF4444' }]}>{t('remove_proof') || 'Remove'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.uploadOptionsGrid}>
                    <TouchableOpacity
                      style={styles.uploadOptionTile}
                      onPress={handleTakePhoto}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Take Photo with Camera"
                    >
                      <View style={[styles.uploadTileIconWrap, { backgroundColor: '#EEF2FF' }]}>
                        <Ionicons name="camera" size={22} color="#4F46E5" />
                      </View>
                      <Text style={styles.uploadTileTitle}>{t('take_photo') || 'Take Photo'}</Text>
                      <Text style={styles.uploadTileSub}>Paper bill or slip</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.uploadOptionTile}
                      onPress={handlePickFromGallery}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Upload Screenshot from Gallery"
                    >
                      <View style={[styles.uploadTileIconWrap, { backgroundColor: '#F0FDF4' }]}>
                        <Ionicons name="image" size={22} color="#10B981" />
                      </View>
                      <Text style={styles.uploadTileTitle}>{t('choose_gallery') || 'Upload Screenshot'}</Text>
                      <Text style={styles.uploadTileSub}>UPI / App receipt</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Reference / Note Input */}
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionLabel}>{t('ref_or_note') || 'Ref No. / Note (Optional)'}</Text>
                <View style={styles.noteInputWrap}>
                  <Ionicons name="document-text-outline" size={17} color="#94A3B8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.noteInput}
                    value={noteStr}
                    onChangeText={setNoteStr}
                    placeholder={t('ref_placeholder') || 'e.g. UTR / Txn ID / Note'}
                    placeholderTextColor="#94A3B8"
                    maxLength={100}
                  />
                  {noteStr.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setNoteStr('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color="#CBD5E1" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Bottom Actions Bar */}
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={[styles.confirmBtn, isSaving && { opacity: 0.6 }]}
                onPress={handleConfirmPay}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.confirmGradient}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.confirmBtnText}>
                        {t('confirm_record_payment') || 'Confirm & Record Payment'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Fullscreen Proof Preview Modal */}
      <Modal
        visible={!!fullscreenImage}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenImage(null)}
      >
        <View style={styles.fullscreenModalBg}>
          <View style={styles.fullscreenTopBar}>
            <Text style={styles.fullscreenTopTitle}>Payment Screenshot</Text>
            <TouchableOpacity
              style={styles.fullscreenCloseBtn}
              onPress={() => setFullscreenImage(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.fullscreenImgContainer}
            activeOpacity={1}
            onPress={() => setFullscreenImage(null)}
          >
            {fullscreenImage && (
              <Image
                source={{ uri: fullscreenImage }}
                style={styles.fullscreenImg}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 12,
  },
  dragHandle: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  heroCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroMetaWrap: {
    flex: 1,
    marginLeft: 12,
  },
  heroBillTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  heroBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  dueDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  amountLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  amountDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAmountValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  editAmountIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInput: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    borderBottomWidth: 2,
    borderBottomColor: '#4F46E5',
    paddingVertical: 2,
    minWidth: 100,
  },
  amountDoneBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  renewalHintBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  renewalHintText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  sectionWrap: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  paymentModesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  payModeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  payModeChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  payModeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  payModeChipTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  dateSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  datePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  datePillActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  datePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  datePillTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  proofHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  optionalTag: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  uploadOptionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  uploadOptionTile: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  uploadTileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  uploadTileTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
    textAlign: 'center',
  },
  uploadTileSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  attachedProofCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  attachedProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbZoomOverlay: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderRadius: 8,
    padding: 3,
  },
  attachedProofTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  attachedProofSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  proofActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 10,
  },
  proofActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  removeActionBtn: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  proofActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  noteInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 7,
  },
  noteInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  confirmBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  confirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  fullscreenModalBg: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  fullscreenTopBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 25,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  fullscreenTopTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fullscreenCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImgContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImg: {
    width: '100%',
    height: '100%',
  },
});
