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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
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
  { id: 'custom', name: 'Other Service / Bill', badge: 'Custom', category: 'Bills', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#6366F1', bgColor: '#6366F118', icon: 'receipt-outline', group: 'utility' },
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

function BrandLogo({ id, color, size = 32 }: { id: string; color: string; size?: number }) {
  const s = size;
  const r = s * 0.35;

  if (id === 'jio' || id === 'jiofiber') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#1239AC', borderRadius: s / 2, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: s * 0.34, fontStyle: 'italic' }]}>Jio</Text>
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

interface BrandCardTheme {
  id: string;
  name: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
  innerBg: string;
  innerBorder: string;
  tagBg: string;
  tagText: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  category: string;
}

function resolveBrandTheme(providerId?: string, title?: string, category?: string): BrandCardTheme {
  const normTitle = (title || '').toLowerCase().trim();
  const id = (providerId || '').toLowerCase().trim();

  // Jio - Clean Minimal Soft Light Blue
  if (id === 'jio' || id === 'jiofiber' || normTitle.includes('jio')) {
    return {
      id: 'jio',
      name: 'Jio',
      cardBg: '#F0F7FF',        // Minimal ultra light blue
      cardBorder: '#BAE6FD',    // Clean soft light blue border
      accent: '#0A2885',        // Jio brand royal blue
      innerBg: '#FFFFFF',
      innerBorder: '#E0F2FE',
      tagBg: '#E0F2FE',
      tagText: '#0369A1',
      badge: 'Jio',
      badgeBg: '#0A2885',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Airtel - Clean Minimal Soft Light Red / Rose
  if (id === 'airtel' || id === 'airtel_xstream' || normTitle.includes('airtel')) {
    return {
      id: 'airtel',
      name: 'Airtel',
      cardBg: '#FFF5F5',        // Minimal ultra light red / rose
      cardBorder: '#FECDD3',    // Delicate soft rose border
      accent: '#ED1C24',        // Airtel crimson red
      innerBg: '#FFFFFF',
      innerBorder: '#FFE4E6',
      tagBg: '#FFE4E6',
      tagText: '#BE123C',
      badge: 'airtel',
      badgeBg: '#ED1C24',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Vi (Vodafone Idea) - Soft Warm Vermilion / Light Blush
  if (id === 'vi' || normTitle.includes('vi ') || normTitle.includes('vodafone') || normTitle.includes('idea')) {
    return {
      id: 'vi',
      name: 'Vi',
      cardBg: '#FFF6F5',
      cardBorder: '#FED7AA',
      accent: '#E60000',
      innerBg: '#FFFFFF',
      innerBorder: '#FFEDD5',
      tagBg: '#FFEDD5',
      tagText: '#C2410C',
      badge: 'Vi',
      badgeBg: '#E60000',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // BSNL - Soft Cobalt Sky
  if (id === 'bsnl' || normTitle.includes('bsnl')) {
    return {
      id: 'bsnl',
      name: 'BSNL',
      cardBg: '#F0F9FF',
      cardBorder: '#BAE6FD',
      accent: '#005BA6',
      innerBg: '#FFFFFF',
      innerBorder: '#E0F2FE',
      tagBg: '#E0F2FE',
      tagText: '#0284C7',
      badge: 'BSNL',
      badgeBg: '#005BA6',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Electricity / Bijli - Soft Warm Golden Amber
  if (id === 'electricity' || normTitle.includes('electr') || normTitle.includes('bijli') || normTitle.includes('power') || normTitle.includes('light bill')) {
    return {
      id: 'electricity',
      name: 'Electricity Bill',
      cardBg: '#FFFDF0',        // Minimal soft warm amber
      cardBorder: '#FDE68A',
      accent: '#D97706',
      innerBg: '#FFFFFF',
      innerBorder: '#FEF3C7',
      tagBg: '#FEF3C7',
      tagText: '#B45309',
      badge: 'Bijli',
      badgeBg: '#F59E0B',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // LPG Cylinder / Gas - Soft Light Orange
  if (id === 'gas' || normTitle.includes('gas') || normTitle.includes('cylinder') || normTitle.includes('lpg')) {
    return {
      id: 'gas',
      name: 'LPG Gas Cylinder',
      cardBg: '#FFF7ED',        // Minimal soft light orange
      cardBorder: '#FED7AA',
      accent: '#EA580C',
      innerBg: '#FFFFFF',
      innerBorder: '#FFEDD5',
      tagBg: '#FFEDD5',
      tagText: '#C2410C',
      badge: 'Gas',
      badgeBg: '#F97316',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // Water Supply - Soft Aqua Cyan
  if (id === 'water' || normTitle.includes('water') || normTitle.includes('paani') || normTitle.includes('jal')) {
    return {
      id: 'water',
      name: 'Water Supply',
      cardBg: '#ECFEFF',        // Minimal soft aqua cyan
      cardBorder: '#A5F3FC',
      accent: '#0891B2',
      innerBg: '#FFFFFF',
      innerBorder: '#CFFAFE',
      tagBg: '#CFFAFE',
      tagText: '#0E7490',
      badge: 'Water',
      badgeBg: '#06B6D4',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // Room / Flat Rent - Soft Mint Emerald
  if (id === 'rent' || normTitle.includes('rent') || normTitle.includes('room') || normTitle.includes('flat') || normTitle.includes('pg')) {
    return {
      id: 'rent',
      name: 'Room / Flat Rent',
      cardBg: '#F0FDF4',        // Minimal soft emerald
      cardBorder: '#BBF7D0',
      accent: '#059669',
      innerBg: '#FFFFFF',
      innerBorder: '#DCFCE7',
      tagBg: '#DCFCE7',
      tagText: '#15803D',
      badge: 'Flat Rent',
      badgeBg: '#10B981',
      badgeText: '#FFFFFF',
      category: 'Rent',
    };
  }

  // Maid / Cook Salary - Soft Lavender
  if (id === 'maid' || normTitle.includes('maid') || normTitle.includes('kamwali') || normTitle.includes('salary') || normTitle.includes('cook')) {
    return {
      id: 'maid',
      name: 'Maid Salary',
      cardBg: '#F5F3FF',        // Minimal soft lavender
      cardBorder: '#DDD6FE',
      accent: '#7C3AED',
      innerBg: '#FFFFFF',
      innerBorder: '#EDE9FE',
      tagBg: '#EDE9FE',
      tagText: '#6D28D9',
      badge: 'House Maid',
      badgeBg: '#8B5CF6',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // Mess / Tiffin - Soft Light Peach
  if (id === 'tiffin' || normTitle.includes('tiffin') || normTitle.includes('mess') || normTitle.includes('dabba') || normTitle.includes('khana')) {
    return {
      id: 'tiffin',
      name: 'Mess / Tiffin',
      cardBg: '#FFF7ED',        // Minimal soft peach
      cardBorder: '#FED7AA',
      accent: '#EA580C',
      innerBg: '#FFFFFF',
      innerBorder: '#FFEDD5',
      tagBg: '#FFEDD5',
      tagText: '#C2410C',
      badge: 'Mess / Tiffin',
      badgeBg: '#F97316',
      badgeText: '#FFFFFF',
      category: 'Food',
    };
  }

  // Milk Delivery - Soft Azure
  if (id === 'milk' || normTitle.includes('milk') || normTitle.includes('dairy') || normTitle.includes('doodh')) {
    return {
      id: 'milk',
      name: 'Milk Delivery',
      cardBg: '#F0F9FF',        // Minimal soft azure
      cardBorder: '#BAE6FD',
      accent: '#0284C7',
      innerBg: '#FFFFFF',
      innerBorder: '#E0F2FE',
      tagBg: '#E0F2FE',
      tagText: '#0369A1',
      badge: 'Milk / Dairy',
      badgeBg: '#0284C7',
      badgeText: '#FFFFFF',
      category: 'Groceries',
    };
  }

  // Netflix - Soft Minimal Ruby
  if (id === 'netflix' || normTitle.includes('netflix')) {
    return {
      id: 'netflix',
      name: 'Netflix',
      cardBg: '#FFF5F5',
      cardBorder: '#FECDD3',
      accent: '#E50914',
      innerBg: '#FFFFFF',
      innerBorder: '#FFE4E6',
      tagBg: '#FFE4E6',
      tagText: '#BE123C',
      badge: 'Netflix',
      badgeBg: '#000000',
      badgeText: '#E50914',
      category: 'Subscriptions',
    };
  }

  // Prime Video
  if (id === 'prime' || normTitle.includes('prime') || normTitle.includes('amazon')) {
    return {
      id: 'prime',
      name: 'Amazon Prime',
      cardBg: '#F0F9FF',
      cardBorder: '#BAE6FD',
      accent: '#00A8E1',
      innerBg: '#FFFFFF',
      innerBorder: '#E0F2FE',
      tagBg: '#E0F2FE',
      tagText: '#0369A1',
      badge: 'Prime Video',
      badgeBg: '#00A8E1',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Disney+ Hotstar
  if (id === 'hotstar' || normTitle.includes('hotstar') || normTitle.includes('disney')) {
    return {
      id: 'hotstar',
      name: 'Disney+ Hotstar',
      cardBg: '#F1F5F9',
      cardBorder: '#CBD5E1',
      accent: '#0C1E3C',
      innerBg: '#FFFFFF',
      innerBorder: '#E2E8F0',
      tagBg: '#E2E8F0',
      tagText: '#0C1E3C',
      badge: 'Hotstar',
      badgeBg: '#0C1E3C',
      badgeText: '#FFD700',
      category: 'Subscriptions',
    };
  }

  // Spotify
  if (id === 'spotify' || normTitle.includes('spotify')) {
    return {
      id: 'spotify',
      name: 'Spotify',
      cardBg: '#F0FDF4',
      cardBorder: '#BBF7D0',
      accent: '#1DB954',
      innerBg: '#FFFFFF',
      innerBorder: '#DCFCE7',
      tagBg: '#DCFCE7',
      tagText: '#15803D',
      badge: 'Spotify',
      badgeBg: '#1DB954',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // YouTube Premium
  if (id === 'youtube' || normTitle.includes('youtube')) {
    return {
      id: 'youtube',
      name: 'YouTube Premium',
      cardBg: '#FFF1F2',
      cardBorder: '#FECDD3',
      accent: '#FF0000',
      innerBg: '#FFFFFF',
      innerBorder: '#FFE4E6',
      tagBg: '#FFE4E6',
      tagText: '#BE123C',
      badge: 'YouTube',
      badgeBg: '#FF0000',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Loan / Credit EMI
  if (id === 'emi' || normTitle.includes('emi') || normTitle.includes('loan') || normTitle.includes('credit')) {
    return {
      id: 'emi',
      name: 'Loan / Credit EMI',
      cardBg: '#FFF1F2',
      cardBorder: '#FECDD3',
      accent: '#E11D48',
      innerBg: '#FFFFFF',
      innerBorder: '#FFE4E6',
      tagBg: '#FFE4E6',
      tagText: '#BE123C',
      badge: 'Loan EMI',
      badgeBg: '#E11D48',
      badgeText: '#FFFFFF',
      category: 'EMI',
    };
  }

  // Gym / Fitness
  if (id === 'gym' || normTitle.includes('gym') || normTitle.includes('fitness')) {
    return {
      id: 'gym',
      name: 'Gym / Fitness',
      cardBg: '#F0FDF4',
      cardBorder: '#BBF7D0',
      accent: '#10B981',
      innerBg: '#FFFFFF',
      innerBorder: '#DCFCE7',
      tagBg: '#DCFCE7',
      tagText: '#15803D',
      badge: 'Gym',
      badgeBg: '#10B981',
      badgeText: '#FFFFFF',
      category: 'Others',
    };
  }

  // WiFi / Broadband / ACT Fibernet
  if (id === 'act' || normTitle.includes('wifi') || normTitle.includes('fiber') || normTitle.includes('broadband')) {
    return {
      id: 'wifi',
      name: 'WiFi / Broadband',
      cardBg: '#F8FAFC',
      cardBorder: '#CBD5E1',
      accent: '#475569',
      innerBg: '#FFFFFF',
      innerBorder: '#F1F5F9',
      tagBg: '#F1F5F9',
      tagText: '#334155',
      badge: 'WiFi',
      badgeBg: '#475569',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // Default Custom / Others
  return {
    id: 'custom',
    name: title || 'Bill Reminder',
    cardBg: '#F8FAFC',
    cardBorder: '#E2E8F0',
    accent: '#6366F1',
    innerBg: '#FFFFFF',
    innerBorder: '#F1F5F9',
    tagBg: '#EEF2FF',
    tagText: '#4F46E5',
    badge: category || 'Bill',
    badgeBg: '#6366F1',
    badgeText: '#FFFFFF',
    category: category || 'Bills',
  };
}

function getDueStatus(dueDateStr: string) {
  if (!dueDateStr) return { label: 'Upcoming', color: '#10B981', bg: '#D1FAE5', daysLeft: 999 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dueDateStr); due.setHours(0, 0, 0, 0);
  const diff  = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return { label: `Overdue ${Math.abs(diff)}d`, color: '#EF4444', bg: '#FEE2E2', daysLeft: diff };
  if (diff === 0)  return { label: 'Due Today 🚨',              color: '#EF4444', bg: '#FEE2E2', daysLeft: 0 };
  if (diff <= 3)   return { label: `Due in ${diff}d ⏰`,        color: '#F59E0B', bg: '#FEF3C7', daysLeft: diff };
  if (diff <= 10)  return { label: `Due in ${diff}d`,           color: '#3B82F6', bg: '#DBEAFE', daysLeft: diff };
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

export default function RemindersScreen() {
  const router = useRouter();
  const { user, settings, isPremium, appConfig } = useAuth();
  const { t } = useTranslation();
  const curr = settings?.currency === 'INR' ? '₹' : (settings?.currency || '₹');
  const todayStr = useMemo(() => getLocalDateString(), []);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null);
  
  // Top Level Mode: 'monthly_date' vs 'cycle_days'
  const [billType, setBillType] = useState<'monthly_date' | 'cycle_days'>('monthly_date');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('tiffin');
  const [billTitle, setBillTitle] = useState('Mess / Tiffin Service');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDay, setBillDueDay] = useState('1');
  const [billRechargeDate, setBillRechargeDate] = useState(todayStr);
  const [billCycleDays, setBillCycleDays] = useState('28');
  const [billCategory, setBillCategory] = useState('Food');
  const [billNotes, setBillNotes] = useState('');
  const [isSavingBill, setIsSavingBill] = useState(false);

  // Calendar Picker Modal State
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calViewYear, setCalViewYear] = useState(new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(new Date().getMonth());

  // Pay modal state
  const [payingBill, setPayingBill] = useState<RecurringBill | null>(null);
  const [payMode, setPayMode] = useState('UPI');
  const [paymentProof, setPaymentProof] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  // Custom Delete confirmation dialog state
  const [deleteBill, setDeleteBill] = useState<RecurringBill | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // FAB subtle pulse
  const fabPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
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

  // Live calculation preview
  const livePreviewData = useMemo(() => {
    if (billType === 'monthly_date') {
      const day = parseInt(billDueDay) || 1;
      const nextDue = calculateNextMonthlyDueDate(day);
      const status = getDueStatus(nextDue);
      return {
        nextDue,
        statusLabel: status.label,
        statusColor: status.color,
        desc: `Repeats monthly on ${day}th`,
      };
    } else {
      const cycle = parseInt(billCycleDays) || 28;
      const nextDue = calculateNextCycleDueDate(cycle, billRechargeDate || todayStr);
      const status = getDueStatus(nextDue);
      return {
        nextDue,
        statusLabel: status.label,
        statusColor: status.color,
        desc: `${cycle} days cycle from ${billRechargeDate}`,
      };
    }
  }, [billType, billDueDay, billCycleDays, billRechargeDate, todayStr]);

  // Calendar Grid builder
  const calendarDays = useMemo(() => {
    const totalDays = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calViewYear, calViewMonth, 1).getDay();

    const daysArr: { dayNumber: number | null; dateStr: string | null }[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      daysArr.push({ dayNumber: null, dateStr: null });
    }
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
    if (p.type === 'monthly_date') {
      setBillDueDay(p.dueDay || '1');
    } else {
      setBillCycleDays(p.cycleDays || '28');
    }
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
          text2: `Free limit (${FREE_REMINDER_LIMIT}/${FREE_REMINDER_LIMIT}) reached. Unlimited reminders ke liye upgrade karein!`,
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
    setBillType(type);
    if (type === 'monthly_date') {
      const first = BRAND_PROVIDERS.find(p => p.id === 'tiffin') || BRAND_PROVIDERS[4];
      handleSelectProvider(first);
    } else {
      const firstSim = BRAND_PROVIDERS.find(p => p.group === 'sim') || BRAND_PROVIDERS[0];
      handleSelectProvider(firstSim);
    }
    setBillAmount('');
    setBillNotes('');
    setBillRechargeDate(todayStr);
    setShowModal(true);
  }

  function openEditModal(bill: RecurringBill) {
    setEditingBill(bill);
    const pType = bill.type || 'monthly_date';
    setBillType(pType);
    setSelectedProviderId(bill.provider || 'custom');
    setBillTitle(bill.title);
    setBillAmount(String(bill.amount));
    setBillDueDay(String(bill.dueDay || 1));
    setBillCycleDays(String(bill.cycleDays || 28));
    setBillRechargeDate(bill.startDate || todayStr);
    setBillCategory(bill.category || 'Bills');
    setBillNotes(bill.notes || '');
    setShowModal(true);
  }

  async function handleSave() {
    if (!user?.uid) return;

    if (!editingBill) {
      const isProOff = appConfig?.showSubscriptions === false || appConfig?.showProFeatures === false;
      const { allowed } = checkReminderLimit(isPremium, bills.length, isProOff);
      if (!allowed) {
        const canUpgrade = appConfig?.showSubscriptions !== false && appConfig?.showProFeatures !== false;
        if (canUpgrade) {
          setShowModal(false);
          Toast.show({
            type: 'info',
            text1: 'Rupeo Pro Feature 👑',
            text2: `Free limit (${FREE_REMINDER_LIMIT}/${FREE_REMINDER_LIMIT}) reached. Unlimited reminders ke liye upgrade karein!`,
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
    }

    if (!billTitle.trim()) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter a name for the reminder' });
      return;
    }
    const amt = parseFloat(billAmount.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter a valid amount' });
      return;
    }

    try {
      setIsSavingBill(true);
      const providerObj = BRAND_PROVIDERS.find(p => p.id === selectedProviderId);

      let nextDue = '';
      if (billType === 'monthly_date') {
        const dueDayNum = parseInt(billDueDay) || 1;
        nextDue = calculateNextMonthlyDueDate(dueDayNum);
      } else {
        const cycleNum = parseInt(billCycleDays) || 28;
        nextDue = calculateNextCycleDueDate(cycleNum, billRechargeDate || todayStr);
      }

      await saveRecurringBill(user.uid, {
        id: editingBill?.id,
        title: billTitle.trim(),
        amount: amt,
        category: billCategory,
        type: billType,
        provider: selectedProviderId,
        brandColor: providerObj?.color || '#0F172A',
        brandBadge: providerObj?.badge || 'Bill',
        dueDay: billType === 'monthly_date' ? parseInt(billDueDay) || 1 : undefined,
        cycleDays: billType === 'cycle_days' ? parseInt(billCycleDays) || 28 : undefined,
        startDate: billType === 'cycle_days' ? billRechargeDate : todayStr,
        notes: billNotes.trim() || undefined,
        nextDueDate: nextDue,
      });

      setShowModal(false);
      loadBills();

      scheduleBillReminder(billTitle, amt, new Date(nextDue), curr, user.uid).catch(console.error);

      Toast.show({
        type: 'success',
        text1: editingBill ? 'Reminder Updated ✅' : 'Reminder Saved ✅',
        text2: `${billTitle} reminder active`,
      });
    } catch (err: any) {
      console.error('Save bill error:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to save reminder' });
    } finally {
      setIsSavingBill(false);
    }
  }

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

  // List of active providers based on selected Mode
  const activeProviders = useMemo(() => {
    if (billType === 'cycle_days') {
      return BRAND_PROVIDERS.filter(p => p.group === 'sim');
    } else {
      return BRAND_PROVIDERS.filter(p => p.type === 'monthly_date');
    }
  }, [billType]);

  const BillCard = ({ bill }: { bill: RecurringBill }) => {
    const status = getDueStatus(bill.nextDueDate);
    const theme = resolveBrandTheme(bill.provider, bill.title, bill.category);

    // Continuous smooth ambient diagonal gleam across card
    const shimmerAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 3000,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }),
          Animated.delay(2200),
        ])
      );
      loop.start();
      return () => loop.stop();
    }, [shimmerAnim]);

    return (
      <View style={[styles.billCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
        {/* Subtle Animated Shimmer Beam in Background */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.billCardShimmer,
            {
              transform: [
                {
                  translateX: shimmerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-160, 420],
                  }),
                },
                { rotate: '25deg' },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255, 255, 255, 0)',
              'rgba(255, 255, 255, 0.35)',
              'rgba(255, 255, 255, 0.75)',
              'rgba(255, 255, 255, 0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: 95, height: '260%' }}
          />
        </Animated.View>

        {/* Top Header Row */}
        <View style={styles.billCardHeader}>
          <View style={styles.billBrandRow}>
            <BrandLogo id={theme.id} color={theme.accent} size={42} />
            <View style={styles.billTitleCol}>
              <Text style={styles.billTitle} numberOfLines={1}>{bill.title}</Text>
              <View style={styles.billTagRow}>
                <View style={[styles.categoryTag, { backgroundColor: theme.tagBg }]}>
                  <Text style={[styles.categoryTagText, { color: theme.tagText }]}>{bill.category || theme.category}</Text>
                </View>
                <View style={[styles.cycleBadge, { borderColor: theme.cardBorder }]}>
                  <Ionicons name="repeat" size={10} color="#64748B" style={{ marginRight: 3 }} />
                  <Text style={styles.cycleText}>
                    {bill.type === 'monthly_date'
                      ? `Monthly (${bill.dueDay || 1}th)`
                      : `${bill.cycleDays || 28} Days Pack`}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.duePill, { backgroundColor: status.daysLeft <= 3 ? status.bg : theme.tagBg }]}>
            {status.daysLeft <= 3 && (
              <View style={[styles.duePillDot, { backgroundColor: status.color }]} />
            )}
            <Text style={[styles.duePillText, { color: status.daysLeft <= 3 ? status.color : theme.tagText }]}>
              {status.label}
            </Text>
          </View>
        </View>

        {/* Subtle Divider */}
        <View style={[styles.cardDivider, { backgroundColor: theme.cardBorder + '80' }]} />

        {/* Amount & Due Date Info - Elevated White Box */}
        <View style={[styles.billDetailsRow, { backgroundColor: theme.innerBg, borderColor: theme.innerBorder, borderWidth: 1 }]}>
          <View style={styles.billDueDateWrap}>
            <View style={[styles.dueDateIconCircle, { backgroundColor: theme.tagBg }]}>
              <Ionicons name="calendar" size={14} color={theme.accent} />
            </View>
            <View>
              <Text style={styles.dueDateLabel}>Next Due Date</Text>
              <Text style={[styles.dueDateValue, { color: status.daysLeft <= 3 ? status.color : '#0F172A' }]}>
                {formatDateDisplay(bill.nextDueDate)}
              </Text>
            </View>
          </View>

          <View style={styles.billAmountCol}>
            <Text style={styles.billAmountLabel}>Amount Due</Text>
            <Text style={styles.billAmountValue}>₹{bill.amount.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        {/* Bottom Actions Row */}
        <View style={styles.billActions}>
          <TouchableOpacity
            style={styles.payBtn}
            onPress={() => { setPayingBill(bill); setPayMode('UPI'); setPaymentProof(null); }}
            activeOpacity={0.82}
          >
            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
            <Text style={styles.payBtnText}>{t('confirm_paid') || 'Confirm Paid'}</Text>
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={[styles.editBtn, { backgroundColor: '#FFFFFF', borderColor: theme.cardBorder }]}
              onPress={() => openEditModal(bill)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${bill.title}`}
            >
              <Ionicons name="create-outline" size={16} color="#4F46E5" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteBtn, { backgroundColor: '#FFFFFF', borderColor: theme.cardBorder }]}
              onPress={() => setDeleteBill(bill)}
              activeOpacity={0.7}
              accessibilityLabel={`Delete ${bill.title}`}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

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
          {overdueBills.map(b => <BillCard key={b.id} bill={b} />)}
          <SectionHead title={t('due_soon')} count={urgentBills.length} icon="alarm-outline" color="#F59E0B" />
          {urgentBills.map(b => <BillCard key={b.id} bill={b} />)}
          <SectionHead title={t('upcoming')} count={upcomingBills.length} icon="calendar-outline" color="#3B82F6" />
          {upcomingBills.map(b => <BillCard key={b.id} bill={b} />)}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Animated Bottom Floating Action Button (FAB) */}
      <Animated.View style={[styles.fabWrap, { transform: [{ scale: fabPulse }] }]}>
        <TouchableOpacity style={styles.fab} onPress={() => openAddModal('monthly_date')} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* CLEAN & MODERN ADD / EDIT BILL MODAL */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Sheet Grab Handle */}
            <View style={styles.modalGrabHandle} />

            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editingBill ? 'Edit Reminder' : 'Add Bill Reminder'}</Text>
                <Text style={styles.modalSubtitle}>Never miss a due date with smart alerts</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.modalCloseIconBtn}>
                <Ionicons name="close" size={18} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '82%' }}>
              {/* CLEAN 2-SEGMENTED TAB SWITCHER */}
              <View style={styles.modeSegmentContainer}>
                <TouchableOpacity
                  style={[styles.modeSegmentBtn, billType === 'monthly_date' && styles.modeSegmentBtnActive]}
                  onPress={() => {
                    setBillType('monthly_date');
                    const firstMonthly = BRAND_PROVIDERS.find(p => p.id === 'tiffin') || BRAND_PROVIDERS[4];
                    handleSelectProvider(firstMonthly);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="calendar"
                    size={15}
                    color={billType === 'monthly_date' ? '#0F172A' : '#64748B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.modeSegmentText, billType === 'monthly_date' && styles.modeSegmentTextActive]}>
                    Monthly Services
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeSegmentBtn, billType === 'cycle_days' && styles.modeSegmentBtnActive]}
                  onPress={() => {
                    setBillType('cycle_days');
                    const firstSim = BRAND_PROVIDERS.find(p => p.group === 'sim')!;
                    handleSelectProvider(firstSim);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="phone-portrait"
                    size={15}
                    color={billType === 'cycle_days' ? '#0F172A' : '#64748B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.modeSegmentText, billType === 'cycle_days' && styles.modeSegmentTextActive]}>
                    Mobile Recharge
                  </Text>
                </TouchableOpacity>
              </View>

              {/* HORIZONTAL PRESET CARDS CAROUSEL */}
              <Text style={styles.cleanSectionLabel}>
                {billType === 'monthly_date' ? 'Quick Select Service' : 'Select Mobile Provider'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cleanProviderScroll}>
                {activeProviders.map(p => {
                  const isSel = selectedProviderId === p.id;
                  const pTheme = resolveBrandTheme(p.id, p.name, p.category);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.cleanProviderCard,
                        {
                          backgroundColor: isSel ? pTheme.tagBg : pTheme.cardBg,
                          borderColor: isSel ? pTheme.accent : pTheme.cardBorder,
                        },
                        isSel && styles.cleanProviderCardActive,
                      ]}
                      onPress={() => handleSelectProvider(p)}
                      activeOpacity={0.75}
                    >
                      <BrandLogo id={p.id} color={pTheme.accent} size={32} />
                      <Text
                        style={[
                          styles.cleanProviderText,
                          { color: isSel ? pTheme.accent : '#475569' },
                          isSel && { fontWeight: '800' },
                        ]}
                        numberOfLines={1}
                      >
                        {p.badge}
                      </Text>
                      {isSel && (
                        <View style={[styles.cleanCheckCircle, { backgroundColor: pTheme.accent }]}>
                          <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* SERVICE NAME & AMOUNT INPUTS */}
              <View style={styles.formRow}>
                <View style={{ flex: 1.3 }}>
                  <Text style={styles.cleanInputLabel}>Service Name</Text>
                  <TextInput
                    style={styles.cleanTextInput}
                    placeholder="e.g. Mess Service"
                    placeholderTextColor="#94A3B8"
                    value={billTitle}
                    onChangeText={setBillTitle}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cleanInputLabel}>Amount ({curr})</Text>
                  <View style={styles.amountInputWrap}>
                    <Text style={styles.amountCurrencyPrefix}>{curr}</Text>
                    <TextInput
                      style={styles.cleanAmountInput}
                      placeholder="0"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={billAmount}
                      onChangeText={setBillAmount}
                    />
                  </View>
                </View>
              </View>

              {/* QUICK AMOUNT CHIPS */}
              <View style={styles.quickChipsRow}>
                {(billType === 'cycle_days' ? ['199', '299', '666', '749', '1499', '2999'] : ['500', '1500', '3000', '5000', '8000', '15000']).map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={[styles.quickAmountPill, billAmount === amt && styles.quickAmountPillActive]}
                    onPress={() => setBillAmount(amt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickAmountPillText, billAmount === amt && styles.quickAmountPillTextActive]}>
                      {curr}{amt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* RENEWAL CONFIGURATION SECTION */}
              {billType === 'monthly_date' ? (
                <View style={styles.cleanConfigCard}>
                  <Text style={styles.cleanConfigTitle}>Due Day of Every Month</Text>

                  {/* Day Pills */}
                  <View style={styles.dayPillsGrid}>
                    {[1, 5, 10, 15, 20, 25, 30].map(d => {
                      const isSel = billDueDay === d.toString();
                      return (
                        <TouchableOpacity
                          key={d}
                          style={[styles.dayPillBtn, isSel && styles.dayPillBtnActive]}
                          onPress={() => setBillDueDay(d.toString())}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dayPillBtnText, isSel && styles.dayPillBtnTextActive]}>
                            {d}th
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.customDayRow}>
                    <Text style={styles.customDayDesc}>Custom Day of Month:</Text>
                    <TextInput
                      style={styles.customDayInputField}
                      placeholder="1"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                      value={billDueDay}
                      onChangeText={setBillDueDay}
                      maxLength={2}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.cleanConfigCard}>
                  {/* Validity Selection */}
                  <Text style={styles.cleanConfigTitle}>Pack Validity</Text>
                  <View style={styles.validityGrid}>
                    {RECHARGE_CYCLES.map(c => {
                      const isSel = billCycleDays === c.days.toString();
                      return (
                        <TouchableOpacity
                          key={c.days}
                          style={[styles.validityCard, isSel && styles.validityCardActive]}
                          onPress={() => setBillCycleDays(c.days.toString())}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.validityDaysText, isSel && styles.validityDaysTextActive]}>
                            {c.days} Days
                          </Text>
                          <Text style={[styles.validitySubText, isSel && styles.validitySubTextActive]}>
                            {c.label.split('(')[1]?.replace(')', '') || ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Start Date */}
                  <Text style={[styles.cleanConfigTitle, { marginTop: 14 }]}>Recharge Start Date</Text>
                  <View style={styles.dateSelectorGroup}>
                    <TouchableOpacity
                      style={[styles.cleanDatePill, billRechargeDate === todayStr && styles.cleanDatePillActive]}
                      onPress={() => setBillRechargeDate(todayStr)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="today-outline" size={13} color={billRechargeDate === todayStr ? '#0F172A' : '#64748B'} style={{ marginRight: 4 }} />
                      <Text style={[styles.cleanDatePillText, billRechargeDate === todayStr && styles.cleanDatePillTextActive]}>
                        Today
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.cleanDatePill, billRechargeDate === getRelativeDateString(-1) && styles.cleanDatePillActive]}
                      onPress={() => setBillRechargeDate(getRelativeDateString(-1))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.cleanDatePillText, billRechargeDate === getRelativeDateString(-1) && styles.cleanDatePillTextActive]}>
                        Yesterday
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.cleanDatePill,
                        billRechargeDate !== todayStr && billRechargeDate !== getRelativeDateString(-1) && styles.cleanDatePillActive,
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
                        styles.cleanDatePillText,
                        billRechargeDate !== todayStr && billRechargeDate !== getRelativeDateString(-1) && styles.cleanDatePillTextActive
                      ]}>
                        {billRechargeDate !== todayStr && billRechargeDate !== getRelativeDateString(-1) ? billRechargeDate : 'Custom 🗓️'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* LIVE DUE PREVIEW CARD */}
              <View style={styles.cleanPreviewCard}>
                <View style={styles.cleanPreviewLeft}>
                  <View style={styles.cleanPreviewIconCircle}>
                    <Ionicons name="notifications" size={15} color="#D97706" />
                  </View>
                  <View>
                    <Text style={styles.cleanPreviewSub}>Next Due Date</Text>
                    <Text style={styles.cleanPreviewDate}>{formatDateDisplay(livePreviewData.nextDue)}</Text>
                  </View>
                </View>
                <View style={[styles.cleanPreviewBadge, { backgroundColor: livePreviewData.statusColor + '1C' }]}>
                  <Text style={[styles.cleanPreviewBadgeText, { color: livePreviewData.statusColor }]}>
                    {livePreviewData.statusLabel}
                  </Text>
                </View>
              </View>

              {/* OPTIONAL NOTES */}
              <Text style={styles.cleanInputLabel}>Notes (Optional)</Text>
              <TextInput
                style={[styles.cleanTextInput, { marginBottom: 6 }]}
                placeholder="e.g. Landlord UPI ID, 1.5GB/day recharge"
                placeholderTextColor="#94A3B8"
                value={billNotes}
                onChangeText={setBillNotes}
              />
            </ScrollView>

            {/* SAVE BUTTON */}
            <TouchableOpacity
              style={styles.cleanPrimarySaveBtn}
              onPress={handleSave}
              disabled={isSavingBill}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.cleanPrimarySaveBtnText}>
                {isSavingBill ? 'Saving Reminder...' : editingBill ? 'Update Reminder' : 'Set Reminder'}
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

      {/* Pay Modal */}
      <Modal visible={!!payingBill} animationType="fade" transparent onRequestClose={() => setPayingBill(null)}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.payOverlay}>
          <View style={styles.paySheet}>
            <View style={styles.payHeader}>
              <View style={styles.payHeaderIcon}>
                <Ionicons name="checkmark-done" size={20} color="#10B981" />
              </View>
              <View style={styles.payHeaderCopy}>
                <Text style={styles.payTitle}>{t('record_payment')}</Text>
                <Text style={styles.payHeaderSub}>{t('record_payment_sub')}</Text>
              </View>
            </View>
            <View style={styles.payTargetRow}>
              <Text style={styles.payTargetTitle}>{payingBill?.title}</Text>
              <Text style={styles.payTargetAmount}>₹{payingBill?.amount.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.paySectionLabel}>
              <Ionicons name="card-outline" size={16} color="#64748B" />
              <Text style={styles.label}>{t('payment_mode')}</Text>
            </View>
            <View style={styles.chipsRow}>
              {['UPI', 'Cash', 'Card', 'Bank'].map(m => (
                <TouchableOpacity key={m} style={[styles.chip, payMode === m && styles.chipActive]} onPress={() => setPayMode(m)} activeOpacity={0.8}>
                  <PaymentModeIcon mode={m} size={15} style={styles.modeIcon} />
                  <Text style={[styles.chipLabel, payMode === m && { color: '#6366F1', fontWeight: '800' }]}>{t(m.toLowerCase())}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.paySectionLabel}>
              <Ionicons name="image-outline" size={16} color="#64748B" />
              <Text style={styles.label}>{t('payment_proof')}</Text>
            </View>
            {paymentProof ? (
              <View style={styles.proofPreviewRow}>
                <View style={styles.proofThumbFrame}>
                  <Image source={{ uri: paymentProof }} style={styles.proofThumbnail} resizeMode="cover" />
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" style={styles.proofCheckIcon} />
                </View>
                <View style={styles.proofPreviewInfo}>
                  <Text style={styles.proofAttachedTitle}>{t('screenshot_attached')}</Text>
                  <Text style={styles.proofAttachedSub}>{t('proof_saved')}</Text>
                </View>
                <TouchableOpacity style={styles.removeProofBtn} onPress={() => setPaymentProof(null)} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={17} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.attachProofBtn} onPress={pickPaymentProof} activeOpacity={0.75}>
                <Ionicons name="image-outline" size={19} color="#6366F1" />
                <Text style={styles.attachProofText}>{t('add_screenshot')}</Text>
                <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
              </TouchableOpacity>
            )}
            <View style={styles.payBtnsRow}>
              <TouchableOpacity style={styles.payCancelBtn} onPress={() => { setPayingBill(null); setPaymentProof(null); }} activeOpacity={0.7}>
                <Ionicons name="close-circle-outline" size={17} color="#64748B" />
                <Text style={styles.payCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.payConfirmBtn} onPress={handlePay} activeOpacity={0.85} disabled={isPaying}>
                {isPaying ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="checkmark-circle-outline" size={17} color="#fff" /><Text style={styles.payConfirmText}>{t('confirm_paid')}</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  cycleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  billCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  billBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  billTitleCol: {
    marginLeft: 12,
    flex: 1,
  },
  billTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  billTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  categoryTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryTagText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  cycleText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  billDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  billDueDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dueDateIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueDateLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dueDateValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
  billAmountCol: {
    alignItems: 'flex-end',
  },
  billAmountLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  billAmountValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 1,
  },
  billActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#10B981',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duePill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  duePillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  duePillText: { fontSize: 11, fontWeight: '800' },
  billCardShimmer: {
    position: 'absolute',
    top: -20,
    left: 0,
    bottom: -20,
    width: 95,
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
