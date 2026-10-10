import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  BackHandler,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  insertTransaction,
  getUserCategories,
  getAllTransactions,
  CategoryItem,
  defaultCategories,
  KNOWN_INCOME_CATEGORY_NAMES,
} from '@/lib/database';
import { getLocalDateString, formatTime12Hour } from '@/lib/dateUtils';
import { triggerTransactionVibration } from '@/lib/sound';
import { syncWidgetWithTransactions } from '@/lib/widgetSync';

interface QuickCategory {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const DEFAULT_EXPENSE_CATEGORIES: QuickCategory[] = [
  { name: 'Food', icon: 'restaurant-outline', color: '#F97316' },
  { name: 'Groceries', icon: 'cart-outline', color: '#10B981' },
  { name: 'Travel', icon: 'car-outline', color: '#0EA5E9' },
  { name: 'Shopping', icon: 'bag-handle-outline', color: '#EC4899' },
  { name: 'Bills', icon: 'receipt-outline', color: '#8B5CF6' },
  { name: 'Entertainment', icon: 'film-outline', color: '#6366F1' },
  { name: 'Health', icon: 'medkit-outline', color: '#EF4444' },
  { name: 'Udhar', icon: 'people-outline', color: '#334155' },
  { name: 'Rent', icon: 'home-outline', color: '#14B8A6' },
  { name: 'Fuel', icon: 'flash-outline', color: '#EAB308' },
  { name: 'Others', icon: 'grid-outline', color: '#64748B' },
];

const DEFAULT_INCOME_CATEGORIES: QuickCategory[] = [
  { name: 'Salary', icon: 'briefcase-outline', color: '#10B981' },
  { name: 'Business', icon: 'trending-up-outline', color: '#059669' },
  { name: 'Freelance', icon: 'laptop-outline', color: '#0EA5E9' },
  { name: 'Investments', icon: 'bar-chart-outline', color: '#8B5CF6' },
  { name: 'Udhar', icon: 'people-outline', color: '#334155' },
  { name: 'Bonus', icon: 'gift-outline', color: '#F59E0B' },
  { name: 'Income', icon: 'wallet-outline', color: '#10B981' },
  { name: 'Others', icon: 'grid-outline', color: '#64748B' },
];

const PAYMENT_MODES = ['UPI', 'Cash', 'Card', 'Bank'] as const;

export default function QuickAddScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string; fromWidget?: string }>();
  const isFromWidget = params.fromWidget === '1' || !router.canGoBack();

  const { user, settings } = useAuth();
  const { t } = useTranslation();
  const currency = settings?.currency === 'INR' ? '₹' : settings?.currency || '₹';

  // Determine initial transaction type
  const rawType = (params.type || 'expense').toLowerCase();
  const isUdharType = rawType === 'udhar-given' || rawType === 'udhar-taken';
  const initialType: 'debit' | 'credit' =
    rawType === 'income' || rawType === 'udhar-taken' ? 'credit' : 'debit';

  const [txType, setTxType] = useState<'debit' | 'credit'>(initialType);
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    isUdharType ? 'Udhar' : initialType === 'credit' ? 'Salary' : 'Food'
  );
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState(
    rawType === 'udhar-given' ? 'Udhar Given' : rawType === 'udhar-taken' ? 'Udhar Taken' : ''
  );
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [isSaving, setIsSaving] = useState(false);

  const [categories, setCategories] = useState<CategoryItem[]>(defaultCategories);
  const [transactions, setTransactions] = useState<any[]>([]);
  const amountInputRef = useRef<TextInput>(null);

  // Auto-focus amount input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      amountInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Handle hardware back button
  useEffect(() => {
    const onBackPress = () => {
      handleClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isFromWidget]);

  // Load user categories & transaction history to sort recent/most-used categories first
  useEffect(() => {
    if (!user?.uid) return;
    Promise.all([
      getUserCategories(user.uid).catch(() => []),
      getAllTransactions(user.uid).catch(() => []),
    ]).then(([cats, txs]) => {
      if (cats && cats.length > 0) setCategories(cats);
      if (txs && txs.length > 0) setTransactions(txs);
    });
  }, [user?.uid]);

  // Switch default category when toggling type
  const handleTypeChange = (newType: 'debit' | 'credit') => {
    setTxType(newType);
    if (newType === 'credit') {
      if (selectedCategory === 'Food' || !selectedCategory) setSelectedCategory('Salary');
    } else {
      if (selectedCategory === 'Salary' || !selectedCategory) setSelectedCategory('Food');
    }
  };

  // Sort categories: recent & most-used first
  const displayCategories = useMemo(() => {
    const isExpense = txType === 'debit';
    const baseList: QuickCategory[] = isExpense
      ? [...DEFAULT_EXPENSE_CATEGORIES]
      : [...DEFAULT_INCOME_CATEGORIES];

    // Append custom categories from user's custom categories
    const existingNames = new Set(baseList.map((c) => c.name.toLowerCase()));
    (categories || []).forEach((c) => {
      const name = (c?.name || '').trim();
      const key = name.toLowerCase();
      if (!name || existingNames.has(key)) return;

      const isKnownIncome = KNOWN_INCOME_CATEGORY_NAMES.has(key);
      const isIncome = c.type === 'credit' || isKnownIncome;

      if (isExpense && !isIncome) {
        existingNames.add(key);
        baseList.push({
          name,
          icon: 'grid-outline',
          color: c.color || '#64748B',
        });
      } else if (!isExpense && isIncome) {
        existingNames.add(key);
        baseList.push({
          name,
          icon: 'grid-outline',
          color: c.color || '#64748B',
        });
      }
    });

    // Count frequency in recent transactions
    const freqMap: Record<string, number> = {};
    const recentIndexMap: Record<string, number> = {};

    (transactions || []).forEach((tx, idx) => {
      const cat = (tx.category || '').trim().toLowerCase();
      if (!cat) return;
      if ((isExpense && tx.type === 'debit') || (!isExpense && tx.type === 'credit')) {
        freqMap[cat] = (freqMap[cat] || 0) + 1;
        if (recentIndexMap[cat] === undefined) {
          recentIndexMap[cat] = idx;
        }
      }
    });

    return [...baseList].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      const countA = freqMap[nameA] || 0;
      const countB = freqMap[nameB] || 0;
      if (countB !== countA) return countB - countA;
      const recA = recentIndexMap[nameA] !== undefined ? recentIndexMap[nameA] : 9999;
      const recB = recentIndexMap[nameB] !== undefined ? recentIndexMap[nameB] : 9999;
      return recA - recB;
    });
  }, [categories, transactions, txType]);

  const handleClose = () => {
    if (isFromWidget) {
      if (Platform.OS === 'android') {
        BackHandler.exitApp();
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/dashboard');
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Enter valid amount',
        text2: 'Please enter an amount greater than 0',
      });
      return;
    }

    if (!user?.uid) {
      // Save pending destination and redirect to login
      const currentQuery = `type=${txType === 'credit' ? 'income' : 'expense'}`;
      await AsyncStorage.setItem('@rupeo_pending_redirect', `/quick-add?${currentQuery}`);
      Toast.show({
        type: 'info',
        text1: 'Login required',
        text2: 'Please log in to save transactions',
      });
      router.replace('/login');
      return;
    }

    try {
      setIsSaving(true);
      const now = new Date();
      const timeStr = formatTime12Hour(now);

      const payload = {
        amount: parsedAmount,
        type: txType,
        category: selectedCategory || (txType === 'credit' ? 'Salary' : 'Food'),
        description: note.trim() || null,
        merchant_name: note.trim() || null,
        date: selectedDate,
        time: timeStr,
        payment_mode: paymentMode,
        source: 'widget_quick_add',
        created_at: Date.now(),
      };

      // 1. Insert transaction (offline-first with auto-sync)
      await insertTransaction(user.uid, payload);
      triggerTransactionVibration();

      // 2. Build and update native widget snapshot immediately
      await syncWidgetWithTransactions(user.uid);

      // 3. Short success toast
      Toast.show({
        type: 'success',
        text1: `Saved ${currency}${parsedAmount}`,
        text2: `${selectedCategory} (${txType === 'credit' ? 'Income' : 'Expense'})`,
        visibilityTime: 1200,
      });

      // 4. Return to home screen or previous app
      setTimeout(() => {
        handleClose();
      }, 250);
    } catch (err: any) {
      console.error('[QuickAdd] Save error:', err);
      Toast.show({
        type: 'error',
        text1: 'Failed to save',
        text2: err?.message || 'Transaction could not be saved',
      });
      setIsSaving(false);
    }
  };

  const isExpense = txType === 'debit';
  const accentColor = isExpense ? '#EF4444' : '#10B981';
  const todayStr = getLocalDateString();
  const isDateToday = selectedDate === todayStr;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.closeButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color="#0F172A" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {isExpense ? 'Add Expense' : 'Add Income'}
        </Text>

        <TouchableOpacity
          onPress={() => {
            setAmount('');
            setNote('');
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.resetButton}
        >
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Large Amount Input */}
          <View style={styles.amountContainer}>
            <Text style={[styles.currencySymbol, { color: accentColor }]}>{currency}</Text>
            <TextInput
              ref={amountInputRef}
              value={amount}
              onChangeText={(val) => {
                const cleaned = val.replace(/[^0-9.]/g, '');
                setAmount(cleaned);
              }}
              placeholder="0"
              placeholderTextColor="#CBD5E1"
              keyboardType="decimal-pad"
              returnKeyType="done"
              style={[styles.amountInput, { color: accentColor }]}
              autoFocus
              maxLength={10}
            />
          </View>

          {/* 2. Type Toggle (Expense / Income) */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              onPress={() => handleTypeChange('debit')}
              style={[
                styles.togglePill,
                isExpense && { backgroundColor: '#EF4444' },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name="remove"
                size={16}
                color={isExpense ? '#FFFFFF' : '#64748B'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.toggleText, isExpense && styles.toggleTextActive]}>
                Expense
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleTypeChange('credit')}
              style={[
                styles.togglePill,
                !isExpense && { backgroundColor: '#10B981' },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name="add"
                size={16}
                color={!isExpense ? '#FFFFFF' : '#64748B'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.toggleText, !isExpense && styles.toggleTextActive]}>
                Income
              </Text>
            </TouchableOpacity>
          </View>

          {/* 3. Category Grid */}
          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {(() => {
              const topCats = displayCategories.slice(0, 12);
              const rows: (typeof topCats)[] = [];
              for (let i = 0; i < topCats.length; i += 3) {
                rows.push(topCats.slice(i, i + 3));
              }

              return rows.map((row, rowIdx) => (
                <View key={`qa-row-${rowIdx}`} style={styles.categoryGridRow}>
                  {row.map((cat) => {
                    const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={cat.name}
                        onPress={() => setSelectedCategory(cat.name)}
                        style={[
                          styles.categoryCard,
                          isSelected && {
                            borderColor: accentColor,
                            backgroundColor: isExpense ? '#FEF2F2' : '#F0FDF4',
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.categoryIconWrap,
                            { backgroundColor: isSelected ? accentColor : '#F1F5F9' },
                          ]}
                        >
                          <Ionicons
                            name={cat.icon as any}
                            size={18}
                            color={isSelected ? '#FFFFFF' : '#475569'}
                          />
                        </View>
                        <Text
                          style={[
                            styles.categoryName,
                            isSelected && { color: accentColor, fontWeight: '700' },
                          ]}
                          numberOfLines={1}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {row.length < 3 &&
                    Array.from({ length: 3 - row.length }).map((_, emptyIdx) => (
                      <View key={`qa-empty-${emptyIdx}`} style={styles.categoryCardPlaceholder} />
                    ))}
                </View>
              ));
            })()}
          </View>

          {/* 4. Date Chip */}
          <View style={styles.rowSection}>
            <Text style={styles.sectionLabel}>Date</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={styles.dateChip}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={16} color="#4F46E5" style={{ marginRight: 6 }} />
              <Text style={styles.dateChipText}>
                {isDateToday ? 'Today' : selectedDate}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={new Date(selectedDate)}
              mode="date"
              display="default"
              maximumDate={new Date()}
              onChange={(_event: any, dateVal?: Date) => {
                setShowDatePicker(false);
                if (dateVal) {
                  setSelectedDate(getLocalDateString(dateVal));
                }
              }}
            />
          )}

          {/* 5. Optional Note Field */}
          <Text style={styles.sectionLabel}>Note / Description</Text>
          <View style={styles.noteInputWrap}>
            <Ionicons name="create-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add note (optional)"
              placeholderTextColor="#94A3B8"
              style={styles.noteInput}
              returnKeyType="done"
              maxLength={60}
            />
          </View>

          {/* 6. Payment Mode Chips */}
          <Text style={styles.sectionLabel}>Payment Mode</Text>
          <View style={styles.paymentChipsRow}>
            {PAYMENT_MODES.map((mode) => {
              const isSelected = paymentMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setPaymentMode(mode)}
                  style={[
                    styles.paymentChip,
                    isSelected && styles.paymentChipActive,
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.paymentChipText,
                      isSelected && styles.paymentChipTextActive,
                    ]}
                  >
                    {mode}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* 7. Bottom Pinned Save Button */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving || !amount || parseFloat(amount) <= 0}
            style={[
              styles.saveButton,
              { backgroundColor: accentColor },
              (!amount || parseFloat(amount) <= 0 || isSaving) && styles.saveButtonDisabled,
            ]}
            activeOpacity={0.85}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>
                Save {isExpense ? 'Expense' : 'Income'}{' '}
                {amount && parseFloat(amount) > 0 ? `(${currency}${amount})` : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  resetButton: {
    padding: 4,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  currencySymbol: {
    fontSize: 34,
    fontWeight: '700',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '800',
    minWidth: 120,
    textAlign: 'center',
    padding: 0,
    margin: 0,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  togglePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  categoryGrid: {
    marginBottom: 16,
  },
  categoryGridRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    width: '100%',
  },
  categoryCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryCardPlaceholder: {
    flex: 1,
    minWidth: 0,
  },
  categoryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },
  rowSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  dateChipText: {
    fontSize: 13,
    fontWeight: '600',
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
    paddingVertical: 10,
    marginBottom: 18,
  },
  noteInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    padding: 0,
    margin: 0,
  },
  paymentChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  paymentChip: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  paymentChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  paymentChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  paymentChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
