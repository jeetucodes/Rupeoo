import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  Alert,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  getAllTransactions,
  sortTransactionsRecentFirst,
  insertTransaction,
  getUserCategories,
  getUserNotifications,
  getRecurringBills,
  saveRecurringBill,
  payRecurringBill,
  deleteRecurringBill,
  checkBillReminders,
  calculateNextCycleDueDate,
  calculateNextMonthlyDueDate,
  RecurringBill,
  CategoryItem,
} from '@/lib/database';
import { useAuth } from '@/context/AuthContext';
import { HomeBannerAd } from '@/lib/ads';
import { checkAndPromptPendingReview, checkFirstTransactionFallback, checkIsReviewPending, hasUserBeenPromptedForReview } from '@/lib/review';
import { useTranslation } from '@/lib/i18n';
import CategoryIcon from '@/components/CategoryIcon';
import PaymentModeIcon from '@/components/PaymentModeIcon';
import Skeleton from '@/components/Skeleton';
import { VipAvatar } from '@/components/VipAvatar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';
import { GooglePlayReviewModal } from '@/components/GooglePlayReviewModal';
import { formatTime12Hour, getLocalDateString, getLocalMonthString, getRelativeDateString } from '@/lib/dateUtils';

const { width, height } = Dimensions.get('window');

const getGreetingInfo = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return { key: 'good_morning', text: 'Good morning', icon: 'sunny', color: '#F59E0B' };
  }
  if (hour >= 12 && hour < 17) {
    return { key: 'good_afternoon', text: 'Good afternoon', icon: 'partly-sunny', color: '#F59E0B' };
  }
  if (hour >= 17 && hour < 21) {
    return { key: 'good_evening', text: 'Good evening', icon: 'sunny-outline', color: '#F97316' };
  }
  return { key: 'good_night', text: 'Good night', icon: 'moon', color: '#8B5CF6' };
};

const formatAmount = (n: number | string) =>
  (typeof n === 'string' ? parseFloat(n) || 0 : (n ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_MODE_ICON: Record<string, string> = {
  UPI: 'flash',
  Cash: 'cash',
  Card: 'card',
  Bank: 'business',
};

const RECHARGE_CYCLES = [
  { days: 28, label: '28 Days (1 Mo)' },
  { days: 56, label: '56 Days (2 Mo)' },
  { days: 84, label: '84 Days (3 Mo)' },
  { days: 365, label: '365 Days (1 Yr)' },
];

export interface BrandProvider {
  id: string;
  name: string;
  badge: string;
  category: string;
  type: 'cycle_days' | 'monthly_date';
  dueDay: string;
  cycleDays: string;
  color: string;
  bgColor: string;
  icon: string;
  group: 'sim' | 'daily' | 'ott' | 'wifi' | 'utility';
}

// ---------------------------------------------------------------------------
// BrandLogo — styled brand icon for each provider in bill cards
// ---------------------------------------------------------------------------
function BrandLogo({ id, color, size = 32 }: { id: string; color: string; size?: number }) {
  const s = size;
  const r = s * 0.35; // border radius scale

  // ── JIO — dark blue circle with "Jio" text ──
  if (id === 'jio' || id === 'jiofiber') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#1239AC', borderRadius: s / 2, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: s * 0.34, fontStyle: 'italic' }]}>Jio</Text>
      </View>
    );
  }

  // ── AIRTEL — white bg, red italic "a" ──
  if (id === 'airtel' || id === 'airtel_xstream') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#FFFFFF', borderRadius: s * 0.3, width: s, height: s, borderWidth: 1.5, borderColor: '#ED1C2425' }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#ED1C24', fontSize: s * 0.56, fontWeight: '900', fontStyle: 'italic' }]}>a</Text>
      </View>
    );
  }

  // ── VI — red rounded square "Vi!" ──
  if (id === 'vi') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#E60000', borderRadius: r, width: s, height: s }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: s * 0.34, fontWeight: '900' }]}>Vi</Text>
          <View style={{ width: s * 0.12, height: s * 0.12, borderRadius: s * 0.06, backgroundColor: '#FFC107', marginBottom: s * 0.06, marginLeft: s * 0.03 }} />
        </View>
      </View>
    );
  }

  // ── BSNL — grey circle with "BSNL" text ──
  if (id === 'bsnl') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#FFFFFF', borderRadius: s * 0.3, width: s, height: s, borderWidth: 1.5, borderColor: '#E2E8F0' }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#003580', fontSize: s * 0.26, fontWeight: '900', letterSpacing: -0.5 }]}>BSNL</Text>
      </View>
    );
  }

  // ── NETFLIX — black rectangle with "N" ──
  if (id === 'netflix') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#000000', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#E50914', fontSize: s * 0.44, fontWeight: '900', fontStyle: 'italic' }]}>N</Text>
      </View>
    );
  }

  // ── AMAZON PRIME ──
  if (id === 'prime') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#00A8E1', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: s * 0.28, fontWeight: '900' }]}>prime</Text>
      </View>
    );
  }

  // ── HOTSTAR ──
  if (id === 'hotstar') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#0C1E3C', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFD700', fontSize: s * 0.4 }]}>★</Text>
      </View>
    );
  }

  // ── SPOTIFY ──
  if (id === 'spotify') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#1DB954', borderRadius: s / 2, width: s, height: s }]}>
        <Ionicons name="musical-notes" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  // ── YOUTUBE ──
  if (id === 'youtube') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#FF0000', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="play" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  // ── APPLE ──
  if (id === 'apple') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#1C1C1E', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="logo-apple" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  // ── ELECTRICITY ──
  if (id === 'electricity') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#F59E0B', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="flash" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  // ── GAS ──
  if (id === 'gas') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#F97316', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="flame" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  // ── RENT ──
  if (id === 'rent') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#10B981', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="home" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  // ── EMI ──
  if (id === 'emi') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#E11D48', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="card" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  // ── GYM ──
  if (id === 'gym') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#10B981', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="barbell" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  // ── TIFFIN ──
  if (id === 'tiffin') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#F97316', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="restaurant" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  // ── MILK ──
  if (id === 'milk') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#0284C7', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="nutrition" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  // ── DEFAULT fallback ──
  return (
    <View style={[brandLogoStyles.base, { backgroundColor: color, borderRadius: r, width: s, height: s }]}>
      <Ionicons name="receipt-outline" size={s * 0.4} color="#FFFFFF" />
    </View>
  );
}

const brandLogoStyles = StyleSheet.create({
  base: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  wordmark: {
    fontWeight: '900',
    letterSpacing: 0,
  },
});

const BRAND_PROVIDERS: BrandProvider[] = [
  // Telecom SIMs
  { id: 'jio', name: 'Jio Mobile Recharge', badge: 'Jio', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#0A2885', bgColor: '#0A288518', icon: 'phone-portrait', group: 'sim' },
  { id: 'airtel', name: 'Airtel Mobile Recharge', badge: 'airtel', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#ED1C24', bgColor: '#ED1C2418', icon: 'phone-portrait', group: 'sim' },
  { id: 'vi', name: 'Vi (Vodafone Idea) Recharge', badge: 'Vi', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#E60000', bgColor: '#E6000018', icon: 'phone-portrait', group: 'sim' },
  { id: 'bsnl', name: 'BSNL Mobile Recharge', badge: 'BSNL', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#005BA6', bgColor: '#005BA618', icon: 'phone-portrait', group: 'sim' },

  // Daily Services, Mess & Food
  { id: 'tiffin', name: 'Tiffin / Mess Service', badge: 'Tiffin', category: 'Food', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#F97316', bgColor: '#F9731618', icon: 'restaurant', group: 'daily' },
  { id: 'milk', name: 'Milk / Dairy Delivery', badge: 'Milk', category: 'Groceries', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#0284C7', bgColor: '#0284C718', icon: 'nutrition', group: 'daily' },
  { id: 'maid', name: 'Maid / House Help Salary', badge: 'Maid', category: 'Bills', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#8B5CF6', bgColor: '#8B5CF618', icon: 'person', group: 'daily' },
  { id: 'ro_water', name: 'RO Water Can / Jar', badge: 'RO Water', category: 'Food', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#06B6D4', bgColor: '#06B6D418', icon: 'water', group: 'daily' },
  { id: 'laundry', name: 'Laundry / Ironing / Dhobi', badge: 'Laundry', category: 'Bills', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#EC4899', bgColor: '#EC489918', icon: 'shirt', group: 'daily' },
  { id: 'newspaper', name: 'Newspaper / Magazine', badge: 'Paper', category: 'Bills', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#64748B', bgColor: '#64748B18', icon: 'newspaper', group: 'daily' },

  // OTT & Subscriptions
  { id: 'netflix', name: 'Netflix Subscription', badge: 'NETFLIX', category: 'Subscriptions', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#E50914', bgColor: '#E5091418', icon: 'film', group: 'ott' },
  { id: 'prime', name: 'Amazon Prime Video', badge: 'Prime', category: 'Subscriptions', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#00A8E1', bgColor: '#00A8E118', icon: 'play-circle', group: 'ott' },
  { id: 'hotstar', name: 'Disney+ Hotstar', badge: 'Hotstar', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#0C1E3C', bgColor: '#0C1E3C18', icon: 'play-circle', group: 'ott' },
  { id: 'spotify', name: 'Spotify Premium', badge: 'Spotify', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#1DB954', bgColor: '#1DB95418', icon: 'musical-notes', group: 'ott' },
  { id: 'youtube', name: 'YouTube Premium', badge: 'YouTube', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#FF0000', bgColor: '#FF000018', icon: 'logo-youtube', group: 'ott' },
  { id: 'apple', name: 'Apple One / iCloud', badge: 'Apple', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#0F172A', bgColor: '#0F172A18', icon: 'logo-apple', group: 'ott' },

  // WiFi & Broadband
  { id: 'jiofiber', name: 'JioFiber Broadband', badge: 'JioFiber', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#0A2885', bgColor: '#0A288518', icon: 'wifi', group: 'wifi' },
  { id: 'airtel_xstream', name: 'Airtel Xstream Fiber', badge: 'Xstream', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#ED1C24', bgColor: '#ED1C2418', icon: 'wifi', group: 'wifi' },
  { id: 'act', name: 'ACT Fibernet', badge: 'ACT', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#E31E24', bgColor: '#E31E2418', icon: 'wifi', group: 'wifi' },
  { id: 'tataplay', name: 'Tata Play DTH / Fiber', badge: 'TataPlay', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#7A1CAC', bgColor: '#7A1CAC18', icon: 'tv', group: 'wifi' },

  // Rent & Utilities
  { id: 'rent', name: 'Flat Rent', badge: 'Rent', category: 'Rent', type: 'monthly_date', dueDay: '30', cycleDays: '28', color: '#10B981', bgColor: '#10B98118', icon: 'home', group: 'utility' },
  { id: 'electricity', name: 'Electricity Bill', badge: 'Bijli', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
  { id: 'gas', name: 'LPG Gas / PNG Bill', badge: 'Gas', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#F97316', bgColor: '#F9731618', icon: 'flame', group: 'utility' },
  { id: 'water', name: 'Water Supply Bill', badge: 'Water', category: 'Bills', type: 'monthly_date', dueDay: '25', cycleDays: '30', color: '#06B6D4', bgColor: '#06B6D418', icon: 'water', group: 'utility' },
  { id: 'tuition', name: 'Tuition / School / Coaching Fees', badge: 'Tuition', category: 'Education', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#3B82F6', bgColor: '#3B82F618', icon: 'school', group: 'utility' },
  { id: 'maintenance', name: 'Society Maintenance', badge: 'Society', category: 'Bills', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#6366F1', bgColor: '#6366F118', icon: 'business', group: 'utility' },
  { id: 'emi', name: 'Loan / Credit Card EMI', badge: 'EMI', category: 'EMI', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#E11D48', bgColor: '#E11D4818', icon: 'card', group: 'utility' },
  { id: 'gym', name: 'Gym / Fitness Membership', badge: 'Gym', category: 'Others', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#10B981', bgColor: '#10B98118', icon: 'barbell', group: 'utility' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DashboardScreen() {
  const { user, settings, isPremium, appConfig } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  


  const curr = settings?.currency === 'INR' ? '₹' : (settings?.currency || '₹');
  const monthlyBudget = Number(settings?.monthlyBudget) || 0;

  const todayStr = useMemo(() => getLocalDateString(), []);

  const [totalSpend, setTotalSpend] = useState<number>(0);
  const [totalCredit, setTotalCredit] = useState<number>(0);
  const [thisMonthSpend, setThisMonthSpend] = useState<number>(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [hideBalance, setHideBalance] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add Bill Modal State
  const [addBillModalVisible, setAddBillModalVisible] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('jio');
  const [selectedGroupTab, setSelectedGroupTab] = useState<'sim' | 'daily' | 'ott' | 'wifi' | 'utility'>('sim');
  const [billTitle, setBillTitle] = useState('Jio Mobile Recharge');
  const [billAmount, setBillAmount] = useState('');
  const [billType, setBillType] = useState<'monthly_date' | 'cycle_days'>('cycle_days');
  const [billDueDay, setBillDueDay] = useState('30');
  const [billRechargeDate, setBillRechargeDate] = useState(todayStr);
  const [billCycleDays, setBillCycleDays] = useState('28');
  const [billCategory, setBillCategory] = useState('Subscriptions');
  const [billNotes, setBillNotes] = useState('');
  const [isSavingBill, setIsSavingBill] = useState(false);

  // All Subscriptions Manager Modal State
  const [allBillsModalVisible, setAllBillsModalVisible] = useState(false);

  // Calendar Picker Modal State
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calViewYear, setCalViewYear] = useState(new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(new Date().getMonth());

  // Pay Bill Modal State
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [selectedBillToPay, setSelectedBillToPay] = useState<RecurringBill | null>(null);
  const [payMode, setPayMode] = useState('UPI');
  const [payReceiptImage, setPayReceiptImage] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  // Custom Delete Dialog State
  const [billToDelete, setBillToDelete] = useState<RecurringBill | null>(null);
  const [isDeletingBill, setIsDeletingBill] = useState(false);

  // Google Play Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isExistingUserReview, setIsExistingUserReview] = useState(false);

  // Smooth Multi-Phase Pastel Color Flow & Soft Light Gleam for Total Balance Card
  const colorAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const billsPulseAnim = useRef(new Animated.Value(0)).current;
  const billsShimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Smooth, relaxed 60s continuous pastel color transition (Very Slow)
    const colorLoop = Animated.loop(
      Animated.timing(colorAnim, {
        toValue: 5,
        duration: 60000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );

    // 2. Elegant diagonal light gleam / sheen wave that glides across every 5s
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2800,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.delay(2200),
      ])
    );

    const billsPulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(billsPulseAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(billsPulseAnim, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // 3. Smooth continuous ambient light shimmer for Upcoming Bills card
    const billsShimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(billsShimmerAnim, {
          toValue: 1,
          duration: 2600,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.delay(1800),
      ])
    );

    colorLoop.start();
    shimmerLoop.start();
    billsPulseLoop.start();
    billsShimmerLoop.start();

    return () => {
      colorLoop.stop();
      shimmerLoop.stop();
      billsPulseLoop.stop();
      billsShimmerLoop.stop();
    };
  }, [billsPulseAnim, billsShimmerAnim, colorAnim, shimmerAnim]);

  // Card Background Color Interpolation
  const animatedCardBg = colorAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4, 5],
    outputRange: [
      '#D5F9E3', // Mint / Seafoam
      '#CFFAFE', // Soft Sky / Cyan
      '#EDE9FE', // Lavender / Soft Violet
      '#FFEDD5', // Warm Peach / Apricot
      '#FFE4E6', // Soft Rose / Blush
      '#D5F9E3', // Loop back to Mint
    ],
  });

  // Smooth diagonal light sheen sweep
  const shimmerStyle = {
    transform: [
      {
        translateX: shimmerAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-240, 480],
        }),
      },
      { rotate: '25deg' },
    ],
    opacity: shimmerAnim.interpolate({
      inputRange: [0, 0.1, 0.5, 0.9, 1],
      outputRange: [0, 0.35, 0.65, 0.35, 0],
    }),
  };

  const billsCircleStyle = {
    opacity: billsPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.16] }),
    transform: [{ scale: billsPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }) }],
  };



  const loadData = async (forceRefresh = false) => {
    if (!user?.uid) return;
    try {
      const [allTxs, userCats, notifs, bills] = await Promise.all([
        getAllTransactions(user.uid, forceRefresh),
        getUserCategories(user.uid, forceRefresh),
        getUserNotifications(user.uid, forceRefresh).catch(() => []),
        getRecurringBills(user.uid, forceRefresh).catch(() => []),
      ]);

      setCategories(userCats);
      setUnreadNotifications(notifs.filter((n: any) => !n.isRead).length);
      setRecurringBills(bills);

      let totalS = 0;
      let totalC = 0;
      let curMonthS = 0;
      const currentMonthKey = getLocalMonthString();

      allTxs.forEach((tx: any) => {
        const amt = Number(tx.amount) || 0;
        if (tx.type === 'debit') {
          totalS += amt;
          if (tx.date && tx.date.startsWith(currentMonthKey)) {
            curMonthS += amt;
          }
        } else {
          totalC += amt;
        }
      });

      setTotalSpend(totalS);
      setTotalCredit(totalC);
      setThisMonthSpend(curMonthS);
      setTransactions(sortTransactionsRecentFirst(allTxs));

      // Trigger automatic 3-day reminder checks & budget alerts
      checkBillReminders(user.uid).catch(() => {});

      // Ensure welcome notification & daily routine reminders are scheduled
      import('@/lib/notifications').then(({ sendWelcomeNotification, setupPeriodicSmartNotifications }) => {
        sendWelcomeNotification(user.uid).catch(() => {});
        setupPeriodicSmartNotifications().catch(() => {});
      }).catch(() => {});

      // Check and show Google Play Review modal if user hasn't reviewed yet
      checkIsReviewPending(user.uid).then((pending) => {
        if (pending) {
          setIsExistingUserReview(false);
          setTimeout(() => {
            setShowReviewModal(true);
          }, 800);
        } else if (allTxs.length >= 1) {
          hasUserBeenPromptedForReview(user.uid).then((alreadyPrompted) => {
            if (!alreadyPrompted) {
              setIsExistingUserReview(allTxs.length > 1);
              setTimeout(() => {
                setShowReviewModal(true);
              }, 1200);
            }
          }).catch(() => {});
        }
      }).catch(() => {});
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [user?.uid])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const startingBalance = Number((user as any)?.startingBalance) || 0;
  const netBalance = startingBalance + totalCredit - totalSpend;
  const userName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const firstName = userName.split(' ')[0];
  const initial = userName[0]?.toUpperCase() || 'U';
  const greetingInfo = getGreetingInfo();

  // Helper for Bill due calculations
  const getBillDueStatus = (dueDateStr: string) => {
    if (!dueDateStr) return { label: 'Due soon', color: '#6B7280', daysLeft: 0, isDueSoon: false };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue (${Math.abs(diffDays)}d)`, color: '#EF4444', daysLeft: diffDays, isDueSoon: true };
    }
    if (diffDays === 0) {
      return { label: 'Due Today 🚨', color: '#EF4444', daysLeft: 0, isDueSoon: true };
    }
    if (diffDays <= 3) {
      return { label: `Due in ${diffDays}d ⏰`, color: '#F59E0B', daysLeft: diffDays, isDueSoon: true };
    }
    if (diffDays <= 10) {
      return { label: `Due in ${diffDays}d`, color: '#3B82F6', daysLeft: diffDays, isDueSoon: true };
    }
    return { label: `Due in ${diffDays}d`, color: '#10B981', daysLeft: diffDays, isDueSoon: false };
  };

  // Helper to resolve Brand Meta for any bill
  const getBrandMetaForBill = (bill: RecurringBill) => {
    if (bill.provider) {
      const match = BRAND_PROVIDERS.find(p => p.id === bill.provider);
      if (match) return match;
    }
    const titleLower = bill.title.toLowerCase();
    const matchByTitle = BRAND_PROVIDERS.find(p => titleLower.includes(p.id) || titleLower.includes(p.badge.toLowerCase()));
    if (matchByTitle) return matchByTitle;

    // Fallbacks
    const isRent = titleLower.includes('rent');
    const isRecharge = bill.type === 'cycle_days' || titleLower.includes('recharge');
    const isTiffin = titleLower.includes('tiffin') || titleLower.includes('mess');
    return {
      id: 'custom',
      name: bill.title,
      badge: isRent ? 'Rent' : isRecharge ? 'SIM' : isTiffin ? 'Tiffin' : 'Bill',
      color: isRent ? '#10B981' : isRecharge ? '#3B82F6' : isTiffin ? '#F97316' : '#6366F1',
      bgColor: isRent ? '#10B98118' : isRecharge ? '#3B82F618' : isTiffin ? '#F9731618' : '#6366F118',
      icon: isRent ? 'home' : isRecharge ? 'phone-portrait' : isTiffin ? 'restaurant' : 'receipt',
    };
  };

  // Home Screen Carousel: ONLY SHOW BILLS DUE IN <= 10 DAYS
  const homeUpcomingBills = useMemo(() => {
    return recurringBills.filter(bill => {
      const status = getBillDueStatus(bill.nextDueDate);
      return status.daysLeft <= 10; // Shows when 10 days remain, due today, or overdue
    });
  }, [recurringBills]);

  // Next future bill if none due in 10 days
  const nextFutureBill = useMemo(() => {
    if (recurringBills.length === 0) return null;
    return recurringBills[0]; // sorted ascending by nextDueDate
  }, [recurringBills]);

  // Total monthly commitment
  const totalCommitment = useMemo(() => {
    return recurringBills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
  }, [recurringBills]);

  // Today's summary
  const todaySummary = useMemo(() => {
    let spend = 0;
    let count = 0;
    transactions.forEach(tx => {
      if (tx.date === todayStr && tx.type === 'debit') {
        spend += Number(tx.amount) || 0;
        count += 1;
      }
    });
    return { spend, count };
  }, [transactions, todayStr]);

  // Top spending categories
  const topCategories = useMemo(() => {
    const map: Record<string, number> = {};
    let totalExpense = 0;
    transactions.forEach(tx => {
      if (tx.type === 'debit') {
        const cat = tx.category || 'Others';
        const amt = Number(tx.amount) || 0;
        map[cat] = (map[cat] || 0) + amt;
        totalExpense += amt;
      }
    });

    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amt]) => {
        const cat = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
        const pct = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
        return {
          name,
          amt,
          pct,
          icon: cat?.icon || 'receipt-outline',
          color: cat?.color || '#FF6B6B',
        };
      });
  }, [transactions, categories]);

  const budgetInfo = useMemo(() => {
    const progress = monthlyBudget > 0 ? Math.min(100, Math.round((thisMonthSpend / monthlyBudget) * 100)) : 0;
    const remaining = Math.max(0, monthlyBudget - thisMonthSpend);
    const isOver = monthlyBudget > 0 && thisMonthSpend > monthlyBudget;
    const overAmount = isOver ? thisMonthSpend - monthlyBudget : 0;

    let statusColor = '#10B981';
    if (isOver) {
      statusColor = '#EF4444';
    } else if (progress >= 80) {
      statusColor = '#F59E0B';
    }

    return {
      progress,
      remaining,
      isOver,
      overAmount,
      statusColor,
    };
  }, [monthlyBudget, thisMonthSpend]);

  const filteredTransactions = useMemo(() => {
    const list = selectedCategory === 'All'
      ? transactions
      : transactions.filter(
          tx => (tx.category || 'Others').toLowerCase() === selectedCategory.toLowerCase()
        );
    return sortTransactionsRecentFirst(list);
  }, [transactions, selectedCategory]);

  const recentTransactions = useMemo(() => {
    return sortTransactionsRecentFirst(filteredTransactions).slice(0, 8);
  }, [filteredTransactions]);

  const topCategoryData = useMemo(() => {
    if (transactions.length === 0) return null;
    const debitTxs = transactions.filter(t => t.type === 'debit');
    if (debitTxs.length === 0) return null;
    const catMap: Record<string, number> = {};
    let total = 0;
    debitTxs.forEach(t => {
      const amt = Number(t.amount) || 0;
      const cat = t.category || 'Others';
      catMap[cat] = (catMap[cat] || 0) + amt;
      total += amt;
    });
    const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    const [topName, topAmt] = sorted[0];
    const topPct = total > 0 ? Math.round((topAmt / total) * 100) : 0;
    return { name: topName, amount: topAmt, percentage: topPct, total };
  }, [transactions]);

  const getCategoryMeta = (catName: string) => {
    const cat = categories.find(c => c.name.toLowerCase() === (catName || '').toLowerCase());
    return { icon: cat?.icon || 'receipt-outline', color: cat?.color || '#FF6B6B' };
  };

  // Live calculation preview for modal
  const livePreviewData = useMemo(() => {
    if (billType === 'monthly_date') {
      const day = parseInt(billDueDay) || 30;
      const nextDue = calculateNextMonthlyDueDate(day);
      const status = getBillDueStatus(nextDue);
      return {
        nextDue,
        statusLabel: status.label,
        statusColor: status.color,
        desc: `Repeats every month on ${day}th`,
      };
    } else {
      const cycle = parseInt(billCycleDays) || 28;
      const nextDue = calculateNextCycleDueDate(cycle, billRechargeDate || todayStr);
      const status = getBillDueStatus(nextDue);
      return {
        nextDue,
        statusLabel: status.label,
        statusColor: status.color,
        desc: `${cycle} days validity cycle from ${billRechargeDate}`,
      };
    }
  }, [billType, billDueDay, billCycleDays, billRechargeDate, todayStr]);

  // Calendar Grid builder
  const calendarDays = useMemo(() => {
    const totalDays = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calViewYear, calViewMonth, 1).getDay(); // 0 is Sunday

    const daysArr: { dayNumber: number | null; dateStr: string | null }[] = [];

    // Empty cells before first day
    for (let i = 0; i < firstDayIndex; i++) {
      daysArr.push({ dayNumber: null, dateStr: null });
    }

    // Actual day cells
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(calViewMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      daysArr.push({
        dayNumber: d,
        dateStr: `${calViewYear}-${mStr}-${dStr}`,
      });
    }

    return daysArr;
  }, [calViewYear, calViewMonth]);

  const handlePrevMonth = () => {
    if (calViewMonth === 0) {
      setCalViewMonth(11);
      setCalViewYear(prev => prev - 1);
    } else {
      setCalViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calViewMonth === 11) {
      setCalViewMonth(0);
      setCalViewYear(prev => prev + 1);
    } else {
      setCalViewMonth(prev => prev + 1);
    }
  };

  const handleSelectDateFromCalendar = (dateStr: string) => {
    setBillRechargeDate(dateStr);
    setCalendarModalVisible(false);
  };

  const handleSelectProvider = (p: BrandProvider) => {
    setSelectedProviderId(p.id);
    setBillTitle(p.name);
    setBillType(p.type);
    setBillCategory(p.category);
    setBillDueDay(p.dueDay);
    setBillCycleDays(p.cycleDays);
  };

  // Pick receipt screenshot
  const pickReceiptForBill = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const base64 = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setPayReceiptImage(base64);
      }
    } catch (err) {
      console.warn('Image picker error:', err);
    }
  };

  // Delete bill - opens beautiful custom dialog
  const handleDeleteBill = (bill: RecurringBill | null) => {
    if (!bill) return;
    setBillToDelete(bill);
  };

  const handleConfirmDeleteBill = async () => {
    if (!billToDelete || !user?.uid || !billToDelete.id) return;
    try {
      setIsDeletingBill(true);
      await deleteRecurringBill(user.uid, billToDelete.id);
      if (selectedBillToPay?.id === billToDelete.id) {
        setPayModalVisible(false);
        setSelectedBillToPay(null);
      }
      setBillToDelete(null);
      Toast.show({
        type: 'success',
        text1: 'Reminder Removed ✅',
        text2: `"${billToDelete.title}" deleted successfully`,
      });
      loadData();
    } catch (err: any) {
      console.error('Delete Reminder Error:', err);
      Toast.show({
        type: 'error',
        text1: 'Delete Failed',
        text2: err.message || 'Failed to delete reminder',
      });
    } finally {
      setIsDeletingBill(false);
    }
  };

  // Save new recurring bill
  const handleSaveBill = async () => {
    if (!billTitle.trim()) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter a title (e.g. Jio Recharge)' });
      return;
    }
    const amt = parseFloat(billAmount);
    if (isNaN(amt) || amt <= 0) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter a valid amount' });
      return;
    }

    try {
      setIsSavingBill(true);
      if (!user?.uid) return;

      const providerObj = BRAND_PROVIDERS.find(p => p.id === selectedProviderId);

      let nextDue = '';
      if (billType === 'monthly_date') {
        const dueDayNum = parseInt(billDueDay) || 30;
        nextDue = calculateNextMonthlyDueDate(dueDayNum);
      } else {
        const cycleNum = parseInt(billCycleDays) || 28;
        nextDue = calculateNextCycleDueDate(cycleNum, billRechargeDate || todayStr);
      }

      await saveRecurringBill(user.uid, {
        title: billTitle.trim(),
        amount: amt,
        category: billCategory,
        type: billType,
        provider: selectedProviderId,
        brandColor: providerObj?.color || '#0F172A',
        brandBadge: providerObj?.badge || 'Bill',
        dueDay: billType === 'monthly_date' ? parseInt(billDueDay) || 30 : undefined,
        cycleDays: billType === 'cycle_days' ? parseInt(billCycleDays) || 28 : undefined,
        startDate: billType === 'cycle_days' ? billRechargeDate : todayStr,
        notes: billNotes.trim() || undefined,
        nextDueDate: nextDue,
      });

      setAddBillModalVisible(false);
      setBillTitle('Jio Mobile Recharge');
      setBillAmount('');
      setBillNotes('');
      loadData();
      
      // Schedule local push notification
      import('@/lib/notifications').then(({ scheduleBillReminder }) => {
        scheduleBillReminder(billTitle, amt, new Date(nextDue), curr).catch(console.error);
      });

      Toast.show({ type: 'success', text1: 'Reminder Saved', text2: 'Bill successfully added to your dashboard' });
    } catch (err: any) {
      console.error('Save bill error:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to save bill' });
    } finally {
      setIsSavingBill(false);
    }
  };

  // Mark bill as paid with optional screenshot
  const handleMarkBillPaid = async () => {
    if (!user?.uid || !selectedBillToPay) return;
    try {
      setIsPaying(true);
      await payRecurringBill(user.uid, selectedBillToPay, payMode, payReceiptImage || undefined);
      setPayModalVisible(false);
      setSelectedBillToPay(null);
      setPayReceiptImage(null);
      loadData();
      Toast.show({ type: 'success', text1: 'Success ✅', text2: `${selectedBillToPay.title} payment recorded & next renewal scheduled!` });
    } catch (err: any) {
      console.error('Record Payment error:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to record payment' });
    } finally {
      setIsPaying(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Skeleton width={44} height={44} borderRadius={22} style={{ marginRight: 12 }} />
            <View>
              <Skeleton width={100} height={14} style={{ marginBottom: 6 }} />
              <Skeleton width={140} height={18} />
            </View>
          </View>
          <Skeleton width={40} height={40} borderRadius={20} />
        </View>
        
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Balance Card Skeleton */}
          <View style={[styles.balanceCard, { backgroundColor: '#F0EEE7' }]}>
            <Skeleton width={120} height={20} style={{ marginBottom: 16 }} color="rgba(15,23,42,0.06)" />
            <Skeleton width={220} height={44} style={{ marginBottom: 24 }} color="rgba(15,23,42,0.06)" />
            <View style={styles.cashflowRow}>
              <Skeleton width="48%" height={65} borderRadius={16} color="rgba(15,23,42,0.06)" />
              <Skeleton width="48%" height={65} borderRadius={16} color="rgba(15,23,42,0.06)" />
            </View>
          </View>

          {/* Today's Activity & Bills Quick Button Skeleton */}
          <Skeleton width={200} height={38} borderRadius={20} style={{ marginHorizontal: 20, marginBottom: 14 }} />
          <Skeleton width="100%" height={68} borderRadius={20} style={{ marginHorizontal: 20, width: width - 40, marginBottom: 20 }} />

          {/* Recent Transactions Skeleton */}
          <View style={styles.sectionHeaderRow}>
            <Skeleton width={150} height={20} />
            <Skeleton width={60} height={16} />
          </View>
          <View style={styles.transactionsListCard}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' }}>
                <Skeleton width={44} height={44} borderRadius={22} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Skeleton width={130} height={16} style={{ marginBottom: 6 }} />
                  <Skeleton width={80} height={14} />
                </View>
                <Skeleton width={70} height={16} />
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />

      {/* SLEEK PREMIUM HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => router.push('/edit-profile')}
          activeOpacity={0.8}
        >
          <View style={{ marginRight: 12 }}>
            <VipAvatar
              photoURL={user?.photoURL}
              name={user?.displayName}
              email={user?.email}
              isPremium={isPremium}
              size={46}
              badgeType={isPremium ? 'vip' : 'online'}
            />
          </View>

          <View style={styles.userTextCol}>
            <View style={styles.greetingRow}>
              <Ionicons
                name={greetingInfo.icon as any}
                size={13}
                color={greetingInfo.color}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.greetingText}>{t(greetingInfo.key)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.userNameText} numberOfLines={1}>
                {firstName}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              setUnreadNotifications(0);
              router.push('/notifications');
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color="#1E293B" />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#0F172A']}
            tintColor="#0F172A"
          />
        }
      >
        {/* HERO TOTAL BALANCE CARD (PREMIUM ANIMATED PASTEL WITH SUBTLE LIGHT SHEEN) */}
        <Animated.View style={[styles.balanceCard, { backgroundColor: animatedCardBg }]}>
          {/* Smooth Diagonal Shimmer Gleam */}
          <Animated.View style={[styles.shimmerBeam, shimmerStyle]} pointerEvents="none" />

          {/* Header Row: Label Pill (Image Style: ✦ TOTAL BALANCE) & Action Controls */}
          <View style={styles.balanceTopRow}>
            <View style={styles.balanceLabelWrap}>
              <Ionicons name="sparkles" size={12} color="#0F172A" style={{ marginRight: 4 }} />
              <Text style={styles.balanceLabel}>
                {t('total_balance').toUpperCase()}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {monthlyBudget > 0 && (
                <TouchableOpacity 
                  onPress={() => router.push('/budget')} 
                  activeOpacity={0.7}
                  style={styles.budgetRingBtn}
                >
                  <Svg width="38" height="38" viewBox="0 0 38 38">
                    <Circle cx="19" cy="19" r="15" stroke="rgba(15, 23, 42, 0.08)" strokeWidth="3" fill="none" />
                    <Circle 
                      cx="19" 
                      cy="19" 
                      r="15" 
                      stroke={budgetInfo.statusColor} 
                      strokeWidth="3" 
                      fill="none" 
                      strokeDasharray={2 * Math.PI * 15} 
                      strokeDashoffset={2 * Math.PI * 15 * (1 - budgetInfo.progress / 100)} 
                      strokeLinecap="round" 
                      transform="rotate(-90 19 19)"
                    />
                  </Svg>
                  <View style={{ position: 'absolute' }}>
                    <Text style={styles.budgetRingText}>{budgetInfo.progress}%</Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setHideBalance(!hideBalance)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={hideBalance ? 'eye-off' : 'eye'}
                  size={16}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Main Balance Display */}
          <View style={styles.balanceAmountWrap}>
            <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {hideBalance ? '••••••••' : `${curr}${formatAmount(netBalance)}`}
            </Text>
          </View>

          {/* Income & Expense Split Cards */}
          <View style={styles.cashflowRow}>
            <View style={styles.incomeCard}>
              <View style={styles.incomeIconCircle}>
                <ExpoImage
                  source={{ uri: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Money%20Bag.png' }}
                  style={{ width: 18, height: 18 }}
                  contentFit="contain"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.incomeLabel}>{t('income')}</Text>
                <Text style={styles.incomeValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                  +{curr}{formatAmount(totalCredit)}
                </Text>
              </View>
            </View>

            <View style={styles.expenseCard}>
              <View style={styles.expenseIconCircle}>
                <ExpoImage
                  source={{ uri: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Money%20with%20Wings.png' }}
                  style={{ width: 18, height: 18 }}
                  contentFit="contain"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseLabel}>{t('expenses')}</Text>
                <Text style={styles.expenseValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                  -{curr}{formatAmount(totalSpend)}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* TODAY'S ACTIVITY WIDGET */}
        <View style={styles.todayWidgetRow}>
          <View style={styles.todayWidget}>
            {/* Wallet icon for today's spending */}
            <View style={styles.todayWidgetIconOuter}>
              <View style={styles.todayWidgetIconInner}>
                <Ionicons name="wallet" size={17} color="#C2410C" />
              </View>
            </View>
            <View style={styles.todayWidgetTextWrap}>
              <Text style={styles.todayWidgetLabel}>{t('spent_today')}</Text>
              <Text style={styles.todayWidgetCount}>{todaySummary.count} {todaySummary.count === 1 ? t('transaction') : t('transactions')}</Text>
            </View>
            <View style={styles.todayWidgetDivider} />
            <Text style={styles.todayWidgetAmount}>
              {curr}{formatAmount(todaySummary.spend)}
            </Text>
          </View>
        </View>

        {/* QUICK ACCESS: UPCOMING BILLS & SMART QR PAY */}
        <View style={styles.quickTwoBtnsRow}>

          {/* 1. UPCOMING BILLS CARD */}
          <TouchableOpacity
            style={[
              styles.quickActionTile,
              homeUpcomingBills.length > 0 ? styles.quickTileAlertBorder : styles.quickTileBillsBorder,
            ]}
            onPress={() => router.push('/reminders')}
            activeOpacity={0.85}
          >
            {/* Background gradient — static, no shimmer */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <LinearGradient
                colors={
                  homeUpcomingBills.length > 0
                    ? ['#FFF0F0', '#FFFFFF']
                    : ['#EFF6FF', '#FFFFFF']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </View>

            {/* Decorative corner orb */}
            <View style={[styles.tileDecorOrb, {
              backgroundColor: homeUpcomingBills.length > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(59,130,246,0.06)',
            }]} />

            {/* Top: 3D Icon + Badge */}
            <View style={styles.tileHeaderRow}>

              {/* Premium layered icon — Bills */}
              <View style={[
                styles.tile3dIconOuter,
                homeUpcomingBills.length > 0
                  ? { shadowColor: '#EF4444' }
                  : { shadowColor: '#3B82F6' },
              ]}>
                <LinearGradient
                  colors={
                    homeUpcomingBills.length > 0
                      ? ['#FEE2E2', '#FECACA']
                      : ['#DBEAFE', '#BFDBFE']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.tile3dIconInner}
                >
                  <View style={styles.tile3dIconHighlight} />
                  <Ionicons
                    name={
                      homeUpcomingBills.length > 0
                        ? 'notifications'
                        : recurringBills.length > 0
                        ? 'calendar'
                        : 'calendar-clear'
                    }
                    size={22}
                    color={
                      homeUpcomingBills.length > 0 ? '#DC2626' : '#2563EB'
                    }
                  />
                </LinearGradient>
                {homeUpcomingBills.length > 0 && (
                  <View style={styles.tile3dAlertDot} />
                )}
              </View>

              {/* Badge */}
              {homeUpcomingBills.length > 0 ? (
                <View style={styles.tileDueBadge}>
                  <View style={styles.billsDueDot} />
                  <Text style={styles.tileDueBadgeText}>{homeUpcomingBills.length} Due</Text>
                </View>
              ) : recurringBills.length > 0 ? (
                <View style={styles.tilePaidBadge}>
                  <Ionicons name="checkmark-circle" size={10} color="#059669" style={{ marginRight: 2 }} />
                  <Text style={styles.tilePaidBadgeText}>{recurringBills.length} Active</Text>
                </View>
              ) : (
                <View style={styles.tileTrackBadge}>
                  <Ionicons name="flash-outline" size={10} color="#6366F1" style={{ marginRight: 2 }} />
                  <Text style={styles.tileTrackBadgeText}>{t('auto_alerts')}</Text>
                </View>
              )}
            </View>

            {/* Middle: Amount pill (if due) */}
            {homeUpcomingBills.length > 0 && (
              <View style={styles.tileAmountPill}>
                <Text style={styles.tileAmountPillText}>
                  {curr}{formatAmount(homeUpcomingBills[0].amount)}
                </Text>
                <Text style={styles.tileAmountPillSep}>•</Text>
                <Text style={[styles.tileAmountPillStatus, { color: '#DC2626' }]}>
                  {getBillDueStatus(homeUpcomingBills[0].nextDueDate).label}
                </Text>
              </View>
            )}

            {/* Bottom: Title & Subtitle */}
            <View style={styles.tileTextWrap}>
              <View style={styles.tileTitleRow}>
                <Text style={styles.tileTitle} numberOfLines={1}>{t('upcoming_bills')}</Text>
                <Ionicons name="chevron-forward" size={13} color="#94A3B8" />
              </View>
              <Text style={styles.tileSubtitle} numberOfLines={2}>
                {homeUpcomingBills.length > 0
                  ? `${homeUpcomingBills.length > 1 ? homeUpcomingBills.length - 1 + ' more pending' : 'Tap to view & pay'}`
                  : recurringBills.length > 0
                  ? nextFutureBill
                    ? `Next: ${curr}${formatAmount(nextFutureBill.amount)} • ${getBillDueStatus(nextFutureBill.nextDueDate).label}`
                    : t('all_bills_clear')
                  : t('track_dues_desc')}
              </Text>
            </View>
          </TouchableOpacity>

          {/* 2. SMART QR PAY CARD */}
          <TouchableOpacity
            style={[styles.quickActionTile, styles.splitQrTileBorder]}
            onPress={() => router.push('/split-qr' as any)}
            activeOpacity={0.85}
          >
            {/* Background gradient */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <LinearGradient
                colors={['#FAF5FF', '#FFFFFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </View>

            {/* Decorative corner orb */}
            <View style={[styles.tileDecorOrb, { backgroundColor: 'rgba(124,58,237,0.06)' }]} />

            {/* Top: 3D Icon + Badge */}
            <View style={styles.tileHeaderRow}>

              {/* Premium layered icon — QR Pay */}
              <View style={[styles.tile3dIconOuter, { shadowColor: '#7C3AED' }]}>
                <LinearGradient
                  colors={['#EDE9FE', '#DDD6FE']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.tile3dIconInner}
                >
                  <View style={styles.tile3dIconHighlight} />
                  <Ionicons name="qr-code" size={22} color="#7C3AED" />
                </LinearGradient>
              </View>

              <View style={styles.tileQrBadge}>
                <Ionicons name="shield-checkmark" size={9} color="#7C3AED" style={{ marginRight: 2 }} />
                <Text style={styles.tileQrBadgeText}>MDR FREE</Text>
              </View>
            </View>

            {/* Middle: Feature highlight pill */}
            <View style={[styles.tileAmountPill, { backgroundColor: '#F3E8FF', borderColor: '#E9D5FF' }]}>
              <Ionicons name="flash" size={10} color="#7C3AED" style={{ marginRight: 4 }} />
              <Text style={[styles.tileAmountPillText, { color: '#7C3AED' }]}>UPI Split</Text>
              <Text style={styles.tileAmountPillSep}>•</Text>
              <Text style={[styles.tileAmountPillStatus, { color: '#7C3AED' }]}>Instant</Text>
            </View>

            {/* Bottom: Title & Subtitle */}
            <View style={styles.tileTextWrap}>
              <View style={styles.tileTitleRow}>
                <Text style={styles.tileTitle} numberOfLines={1}>Smart QR Pay</Text>
                <Ionicons name="chevron-forward" size={13} color="#94A3B8" />
              </View>
              <Text style={[styles.tileSubtitle, { color: '#7C3AED' }]} numberOfLines={2}>
                Max ₹2,000 / QR • Save cards
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* GOOGLE ADMOB HOME BANNER */}
        <HomeBannerAd />

        {/* RECENT TRANSACTIONS HEADER */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t('recent_transaction')}</Text>
          <TouchableOpacity onPress={() => router.push('/transactions')} activeOpacity={0.7}>
            <Text style={styles.seeAllLink}>{t('see_all')} →</Text>
          </TouchableOpacity>
        </View>


        {/* RECENT TRANSACTIONS LIST */}
        {recentTransactions.length > 0 ? (
          <View style={styles.transactionsListCard}>
            {recentTransactions.map((tx: any, idx: number) => {
              const meta = getCategoryMeta(tx.category);
              const isCredit = tx.type === 'credit';
              const isLast = idx === recentTransactions.length - 1;
              const pmodeIcon = PAYMENT_MODE_ICON[tx.payment_mode] || 'cash';
              const hasProof = Boolean(tx.receipt_image || tx.receiptImage);

              return (
                <TouchableOpacity
                  key={tx.id || idx}
                  style={[styles.txItem, !isLast && styles.txItemBorder]}
                  onPress={() => router.push(`/transaction/${tx.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.txIconCircle, { backgroundColor: meta.color + '15', overflow: 'hidden' }]}>
                    <CategoryIcon categoryName={tx.category || 'Others'} iconName={meta.icon} size={22} color={meta.color} />
                  </View>

                  <View style={styles.txMainInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.txMerchantName} numberOfLines={1}>
                        {tx.merchant_name || tx.category || 'Transaction'}
                      </Text>
                      {hasProof && (
                        <View style={styles.proofBadge}>
                          <Ionicons name="image" size={11} color="#2563EB" />
                        </View>
                      )}
                    </View>
                    <View style={styles.txSubRow}>
                      <Text style={styles.txDate}>{tx.date}</Text>
                      {Boolean(tx.time) && <Text style={styles.txTime}> • {formatTime12Hour(tx.time)}</Text>}
                      <View style={[styles.txModePill, { flexDirection: 'row', alignItems: 'center' }]}>
                        <PaymentModeIcon mode={tx.payment_mode || 'Cash'} size={11} color="#64748B" style={{ marginRight: 4 }} />
                        <Text style={styles.txModeText}>{tx.payment_mode || 'Cash'}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.txAmountCol}>
                    <Text
                      style={[
                        styles.txAmountText,
                        { color: isCredit ? '#10B981' : '#0F172A' },
                      ]}
                    >
                      {isCredit ? '+' : '-'}{curr}{Number(tx.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.txTypeText, { color: isCredit ? '#10B981' : '#94A3B8' }]}>
                      {isCredit ? 'Income' : tx.category || 'Expense'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBg}>
              <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>{t('no_transactions_found')}</Text>
            <Text style={styles.emptySub}>
              {selectedCategory !== 'All'
                ? `No transactions found under ${selectedCategory}`
                : t('recent_expenses_appear')}
            </Text>
            <TouchableOpacity
              style={styles.addFirstBtn}
              onPress={() => router.push('/add')}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={16} color="#0F172A" style={{ marginRight: 6 }} />
              <Text style={styles.addFirstBtnText}>{t('add_transaction')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ALL ACTIVE PLANS & SUBSCRIPTIONS MANAGER MODAL ("KYA KYA LIYA HAI & JAB DATE AANI HAI") */}
      <Modal visible={allBillsModalVisible} animationType="slide" transparent onRequestClose={() => setAllBillsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>All Subscriptions & Plans</Text>
                <Text style={styles.modalSubtitle}>
                  {recurringBills.length} Active Plans • {curr}{formatAmount(totalCommitment)} monthly
                </Text>
              </View>
              <TouchableOpacity onPress={() => setAllBillsModalVisible(false)} style={styles.modalCloseIconBtn}>
                <Ionicons name="close" size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {recurringBills.length > 0 ? (
                recurringBills.map(bill => {
                  const status = getBillDueStatus(bill.nextDueDate);
                  const brand = getBrandMetaForBill(bill);

                  return (
                    <View key={bill.id} style={styles.allPlansCard}>
                      <View style={styles.allPlansTop}>
                        <BrandLogo id={brand.id} color={brand.color} />

                        <View style={[styles.billStatusPill, { backgroundColor: status.color + '15' }]}>
                          <Text style={[styles.billStatusText, { color: status.color }]}>{status.label}</Text>
                        </View>
                      </View>

                      <View style={styles.allPlansMiddle}>
                        <View style={styles.allPlansMiddleTitle}>
                          <Text style={styles.allPlansTitle}>{bill.title}</Text>
                          <Text style={styles.allPlansSub}>
                            {bill.type === 'monthly_date'
                              ? `Monthly on ${bill.dueDay}th`
                              : `${bill.cycleDays} Days Validity Pack`}
                          </Text>
                        </View>
                        <Text style={styles.allPlansAmount}>{curr}{formatAmount(bill.amount)}</Text>
                      </View>

                      {/* Date details box */}
                      <View style={styles.allPlansDatesBox}>
                        <View style={styles.allPlansDateCol}>
                          <Text style={styles.allPlansDateLabel}>Started / Taken On</Text>
                          <Text style={styles.allPlansDateValue}>
                            {bill.startDate || bill.lastPaidDate || 'N/A'}
                          </Text>
                        </View>
                        <View style={styles.allPlansDateDivider} />
                        <View style={styles.allPlansDateCol}>
                          <Text style={styles.allPlansDateLabel}>Next Due Date</Text>
                          <Text style={[styles.allPlansDateValue, { color: status.color, fontWeight: '900' }]}>
                            {bill.nextDueDate}
                          </Text>
                        </View>
                      </View>

                      {/* Action buttons */}
                      <View style={styles.allPlansActionsRow}>
                        <TouchableOpacity
                          style={styles.allPlansPayBtn}
                          onPress={() => {
                            setAllBillsModalVisible(false);
                            setSelectedBillToPay(bill);
                            setPayReceiptImage(null);
                            setPayModalVisible(true);
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="checkmark-circle-outline" size={15} color="#0F172A" style={{ marginRight: 4 }} />
                          <Text style={styles.allPlansPayBtnText}>Pay & Proof</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.allPlansDeleteBtn}
                          onPress={() => handleDeleteBill(bill)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="receipt-outline" size={40} color="#94A3B8" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 10 }}>
                    No Active Reminders Yet
                  </Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={() => {
                setAllBillsModalVisible(false);
                setAddBillModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSaveBtnText}>+ Add Another Service</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SIMPLIFIED & IMPROVED ADD BILL / RECHARGE MODAL */}
      <Modal visible={addBillModalVisible} animationType="slide" transparent onRequestClose={() => setAddBillModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add Bill / Recharge Reminder</Text>
                <Text style={styles.modalSubtitle}>Auto-reminders before due date or pack expiry</Text>
              </View>
              <TouchableOpacity onPress={() => setAddBillModalVisible(false)} style={styles.modalCloseIconBtn}>
                <Ionicons name="close" size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              {/* Quick Presets Row */}
              <Text style={styles.modalFieldLabel}>Quick Presets</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsRow}>
                {BRAND_PROVIDERS.map(p => {
                  const isSelected = selectedProviderId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.providerChip,
                        isSelected && { borderColor: p.color, backgroundColor: p.bgColor },
                      ]}
                      onPress={() => handleSelectProvider(p)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.providerIconCircle}>
                        <BrandLogo id={p.id} color={p.color} />
                      </View>
                      <Text style={[styles.providerChipText, isSelected && { color: p.color, fontWeight: '900' }]}>
                        {p.badge}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Type Switcher Tabs */}
              <View style={styles.modalTypeSwitch}>
                <TouchableOpacity
                  style={[styles.modalTypeBtn, billType === 'monthly_date' && styles.modalTypeBtnActive]}
                  onPress={() => setBillType('monthly_date')}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={billType === 'monthly_date' ? '#0F172A' : '#64748B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.modalTypeBtnText, billType === 'monthly_date' && styles.modalTypeBtnTextActive]}>
                    Monthly Bill (Fixed Day)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalTypeBtn, billType === 'cycle_days' && styles.modalTypeBtnActive]}
                  onPress={() => setBillType('cycle_days')}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="phone-portrait-outline"
                    size={14}
                    color={billType === 'cycle_days' ? '#0F172A' : '#64748B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.modalTypeBtnText, billType === 'cycle_days' && styles.modalTypeBtnTextActive]}>
                    Recharge Pack (Days)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Form Input Group: Title & Amount */}
              <View style={styles.inputRow2Col}>
                <View style={{ flex: 1.35 }}>
                  <Text style={styles.modalFieldLabel}>Bill / Service Name</Text>
                  <TextInput
                    style={[styles.modalInput, { color: '#0F172A' }]}
                    placeholder="e.g. Jio Recharge, Flat Rent"
                    placeholderTextColor="#94A3B8"
                    value={billTitle}
                    onChangeText={setBillTitle}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalFieldLabel}>Amount ({curr})</Text>
                  <TextInput
                    style={[styles.modalInput, { color: '#0F172A' }]}
                    placeholder="e.g. 299"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={billAmount}
                    onChangeText={setBillAmount}
                  />
                </View>
              </View>

              {/* Quick Amount Suggestion Chips */}
              <View style={styles.quickAmountRow}>
                {['199', '299', '699', '1499', '5000', '10000'].map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={[styles.quickAmountChip, billAmount === amt && styles.quickAmountChipActive]}
                    onPress={() => setBillAmount(amt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickAmountChipText, billAmount === amt && styles.quickAmountChipTextActive]}>
                      {curr}{amt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* DATE / CYCLE CONFIGURATION */}
              {billType === 'monthly_date' ? (
                <View style={styles.configBlock}>
                  <Text style={styles.modalFieldLabel}>Due Day of Every Month</Text>
                  
                  {/* Quick Day Selector Pills */}
                  <View style={styles.daySelectorGrid}>
                    {[1, 5, 10, 15, 20, 25, 28, 30].map(d => {
                      const isSel = billDueDay === d.toString();
                      return (
                        <TouchableOpacity
                          key={d}
                          style={[styles.daySelectorPill, isSel && styles.daySelectorPillActive]}
                          onPress={() => setBillDueDay(d.toString())}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.daySelectorPillText, isSel && styles.daySelectorPillTextActive]}>
                            {d}th
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <Text style={styles.customDayLabel}>Custom Day:</Text>
                    <TextInput
                      style={[styles.customDayInput, { color: '#0F172A' }]}
                      placeholder="30"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                      value={billDueDay}
                      onChangeText={setBillDueDay}
                      maxLength={2}
                    />
                    <Text style={styles.customDayHint}>of every month</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.configBlock}>
                  {/* Recharge Pack Validity */}
                  <Text style={styles.modalFieldLabel}>Recharge Pack Validity</Text>
                  <View style={styles.validityPillRow}>
                    {RECHARGE_CYCLES.map(c => {
                      const isSel = billCycleDays === c.days.toString();
                      return (
                        <TouchableOpacity
                          key={c.days}
                          style={[styles.validityPill, isSel && styles.validityPillActive]}
                          onPress={() => setBillCycleDays(c.days.toString())}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.validityPillDays, isSel && styles.validityPillDaysActive]}>
                            {c.days} Days
                          </Text>
                          <Text style={[styles.validityPillLabel, isSel && styles.validityPillLabelActive]}>
                            {c.label.split('(')[1]?.replace(')', '') || ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Start Date Selector */}
                  <Text style={[styles.modalFieldLabel, { marginTop: 12 }]}>Recharge Start Date</Text>
                  <View style={styles.dateSelectorRow}>
                    <TouchableOpacity
                      style={[styles.dateOptionPill, billRechargeDate === todayStr && styles.dateOptionPillActive]}
                      onPress={() => setBillRechargeDate(todayStr)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="today-outline" size={13} color={billRechargeDate === todayStr ? '#0F172A' : '#64748B'} style={{ marginRight: 4 }} />
                      <Text style={[styles.dateOptionText, billRechargeDate === todayStr && styles.dateOptionTextActive]}>
                        Today
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.dateOptionPill, billRechargeDate === getRelativeDateString(-1) && styles.dateOptionPillActive]}
                      onPress={() => setBillRechargeDate(getRelativeDateString(-1))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateOptionText, billRechargeDate === getRelativeDateString(-1) && styles.dateOptionTextActive]}>
                        Yesterday
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.dateOptionPill,
                        billRechargeDate !== todayStr && billRechargeDate !== getRelativeDateString(-1) && styles.dateOptionPillActive,
                        { flex: 1.2 }
                      ]}
                      onPress={() => {
                        const selDate = new Date(billRechargeDate || Date.now());
                        if (!isNaN(selDate.getTime())) {
                          setCalViewYear(selDate.getFullYear());
                          setCalViewMonth(selDate.getMonth());
                        }
                        setCalendarModalVisible(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="calendar-outline" size={13} color="#2563EB" style={{ marginRight: 4 }} />
                      <Text style={[
                        styles.dateOptionText,
                        billRechargeDate !== todayStr && billRechargeDate !== getRelativeDateString(-1) && styles.dateOptionTextActive
                      ]}>
                        {billRechargeDate !== todayStr && billRechargeDate !== getRelativeDateString(-1) ? billRechargeDate : 'Pick Date 🗓️'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* LIVE DUE SUMMARY BADGE */}
              <View style={styles.liveSummaryCard}>
                <View style={styles.liveSummaryLeft}>
                  <View style={styles.liveSummaryIconWrap}>
                    <Ionicons name="notifications-outline" size={16} color="#B45309" />
                  </View>
                  <View>
                    <Text style={styles.liveSummaryLabel}>Next Renewal / Due Date</Text>
                    <Text style={styles.liveSummaryDate}>{livePreviewData.nextDue}</Text>
                  </View>
                </View>
                <View style={[styles.liveSummaryStatusPill, { backgroundColor: livePreviewData.statusColor + '20' }]}>
                  <Text style={[styles.liveSummaryStatusText, { color: livePreviewData.statusColor }]}>
                    {livePreviewData.statusLabel}
                  </Text>
                </View>
              </View>

              {/* Optional Notes */}
              <Text style={styles.modalFieldLabel}>Notes (Optional)</Text>
              <TextInput
                style={[styles.modalInput, { marginBottom: 4, color: '#0F172A' }]}
                placeholder="e.g. Landlord UPI ID, Jio 1.5GB/day plan"
                placeholderTextColor="#94A3B8"
                value={billNotes}
                onChangeText={setBillNotes}
              />
            </ScrollView>

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={handleSaveBill}
              disabled={isSavingBill}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSaveBtnText}>
                {isSavingBill ? 'Saving Reminder...' : 'Set Reminder 🔔'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* INTERACTIVE CALENDAR DATE PICKER MODAL */}
      <Modal visible={calendarModalVisible} animationType="fade" transparent onRequestClose={() => setCalendarModalVisible(false)}>
        <View style={styles.calModalOverlay}>
          <View style={styles.calModalCard}>
            {/* Calendar Header with Month Browsing */}
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.calNavBtn} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={20} color="#0F172A" />
              </TouchableOpacity>

              <Text style={styles.calMonthYearTitle}>
                {MONTH_NAMES[calViewMonth]} {calViewYear}
              </Text>

              <TouchableOpacity onPress={handleNextMonth} style={styles.calNavBtn} activeOpacity={0.7}>
                <Ionicons name="chevron-forward" size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <View style={styles.calQuickPresets}>
              <TouchableOpacity
                style={[styles.calQuickPill, billRechargeDate === todayStr && styles.calQuickPillActive]}
                onPress={() => handleSelectDateFromCalendar(todayStr)}
                activeOpacity={0.7}
              >
                <Text style={[styles.calQuickPillText, billRechargeDate === todayStr && styles.calQuickPillTextActive]}>
                  Today
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.calQuickPill}
                onPress={() => {
                  const yDate = getRelativeDateString(-1);
                  handleSelectDateFromCalendar(yDate);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.calQuickPillText}>Yesterday</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.calQuickPill}
                onPress={() => {
                  const threeDaysAgo = getRelativeDateString(-3);
                  handleSelectDateFromCalendar(threeDaysAgo);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.calQuickPillText}>3 Days Ago</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday headers */}
            <View style={styles.calWeekdaysRow}>
              {WEEKDAY_NAMES.map(w => (
                <Text key={w} style={styles.calWeekdayText}>
                  {w}
                </Text>
              ))}
            </View>

            {/* Calendar Days Grid */}
            <View style={styles.calGrid}>
              {calendarDays.map((item, idx) => {
                if (!item.dayNumber || !item.dateStr) {
                  return <View key={`empty-${idx}`} style={styles.calDayCellEmpty} />;
                }

                const isSelected = billRechargeDate === item.dateStr;
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

      {/* PAY BILL & ATTACH PROOF MODAL */}
      <Modal visible={payModalVisible} animationType="slide" transparent onRequestClose={() => setPayModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Payment & Proof</Text>
              <TouchableOpacity onPress={() => setPayModalVisible(false)} style={styles.modalCloseIconBtn}>
                <Ionicons name="close" size={20} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {selectedBillToPay && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                <View style={styles.payBillInfoCard}>
                  <Text style={styles.payBillInfoTitle}>{selectedBillToPay.title}</Text>
                  <Text style={styles.payBillInfoAmount}>
                    {curr}{formatAmount(selectedBillToPay.amount)}
                  </Text>
                  <Text style={styles.payBillInfoSub}>
                    Marking as paid will record an expense & schedule next renewal.
                  </Text>
                </View>

                {/* Payment Mode Selection */}
                <Text style={styles.modalFieldLabel}>Payment Mode</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  {['UPI', 'Cash', 'Card', 'Bank'].map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.payModeChip,
                        payMode === mode && styles.payModeChipActive,
                      ]}
                      onPress={() => setPayMode(mode)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.payModeChipText,
                          payMode === mode && styles.payModeChipTextActive,
                        ]}
                      >
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Screenshot Attachment */}
                <Text style={styles.modalFieldLabel}>Payment Screenshot (Proof)</Text>
                {payReceiptImage ? (
                  <View style={{ marginBottom: 12 }}>
                    <View style={styles.proofPillCard}>
                      <View style={styles.proofPillLeft}>
                        <View style={styles.proofThumbWrap}>
                          <Image source={{ uri: payReceiptImage }} style={styles.proofThumbnail} resizeMode="cover" />
                          <View style={styles.proofZoomIcon}>
                            <Ionicons name="expand" size={10} color="#FFFFFF" />
                          </View>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.proofPillTitle}>1 Screenshot Attached</Text>
                          <Text style={styles.proofPillSub}>Payment proof ready to save</Text>
                        </View>
                      </View>

                      <View style={styles.proofViewBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
                        <Text style={[styles.proofViewText, { color: '#10B981' }]}>Attached</Text>
                      </View>
                    </View>

                    <View style={styles.proofActionRow}>
                      <TouchableOpacity style={styles.changeProofBtn} onPress={pickReceiptForBill} activeOpacity={0.7}>
                        <Ionicons name="swap-horizontal" size={14} color="#2563EB" style={{ marginRight: 4 }} />
                        <Text style={styles.changeProofBtnText}>Replace Photo</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.removeProofBtn}
                        onPress={() => setPayReceiptImage(null)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                        <Text style={styles.removeProofBtnText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.payUploadBtn}
                    onPress={pickReceiptForBill}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="image-outline" size={18} color="#2563EB" style={{ marginRight: 6 }} />
                    <Text style={styles.payUploadBtnText}>Attach Payment Screenshot (Proof)</Text>
                  </TouchableOpacity>
                )}

                {/* Delete reminder button inside pay modal */}
                <TouchableOpacity
                  style={styles.deleteInModalBtn}
                  onPress={() => handleDeleteBill(selectedBillToPay)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                  <Text style={styles.deleteInModalBtnText}>Remove this reminder</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.confirmPaidBtn, isPaying && { opacity: 0.6 }]}
              onPress={handleMarkBillPaid}
              disabled={isPaying}
              activeOpacity={0.85}
            >
              {isPaying ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <View style={styles.confirmPaidIconWrap}>
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.confirmPaidTextWrap}>
                    <Text style={styles.confirmPaidTitle}>Confirm Paid</Text>
                    <Text style={styles.confirmPaidSub}>Record & schedule next renewal</Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={22} color="rgba(255,255,255,0.5)" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* BEAUTIFUL CUSTOM CONFIRM DELETE MODAL */}
      <ConfirmDialogModal
        visible={!!billToDelete}
        title="Delete Reminder?"
        message={`Are you sure you want to remove the reminder for "${billToDelete?.title}"?`}
        confirmText="Yes, Delete"
        cancelText="Keep"
        type="danger"
        loading={isDeletingBill}
        onConfirm={handleConfirmDeleteBill}
        onCancel={() => setBillToDelete(null)}
      />

      {/* GOOGLE PLAY REVIEW MODAL FOR NEW & EXISTING USERS */}
      <GooglePlayReviewModal
        visible={showReviewModal}
        userId={user?.uid || ''}
        isExistingUser={isExistingUserReview}
        onClose={() => setShowReviewModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrap: {
    marginRight: 12,
    position: 'relative',
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFD740',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#FFD740',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFD740',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#F8FAFC',
  },
  avatarContainerVip: {
    borderWidth: 2,
    borderColor: '#FFD740',
    backgroundColor: '#1E293B',
  },
  vipCrownAvatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#FFD740',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  vipNameBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  vipNameBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 0.4,
  },
  userTextCol: {
    justifyContent: 'center',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  greetingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  userNameText: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  content: {
    paddingBottom: 110,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  balanceCard: {
    marginHorizontal: 20,
    backgroundColor: '#D5F9E3',
    borderRadius: 28,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  shimmerBeam: {
    position: 'absolute',
    top: -70,
    bottom: -70,
    width: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  balanceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.6,
  },
  budgetRingBtn: {
    position: 'relative',
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  budgetRingText: {
    color: '#0F172A',
    fontSize: 9,
    fontWeight: '900',
  },
  eyeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  balanceAmountWrap: {
    marginBottom: 16,
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.8,
  },
  cashflowRow: {
    flexDirection: 'row',
    gap: 10,
  },
  incomeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    gap: 8,
  },
  incomeIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  incomeLabel: {
    fontSize: 10,
    color: '#15803D',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  incomeValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#166534',
    marginTop: 1,
  },
  expenseCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    gap: 8,
  },
  expenseIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseLabel: {
    fontSize: 10,
    color: '#B91C1C',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  expenseValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#991B1B',
    marginTop: 1,
  },

  todayWidgetRow: {
    paddingHorizontal: 20,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  todayWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 24,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  todayWidgetIconOuter: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'transparent',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayWidgetIconInner: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -2 }],
  },
  todayWidgetTextWrap: {
    marginRight: 14,
  },
  todayWidgetLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  todayWidgetCount: {
    fontSize: 11,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: 1,
  },
  todayWidgetDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginRight: 14,
  },
  todayWidgetAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#3B82F6',
    marginRight: 14,
  },
  quickTwoBtnsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  quickActionTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
    justifyContent: 'space-between',
    minHeight: 128,
  },
  quickTileBillsBorder: {
    borderColor: '#DBEAFE',
    shadowColor: '#3B82F6',
  },
  quickTileAlertBorder: {
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
  },
  splitQrTileBorder: {
    borderColor: '#E9D5FF',
    shadowColor: '#7C3AED',
  },
  tileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
  },
  tileIconWrapBills: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.10,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  tileIconWrapAlert: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  tileIconWrapQr: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#F3E8FF',
    borderColor: '#DDD6FE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#7C3AED',
    shadowOpacity: 0.10,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  tileAlertDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },

  // 3D Icon system for quick action tiles
  tileDecorOrb: {
    position: 'absolute',
    bottom: -18,
    right: -18,
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  tile3dIconOuter: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 12,
    shadowOpacity: 0.22,
    elevation: 5,
  },
  tile3dIconInner: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    position: 'relative',
  },
  tile3dIconHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.50)',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  tile3dAlertDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#EF4444',
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  tileAmountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
    gap: 4,
  },
  tileAmountPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  tileAmountPillSep: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  tileAmountPillStatus: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  tileDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
    gap: 3.5,
  },
  tileDueBadgeText: {
    color: '#DC2626',
    fontSize: 9.5,
    fontWeight: '800',
  },
  tilePaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
  },
  tilePaidBadgeText: {
    color: '#15803D',
    fontSize: 9.5,
    fontWeight: '800',
  },
  tileTrackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
  },
  tileTrackBadgeText: {
    color: '#6366F1',
    fontSize: 9,
    fontWeight: '700',
  },
  tileQrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  tileQrBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.3,
  },
  tileTextWrap: {
    marginTop: 'auto',
  },
  tileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
    flex: 1,
  },
  tileSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 15,
  },
  billsQuickBtn: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  splitQrQuickBtn: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.2,
    borderColor: '#E9D5FF',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  splitQrIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  splitQrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  splitQrBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.4,
  },
  billsShimmerBeam: {
    position: 'absolute',
    top: -20,
    left: 0,
    bottom: -20,
    width: 110,
  },
  billsQuickLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  billsQuickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  billsQuickIconWrapNormal: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  billsQuickIconWrapAlert: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  billsQuickAlertDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  billsQuickTextWrap: {
    flex: 1,
  },
  billsQuickTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  billsQuickTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  billsDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  billsDueDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#DC2626',
  },
  billsDueBadgeText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '800',
  },
  billsAllPaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  billsAllPaidBadgeText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '800',
  },
  billsTrackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  billsTrackBadgeText: {
    color: '#4F46E5',
    fontSize: 9.5,
    fontWeight: '800',
  },
  billsQuickSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  billsQuickRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billsQuickArrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  aiAdvisorGradient: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  aiGlowBlob1: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E9D5FF',
    top: -40,
    right: -20,
    opacity: 0.6,
  },
  aiGlowBlob2: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DBEAFE',
    bottom: -20,
    left: 20,
    opacity: 0.6,
  },
  aiAdvisorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
    zIndex: 1,
  },
  aiAdvisorIconBg: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  aiRobotIconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
  },
  aiRobotImage: {
    width: 52,
    height: 52,
  },
  aiIconOuter: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#C4B5FD',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  aiIconInner: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',        // soft lavender — main face
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    transform: [{ translateY: -2 }],   // 3D lift
  },
  aiAdvisorTextContainer: {
    flex: 1,
  },
  aiAdvisorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  aiAdvisorTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  aiLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3.5,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  aiLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#059669',
  },
  aiLiveText: {
    color: '#059669',
    fontSize: 8.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  aiAdvisorInsightText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  aiAdvisorArrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    zIndex: 1,
  },
  billsSection: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  billsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  billsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billsHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  // 3D cartoon bills icon
  billsIconWrap: {
    width: 40,
    height: 40,
    marginRight: 10,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#64748B',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    overflow: 'visible',
  },
  billsCalBase: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 25,
    height: 25,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  billsCalTop: {
    width: '100%',
    height: 8,
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingBottom: 1,
  },
  billsCalRing: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    borderWidth: 1,
    borderColor: '#9CA3AF',
    marginBottom: 1,
  },
  billsCalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 3,
    gap: 2,
  },
  billsCalDot: {
    width: 5,
    height: 5,
    borderRadius: 1,
    backgroundColor: '#F59E0B',
  },
  billsEnvelope: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#818CF8',
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'visible',
    shadowColor: '#6366F1',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  billsEnvelopeFlap: {
    position: 'absolute',
    top: -4,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: '#6366F1',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  billsPaper: {
    position: 'absolute',
    top: -8,
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },
  billsPaperBadge: {
    width: 10,
    height: 7,
    borderRadius: 2,
    backgroundColor: '#818CF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billsPaperText: {
    fontSize: 5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  billsHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
    marginRight: 6,
  },
  billsSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  billsSectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 1,
  },
  remindersShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
  },
  remindersShortcutText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  addBillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  addBillBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  billsScroll: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 12,
  },
  billCard: {
    width: 208,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 8,
  },
  billCardCircle: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    top: -58,
    right: -42,
    backgroundColor: '#BFDBFE',
    zIndex: 0,
  },
  billCardGradientTop: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  billCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  billCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandLogoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  brandLogoText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  billStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cardDeleteMiniBtn: {
    padding: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  billTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  billAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  billCycleDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 6,
  },
  billDueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  billDueDate: {
    fontSize: 11,
    fontWeight: '700',
  },
  payBillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 9,
    shadowColor: '#16A34A',
    shadowOpacity: 0.24,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  payBillBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  allPaidBanner: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  allPaidIconWrap: {
    marginBottom: 6,
  },
  allPaidTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  allPaidSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
    marginBottom: 10,
    lineHeight: 16,
  },
  allPaidBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  allPaidBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  emptyBillBanner: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  emptyBillIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBillTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyBillSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  allPlansCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  allPlansTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  allPlansMiddle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  allPlansMiddleTitle: {
    flex: 1,
    minWidth: 0,
  },
  allPlansTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  allPlansSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  allPlansAmount: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginLeft: 10,
  },
  allPlansDatesBox: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  allPlansDateCol: {
    flex: 1,
    minWidth: 110,
  },
  allPlansDateLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  allPlansDateValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  allPlansDateDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  allPlansActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allPlansPayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD740',
    paddingVertical: 9,
    borderRadius: 12,
  },
  allPlansPayBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  allPlansDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  simpleBudgetCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  simpleBudgetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simpleBudgetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  simpleBudgetTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  simpleBudgetSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  simpleBudgetRight: {
    alignItems: 'flex-end',
  },
  simpleBudgetAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  simpleBudgetTotal: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  simpleBudgetPct: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 1,
  },
  simpleBudgetTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  simpleBudgetFill: {
    height: '100%',
    borderRadius: 3,
  },
  simpleSetBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  simpleSetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  topCatsSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  topCatsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  topCatsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  topCatsLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#F1F5F9', 
  },
  stackedSegment: {
    height: '100%',
  },
  legendGrid: {
    flexDirection: 'column',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
  },
  legendItemActive: {
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#FFD740',
    padding: 7,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  legendName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  legendPct: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  legendAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  seeAllLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  categoryScroll: {
    paddingHorizontal: 20,
    gap: 6,
    marginBottom: 12,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  catChipTextActive: {
    color: '#FFD740',
    fontWeight: '800',
  },
  transactionsListCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 4,
    paddingHorizontal: 14,
    shadowColor: '#64748B',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F8FAFC',
  },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  txItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  txIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  txMainInfo: {
    flex: 1,
    marginRight: 10,
  },
  txMerchantName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  proofBadge: {
    marginLeft: 6,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 4,
  },
  txSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txDate: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  txTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  txModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  txModeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  txAmountCol: {
    alignItems: 'flex-end',
  },
  txAmountText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  txTypeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  emptyCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  emptyIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
  },
  addFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD740',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  addFirstBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  loadingCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  loadingLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandGroupTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  brandGroupTab: {
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  brandGroupTabActive: {
    backgroundColor: '#0F172A',
  },
  brandGroupTabText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  brandGroupTabTextActive: {
    color: '#FFD740',
  },
  presetsRow: {
    gap: 8,
    paddingVertical: 4,
    marginBottom: 14,
  },
  providerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  providerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    overflow: 'hidden',
  },
  providerChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  modalTypeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  modalTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
  },
  modalTypeBtnActive: {
    backgroundColor: '#FFD740',
  },
  modalTypeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  modalTypeBtnTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  inputRow2Col: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 2,
  },
  modalFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 10,
  },
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  quickAmountChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickAmountChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  quickAmountChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  quickAmountChipTextActive: {
    color: '#FFD740',
  },
  configBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  daySelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  daySelectorPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  daySelectorPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  daySelectorPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  daySelectorPillTextActive: {
    color: '#FFD740',
  },
  customDayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  customDayInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    width: 44,
    textAlign: 'center',
  },
  customDayHint: {
    fontSize: 12,
    color: '#94A3B8',
  },
  validityPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    marginBottom: 4,
  },
  validityPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  validityPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  validityPillDays: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  validityPillDaysActive: {
    color: '#FFD740',
  },
  validityPillLabel: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },
  validityPillLabelActive: {
    color: '#94A3B8',
  },
  dateSelectorRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  dateOptionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  dateOptionPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  dateOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  dateOptionTextActive: {
    color: '#FFD740',
    fontWeight: '800',
  },
  liveSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  liveSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  liveSummaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveSummaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  liveSummaryDate: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 1,
  },
  liveSummaryStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveSummaryStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  modalSaveBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 2,
  },
  modalSaveBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFD740',
  },

  // Confirm Paid button — pay modal only
  confirmPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 8,
    shadowColor: '#15803D',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 5,
  },
  confirmPaidIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  confirmPaidTextWrap: {
    flex: 1,
  },
  confirmPaidTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  confirmPaidSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    marginTop: 1,
  },
  calModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    maxWidth: 360,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calMonthYearTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  calQuickPresets: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  calQuickPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  calQuickPillActive: {
    backgroundColor: '#0F172A',
  },
  calQuickPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  calQuickPillTextActive: {
    color: '#FFD740',
  },
  calWeekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  calWeekdayText: {
    width: 38,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  calDayCellEmpty: {
    width: 38,
    height: 38,
  },
  calDayCell: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calDayCellToday: {
    borderWidth: 1.5,
    borderColor: '#FFD740',
  },
  calDayCellSelected: {
    backgroundColor: '#0F172A',
  },
  calDayText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  calDayTextToday: {
    color: '#B45309',
    fontWeight: '900',
  },
  calDayTextSelected: {
    color: '#FFD740',
    fontWeight: '900',
  },
  calCloseBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  calCloseBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  payBillInfoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  payBillInfoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  payBillInfoAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 4,
  },
  payBillInfoSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  payModeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  payModeChipActive: {
    backgroundColor: '#FFD740',
    borderColor: '#FFD740',
  },
  payModeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  payModeChipTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  proofPillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 10,
    marginTop: 4,
  },
  proofPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  proofThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  proofThumbnail: {
    width: '100%',
    height: '100%',
  },
  proofZoomIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 2,
  },
  proofPillTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  proofPillSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  proofViewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  proofViewText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  proofActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  changeProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  changeProofBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  removeProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  removeProofBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  payUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  payUploadBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  deleteInModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  deleteInModalBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  proCrownHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF9E7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
  },
  proCrownHeaderBtnActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  proCrownHeaderBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  proCrownHeaderBadgeTextActive: {
    color: '#047857',
  },
});
