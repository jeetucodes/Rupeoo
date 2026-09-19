import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getAllTransactions,
  sortTransactionsRecentFirst,
  getUserCategories,
  CategoryItem,
} from '@/lib/database';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { formatTime12Hour, getLocalDateString, getRelativeDateString } from '@/lib/dateUtils';
import Svg, { Circle, G, Path, Text as SvgText, Polyline } from 'react-native-svg';
import PaymentModeIcon from '@/components/PaymentModeIcon';
import CategoryIcon from '@/components/CategoryIcon';
import Skeleton from '@/components/Skeleton';
import DateTimePicker from '@react-native-community/datetimepicker';

const formatAmount = (amount: number) => {
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatCashflow = (amount: number) => {
  if (!amount || amount === 0) return '0';
  if (amount % 1 === 0) {
    return amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const getPaymentModeMeta = (modeName: string) => {
  const m = (modeName || '').toLowerCase();
  if (m.includes('upi')) return { label: 'UPI', icon: 'flash', color: '#7C3AED', bg: '#EDE9FE' };
  if (m.includes('cash')) return { label: 'Cash', icon: 'cash', color: '#16A34A', bg: '#DCFCE7' };
  if (m.includes('card')) return { label: 'Card', icon: 'card', color: '#2563EB', bg: '#DBEAFE' };
  if (m.includes('bank')) return { label: 'Bank', icon: 'business', color: '#D97706', bg: '#FEF3C7' };
  return { label: modeName || 'Cash', icon: 'wallet', color: '#6B7280', bg: '#F3F4F6' };
};

const getPieSlicePath = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const startRad = (startAngle - 90) * (Math.PI / 180);
  const endRad = (endAngle - 90) * (Math.PI / 180);

  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);

  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
};

const SlicedPieChart = ({
  data,
  total,
  curr,
  selectedCategory,
  onSelectCategory,
}: {
  data: any[];
  total: number;
  curr: string;
  selectedCategory?: string;
  onSelectCategory?: (catName: string) => void;
}) => {
  const size = 190;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 80;

  const slices = useMemo(() => {
    if (!data || data.length === 0 || total === 0) return [];
    const res: Array<any> = [];
    let currentAngle = 0;

    data.forEach((item) => {
      const sweepAngle = (item.amount / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweepAngle;
      const midAngle = (startAngle + endAngle) / 2;
      const isSelected = selectedCategory && selectedCategory !== 'All' && selectedCategory.toLowerCase() === item.name.toLowerCase();

      // Exploded offset when selected
      const explodeDist = isSelected ? 10 : 0;
      const midRad = (midAngle - 90) * (Math.PI / 180);
      const shiftX = explodeDist * Math.cos(midRad);
      const shiftY = explodeDist * Math.sin(midRad);

      // Label position inside slice
      const labelRadius = radius * 0.62;
      const labelX = cx + shiftX + labelRadius * Math.cos(midRad);
      const labelY = cy + shiftY + labelRadius * Math.sin(midRad);

      res.push({
        ...item,
        startAngle,
        endAngle,
        midAngle,
        sweepAngle,
        isSelected,
        shiftX,
        shiftY,
        labelX,
        labelY,
        path: sweepAngle >= 359.9 ? null : getPieSlicePath(cx + shiftX, cy + shiftY, radius, startAngle, endAngle),
      });

      currentAngle += sweepAngle;
    });

    return res;
  }, [data, total, cx, cy, radius, selectedCategory]);

  const activeSlice = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'All') return null;
    return data.find(c => c.name.toLowerCase() === selectedCategory.toLowerCase());
  }, [data, selectedCategory]);

  // Touch handling
  const handleTouch = (e: any) => {
    if (!onSelectCategory || slices.length === 0) return;
    const { locationX, locationY } = e.nativeEvent;
    const dx = locationX - cx;
    const dy = locationY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius + 22) {
      const angle = (Math.atan2(dy, dx) * (180 / Math.PI) + 90 + 360) % 360;
      const target = slices.find(s => angle >= s.startAngle && angle < s.endAngle);
      if (target) {
        onSelectCategory(selectedCategory?.toLowerCase() === target.name.toLowerCase() ? 'All' : target.name);
      }
    } else {
      if (selectedCategory !== 'All') {
        onSelectCategory('All');
      }
    }
  };

  return (
    <View style={styles.pieChartWrapper}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleTouch}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <G>
            {data.length === 1 || (slices.length === 1 && slices[0].sweepAngle >= 359.9) ? (
              <G>
                <Circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill={data[0]?.color || '#FFD740'}
                  stroke="#FFFFFF"
                  strokeWidth={2.5}
                />
                <SvgText
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fill="#FFFFFF"
                  fontSize={13}
                  fontWeight="900"
                >
                  100%
                </SvgText>
              </G>
            ) : (
              slices.map((slice, index) => (
                <G key={index}>
                  <Path
                    d={slice.path}
                    fill={slice.color}
                    stroke={slice.isSelected ? '#0F172A' : '#FFFFFF'}
                    strokeWidth={slice.isSelected ? 3 : 2}
                    opacity={selectedCategory && selectedCategory !== 'All' && !slice.isSelected ? 0.3 : 1}
                  />
                  {slice.sweepAngle >= 26 && (
                    <SvgText
                      x={slice.labelX}
                      y={slice.labelY + 4}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize={11}
                      fontWeight="900"
                      opacity={selectedCategory && selectedCategory !== 'All' && !slice.isSelected ? 0.4 : 1}
                    >
                      {Math.round(Number(slice.percentage))}%
                    </SvgText>
                  )}
                </G>
              ))
            )}
          </G>
        </Svg>
      </TouchableOpacity>

      {/* Dynamic Detail or Mini Category Pills */}
      {activeSlice ? (
        <View style={styles.activeSliceCard}>
          <View style={styles.activeSliceTop}>
            <View style={[styles.activeSliceIconCircle, { backgroundColor: activeSlice.color + '20' }]}>
              <Ionicons name={(activeSlice.icon || 'receipt-outline') as any} size={20} color={activeSlice.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeSliceNameText}>{activeSlice.name}</Text>
              <Text style={styles.activeSliceCountText}>{activeSlice.count || 1} transactions</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.activeSliceAmountText}>{curr}{formatAmount(activeSlice.amount)}</Text>
              <View style={styles.activeSliceBadge}>
                <Text style={styles.activeSliceBadgeText}>{activeSlice.percentage}%</Text>
              </View>
            </View>
          </View>
          {/* Progress Bar */}
          <View style={styles.activeSliceProgressTrack}>
            <View style={[styles.activeSliceProgressBar, { width: `${activeSlice.percentage}%`, backgroundColor: activeSlice.color }]} />
          </View>
          <TouchableOpacity
            style={styles.resetSliceBtn}
            onPress={() => onSelectCategory && onSelectCategory('All')}
            activeOpacity={0.7}
          >
            <Text style={styles.resetSliceBtnText}>Showing filtered transactions • Tap to reset ✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pieSummaryWrap}>
          <Text style={styles.pieCenterLabel}>TOTAL SPENT</Text>
          <Text style={styles.pieCenterAmount} numberOfLines={1}>
            {curr}{formatAmount(total)}
          </Text>

          {/* Mini Category Chips to quickly inspect */}
          {data.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.miniPillsRow}
            >
              {data.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  style={styles.miniPillItem}
                  onPress={() => onSelectCategory && onSelectCategory(cat.name)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.miniPillDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.miniPillText} numberOfLines={1}>
                    {cat.name} ({Math.round(Number(cat.percentage))}%)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
};

export default function TransactionsScreen() {
  const router = useRouter();
  const { user, settings } = useAuth();
  const { t } = useTranslation();

  const curr = settings?.currency === 'INR' ? '₹' : (settings?.currency || '₹');

  const [period, setPeriod] = useState<'This Month' | 'Last 3 Months' | 'Last 6 Months' | 'All' | 'Custom'>('This Month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [breakdownMode, setBreakdownMode] = useState<'bar' | 'line'>('bar');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'debit' | 'credit'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterPaymentMode, setFilterPaymentMode] = useState<string>('All');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showChart, setShowChart] = useState(true);

  useEffect(() => {
    setDisplayLimit(20);
  }, [period, startDate, endDate, searchQuery, filterType, selectedCategory, minAmount, maxAmount, filterPaymentMode]);

  const loadData = async (forceRefresh = false) => {
    if (!user?.uid) return;
    try {
      const [txs, cats] = await Promise.all([
        getAllTransactions(user.uid, forceRefresh),
        getUserCategories(user.uid, forceRefresh),
      ]);
      setAllTransactions(sortTransactionsRecentFirst(txs));
      setCategories(cats);
    } catch (e) {
      console.error('Error loading transactions:', e);
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

  // Filter logic
  const filteredList = useMemo(() => {
    const now = new Date();
    return allTransactions.filter(tx => {
      // Period filter
      if (period === 'This Month') {
        const d = new Date(tx.date);
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      } else if (period === 'Last 3 Months') {
        const d = new Date(tx.date);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        if (d < threeMonthsAgo) return false;
      } else if (period === 'Last 6 Months') {
        const d = new Date(tx.date);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        if (d < sixMonthsAgo) return false;
      } else if (period === 'Custom') {
        const d = new Date(tx.date);
        if (startDate) {
          const start = new Date(startDate);
          if (!isNaN(start.getTime()) && d < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (!isNaN(end.getTime()) && d > end) return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const m = (tx.merchant_name || '').toLowerCase();
        const d = (tx.description || '').toLowerCase();
        const c = (tx.category || '').toLowerCase();
        const p = (tx.payment_mode || '').toLowerCase();
        if (!m.includes(q) && !d.includes(q) && !c.includes(q) && !p.includes(q)) return false;
      }

      // Type filter
      if (filterType !== 'all') {
        if (tx.type !== filterType) return false;
      }

      // Category filter
      if (selectedCategory !== 'All') {
        if ((tx.category || '').toLowerCase() !== selectedCategory.toLowerCase()) return false;
      }

      // Amount filter
      const amt = Number(tx.amount) || 0;
      if (minAmount && !isNaN(Number(minAmount))) {
        if (amt < Number(minAmount)) return false;
      }
      if (maxAmount && !isNaN(Number(maxAmount))) {
        if (amt > Number(maxAmount)) return false;
      }

      // Payment Mode
      if (filterPaymentMode !== 'All') {
        if ((tx.payment_mode || 'Cash').toLowerCase() !== filterPaymentMode.toLowerCase()) return false;
      }

      return true;
    });
  }, [
    allTransactions,
    period,
    startDate,
    endDate,
    searchQuery,
    filterType,
    selectedCategory,
    minAmount,
    maxAmount,
    filterPaymentMode,
  ]);

  // Aggregate totals
  const { totalInflow, totalOutflow } = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    filteredList.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'credit') inflow += amt;
      else outflow += amt;
    });
    return { totalInflow: inflow, totalOutflow: outflow };
  }, [filteredList]);

  // Category pie data (calculated across period debits so pie stays intact during selection)
  const { categoryData, totalSpend } = useMemo(() => {
    const now = new Date();
    const periodDebits = allTransactions.filter(tx => {
      if (tx.type !== 'debit') return false;
      const d = new Date(tx.date);
      if (period === 'This Month') {
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      } else if (period === 'Last 3 Months') {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        if (d < threeMonthsAgo) return false;
      } else if (period === 'Last 6 Months') {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        if (d < sixMonthsAgo) return false;
      } else if (period === 'Custom') {
        if (startDate) {
          const start = new Date(startDate);
          if (!isNaN(start.getTime()) && d < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (!isNaN(end.getTime()) && d > end) return false;
        }
      }
      return true;
    });

    const catMap: Record<string, { amount: number; count: number; history: Record<string, number> }> = {};
    const daysArr = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return getLocalDateString(d);
    });

    periodDebits.forEach(t => {
      const cat = t.category || 'Others';
      if (!catMap[cat]) catMap[cat] = { amount: 0, count: 0, history: {} };
      const amt = Number(t.amount) || 0;
      catMap[cat].amount += amt;
      catMap[cat].count += 1;
      const tDate = t.date?.split('T')[0] || '';
      catMap[cat].history[tDate] = (catMap[cat].history[tDate] || 0) + amt;
    });

    const total = periodDebits.reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const cats = Object.entries(catMap).map(([name, data]) => {
      const meta = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
      const pts = daysArr.map(d => data.history[d] || 0);
      const maxPt = Math.max(...pts, 1);
      const trend = pts.map((p, i) => `${(i / 6) * 100},${30 - (p / maxPt) * 26}`).join(' ');

      return {
        name,
        amount: data.amount,
        count: data.count,
        icon: meta?.icon || 'receipt-outline',
        color: meta?.color || '#9CA3AF',
        percentage: total > 0 ? ((data.amount / total) * 100).toFixed(1) : '0.0',
        trend
      };
    });

    cats.sort((a, b) => b.amount - a.amount);
    return { categoryData: cats, totalSpend: total };
  }, [allTransactions, period, startDate, endDate, categories]);

  // Date-grouped transactions (Sorted recent-first by Date, Time, and Timestamp)
  const groupedTransactions = useMemo(() => {
    const groups: { [dateStr: string]: { dateLabel: string; totalSpend: number; items: any[] } } = {};
    const todayStr = getLocalDateString();
    const yesterdayStr = getRelativeDateString(-1);

    const sortedList = sortTransactionsRecentFirst(filteredList);
    const visibleList = sortedList.slice(0, displayLimit);

    visibleList.forEach(tx => {
      const dateKey = tx.date || 'Unknown Date';
      if (!groups[dateKey]) {
        let label = dateKey;
        if (dateKey === todayStr) label = 'Today';
        else if (dateKey === yesterdayStr) label = 'Yesterday';
        else {
          try {
            const d = new Date(dateKey);
            label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
          } catch { }
        }
        groups[dateKey] = { dateLabel: label, totalSpend: 0, items: [] };
      }
      groups[dateKey].items.push(tx);
      if (tx.type === 'debit') {
        groups[dateKey].totalSpend += Number(tx.amount) || 0;
      }
    });

    return Object.entries(groups)
      .sort(([dateKeyA], [dateKeyB]) => dateKeyB.localeCompare(dateKeyA))
      .map(([dateKey, group]) => ({
        dateKey,
        ...group,
        items: sortTransactionsRecentFirst(group.items),
      }));
  }, [filteredList, displayLimit]);

  const resetFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setSelectedCategory('All');
    setMinAmount('');
    setMaxAmount('');
    setFilterPaymentMode('All');
  };

  const hasActiveAdvancedFilters =
    filterPaymentMode !== 'All' || minAmount !== '' || maxAmount !== '';

  const getCategoryMeta = (catName: string) => {
    const cat = categories.find(c => c.name.toLowerCase() === (catName || '').toLowerCase());
    return {
      icon: cat?.icon || 'receipt-outline',
      color: cat?.color || '#3B82F6',
    };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />
        
        {/* Header Skeleton */}
        <View style={styles.header}>
          <View>
            <Skeleton width={150} height={28} style={{ marginBottom: 6 }} />
            <Skeleton width={100} height={14} />
          </View>
          <Skeleton width={44} height={44} borderRadius={22} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Summary Cards Skeleton */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 16 }}>
            <Skeleton width="48%" height={80} borderRadius={20} />
            <Skeleton width="48%" height={80} borderRadius={20} />
          </View>

          {/* Search/Filter Bar Skeleton */}
          <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <Skeleton width="100%" height={50} borderRadius={16} />
          </View>

          {/* List Header Skeleton */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 10, marginBottom: 16 }}>
            <Skeleton width={140} height={20} />
            <Skeleton width={60} height={16} />
          </View>

          {/* List Items Skeleton */}
          <View style={styles.transactionsContainer}>
            <View style={styles.dateGroup}>
              <View style={styles.dateGroupHeader}>
                <Skeleton width={100} height={14} />
                <Skeleton width={80} height={14} />
              </View>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F8FAFC' }}>
                  <Skeleton width={48} height={48} borderRadius={24} style={{ marginRight: 16 }} />
                  <View style={{ flex: 1 }}>
                    <Skeleton width={140} height={16} style={{ marginBottom: 8 }} />
                    <Skeleton width={90} height={12} />
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Skeleton width={70} height={16} style={{ marginBottom: 8 }} />
                    <Skeleton width={40} height={12} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('transactions')}</Text>
          <Text style={styles.headerSubtitle}>{filteredList.length} {t('total_records')}</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.addShortcutBtn}
            onPress={() => router.push('/add')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#1C1C1E" />
            <Text style={styles.addShortcutText}>{t('add')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
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
        {/* Simple Minimal Cashflow Summary Card */}
        <View style={styles.cashflowSimpleCard}>
          <View style={styles.cashflowSimpleCol}>
            <Text style={styles.cashflowSimpleLabel}>{t('inflow')}</Text>
            <Text
              style={[styles.cashflowSimpleValue, { color: '#16A34A' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              +{curr}{formatCashflow(totalInflow)}
            </Text>
          </View>

          <View style={styles.cashflowSimpleDivider} />

          <View style={styles.cashflowSimpleCol}>
            <Text style={styles.cashflowSimpleLabel}>{t('outflow')}</Text>
            <Text
              style={[styles.cashflowSimpleValue, { color: '#DC2626' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              -{curr}{formatCashflow(totalOutflow)}
            </Text>
          </View>

          <View style={styles.cashflowSimpleDivider} />

          <View style={styles.cashflowSimpleCol}>
            <Text style={styles.cashflowSimpleLabel}>{t('net')}</Text>
            <Text
              style={[
                styles.cashflowSimpleValue,
                { color: (totalInflow - totalOutflow) >= 0 ? '#0F172A' : '#DC2626' },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {(totalInflow - totalOutflow) >= 0 ? '+' : '-'}{curr}{formatCashflow(Math.abs(totalInflow - totalOutflow))}
            </Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarWrap}>
          <Ionicons name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: '#1C1C1E' }]}
            placeholder={t('search_tx_placeholder')}
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.filterToggleBtn, hasActiveAdvancedFilters && styles.filterToggleBtnActive]}
            onPress={() => setShowAdvancedFilters(!showAdvancedFilters)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showAdvancedFilters ? 'options' : 'options-outline'}
              size={18}
              color="#1C1C1E"
            />
          </TouchableOpacity>
        </View>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <View style={styles.advancedFilterCard}>
            <Text style={styles.filterTitle}>{t('payment_method')}</Text>
            <View style={styles.filterChipRow}>
              {[
                { id: 'All', label: t('filter_all'), icon: 'apps' },
                { id: 'UPI', label: 'UPI', icon: 'flash', color: '#7C3AED' },
                { id: 'Cash', label: t('cash'), icon: 'cash', color: '#16A34A' },
                { id: 'Card', label: t('card'), icon: 'card', color: '#2563EB' },
                { id: 'Bank', label: t('bank'), icon: 'business', color: '#D97706' },
              ].map(m => {
                const isSelected = filterPaymentMode === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.filterChip,
                      isSelected && styles.filterChipActive,
                    ]}
                    onPress={() => setFilterPaymentMode(m.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={m.icon as any}
                      size={13}
                      color={isSelected ? '#FFD740' : (m.color || '#6B7280')}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected && styles.filterChipTextActive,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.filterTitle}>{t('amount_range')} ({curr})</Text>
            <View style={styles.amountRangeRow}>
              <TextInput
                style={[styles.rangeInput, { color: '#1C1C1E' }]}
                placeholder={t('min_amount')}
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={minAmount}
                onChangeText={setMinAmount}
              />
              <Text style={{ marginHorizontal: 8, color: '#9CA3AF', fontWeight: '700' }}>-</Text>
              <TextInput
                style={[styles.rangeInput, { color: '#1C1C1E' }]}
                placeholder={t('max_amount')}
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={maxAmount}
                onChangeText={setMaxAmount}
              />
            </View>

            {hasActiveAdvancedFilters && (
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
                <Ionicons name="refresh" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                <Text style={styles.resetBtnText}>{t('reset_advanced_filters')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Type Switcher Pills */}
        <View style={styles.typeSwitcherRow}>
          {(['all', 'debit', 'credit'] as const).map(ty => (
            <TouchableOpacity
              key={ty}
              style={[styles.typeTab, filterType === ty && styles.typeTabActive]}
              onPress={() => setFilterType(ty)}
              activeOpacity={0.7}
            >
              <Text style={[styles.typeTabText, filterType === ty && styles.typeTabTextActive]}>
                {ty === 'all' ? t('all_transactions_tab') : ty === 'debit' ? t('expenses_tab') : t('income_tab')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Period Dropdown Button */}
        <View style={{ marginHorizontal: 20, marginBottom: period === 'Custom' ? 8 : 12 }}>
          <TouchableOpacity
            style={[
              styles.dropdownButton,
              period === 'Custom' && { borderColor: '#BFDBFE', backgroundColor: '#F0F7FF' }
            ]}
            onPress={() => setShowPeriodModal(true)}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons 
                name={period === 'Custom' ? "calendar" : "calendar-outline"} 
                size={16} 
                color={period === 'Custom' ? '#2563EB' : '#4B5563'} 
              />
              <Text style={[styles.dropdownButtonText, period === 'Custom' && { color: '#1D4ED8', fontWeight: '800' }]} numberOfLines={1}>
                {period === 'Custom'
                  ? (startDate && endDate
                      ? `${startDate}  →  ${endDate}`
                      : startDate
                      ? `${t('from_date')} ${startDate}`
                      : endDate
                      ? `${t('to_date')} ${endDate}`
                      : t('custom_date_range'))
                  : (period === 'This Month' ? t('this_month') : period === 'Last 3 Months' ? t('last_3_months') : period === 'Last 6 Months' ? t('last_6_months') : period === 'All' ? t('all') : period)}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={16} color={period === 'Custom' ? '#2563EB' : '#4B5563'} />
          </TouchableOpacity>
        </View>

        {/* Custom Date Range Picker when Period is Custom Range */}
        {period === 'Custom' && (
          <View style={styles.customDateCard}>
            <View style={styles.customDateCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="calendar-outline" size={14} color="#2563EB" />
                <Text style={styles.customDateCardTitle}>{t('pick_date_range')}</Text>
              </View>
              {(startDate !== '' || endDate !== '') && (
                <TouchableOpacity
                  onPress={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.customDateClearBtn}>{t('clear_dates')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.datePickerRow}>
              {Platform.OS === 'web' ? (
                <>
                  {/* @ts-ignore */}
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e: any) => setStartDate(e.target.value)}
                    style={{
                      flex: 1,
                      marginRight: 8,
                      padding: '10px 12px',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      outline: 'none',
                      fontSize: 13,
                      fontWeight: '600',
                      color: '#1C1C1E',
                      backgroundColor: '#ffffff',
                      fontFamily: 'inherit'
                    }}
                  />
                  {/* @ts-ignore */}
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e: any) => setEndDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E5E7EB',
                      outline: 'none',
                      fontSize: 13,
                      fontWeight: '600',
                      color: '#1C1C1E',
                      backgroundColor: '#ffffff',
                      fontFamily: 'inherit'
                    }}
                  />
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[
                      styles.rangeInput,
                      {
                        flex: 1,
                        marginRight: 8,
                        borderColor: startDate ? '#2563EB' : '#E5E7EB',
                        backgroundColor: startDate ? '#EFF6FF' : '#F9FAFB',
                        flexDirection: 'row',
                        alignItems: 'center',
                      }
                    ]}
                    onPress={() => setShowStartPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color={startDate ? '#2563EB' : '#9CA3AF'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={{ color: startDate ? '#1C1C1E' : '#9CA3AF', fontSize: 13, fontWeight: '600' }}>
                      {startDate || t('from_date')}
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.rangeInput,
                      {
                        flex: 1,
                        borderColor: endDate ? '#2563EB' : '#E5E7EB',
                        backgroundColor: endDate ? '#EFF6FF' : '#F9FAFB',
                        flexDirection: 'row',
                        alignItems: 'center',
                      }
                    ]}
                    onPress={() => setShowEndPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color={endDate ? '#2563EB' : '#9CA3AF'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={{ color: endDate ? '#1C1C1E' : '#9CA3AF', fontSize: 13, fontWeight: '600' }}>
                      {endDate || t('to_date')}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {showStartPicker && (
                <DateTimePicker
                  value={startDate ? new Date(startDate) : new Date()}
                  mode="date"
                  display="default"
                  onChange={(event: any, selectedDate?: Date) => {
                    if (Platform.OS === 'android') setShowStartPicker(false);
                    if (event.type === 'set' && selectedDate) {
                      const year = selectedDate.getFullYear();
                      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const day = String(selectedDate.getDate()).padStart(2, '0');
                      setStartDate(`${year}-${month}-${day}`);
                    }
                  }}
                />
              )}
              
              {showEndPicker && (
                <DateTimePicker
                  value={endDate ? new Date(endDate) : new Date()}
                  mode="date"
                  display="default"
                  onChange={(event: any, selectedDate?: Date) => {
                    if (Platform.OS === 'android') setShowEndPicker(false);
                    if (event.type === 'set' && selectedDate) {
                      const year = selectedDate.getFullYear();
                      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                      const day = String(selectedDate.getDate()).padStart(2, '0');
                      setEndDate(`${year}-${month}-${day}`);
                    }
                  }}
                />
              )}
            </View>
          </View>
        )}

        {/* Period Selection Modal */}
        <Modal
          visible={showPeriodModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPeriodModal(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowPeriodModal(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('select_period')}</Text>
              {(['All', 'This Month', 'Last 3 Months', 'Last 6 Months', 'Custom'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.modalOption, period === p && styles.modalOptionActive]}
                  onPress={() => {
                    setPeriod(p);
                    setShowPeriodModal(false);
                    if (p === 'Custom' && !startDate && Platform.OS !== 'web') {
                      setTimeout(() => setShowStartPicker(true), 350);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalOptionText, period === p && styles.modalOptionTextActive]}>
                    {p === 'This Month' ? t('this_month') : p === 'Last 3 Months' ? t('last_3_months') : p === 'Last 6 Months' ? t('last_6_months') : p === 'All' ? t('all') : t('custom_date_range')}
                  </Text>
                  {period === p && <Ionicons name="checkmark" size={20} color="#FFD740" />}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Transactions List Header */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderTitle}>{t('transaction_history')}</Text>
          <Text style={styles.listHeaderCount}>{filteredList.length} {t('items_count')}</Text>
        </View>

        {/* Grouped Transaction List */}
        {filteredList.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="receipt-outline" size={40} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyTitle}>{t('no_transactions_found')}</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || selectedCategory !== 'All' || filterType !== 'all'
                ? t('no_tx_adjust_filters')
                : t('start_tracking_msg')}
            </Text>
            <TouchableOpacity
              style={styles.addEmptyBtn}
              onPress={() => router.push('/add')}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={18} color="#1C1C1E" style={{ marginRight: 6 }} />
              <Text style={styles.addEmptyBtnText}>{t('add_transaction')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.transactionsContainer}>
            {groupedTransactions.map(group => (
              <View key={group.dateKey} style={styles.dateGroup}>
                {/* Date Group Header */}
                <View style={styles.dateGroupHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="calendar" size={13} color="#64748B" />
                    <Text style={styles.dateGroupLabel}>{group.dateLabel}</Text>
                  </View>
                  {group.totalSpend > 0 && (
                    <View style={styles.dateGroupSpendBadge}>
                      <Text style={styles.dateGroupSpent}>
                        Spent -{curr}{formatAmount(group.totalSpend)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Items in date group */}
                <View style={styles.dateGroupCard}>
                  {group.items.map((tx: any, idx: number) => {
                    const meta = getCategoryMeta(tx.category);
                    const isCredit = tx.type === 'credit';
                    const isLast = idx === group.items.length - 1;
                    const hasProof = Boolean(tx.receipt_image || tx.receiptImage);
                    const pMeta = getPaymentModeMeta(tx.payment_mode);

                    return (
                      <TouchableOpacity
                        key={tx.id || idx}
                        style={[styles.txItemRow, !isLast && styles.txItemBorder]}
                        onPress={() => router.push(`/transaction/${tx.id}` as any)}
                        activeOpacity={0.72}
                      >
                        {/* 3D Category Avatar Squircle */}
                        <View style={[styles.txIconCircle, { backgroundColor: meta.color + '15', borderColor: meta.color + '30' }]}>
                          <CategoryIcon categoryName={tx.category || 'Others'} iconName={meta.icon} size={24} color={meta.color} />
                        </View>

                        <View style={styles.txMainInfo}>
                          <View style={styles.txTitleRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                              <Text style={styles.txMerchantName} numberOfLines={1}>
                                {tx.merchant_name || tx.category || 'Transaction'}
                              </Text>
                              {hasProof && (
                                <View style={styles.proofPill}>
                                  <Ionicons name="image" size={10} color="#2563EB" style={{ marginRight: 2 }} />
                                  <Text style={styles.proofPillText}>Photo</Text>
                                </View>
                              )}
                            </View>
                            <Text
                              style={[
                                styles.txAmountText,
                                { color: isCredit ? '#059669' : '#0F172A' },
                              ]}
                            >
                              {isCredit ? '+' : '-'}
                              {curr}
                              {Number(tx.amount || 0).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                              })}
                            </Text>
                          </View>

                          <View style={styles.txMetaRow}>
                            <View style={[styles.txCategoryPill, { backgroundColor: meta.color + '12' }]}>
                              <Text style={[styles.txCategoryTag, { color: meta.color }]}>{tx.category || 'General'}</Text>
                            </View>
                            
                            <View style={[styles.txModePill, { backgroundColor: pMeta.bg }]}>
                              <PaymentModeIcon mode={tx.payment_mode} size={11} color={pMeta.color} style={{ marginRight: 4 }} />
                              <Text style={[styles.txModeText, { color: pMeta.color }]}>{pMeta.label}</Text>
                            </View>

                            {Boolean(tx.time) && (
                              <Text style={styles.txTimeTag}>• {formatTime12Hour(tx.time)}</Text>
                            )}
                          </View>

                          {Boolean(tx.description && tx.description.trim()) && (
                            <View style={styles.txNoteBox}>
                              <Ionicons name="chatbox-ellipses-outline" size={11} color="#94A3B8" style={{ marginRight: 4 }} />
                              <Text style={styles.txDescText} numberOfLines={1}>
                                {tx.description}
                              </Text>
                            </View>
                          )}
                        </View>

                        <Ionicons name="chevron-forward" size={14} color="#CBD5E1" style={{ marginLeft: 8 }} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            {displayLimit < filteredList.length && (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => setDisplayLimit(prev => prev + 20)}
                activeOpacity={0.8}
              >
                <Text style={styles.loadMoreBtnText}>Load More</Text>
                <Ionicons name="chevron-down" size={16} color="#4B5563" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerIconBtnActive: {
    backgroundColor: '#FFD740',
    borderColor: '#FFD740',
  },
  addShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD740',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  addShortcutText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1C1C1E',
    marginLeft: 2,
  },
  content: {
    paddingBottom: 110,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  cashflowSimpleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
    marginBottom: 14,
  },
  cashflowSimpleCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashflowSimpleLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  cashflowSimpleValue: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  cashflowSimpleDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#F1F5F9',
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  filterToggleBtn: {
    padding: 6,
    marginLeft: 4,
    borderRadius: 10,
  },
  filterToggleBtnActive: {
    backgroundColor: '#FFD740',
  },
  advancedFilterCard: {
    marginHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  filterTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: {
    backgroundColor: '#1C1C1E',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  filterChipTextActive: {
    color: '#FFD740',
    fontWeight: '800',
  },
  amountRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rangeInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 13,
    color: '#1C1C1E',
  },
  rangeDash: {
    color: '#9CA3AF',
    fontWeight: '700',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
  },
  typeSwitcherRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#E5E7EB',
    borderRadius: 14,
    padding: 3,
    marginBottom: 10,
  },
  typeTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 11,
  },
  typeTabActive: {
    backgroundColor: '#1C1C1E',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  typeTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  typeTabTextActive: {
    color: '#FFD740',
    fontWeight: '900',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalOptionActive: {
    backgroundColor: '#FAFAFA',
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
  },
  modalOptionTextActive: {
    color: '#1C1C1E',
    fontWeight: '800',
  },
  customDateCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#DBEAFE',
    shadowColor: '#2563EB',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  customDateCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  customDateCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  customDateClearBtn: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
  },
  customDateRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
  },
  dateRangePickerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chartCard: {
    marginHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chartHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFD740',
  },
  chartTitle: { fontSize: 13, fontWeight: '800', color: '#1E293B' },
  periodPillSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chartToggleGroup: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 6, padding: 2 },
  chartToggleBtn: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 5 },
  chartToggleBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#94A3B8', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 1 },

  barItem: { gap: 5, marginBottom: 12 },
  barHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barName: { fontSize: 12, fontWeight: '700', color: '#1E293B', flex: 1 },
  barAmt: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  barBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  barBadgeTxt: { fontSize: 10, fontWeight: '900' },
  barTrack: { height: 5.5, borderRadius: 3, backgroundColor: 'rgba(226,232,240,0.9)', overflow: 'hidden', marginTop: 2 },
  barFill: { height: '100%', borderRadius: 3 },
  lineChartContainer: { height: 30, marginTop: 2, opacity: 0.8 },
  periodPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  pieChartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    position: 'relative',
  },
  pieSummaryWrap: {
    alignItems: 'center',
    width: '100%',
    marginTop: 10,
  },
  pieCenterLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pieCenterAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  miniPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 6,
  },
  miniPillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  miniPillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  miniPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  activeSliceCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeSliceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activeSliceIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSliceNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  activeSliceCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  activeSliceAmountText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  activeSliceBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  activeSliceBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFD740',
  },
  activeSliceProgressTrack: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 2.5,
    overflow: 'hidden',
    marginTop: 10,
  },
  activeSliceProgressBar: {
    height: '100%',
    borderRadius: 2.5,
  },
  resetSliceBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 2,
  },
  resetSliceBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  listHeaderTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  listHeaderCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  loadingWrap: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  addEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD740',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 16,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  addEmptyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  transactionsContainer: {
    marginHorizontal: 20,
    gap: 16,
  },
  dateGroup: {},
  dateGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  dateGroupLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateGroupSpendBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dateGroupSpent: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  dateGroupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    shadowColor: '#64748B',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  txItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  txItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    marginVertical: 10,
  },
  loadMoreBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4B5563',
  },
  txIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1.5,
  },
  txMainInfo: {
    flex: 1,
  },
  txTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  txMerchantName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    flexShrink: 1,
  },
  proofPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  proofPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  txAmountText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  txCategoryPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  txCategoryTag: {
    fontSize: 11,
    fontWeight: '800',
  },
  txTimeTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  txModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  txModeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  txNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  txDescText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
});
