import { BillFormSheet } from '@/components/bills/BillFormSheet';
import { RecordPaymentModal } from '@/components/bills/RecordPaymentModal';
import { formatCurrency } from '@/lib/formatCurrency';
import { resolveCurrency } from '@/lib/currencies';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StatusBar,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Animated,
  Easing,
  Dimensions,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { isLowEndDevice } from '@/lib/devicePerf';
import { useAuth } from '@/context/AuthContext';
import { checkReminderLimit, FREE_REMINDER_LIMIT } from '@/lib/limits';
import {
  getRecurringBills,
  saveRecurringBill,
  payRecurringBill,
  deleteRecurringBill,
  calculateNextMonthlyDueDate,
  calculateNextCycleDueDate,
  RecurringBill,
} from '@/lib/database';
import { scheduleBillReminder } from '@/lib/notifications';
import { safeGoBack } from '@/lib/navigation';
import { getLocalDateString, getRelativeDateString } from '@/lib/dateUtils';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';
import PaymentModeIcon from '@/components/PaymentModeIcon';
import Toast from 'react-native-toast-message';
import Skeleton from '@/components/Skeleton';
import { useTranslation } from '@/lib/i18n';

const { width } = Dimensions.get('window');

interface BrandProvider {
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

const BRAND_PROVIDERS: BrandProvider[] = [
  // Telecom SIMs (Recharge Packs)
  { id: 'jio', name: 'Jio Mobile Recharge', badge: 'Jio', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#0A2885', bgColor: '#0A288518', icon: 'phone-portrait', group: 'sim' },
  { id: 'airtel', name: 'Airtel Mobile Recharge', badge: 'airtel', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#ED1C24', bgColor: '#ED1C2418', icon: 'phone-portrait', group: 'sim' },
  { id: 'vi', name: 'Vi (Vodafone Idea) Recharge', badge: 'Vi', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#E60000', bgColor: '#E6000018', icon: 'phone-portrait', group: 'sim' },
  { id: 'bsnl', name: 'BSNL Mobile Recharge', badge: 'BSNL', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#005BA6', bgColor: '#005BA618', icon: 'phone-portrait', group: 'sim' },

  // Daily Services, Mess & Food (Monthly)
  { id: 'tiffin', name: 'Mess / Tiffin Service', badge: 'Mess / Tiffin', category: 'Food', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#F97316', bgColor: '#F9731618', icon: 'restaurant', group: 'daily' },
  { id: 'rent', name: 'Room / Flat Rent', badge: 'Flat Rent', category: 'Rent', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#10B981', bgColor: '#10B98118', icon: 'home', group: 'daily' },
  { id: 'milk', name: 'Milk Delivery', badge: 'Milk / Dairy', category: 'Groceries', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#0284C7', bgColor: '#0284C718', icon: 'nutrition', group: 'daily' },
  { id: 'maid', name: 'Maid Salary', badge: 'House Maid', category: 'Bills', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#8B5CF6', bgColor: '#8B5CF618', icon: 'person', group: 'daily' },

  // Utilities & Bills (Monthly)
  { id: 'electricity', name: 'Electricity Bill', badge: 'Bijli Bill', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
  { id: 'gas', name: 'LPG Cylinder / Gas', badge: 'Gas Cylinder', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#F97316', bgColor: '#F9731618', icon: 'flame', group: 'utility' },
  { id: 'water', name: 'Water Supply Bill', badge: 'Water Bill', category: 'Bills', type: 'monthly_date', dueDay: '25', cycleDays: '30', color: '#06B6D4', bgColor: '#06B6D418', icon: 'water', group: 'utility' },
  { id: 'emi', name: 'Loan / Credit EMI', badge: 'Loan EMI', category: 'EMI', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#E11D48', bgColor: '#E11D4818', icon: 'card', group: 'utility' },
  { id: 'gym', name: 'Gym Membership', badge: 'Gym / Fitness', category: 'Others', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#10B981', bgColor: '#10B98118', icon: 'barbell', group: 'utility' },

  // WiFi & Broadband (Monthly)
  { id: 'jiofiber', name: 'JioFiber Broadband', badge: 'JioFiber', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#0A2885', bgColor: '#0A288518', icon: 'wifi', group: 'wifi' },
  { id: 'airtel_xstream', name: 'Airtel Xstream Fiber', badge: 'Airtel Fiber', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#ED1C24', bgColor: '#ED1C2418', icon: 'wifi', group: 'wifi' },
  { id: 'act', name: 'ACT Fibernet', badge: 'ACT Fiber', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#E31E24', bgColor: '#E31E2418', icon: 'wifi', group: 'wifi' },

  // OTT & Subscriptions (Monthly)
  { id: 'netflix', name: 'Netflix Subscription', badge: 'Netflix', category: 'Subscriptions', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#E50914', bgColor: '#E5091418', icon: 'film', group: 'ott' },
  { id: 'prime', name: 'Amazon Prime', badge: 'Prime Video', category: 'Subscriptions', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#00A8E1', bgColor: '#00A8E118', icon: 'play-circle', group: 'ott' },
  { id: 'hotstar', name: 'Disney+ Hotstar', badge: 'Hotstar', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#0C1E3C', bgColor: '#0C1E3C18', icon: 'play-circle', group: 'ott' },
  { id: 'spotify', name: 'Spotify Premium', badge: 'Spotify', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#1DB954', bgColor: '#1DB95418', icon: 'musical-notes', group: 'ott' },
  { id: 'youtube', name: 'YouTube Premium', badge: 'YouTube', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#FF0000', bgColor: '#FF000018', icon: 'logo-youtube', group: 'ott' },
];

const RECHARGE_CYCLES = [
  { days: 28, label: '28 Days (1 Mo)' },
  { days: 56, label: '56 Days (2 Mo)' },
  { days: 84, label: '84 Days (3 Mo)' },
  { days: 365, label: '365 Days (1 Yr)' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function BrandLogo({
  id,
  color,
  size = 32,
  iconKey,
  badge,
}: {
  id: string;
  color: string;
  size?: number;
  iconKey?: string;
  badge?: string;
}) {
  const s = size;
  const r = s * 0.35;

  if (iconKey) {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: color || '#2563EB', borderRadius: r, width: s, height: s }]}>
        <Ionicons name={iconKey as any} size={Math.round(s * 0.52)} color="#FFFFFF" />
      </View>
    );
  }

  if (id && id.startsWith('custom:')) {
    const chars = Array.from(badge || '★').slice(0, 2).join('');
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: color || '#2563EB', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: Math.round(s * 0.4), fontWeight: '800' }]}>{chars}</Text>
      </View>
    );
  }

  if (id === 'jio' || id === 'jiofiber') {
    return (
      <View style={[brandLogoStyles.base, {
        borderRadius: Math.round(s * 0.33),
        width: s,
        height: s,
        overflow: 'hidden',
        backgroundColor: '#0055FE',
      }]}>
        <LinearGradient
          colors={['#1062FE', '#003ECC']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: Math.round(s * 0.42), fontStyle: 'italic', fontWeight: '900', letterSpacing: -0.5 }]}>Jio</Text>
        </LinearGradient>
      </View>
    );
  }

  if (id === 'airtel' || id === 'airtel_xstream') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#FFFFFF', borderRadius: s * 0.3, width: s, height: s, borderWidth: 1.5, borderColor: '#ED1C2425' }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#ED1C24', fontSize: s * 0.56, fontWeight: '900', fontStyle: 'italic' }]}>a</Text>
      </View>
    );
  }

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

  if (id === 'bsnl') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#FFFFFF', borderRadius: s * 0.3, width: s, height: s, borderWidth: 1.5, borderColor: '#E2E8F0' }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#003580', fontSize: s * 0.26, fontWeight: '900', letterSpacing: -0.5 }]}>BSNL</Text>
      </View>
    );
  }

  if (id === 'netflix') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#000000', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#E50914', fontSize: s * 0.44, fontWeight: '900', fontStyle: 'italic' }]}>N</Text>
      </View>
    );
  }

  if (id === 'prime') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#00A8E1', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: s * 0.28, fontWeight: '900' }]}>prime</Text>
      </View>
    );
  }

  if (id === 'hotstar') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#0C1E3C', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFD700', fontSize: s * 0.4 }]}>★</Text>
      </View>
    );
  }

  if (id === 'spotify') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#1DB954', borderRadius: s / 2, width: s, height: s }]}>
        <Ionicons name="musical-notes" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'youtube') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#FF0000', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="play" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'electricity') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#F59E0B', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="flash" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'gas') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#F97316', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="flame" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'rent') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#10B981', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="home" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'tiffin') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#F97316', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="restaurant" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'milk') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#0284C7', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="nutrition" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'maid') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#8B5CF6', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="person" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'emi') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#E11D48', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="card" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'gym') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#10B981', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="barbell" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={[brandLogoStyles.base, { backgroundColor: color || '#6366F1', borderRadius: r, width: s, height: s }]}>
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

import { BrandCardTheme, resolveBrandTheme } from '@/lib/billProviders';
export { BrandCardTheme, resolveBrandTheme };

function getDueStatus(dueDateStr: string) {
  if (!dueDateStr) return { label: 'Upcoming', color: '#10B981', bg: '#D1FAE5', daysLeft: 999 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dueDateStr); due.setHours(0, 0, 0, 0);
  const diff  = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return { label: `Overdue ${Math.abs(diff)}d`, color: '#EF4444', bg: '#FEE2E2', daysLeft: diff };
  if (diff === 0)  return { label: 'Due Today',                 color: '#EF4444', bg: '#FEE2E2', daysLeft: 0 };
  if (diff <= 3)   return { label: `Due in ${diff}d`,           color: '#EA580C', bg: '#FFEDD5', daysLeft: diff };
  if (diff <= 10)  return { label: `Due in ${diff}d`,           color: '#2563EB', bg: '#EFF6FF', daysLeft: diff };
  return             { label: `Due in ${diff}d`,                color: '#10B981', bg: '#D1FAE5', daysLeft: diff };
}

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
  } catch { return dateStr; }
}

function formatOrdinalSuffix(dayInput?: string | number) {
  if (dayInput === undefined || dayInput === null || dayInput === '') return '';
  const day = typeof dayInput === 'number' ? dayInput : parseInt(String(dayInput), 10);
  if (isNaN(day)) return String(dayInput);
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return `${day}st`;
  if (j === 2 && k !== 12) return `${day}nd`;
  if (j === 3 && k !== 13) return `${day}rd`;
  return `${day}th`;
}

interface BillCardProps {
  bill: RecurringBill;
  currencySymbol: string;
  confirmPaidLabel: string;
  onPay: (bill: RecurringBill) => void;
  onEdit: (bill: RecurringBill) => void;
  onDelete: (bill: RecurringBill) => void;
}

const BillCard = React.memo(function BillCard({
  bill,
  currencySymbol,
  confirmPaidLabel,
  onPay,
  onEdit,
  onDelete,
}: BillCardProps) {
  const status = getDueStatus(bill.nextDueDate);
  const theme = resolveBrandTheme(bill.provider, bill.title, bill.category, bill.brandColor, bill.brandBadge);

  const cycleTitle = bill.type === 'monthly_date'
    ? (bill.dueDay ? `Monthly (${formatOrdinalSuffix(bill.dueDay)})` : 'Monthly Bill')
    : `${bill.cycleDays || 28} Days Recharge`;

  const cycleTag = bill.type === 'monthly_date' ? 'MONTHLY' : `${bill.cycleDays || 28}D CYCLE`;

  return (
    <View style={styles.billCard}>
      {/* Soft Ambient Mesh Glow in Top-Left Corner */}
      <LinearGradient
        colors={['rgba(224, 242, 254, 0.55)', 'rgba(255, 255, 255, 0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.45, y: 0.45 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Row 1 (header), two columns */}
      <View style={styles.billCardTopRow}>
        {/* Left: brand/icon tile (fixed size, flexShrink: 0) */}
        <View style={styles.billIconCol}>
          <BrandLogo id={theme.id} color={theme.accent} size={44} iconKey={bill.iconKey} badge={bill.brandBadge} />
        </View>

        {/* Middle (flex: 1, minWidth: 0) */}
        <View style={styles.billMiddleCol}>
          {/* Line 1: bill title, numberOfLines={1}, ellipsizeMode="tail" */}
          <Text style={styles.billTitle} numberOfLines={1} ellipsizeMode="tail">
            {bill.title}
          </Text>

          {/* Line 2: category chip and date (calendar icon + date) */}
          <View style={styles.billMetaRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText} numberOfLines={1}>
                {(bill.category || theme.category || 'BILLS').toUpperCase()}
              </Text>
            </View>
            <View style={styles.billDateRow}>
              <Ionicons name="calendar-outline" size={12} color="#64748B" style={styles.calendarIcon} />
              <Text style={styles.metaDateText} numberOfLines={1}>
                {formatDateDisplay(bill.nextDueDate)}
              </Text>
            </View>
          </View>
        </View>

        {/* Right column (flexShrink: 0, alignItems: 'flex-end') */}
        <View style={styles.billRightCol}>
          <Text
            style={styles.billAmountText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {currencySymbol}{bill.amount.toLocaleString()}
          </Text>
          <View style={[styles.duePill, { backgroundColor: status.bg }]}>
            <Ionicons name="time" size={12} color={status.color} style={styles.duePillIcon} />
            <Text style={[styles.duePillText, { color: status.color }]} numberOfLines={1}>
              {status.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Row 2: Dedicated Cycle / Schedule Strip (100% visible, crystal clear) */}
      <View style={styles.cycleStrip}>
        <View style={styles.cycleStripLeft}>
          <View style={styles.cycleIconCircle}>
            <Ionicons name="refresh" size={13} color="#2563EB" />
          </View>
          <Text style={styles.cycleStripTitle} numberOfLines={1}>
            {cycleTitle}
          </Text>
        </View>
        <View style={styles.cycleStripTag}>
          <Text style={styles.cycleStripTagText}>
            {cycleTag}
          </Text>
        </View>
      </View>

      {/* Row 3: Action Group (Confirm Paid, Edit, Delete) */}
      <View style={styles.billActionsRow}>
        <TouchableOpacity
          style={styles.confirmPaidBtn}
          onPress={() => onPay(bill)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Confirm Paid ${bill.title}`}
        >
          <LinearGradient
            colors={['#0066FF', '#0047E0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.confirmPaidGradient}
          >
            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={styles.confirmPaidIcon} />
            <Text style={styles.confirmPaidText} numberOfLines={1}>
              {confirmPaidLabel}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconActionBtn}
          onPress={() => onEdit(bill)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${bill.title}`}
        >
          <Ionicons name="create-outline" size={18} color="#2563EB" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconActionBtn}
          onPress={() => onDelete(bill)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${bill.title}`}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function RemindersScreen() {
  const router = useRouter();
  const { user, settings, isPremium, appConfig } = useAuth();
  const { t } = useTranslation();
  const curr = settings?.currency === 'INR' ? '₹' : (settings?.currency || '₹');
  const currencyInfo = useMemo(() => resolveCurrency(settings?.currency), [settings?.currency]);
  const currencySymbol = currencyInfo.symbol || '₹';
  const confirmPaidLabel = t('confirm_paid') || 'Confirm Paid';
  const todayStr = useMemo(() => getLocalDateString(), []);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null);
  


  // Pay modal state
  const [payingBill, setPayingBill] = useState<RecurringBill | null>(null);
  const [payMode, setPayMode] = useState('UPI');
  const [paymentProof, setPaymentProof] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  // Custom Delete confirmation dialog state
  const [deleteBill, setDeleteBill] = useState<RecurringBill | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // FAB subtle pulse (disabled on low-end devices to save idle ticks)
  const fabPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isLowEndDevice()) {
      fabPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, { toValue: 1.08, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(fabPulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [fabPulse]);

  const loadBills = useCallback(async (forceRefresh = false) => {
    if (!user?.uid) return;
    try {
      const list = await getRecurringBills(user.uid, forceRefresh);
      setBills(list);
    } catch (e) {
      console.warn('Failed to load bills:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useFocusEffect(useCallback(() => { loadBills(false); }, [loadBills]));

  const onRefresh = () => {
    setRefreshing(true);
    loadBills(true);
  };



  function openAddModal(type: 'monthly_date' | 'cycle_days' = 'monthly_date') {
    const isProOff = appConfig?.showSubscriptions === false || appConfig?.showProFeatures === false;
    const { allowed } = checkReminderLimit(isPremium, bills.length, isProOff);
    if (!allowed) {
      const canUpgrade = appConfig?.showSubscriptions !== false && appConfig?.showProFeatures !== false;
      if (canUpgrade) {
        Toast.show({
          type: 'info',
          text1: 'Rupeo Pro Feature 👑',
          text2: `Free limit (${FREE_REMINDER_LIMIT}/${FREE_REMINDER_LIMIT}) reached. Upgrade for unlimited bills!`,
          visibilityTime: 3500,
        });
        router.push('/premium');
        return;
      }
      Alert.alert(
        'Reminder Limit Reached ⚠️',
        `Aap maximum ${FREE_REMINDER_LIMIT} reminders hi add kar sakte hain. Naya reminder add karne ke liye purana reminder delete karein.`,
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    setEditingBill(null);
    setShowModal(true);
  }

  const openEditModal = useCallback((bill: RecurringBill) => {
    setEditingBill(bill);
    setShowModal(true);
  }, []);



  async function handlePay() {
    if (!user?.uid || !payingBill) return;
    setIsPaying(true);
    try {
      await payRecurringBill(user.uid, payingBill, payMode, paymentProof || undefined);
      setPayingBill(null);
      setPaymentProof(null);
      loadBills();
      Toast.show({
        type: 'success',
        text1: 'Payment Recorded ✅',
        text2: `${payingBill.title} marked as paid & next cycle scheduled!`,
      });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not record payment' });
    } finally {
      setIsPaying(false);
    }
  }

  const pickPaymentProof = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const proof = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setPaymentProof(proof);
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Could not select payment proof' });
    }
  };

  async function handleDelete() {
    if (!user?.uid || !deleteBill?.id) return;
    setIsDeleting(true);
    try {
      await deleteRecurringBill(user.uid, deleteBill.id);
      Toast.show({ type: 'success', text1: 'Reminder removed' });
      setDeleteBill(null);
      loadBills();
    } catch {
      Toast.show({ type: 'error', text1: 'Delete failed' });
    } finally {
      setIsDeleting(false);
    }
  }

  const overdueBills = bills.filter(b => getDueStatus(b.nextDueDate).daysLeft < 0);
  const urgentBills = bills.filter(b => { const d = getDueStatus(b.nextDueDate).daysLeft; return d >= 0 && d <= 3; });
  const upcomingBills = bills.filter(b => getDueStatus(b.nextDueDate).daysLeft > 3);



  const SectionHead = ({ title, count, icon, color }: { title: string; count: number; icon: keyof typeof Ionicons.glyphMap; color: string }) =>
    count > 0 ? (
      <View style={styles.sectionHeaderRow}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={styles.sectionHeader}>{title}</Text>
        <View style={[styles.sectionCount, { backgroundColor: `${color}18` }]}>
          <Text style={[styles.sectionCountText, { color }]}>{count}</Text>
        </View>
      </View>
    ) : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />
        <View style={styles.topBar}>
          <View style={styles.backBtn}><Skeleton width={24} height={24} borderRadius={12} /></View>
          <Skeleton width={140} height={20} />
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: '#FFFFFF', marginBottom: 12, borderRadius: 16 }}>
              <Skeleton width={48} height={48} borderRadius={24} style={{ marginRight: 16 }} />
              <View style={{ flex: 1 }}>
                <Skeleton width={180} height={16} style={{ marginBottom: 8 }} />
                <Skeleton width="100%" height={14} style={{ marginBottom: 12 }} />
                <Skeleton width={60} height={12} />
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Top Bar - Clean with Back Button & Centered Title */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeGoBack(router)} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.topTitle}>{t('bill_reminders')}</Text>
          <Text style={styles.topSub}>
            {bills.length} {t('active_reminders')} {isPremium || appConfig?.showSubscriptions === false || appConfig?.showProFeatures === false ? '• Unlimited' : `(${bills.length}/${FREE_REMINDER_LIMIT} Free)`}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Free Tier Limit Reached Banner (Only shown if subscriptions are active and user is not premium) */}
      {appConfig?.showSubscriptions !== false && appConfig?.showProFeatures !== false && !isPremium && bills.length >= FREE_REMINDER_LIMIT && (
        <TouchableOpacity
          style={styles.proLimitBanner}
          onPress={() => router.push('/premium')}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Free limit reached. Upgrade to Rupeo Pro for unlimited reminders"
        >
          <View style={styles.proLimitBannerLeft}>
            <View style={styles.proLimitCrown}>
              <Ionicons name="sparkles" size={14} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.proLimitBannerTitle}>Free Limit Reached (3/3 Reminders)</Text>
              <Text style={styles.proLimitBannerSub}>Upgrade to Rupeo Pro for unlimited bill & EMI reminders</Text>
            </View>
          </View>
          <View style={styles.proLimitBannerBtn}>
            <Text style={styles.proLimitBannerBtnText}>Upgrade</Text>
            <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      )}

      {/* Bill List */}
      {bills.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="alarm-outline" size={44} color="#6366F1" /></View>
          <Text style={styles.emptyTitle}>{t('no_reminders')}</Text>
          <Text style={styles.emptySub}>{t('no_reminders_sub')}</Text>
          <TouchableOpacity style={styles.emptyAddBtn} onPress={() => openAddModal('monthly_date')} activeOpacity={0.85}>
            <Ionicons name="add-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.emptyAddBtnText}>Add Bill Reminder</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#1C1C1E']}
              tintColor="#1C1C1E"
            />
          }
        >
          <SectionHead title={t('overdue')} count={overdueBills.length} icon="alert-circle-outline" color="#EF4444" />
          {overdueBills.map(b => (
            <BillCard
              key={b.id}
              bill={b}
              currencySymbol={currencySymbol}
              confirmPaidLabel={confirmPaidLabel}
              onPay={setPayingBill}
              onEdit={openEditModal}
              onDelete={setDeleteBill}
            />
          ))}
          <SectionHead title={t('due_soon')} count={urgentBills.length} icon="alarm-outline" color="#F59E0B" />
          {urgentBills.map(b => (
            <BillCard
              key={b.id}
              bill={b}
              currencySymbol={currencySymbol}
              confirmPaidLabel={confirmPaidLabel}
              onPay={setPayingBill}
              onEdit={openEditModal}
              onDelete={setDeleteBill}
            />
          ))}
          <SectionHead title={t('upcoming')} count={upcomingBills.length} icon="calendar-outline" color="#3B82F6" />
          {upcomingBills.map(b => (
            <BillCard
              key={b.id}
              bill={b}
              currencySymbol={currencySymbol}
              confirmPaidLabel={confirmPaidLabel}
              onPay={setPayingBill}
              onEdit={openEditModal}
              onDelete={setDeleteBill}
            />
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Animated Bottom Floating Action Button (FAB) */}
      <Animated.View style={[styles.fabWrap, { transform: [{ scale: fabPulse }] }]}>
        <TouchableOpacity style={styles.fab} onPress={() => openAddModal('monthly_date')} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* SHARED BILL FORM SHEET */}
      <BillFormSheet
        visible={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingBill(null);
        }}
        editingBill={editingBill}
        onSaveSuccess={() => {
          loadBills(true);
        }}
      />

      {/* IMPROVED RECORD PAYMENT & PROOF MODAL */}
      <RecordPaymentModal
        visible={!!payingBill}
        bill={payingBill}
        onClose={() => setPayingBill(null)}
        onSuccess={() => {
          loadBills(true);
        }}
      />

      {/* Delete Confirm */}
      <ConfirmDialogModal
        visible={!!deleteBill}
        title={t('remove_reminder')}
        message={`Remove "${deleteBill?.title}" from your reminders?`}
        confirmText={t('remove')}
        cancelText={t('keep')}
        type="danger"
        icon="trash-outline"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteBill(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  topTitle: { fontSize: 20, fontWeight: '900', color: '#1C1C1E' },
  topSub: { fontSize: 12, color: '#64748B', marginTop: 2 },

  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginTop: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  listContent: { paddingHorizontal: 20, paddingTop: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10, gap: 7 },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: '#64748B', letterSpacing: 0.3 },
  sectionCount: { minWidth: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  sectionCountText: { fontSize: 11, fontWeight: '900' },

  billCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8EEF8',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  billCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  billIconCol: {
    flexShrink: 0,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  billMiddleCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  billTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  billMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 4,
    columnGap: 8,
  },
  categoryBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.5,
  },
  billDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarIcon: {
    marginRight: 4,
  },
  metaDateText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  billRightCol: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  billAmountText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    textAlign: 'right',
  },
  duePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  duePillIcon: {
    marginRight: 4,
  },
  duePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cycleStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 12,
  },
  cycleStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  cycleIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  cycleStripTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  cycleStripTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    flexShrink: 0,
  },
  cycleStripTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.4,
  },
  billActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  confirmPaidBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#0055FE',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  confirmPaidGradient: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  confirmPaidIcon: {
    marginRight: 6,
  },
  confirmPaidText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  iconActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
    flexShrink: 0,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 14 },
  emptyIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#1C1C1E' },
  emptySub: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 21 },

  fabWrap: { position: 'absolute', bottom: 28, right: 24 },
  fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOpacity: 0.35, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 8 },

  // CLEAN MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 24,
    elevation: 20,
  },
  modalGrabHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '900',
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

  // 2-Segment Switcher
  modeSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  modeSegmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 11,
  },
  modeSegmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  modeSegmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modeSegmentTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },

  cleanSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  cleanProviderScroll: {
    gap: 8,
    paddingBottom: 12,
  },
  cleanProviderCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 76,
    position: 'relative',
  },
  cleanProviderCardActive: {
    borderWidth: 1.8,
  },
  cleanProviderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 5,
  },
  cleanCheckCircle: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  formRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  cleanInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cleanTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  amountCurrencyPrefix: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginRight: 4,
  },
  cleanAmountInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },

  quickChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  quickAmountPill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickAmountPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  quickAmountPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  quickAmountPillTextActive: {
    color: '#2563EB',
    fontWeight: '900',
  },

  cleanConfigCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 14,
  },
  cleanConfigTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  dayPillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  dayPillBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
  },
  dayPillBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  dayPillBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  dayPillBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  customDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  customDayDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  customDayInputField: {
    width: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    color: '#0F172A',
  },

  validityGrid: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  validityCard: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  validityCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
    borderWidth: 1.5,
  },
  validityDaysText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  validityDaysTextActive: {
    color: '#2563EB',
    fontWeight: '900',
  },
  validitySubText: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },
  validitySubTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },

  dateSelectorGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  cleanDatePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  cleanDatePillActive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#0F172A',
    borderWidth: 1.5,
  },
  cleanDatePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  cleanDatePillTextActive: {
    color: '#0F172A',
    fontWeight: '900',
  },

  cleanPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    padding: 12,
    marginBottom: 14,
  },
  cleanPreviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cleanPreviewIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanPreviewSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  cleanPreviewDate: {
    fontSize: 13,
    fontWeight: '900',
    color: '#78350F',
    marginTop: 1,
  },
  cleanPreviewBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cleanPreviewBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  cleanPrimarySaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  cleanPrimarySaveBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // CALENDAR MODAL
  calModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  calModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 10,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthYearTitle: {
    fontSize: 16,
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  calQuickPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  calQuickPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  calQuickPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calWeekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  calWeekdayText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    width: 36,
    textAlign: 'center',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 14,
  },
  calDayCellEmpty: {
    width: '14.28%',
    height: 36,
  },
  calDayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  calDayCellToday: {
    borderWidth: 1,
    borderColor: '#2563EB',
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
    color: '#2563EB',
    fontWeight: '900',
  },
  calDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  calCloseBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  calCloseBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
  },

  // PAY MODAL
  payOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
  paySheet: { backgroundColor: '#fff', borderRadius: 24, padding: 20 },
  payHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  payHeaderIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  payHeaderCopy: { flex: 1, minWidth: 0 },
  payTitle: { fontSize: 20, fontWeight: '900', color: '#1C1C1E' },
  payHeaderSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  payTargetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, marginBottom: 8 },
  payTargetTitle: { fontSize: 15, fontWeight: '800', color: '#1C1C1E', flex: 1 },
  payTargetAmount: { fontSize: 16, fontWeight: '900', color: '#10B981', marginLeft: 8 },
  paySectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6, marginTop: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  modeIcon: { marginRight: 2 },
  chipLabel: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  proofPreviewRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginBottom: 12 },
  proofThumbFrame: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', marginRight: 10, position: 'relative' },
  proofThumbnail: { width: '100%', height: '100%' },
  proofCheckIcon: { position: 'absolute', top: 2, right: 2 },
  proofPreviewInfo: { flex: 1 },
  proofAttachedTitle: { fontSize: 13, fontWeight: '800', color: '#1C1C1E' },
  proofAttachedSub: { fontSize: 11, color: '#64748B' },
  removeProofBtn: { padding: 8 },
  attachProofBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#F8FAFC' },
  attachProofText: { fontSize: 13, fontWeight: '700', color: '#6366F1', flex: 1, marginLeft: 8 },
  payBtnsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  payCancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 12 },
  payCancelText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  payConfirmBtn: { flex: 1.6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 12 },
  payConfirmText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  // PRO LIMIT BANNER
  proLimitBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  proLimitBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  proLimitCrown: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proLimitBannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
  },
  proLimitBannerSub: {
    fontSize: 10.5,
    color: '#B45309',
    marginTop: 1,
  },
  proLimitBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  proLimitBannerBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
