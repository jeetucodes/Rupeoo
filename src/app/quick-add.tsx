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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? Colors.dark : Colors.light;

  const { user, settings } = useAuth();
  const { t } = useTranslation();
  const currency = settings?.currency === 'INR' ? '₹' : settings?.currency || '₹';

  // Determine initial type from query params ('expense' vs 'income')
  const initialType = (params.type || 'expense').toLowerCase() === 'income' ? 'credit' : 'debit';
  const [txType, setTxType] = useState<'debit' | 'credit'>(initialType);
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialType === 'credit' ? 'Salary' : 'Food');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [categories, setCategories] = useState<CategoryItem[]>(defaultCategories);
  const [transactions, setTransactions] = useState<any[]>([]);
  const amountInputRef = useRef<TextInput>(null);

  // Auto-focus amount field on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      amountInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Update selected category default when switching expense/income
  useEffect(() => {
    if (txType === 'credit' && selectedCategory === 'Food') {
      setSelectedCategory('Salary');
    } else if (txType === 'debit' && selectedCategory === 'Salary') {
      setSelectedCategory('Food');
    }
  }, [txType]);

  // Load user categories and recent transactions for smart frequency sorting
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

  // Handle hardware back button on Android
  useEffect(() => {
    const onBackPress = () => {
      handleClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  // Sort categories: recent & most-used first
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

      // Higher frequency first
      if (countB !== countA) {
        return countB - countA;
      }

      // If frequency equal, more recently used first
      const recA = recentOrderMap[catA] !== undefined ? recentOrderMap[catA] : 9999;
      const recB = recentOrderMap[catB] !== undefined ? recentOrderMap[catB] : 9999;
      return recA - recB;
    });
  }, [categories, transactions, txType]);

  const handleClose = () => {
    // If opened directly from home screen widget or shortcut, exit app cleanly
    if (router.canGoBack()) {
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
        visibilityTime: 1800,
      });

      // Small delay for user feedback before returning / exiting
      setTimeout(() => {
        handleClose();
      }, 350);
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
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity
            onPress={handleClose}
            style={[styles.iconButton, { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color={theme.text} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {t('quick_add_title')}
          </Text>

          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type Toggle: Expense / Income */}
          <View style={[styles.typeToggleContainer, { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' }]}>
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

          {/* Amount Input with Auto-focus */}
          <View style={[styles.amountCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
                  // Only allow valid numeric string
                  if (/^\d*\.?\d{0,2}$/.test(val)) {
                    setAmount(val);
                  }
                }}
                maxLength={9}
                selectionColor={activeColor}
              />
            </View>
          </View>

          {/* Category Chips (Most-used & Recent First) */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                CATEGORY
              </Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                (Most used first)
              </Text>
            </View>

            <View style={styles.chipsWrap}>
              {displayCategories.slice(0, 14).map((cat) => {
                const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();
                return (
                  <TouchableOpacity
                    key={cat.name}
                    onPress={() => setSelectedCategory(cat.name)}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? '#374151' : '#F1F5F9')
                          : (isDark ? '#1F2937' : '#FFFFFF'),
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
                      size={18}
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
            <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginBottom: 8 }]}>
              NOTE
            </Text>
            <View style={[styles.noteInputCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color={theme.textSecondary}
                style={{ marginRight: 10 }}
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
                <Ionicons name="checkmark-sharp" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.saveButtonText}>
                  {t('save')} {amount ? `${currency}${amount}` : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  scrollContent: {
    padding: 16,
  },
  typeToggleContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  typeToggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeToggleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  amountCard: {
    borderRadius: 0,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyPrefix: {
    fontSize: 32,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 36,
    fontWeight: '800',
    minWidth: 100,
    textAlign: 'center',
    padding: 0,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '500',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
  },
  categoryChipText: {
    fontSize: 13,
  },
  noteInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  noteInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  saveButton: {
    height: 52,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
