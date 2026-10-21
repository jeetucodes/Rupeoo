import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { resolveCurrency } from '@/lib/currencies';
import {
  getProvidersForRegion,
  getRegionPreset,
  resolveRegionFromCurrency,
  BrandProvider,
} from '@/lib/billProviders';
import {
  RecurringBill,
  CustomBillProvider,
  getCustomBillProviders,
  saveCustomBillProvider,
  deleteCustomBillProvider,
  saveRecurringBill,
  calculateNextMonthlyDueDate,
  calculateNextCycleDueDate,
  getRecurringBills,
} from '@/lib/database';
import { scheduleBillReminder } from '@/lib/notifications';
import { checkReminderLimit } from '@/lib/limits';
import { getLocalDateString, getRelativeDateString } from '@/lib/dateUtils';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';

import { ProviderSelector } from './ProviderSelector';
import { AmountSection } from './AmountSection';
import { RepeatSelector } from './RepeatSelector';
import { MoreOptionsAccordion } from './MoreOptionsAccordion';
import { CustomProviderModal } from './CustomProviderModal';

export interface BillFormSheetProps {
  visible: boolean;
  onClose: () => void;
  editingBill?: RecurringBill | null;
  onSaveSuccess?: (savedBill: RecurringBill) => void;
}

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const ICONS_3D = {
  calendar: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Spiral%20Calendar.png',
  sparkles: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Sparkles.png',
};

export function BillFormSheet({
  visible,
  onClose,
  editingBill,
  onSaveSuccess,
}: BillFormSheetProps) {
  const router = useRouter();
  const { user, settings, isPremium, appConfig } = useAuth();
  const { t } = useTranslation();

  const todayStr = useMemo(() => getLocalDateString(), []);

  // 1. Currency & Region derived from settings.currency (reactive, no cached useState)
  const resolvedCurrency = useMemo(
    () => resolveCurrency(settings?.currency),
    [settings?.currency]
  );
  const activeRegionCode = useMemo(
    () => resolveRegionFromCurrency(settings?.currency),
    [settings?.currency]
  );
  const activePreset = useMemo(
    () => getRegionPreset(activeRegionCode),
    [activeRegionCode]
  );
  const regionProviders = useMemo(
    () => getProvidersForRegion(activeRegionCode),
    [activeRegionCode]
  );

  // 2. Custom Providers State
  const [customProviders, setCustomProviders] = useState<CustomBillProvider[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [deleteCustomTarget, setDeleteCustomTarget] = useState<CustomBillProvider | null>(null);
  const [isDeletingCustom, setIsDeletingCustom] = useState(false);

  // 3. Form Field States (neutral / empty defaults)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [billTitle, setBillTitle] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCategory, setBillCategory] = useState('Bills');
  const [billType, setBillType] = useState<'monthly_date' | 'cycle_days'>('monthly_date');
  const [billDueDay, setBillDueDay] = useState(String(new Date().getDate()));
  const [isLastDayOfMonth, setIsLastDayOfMonth] = useState(new Date().getDate() === 31);
  const [billCycleDays, setBillCycleDays] = useState('28');
  const [billStartDate, setBillStartDate] = useState(todayStr);
  const [billNotes, setBillNotes] = useState('');
  const [billReminderDays, setBillReminderDays] = useState(3);
  const [billBrandColor, setBillBrandColor] = useState<string | undefined>(undefined);
  const [billBrandBadge, setBillBrandBadge] = useState<string | undefined>(undefined);
  const [billIconKey, setBillIconKey] = useState<string | undefined>(undefined);

  const [isSaving, setIsSaving] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  // 4. Calendar Picker Modal State (for recharge start date)
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calViewYear, setCalViewYear] = useState(new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(new Date().getMonth());

  // Load user's custom bill providers
  const loadCustomProviders = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const items = await getCustomBillProviders(user.uid);
      setCustomProviders(items || []);
    } catch {
      // Offline fallback
    }
  }, [user?.uid]);

  useEffect(() => {
    if (visible) {
      loadCustomProviders();
    }
  }, [visible, loadCustomProviders]);

  // Reset or prefill form when visible or editingBill changes
  useEffect(() => {
    if (!visible) return;

    if (editingBill) {
      // EDIT MODE: prefill with existing bill data
      setSelectedProviderId(editingBill.provider || 'custom');
      setBillTitle(editingBill.title || '');
      setBillAmount(editingBill.amount ? String(editingBill.amount) : '');
      setBillCategory(editingBill.category || 'Bills');
      setBillType(editingBill.type || 'monthly_date');
      setBillDueDay(editingBill.dueDay ? String(editingBill.dueDay) : '1');
      setIsLastDayOfMonth(editingBill.dueDay === 31);
      setBillCycleDays(editingBill.cycleDays ? String(editingBill.cycleDays) : '28');
      setBillStartDate(editingBill.startDate || todayStr);
      setBillNotes(editingBill.notes || '');
      setBillReminderDays(editingBill.autoReminderDays || editingBill.reminderDays || 3);
      setBillBrandColor(editingBill.brandColor);
      setBillBrandBadge(editingBill.brandBadge);
      setBillIconKey(editingBill.iconKey);
    } else {
      // ADD MODE: Neutral, empty defaults (no India-specific hardcoding)
      setSelectedProviderId(null);
      setBillTitle('');
      setBillAmount('');
      setBillCategory('Bills');
      setBillType('monthly_date');
      setBillDueDay(String(new Date().getDate()));
      setIsLastDayOfMonth(new Date().getDate() === 31);
      setBillCycleDays('28');
      setBillStartDate(todayStr);
      setBillNotes('');
      setBillReminderDays(3);
      setBillBrandColor(undefined);
      setBillBrandBadge(undefined);
      setBillIconKey(undefined);
    }
    setAmountError(null);
  }, [visible, editingBill, todayStr]);

  // Provider Selection Handler
  const handleSelectProvider = (p: BrandProvider | CustomBillProvider, isCustom = false) => {
    if (isCustom) {
      const cp = p as CustomBillProvider;
      setSelectedProviderId(cp.id ? `custom:${cp.id}` : `custom:${cp.normalizedName}`);
      setBillTitle(cp.name);
      setBillCategory(cp.category || 'Bills');
      setBillBrandColor(cp.color);
      setBillBrandBadge(Array.from(cp.name).slice(0, 4).join(''));
      setBillIconKey(cp.iconKey);
      setBillType('monthly_date');
    } else {
      const bp = p as BrandProvider;
      setSelectedProviderId(bp.id);
      setBillTitle(bp.name);
      setBillCategory(bp.category);
      setBillBrandColor(bp.color);
      setBillBrandBadge(bp.badge);
      setBillIconKey(bp.icon);
      setBillType(bp.type);
      if (bp.type === 'cycle_days') {
        setBillCycleDays(bp.cycleDays || '28');
      } else {
        setBillDueDay(bp.dueDay || '1');
        setIsLastDayOfMonth(bp.dueDay === '31');
      }
    }
  };

  // Custom Provider Save Handler
  const handleSaveCustomProvider = async (custom: {
    name: string;
    iconKey: string;
    color: string;
    category: string;
  }) => {
    if (!user?.uid) return;
    try {
      const saved = await saveCustomBillProvider(user.uid, {
        name: custom.name,
        normalizedName: custom.name.toLowerCase().trim().replace(/\s+/g, ' '),
        iconKey: custom.iconKey,
        color: custom.color,
        category: custom.category,
      });

      setCustomProviders(prev => [saved, ...prev]);
      handleSelectProvider(saved, true);
      Toast.show({
        type: 'success',
        text1: t('saved') || 'Saved',
        text2: `${custom.name} added to your providers`,
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not save custom provider',
      });
    }
  };

  // Custom Provider Delete Confirmation
  const handleConfirmDeleteCustom = async () => {
    if (!user?.uid || !deleteCustomTarget) return;
    const target = deleteCustomTarget;
    setIsDeletingCustom(true);

    // Optimistic removal from UI list
    const prevList = [...customProviders];
    setCustomProviders(prev => prev.filter(p => p.id !== target.id && p.normalizedName !== target.normalizedName));
    setDeleteCustomTarget(null);

    try {
      await deleteCustomBillProvider(user.uid, target.id || target.normalizedName);
      Toast.show({
        type: 'success',
        text1: t('deleted') || 'Deleted',
        text2: `${target.name} removed from your providers`,
      });
    } catch {
      // Rollback on error
      setCustomProviders(prevList);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not delete provider. Please try again.',
      });
    } finally {
      setIsDeletingCustom(false);
    }
  };

  // Live Next Due Date Calculation
  const livePreviewData = useMemo(() => {
    try {
      if (billType === 'monthly_date') {
        const day = isLastDayOfMonth ? 31 : (parseInt(billDueDay) || 1);
        const nextDue = calculateNextMonthlyDueDate(day);
        return {
          nextDue,
          desc: isLastDayOfMonth ? 'Repeats on last day of month' : `Repeats monthly on ${day}`,
        };
      } else {
        const cycle = parseInt(billCycleDays) || 28;
        const nextDue = calculateNextCycleDueDate(cycle, billStartDate || todayStr);
        return {
          nextDue,
          desc: `Repeats every ${cycle} days`,
        };
      }
    } catch {
      return { nextDue: todayStr, desc: 'Repeats monthly' };
    }
  }, [billType, billDueDay, isLastDayOfMonth, billCycleDays, billStartDate, todayStr]);

  // Calendar Helpers
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
    const totalDays = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    const cells: Array<{ dayNumber: number | null; dateStr: string | null }> = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push({ dayNumber: null, dateStr: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(calViewMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      cells.push({ dayNumber: d, dateStr: `${calViewYear}-${mStr}-${dStr}` });
    }
    return cells;
  }, [calViewYear, calViewMonth]);

  const handleSelectDateFromCalendar = (dateStr: string) => {
    setBillStartDate(dateStr);
    setCalendarModalVisible(false);
  };

  // Save Reminder Handler
  const handleSaveBill = async () => {
    if (!user?.uid) {
      Toast.show({ type: 'error', text1: 'Not signed in', text2: 'Please sign in to save reminders' });
      return;
    }

    const cleanTitle = billTitle.trim();
    if (!cleanTitle) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter a name for the reminder' });
      return;
    }

    const amt = parseFloat(billAmount.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) {
      setAmountError(t('enter_valid_amount') || 'Please enter a valid amount greater than 0');
      return;
    }

    // Limit check for free tier (only on creating new bills)
    if (!editingBill) {
      try {
        const existingBills = await getRecurringBills(user.uid);
        const isProOff = appConfig?.showSubscriptions === false || appConfig?.showProFeatures === false;
        const { allowed } = checkReminderLimit(isPremium, existingBills.length, isProOff);
        if (!allowed) {
          Toast.show({
            type: 'info',
            text1: 'Reminder Limit Reached',
            text2: 'Upgrade to Rupeo Pro for unlimited bill reminders',
          });
          router.push('/premium' as any);
          return;
        }
      } catch {
        // Continue if check fails offline
      }
    }

    try {
      setIsSaving(true);
      const matched = regionProviders.find(p => p.id === selectedProviderId);
      const finalColor = billBrandColor || matched?.color || '#6366F1';
      const finalBadge = billBrandBadge || matched?.badge || Array.from(cleanTitle).slice(0, 4).join('');
      const finalIconKey = billIconKey || matched?.icon;
      const finalProviderId = selectedProviderId || `custom:${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      const finalDueDay = billType === 'monthly_date' ? (isLastDayOfMonth ? 31 : (parseInt(billDueDay) || 1)) : undefined;
      const finalCycleDays = billType === 'cycle_days' ? (parseInt(billCycleDays) || 28) : undefined;
      const nextDue = livePreviewData.nextDue;

      const billData: RecurringBill = {
        id: editingBill?.id,
        title: cleanTitle,
        amount: Math.round(amt * 100) / 100,
        category: billCategory || matched?.category || 'Bills',
        type: billType,
        provider: finalProviderId,
        brandColor: finalColor,
        brandBadge: finalBadge,
        iconKey: finalIconKey,
        regionCode: activeRegionCode,
        dueDay: finalDueDay,
        cycleDays: finalCycleDays,
        startDate: billType === 'cycle_days' ? (billStartDate || todayStr) : todayStr,
        notes: billNotes.trim() || undefined,
        autoReminderDays: billReminderDays,
        reminderDays: billReminderDays,
        reminderEnabled: true,
        nextDueDate: nextDue,
      };

      await saveRecurringBill(user.uid, billData);

      scheduleBillReminder(
        billData.title,
        billData.amount,
        billData.nextDueDate,
        resolvedCurrency.symbol,
        user.uid,
        billData.autoReminderDays
      ).catch(() => {});

      Toast.show({
        type: 'success',
        text1: editingBill ? (t('updated') || 'Reminder Updated') : (t('saved') || 'Reminder Saved'),
        text2: `Next due: ${nextDue}`,
      });

      onSaveSuccess?.(billData);
      onClose();
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Could not save reminder. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const navigateToSettings = () => {
    onClose();
    router.push('/(tabs)/settings' as any);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <View style={styles.modalCard}>
            {/* Grab Handle */}
            <View style={styles.modalGrabHandle} />

            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {editingBill ? (t('edit_bill') || 'Edit Bill / Recharge') : (t('add_bill') || 'Add Bill / Recharge')}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {t('never_miss') || 'Never miss your next payment or recharge.'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.modalCloseIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Form Scrollable Body */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
            >
              {/* 1. What are you paying for? */}
              <ProviderSelector
                providers={regionProviders}
                regionProviders={regionProviders}
                savedCustomProviders={customProviders}
                customProviders={customProviders}
                selectedProviderId={selectedProviderId}
                onSelectProvider={handleSelectProvider}
                onPressAddCustom={() => setShowCustomModal(true)}
                onDeleteCustomProvider={(p) => setDeleteCustomTarget(p)}
                onLongPressCustomProvider={(p) => setDeleteCustomTarget(p)}
                currencyName={resolvedCurrency.name}
                currencySymbol={resolvedCurrency.symbol}
                onNavigateToSettings={navigateToSettings}
              />

              {/* 2. Amount */}
              <AmountSection
                amount={billAmount}
                onChangeAmount={(val) => {
                  setBillAmount(val);
                  if (amountError) setAmountError(null);
                }}
                currencySymbol={resolvedCurrency.symbol}
                quickAmounts={billType === 'cycle_days' ? activePreset.quickAmounts?.cycle_days : activePreset.quickAmounts?.monthly_date}
                error={amountError}
              />

              {/* 3. Repeats */}
              <RepeatSelector
                repeatType={billType}
                onChangeRepeatType={setBillType}
                dueDay={parseInt(billDueDay) || 1}
                onChangeDueDay={(d) => setBillDueDay(String(d))}
                isLastDayOfMonth={isLastDayOfMonth}
                onToggleLastDayOfMonth={setIsLastDayOfMonth}
                cycleDays={parseInt(billCycleDays) || 28}
                onChangeCycleDays={(c) => setBillCycleDays(String(c))}
                startDate={billStartDate}
                onPressPickStartDate={() => {
                  const activeStartDate = billStartDate || todayStr;
                  const selDate = new Date(activeStartDate);
                  if (!isNaN(selDate.getTime())) {
                    setCalViewYear(selDate.getFullYear());
                    setCalViewMonth(selDate.getMonth());
                  }
                  if (!billStartDate) {
                    setBillStartDate(todayStr);
                  }
                  setCalendarModalVisible(true);
                }}
                nextDueDate={livePreviewData.nextDue}
              />

              {/* 4. Live Next Due Line */}
              <View style={styles.liveNextDueRow}>
                <View style={styles.liveDueIconCircle}>
                  <Ionicons name="notifications" size={15} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liveDueLabel}>{t('next_due_label') || 'Next Due Date'}</Text>
                  <Text style={styles.liveDueDateText}>{livePreviewData.nextDue}</Text>
                </View>
                <Text style={styles.liveDueDescText}>{livePreviewData.desc}</Text>
              </View>

              {/* 5. More Options Accordion */}
              <MoreOptionsAccordion
                notes={billNotes}
                onChangeNotes={setBillNotes}
                reminderDays={billReminderDays}
                onChangeReminderDays={setBillReminderDays}
              />
            </ScrollView>

            {/* 6. Sticky Save Button */}
            <View style={styles.stickyFooter}>
              <TouchableOpacity
                style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
                onPress={handleSaveBill}
                disabled={isSaving}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('save_reminder') || 'Save Reminder'}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.saveBtnText}>
                      {editingBill ? (t('update_reminder') || 'Update Reminder') : (t('save_reminder') || 'Save Reminder')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Custom Provider Creation Modal */}
        <CustomProviderModal
          visible={showCustomModal}
          onClose={() => setShowCustomModal(false)}
          onSave={handleSaveCustomProvider}
          existingProviders={regionProviders}
          savedCustomProviders={customProviders}
        />

        {/* Delete Custom Provider Confirmation Dialog */}
        <ConfirmDialogModal
          visible={!!deleteCustomTarget}
          title={t('delete_provider_title') || 'Delete Provider?'}
          message={
            deleteCustomTarget
              ? (t('delete_provider_msg')
                  ? t('delete_provider_msg').replace('{name}', deleteCustomTarget.name)
                  : `Delete ${deleteCustomTarget.name}? Existing reminders using it will not be deleted.`)
              : ''
          }
          confirmText={t('delete') || 'Delete'}
          cancelText={t('cancel') || 'Cancel'}
          type="danger"
          loading={isDeletingCustom}
          onConfirm={handleConfirmDeleteCustom}
          onCancel={() => setDeleteCustomTarget(null)}
        />

        {/* Calendar Picker Modal for cycle start date */}
        <Modal
          visible={calendarModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setCalendarModalVisible(false)}
        >
          <View style={styles.calModalOverlay}>
            <View style={styles.calModalCard}>
              <View style={styles.calHeaderRow}>
                <TouchableOpacity
                  onPress={() => {
                    if (calViewMonth === 0) {
                      setCalViewMonth(11);
                      setCalViewYear(y => y - 1);
                    } else {
                      setCalViewMonth(m => m - 1);
                    }
                  }}
                  style={styles.calNavBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chevron-back" size={18} color="#0F172A" />
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ExpoImage
                    source={{ uri: ICONS_3D.calendar }}
                    style={{ width: 22, height: 22, marginRight: 6 }}
                    contentFit="contain"
                  />
                  <Text style={styles.calMonthYearTitle}>
                    {new Date(calViewYear, calViewMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    if (calViewMonth === 11) {
                      setCalViewMonth(0);
                      setCalViewYear(y => y + 1);
                    } else {
                      setCalViewMonth(m => m + 1);
                    }
                  }}
                  style={styles.calNavBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chevron-forward" size={18} color="#0F172A" />
                </TouchableOpacity>
              </View>

              {/* Quick Pills */}
              <View style={styles.calQuickRow}>
                <TouchableOpacity
                  style={[styles.calQuickPill, { flexDirection: 'row', alignItems: 'center' }]}
                  onPress={() => handleSelectDateFromCalendar(todayStr)}
                >
                  <ExpoImage source={{ uri: ICONS_3D.sparkles }} style={{ width: 12, height: 12, marginRight: 4 }} contentFit="contain" />
                  <Text style={styles.calQuickPillText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calQuickPill}
                  onPress={() => handleSelectDateFromCalendar(getRelativeDateString(-1))}
                >
                  <Text style={styles.calQuickPillText}>Yesterday</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calQuickPill}
                  onPress={() => handleSelectDateFromCalendar(getRelativeDateString(-3))}
                >
                  <Text style={styles.calQuickPillText}>3 Days Ago</Text>
                </TouchableOpacity>
              </View>

              {/* Weekdays */}
              <View style={styles.calWeekdaysRow}>
                {WEEKDAY_NAMES.map(w => (
                  <Text key={w} style={styles.calWeekdayText}>{w}</Text>
                ))}
              </View>

              {/* Days Grid */}
              <View style={styles.calGrid}>
                {calendarDays.map((item, idx) => {
                  if (!item.dayNumber || !item.dateStr) {
                    return <View key={`empty-${idx}`} style={styles.calDayCellEmpty} />;
                  }
                  const isSelected = (billStartDate || todayStr) === item.dateStr;
                  const isToday = todayStr === item.dateStr;
                  return (
                    <TouchableOpacity
                      key={item.dateStr}
                      style={[
                        styles.calDayCell,
                        isToday && styles.calDayCellToday,
                        isSelected && styles.calDayCellSelected,
                      ]}
                      onPress={() => handleSelectDateFromCalendar(item.dateStr!)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.calDayText,
                          isToday && styles.calDayTextToday,
                          isSelected && styles.calDayTextSelected,
                        ]}
                      >
                        {item.dayNumber}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.calCloseBtn}
                onPress={() => setCalendarModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.calCloseBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    width: '100%',
    maxHeight: '92%',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    maxHeight: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 20,
  },
  modalGrabHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  modalCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    maxHeight: 520,
  },
  scrollContent: {
    paddingVertical: 14,
  },
  liveNextDueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  liveDueIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  liveDueLabel: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  liveDueDateText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
    marginTop: 1,
  },
  liveDueDescText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#B45309',
  },
  stickyFooter: {
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  saveBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Calendar Modal Styles
  calModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  calModalCard: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 10,
  },
  calHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calMonthYearTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  calNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  calQuickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  calQuickPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  calQuickPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  calWeekdaysRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calWeekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDayCellEmpty: {
    width: `${100 / 7}%`,
    height: 38,
  },
  calDayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    marginVertical: 1,
  },
  calDayCellToday: {
    backgroundColor: '#EEF2FF',
  },
  calDayCellSelected: {
    backgroundColor: '#0F172A',
  },
  calDayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  calDayTextToday: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  calDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calCloseBtn: {
    marginTop: 14,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calCloseBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
});
