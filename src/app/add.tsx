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
import { insertTransaction, getUserCategories, CategoryItem, defaultCategories } from '@/lib/database';
import {
  QuickPresetItem,
  PRESET_ICONS,
  DEFAULT_QUICK_COMBOS_EXPENSE,
  DEFAULT_QUICK_COMBOS_INCOME,
  fetchCustomPresets,
  saveCustomPresetItem,
  fetchHiddenPresetIds,
} from '@/lib/quickPresets';
import { useAuth } from '@/context/AuthContext';
import { showTransactionSaveAd, preloadTransactionSaveAd } from '@/lib/ads';
import { useTranslation } from '@/lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import CategoryIcon from '@/components/CategoryIcon';
import * as ImagePicker from 'expo-image-picker';
import { safeGoBack } from '@/lib/navigation';
import { formatTime12Hour, getLocalDateString, getRelativeDateString } from '@/lib/dateUtils';
import Toast from 'react-native-toast-message';
import { playTransactionSuccessSound } from '@/lib/sound';

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

const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', icon: 'briefcase', color: '#10B981' },
  { name: 'Business', icon: 'trending-up', color: '#059669' },
  { name: 'Freelance', icon: 'laptop', color: '#0EA5E9' },
  { name: 'Investments', icon: 'bar-chart', color: '#8B5CF6' },
  { name: 'Income', icon: 'wallet', color: '#10B981' },
  { name: 'Other', icon: 'cube', color: '#64748B' },
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

  // 1-Tap Presets
  const [customPresets, setCustomPresets] = useState<QuickPresetItem[]>([]);
  const [hiddenPresetIds, setHiddenPresetIds] = useState<string[]>([]);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [newPresetLabel, setNewPresetLabel] = useState('');
  const [newPresetAmount, setNewPresetAmount] = useState('');
  const [newPresetCategory, setNewPresetCategory] = useState('Food');
  const [newPresetType, setNewPresetType] = useState<'debit' | 'credit'>('debit');
  const [newPresetIconUrl, setNewPresetIconUrl] = useState(PRESET_ICONS[0].url);

  // Optional extra details
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Date management
  const todayStr = getLocalDateString();
  const yesterdayStr = getRelativeDateString(-1);
  const [date, setDate] = useState(todayStr);

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
    Promise.all([fetchCustomPresets(), fetchHiddenPresetIds()]).then(([custom, hidden]) => {
      setCustomPresets(custom);
      setHiddenPresetIds(hidden);
    }).catch(console.error);

    if (user?.uid) {
      getUserCategories(user.uid)
        .then((cats) => {
          if (cats && cats.length > 0) {
            setCategories(cats);
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

  // Compute Active 1-Tap Presets
  const activePresets = (
    isExpense
      ? [
          ...customPresets.filter((p) => p.type === 'debit' || !p.type),
          ...DEFAULT_QUICK_COMBOS_EXPENSE,
        ]
      : [
          ...customPresets.filter((p) => p.type === 'credit'),
          ...DEFAULT_QUICK_COMBOS_INCOME,
        ]
  ).filter((p) => !hiddenPresetIds.includes(p.id));

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

  // 1-Tap Preset selection: sets Amount, Category, and Merchant in 1 click!
  const handleQuickPresetSelect = (combo: QuickPresetItem) => {
    setAmount(combo.amount);
    setCategory(combo.category);
    setMerchant(combo.label);
    if (combo.type && combo.type !== type) {
      setType(combo.type);
    }
  };

  const handleSaveNewPreset = async () => {
    if (!newPresetLabel.trim()) {
      Toast.show({ type: 'error', text1: 'Name Required', text2: 'Please enter preset name (e.g. Chai, Gym)' });
      return;
    }
    const pAmt = parseFloat(newPresetAmount);
    if (!newPresetAmount || isNaN(pAmt) || pAmt <= 0) {
      Toast.show({ type: 'error', text1: 'Amount Required', text2: 'Please enter a valid amount' });
      return;
    }

    const newPreset: QuickPresetItem = {
      id: 'custom_' + Date.now(),
      label: newPresetLabel.trim(),
      amount: newPresetAmount.trim(),
      category: newPresetCategory || (newPresetType === 'debit' ? 'Food' : 'Salary'),
      iconUrl: newPresetIconUrl,
      type: newPresetType,
      isCustom: true,
    };

    const updated = await saveCustomPresetItem(newPreset);
    setCustomPresets(updated);
    setPresetModalOpen(false);
    setNewPresetLabel('');
    setNewPresetAmount('');
    Toast.show({
      type: 'success',
      text1: 'Preset Added!',
      text2: `${newPreset.label} (${curr}${newPreset.amount}) added to 1-Tap Presets`,
    });
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

      setSavedDetails({
        amount: numAmount.toString(),
        merchant: finalMerchant,
        category: type === 'credit' && category === 'Food' ? 'Income' : category,
        paymentMode,
      });

      Keyboard.dismiss();
      playTransactionSuccessSound().catch(() => {});
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
        showTransactionSaveAd(isPremium, () => {
          safeGoBack(router);
        }).catch(() => {
          safeGoBack(router);
        });
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

          <Text style={styles.headerTitle}>Add Transaction</Text>

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
                if (category === 'Salary' || category === 'Business' || category === 'Freelance') {
                  setCategory('Food');
                }
              }}
              activeOpacity={0.85}
            >
              <ExpoImage
                source={{ uri: ICONS_3D.expense }}
                style={{ width: 22, height: 22, marginRight: 8 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={[styles.typeBtnText, isExpense && styles.typeBtnExpenseTextActive]}>
                Expense
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeBtn,
                !isExpense && styles.typeBtnIncomeActive,
              ]}
              onPress={() => {
                setType('credit');
                setCategory('Salary');
              }}
              activeOpacity={0.85}
            >
              <ExpoImage
                source={{ uri: ICONS_3D.income }}
                style={{ width: 22, height: 22, marginRight: 8 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={[styles.typeBtnText, !isExpense && styles.typeBtnIncomeTextActive]}>
                Income
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
                {isExpense ? '💸 MONEY SPENT' : '💰 MONEY RECEIVED'}
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
                  <Text style={styles.clearPillText}>Clear</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* ⚡ 1-TAP QUICK PRESETS (Sets Amount + Category + Note in 1 Tap!) */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ExpoImage
                  source={{ uri: ICONS_3D.sparkles }}
                  style={{ width: 18, height: 18, marginRight: 6 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
                <Text style={styles.sectionTitle}>⚡ 1-Tap Presets</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  style={styles.addPresetBtn}
                  onPress={() => {
                    setNewPresetType(type);
                    setNewPresetCategory(category || (isExpense ? 'Food' : 'Salary'));
                    setPresetModalOpen(true);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="add" size={14} color="#B45309" style={{ marginRight: 2 }} />
                  <Text style={styles.addPresetBtnText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/categories')} activeOpacity={0.7}>
                  <Text style={styles.manageLinkText}>Manage</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetsScroll}
            >
              {activePresets.map((combo) => {
                const isSelected =
                  amount === combo.amount &&
                  merchant.toLowerCase() === combo.label.toLowerCase() &&
                  category.toLowerCase() === combo.category.toLowerCase();

                return (
                  <TouchableOpacity
                    key={combo.id || combo.label + combo.amount}
                    style={[styles.presetChip, isSelected && styles.presetChipActive]}
                    onPress={() => handleQuickPresetSelect(combo)}
                    activeOpacity={0.75}
                  >
                    <ExpoImage
                      source={{ uri: combo.iconUrl }}
                      style={{ width: 26, height: 26, marginRight: 8 }}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                    <View>
                      <Text style={[styles.presetLabel, isSelected && styles.presetLabelActive]} numberOfLines={1}>
                        {combo.label}
                      </Text>
                      <Text style={[styles.presetAmount, isSelected && styles.presetAmountActive]}>
                        {curr}{combo.amount}
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={styles.presetCheckmark}>
                        <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* CATEGORIES SELECTION */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ExpoImage
                  source={{ uri: ICONS_3D.fire }}
                  style={{ width: 18, height: 18, marginRight: 6 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
                <Text style={styles.sectionTitle}>Category</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/categories')} activeOpacity={0.7}>
                <Text style={styles.manageLinkText}>+ Manage</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesScroll}
            >
              {displayCategories.map((cat) => {
                const isSelected = category.toLowerCase() === cat.name.toLowerCase();
                const catColor = cat.color || '#3B82F6';
                return (
                  <TouchableOpacity
                    key={cat.name}
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
                        size={20}
                        color={catColor}
                      />
                    </View>
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && { color: '#0F172A', fontWeight: '800' },
                      ]}
                      numberOfLines={1}
                    >
                      {cat.name}
                    </Text>
                    {isSelected && (
                      <View style={[styles.checkDot, { backgroundColor: catColor }]}>
                        <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* NOTE / PURPOSE INPUT */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <ExpoImage
                source={{ uri: ICONS_3D.memo }}
                style={{ width: 18, height: 18, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.sectionTitle}>Note / Description</Text>
            </View>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                placeholder={isExpense ? 'What was this for? (e.g. Chai, Petrol, Grocery)' : 'Income source (e.g. Client work, Bonus)'}
                placeholderTextColor="#94A3B8"
                value={merchant}
                onChangeText={setMerchant}
              />
              {merchant !== '' && (
                <TouchableOpacity onPress={() => setMerchant('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* PAYMENT MODE */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <ExpoImage
                source={{ uri: ICONS_3D.card }}
                style={{ width: 18, height: 18, marginRight: 6 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.sectionTitle}>{isExpense ? 'Payment Via' : 'Received In'}</Text>
            </View>
            <View style={styles.paymentRow}>
              {PAYMENT_MODES.map((pm) => {
                const isSelected = paymentMode === pm.id;
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
                      style={{ width: 22, height: 22, marginRight: 6 }}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                    <Text
                      style={[
                        styles.paymentPillText,
                        isSelected && { color: pm.color, fontWeight: '800' },
                      ]}
                    >
                      {pm.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* MORE OPTIONS ACCORDION (Date, Receipt photo, Remarks) */}
          <TouchableOpacity
            style={styles.moreOptionsToggle}
            onPress={() => {
              const next = !showMoreOptions;
              setShowMoreOptions(next);
              if (next) {
                setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
              }
            }}
            activeOpacity={0.75}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ExpoImage
                source={{ uri: ICONS_3D.calendar }}
                style={{ width: 18, height: 18, marginRight: 8 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.moreOptionsText}>
                {showMoreOptions ? 'Hide Extra Details' : '+ Add Bill Photo or Change Date'}
              </Text>
            </View>
            <Ionicons
              name={showMoreOptions ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#94A3B8"
            />
          </TouchableOpacity>

          {showMoreOptions && (
            <View style={styles.sectionCard}>
              {/* Date selection */}
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="calendar-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Transaction Date</Text>
              </View>
              <View style={styles.dateRow}>
                <TouchableOpacity
                  style={[styles.datePill, date === todayStr && styles.datePillActive]}
                  onPress={() => setDate(todayStr)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.datePillText, date === todayStr && styles.datePillTextActive]}>
                    Today
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.datePill, date === yesterdayStr && styles.datePillActive]}
                  onPress={() => setDate(yesterdayStr)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.datePillText, date === yesterdayStr && styles.datePillTextActive]}>
                    Yesterday
                  </Text>
                </TouchableOpacity>

                <TextInput
                  style={styles.customDateInput}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.divider} />

              {/* Bill / Receipt photo */}
              <View style={styles.sectionHeaderRow}>
                <ExpoImage
                  source={{ uri: ICONS_3D.receipt }}
                  style={{ width: 18, height: 18, marginRight: 6 }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
                <Text style={styles.sectionTitle}>Bill / Receipt Photo</Text>
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
                      <Text style={styles.receiptAttachedTitle}>Receipt Attached</Text>
                      <Text style={styles.receiptAttachedSub}>Tap to preview</Text>
                    </View>
                    <Ionicons name="eye-outline" size={20} color="#2563EB" />
                  </TouchableOpacity>

                  <View style={styles.receiptActionsRow}>
                    <TouchableOpacity style={styles.receiptActionBtn} onPress={pickImage}>
                      <Ionicons name="swap-horizontal" size={14} color="#2563EB" style={{ marginRight: 4 }} />
                      <Text style={styles.receiptActionText}>Replace</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.receiptActionBtn}
                      onPress={() => setReceiptImage(null)}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                      <Text style={[styles.receiptActionText, { color: '#EF4444' }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.photoButtonsRow}>
                  <TouchableOpacity style={styles.photoBtn} onPress={pickImage} activeOpacity={0.7}>
                    <ExpoImage
                      source={{ uri: ICONS_3D.gallery }}
                      style={{ width: 20, height: 20, marginRight: 6 }}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                    <Text style={styles.photoBtnText}>Gallery Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} activeOpacity={0.7}>
                    <ExpoImage
                      source={{ uri: ICONS_3D.camera }}
                      style={{ width: 20, height: 20, marginRight: 6 }}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                    <Text style={styles.photoBtnText}>Take Camera</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.divider} />

              {/* Extra remarks */}
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="chatbox-outline" size={15} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Extra Remarks / Tags</Text>
              </View>
              <TextInput
                style={styles.remarksInput}
                placeholder="Remarks, splits, reference #..."
                placeholderTextColor="#94A3B8"
                value={description}
                onChangeText={setDescription}
                multiline
              />
            </View>
          )}
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
                style={{ width: 22, height: 22, marginRight: 8 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text style={styles.saveBtnText}>
                {isSaving
                  ? 'Saving Transaction...'
                  : `Save ${isExpense ? 'Expense' : 'Income'} ${amount ? `• ${curr}${amount}` : ''}`}
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

      {/* ADD CUSTOM PRESET MODAL */}
      <Modal
        visible={presetModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPresetModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.presetModalCard}>
            <View style={styles.presetModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ExpoImage
                  source={{ uri: ICONS_3D.sparkles }}
                  style={{ width: 22, height: 22, marginRight: 8 }}
                  contentFit="contain"
                />
                <Text style={styles.presetModalTitle}>New 1-Tap Preset</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setPresetModalOpen(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Type Toggle: Expense / Income */}
              <View style={styles.presetTypeRow}>
                <TouchableOpacity
                  style={[styles.presetTypeBtn, newPresetType === 'debit' && styles.presetTypeBtnActiveExpense]}
                  onPress={() => {
                    setNewPresetType('debit');
                    setNewPresetCategory('Food');
                  }}
                >
                  <Text style={[styles.presetTypeBtnText, newPresetType === 'debit' && styles.presetTypeBtnTextActive]}>
                    Expense
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.presetTypeBtn, newPresetType === 'credit' && styles.presetTypeBtnActiveIncome]}
                  onPress={() => {
                    setNewPresetType('credit');
                    setNewPresetCategory('Salary');
                  }}
                >
                  <Text style={[styles.presetTypeBtnText, newPresetType === 'credit' && styles.presetTypeBtnTextActive]}>
                    Income
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Preset Label Input */}
              <Text style={styles.modalInputLabel}>Preset Name / Item</Text>
              <TextInput
                style={styles.modalTextInput}
                placeholder="e.g. Chai, Gym, Metro, Milk"
                placeholderTextColor="#94A3B8"
                value={newPresetLabel}
                onChangeText={setNewPresetLabel}
              />

              {/* Preset Amount Input */}
              <Text style={styles.modalInputLabel}>Fixed Amount ({curr})</Text>
              <View style={styles.modalAmountRow}>
                <Text style={styles.modalCurrPrefix}>{curr}</Text>
                <TextInput
                  style={styles.modalAmountInput}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={newPresetAmount}
                  onChangeText={(v) => setNewPresetAmount(v.replace(/[^0-9.]/g, ''))}
                />
              </View>

              {/* Category Selection */}
              <Text style={styles.modalInputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalCatsScroll}>
                {(newPresetType === 'debit'
                  ? categories.map((c) => c.name)
                  : ['Salary', 'Business', 'Freelance', 'Cashback', 'Investments', 'Other']
                ).map((catName) => {
                  const isSel = newPresetCategory.toLowerCase() === catName.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={catName}
                      style={[styles.modalCatChip, isSel && styles.modalCatChipActive]}
                      onPress={() => setNewPresetCategory(catName)}
                    >
                      <Text style={[styles.modalCatChipText, isSel && styles.modalCatChipTextActive]}>
                        {catName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 3D Icon Picker */}
              <Text style={styles.modalInputLabel}>Choose 3D Icon</Text>
              <View style={styles.presetIconGrid}>
                {PRESET_ICONS.slice(0, 16).map((ico) => {
                  const isSel = newPresetIconUrl === ico.url;
                  return (
                    <TouchableOpacity
                      key={ico.name + ico.url}
                      style={[styles.presetIconCell, isSel && styles.presetIconCellActive]}
                      onPress={() => setNewPresetIconUrl(ico.url)}
                    >
                      <ExpoImage source={{ uri: ico.url }} style={{ width: 28, height: 28 }} contentFit="contain" />
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Create Button */}
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveNewPreset}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={newPresetType === 'debit' ? ['#EF4444', '#DC2626'] : ['#10B981', '#059669']}
                  style={styles.modalSaveGradient}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.modalSaveText}>Save Preset</Text>
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
    padding: 16,
  },
  typeSwitchWrap: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 11,
  },
  typeBtnExpenseActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#DC2626',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  typeBtnIncomeActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: '600',
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
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  amountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  amountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  currencyPrefix: {
    fontSize: 34,
    fontWeight: '900',
    marginRight: 4,
  },
  hugeAmountInput: {
    fontSize: 44,
    fontWeight: '900',
    minWidth: 120,
    textAlign: 'center',
    paddingVertical: 0,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    gap: 8,
  },
  quickAmountPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickAmountPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  clearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },

  // Section Cards
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  manageLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  addPresetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  addPresetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },

  // Presets
  presetsScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  presetLabelActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  presetAmount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  presetAmountActive: {
    color: '#B45309',
    fontWeight: '700',
  },
  presetCheckmark: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  // Categories
  categoriesScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  checkDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  // Note Input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 10,
  },

  // Payment Modes
  paymentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  paymentPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  // More Options Accordion
  moreOptionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
    marginBottom: 12,
  },
  moreOptionsText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  datePillActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  datePillText: {
    fontSize: 12,
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  photoBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  receiptAttachedBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  receiptThumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  receiptAttachedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  receiptAttachedSub: {
    fontSize: 11,
    color: '#64748B',
  },
  receiptActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  receiptActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  remarksInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    fontSize: 12,
    color: '#0F172A',
    minHeight: 50,
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
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
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
    paddingVertical: 15,
  },
  saveBtnText: {
    fontSize: 16,
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

  // Preset Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  presetModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  presetModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  presetModalTitle: {
    fontSize: 17,
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
  presetTypeRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  presetTypeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  presetTypeBtnActiveExpense: {
    backgroundColor: '#FEF2F2',
  },
  presetTypeBtnActiveIncome: {
    backgroundColor: '#ECFDF5',
  },
  presetTypeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  presetTypeBtnTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
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
  modalAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
  },
  modalCurrPrefix: {
    fontSize: 16,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 6,
  },
  modalAmountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 10,
  },
  modalCatsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  modalCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCatChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  modalCatChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modalCatChipTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  presetIconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 6,
  },
  presetIconCell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetIconCellActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  modalSaveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 18,
    marginBottom: 10,
  },
  modalSaveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
