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
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import Toast from 'react-native-toast-message';

import {
  insertTransaction,
  getAllTransactions,
  getUserCategories,
  addCustomCategory,
  CategoryItem,
  defaultCategories,
  KNOWN_INCOME_CATEGORY_NAMES,
} from '@/lib/database';
import { markFirstTransactionReviewPending, hasUserBeenPromptedForReview } from '@/lib/review';
import { useAuth } from '@/context/AuthContext';
import { showTransactionSaveAd, preloadTransactionSaveAd, RupeoAdBanner } from '@/lib/ads';
import { useTranslation } from '@/lib/i18n';
import CategoryIcon from '@/components/CategoryIcon';
import PaymentModeIcon from '@/components/PaymentModeIcon';
import TransactionCalculatorModal from '@/components/TransactionCalculatorModal';
import VoiceTransactionModal from '@/components/VoiceTransactionModal';
import { ParsedVoiceTransaction } from '@/lib/voiceParser';
import { safeGoBack } from '@/lib/navigation';
import { formatTime12Hour, getLocalDateString, getRelativeDateString, parseLocalDate } from '@/lib/dateUtils';
import { triggerTransactionVibration, triggerCalculatorKeyVibration } from '@/lib/sound';
import { warn, error } from '@/lib/logger';

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];

const PRIMARY_PAYMENT_MODES = [
  { id: 'UPI', label: 'UPI' },
  { id: 'Cash', label: 'Cash' },
  { id: 'Card', label: 'Card' },
  { id: 'Bank', label: 'Bank' },
];

const EXTRA_PAYMENT_MODES = [
  { id: 'Wallet', label: 'Wallet', icon: 'wallet-outline' },
  { id: 'Cheque', label: 'Cheque', icon: 'document-text-outline' },
  { id: 'Net Banking', label: 'Net Banking', icon: 'globe-outline' },
  { id: 'Other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];

const DEFAULT_INCOME_CATEGORIES: CategoryItem[] = [
  { name: 'Salary', icon: 'briefcase', color: '#10B981', type: 'credit' },
  { name: 'Job', icon: 'briefcase', color: '#14B8A6', type: 'credit' },
  { name: 'Business', icon: 'trending-up', color: '#059669', type: 'credit' },
  { name: 'Freelance', icon: 'laptop', color: '#0EA5E9', type: 'credit' },
  { name: 'Investments', icon: 'bar-chart', color: '#8B5CF6', type: 'credit' },
  { name: 'Savings', icon: 'cash', color: '#10B981', type: 'credit' },
  { name: 'Income', icon: 'wallet', color: '#10B981', type: 'credit' },
  { name: 'Other', icon: 'cube', color: '#64748B', type: 'credit' },
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
  'heart',
  'flash',
  'shield-checkmark',
  'globe',
];

const ADD_CAT_COLORS = [
  '#EF4444',
  '#0284C7',
  '#9D4EDD',
  '#FF9F1C',
  '#E11D48',
  '#6366F1',
  '#10B981',
  '#059669',
  '#0EA5E9',
  '#2563EB',
  '#EC4899',
  '#F59E0B',
  '#64748B',
];

// Pastel background palette for categories matching modern expense UI
const CATEGORY_STYLES: Record<string, { bg: string; activeBorder: string; activeText: string }> = {
  food: { bg: '#FFF1F1', activeBorder: '#FECACA', activeText: '#EF4444' },
  transport: { bg: '#F0F9FF', activeBorder: '#BAE6FD', activeText: '#0284C7' },
  shopping: { bg: '#FAF5FF', activeBorder: '#E9D5FF', activeText: '#9333EA' },
  bills: { bg: '#FFFBEB', activeBorder: '#FDE68A', activeText: '#D97706' },
  health: { bg: '#FFF1F2', activeBorder: '#FECDD3', activeText: '#E11D48' },
  healthcare: { bg: '#FFF1F2', activeBorder: '#FECDD3', activeText: '#E11D48' },
  education: { bg: '#EEF2FF', activeBorder: '#C7D2FE', activeText: '#4F46E5' },
  groceries: { bg: '#ECFDF5', activeBorder: '#A7F3D0', activeText: '#059669' },
  dining: { bg: '#FFF1F1', activeBorder: '#FECACA', activeText: '#EF4444' },
  coffee: { bg: '#FDF4FF', activeBorder: '#F5D0FE', activeText: '#A21CAF' },
  salary: { bg: '#ECFDF5', activeBorder: '#A7F3D0', activeText: '#059669' },
  job: { bg: '#F0FDFA', activeBorder: '#99F6E4', activeText: '#0D9488' },
  business: { bg: '#F0FDF4', activeBorder: '#BBF7D0', activeText: '#16A34A' },
  freelance: { bg: '#F0F9FF', activeBorder: '#BAE6FD', activeText: '#0284C7' },
  investments: { bg: '#FAF5FF', activeBorder: '#E9D5FF', activeText: '#7C3AED' },
  savings: { bg: '#ECFDF5', activeBorder: '#A7F3D0', activeText: '#059669' },
  income: { bg: '#ECFDF5', activeBorder: '#A7F3D0', activeText: '#059669' },
  'pocket money': { bg: '#FFF1F2', activeBorder: '#FECDD3', activeText: '#E11D48' },
};

// Smart default merchant/source suggestions per category
const DEFAULT_CATEGORY_MERCHANTS: Record<string, string[]> = {
  food: ['Swiggy', 'Zomato', 'Tea / Coffee', 'Dinner', 'Lunch', 'Snacks'],
  transport: ['Petrol / Fuel', 'Uber', 'Ola', 'Metro', 'Auto', 'Rapido'],
  shopping: ['Amazon', 'Flipkart', 'Myntra', 'Clothes', 'Market'],
  groceries: ['Blinkit', 'Zepto', 'Instamart', 'Supermarket', 'Vegetables', 'Milk & Dairy'],
  bills: ['Electricity', 'Mobile Recharge', 'WiFi / Broadband', 'Rent', 'DTH', 'Water Bill'],
  health: ['Pharmacy / Meds', 'Doctor Consultation', 'Lab Tests', 'Gym / Fitness'],
  healthcare: ['Pharmacy / Meds', 'Doctor Consultation', 'Hospital', 'Medicine'],
  education: ['Course / Tuition', 'Books', 'Exam Fee', 'School / College'],
  entertainment: ['Movie', 'Netflix', 'Hotstar', 'Gaming', 'Outing'],
  dining: ['Restaurant', 'Cafe', 'Street Food', 'Bakery'],
  coffee: ['Starbucks', 'Cafe Coffee Day', 'Chai Point', 'Tea Stall'],
  salary: ['Monthly Salary', 'Company Payroll', 'Stipend'],
  job: ['Monthly Salary', 'Bonus', 'Overtime'],
  business: ['Customer Sale', 'Invoice Payment', 'Business Revenue'],
  freelance: ['Client Payment', 'Freelance Project', 'Consulting'],
  investments: ['Dividend', 'Stock Profit', 'Mutual Fund Return', 'Interest'],
  savings: ['Bank Interest', 'Savings Deposit'],
  income: ['Salary', 'Client Payment', 'Bonus'],
  'pocket money': ['Parents', 'Pocket Money', 'Cash Gift'],
};

export default function AddExpenseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, settings, isPremium, appConfig } = useAuth();
  const { t } = useTranslation();
  const curr = settings?.currency === 'INR' ? '₹' : (settings?.currency || '₹');

  const params = useLocalSearchParams<{ type?: string; fromWidget?: string; voice?: string }>();
  const [type, setType] = useState<'debit' | 'credit'>(
    params?.type === 'income' || params?.type === 'credit' ? 'credit' : 'debit'
  );

  useEffect(() => {
    if (params?.type === 'income' || params?.type === 'credit') {
      setType('credit');
    } else if (params?.type === 'expense' || params?.type === 'debit') {
      setType('debit');
    }
    if (params?.voice === '1') {
      setVoiceModalVisible(true);
    }
  }, [params?.type, params?.voice]);

  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Food');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [categories, setCategories] = useState<CategoryItem[]>(defaultCategories);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Modals state
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [seeAllCategoriesOpen, setSeeAllCategoriesOpen] = useState(false);
  const [receiptSheetOpen, setReceiptSheetOpen] = useState(false);
  const [morePaymentsOpen, setMorePaymentsOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [addCatModalOpen, setAddCatModalOpen] = useState(false);
  const [searchCategoryText, setSearchCategoryText] = useState('');

  // Add Custom Category State
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('briefcase');
  const [newCatColor, setNewCatColor] = useState('#EF4444');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Photos & Date
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const todayStr = getLocalDateString();
  const yesterdayStr = getRelativeDateString(-1);
  const [date, setDate] = useState(todayStr);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [savedDetails, setSavedDetails] = useState({ amount: '', merchant: '', category: '', paymentMode: '' });

  // Cursor blink animation
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [cursorOpacity]);

  // Success Animation refs
  const successScale = useRef(new Animated.Value(0.3)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successRingScale = useRef(new Animated.Value(0.6)).current;
  const successRingOpacity = useRef(new Animated.Value(1)).current;
  const successCheckScale = useRef(new Animated.Value(0.1)).current;
  const successContentY = useRef(new Animated.Value(20)).current;
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amountInputRef = useRef<TextInput>(null);

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

  // Hardware back press on Android
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
        .catch(error);
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

  // Category usage frequency map
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

  // Income categories
  const incomeCategories = React.useMemo(() => {
    const customIncome = categories.filter(
      (c) => c.type === 'credit' || KNOWN_INCOME_CATEGORY_NAMES.has((c.name || '').trim().toLowerCase())
    );
    const combined = [...customIncome, ...DEFAULT_INCOME_CATEGORIES];
    const seen = new Set<string>();
    const result: CategoryItem[] = [];
    // Prioritize custom categories over defaults
    const sorted = [...combined].sort((a, b) => (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0));
    for (const c of sorted) {
      const name = (c.name || '').trim();
      const key = name.toLowerCase();
      if (!key || seen.has(key)) continue;
      // Do not allow debit categories unless explicitly a known income category
      if (c.type === 'debit' && !KNOWN_INCOME_CATEGORY_NAMES.has(key)) continue;
      seen.add(key);
      result.push({ ...c, name, type: 'credit' });
    }
    return result;
  }, [categories]);

  // Expense categories
  const expenseCategories = React.useMemo(() => {
    const seen = new Set<string>();
    const result: CategoryItem[] = [];
    // Prioritize custom categories over defaults so custom Pocket money wins over default Pocket Money
    const sorted = [...categories].sort((a, b) => (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0));
    for (const c of sorted) {
      const name = (c.name || '').trim();
      const key = name.toLowerCase();
      if (!key || seen.has(key)) continue;
      // Never allow credit or known income categories in expense categories
      if (c.type === 'credit' || KNOWN_INCOME_CATEGORY_NAMES.has(key)) continue;
      seen.add(key);
      result.push({ ...c, name, type: 'debit' });
    }
    return result;
  }, [categories]);

  // Sorted display categories
  const sortedDisplayCategories = React.useMemo(() => {
    const list = isExpense ? [...expenseCategories] : [...incomeCategories];
    const freqMap = isExpense ? expenseFreq : incomeFreq;

    return list.sort((a, b) => {
      const countA = freqMap[a.name.trim().toLowerCase()] || 0;
      const countB = freqMap[b.name.trim().toLowerCase()] || 0;
      if (countB !== countA) {
        return countB - countA;
      }
      return 0;
    });
  }, [isExpense, expenseCategories, incomeCategories, expenseFreq, incomeFreq]);

  // Auto select valid category on type switch
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

  // Top repeated merchants/sources for the currently selected category & type
  const frequentMerchantsForCategory = React.useMemo(() => {
    const currentCatKey = (category || '').toLowerCase().trim();
    const isCurrentExpense = type === 'debit';

    // 1. Calculate count of each merchant in past transactions
    const countMap: Record<string, { count: number; originalName: string }> = {};

    (transactions || []).forEach((tx) => {
      const txType = (tx.type || 'debit').toLowerCase();
      if ((isCurrentExpense && txType === 'credit') || (!isCurrentExpense && txType === 'debit')) {
        return;
      }

      const txCat = (tx.category || '').toLowerCase().trim();
      const rawMerchant = (tx.merchant_name || '').trim();
      if (!rawMerchant) return;

      const lower = rawMerchant.toLowerCase();
      // Skip generic fallback words
      if (
        lower === 'expense' ||
        lower === 'income' ||
        lower === 'transaction' ||
        lower === txCat
      ) {
        return;
      }

      // Weight transactions in the current category higher
      const weight = txCat === currentCatKey ? 5 : 1;
      if (!countMap[lower]) {
        countMap[lower] = { count: weight, originalName: rawMerchant };
      } else {
        countMap[lower].count += weight;
      }
    });

    // 2. Sort by highest frequency
    const sortedHistory = Object.values(countMap)
      .sort((a, b) => b.count - a.count)
      .map((item) => item.originalName);

    // 3. Fallback defaults for this category
    const defaults = DEFAULT_CATEGORY_MERCHANTS[currentCatKey] || [
      'Store',
      'Market',
      'Online',
      'Daily Expense',
    ];

    const combined: string[] = [];
    const seen = new Set<string>();

    for (const name of sortedHistory) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(name);
      }
    }

    for (const name of defaults) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(name);
      }
    }

    // 4. If user has typed anything in merchant, filter matching suggestions
    const query = (merchant || '').trim().toLowerCase();
    if (query) {
      const filtered = combined.filter((m) => m.toLowerCase().includes(query));
      return filtered.slice(0, 5);
    }

    return combined.slice(0, 5);
  }, [category, type, transactions, merchant]);

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
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may be unsupported or restricted on web / certain devices
    }
    const current = parseFloat(amount) || 0;
    setAmount((current + val).toString());
  };

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
      setSeeAllCategoriesOpen(false);
      setNewCatName('');
      Toast.show({
        type: 'success',
        text1: 'Category Added!',
        text2: `"${trimmed}" is selected`,
      });
    } catch (err: any) {
      error('Error saving custom category:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not save category' });
    } finally {
      setIsSavingCategory(false);
    }
  };

  const pickImage = async () => {
    setReceiptSheetOpen(false);
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
        Toast.show({ type: 'success', text1: 'Photo Attached! 📸' });
      }
    } catch (err) {
      warn('Error picking image:', err);
      Toast.show({ type: 'error', text1: 'Photo Error', text2: 'Could not access photo library' });
    }
  };

  const takePhoto = async () => {
    setReceiptSheetOpen(false);
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
        Toast.show({ type: 'success', text1: 'Photo Attached! 📸' });
      }
    } catch (err) {
      warn('Error taking photo:', err);
      Toast.show({ type: 'error', text1: 'Camera Error', text2: 'Could not open camera' });
    }
  };

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

  const formatCardDate = (dateStr: string) => {
    if (!dateStr) return 'Select Date';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[monthIndex] || '';
        const dayStr = String(day).padStart(2, '0');
        if (dateStr === todayStr) {
          return `Today, ${dayStr} ${month} ${year}`;
        }
        if (dateStr === yesterdayStr) {
          return `Yesterday, ${dayStr} ${month} ${year}`;
        }
        return `${dayStr} ${month} ${year}`;
      }
    } catch {
      // Fallback to raw dateStr if formatting fails
    }
    return dateStr;
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

      let isFirstTransaction = false;
      try {
        const alreadyPrompted = await hasUserBeenPromptedForReview(user.uid);
        if (!alreadyPrompted) {
          const existingTxs = await getAllTransactions(user.uid);
          isFirstTransaction = !existingTxs || existingTxs.length === 0;
        }
      } catch (reviewErr) {
        warn('Failed to check review prompt status on transaction save:', reviewErr);
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
          safeGoBack(router);
        } else {
          showTransactionSaveAd(isPremium, () => {
            safeGoBack(router);
          }, appConfig).catch(() => {
            safeGoBack(router);
          });
        }
      }, 950);
    } catch (err: any) {
      error('Failed to add transaction', err);
      Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to save transaction' });
      setIsSaving(false);
    }
  };

  const isExtraPaymentSelected = !PRIMARY_PAYMENT_MODES.some((m) => m.id === paymentMode);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Notch handle pill */}
      <View style={styles.topHandleBar} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* TOP HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => safeGoBack(router)}
            style={styles.circleBtn}
            activeOpacity={0.7}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color="#0F172A" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Add Transaction</Text>

          <TouchableOpacity
            onPress={() => setVoiceModalVisible(true)}
            style={styles.voiceCircleBtn}
            activeOpacity={0.7}
            accessibilityLabel="Voice Entry"
          >
            <Ionicons name="mic" size={20} color="#10B981" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 110 : 130 + (insets.bottom > 0 ? insets.bottom + 8 : 0) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* SEGMENTED EXPENSE / INCOME SWITCH */}
          <View style={styles.typeSwitchContainer}>
            {/* Expense Tab */}
            <TouchableOpacity
              style={[styles.typeTab, isExpense && styles.typeTabActiveExpense]}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                setType('debit');
                const topExpenseCat = expenseCategories[0]?.name || 'Food';
                setCategory(topExpenseCat);
              }}
              activeOpacity={0.88}
            >
              {isExpense ? (
                <LinearGradient
                  colors={['#FF5252', '#FF3B47']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.activeTabGradient}
                >
                  <View style={styles.whiteArrowCircle}>
                    <Ionicons name="arrow-up" size={13} color="#FF4343" />
                  </View>
                  <Text style={styles.activeTabText}>Expense</Text>
                </LinearGradient>
              ) : (
                <View style={styles.inactiveTabRow}>
                  <View style={styles.grayArrowCircle}>
                    <Ionicons name="arrow-up" size={13} color="#64748B" />
                  </View>
                  <Text style={styles.inactiveTabText}>Expense</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Income Tab */}
            <TouchableOpacity
              style={[styles.typeTab, !isExpense && styles.typeTabActiveIncome]}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                setType('credit');
                const topIncomeCat = incomeCategories[0]?.name || 'Salary';
                setCategory(topIncomeCat);
              }}
              activeOpacity={0.88}
            >
              {!isExpense ? (
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.activeTabGradient}
                >
                  <View style={styles.whiteArrowCircle}>
                    <Ionicons name="arrow-down" size={13} color="#059669" />
                  </View>
                  <Text style={styles.activeTabText}>Income</Text>
                </LinearGradient>
              ) : (
                <View style={styles.inactiveTabRow}>
                  <View style={styles.grayArrowCircle}>
                    <Ionicons name="arrow-down" size={13} color="#64748B" />
                  </View>
                  <Text style={styles.inactiveTabText}>Income</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* AMOUNT CARD */}
          <View style={[styles.amountCard, { backgroundColor: isExpense ? '#FFF6F6' : '#F0FDF4', borderColor: isExpense ? '#FFE5E5' : '#DCFCE7' }]}>
            <View style={styles.amountDisplayRow}>
              {/* Currency & Amount */}
              <TouchableOpacity
                style={styles.amountInputTouchWrap}
                onPress={() => amountInputRef.current?.focus()}
                activeOpacity={1}
              >
                <Text style={styles.currencySymbol}>{curr}</Text>
                <TextInput
                  ref={amountInputRef}
                  style={[
                    styles.amountTextInput,
                    { color: amount ? '#0F172A' : '#64748B' },
                  ]}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#64748B"
                  value={amount}
                  onChangeText={handleAmountChange}
                  maxLength={10}
                />
                <Animated.View style={[styles.cursorBar, { opacity: cursorOpacity, backgroundColor: themeColor }]} />
              </TouchableOpacity>

              {/* Calculator Button */}
              <TouchableOpacity
                style={[styles.calculatorIconBtn, { backgroundColor: isExpense ? '#FEE2E2' : '#DCFCE7' }]}
                onPress={() => {
                  triggerCalculatorKeyVibration();
                  setCalculatorOpen(true);
                }}
                activeOpacity={0.75}
                accessibilityLabel="Open Calculator"
              >
                <Ionicons name="calculator" size={24} color={themeColor} />
              </TouchableOpacity>
            </View>

            {/* Quick Amount Pills */}
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
                  <Text style={styles.quickAmountPillText}>+{q}</Text>
                </TouchableOpacity>
              ))}
              {amount !== '' && (
                <TouchableOpacity
                  style={styles.clearPill}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    setAmount('');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="backspace-outline" size={15} color="#EF4444" style={{ marginRight: 3 }} />
                  <Text style={styles.clearPillText}>Clear</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* CATEGORY SECTION */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Category</Text>
            <TouchableOpacity
              onPress={() => setSeeAllCategoriesOpen(true)}
              style={styles.seeAllBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllText}>See all</Text>
              <Ionicons name="chevron-forward" size={13} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesHorizontalRow}
          >
            {sortedDisplayCategories.slice(0, 10).map((cat) => {
              const isSelected = category.toLowerCase() === cat.name.toLowerCase();
              const catKey = cat.name.toLowerCase();
              const styleConfig = CATEGORY_STYLES[catKey] || {
                bg: cat.color ? cat.color + '15' : '#F1F5F9',
                activeBorder: cat.color || '#3B82F6',
                activeText: cat.color || '#3B82F6',
              };

              return (
                <TouchableOpacity
                  key={cat.id || cat.name}
                  style={styles.categoryTileItem}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    setCategory(cat.name);
                  }}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.categoryTileBox,
                      { backgroundColor: styleConfig.bg },
                      isSelected && {
                        borderColor: styleConfig.activeBorder,
                        borderWidth: 1.8,
                        transform: [{ scale: 1.02 }],
                      },
                    ]}
                  >
                    <CategoryIcon
                      categoryName={cat.name}
                      iconName={cat.icon}
                      size={24}
                      color={styleConfig.activeText}
                    />
                  </View>
                  <Text
                    style={[
                      styles.categoryTileLabel,
                      isSelected && { color: styleConfig.activeText, fontWeight: '800' },
                    ]}
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* PAID TO / SPENT ON INPUT */}
          <View style={styles.inputCard}>
            <View style={styles.inputCardIconBox}>
              <Ionicons name="storefront" size={20} color="#2563EB" />
            </View>
            <TextInput
              style={styles.inputCardField}
              placeholder={isExpense ? 'Paid to / Spent on' : 'Received from / Source'}
              placeholderTextColor="#94A3B8"
              value={merchant}
              onChangeText={setMerchant}
            />
            {merchant !== '' ? (
              <TouchableOpacity onPress={() => setMerchant('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={17} color="#94A3B8" />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            )}
          </View>

          {/* FREQUENT REPEATED SUGGESTIONS FOR CATEGORY */}
          {frequentMerchantsForCategory.length > 0 && (
            <View style={styles.merchantSuggestionsContainer}>
              <View style={styles.merchantSuggestionsHeader}>
                <Ionicons name="sparkles" size={11} color="#2563EB" style={{ marginRight: 4 }} />
                <Text style={styles.merchantSuggestionsTitle}>
                  {isExpense ? `Top for ${category}` : `Frequent for ${category}`}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.merchantSuggestionsRow}
                keyboardShouldPersistTaps="handled"
              >
                {frequentMerchantsForCategory.map((item) => {
                  const isSelected = merchant.trim().toLowerCase() === item.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.merchantSuggestionChip,
                        isSelected && styles.merchantSuggestionChipActive,
                      ]}
                      onPress={() => {
                        try {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        } catch {}
                        setMerchant(item);
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'flash-outline'}
                        size={12}
                        color={isSelected ? '#FFFFFF' : '#2563EB'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.merchantSuggestionText,
                          isSelected && styles.merchantSuggestionTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* PAYMENT VIA SECTION */}
          <View style={styles.paymentSectionHeader}>
            <Text style={styles.sectionTitle}>{isExpense ? 'Payment via' : 'Received in'}</Text>
          </View>

          <View style={styles.paymentModeChipsRow}>
            {PRIMARY_PAYMENT_MODES.map((pm) => {
              const isSelected = paymentMode === pm.id;
              return (
                <TouchableOpacity
                  key={pm.id}
                  style={[
                    styles.paymentChip,
                    isSelected && styles.paymentChipSelected,
                  ]}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    setPaymentMode(pm.id);
                  }}
                  activeOpacity={0.75}
                >
                  <PaymentModeIcon mode={pm.id} size={16} />
                  <Text
                    style={[
                      styles.paymentChipText,
                      isSelected && styles.paymentChipTextSelected,
                    ]}
                  >
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Ellipsis / More Payment modes button */}
            <TouchableOpacity
              style={[
                styles.paymentChipMore,
                isExtraPaymentSelected && styles.paymentChipSelected,
              ]}
              onPress={() => setMorePaymentsOpen(true)}
              activeOpacity={0.75}
              accessibilityLabel="More payment options"
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={18}
                color={isExtraPaymentSelected ? '#7C3AED' : '#64748B'}
              />
            </TouchableOpacity>
          </View>

          {/* TWO COLUMN ROW: DATE & RECEIPT */}
          <View style={styles.twoColumnRow}>
            {/* Date Card */}
            <TouchableOpacity
              style={styles.twoColumnCard}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.75}
            >
              <View style={styles.twoColumnIconBox}>
                <Ionicons name="calendar" size={18} color="#2563EB" />
              </View>
              <View style={styles.twoColumnTextWrap}>
                <Text style={styles.twoColumnLabel}>Date</Text>
                <Text style={styles.twoColumnValue} numberOfLines={1}>
                  {formatCardDate(date)}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={15} color="#64748B" />
            </TouchableOpacity>

            {/* Receipt Card */}
            <TouchableOpacity
              style={styles.twoColumnCard}
              onPress={() => {
                if (receiptImage) {
                  setReceiptSheetOpen(true);
                } else {
                  setReceiptSheetOpen(true);
                }
              }}
              activeOpacity={0.75}
            >
              <View style={styles.twoColumnIconBox}>
                <Ionicons name="receipt" size={18} color="#2563EB" />
              </View>
              <View style={styles.twoColumnTextWrap}>
                <Text style={styles.twoColumnLabel}>Receipt</Text>
                <Text style={styles.twoColumnValue} numberOfLines={1}>
                  {receiptImage ? 'Photo Added' : 'Add Photo'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* NOTE (OPTIONAL) INPUT */}
          <View style={styles.inputCard}>
            <View style={styles.inputCardIconBox}>
              <Ionicons name="document-text" size={20} color="#2563EB" />
            </View>
            <TextInput
              style={styles.inputCardField}
              placeholder="Note (Optional)"
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={setDescription}
            />
            {description !== '' && (
              <TouchableOpacity onPress={() => setDescription('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={17} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* TRANSACTION FOOTER AD */}
          <RupeoAdBanner placement="transaction_footer" compact />
        </ScrollView>

        {/* BOTTOM FIXED SAVE BUTTON */}
        <View style={[styles.footer, { paddingBottom: keyboardHeight > 0 ? 10 : Math.max(10, insets.bottom + 6) }]}>
          <TouchableOpacity
            style={[styles.saveBtn, (!amount || parseFloat(amount) <= 0) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSaving || !amount || parseFloat(amount) <= 0}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={
                isExpense
                  ? ['#FF5555', '#EF4444']
                  : ['#10B981', '#059669']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtnGradient}
            >
              <Ionicons name="save" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.saveBtnText}>
                {isSaving
                  ? 'Saving...'
                  : isExpense
                  ? 'Save Expense'
                  : 'Save Income'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* CALCULATOR MODAL */}
      <TransactionCalculatorModal
        visible={calculatorOpen}
        onClose={() => setCalculatorOpen(false)}
        onApply={(calcAmount) => setAmount(calcAmount)}
        initialAmount={amount}
        currencySymbol={curr}
        themeColor={themeColor}
      />

      {/* VOICE TRANSACTION MODAL */}
      <VoiceTransactionModal
        visible={voiceModalVisible}
        onClose={() => setVoiceModalVisible(false)}
        onApplyToForm={handleApplyVoiceTransaction}
        availableCategories={isExpense ? expenseCategories : incomeCategories}
      />

      {/* DATE PICKER */}
      {showDatePicker && (
        <DateTimePicker
          value={date ? parseLocalDate(date) : new Date()}
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

      {/* SEE ALL CATEGORIES MODAL */}
      <Modal
        visible={seeAllCategoriesOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSeeAllCategoriesOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setSeeAllCategoriesOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.bottomSheetContainer}>
                <View style={styles.handleBar} />
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalSheetTitle}>
                    {isExpense ? 'Expense Categories' : 'Income Categories'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSeeAllCategoriesOpen(false)}
                    style={styles.sheetCloseBtn}
                  >
                    <Ionicons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Search / Add Bar */}
                <View style={styles.catSearchRow}>
                  <View style={styles.searchBarWrap}>
                    <Ionicons name="search" size={17} color="#94A3B8" style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.searchBarInput}
                      placeholder="Search category..."
                      placeholderTextColor="#94A3B8"
                      value={searchCategoryText}
                      onChangeText={setSearchCategoryText}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.addCatMiniBtn, { backgroundColor: themeColor }]}
                    onPress={openAddCategoryModal}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Category Grid - Strict 3-Column Responsive Layout */}
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.categoryGridContent}
                >
                  {(() => {
                    const filteredCats = sortedDisplayCategories.filter((c) =>
                      c.name.toLowerCase().includes(searchCategoryText.trim().toLowerCase())
                    );

                    if (filteredCats.length === 0) {
                      return (
                        <View style={styles.noCategoriesWrap}>
                          <Ionicons name="search-outline" size={32} color="#94A3B8" style={{ marginBottom: 8 }} />
                          <Text style={styles.noCategoriesTitle}>No categories found</Text>
                          <Text style={styles.noCategoriesSubtitle}>
                            Can't find what you're looking for? Add it as a custom category!
                          </Text>
                          <TouchableOpacity
                            style={[styles.noCategoriesAddBtn, { backgroundColor: themeColor }]}
                            onPress={openAddCategoryModal}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                            <Text style={styles.noCategoriesAddBtnText}>
                              Add "{searchCategoryText.trim()}"
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    // Group into chunks of 3 for guaranteed 3-column grid on all phone screens
                    const rows: (typeof filteredCats)[] = [];
                    for (let i = 0; i < filteredCats.length; i += 3) {
                      rows.push(filteredCats.slice(i, i + 3));
                    }

                    return rows.map((row, rowIdx) => (
                      <View key={`cat-row-${rowIdx}`} style={styles.categoryGridRow}>
                        {row.map((cat) => {
                          const isSel = category.toLowerCase() === cat.name.toLowerCase();
                          const catKey = cat.name.toLowerCase();
                          const styleConfig = CATEGORY_STYLES[catKey] || {
                            bg: cat.color ? cat.color + '15' : '#F1F5F9',
                            activeBorder: cat.color || '#3B82F6',
                            activeText: cat.color || '#3B82F6',
                          };

                          return (
                            <TouchableOpacity
                              key={cat.id || cat.name}
                              style={[
                                styles.categoryGridItem,
                                isSel && { borderColor: styleConfig.activeBorder, borderWidth: 1.8, backgroundColor: styleConfig.bg },
                              ]}
                              onPress={() => {
                                setCategory(cat.name);
                                setSeeAllCategoriesOpen(false);
                              }}
                              activeOpacity={0.75}
                            >
                              <View style={[styles.gridIconBox, { backgroundColor: styleConfig.bg }]}>
                                <CategoryIcon
                                  categoryName={cat.name}
                                  iconName={cat.icon}
                                  size={24}
                                  color={styleConfig.activeText}
                                />
                              </View>
                              <Text
                                style={[
                                  styles.gridLabel,
                                  isSel && { color: styleConfig.activeText, fontWeight: '800' },
                                ]}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {cat.name}
                              </Text>
                              {isSel && (
                                <View style={[styles.selectedCheckBadge, { backgroundColor: styleConfig.activeBorder }]}>
                                  <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                        {/* Empty placeholder slots to keep items in the last row at exact 1/3 width */}
                        {row.length < 3 &&
                          Array.from({ length: 3 - row.length }).map((_, emptyIdx) => (
                            <View key={`empty-${emptyIdx}`} style={styles.categoryGridPlaceholder} />
                          ))}
                      </View>
                    ));
                  })()}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* RECEIPT ACTION SHEET MODAL */}
      <Modal
        visible={receiptSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptSheetOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setReceiptSheetOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.actionSheetContainer}>
                <View style={styles.handleBar} />
                <Text style={styles.actionSheetTitle}>Receipt / Bill Photo</Text>

                <TouchableOpacity style={styles.actionSheetOption} onPress={takePhoto} activeOpacity={0.7}>
                  <View style={[styles.actionSheetIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="camera" size={20} color="#2563EB" />
                  </View>
                  <Text style={styles.actionSheetOptionText}>Take Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionSheetOption} onPress={pickImage} activeOpacity={0.7}>
                  <View style={[styles.actionSheetIcon, { backgroundColor: '#F0FDF4' }]}>
                    <Ionicons name="images" size={20} color="#16A34A" />
                  </View>
                  <Text style={styles.actionSheetOptionText}>Choose from Gallery</Text>
                </TouchableOpacity>

                {receiptImage && (
                  <>
                    <TouchableOpacity
                      style={styles.actionSheetOption}
                      onPress={() => {
                        setReceiptSheetOpen(false);
                        setPreviewModalOpen(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.actionSheetIcon, { backgroundColor: '#FAF5FF' }]}>
                        <Ionicons name="eye" size={20} color="#9333EA" />
                      </View>
                      <Text style={styles.actionSheetOptionText}>View Full Receipt</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionSheetOption}
                      onPress={() => {
                        setReceiptImage(null);
                        setReceiptSheetOpen(false);
                        Toast.show({ type: 'info', text1: 'Receipt Removed' });
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.actionSheetIcon, { backgroundColor: '#FEF2F2' }]}>
                        <Ionicons name="trash" size={20} color="#EF4444" />
                      </View>
                      <Text style={[styles.actionSheetOptionText, { color: '#EF4444' }]}>Remove Receipt</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={styles.actionSheetCancelBtn}
                  onPress={() => setReceiptSheetOpen(false)}
                >
                  <Text style={styles.actionSheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MORE PAYMENT MODES MODAL */}
      <Modal
        visible={morePaymentsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMorePaymentsOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMorePaymentsOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.actionSheetContainer}>
                <View style={styles.handleBar} />
                <Text style={styles.actionSheetTitle}>Select Payment Mode</Text>

                {EXTRA_PAYMENT_MODES.map((epm) => (
                  <TouchableOpacity
                    key={epm.id}
                    style={[
                      styles.actionSheetOption,
                      paymentMode === epm.id && { backgroundColor: '#F8FAFC' },
                    ]}
                    onPress={() => {
                      setPaymentMode(epm.id);
                      setMorePaymentsOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.actionSheetIcon, { backgroundColor: '#F1F5F9' }]}>
                      <Ionicons name={epm.icon as any} size={20} color="#475569" />
                    </View>
                    <Text
                      style={[
                        styles.actionSheetOptionText,
                        paymentMode === epm.id && { color: '#7C3AED', fontWeight: '800' },
                      ]}
                    >
                      {epm.label}
                    </Text>
                    {paymentMode === epm.id && (
                      <Ionicons name="checkmark-circle" size={20} color="#7C3AED" style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={styles.actionSheetCancelBtn}
                  onPress={() => setMorePaymentsOpen(false)}
                >
                  <Text style={styles.actionSheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ADD CUSTOM CATEGORY MODAL */}
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
          <View style={styles.addCatModalCard}>
            <View style={styles.addCatModalHeader}>
              <Text style={styles.addCatModalTitle}>
                {isExpense ? 'New Expense Category' : 'New Income Category'}
              </Text>
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setAddCatModalOpen(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalInputLabel}>Category Name</Text>
              <TextInput
                style={styles.modalTextInput}
                placeholder={isExpense ? 'e.g. Gaming, Laundry, Pets' : 'e.g. Rental, Dividend, Bonus'}
                placeholderTextColor="#94A3B8"
                value={newCatName}
                onChangeText={setNewCatName}
                autoFocus
              />

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

              <TouchableOpacity
                style={[styles.addCatSaveBtn, isSavingCategory && { opacity: 0.7 }]}
                onPress={handleSaveCustomCategory}
                disabled={isSavingCategory}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={isExpense ? ['#FF5555', '#EF4444'] : ['#10B981', '#059669']}
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
                {isExpense ? 'Paid Successfully' : 'Received Successfully'}
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
            <Text style={styles.previewTitle}>Attached Receipt</Text>
            <TouchableOpacity onPress={() => setPreviewModalOpen(false)} style={styles.sheetCloseBtn}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.previewImgContainer}>
            {receiptImage && (
              <ExpoImage cachePolicy="memory-disk" source={{ uri: receiptImage }} style={styles.previewFullImg} contentFit="contain" />
            )}
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
  topHandleBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  voiceCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E6FBF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 24,
  },

  // Type Switch
  typeSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: '#EDF2F7',
    borderRadius: 26,
    padding: 3,
    marginBottom: 14,
  },
  typeTab: {
    flex: 1,
    height: 44,
    borderRadius: 23,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  typeTabActiveExpense: {
    elevation: 2,
    shadowColor: '#FF5252',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  typeTabActiveIncome: {
    elevation: 2,
    shadowColor: '#10B981',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  activeTabGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whiteArrowCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  activeTabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  inactiveTabRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grayArrowCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  inactiveTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },

  // Amount Card
  amountCard: {
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  amountDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  amountInputTouchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  currencySymbol: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    marginRight: 6,
  },
  amountTextInput: {
    fontSize: 42,
    fontWeight: '900',
    minWidth: 80,
    paddingVertical: 0,
    letterSpacing: -1,
  },
  cursorBar: {
    width: 2.5,
    height: 38,
    borderRadius: 1.5,
    marginLeft: 2,
  },
  calculatorIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAmountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickAmountPill: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  quickAmountPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  clearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },

  // Category Section
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  categoriesHorizontalRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 4,
    marginBottom: 12,
  },
  categoryTileItem: {
    alignItems: 'center',
    width: 60,
  },
  categoryTileBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  categoryTileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },

  // Input Cards (Paid to & Note)
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  inputCardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  inputCardField: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: '#0F172A',
    paddingVertical: 4,
  },

  // Merchant Frequent Suggestions
  merchantSuggestionsContainer: {
    marginTop: -4,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  merchantSuggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  merchantSuggestionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  merchantSuggestionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 2,
  },
  merchantSuggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  merchantSuggestionChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
    shadowColor: '#2563EB',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  merchantSuggestionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  merchantSuggestionTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Payment Section
  paymentSectionHeader: {
    marginBottom: 10,
  },
  paymentModeChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  paymentChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 5,
  },
  paymentChipSelected: {
    borderColor: '#8B5CF6',
    borderWidth: 1.6,
    backgroundColor: '#FAF5FF',
  },
  paymentChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  paymentChipTextSelected: {
    color: '#7C3AED',
    fontWeight: '800',
  },
  paymentChipMore: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Two Column Row (Date & Receipt)
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  twoColumnCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  twoColumnIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  twoColumnTextWrap: {
    flex: 1,
  },
  twoColumnLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  twoColumnValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },

  // Footer Save Button
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  saveBtn: {
    borderRadius: 27,
    overflow: 'hidden',
    shadowColor: '#FF5252',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 6,
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
    height: 54,
  },
  saveBtnText: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Bottom Sheets & Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '82%',
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handleBar: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalSheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  searchBarWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchBarInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  addCatMiniBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryGridContent: {
    paddingBottom: 24,
  },
  categoryGridRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    width: '100%',
  },
  categoryGridItem: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  categoryGridPlaceholder: {
    flex: 1,
    minWidth: 0,
  },
  gridIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  gridLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  selectedCheckBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCategoriesWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  noCategoriesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  noCategoriesSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  noCategoriesAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },
  noCategoriesAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Action Sheet (Receipt & Payment)
  actionSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  actionSheetTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
    textAlign: 'center',
  },
  actionSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 6,
  },
  actionSheetIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionSheetOptionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionSheetCancelBtn: {
    marginTop: 10,
    paddingVertical: 13,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    alignItems: 'center',
  },
  actionSheetCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
  },

  // Add Custom Category Modal
  addCatModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '82%',
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
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
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
  previewImgContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewFullImg: {
    width: '100%',
    height: '80%',
  },
});
