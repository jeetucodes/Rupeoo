import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  BackHandler,
  useColorScheme,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  insertTransaction,
  getUserCategories,
  getAllTransactions,
  CategoryItem,
  defaultCategories,
} from '@/lib/database';
import { getLocalDateString, formatTime12Hour } from '@/lib/dateUtils';
import { triggerTransactionVibration } from '@/lib/sound';
import { Colors } from '@/constants/theme';
import CategoryIcon from '@/components/CategoryIcon';

const DEFAULT_INCOME_CATEGORIES: CategoryItem[] = [
  { name: 'Salary', icon: 'briefcase', color: '#10B981' },
  { name: 'Business', icon: 'trending-up', color: '#059669' },
  { name: 'Freelance', icon: 'laptop', color: '#0EA5E9' },
  { name: 'Investments', icon: 'bar-chart', color: '#8B5CF6' },
  { name: 'Income', icon: 'wallet', color: '#10B981' },
  { name: 'Others', icon: 'cube', color: '#64748B' },
];

export default function QuickAddScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; fromWidget?: string }>();
  const isFromWidget = params.fromWidget === '1' || !router.canGoBack();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? Colors.dark : Colors.light;

  const { user, settings } = useAuth();
  const { t } = useTranslation();
  const currency = settings?.currency === 'INR' ? '₹' : settings?.currency || '₹';

  const initialType = (params.type || 'expense').toLowerCase() === 'income' ? 'credit' : 'debit';
  const [txType, setTxType] = useState<'debit' | 'credit'>(initialType);
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialType === 'credit' ? 'Salary' : 'Food');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [categories, setCategories] = useState<CategoryItem[]>(defaultCategories);
  const [transactions, setTransactions] = useState<any[]>([]);
  const amountInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      amountInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (txType === 'credit' && selectedCategory === 'Food') {
      setSelectedCategory('Salary');
    } else if (txType === 'debit' && selectedCategory === 'Salary') {
      setSelectedCategory('Food');
    }
  }, [txType]);

  useEffect(() => {
    if (!user?.uid) return;

    Promise.all([
      getUserCategories(user.uid),
      getAllTransactions(user.uid),
    ])
      .then(([cats, txs]) => {
        if (cats && cats.length > 0) setCategories(cats);
        if (txs && txs.length > 0) setTransactions(txs);
      })
      .catch((err) => console.warn('[QuickAdd] Data load error:', err));
  }, [user?.uid]);

  useEffect(() => {
    const onBackPress = () => {
      handleClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  const displayCategories = useMemo(() => {
    const isExpense = txType === 'debit';
    const baseList = isExpense
      ? categories.filter((c) => c.type !== 'credit')
      : (() => {
          const customIncome = categories.filter((c) => c.type === 'credit');
          const existingNames = new Set(DEFAULT_INCOME_CATEGORIES.map((c) => c.name.toLowerCase()));
          const extra = customIncome.filter((c) => !existingNames.has(c.name.toLowerCase()));
          return [...DEFAULT_INCOME_CATEGORIES, ...extra];
        })();

    const freqMap: Record<string, number> = {};
    const recentOrderMap: Record<string, number> = {};

    (transactions || []).forEach((tx, idx) => {
      const cat = (tx.category || '').trim().toLowerCase();
      if (!cat) return;
      if ((isExpense && tx.type === 'debit') || (!isExpense && tx.type === 'credit')) {
        freqMap[cat] = (freqMap[cat] || 0) + 1;
        if (recentOrderMap[cat] === undefined) {
          recentOrderMap[cat] = idx;
        }
      }
    });

    return [...baseList].sort((a, b) => {
      const catA = a.name.trim().toLowerCase();
      const catB = b.name.trim().toLowerCase();

      const countA = freqMap[catA] || 0;
      const countB = freqMap[catB] || 0;

      if (countB !== countA) {
        return countB - countA;
      }

      const recA = recentOrderMap[catA] !== undefined ? recentOrderMap[catA] : 9999;
      const recB = recentOrderMap[catB] !== undefined ? recentOrderMap[catB] : 9999;
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
      if (Platform.OS === 'android') {
        BackHandler.exitApp();
      } else {
        router.replace('/(tabs)/dashboard');
      }
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Toast.show({
        type: 'error',
        text1: t('enter_amount'),
        text2: 'Please enter a valid amount greater than 0',
      });
      return;
    }

    if (!user?.uid) {
      Toast.show({
        type: 'error',
        text1: 'Authentication required',
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
        category: selectedCategory || (txType === 'credit' ? 'Salary' : 'Others'),
        description: note.trim() || null,
        merchant_name: note.trim() || null,
        date: getLocalDateString(now),
        time: timeStr,
        payment_mode: 'Cash',
        source: 'widget_quick_add',
        created_at: Date.now(),
      };

      await insertTransaction(user.uid, payload);
      triggerTransactionVibration();

      Toast.show({
        type: 'success',
        text1: `${t('direct_save_added')}: ${currency}${parsedAmount}`,
        text2: `${selectedCategory} (${txType === 'credit' ? 'Income' : 'Expense'})`,
        visibilityTime: 1500,
      });

      setTimeout(() => {
        handleClose();
      }, 300);
    } catch (err: any) {
      console.error('[QuickAdd] Save error:', err);
      Toast.show({
        type: 'error',
        text1: 'Error saving transaction',
        text2: err?.message || 'Please check your connection',
      });
      setIsSaving(false);
    }
  };

  const isExpense = txType === 'debit';
  const activeColor = isExpense ? '#EF4444' : '#10B981';

  return (
    <View style={styles.modalBackdrop}>
      {/* Tap backdrop to dismiss & exit cleanly */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={handleClose}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.dialogWrapper}
      >
        <View
          style={[
            styles.dialogCard,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderColor: isDark ? '#1E293B' : '#E2E8F0',
            },
          ]}
        >
          {/* Header Row: Type Toggle + Close button */}
          <View style={[styles.dialogHeader, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <View style={[styles.typeToggleContainer, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
              <TouchableOpacity
                onPress={() => setTxType('debit')}
                style={[
                  styles.typeToggleButton,
                  txType === 'debit' && {
                    backgroundColor: '#EF4444',
                    shadowColor: '#EF4444',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 3,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.typeToggleText,
                    { color: txType === 'debit' ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  {t('widget_add_expense')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setTxType('credit')}
                style={[
                  styles.typeToggleButton,
                  txType === 'credit' && {
                    backgroundColor: '#10B981',
                    shadowColor: '#10B981',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                    elevation: 3,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.typeToggleText,
                    { color: txType === 'credit' ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  {t('widget_add_income')}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleClose}
              style={[styles.closeButton, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Dialog Scrollable Body */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.dialogScrollBody}
            keyboardShouldPersistTaps="handled"
          >
            {/* Amount Input with Auto-focus */}
            <View
              style={[
                styles.amountCard,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}
            >
              <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>
                {txType === 'debit' ? 'EXPENSE AMOUNT' : 'INCOME AMOUNT'}
              </Text>
              <View style={styles.amountInputRow}>
                <Text style={[styles.currencyPrefix, { color: activeColor }]}>
                  {currency}
                </Text>
                <TextInput
                  ref={amountInputRef}
                  style={[styles.amountInput, { color: theme.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? '#4B5563' : '#9CA3AF'}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={(val) => {
                    if (/^\d*\.?\d{0,2}$/.test(val)) {
                      setAmount(val);
                    }
                  }}
                  maxLength={9}
                  selectionColor={activeColor}
                />
              </View>
            </View>

            {/* Category Chips */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                  CATEGORY
                </Text>
              </View>

              <View style={styles.chipsWrap}>
                {displayCategories.slice(0, 10).map((cat) => {
                  const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={cat.name}
                      onPress={() => setSelectedCategory(cat.name)}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: isSelected
                            ? (isDark ? '#374151' : '#E2E8F0')
                            : (isDark ? '#1E293B' : '#FFFFFF'),
                          borderColor: isSelected ? activeColor : (isDark ? '#374151' : '#E5E7EB'),
                          borderWidth: isSelected ? 2 : 1,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <CategoryIcon
                        categoryName={cat.name}
                        iconName={cat.icon}
                        color={isSelected ? activeColor : cat.color}
                        size={16}
                      />
                      <Text
                        style={[
                          styles.categoryChipText,
                          {
                            color: isSelected ? theme.text : theme.textSecondary,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Optional Note Field */}
            <View style={styles.sectionContainer}>
              <View
                style={[
                  styles.noteInputCard,
                  {
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    borderColor: isDark ? '#334155' : '#E2E8F0',
                  },
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={theme.textSecondary}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={[styles.noteInput, { color: theme.text }]}
                  placeholder={t('optional_note')}
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  value={note}
                  onChangeText={setNote}
                  maxLength={60}
                />
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving || !amount}
              style={[
                styles.saveButton,
                {
                  backgroundColor: activeColor,
                  opacity: isSaving || !amount ? 0.6 : 1,
                  shadowColor: activeColor,
                },
              ]}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.saveButtonText}>
                    {t('save')} {amount ? `${currency}${amount}` : ''}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  dialogWrapper: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'center',
  },
  dialogCard: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 26,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 20,
  },
  dialogHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogScrollBody: {
    padding: 16,
  },
  typeToggleContainer: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  typeToggleButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  amountCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 14,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyPrefix: {
    fontSize: 28,
    fontWeight: '900',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 32,
    fontWeight: '900',
    minWidth: 90,
    textAlign: 'center',
    padding: 0,
  },
  sectionContainer: {
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 5,
  },
  categoryChipText: {
    fontSize: 12,
  },
  noteInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  noteInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  saveButton: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
    marginTop: 4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
