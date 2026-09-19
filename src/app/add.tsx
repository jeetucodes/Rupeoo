import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { insertTransaction, getAllTransactions, getUserCategories, addCustomCategory, CategoryItem, defaultCategories } from '@/lib/database';
import { markFirstTransactionReviewPending, hasUserBeenPromptedForReview } from '@/lib/review';
import { useAuth } from '@/context/AuthContext';
import { showTransactionSaveAd, preloadTransactionSaveAd } from '@/lib/ads';
import { useTranslation } from '@/lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import CategoryIcon from '@/components/CategoryIcon';
import * as ImagePicker from 'expo-image-picker';
import { safeGoBack } from '@/lib/navigation';
import { formatTime12Hour, getLocalDateString, getRelativeDateString } from '@/lib/dateUtils';
import Toast from 'react-native-toast-message';
import { triggerTransactionVibration } from '@/lib/sound';
import DateTimePicker from '@react-native-community/datetimepicker';

// High-res 3D Fluent Emojis
const ICONS_3D = {
  expense: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Money%20with%20Wings.png',
  income: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Money%20Bag.png',
  sparkles: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Sparkles.png',
  fire: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Fire.png',
  upi: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/High%20Voltage.png',
  cash: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Dollar%20Banknote.png',
  card: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Credit%20Card.png',
  bank: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Bank.png',
  receipt: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Receipt.png',
  calendar: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Calendar.png',
  camera: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Camera.png',
  gallery: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Framed%20Picture.png',
  memo: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Memo.png',
};

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];

const PAYMENT_MODES = [
  { id: 'UPI', label: 'UPI', icon3d: ICONS_3D.upi, color: '#7C3AED' },
  { id: 'Cash', label: 'Cash', icon3d: ICONS_3D.cash, color: '#16A34A' },
  { id: 'Card', label: 'Card', icon3d: ICONS_3D.card, color: '#2563EB' },
  { id: 'Bank', label: 'Bank', icon3d: ICONS_3D.bank, color: '#D97706' },
];

const DEFAULT_INCOME_CATEGORIES: CategoryItem[] = [
  { name: 'Salary', icon: 'briefcase', color: '#10B981' },
  { name: 'Business', icon: 'trending-up', color: '#059669' },
  { name: 'Freelance', icon: 'laptop', color: '#0EA5E9' },
  { name: 'Investments', icon: 'bar-chart', color: '#8B5CF6' },
  { name: 'Income', icon: 'wallet', color: '#10B981' },
  { name: 'Other', icon: 'cube', color: '#64748B' },
];

const ADD_CAT_ICONS = [
  'briefcase',
  'trending-up',
  'wallet',
  'cash',
  'card',
  'laptop',
  'gift',
  'cube',
  'cart',
  'home',
  'fast-food',
  'cafe',
  'car',
  'medkit',
  'school',
  'barbell',
  'airplane',
  'film',
  'receipt',
  'beer',
  'heart',
  'flash',
  'shield-checkmark',
  'globe',
];

const ADD_CAT_COLORS = [
  '#10B981', // Emerald
  '#059669', // Deep Green
  '#0EA5E9', // Sky Blue
  '#2563EB', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#D97706', // Orange
  '#14B8A6', // Teal
  '#64748B', // Slate
];

export default function AddExpenseScreen() {
  const router = useRouter();
  const { user, settings, isPremium } = useAuth();
  const { t } = useTranslation();
  const curr = settings?.currency === 'INR' ? '₹' : (settings?.currency || '₹');

  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Food');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [categories, setCategories] = useState<CategoryItem[]>(defaultCategories);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Add Custom Category Modal (supports both Expense and Income!)
  const [addCatModalOpen, setAddCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('briefcase');
  const [newCatColor, setNewCatColor] = useState('#10B981');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Optional extra details
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Date management
  const todayStr = getLocalDateString();
  const yesterdayStr = getRelativeDateString(-1);
  const [date, setDate] = useState(todayStr);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [savedDetails, setSavedDetails] = useState({ amount: '', merchant: '', category: '', paymentMode: '' });

  // Animation refs
  const successScale = useRef(new Animated.Value(0.3)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successRingScale = useRef(new Animated.Value(0.6)).current;
  const successRingOpacity = useRef(new Animated.Value(1)).current;
  const successCheckScale = useRef(new Animated.Value(0.1)).current;
  const successContentY = useRef(new Animated.Value(20)).current;
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!isPremium) {
      preloadTransactionSaveAd();
    }
  }, [isPremium]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loadData = useCallback(() => {
    if (user?.uid) {
      Promise.all([
        getUserCategories(user.uid),
        getAllTransactions(user.uid),
      ])
        .then(([cats, txs]) => {
          if (cats && cats.length > 0) {
            setCategories(cats);
          }
          if (txs) {
            setTransactions(txs);
          }
        })
        .catch(console.error);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const isExpense = type === 'debit';
  const themeColor = isExpense ? '#EF4444' : '#10B981';

  // Category usage frequency map calculated from actual transactions
  const { expenseFreq, incomeFreq } = React.useMemo(() => {
    const expCounts: Record<string, number> = {};
    const incCounts: Record<string, number> = {};

    (transactions || []).forEach((tx) => {
      const cat = (tx.category || '').trim().toLowerCase();
      if (!cat) return;
      if (tx.type === 'credit') {
        incCounts[cat] = (incCounts[cat] || 0) + 1;
      } else {
        expCounts[cat] = (expCounts[cat] || 0) + 1;
      }
    });

    return { expenseFreq: expCounts, incomeFreq: incCounts };
  }, [transactions]);

  // Income categories: Default income categories + any custom income categories (type === 'credit')
  const incomeCategories = React.useMemo(() => {
    const customIncome = categories.filter((c) => c.type === 'credit');
    const existingNames = new Set(DEFAULT_INCOME_CATEGORIES.map((c) => c.name.toLowerCase()));
    const extra = customIncome.filter((c) => !existingNames.has(c.name.toLowerCase()));
    return [...DEFAULT_INCOME_CATEGORIES, ...extra];
  }, [categories]);

  // Expense categories: Default + custom expense categories (type !== 'credit')
  const expenseCategories = React.useMemo(() => {
    return categories.filter((c) => c.type !== 'credit');
  }, [categories]);

  // Most used categories appear in FIRST place / front dynamically!
  const sortedDisplayCategories = React.useMemo(() => {
    const list = isExpense ? [...expenseCategories] : [...incomeCategories];
    const freqMap = isExpense ? expenseFreq : incomeFreq;

    return list.sort((a, b) => {
      const countA = freqMap[a.name.trim().toLowerCase()] || 0;
      const countB = freqMap[b.name.trim().toLowerCase()] || 0;
      if (countB !== countA) {
        return countB - countA; // Most used category comes first!
      }
      return 0;
    });
  }, [isExpense, expenseCategories, incomeCategories, expenseFreq, incomeFreq]);

  // When switching type or when categories load, auto-select top used category if needed
  useEffect(() => {
    if (sortedDisplayCategories.length > 0) {
      const exists = sortedDisplayCategories.some(
        (c) => c.name.toLowerCase() === category.toLowerCase()
      );
      if (!exists) {
        setCategory(sortedDisplayCategories[0].name);
      }
    }
  }, [isExpense, sortedDisplayCategories]);

  const openAddCategoryModal = () => {
    setNewCatName('');
    setNewCatIcon(isExpense ? 'cart' : 'briefcase');
    setNewCatColor(isExpense ? '#EF4444' : '#10B981');
    setAddCatModalOpen(true);
  };

  const handleSaveCustomCategory = async () => {
    if (!newCatName.trim()) {
      Toast.show({ type: 'error', text1: 'Name Required', text2: 'Please enter category name' });
      return;
    }
    const trimmed = newCatName.trim();
    const catType = isExpense ? 'debit' : 'credit';
    const currentList = isExpense ? expenseCategories : incomeCategories;

    if (currentList.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      Toast.show({ type: 'error', text1: 'Already Exists', text2: `Category "${trimmed}" already exists` });
      return;
    }

    const newCatItem: CategoryItem = {
      name: trimmed,
      icon: newCatIcon,
      color: newCatColor,
      isCustom: true,
      type: catType,
    };

    try {
      setIsSavingCategory(true);
      if (user?.uid) {
        const docId = await addCustomCategory(user.uid, newCatItem);
        if (docId) newCatItem.id = docId;
      }
      setCategories((prev) => [...prev, newCatItem]);
      setCategory(trimmed);
      setAddCatModalOpen(false);
      setNewCatName('');
      Toast.show({
        type: 'success',
        text1: 'Category Added!',
        text2: `"${trimmed}" is selected for ${isExpense ? 'expense' : 'income'}`,
      });
    } catch (err: any) {
      console.error('Error saving custom category:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not save category' });
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleAmountChange = (val: string) => {
    const filtered = val.replace(/[^0-9.]/g, '');
    const parts = filtered.split('.');
    if (parts.length > 2) {
      setAmount(parts[0] + '.' + parts.slice(1).join('').replace(/\./g, ''));
    } else {
      setAmount(filtered);
    }
  };

  const addQuickAmount = (val: number) => {
    const current = parseFloat(amount) || 0;
    setAmount((current + val).toString());
  };


  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const base64Uri = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setReceiptImage(base64Uri);
      }
    } catch (err) {
      console.warn('Error picking image:', err);
      Toast.show({ type: 'error', text1: 'Photo Error', text2: 'Could not access photo library' });
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Toast.show({ type: 'error', text1: 'Permission Required', text2: 'Camera permission is required' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const base64Uri = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setReceiptImage(base64Uri);
      }
    } catch (err) {
      console.warn('Error taking photo:', err);
      Toast.show({ type: 'error', text1: 'Camera Error', text2: 'Could not open camera' });
    }
  };

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      Toast.show({ type: 'error', text1: 'Enter Amount', text2: 'Please enter a valid amount greater than 0' });
      return;
    }

    const finalMerchant = merchant.trim() || category || (isExpense ? 'Expense' : 'Income');

    try {
      setIsSaving(true);
      if (!user?.uid) throw new Error('Not logged in');

      // Check if this is the user's first transaction
      let isFirstTransaction = false;
      try {
        const alreadyPrompted = await hasUserBeenPromptedForReview(user.uid);
        if (!alreadyPrompted) {
          const existingTxs = await getAllTransactions(user.uid);
          isFirstTransaction = !existingTxs || existingTxs.length === 0;
        }
      } catch {
        // Safe fallback
      }

      const now = new Date();
      const timeStr = formatTime12Hour(now);

      await insertTransaction(user.uid, {
        date: date || todayStr,
        time: timeStr,
        amount: numAmount,
        type: type,
        merchant_name: finalMerchant,
        description: description.trim() || undefined,
        category: type === 'credit' && category === 'Food' ? 'Income' : category,
        payment_mode: paymentMode,
        receipt_image: receiptImage || null,
      });

      if (isFirstTransaction) {
        await markFirstTransactionReviewPending(user.uid);
      }

      setSavedDetails({
        amount: numAmount.toString(),
        merchant: finalMerchant,
        category: type === 'credit' && category === 'Food' ? 'Income' : category,
        paymentMode,
      });

      Keyboard.dismiss();
      triggerTransactionVibration().catch(() => {});
      setShowSaveSuccess(true);
      successScale.setValue(0);
      successOpacity.setValue(0);
      successRingScale.setValue(0.7);
      successRingOpacity.setValue(0.7);
      successCheckScale.setValue(0);
      successContentY.setValue(20);

      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(successRingScale, { toValue: 1.6, duration: 750, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(successRingOpacity, { toValue: 0, duration: 750, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.spring(successCheckScale, { toValue: 1, friction: 3.5, tension: 130, delay: 60, useNativeDriver: true }),
        Animated.spring(successContentY, { toValue: 0, friction: 7, tension: 85, delay: 100, useNativeDriver: true }),
      ]).start();

      successTimer.current = setTimeout(() => {
        if (isFirstTransaction) {
          // For the user's very first transaction, skip interstitial ad
          // and navigate back directly to trigger Google In-App Review
          safeGoBack(router);
        } else {
          showTransactionSaveAd(isPremium, () => {
            safeGoBack(router);
          }).catch(() => {
            safeGoBack(router);
          });
        }
      }, 950);
    } catch (error: any) {
      console.error('Failed to add transaction', error);
      Toast.show({ type: 'error', text1: 'Error', text2: error.message || 'Failed to save transaction' });
      setIsSaving(false);
    }
  };

  const displayCategories = isExpense
    ? categories
    : DEFAULT_INCOME_CATEGORIES;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* CLEAN TOP HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => safeGoBack(router)}
            style={styles.closeBtn}
            activeOpacity={0.7}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color="#0F172A" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>{t('add_transaction')}</Text>

          <TouchableOpacity
            onPress={() => router.push('/categories')}
            style={styles.headerCatsBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="grid-outline" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 110 : 130 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 3D EXPENSE / INCOME SWITCH */}
          <View style={styles.typeSwitchWrap}>
            <TouchableOpacity
              style={[
                styles.typeBtn,
                isExpense && styles.typeBtnExpenseActive,
              ]}
              onPress={() => {
                setType('debit');
                const topExpenseCat = expenseCategories[0]?.name || 'Food';
                setCategory(topExpenseCat);
              }}
              activeOpacity={0.85}
            >
              <ExpoImage
                source={{ uri: ICONS_3D.expense }}
                style={{ width: 18, height: 18, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={[styles.typeBtnText, isExpense && styles.typeBtnExpenseTextActive]}>
                {t('type_expense')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeBtn,
                !isExpense && styles.typeBtnIncomeActive,
              ]}
              onPress={() => {
                setType('credit');
                const topIncomeCat = incomeCategories[0]?.name || 'Salary';
                setCategory(topIncomeCat);
              }}
              activeOpacity={0.85}
            >
              <ExpoImage
                source={{ uri: ICONS_3D.income }}
                style={{ width: 18, height: 18, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={[styles.typeBtnText, !isExpense && styles.typeBtnIncomeTextActive]}>
                {t('type_income')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* AMOUNT INPUT CARD */}
          <View style={styles.amountCard}>
            <View
              style={[
                styles.amountBadge,
                { backgroundColor: isExpense ? '#FEF2F2' : '#ECFDF5', borderColor: isExpense ? '#FECACA' : '#A7F3D0' },
              ]}
            >
              <Text style={[styles.amountBadgeText, { color: isExpense ? '#DC2626' : '#059669' }]}>
                {isExpense ? t('money_spent_badge') : t('money_received_badge')}
              </Text>
            </View>

            <View style={styles.amountInputRow}>
              <Text style={[styles.currencyPrefix, { color: themeColor }]}>{curr}</Text>
              <TextInput
                style={[styles.hugeAmountInput, { color: themeColor }]}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#CBD5E1"
                value={amount}
                onChangeText={handleAmountChange}
                maxLength={10}
                autoFocus
              />
            </View>

            {/* QUICK AMOUNT CHIPS */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickAmountsRow}
            >
              {QUICK_AMOUNTS.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={styles.quickAmountPill}
                  onPress={() => addQuickAmount(q)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickAmountPillText}>+{curr}{q}</Text>
                </TouchableOpacity>
              ))}
              {amount !== '' && (
                <TouchableOpacity
                  style={styles.clearPill}
                  onPress={() => setAmount('')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="backspace-outline" size={14} color="#EF4444" style={{ marginRight: 3 }} />
                  <Text style={styles.clearPillText}>{t('clear_btn')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* 1. TITLE / PAYEE / SOURCE */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <ExpoImage
                source={{ uri: isExpense ? ICONS_3D.cash : ICONS_3D.income }}
                style={{ width: 16, height: 16, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.sectionTitle}>
                {isExpense ? 'Paid To / Spent On' : 'Received From / Source'}
              </Text>
            </View>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                placeholder={
                  isExpense
                    ? 'e.g. Starbucks, Amazon, Petrol, Dinner...'
                    : 'e.g. Salary, Client Payment, Rental, Dividend...'
                }
                placeholderTextColor="#94A3B8"
                value={merchant}
                onChangeText={setMerchant}
              />
              {merchant !== '' && (
                <TouchableOpacity onPress={() => setMerchant('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 2. CATEGORIES SELECTION (Most Used Categories First + Add Category Option for Income & Expense) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ExpoImage
                  source={{ uri: isExpense ? ICONS_3D.fire : ICONS_3D.sparkles }}
                  style={{ width: 16, height: 16, marginRight: 6 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
                <Text style={styles.sectionTitle}>{t('category_title')}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.addCategoryHeaderBtn,
                    {
                      backgroundColor: isExpense ? '#FEF2F2' : '#ECFDF5',
                      borderColor: isExpense ? '#FECACA' : '#A7F3D0',
                    },
                  ]}
                  onPress={openAddCategoryModal}
                  activeOpacity={0.75}
                >
                  <Ionicons name="add" size={13} color={isExpense ? '#DC2626' : '#059669'} />
                  <Text
                    style={[
                      styles.addCategoryHeaderBtnText,
                      { color: isExpense ? '#DC2626' : '#059669' },
                    ]}
                  >
                    + {t('add_btn')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/categories')} activeOpacity={0.7}>
                  <Text style={styles.manageLinkText}>{t('manage_btn')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesScroll}
            >
              {sortedDisplayCategories.map((cat) => {
                const isSelected = category.toLowerCase() === cat.name.toLowerCase();
                const catColor = cat.color || '#3B82F6';
                const usageCount = (isExpense ? expenseFreq : incomeFreq)[cat.name.trim().toLowerCase()] || 0;

                return (
                  <TouchableOpacity
                    key={cat.id || cat.name}
                    style={[
                      styles.categoryChip,
                      isSelected && {
                        borderColor: catColor,
                        backgroundColor: catColor + '15',
                      },
                    ]}
                    onPress={() => setCategory(cat.name)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.catIconWrap, { backgroundColor: catColor + '20' }]}>
                      <CategoryIcon
                        categoryName={cat.name}
                        iconName={cat.icon}
                        size={15}
                        color={catColor}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text
                        style={[
                          styles.categoryChipText,
                          isSelected && { color: '#0F172A', fontWeight: '800' },
                        ]}
                        numberOfLines={1}
                      >
                        {cat.name}
                      </Text>
                      {usageCount > 0 && (
                        <Text style={styles.catUsageBadge}>
                          {usageCount}x
                        </Text>
                      )}
                    </View>
                    {isSelected && (
                      <View style={[styles.checkDot, { backgroundColor: catColor }]}>
                        <Ionicons name="checkmark" size={9} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* QUICK ADD CATEGORY TILE CHIP */}
              <TouchableOpacity
                style={[
                  styles.addCategoryChip,
                  { borderColor: isExpense ? '#FECACA' : '#A7F3D0' },
                ]}
                onPress={openAddCategoryModal}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="add"
                  size={15}
                  color={isExpense ? '#DC2626' : '#059669'}
                  style={{ marginRight: 3 }}
                />
                <Text
                  style={[
                    styles.addCategoryChipText,
                    { color: isExpense ? '#DC2626' : '#059669' },
                  ]}
                >
                  + New
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* 3. PAYMENT MODE */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <ExpoImage
                source={{ uri: ICONS_3D.card }}
                style={{ width: 16, height: 16, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.sectionTitle}>{isExpense ? t('payment_via') : t('received_in')}</Text>
            </View>
            <View style={styles.paymentRow}>
              {PAYMENT_MODES.map((pm) => {
                const isSelected = paymentMode === pm.id;
                const modeKey = ('mode_' + pm.id.toLowerCase());
                const translatedLabel = t(modeKey) !== modeKey ? t(modeKey) : pm.label;
                return (
                  <TouchableOpacity
                    key={pm.id}
                    style={[
                      styles.paymentPill,
                      isSelected && {
                        borderColor: pm.color,
                        backgroundColor: pm.color + '15',
                      },
                    ]}
                    onPress={() => setPaymentMode(pm.id)}
                    activeOpacity={0.75}
                  >
                    <ExpoImage
                      source={{ uri: pm.icon3d }}
                      style={{ width: 18, height: 18, marginRight: 5 }}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                    <Text
                      style={[
                        styles.paymentPillText,
                        isSelected && { color: pm.color, fontWeight: '800' },
                      ]}
                    >
                      {translatedLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 4. PHOTO (RECEIPT / BILL) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <ExpoImage
                source={{ uri: ICONS_3D.receipt }}
                style={{ width: 16, height: 16, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.sectionTitle}>{t('receipt_photo')}</Text>
            </View>

            {receiptImage ? (
              <View style={styles.receiptAttachedBox}>
                <TouchableOpacity
                  style={styles.receiptThumbRow}
                  onPress={() => setPreviewModalOpen(true)}
                  activeOpacity={0.8}
                >
                  <ExpoImage source={{ uri: receiptImage }} style={styles.receiptThumb} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.receiptAttachedTitle}>{t('receipt_attached')}</Text>
                    <Text style={styles.receiptAttachedSub}>{t('tap_to_preview')}</Text>
                  </View>
                  <Ionicons name="eye-outline" size={18} color="#2563EB" />
                </TouchableOpacity>

                <View style={styles.receiptActionsRow}>
                  <TouchableOpacity style={styles.receiptActionBtn} onPress={pickImage}>
                    <Ionicons name="swap-horizontal" size={13} color="#2563EB" style={{ marginRight: 3 }} />
                    <Text style={styles.receiptActionText}>{t('replace_btn')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.receiptActionBtn}
                    onPress={() => setReceiptImage(null)}
                  >
                    <Ionicons name="trash-outline" size={13} color="#EF4444" style={{ marginRight: 3 }} />
                    <Text style={[styles.receiptActionText, { color: '#EF4444' }]}>{t('remove')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.photoButtonsRow}>
                <TouchableOpacity style={styles.photoBtn} onPress={pickImage} activeOpacity={0.7}>
                  <ExpoImage
                    source={{ uri: ICONS_3D.gallery }}
                    style={{ width: 18, height: 18, marginRight: 5 }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                  <Text style={styles.photoBtnText}>{t('gallery_photo')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} activeOpacity={0.7}>
                  <ExpoImage
                    source={{ uri: ICONS_3D.camera }}
                    style={{ width: 18, height: 18, marginRight: 5 }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                  <Text style={styles.photoBtnText}>{t('take_camera')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 5. DATE SELECTION */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <ExpoImage
                source={{ uri: ICONS_3D.calendar }}
                style={{ width: 16, height: 16, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.sectionTitle}>{t('transaction_date')}</Text>
            </View>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.datePill, date === todayStr && styles.datePillActive]}
                onPress={() => setDate(todayStr)}
                activeOpacity={0.7}
              >
                <Text style={[styles.datePillText, date === todayStr && styles.datePillTextActive]}>
                  {t('today')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.datePill, date === yesterdayStr && styles.datePillActive]}
                onPress={() => setDate(yesterdayStr)}
                activeOpacity={0.7}
              >
                <Text style={[styles.datePillText, date === yesterdayStr && styles.datePillTextActive]}>
                  {t('yesterday')}
                </Text>
              </TouchableOpacity>

              {Platform.OS === 'web' ? (
                /* @ts-ignore */
                <input
                  type="date"
                  value={date}
                  onChange={(e: any) => setDate(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: date !== todayStr && date !== yesterdayStr ? '#2563EB' : '#E2E8F0',
                    outline: 'none',
                    fontSize: 12,
                    fontWeight: '600',
                    color: '#0F172A',
                    backgroundColor: date !== todayStr && date !== yesterdayStr ? '#EFF6FF' : '#F8FAFC',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.datePill,
                    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
                    date !== todayStr && date !== yesterdayStr && styles.datePillActive,
                  ]}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={13}
                    color={date !== todayStr && date !== yesterdayStr ? '#FFFFFF' : '#475569'}
                    style={{ marginRight: 3 }}
                  />
                  <Text
                    style={[
                      styles.datePillText,
                      date !== todayStr && date !== yesterdayStr && styles.datePillTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {date !== todayStr && date !== yesterdayStr ? date : t('custom_date_btn')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={date ? new Date(date) : new Date()}
                mode="date"
                display="default"
                maximumDate={new Date(Date.now() + 365 * 86400000)}
                onChange={(event: any, selectedDate?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (event.type === 'set' && selectedDate) {
                    const year = selectedDate.getFullYear();
                    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(selectedDate.getDate()).padStart(2, '0');
                    setDate(`${year}-${month}-${day}`);
                  }
                }}
              />
            )}
          </View>

          {/* 6. NOTE (REMARKS) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <ExpoImage
                source={{ uri: ICONS_3D.memo }}
                style={{ width: 16, height: 16, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.sectionTitle}>Note (Optional)</Text>
            </View>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                placeholder="Add details, bill numbers, remarks..."
                placeholderTextColor="#94A3B8"
                value={description}
                onChangeText={setDescription}
              />
              {description !== '' && (
                <TouchableOpacity onPress={() => setDescription('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>

        {/* BOTTOM FIXED SAVE BUTTON */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, (!amount || parseFloat(amount) <= 0) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSaving || !amount || parseFloat(amount) <= 0}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={
                isExpense
                  ? ['#EF4444', '#DC2626']
                  : ['#10B981', '#059669']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtnGradient}
            >
              <ExpoImage
                source={{ uri: isExpense ? ICONS_3D.expense : ICONS_3D.income }}
                style={{ width: 18, height: 18, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.saveBtnText}>
                {isSaving
                  ? t('saving_transaction')
                  : `${isExpense ? t('save_expense') : t('save_income')} ${amount ? `• ${curr}${amount}` : ''}`}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* FULLSCREEN SUCCESS TICK ANIMATION */}
      <Modal visible={showSaveSuccess} transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <SafeAreaView style={styles.fullscreenSuccessContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
          
          <View style={styles.fullscreenSuccessCenter}>
            <Animated.View
              style={[
                styles.fullscreenSuccessRing,
                {
                  opacity: successRingOpacity,
                  transform: [{ scale: successRingScale }],
                },
              ]}
            />

            <Animated.View
              style={[
                styles.fullscreenCheckCircle,
                {
                  opacity: successOpacity,
                  transform: [{ scale: successScale }],
                },
              ]}
            >
              <Animated.View style={{ transform: [{ scale: successCheckScale }] }}>
                <Ionicons name="checkmark" size={54} color="#FFFFFF" />
              </Animated.View>
            </Animated.View>

            <Animated.View
              style={[
                styles.fullscreenContentWrap,
                {
                  opacity: successOpacity,
                  transform: [{ translateY: successContentY }],
                },
              ]}
            >
              <Text style={styles.fullscreenSuccessTitle}>
                {isExpense ? t('paid_successfully') : t('received_successfully')}
              </Text>

              <Text style={styles.fullscreenSuccessAmount}>
                {curr}{Number(savedDetails.amount || amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>

              <Text style={styles.fullscreenSuccessMerchant} numberOfLines={1}>
                {savedDetails.merchant || merchant || 'Transaction'}
              </Text>

              <View style={styles.fullscreenSuccessBadge}>
                <Text style={styles.fullscreenSuccessBadgeText}>
                  {savedDetails.paymentMode || paymentMode} • {savedDetails.category || category}
                </Text>
              </View>
            </Animated.View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* RECEIPT PREVIEW MODAL */}
      <Modal visible={previewModalOpen} transparent animationType="fade" onRequestClose={() => setPreviewModalOpen(false)}>
        <View style={styles.previewModalBg}>
          <View style={styles.previewTopBar}>
            <Text style={styles.previewTitle}>{t('attached_receipt')}</Text>
            <TouchableOpacity onPress={() => setPreviewModalOpen(false)} style={styles.previewCloseBtn}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.previewImgContainer}>
            {receiptImage && (
              <ExpoImage source={{ uri: receiptImage }} style={styles.previewFullImg} contentFit="contain" />
            )}
          </View>
        </View>
      </Modal>

      {/* ADD CUSTOM CATEGORY MODAL (EXPENSE & INCOME) */}
      <Modal
        visible={addCatModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddCatModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.addCatModalCard}>
            <View style={styles.addCatModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ExpoImage
                  source={{ uri: isExpense ? ICONS_3D.expense : ICONS_3D.income }}
                  style={{ width: 22, height: 22, marginRight: 8 }}
                  contentFit="contain"
                />
                <Text style={styles.addCatModalTitle}>
                  {isExpense ? 'New Expense Category' : 'New Income Category'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setAddCatModalOpen(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Category Name Input */}
              <Text style={styles.modalInputLabel}>{t('category')} Name</Text>
              <TextInput
                style={styles.modalTextInput}
                placeholder={isExpense ? 'e.g. Pet, Gaming, Maintenance' : 'e.g. Rental, Dividend, Bonus, Stipend'}
                placeholderTextColor="#94A3B8"
                value={newCatName}
                onChangeText={setNewCatName}
                autoFocus
              />

              {/* Icon Selector */}
              <Text style={styles.modalInputLabel}>Choose Icon</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.addCatIconsScroll}>
                {ADD_CAT_ICONS.map((ico) => {
                  const isSel = newCatIcon === ico;
                  return (
                    <TouchableOpacity
                      key={ico}
                      style={[
                        styles.addCatIconCell,
                        isSel && { borderColor: newCatColor, backgroundColor: newCatColor + '20' },
                      ]}
                      onPress={() => setNewCatIcon(ico)}
                      activeOpacity={0.75}
                    >
                      <CategoryIcon
                        categoryName={ico}
                        iconName={ico}
                        size={22}
                        color={isSel ? newCatColor : '#64748B'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Color Selector */}
              <Text style={styles.modalInputLabel}>Choose Color</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.addCatColorsRow}>
                {ADD_CAT_COLORS.map((col) => {
                  const isSel = newCatColor === col;
                  return (
                    <TouchableOpacity
                      key={col}
                      style={[styles.addCatColorDot, { backgroundColor: col }]}
                      onPress={() => setNewCatColor(col)}
                      activeOpacity={0.75}
                    >
                      {isSel && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Save Category Button */}
              <TouchableOpacity
                style={[styles.addCatSaveBtn, isSavingCategory && { opacity: 0.7 }]}
                onPress={handleSaveCustomCategory}
                disabled={isSavingCategory}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={isExpense ? ['#EF4444', '#DC2626'] : ['#10B981', '#059669']}
                  style={styles.addCatSaveGradient}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.addCatSaveText}>
                    {isSavingCategory ? 'Saving...' : 'Save Category'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerCatsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 24,
  },
  typeSwitchWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 9,
  },
  typeBtnExpenseActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#DC2626',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1.5 },
    shadowRadius: 4,
    elevation: 2,
  },
  typeBtnIncomeActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1.5 },
    shadowRadius: 4,
    elevation: 2,
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  typeBtnExpenseTextActive: {
    color: '#DC2626',
    fontWeight: '800',
  },
  typeBtnIncomeTextActive: {
    color: '#059669',
    fontWeight: '800',
  },

  // Amount Card
  amountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  amountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  amountBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  currencyPrefix: {
    fontSize: 28,
    fontWeight: '900',
    marginRight: 4,
  },
  hugeAmountInput: {
    fontSize: 36,
    fontWeight: '900',
    minWidth: 90,
    textAlign: 'center',
    paddingVertical: 0,
    height: 44,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    gap: 6,
  },
  quickAmountPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickAmountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  clearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },

  // Section Cards
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 11,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0.2,
  },
  manageLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  addCategoryHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  addCategoryHeaderBtnText: {
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 2,
  },
  addCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginRight: 4,
    height: 34,
  },
  addCategoryChipIcon: {
    marginRight: 3,
  },
  addCategoryChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  catUsageBadge: {
    fontSize: 8,
    fontWeight: '800',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 3,
  },

  // Categories
  categoriesScroll: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    height: 34,
  },
  catIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  categoryChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  checkDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  // Note & Title Input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 40,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },

  // Payment Modes
  paymentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  paymentPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  paymentPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },

  // More Options Accordion
  moreOptionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
    marginBottom: 10,
  },
  moreOptionsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 6,
  },
  datePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  datePillActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  datePillTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  customDateInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    fontSize: 11,
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  photoBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  receiptAttachedBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  receiptThumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  receiptAttachedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  receiptAttachedSub: {
    fontSize: 10,
    color: '#64748B',
  },
  receiptActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  receiptActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  remarksInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    fontSize: 12,
    color: '#0F172A',
    minHeight: 44,
  },

  // Footer Save
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  saveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 3,
  },
  saveBtnDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // Fullscreen Success Modal
  fullscreenSuccessContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenSuccessCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenSuccessRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  fullscreenCheckCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  fullscreenContentWrap: {
    alignItems: 'center',
    marginTop: 28,
  },
  fullscreenSuccessTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  fullscreenSuccessAmount: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  fullscreenSuccessMerchant: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 14,
  },
  fullscreenSuccessBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  fullscreenSuccessBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  // Preview Modal
  previewModalBg: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  previewCloseBtn: {
    padding: 6,
  },
  previewImgContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewFullImg: {
    width: '100%',
    height: '80%',
  },

  // Add Category Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  addCatModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '82%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 10,
  },
  addCatModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  addCatModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 12,
    marginBottom: 6,
  },
  modalTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  addCatIconsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  addCatIconCell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCatColorsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 6,
  },
  addCatColorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCatSaveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 20,
    marginBottom: 10,
  },
  addCatSaveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  addCatSaveText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
