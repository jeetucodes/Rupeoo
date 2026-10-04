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
  Dimensions,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { insertTransaction, getAllTransactions, getUserCategories, addCustomCategory, CategoryItem, defaultCategories } from '@/lib/database';
import { markFirstTransactionReviewPending, hasUserBeenPromptedForReview } from '@/lib/review';
import { useAuth } from '@/context/AuthContext';
import { showTransactionSaveAd, preloadTransactionSaveAd, RupeoAdBanner } from '@/lib/ads';
import { useTranslation } from '@/lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import CategoryIcon from '@/components/CategoryIcon';
import * as ImagePicker from 'expo-image-picker';
import { safeGoBack } from '@/lib/navigation';
import { formatTime12Hour, getLocalDateString, getRelativeDateString } from '@/lib/dateUtils';
import Toast from 'react-native-toast-message';
import { triggerTransactionVibration } from '@/lib/sound';
import DateTimePicker from '@react-native-community/datetimepicker';
import VoiceTransactionModal from '@/components/VoiceTransactionModal';
import { ParsedVoiceTransaction } from '@/lib/voiceParser';

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
  const insets = useSafeAreaInsets();
  const { user, settings, isPremium, appConfig } = useAuth();
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
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);

  const handleApplyVoiceTransaction = (parsed: ParsedVoiceTransaction) => {
    if (parsed.amount !== null && parsed.amount > 0) {
      setAmount(parsed.amount.toString());
    }
    setType(parsed.type);
    if (parsed.category) {
      setCategory(parsed.category);
    }
    if (parsed.note) {
      setDescription(parsed.note);
    }
    if (parsed.friendName) {
      setMerchant(parsed.friendName);
    }
    Toast.show({
      type: 'success',
      text1: 'Voice Input Applied! 🎙️',
      text2: `Amount: ₹${parsed.amount ?? 0}, Category: ${parsed.category}`,
      position: 'top',
    });
  };

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

  // Handle hardware back press on Android
  useEffect(() => {
    const onBackPress = () => {
      safeGoBack(router);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [router]);

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
          }, appConfig).catch(() => {
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setVoiceModalVisible(true)}
              style={styles.headerVoiceBtn}
              activeOpacity={0.7}
              accessibilityLabel="Voice Entry"
            >
              <Ionicons name="mic" size={18} color="#10B981" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/categories')}
              style={styles.headerCatsBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="grid-outline" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 110 : 130 + (insets.bottom > 0 ? insets.bottom + 8 : 0) },
          ]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
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
            <View style={styles.amountTopHeaderRow}>
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

              <TouchableOpacity
                onPress={() => setVoiceModalVisible(true)}
                style={styles.amountVoicePill}
                activeOpacity={0.8}
                accessibilityLabel="Voice Entry"
              >
                <Ionicons name="mic" size={13} color="#059669" />
                <Text style={styles.amountVoicePillText}>{t('voice_entry')}</Text>
              </TouchableOpacity>
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
                    {t('add')}
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
                  {t('add')}
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
                    borderRadius: 0,
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

          {/* TRANSACTION FOOTER AD */}
          <RupeoAdBanner placement="transaction_footer" compact />
        </ScrollView>

        {/* BOTTOM FIXED SAVE BUTTON */}
        <View style={[styles.footer, { paddingBottom: keyboardHeight > 0 ? 9 : Math.max(9, insets.bottom + 6) }]}>
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
        statusBarTranslucent
        onRequestClose={() => setAddCatModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => Keyboard.dismiss()}
          />
          <View
            style={[
              styles.addCatModalCard,
              keyboardHeight > 0 && {
                marginBottom: Platform.OS === 'android' ? keyboardHeight : 0,
                maxHeight: Dimensions.get('screen').height - (Platform.OS === 'android' ? keyboardHeight : 0) - (Platform.OS === 'android' ? 65 : 90),
              },
            ]}
          >
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

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {/* Category Name Input */}
              <Text style={styles.modalInputLabel}>{t('category')} Name</Text>
              <TextInput
                style={styles.modalTextInput}
                placeholder={isExpense ? 'e.g. Pet, Gaming, Maintenance' : 'e.g. Rental, Dividend, Bonus, Stipend'}
                placeholderTextColor="#94A3B8"
                value={newCatName}
                onChangeText={setNewCatName}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
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
      {/* VOICE TRANSACTION MODAL */}
      <VoiceTransactionModal
        visible={voiceModalVisible}
        onClose={() => setVoiceModalVisible(false)}
        onApplyToForm={handleApplyVoiceTransaction}
        availableCategories={isExpense ? expenseCategories : incomeCategories}
      />
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
    width: 38,
    height: 38,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerVoiceBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCatsBtn: {
    width: 38,
    height: 38,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountTopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  amountVoicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 4,
  },
  amountVoicePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 24,
  },
  typeSwitchWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 0,
    padding: 3.5,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 0,
  },
  typeBtnExpenseActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#DC2626',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  typeBtnIncomeActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  typeBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#64748B',
  },
  typeBtnExpenseTextActive: {
    color: '#DC2626',
    fontWeight: '900',
  },
  typeBtnIncomeTextActive: {
    color: '#059669',
    fontWeight: '900',
  },

  // Amount Card
  amountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  amountBadge: {
    paddingHorizontal: 11,
    paddingVertical: 3.5,
    borderRadius: 0,
    borderWidth: 1.2,
    marginBottom: 4,
  },
  amountBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  currencyPrefix: {
    fontSize: 32,
    fontWeight: '900',
    marginRight: 4,
  },
  hugeAmountInput: {
    fontSize: 42,
    fontWeight: '900',
    minWidth: 100,
    textAlign: 'center',
    paddingVertical: 0,
    height: 50,
    letterSpacing: -1,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    gap: 7,
  },
  quickAmountPill: {
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  quickAmountPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  clearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    backgroundColor: '#FEF2F2',
    borderRadius: 0,
    borderWidth: 1.2,
    borderColor: '#FECACA',
  },
  clearPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
  },

  // Section Cards
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  sectionHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  manageLinkText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3B82F6',
  },
  addCategoryHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 0,
    borderWidth: 1.2,
  },
  addCategoryHeaderBtnText: {
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 3,
  },
  addCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginRight: 4,
    height: 38,
  },
  addCategoryChipIcon: {
    marginRight: 3,
  },
  addCategoryChipText: {
    fontSize: 12,
    fontWeight: '900',
  },
  catUsageBadge: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 0,
    marginLeft: 3,
  },

  // Categories
  categoriesScroll: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    height: 38,
  },
  catIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  checkDot: {
    width: 14,
    height: 14,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },

  // Note & Title Input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
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
    paddingVertical: 9,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  paymentPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },

  // More Options Accordion
  moreOptionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 0,
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
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 0,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  datePillActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  datePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  datePillTextActive: {
    color: '#4F46E5',
    fontWeight: '900',
  },
  customDateInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: '700',
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
    paddingVertical: 9,
    backgroundColor: '#EFF6FF',
    borderRadius: 0,
    borderWidth: 1.2,
    borderColor: '#DBEAFE',
  },
  photoBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  receiptAttachedBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    padding: 9,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  receiptThumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptThumb: {
    width: 38,
    height: 38,
    borderRadius: 0,
    backgroundColor: '#E2E8F0',
  },
  receiptAttachedTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  receiptAttachedSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  receiptActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  receiptActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptActionText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  remarksInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 0,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    padding: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    minHeight: 44,
  },

  // Footer Save
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  saveBtn: {
    borderRadius: 0,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
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
    paddingVertical: 14,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
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
    borderRadius: 0,
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
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
