import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  useWindowDimensions,
  ActivityIndicator,
  Share,
  Platform,
  Animated,
  Easing,
  RefreshControl,
  StatusBar,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Svg, {
  Circle,
  Rect,
  G,
  Text as SvgText,
  Line,
  Path,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { useAuth } from '@/context/AuthContext';
import { getAllTransactions, getUserCategories, CategoryItem, defaultCategories } from '@/lib/database';
import CategoryIcon from '@/components/CategoryIcon';
import PaymentModeIcon from '@/components/PaymentModeIcon';
import Toast from 'react-native-toast-message';
import { generateAndShareFinancialReportPDF } from '@/lib/pdfReport';
import { checkPdfExportLimit, incrementPdfExportCount, getPdfExportCount, FREE_PDF_EXPORT_LIMIT } from '@/lib/limits';
import { useTranslation } from '@/lib/i18n';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 40;

type PeriodType = 'this_month' | 'last_month' | '3_months' | 'this_year' | 'all';
type ChartViewType = 'curve' | 'bars' | 'donut';

export interface TransactionItem {
  id?: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description?: string;
  merchant_name?: string;
  title?: string;
  payment_mode?: string;
}

interface CategorySpend {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  icon: string;
  count: number;
}

interface TrendPoint {
  label: string;
  dayName?: string;
  fullDate?: string;
  income: number;
  expense: number;
  net: number;
}

const PALETTE = [
  '#F59E0B', '#6366F1', '#10B981', '#EC4899', '#3B82F6',
  '#8B5CF6', '#14B8A6', '#F97316', '#EF4444', '#06B6D4',
  '#64748B', '#84CC16',
];

// Helper to generate ultra-smooth Bezier curve path
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function ReportsScreen() {
  const router = useRouter();
  const { user, settings, isPremium, appConfig } = useAuth();
  const { t } = useTranslation();
  const curr = settings?.currency === 'INR' ? '₹' : (settings?.currency || '₹');
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(windowWidth - 76, 260);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [period, setPeriod] = useState<PeriodType>('this_month');
  const [chartView, setChartView] = useState<ChartViewType>('donut');
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [selectedTrendIndex, setSelectedTrendIndex] = useState<number | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<CategorySpend | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfExportCount, setPdfExportCount] = useState<number>(0);

  const refreshPdfCount = useCallback(async () => {
    if (!isPremium) {
      const c = await getPdfExportCount(user?.uid);
      setPdfExportCount(c);
    }
  }, [isPremium, user?.uid]);

  useFocusEffect(
    useCallback(() => {
      refreshPdfCount();
    }, [refreshPdfCount])
  );

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Smooth Multi-Phase Pastel Color Flow & Soft Light Gleam for Net Savings Card
  const colorAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Smooth, continuous multi-phase color transition (60s)
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

    colorLoop.start();
    shimmerLoop.start();

    return () => {
      colorLoop.stop();
      shimmerLoop.stop();
    };
  }, [colorAnim, shimmerAnim]);

  // Card Background Color Interpolation (Unique Royal Periwinkle / Berry / Amber / Aqua / Lavender flow)
  const animatedCardBg = colorAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4, 5],
    outputRange: [
      '#E0E7FF', // Royal Periwinkle / Soft Indigo
      '#FCE7F3', // Sweet Berry Pink / Soft Magenta
      '#FEF3C7', // Warm Golden Amber / Honey
      '#CCFBF1', // Bright Aqua Teal / Ocean Foam
      '#DDD6FE', // Vibrant Lavender Violet
      '#E0E7FF', // Loop back to Periwinkle
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
      {
        rotate: '25deg',
      },
    ],
  };

  const loadData = useCallback(async (forceRefresh = false) => {
    if (!user?.uid) return;
    try {
      const [txList, catList] = await Promise.all([
        getAllTransactions(user.uid, forceRefresh),
        getUserCategories(user.uid, forceRefresh),
      ]);
      const normalizedTx: TransactionItem[] = (txList || []).map((t: any) => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount) || 0,
        type: (t.type === 'credit' || t.type === 'income') ? 'income' : 'expense',
        category: t.category || 'Others',
        description: t.description || t.merchant_name || '',
        title: t.title || t.merchant_name || t.description || t.category || 'Expense',
        payment_mode: t.payment_mode || t.paymentMode || 'UPI',
      }));
      setTransactions(normalizedTx);
      setCategories(catList && catList.length > 0 ? catList : defaultCategories);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    } catch (e) {
      console.warn('Failed to load report data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid, fadeAnim]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  // Filter transactions based on selected period
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return transactions.filter(tx => {
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) return false;

      if (period === 'this_month') {
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      }
      if (period === 'last_month') {
        const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
        return (
          d.getFullYear() === lastMonthDate.getFullYear() &&
          d.getMonth() === lastMonthDate.getMonth()
        );
      }
      if (period === '3_months') {
        const threeMonthsAgo = new Date(currentYear, currentMonth - 2, 1);
        return d >= threeMonthsAgo && d <= now;
      }
      if (period === 'this_year') {
        return d.getFullYear() === currentYear;
      }
      return true; // all
    });
  }, [transactions, period]);

  // Key Financial Metrics
  const metrics = useMemo(() => {
    let income = 0;
    let expense = 0;

    filteredTransactions.forEach(tx => {
      const val = Math.abs(tx.amount);
      if (tx.type === 'income') {
        income += val;
      } else {
        expense += val;
      }
    });

    const net = income - expense;
    const savingsRate = income > 0 ? Math.max(0, Math.round((net / income) * 100)) : 0;
    const count = filteredTransactions.length;
    const avgTxn = count > 0 ? Math.round((income + expense) / count) : 0;

    let daySpan = 30;
    if (period === 'this_month') {
      daySpan = Math.max(1, new Date().getDate());
    } else if (period === '3_months') {
      daySpan = 90;
    } else if (period === 'this_year') {
      const start = new Date(new Date().getFullYear(), 0, 1);
      daySpan = Math.max(1, Math.round((new Date().getTime() - start.getTime()) / 86400000));
    }
    const dailyAvg = expense > 0 ? Math.round(expense / daySpan) : 0;

    return {
      income,
      expense,
      net,
      savingsRate,
      count,
      dailyAvg,
      avgTxn,
    };
  }, [filteredTransactions, period]);

  // Category Breakdown (Expense or Income)
  const categoryBreakdown = useMemo<CategorySpend[]>(() => {
    const targetTx = filteredTransactions.filter(t => t.type === categoryType);
    const totalAmount = targetTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const map: { [cat: string]: { amount: number; count: number } } = {};
    targetTx.forEach(t => {
      const cat = t.category || 'Others';
      if (!map[cat]) map[cat] = { amount: 0, count: 0 };
      map[cat].amount += Math.abs(t.amount);
      map[cat].count += 1;
    });

    const list: CategorySpend[] = Object.keys(map).map((catName, idx) => {
      const matchedCat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      const amount = map[catName].amount;
      const percentage = totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0;
      return {
        name: catName,
        amount,
        percentage,
        color: matchedCat?.color || PALETTE[idx % PALETTE.length],
        icon: matchedCat?.icon || (categoryType === 'income' ? 'wallet' : 'receipt'),
        count: map[catName].count,
      };
    });

    return list.sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, categories, categoryType]);

  // Payment Modes Split
  const paymentModesSplit = useMemo(() => {
    const expenseTx = filteredTransactions.filter(t => t.type === 'expense');
    const total = expenseTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const modeMap: { [key: string]: number } = { UPI: 0, Cash: 0, Card: 0, Bank: 0 };

    expenseTx.forEach(t => {
      const m = (t.payment_mode || 'UPI').toUpperCase();
      if (m.includes('UPI')) modeMap.UPI += Math.abs(t.amount);
      else if (m.includes('CASH')) modeMap.Cash += Math.abs(t.amount);
      else if (m.includes('CARD')) modeMap.Card += Math.abs(t.amount);
      else modeMap.Bank += Math.abs(t.amount);
    });

    return Object.keys(modeMap).map(mode => ({
      mode,
      amount: modeMap[mode],
      percentage: total > 0 ? Math.round((modeMap[mode] / total) * 100) : 0,
    })).filter(m => m.amount > 0);
  }, [filteredTransactions]);

  // Smart Financial Health Score & Dynamic AI Insights
  const financialHealth = useMemo(() => {
    const { income, expense, savingsRate, count } = metrics;
    if (count === 0 || (income === 0 && expense === 0)) {
      return {
        score: 75,
        rating: 'Balanced',
        color: '#6366F1',
        insights: [
          'Add your daily transactions to generate personalized financial health insights.',
          'Following the 50/30/20 budget rule helps build long-term wealth.',
        ],
      };
    }

    let score = 50;
    if (savingsRate >= 40) score += 35;
    else if (savingsRate >= 25) score += 25;
    else if (savingsRate >= 10) score += 15;
    else if (savingsRate > 0) score += 5;
    else score -= 15;

    if (income > 0) {
      const ratio = expense / income;
      if (ratio <= 0.5) score += 15;
      else if (ratio <= 0.75) score += 10;
      else if (ratio > 1) score -= 10;
    }

    score = Math.min(99, Math.max(25, score));

    let rating = 'Healthy';
    let color = '#10B981';
    if (score >= 85) {
      rating = 'Excellent';
      color = '#10B981';
    } else if (score >= 70) {
      rating = 'Good';
      color = '#6366F1';
    } else if (score >= 50) {
      rating = 'Fair';
      color = '#F59E0B';
    } else {
      rating = 'Needs Care';
      color = '#EF4444';
    }

    const insights: string[] = [];

    if (savingsRate >= 25) {
      insights.push(`🎯 Wealth Builder: Saving ${savingsRate}% of income comfortably beats the standard 20% golden benchmark.`);
    } else if (income > 0 && savingsRate < 10) {
      insights.push(`⚠️ Tight Margin: Current savings rate is ${savingsRate}%. Focus on trimming non-essential lifestyle spends.`);
    } else if (income === 0 && expense > 0) {
      insights.push(`💡 Cash Outflow: ${curr}${expense.toLocaleString('en-IN')} in expenses recorded with no registered income.`);
    }

    if (categoryBreakdown.length > 0) {
      const top = categoryBreakdown[0];
      const annualProjected = Math.round(top.amount * 12);
      insights.push(`🏷️ Top Outflow: "${top.name}" takes ${top.percentage}% (${curr}${top.amount.toLocaleString('en-IN')}). Trimming 10% saves ~${curr}${Math.round(annualProjected * 0.1).toLocaleString('en-IN')}/year!`);
    }

    if (paymentModesSplit.length > 0) {
      const primaryMode = paymentModesSplit[0];
      insights.push(`💳 Primary Channel: ${primaryMode.mode} powers ${primaryMode.percentage}% of all your transactions.`);
    }

    return { score, rating, color, insights };
  }, [metrics, categoryBreakdown, paymentModesSplit, categoryType, curr]);

  // Daily Spending Points for the Smooth Curve
  const dailyTrendPoints = useMemo<TrendPoint[]>(() => {
    const now = new Date();
    const map: { [dayKey: string]: { label: string; dayName: string; fullDate: string; income: number; expense: number } } = {};

    // 7 recent data bins
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      map[key] = {
        label: `${d.getDate()} ${months[d.getMonth()]}`,
        dayName: dayNames[d.getDay()],
        fullDate: key,
        income: 0,
        expense: 0,
      };
    }

    filteredTransactions.forEach(t => {
      const key = t.date;
      if (map[key]) {
        const val = Math.abs(t.amount);
        if (t.type === 'income') map[key].income += val;
        else map[key].expense += val;
      }
    });

    return Object.keys(map).map(k => ({
      label: map[k].label,
      dayName: map[k].dayName,
      fullDate: map[k].fullDate,
      income: map[k].income,
      expense: map[k].expense,
      net: map[k].income - map[k].expense,
    }));
  }, [filteredTransactions]);

  // 7-Day Spending Wave Summary
  const spendingWaveSummary = useMemo(() => {
    let totalSpend = 0;
    let peakSpend = 0;
    let peakDayLabel = '';
    dailyTrendPoints.forEach(p => {
      totalSpend += p.expense;
      if (p.expense > peakSpend) {
        peakSpend = p.expense;
        peakDayLabel = p.label;
      }
    });
    const avgDailySpend = Math.round(totalSpend / Math.max(dailyTrendPoints.length, 1));
    return { totalSpend, peakSpend, peakDayLabel, avgDailySpend };
  }, [dailyTrendPoints]);

  // 6-Month Macro Trends
  const monthlyTrends = useMemo<TrendPoint[]>(() => {
    const monthsMap: { [key: string]: { label: string; income: number; expense: number } } = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsMap[key] = {
        label: `${monthNames[d.getMonth()]}`,
        income: 0,
        expense: 0,
      };
    }

    transactions.forEach(t => {
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthsMap[key]) {
        const val = Math.abs(t.amount);
        if (t.type === 'income') {
          monthsMap[key].income += val;
        } else {
          monthsMap[key].expense += val;
        }
      }
    });

    return Object.keys(monthsMap).map(k => ({
      label: monthsMap[k].label,
      fullDate: k,
      income: monthsMap[k].income,
      expense: monthsMap[k].expense,
      net: monthsMap[k].income - monthsMap[k].expense,
    }));
  }, [transactions]);

  // 6-Month Cash Flow Aggregate Summary
  const cashFlowSummary = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    monthlyTrends.forEach(m => {
      totalIn += m.income;
      totalOut += m.expense;
    });
    const totalNet = totalIn - totalOut;
    const savingsRate = totalIn > 0 ? Math.max(0, Math.round((totalNet / totalIn) * 100)) : 0;
    return { totalIn, totalOut, totalNet, savingsRate };
  }, [monthlyTrends]);

  // Day of Week Distribution
  const dayOfWeekSpend = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sums = [0, 0, 0, 0, 0, 0, 0];

    filteredTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const d = new Date(t.date);
        if (!isNaN(d.getTime())) {
          sums[d.getDay()] += Math.abs(t.amount);
        }
      });

    const maxSpend = Math.max(...sums, 1);
    return days.map((day, idx) => ({
      day,
      amount: sums[idx],
      percentOfMax: Math.round((sums[idx] / maxSpend) * 100),
    }));
  }, [filteredTransactions]);

  // Top 5 Largest Expenses
  const topExpenses = useMemo(() => {
    return filteredTransactions
      .filter(t => t.type === 'expense')
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5);
  }, [filteredTransactions]);


  // Month-over-Month Velocity & Comparison
  const prevPeriodMetrics = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const prevTxs = transactions.filter(tx => {
      const d = new Date(tx.date);
      if (isNaN(d.getTime())) return false;

      if (period === 'this_month') {
        const lastMo = new Date(currentYear, currentMonth - 1, 1);
        return d.getFullYear() === lastMo.getFullYear() && d.getMonth() === lastMo.getMonth();
      }
      if (period === 'last_month') {
        const twoMoAgo = new Date(currentYear, currentMonth - 2, 1);
        return d.getFullYear() === twoMoAgo.getFullYear() && d.getMonth() === twoMoAgo.getMonth();
      }
      if (period === '3_months') {
        const sixMoAgo = new Date(currentYear, currentMonth - 5, 1);
        const threeMoAgo = new Date(currentYear, currentMonth - 2, 1);
        return d >= sixMoAgo && d < threeMoAgo;
      }
      if (period === 'this_year') {
        return d.getFullYear() === currentYear - 1;
      }
      return false;
    });

    let prevExpense = 0;
    let prevIncome = 0;
    prevTxs.forEach(t => {
      if (t.type === 'expense') prevExpense += Math.abs(t.amount);
      else prevIncome += Math.abs(t.amount);
    });

    const diff = metrics.expense - prevExpense;
    const diffPct = prevExpense > 0 ? Math.round((Math.abs(diff) / prevExpense) * 100) : 0;
    const isHigher = diff > 0;

    let projectedSpend = metrics.expense;
    if (period === 'this_month') {
      const daysInMo = new Date(currentYear, currentMonth + 1, 0).getDate();
      const currentDay = Math.max(1, now.getDate());
      projectedSpend = Math.round((metrics.expense / currentDay) * daysInMo);
    }

    return {
      prevExpense,
      prevIncome,
      diff,
      diffPct,
      isHigher,
      hasPrevData: prevTxs.length > 0,
      projectedSpend,
    };
  }, [transactions, period, metrics]);

  // Safe-to-Spend Daily Budget & Projection
  const safeToSpend = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = Math.max(1, now.getDate());
    const remainingDays = Math.max(1, totalDaysInMonth - currentDay + 1);

    const availablePool = Math.max(0, metrics.income - metrics.expense);
    const dailySafeLimit = metrics.income > 0 ? Math.round(availablePool / remainingDays) : 0;

    const burnRatePerDay = Math.round(metrics.expense / currentDay);
    const projectedMonthEndSpend = Math.round(burnRatePerDay * totalDaysInMonth);
    const projectedDifference = metrics.income > 0 ? metrics.income - projectedMonthEndSpend : 0;
    const isProjectedDeficit = metrics.income > 0 && projectedMonthEndSpend > metrics.income;

    return {
      remainingDays,
      totalDaysInMonth,
      currentDay,
      dailySafeLimit,
      projectedMonthEndSpend,
      projectedDifference,
      isProjectedDeficit,
      burnRatePerDay,
    };
  }, [metrics]);

  // 50 / 30 / 20 Budget Rule Breakdown
  const rule503020 = useMemo(() => {
    const expenseTx = filteredTransactions.filter(t => t.type === 'expense');
    const totalExp = expenseTx.reduce((acc, t) => acc + Math.abs(t.amount), 0);

    const needsKeywords = [
      'rent',
      'groceries',
      'utilities',
      'bills',
      'healthcare',
      'emi',
      'education',
      'fuel',
      'medical',
      'transport',
      'medicine',
      'hospital',
      'doctor',
    ];

    let needsAmt = 0;
    let wantsAmt = 0;

    expenseTx.forEach(t => {
      const cat = (t.category || '').toLowerCase();
      if (needsKeywords.some(k => cat.includes(k))) {
        needsAmt += Math.abs(t.amount);
      } else {
        wantsAmt += Math.abs(t.amount);
      }
    });

    const income = metrics.income > 0 ? metrics.income : totalExp;
    const needsPct = income > 0 ? Math.round((needsAmt / income) * 100) : 0;
    const wantsPct = income > 0 ? Math.round((wantsAmt / income) * 100) : 0;
    const savingsPct = metrics.savingsRate;

    return {
      needsAmt,
      wantsAmt,
      savingsAmt: Math.max(0, metrics.net),
      needsPct: Math.min(100, needsPct),
      wantsPct: Math.min(100, wantsPct),
      savingsPct: Math.min(100, savingsPct),
    };
  }, [filteredTransactions, metrics]);

  // Weekend vs Weekday Spending Analysis
  const weekendVsWeekday = useMemo(() => {
    const expenseTx = filteredTransactions.filter(t => t.type === 'expense');
    let weekdayTotal = 0;
    let weekendTotal = 0;
    let weekdayCount = 0;
    let weekendCount = 0;

    expenseTx.forEach(t => {
      const d = new Date(t.date);
      const day = d.getDay(); // 0 = Sun, 6 = Sat
      if (day === 0 || day === 6) {
        weekendTotal += Math.abs(t.amount);
        weekendCount++;
      } else {
        weekdayTotal += Math.abs(t.amount);
        weekdayCount++;
      }
    });

    const total = weekdayTotal + weekendTotal;
    const weekdayPct = total > 0 ? Math.round((weekdayTotal / total) * 100) : 50;
    const weekendPct = total > 0 ? 100 - weekdayPct : 50;

    return {
      weekdayTotal,
      weekendTotal,
      weekdayPct,
      weekendPct,
      weekdayCount,
      weekendCount,
    };
  }, [filteredTransactions]);

  // Share Executive Summary (WhatsApp, Telegram, Message, Email etc.)
  const handleShareReport = async () => {
    try {
      if (filteredTransactions.length === 0) {
        Toast.show({
          type: 'info',
          text1: 'No Data',
          text2: 'No transactions found to generate an executive summary.',
        });
        return;
      }

      const periodTitle =
        period === 'this_month' ? 'This Month' :
        period === 'last_month' ? 'Last Month' :
        period === '3_months' ? 'Last 3 Months' :
        period === 'this_year' ? 'This Year' : 'All Time';

      const userName = user?.displayName || 'Rupeo Member';
      const formattedDate = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      // Health rating emoji
      const healthEmoji =
        financialHealth.score >= 85 ? '🟢' :
        financialHealth.score >= 70 ? '🔵' :
        financialHealth.score >= 50 ? '🟡' : '🔴';

      const netSign = metrics.net >= 0 ? '+' : '';

      // Compute top expense categories specifically
      const expenseTx = filteredTransactions.filter(t => t.type === 'expense');
      const totalExp = expenseTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const catMap: { [cat: string]: number } = {};
      expenseTx.forEach(t => {
        const cat = t.category || 'Others';
        catMap[cat] = (catMap[cat] || 0) + Math.abs(t.amount);
      });
      const topCatList = Object.entries(catMap)
        .map(([name, amount]) => ({
          name,
          amount,
          percentage: totalExp > 0 ? Math.round((amount / totalExp) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      let text = `━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `📊 *RUPEO EXECUTIVE FINANCIAL SUMMARY*\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `👤 *Account:* ${userName}\n`;
      text += `🗓️ *Period:* ${periodTitle}\n`;
      text += `📅 *Generated On:* ${formattedDate}\n\n`;

      text += `💎 *FINANCIAL HEALTH*\n`;
      text += `• Score: ${healthEmoji} ${financialHealth.score}/100 (${financialHealth.rating})\n`;
      text += `• Savings Rate: ${metrics.savingsRate}%\n\n`;

      text += `💰 *CASH FLOW OVERVIEW*\n`;
      text += `• Total Income: ${curr}${metrics.income.toLocaleString('en-IN')}\n`;
      text += `• Total Expenses: ${curr}${metrics.expense.toLocaleString('en-IN')}\n`;
      text += `• Net Savings: ${netSign}${curr}${metrics.net.toLocaleString('en-IN')}\n`;
      text += `• Daily Avg Spend: ${curr}${metrics.dailyAvg.toLocaleString('en-IN')}/day\n`;
      text += `• Total Transactions: ${filteredTransactions.length}\n\n`;

      // 50/30/20 Budget Breakdown
      if (rule503020.needsAmt > 0 || rule503020.wantsAmt > 0) {
        text += `⚖️ *50/30/20 BUDGET DISCIPLINE*\n`;
        text += `• Needs (Essentials): ${curr}${rule503020.needsAmt.toLocaleString('en-IN')} (${rule503020.needsPct}%)\n`;
        text += `• Wants (Lifestyle): ${curr}${rule503020.wantsAmt.toLocaleString('en-IN')} (${rule503020.wantsPct}%)\n`;
        text += `• Savings / Surplus: ${curr}${rule503020.savingsAmt.toLocaleString('en-IN')} (${rule503020.savingsPct}%)\n\n`;
      }

      // Velocity & Comparison
      if (prevPeriodMetrics.hasPrevData) {
        text += `⚡ *SPENDING VELOCITY*\n`;
        text += `• Prior Period Spend: ${curr}${prevPeriodMetrics.prevExpense.toLocaleString('en-IN')}\n`;
        text += `• Trajectory: ${prevPeriodMetrics.diffPct}% ${prevPeriodMetrics.isHigher ? 'higher 🔺' : 'lower 🔻'} than prior period\n`;
        if (period === 'this_month') {
          text += `• Projected Month-End: ${curr}${prevPeriodMetrics.projectedSpend.toLocaleString('en-IN')}\n`;
        }
        text += `\n`;
      }

      // Top Spending Categories
      if (topCatList.length > 0) {
        text += `🏷️ *TOP SPENDING CATEGORIES*\n`;
        topCatList.slice(0, 5).forEach((c, idx) => {
          text += `${idx + 1}. ${c.name}: ${curr}${c.amount.toLocaleString('en-IN')} (${c.percentage}%)\n`;
        });
        text += `\n`;
      }

      // Habits & Patterns
      const habits: string[] = [];
      if (weekendVsWeekday.weekdayTotal > 0 || weekendVsWeekday.weekendTotal > 0) {
        habits.push(`• Weekday vs Weekend: ${weekendVsWeekday.weekdayPct}% vs ${weekendVsWeekday.weekendPct}%`);
      }
      if (paymentModesSplit.length > 0) {
        const topMode = paymentModesSplit[0];
        habits.push(`• Primary Payment Mode: ${topMode.mode} (${topMode.percentage}% of spends)`);
      }
      if (topExpenses.length > 0) {
        const topExp = topExpenses[0];
        const title = topExp.title || topExp.category || 'Expense';
        habits.push(`• Largest Single Expense: ${title} (${curr}${Math.abs(topExp.amount).toLocaleString('en-IN')})`);
      }

      if (habits.length > 0) {
        text += `📌 *KEY HABITS & BEHAVIOR*\n`;
        text += habits.join('\n') + `\n\n`;
      }

      // Smart Advice / Recommendation
      if (financialHealth.insights.length > 0) {
        text += `💡 *SMART RECOMMENDATION*\n`;
        text += `• ${financialHealth.insights[0]}\n\n`;
      }

      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🚀 *Rupeo — Smart Wealth & Expense Tracker*\n`;
      text += `📲 *Download App:* https://rupeoo.vercel.app/download\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━`;

      await Share.share({
        title: `Rupeo Financial Report - ${periodTitle}`,
        message: text,
      });
    } catch (e) {
      console.error('Share Report Error:', e);
      Toast.show({ type: 'error', text1: 'Could not share report' });
    }
  };

  // CSV Export
  const handleExportCSV = async () => {
    try {
      if (filteredTransactions.length === 0) {
        Toast.show({ type: 'info', text1: 'No Data', text2: 'No transactions to export for this period' });
        return;
      }

      const periodLabel =
        period === 'this_month' ? 'This_Month' :
        period === 'last_month' ? 'Last_Month' :
        period === '3_months' ? 'Last_3_Months' :
        period === 'this_year' ? 'This_Year' : 'All_Time';

      let csv = 'Date,Description,Category,Type,Amount,PaymentMode\n';
      filteredTransactions.forEach(tx => {
        const title = `"${(tx.title || tx.description || tx.category || '').replace(/"/g, '""')}"`;
        const cat = `"${(tx.category || '').replace(/"/g, '""')}"`;
        const mode = `"${(tx.payment_mode || 'UPI').replace(/"/g, '""')}"`;
        csv += `${tx.date},${title},${cat},${tx.type},${tx.amount},${mode}\n`;
      });

      const filename = `Rupeo_Report_${periodLabel}.csv`;

      // Web direct browser file download
      if (Platform.OS === 'web') {
        if (typeof document !== 'undefined' && typeof window !== 'undefined') {
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          Toast.show({ type: 'success', text1: 'CSV Downloaded', text2: `Saved as ${filename}` });
          setShowExportModal(false);
          return;
        }
      }

      // Mobile (Android / iOS) file system write & share
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Export Rupeo Report (${filename})`,
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Toast.show({ type: 'success', text1: 'CSV Exported', text2: `Saved as ${filename}` });
      }
      setShowExportModal(false);
    } catch (e) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Export Failed', text2: 'Could not export CSV file' });
    }
  };

  // Multi-Page PDF Generation & Share
  const handleExportPDF = async () => {
    try {
      if (filteredTransactions.length === 0) {
        Toast.show({ type: 'info', text1: 'No Data', text2: 'No transactions found for this period' });
        return;
      }

      // Check Free Tier PDF Limit (Max 3 for Free users, Unlimited for Pro or when Pro is turned off by Admin)
      const isProOff = appConfig?.showSubscriptions === false || appConfig?.showProFeatures === false;
      const { allowed } = await checkPdfExportLimit(isPremium, user?.uid, isProOff);
      if (!allowed) {
        setShowExportModal(false);
        const canUpgrade = appConfig?.showSubscriptions !== false && appConfig?.showProFeatures !== false;
        Alert.alert(
          canUpgrade ? 'Rupeo Pro Feature 👑' : 'Export Limit Reached ⚠️',
          canUpgrade
            ? `Free version mein maximum ${FREE_PDF_EXPORT_LIMIT} PDF statements export/share karne ki limit hai jo aap poori kar chuke hain.\n\nUnlimited official multi-page reports aur statement share karne ke liye Rupeo Pro upgrade karein.`
            : `Free version mein maximum ${FREE_PDF_EXPORT_LIMIT} PDF statements export karne ki limit poori ho chuki hai.`,
          canUpgrade
            ? [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Upgrade to Pro 🚀', onPress: () => router.push('/premium') },
              ]
            : [{ text: 'OK', style: 'default' }]
        );
        return;
      }

      setIsGeneratingPDF(true);
      setShowExportModal(false);

      const periodTitle =
        period === 'this_month' ? 'This Month' :
        period === 'last_month' ? 'Last Month' :
        period === '3_months' ? 'Last 3 Months' :
        period === 'this_year' ? 'This Year' : 'All Time';

      // Calculate dedicated expense category breakdown for PDF export
      const expenseTx = filteredTransactions.filter(t => t.type === 'expense');
      const totalExpAmount = expenseTx.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const catMap: { [cat: string]: { amount: number; count: number } } = {};
      expenseTx.forEach(t => {
        const cat = t.category || 'Others';
        if (!catMap[cat]) catMap[cat] = { amount: 0, count: 0 };
        catMap[cat].amount += Math.abs(t.amount);
        catMap[cat].count += 1;
      });
      const expenseBreakdownForPDF = Object.keys(catMap).map((catName, idx) => {
        const matchedCat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
        const amount = catMap[catName].amount;
        const percentage = totalExpAmount > 0 ? Math.round((amount / totalExpAmount) * 100) : 0;
        return {
          name: catName,
          amount,
          percentage,
          color: matchedCat?.color || PALETTE[idx % PALETTE.length],
          icon: matchedCat?.icon || 'receipt',
          count: catMap[catName].count,
        };
      }).sort((a, b) => b.amount - a.amount);

      await generateAndShareFinancialReportPDF({
        userName: user?.displayName || 'Rupeo User',
        userEmail: user?.email || '',
        periodTitle,
        curr,
        metrics,
        prevPeriodMetrics,
        financialHealth,
        rule503020,
        weekendVsWeekday,
        dayOfWeekSpend,
        categoryBreakdown: expenseBreakdownForPDF.length > 0 ? expenseBreakdownForPDF : categoryBreakdown,
        paymentModesSplit,
        topExpenses,
        transactions: filteredTransactions,
        dailyTrendPoints,
        monthlyTrends,
      });

      if (!isPremium) {
        const newCount = await incrementPdfExportCount(user?.uid);
        setPdfExportCount(newCount);
        const remaining = Math.max(0, FREE_PDF_EXPORT_LIMIT - newCount);
        Toast.show({
          type: 'success',
          text1: 'PDF Statement Exported 🎉',
          text2: remaining > 0
            ? `${remaining} free export${remaining > 1 ? 's' : ''} left`
            : 'Last free export used. Upgrade to Pro for unlimited statements.',
        });
      } else {
        Toast.show({ type: 'success', text1: 'PDF Exported', text2: 'Multi-page financial statement ready' });
      }
    } catch (e: any) {
      console.error('PDF Export Error:', e);
      Toast.show({ type: 'error', text1: 'PDF Error', text2: e?.message || 'Could not generate PDF' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Render SVG Smooth Bezier Line & Area Graph (Enhanced Spending Wave)
  const renderSmoothLineGraph = () => {
    const dataPoints = dailyTrendPoints;
    const maxVal = Math.max(...dataPoints.map(p => p.expense), 500);
    const chartHeight = 155;
    const paddingX = 18;
    const usableWidth = chartWidth - paddingX * 2;
    const step = usableWidth / Math.max(dataPoints.length - 1, 1);

    const coords = dataPoints.map((p, idx) => ({
      x: paddingX + idx * step,
      y: chartHeight - (p.expense / maxVal) * (chartHeight - 35) - 12,
    }));

    const smoothLineD = buildSmoothPath(coords);
    const smoothAreaD = `${smoothLineD} L ${coords[coords.length - 1].x} ${chartHeight} L ${coords[0].x} ${chartHeight} Z`;

    const activePoint = selectedPointIndex !== null && dataPoints[selectedPointIndex]
      ? dataPoints[selectedPointIndex]
      : null;
    const activeCoord = selectedPointIndex !== null && coords[selectedPointIndex]
      ? coords[selectedPointIndex]
      : null;

    // Helper for formatting Y-axis numbers
    const formatY = (val: number) => (val >= 1000 ? `${Math.round(val / 1000)}k` : `${val}`);

    const isPeakPoint = activePoint && activePoint.expense === spendingWaveSummary.peakSpend && spendingWaveSummary.peakSpend > 0;
    const spendPercent = activePoint && spendingWaveSummary.totalSpend > 0
      ? Math.round((activePoint.expense / spendingWaveSummary.totalSpend) * 100)
      : 0;

    return (
      <View style={styles.chartWrapperCard}>
        {/* HEADER */}
        <View style={styles.chartHeaderRow}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.themeCardTitle}>{t('spending_wave') || 'Spending Wave'}</Text>
              <View style={styles.waveLiveBadge}>
                <Text style={styles.waveLiveBadgeText}>7-Day Wave</Text>
              </View>
            </View>
            <Text style={styles.themeCardSub}>
              {activePoint
                ? `Inspecting ${activePoint.dayName || ''} ${activePoint.label} daily spend`
                : 'Tap any day along the wave to inspect outflow'}
            </Text>
          </View>

          {/* Reset or Peak Pill */}
          {activePoint ? (
            <TouchableOpacity
              style={styles.resetCatBtn}
              onPress={() => setSelectedPointIndex(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={13} color="#64748B" style={{ marginRight: 3 }} />
              <Text style={styles.resetCatText}>Reset</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.wavePeakSummaryPill}>
              <Ionicons name="flame" size={12} color="#D97706" style={{ marginRight: 3 }} />
              <Text style={styles.wavePeakSummaryText}>
                Peak: {curr}{spendingWaveSummary.peakSpend.toLocaleString('en-IN')}
              </Text>
            </View>
          )}
        </View>

        {/* 7-DAY EXECUTIVE SUMMARY STRIP (WHEN NO POINT SELECTED) */}
        {!activePoint ? (
          <View style={styles.waveSummaryRow}>
            <View style={styles.waveSummaryCol}>
              <Text style={styles.waveSummaryLabel}>7-DAY OUTFLOW</Text>
              <Text style={[styles.waveSummaryValue, { color: '#0F172A' }]}>
                {curr}{spendingWaveSummary.totalSpend.toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.waveSummaryDivider} />
            <View style={styles.waveSummaryCol}>
              <Text style={styles.waveSummaryLabel}>DAILY AVERAGE</Text>
              <Text style={[styles.waveSummaryValue, { color: '#D97706' }]}>
                {curr}{spendingWaveSummary.avgDailySpend.toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.waveSummaryDivider} />
            <View style={styles.waveSummaryCol}>
              <Text style={styles.waveSummaryLabel}>PEAK OUTFLOW</Text>
              <Text style={[styles.waveSummaryValue, { color: '#DC2626' }]}>
                {curr}{spendingWaveSummary.peakSpend.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        ) : (
          /* ACTIVE DAY INSPECTOR CARD */
          <View style={styles.waveInspectorCard}>
            <View style={styles.waveInspectorHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={styles.waveInspectorIcon}>
                  <Ionicons name="pulse" size={13} color="#D97706" />
                </View>
                <Text style={styles.waveInspectorTitle}>
                  {activePoint.dayName ? `${activePoint.dayName}, ` : ''}{activePoint.label}
                </Text>
              </View>

              <View style={[
                styles.waveBadge,
                isPeakPoint
                  ? { backgroundColor: '#FEE2E2', borderColor: '#FECDD3' }
                  : activePoint.expense === 0
                  ? { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }
                  : { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }
              ]}>
                <Ionicons
                  name={isPeakPoint ? 'flame' : activePoint.expense === 0 ? 'checkmark-circle' : 'analytics'}
                  size={12}
                  color={isPeakPoint ? '#DC2626' : activePoint.expense === 0 ? '#16A34A' : '#D97706'}
                  style={{ marginRight: 3 }}
                />
                <Text style={[
                  styles.waveBadgeText,
                  { color: isPeakPoint ? '#B91C1C' : activePoint.expense === 0 ? '#15803D' : '#92400E' }
                ]}>
                  {isPeakPoint
                    ? 'Peak Spending Day'
                    : activePoint.expense === 0
                    ? 'Zero Spends'
                    : `${spendPercent}% of 7-Day`}
                </Text>
              </View>
            </View>

            <View style={styles.waveInspectorPillsRow}>
              <View style={styles.waveInspectorPillItem}>
                <Text style={styles.waveInspectorPillLabel}>OUTFLOW</Text>
                <Text style={[styles.waveInspectorPillValue, { color: '#DC2626' }]}>
                  {curr}{activePoint.expense.toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.waveInspectorPillItem}>
                <Text style={styles.waveInspectorPillLabel}>VS 7-D AVG</Text>
                <Text style={[
                  styles.waveInspectorPillValue,
                  {
                    color: activePoint.expense > spendingWaveSummary.avgDailySpend
                      ? '#DC2626'
                      : activePoint.expense < spendingWaveSummary.avgDailySpend
                      ? '#059669'
                      : '#64748B'
                  }
                ]}>
                  {activePoint.expense > spendingWaveSummary.avgDailySpend
                    ? `+${curr}${(activePoint.expense - spendingWaveSummary.avgDailySpend).toLocaleString('en-IN')}`
                    : activePoint.expense < spendingWaveSummary.avgDailySpend
                    ? `-${curr}${(spendingWaveSummary.avgDailySpend - activePoint.expense).toLocaleString('en-IN')}`
                    : 'Equal'}
                </Text>
              </View>
              <View style={styles.waveInspectorPillItem}>
                <Text style={styles.waveInspectorPillLabel}>INFLOW</Text>
                <Text style={[styles.waveInspectorPillValue, { color: '#059669' }]}>
                  +{curr}{activePoint.income.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* SVG CHART */}
        <Svg width={chartWidth} height={chartHeight + 35} style={{ alignSelf: 'center' }}>
          <Defs>
            <LinearGradient id="smoothAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F59E0B" stopOpacity="0.4" />
              <Stop offset="0.65" stopColor="#F59E0B" stopOpacity="0.08" />
              <Stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FBBF24" />
              <Stop offset="0.4" stopColor="#F59E0B" />
              <Stop offset="0.8" stopColor="#EA580C" />
              <Stop offset="1" stopColor="#D97706" />
            </LinearGradient>
            <LinearGradient id="activeWaveColGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F59E0B" stopOpacity="0.12" />
              <Stop offset="1" stopColor="#F59E0B" stopOpacity="0.02" />
            </LinearGradient>
          </Defs>

          {/* Reference guidelines with Y-axis markers */}
          <Line x1={paddingX} y1={chartHeight * 0.22} x2={chartWidth - paddingX} y2={chartHeight * 0.22} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="4 4" />
          <SvgText x={paddingX} y={chartHeight * 0.22 - 3} fontSize="8.5" fontWeight="700" fill="#94A3B8">{curr}{formatY(maxVal * 0.78)}</SvgText>

          <Line x1={paddingX} y1={chartHeight * 0.58} x2={chartWidth - paddingX} y2={chartHeight * 0.58} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="4 4" />
          <SvgText x={paddingX} y={chartHeight * 0.58 - 3} fontSize="8.5" fontWeight="700" fill="#94A3B8">{curr}{formatY(maxVal * 0.42)}</SvgText>

          {/* Baseline */}
          <Line x1={paddingX} y1={chartHeight} x2={chartWidth - paddingX} y2={chartHeight} stroke="#E2E8F0" strokeWidth="1.2" />

          {/* Active Column Highlight Pillar (Behind Wave) */}
          {activeCoord && (
            <Rect
              x={activeCoord.x - step / 2}
              y={6}
              width={step}
              height={chartHeight - 4}
              rx={10}
              fill="url(#activeWaveColGrad)"
              stroke="#FDE68A"
              strokeWidth="1"
            />
          )}

          {/* Glowing Area Fill Under Curve */}
          <Path d={smoothAreaD} fill="url(#smoothAreaGrad)" />

          {/* Smooth Bezier Line */}
          <Path d={smoothLineD} stroke="url(#lineGrad)" strokeWidth="3.2" fill="transparent" strokeLinecap="round" strokeLinejoin="round" />

          {/* Selected Point Vertical Guideline */}
          {activeCoord && (
            <Line
              x1={activeCoord.x}
              y1={activeCoord.y}
              x2={activeCoord.x}
              y2={chartHeight}
              stroke="#D97706"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}

          {/* Data Points, Touch Strips & Labels */}
          {coords.map((c, idx) => {
            const isSelected = selectedPointIndex === idx;
            const item = dataPoints[idx];
            const isPeak = item.expense === spendingWaveSummary.peakSpend && spendingWaveSummary.peakSpend > 0;

            return (
              <G key={`dot-${idx}`}>
                {/* Full Column Touch Strip */}
                <Rect
                  x={c.x - step / 2}
                  y={0}
                  width={step}
                  height={chartHeight + 35}
                  fill="transparent"
                  onPress={() => setSelectedPointIndex(selectedPointIndex === idx ? null : idx)}
                />

                {/* Selected Point Halo Ring */}
                {isSelected && (
                  <Circle
                    cx={c.x}
                    cy={c.y}
                    r={10}
                    fill="#F59E0B"
                    opacity={0.22}
                  />
                )}

                {/* Main Point Dot */}
                <Circle
                  cx={c.x}
                  cy={c.y}
                  r={isSelected ? 6 : isPeak ? 4.5 : 3.5}
                  fill={isSelected ? '#B45309' : isPeak ? '#EF4444' : '#FFFFFF'}
                  stroke={isSelected ? '#FFFFFF' : isPeak ? '#FFFFFF' : '#F59E0B'}
                  strokeWidth={isSelected ? 2.5 : isPeak ? 2 : 2}
                  onPress={() => setSelectedPointIndex(selectedPointIndex === idx ? null : idx)}
                />

                {/* Peak Day Beacon */}
                {isPeak && !isSelected && (
                  <Circle
                    cx={c.x}
                    cy={c.y - 8}
                    r={2.5}
                    fill="#EF4444"
                  />
                )}

                {/* X Axis Day & Date Label */}
                <SvgText
                  x={c.x}
                  y={chartHeight + 17}
                  fontSize={isSelected ? '11' : '10'}
                  fontWeight={isSelected ? '900' : '700'}
                  fill={isSelected ? '#0F172A' : '#64748B'}
                  textAnchor="middle"
                  onPress={() => setSelectedPointIndex(selectedPointIndex === idx ? null : idx)}
                >
                  {item.dayName || item.label.split(' ')[0]}
                </SvgText>

                <SvgText
                  x={c.x}
                  y={chartHeight + 28}
                  fontSize="8"
                  fontWeight={isSelected ? '800' : '600'}
                  fill={isSelected ? '#D97706' : '#94A3B8'}
                  textAnchor="middle"
                  onPress={() => setSelectedPointIndex(selectedPointIndex === idx ? null : idx)}
                >
                  {item.label.split(' ')[0]}
                </SvgText>

                {/* Active Indicator Underline */}
                {isSelected && (
                  <Line
                    x1={c.x - 8}
                    y1={chartHeight + 32}
                    x2={c.x + 8}
                    y2={chartHeight + 32}
                    stroke="#D97706"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </G>
            );
          })}
        </Svg>
      </View>
    );
  };

  // Render Bar Chart for Monthly Income vs Expense (Enhanced Cash Flow Trends)
  const renderMonthlyBarChart = () => {
    const maxVal = Math.max(
      ...monthlyTrends.map(m => Math.max(m.income, m.expense)),
      1000
    );
    const chartHeight = 155;
    const paddingX = 12;
    const usableWidth = chartWidth - paddingX * 2;
    const gap = usableWidth / Math.max(monthlyTrends.length, 1);
    const barWidth = Math.min(Math.max(gap * 0.28, 8), 16);

    const activeItem = selectedTrendIndex !== null && monthlyTrends[selectedTrendIndex]
      ? monthlyTrends[selectedTrendIndex]
      : null;

    // Helper for formatting Y-axis numbers
    const formatY = (val: number) => (val >= 1000 ? `${Math.round(val / 1000)}k` : `${val}`);

    return (
      <View style={styles.chartWrapperCard}>
        {/* HEADER */}
        <View style={styles.chartHeaderRow}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.themeCardTitle}>{t('cash_flow_trends') || 'Cash Flow Trends'}</Text>
              <View style={styles.trendLiveBadge}>
                <Text style={styles.trendLiveBadgeText}>6-Month</Text>
              </View>
            </View>
            <Text style={styles.themeCardSub}>
              {activeItem
                ? `Inspecting ${activeItem.label} cash flow`
                : 'Tap any column to inspect income, expense & savings'}
            </Text>
          </View>

          {/* Reset / Legend */}
          {activeItem ? (
            <TouchableOpacity
              style={styles.resetCatBtn}
              onPress={() => setSelectedTrendIndex(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={13} color="#64748B" style={{ marginRight: 3 }} />
              <Text style={styles.resetCatText}>Reset</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.barLegendRow}>
              <View style={styles.legendDotItem}>
                <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.legendText}>In</Text>
              </View>
              <View style={styles.legendDotItem}>
                <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.legendText}>Out</Text>
              </View>
            </View>
          )}
        </View>

        {/* 6-MONTH AGGREGATE SUMMARY STRIP (WHEN NO COLUMN SELECTED) */}
        {!activeItem ? (
          <View style={styles.trendSummaryRow}>
            <View style={styles.trendSummaryCol}>
              <Text style={styles.trendSummaryLabel}>TOTAL INFLOW</Text>
              <Text style={[styles.trendSummaryValue, { color: '#059669' }]}>
                +{curr}{cashFlowSummary.totalIn.toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.trendSummaryDivider} />
            <View style={styles.trendSummaryCol}>
              <Text style={styles.trendSummaryLabel}>TOTAL OUTFLOW</Text>
              <Text style={[styles.trendSummaryValue, { color: '#DC2626' }]}>
                -{curr}{cashFlowSummary.totalOut.toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.trendSummaryDivider} />
            <View style={styles.trendSummaryCol}>
              <Text style={styles.trendSummaryLabel}>NET SURPLUS</Text>
              <Text style={[styles.trendSummaryValue, { color: cashFlowSummary.totalNet >= 0 ? '#059669' : '#DC2626' }]}>
                {cashFlowSummary.totalNet >= 0 ? '+' : '-'}{curr}{Math.abs(cashFlowSummary.totalNet).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        ) : (
          /* ACTIVE MONTH INSPECTOR POPUP CARD */
          <View style={styles.trendInspectorCard}>
            <View style={styles.trendInspectorHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={styles.trendInspectorIcon}>
                  <Ionicons name="calendar" size={13} color="#2563EB" />
                </View>
                <Text style={styles.trendInspectorTitle}>{activeItem.label} Cash Flow</Text>
              </View>
              <View style={[
                styles.trendNetBadge,
                { backgroundColor: activeItem.net >= 0 ? '#DCFCE7' : '#FEE2E2' }
              ]}>
                <Ionicons
                  name={activeItem.net >= 0 ? 'trending-up' : 'trending-down'}
                  size={12}
                  color={activeItem.net >= 0 ? '#16A34A' : '#DC2626'}
                  style={{ marginRight: 3 }}
                />
                <Text style={[
                  styles.trendNetBadgeText,
                  { color: activeItem.net >= 0 ? '#15803D' : '#B91C1C' }
                ]}>
                  {activeItem.net >= 0
                    ? `+${curr}${activeItem.net.toLocaleString('en-IN')} Net Saved`
                    : `-${curr}${Math.abs(activeItem.net).toLocaleString('en-IN')} Deficit`}
                </Text>
              </View>
            </View>

            <View style={styles.trendInspectorPillsRow}>
              <View style={styles.trendInspectorPillIn}>
                <Text style={styles.trendInspectorPillLabel}>INFLOW</Text>
                <Text style={styles.trendInspectorPillValue}>+{curr}{activeItem.income.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.trendInspectorPillOut}>
                <Text style={styles.trendInspectorPillLabel}>OUTFLOW</Text>
                <Text style={styles.trendInspectorPillValue}>-{curr}{activeItem.expense.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.trendInspectorPillRate}>
                <Text style={styles.trendInspectorPillLabel}>SAVINGS RATE</Text>
                <Text style={styles.trendInspectorPillValue}>
                  {activeItem.income > 0 ? `${Math.max(0, Math.round((activeItem.net / activeItem.income) * 100))}%` : '0%'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* SVG CHART */}
        <Svg width={chartWidth} height={chartHeight + 35} style={{ alignSelf: 'center' }}>
          <Defs>
            <LinearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#34D399" stopOpacity="1" />
              <Stop offset="1" stopColor="#059669" stopOpacity="0.9" />
            </LinearGradient>
            <LinearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F87171" stopOpacity="1" />
              <Stop offset="1" stopColor="#DC2626" stopOpacity="0.9" />
            </LinearGradient>
            <LinearGradient id="activeColGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#3B82F6" stopOpacity="0.12" />
              <Stop offset="1" stopColor="#3B82F6" stopOpacity="0.02" />
            </LinearGradient>
          </Defs>

          {/* Reference guidelines with Y-axis markers */}
          <Line x1={paddingX} y1={chartHeight * 0.2} x2={chartWidth - paddingX} y2={chartHeight * 0.2} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="4 4" />
          <SvgText x={paddingX} y={chartHeight * 0.2 - 3} fontSize="8.5" fontWeight="700" fill="#94A3B8">{curr}{formatY(maxVal * 0.8)}</SvgText>

          <Line x1={paddingX} y1={chartHeight * 0.55} x2={chartWidth - paddingX} y2={chartHeight * 0.55} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="4 4" />
          <SvgText x={paddingX} y={chartHeight * 0.55 - 3} fontSize="8.5" fontWeight="700" fill="#94A3B8">{curr}{formatY(maxVal * 0.45)}</SvgText>

          {/* Baseline */}
          <Line x1={paddingX} y1={chartHeight} x2={chartWidth - paddingX} y2={chartHeight} stroke="#E2E8F0" strokeWidth="1.2" />

          {monthlyTrends.map((item, idx) => {
            const xCenter = paddingX + idx * gap + gap / 2;
            const isSelected = selectedTrendIndex === idx;
            const incH = Math.min((item.income / maxVal) * (chartHeight - 20), chartHeight - 10);
            const expH = Math.min((item.expense / maxVal) * (chartHeight - 20), chartHeight - 10);
            const colWidth = Math.max(gap - 4, 30);

            return (
              <G key={item.label}>
                {/* Active Column Highlight Pillar */}
                {isSelected && (
                  <Rect
                    x={xCenter - colWidth / 2}
                    y={6}
                    width={colWidth}
                    height={chartHeight - 4}
                    rx={10}
                    fill="url(#activeColGrad)"
                    stroke="#BFDBFE"
                    strokeWidth="1"
                  />
                )}

                {/* Touch Area Covering Entire Column */}
                <Rect
                  x={xCenter - colWidth / 2}
                  y={0}
                  width={colWidth}
                  height={chartHeight + 35}
                  fill="transparent"
                  onPress={() => setSelectedTrendIndex(selectedTrendIndex === idx ? null : idx)}
                />

                {/* Income Bar */}
                <Rect
                  x={xCenter - barWidth - 2}
                  y={chartHeight - incH}
                  width={barWidth}
                  height={Math.max(incH, 4)}
                  rx={5}
                  fill="url(#incomeGrad)"
                  onPress={() => setSelectedTrendIndex(selectedTrendIndex === idx ? null : idx)}
                />

                {/* Expense Bar */}
                <Rect
                  x={xCenter + 2}
                  y={chartHeight - expH}
                  width={barWidth}
                  height={Math.max(expH, 4)}
                  rx={5}
                  fill="url(#expenseGrad)"
                  onPress={() => setSelectedTrendIndex(selectedTrendIndex === idx ? null : idx)}
                />

                {/* Net Savings Dot Indicator */}
                {item.income > 0 && item.expense > 0 && (
                  <Circle
                    cx={xCenter}
                    cy={Math.min(chartHeight - incH, chartHeight - expH) - 8}
                    r={isSelected ? 3.5 : 2.5}
                    fill={item.net >= 0 ? '#10B981' : '#EF4444'}
                    stroke="#FFFFFF"
                    strokeWidth={1}
                  />
                )}

                {/* Month Label */}
                <SvgText
                  x={xCenter}
                  y={chartHeight + 20}
                  fontSize={isSelected ? '12' : '11'}
                  fontWeight={isSelected ? '900' : '700'}
                  fill={isSelected ? '#0F172A' : '#64748B'}
                  textAnchor="middle"
                  onPress={() => setSelectedTrendIndex(selectedTrendIndex === idx ? null : idx)}
                >
                  {item.label}
                </SvgText>

                {/* Active Indicator Underline */}
                {isSelected && (
                  <Line
                    x1={xCenter - 10}
                    y1={chartHeight + 25}
                    x2={xCenter + 10}
                    y2={chartHeight + 25}
                    stroke="#2563EB"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                )}
              </G>
            );
          })}
        </Svg>
      </View>
    );
  };

  // Render SVG Donut Chart for Categories
  const renderCategoryDonut = () => {
    if (categoryBreakdown.length === 0) return null;

    const size = 190;
    const strokeWidth = 22;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let accumulatedOffset = 0;

    const activeCat = selectedCategory ? categoryBreakdown.find(c => c.name === selectedCategory) : null;
    const totalAmount = categoryType === 'expense' ? metrics.expense : metrics.income;

    return (
      <View style={styles.donutCardInner}>
        <View style={styles.donutContainer}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {categoryBreakdown.map((cat) => {
                const isSelected = selectedCategory === cat.name;
                const strokeLength = (circumference * cat.percentage) / 100;
                const currentOffset = accumulatedOffset;
                accumulatedOffset += strokeLength;

                return (
                  <Circle
                    key={cat.name}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={cat.color}
                    strokeWidth={isSelected ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={`${Math.max(strokeLength, 0.1)} ${circumference}`}
                    strokeDashoffset={-currentOffset}
                    strokeLinecap="round"
                    fill="transparent"
                    opacity={selectedCategory && !isSelected ? 0.3 : 1}
                    {...(Platform.OS === 'web'
                      ? { onClick: () => setSelectedCategory(isSelected ? null : cat.name) }
                      : { onPress: () => setSelectedCategory(isSelected ? null : cat.name) })}
                  />
                );
              })}
            </G>
          </Svg>

          <TouchableOpacity
            style={styles.donutCenterContent}
            onPress={() => setSelectedCategory(null)}
            activeOpacity={0.7}
          >
            {activeCat ? (
              <>
                <View style={[styles.donutActiveCatIcon, { backgroundColor: activeCat.color + '20' }]}>
                  <CategoryIcon categoryName={activeCat.name} iconName={activeCat.icon} color={activeCat.color} size={18} />
                </View>
                <Text style={styles.donutActiveCatName} numberOfLines={1}>
                  {activeCat.name}
                </Text>
                <Text style={styles.donutActiveCatAmount} numberOfLines={1}>
                  {curr}{activeCat.amount.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.donutActiveCatPercent}>
                  {activeCat.percentage}% of total
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.donutCenterLabel}>
                  {categoryType === 'expense' ? t('total_spent') : t('total_income_label')}
                </Text>
                <Text style={styles.donutCenterAmount} numberOfLines={1}>
                  {curr}{totalAmount > 99999 ? (totalAmount / 1000).toFixed(1) + 'k' : totalAmount.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.donutTapHint}>{t('tap_slice')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Category Chips */}
        <View style={styles.donutChipsWrap}>
          {categoryBreakdown.slice(0, 6).map(c => {
            const isSel = selectedCategory === c.name;
            return (
              <TouchableOpacity
                key={c.name}
                style={[
                  styles.donutChip,
                  isSel && { borderColor: c.color, backgroundColor: c.color + '18' },
                ]}
                onPress={() => setSelectedCategory(isSel ? null : c.name)}
                activeOpacity={0.7}
              >
                <View style={[styles.donutChipDot, { backgroundColor: c.color }]} />
                <Text style={[styles.donutChipText, isSel && { fontWeight: '800', color: '#0F172A' }]}>
                  {c.name} ({c.percentage}%)
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#1C1C1E" />
          <Text style={styles.loadingText}>{t('loading_analytics')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* HEADER WITH THEMED BRAND ACCENT */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>{t('financial_reports')}</Text>
          <Text style={styles.screenSubtitle}>{t('income_expense_analytics')}</Text>
        </View>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => setShowExportModal(true)}
          activeOpacity={0.75}
          disabled={isGeneratingPDF}
        >
          {isGeneratingPDF ? (
            <ActivityIndicator size="small" color="#0F172A" />
          ) : (
            <Ionicons name="share-social-outline" size={18} color="#1C1C1E" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1C1C1E" />}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* COMPACT PERIOD FILTER BAR (RESPONSIVE HORIZONTAL SCROLL ON MOBILE) */}
          <View style={styles.periodSegmentWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.periodScrollContent}
            >
              {[
                { key: 'this_month', label: t('period_month') },
                { key: 'last_month', label: t('period_last_mo') },
                { key: '3_months', label: t('period_3mo') },
                { key: 'this_year', label: t('period_year') },
                { key: 'all', label: t('period_all') },
              ].map(p => {
                const isSel = period === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.periodSegmentBtn, isSel && styles.periodSegmentBtnActive]}
                    onPress={() => {
                      setPeriod(p.key as PeriodType);
                      setSelectedPointIndex(null);
                      setSelectedCategory(null);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[styles.periodSegmentText, isSel && styles.periodSegmentTextActive]}
                      numberOfLines={1}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* HERO NET SAVINGS CARD */}
          <Animated.View style={[styles.heroOverviewCard, { backgroundColor: animatedCardBg }]}>
            {/* Smooth Diagonal Shimmer Gleam */}
            <Animated.View style={[styles.shimmerBeam, shimmerStyle]} pointerEvents="none" />

            {/* Header Row: Label Pill (✦ NET SAVINGS) & Savings Rate Badge */}
            <View style={styles.heroTopRow}>
              <View style={styles.heroNetLabelWrap}>
                <Ionicons name="sparkles" size={12} color="#0F172A" style={{ marginRight: 4 }} />
                <Text style={styles.heroNetLabel}>{t('net_savings')}</Text>
              </View>

              <View style={styles.heroSavingsBadge}>
                <Ionicons name="trending-up" size={13} color="#0F172A" style={{ marginRight: 4 }} />
                <Text style={styles.heroSavingsBadgeText}>{metrics.savingsRate}% {t('saved_pct')}</Text>
              </View>
            </View>

            {/* Main Net Savings Display */}
            <View style={styles.heroAmountWrap}>
              <Text style={styles.heroNetValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                {metrics.net >= 0 ? '+' : ''}{curr}{metrics.net.toLocaleString('en-IN')}
              </Text>
            </View>

            {/* Income, Expense & Daily Average Split 3-Card Grid (Mobile Responsive Stacked) */}
            <View style={styles.heroCashflowRow}>
              <View style={styles.heroIncomeCard}>
                <View style={styles.heroCardHeaderMini}>
                  <View style={styles.heroIncomeIconCircle}>
                    <Ionicons name="arrow-up" size={10} color="#16A34A" />
                  </View>
                  <Text style={styles.heroInnerCardLabel} numberOfLines={1}>{t('income')}</Text>
                </View>
                <Text style={styles.heroIncomeAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  +{curr}{metrics.income.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.heroExpenseCard}>
                <View style={styles.heroCardHeaderMini}>
                  <View style={styles.heroExpenseIconCircle}>
                    <Ionicons name="arrow-down" size={10} color="#DC2626" />
                  </View>
                  <Text style={styles.heroInnerCardLabel} numberOfLines={1}>{t('expenses')}</Text>
                </View>
                <Text style={styles.heroExpenseAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  -{curr}{metrics.expense.toLocaleString('en-IN')}
                </Text>
              </View>

              <View style={styles.heroDailyCard}>
                <View style={styles.heroCardHeaderMini}>
                  <View style={styles.heroDailyIconCircle}>
                    <Ionicons name="calendar-outline" size={10} color="#6366F1" />
                  </View>
                  <Text style={styles.heroInnerCardLabel} numberOfLines={1}>{t('daily_avg')}</Text>
                </View>
                <Text style={styles.heroDailyAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {curr}{metrics.dailyAvg.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* MONTH-OVER-MONTH VELOCITY & PACE COMPARISON */}
          <View style={styles.velocityCard}>
            <View style={styles.velocityHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 6 }}>
                <View style={styles.velocityIconCircle}>
                  <Ionicons name="speedometer-outline" size={16} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.velocityCardTitle} numberOfLines={1}>{t('spending_velocity')}</Text>
                  <Text style={styles.velocityCardSub} numberOfLines={1}>
                    {period === 'this_month' ? t('current_vs_last') : t('comparative_trend')}
                  </Text>
                </View>
              </View>

              {prevPeriodMetrics.hasPrevData ? (
                <View
                  style={[
                    styles.velocityPill,
                    prevPeriodMetrics.isHigher ? styles.velocityPillHigher : styles.velocityPillLower,
                  ]}
                >
                  <Ionicons
                    name={prevPeriodMetrics.isHigher ? 'trending-up' : 'trending-down'}
                    size={13}
                    color={prevPeriodMetrics.isHigher ? '#DC2626' : '#16A34A'}
                    style={{ marginRight: 3 }}
                  />
                  <Text
                    style={[
                      styles.velocityPillText,
                      prevPeriodMetrics.isHigher ? styles.velocityTextHigher : styles.velocityTextLower,
                    ]}
                  >
                    {prevPeriodMetrics.diffPct}% {prevPeriodMetrics.isHigher ? t('more_spending') : t('less_spending')}
                  </Text>
                </View>
              ) : (
                <View style={styles.velocityPillNeutral}>
                  <Text style={styles.velocityPillNeutralText}>{t('first_period')}</Text>
                </View>
              )}
            </View>

            <View style={styles.velocityStatsGrid}>
              <View style={styles.velocityStatBox}>
                <Text style={styles.velocityStatLabel}>{t('projected_month')}</Text>
                <Text style={styles.velocityStatValue}>{curr}{prevPeriodMetrics.projectedSpend.toLocaleString('en-IN')}</Text>
                <Text style={styles.velocityStatHint}>at {curr}{metrics.dailyAvg}/day pace</Text>
              </View>

              <View style={styles.velocityStatDivider} />

              <View style={styles.velocityStatBox}>
                <Text style={styles.velocityStatLabel}>{t('previous_period')}</Text>
                <Text style={styles.velocityStatValue}>
                  {curr}{prevPeriodMetrics.prevExpense.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.velocityStatHint}>
                  {prevPeriodMetrics.hasPrevData
                    ? `${prevPeriodMetrics.isHigher ? '+' : '-'}${curr}${Math.abs(prevPeriodMetrics.diff).toLocaleString('en-IN')} change`
                    : t('no_prior_data')}
                </Text>
              </View>
            </View>

            {/* Safe-to-Spend Daily Allowance Banner */}
            <View style={styles.safeToSpendBanner}>
              <View style={styles.safeToSpendLeft}>
                <View style={styles.safeToSpendIconWrap}>
                  <Ionicons name="shield-checkmark" size={16} color="#059669" />
                </View>
                <View>
                  <Text style={styles.safeToSpendTitle}>Safe Daily Budget</Text>
                  <Text style={styles.safeToSpendSub}>{safeToSpend.remainingDays} days remaining this month</Text>
                </View>
              </View>
              <View style={styles.safeToSpendRight}>
                <Text style={styles.safeToSpendValue}>
                  {safeToSpend.dailySafeLimit > 0 ? `${curr}${safeToSpend.dailySafeLimit.toLocaleString('en-IN')}` : `${curr}${metrics.dailyAvg.toLocaleString('en-IN')}`}
                  <Text style={styles.safeToSpendPerDay}>/day</Text>
                </Text>
                <View style={[styles.safeToSpendPill, safeToSpend.isProjectedDeficit ? styles.safeToSpendPillWarning : styles.safeToSpendPillSafe]}>
                  <Text style={[styles.safeToSpendPillText, safeToSpend.isProjectedDeficit ? styles.safeToSpendTextWarning : styles.safeToSpendTextSafe]}>
                    {safeToSpend.isProjectedDeficit ? 'Pace Warning' : 'Safe Pace'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* 50 / 30 / 20 FINANCIAL BUDGET HEALTH RULE */}
          <View style={styles.ruleCard}>
            <View style={styles.ruleHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 6 }}>
                <View style={styles.ruleIconCircle}>
                  <Ionicons name="pie-chart-outline" size={16} color="#0D9488" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ruleCardTitle} numberOfLines={1}>{t('budget_rule')}</Text>
                  <Text style={styles.ruleCardSub} numberOfLines={1}>{t('budget_rule_sub')}</Text>
                </View>
              </View>

              <View style={styles.ruleBadge}>
                <Text style={styles.ruleBadgeText} numberOfLines={1}>
                  {rule503020.needsPct <= 55 && rule503020.savingsPct >= 15 ? t('budget_balanced') : t('budget_needs_review')}
                </Text>
              </View>
            </View>

            {/* Tripartite Segmented Bar */}
            <View style={styles.ruleBarTrack}>
              <View style={[styles.ruleBarSegment, { flex: Math.max(rule503020.needsPct, 2), backgroundColor: '#3B82F6' }]} />
              <View style={[styles.ruleBarSegment, { flex: Math.max(rule503020.wantsPct, 2), backgroundColor: '#F59E0B' }]} />
              <View style={[styles.ruleBarSegment, { flex: Math.max(rule503020.savingsPct, 2), backgroundColor: '#10B981' }]} />
            </View>

            {/* 3 Pillars */}
            <View style={styles.rulePillarsRow}>
              <View style={styles.rulePillarCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <View style={[styles.ruleDot, { backgroundColor: '#3B82F6' }]} />
                  <Text style={styles.rulePillarName} numberOfLines={1}>{t('needs_label')}</Text>
                </View>
                <Text style={styles.rulePillarValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {curr}{rule503020.needsAmt.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.rulePillarPct} numberOfLines={1}>{rule503020.needsPct}% of budget</Text>
              </View>

              <View style={styles.rulePillarCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <View style={[styles.ruleDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.rulePillarName} numberOfLines={1}>{t('wants_label')}</Text>
                </View>
                <Text style={styles.rulePillarValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {curr}{rule503020.wantsAmt.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.rulePillarPct} numberOfLines={1}>{rule503020.wantsPct}% of budget</Text>
              </View>

              <View style={styles.rulePillarCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <View style={[styles.ruleDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.rulePillarName} numberOfLines={1}>{t('savings_label')}</Text>
                </View>
                <Text style={styles.rulePillarValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {curr}{rule503020.savingsAmt.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.rulePillarPct} numberOfLines={1}>{rule503020.savingsPct}% saved</Text>
              </View>
            </View>
          </View>

          {/* SMART AI FINANCIAL HEALTH & ADVISOR CARD */}
          <View style={styles.aiHealthCard}>
            <View style={styles.aiHealthHeader}>
              <View style={styles.aiHealthTitleWrap}>
                <View style={[styles.aiSparkleIconWrap, { backgroundColor: financialHealth.color + '20' }]}>
                  <Ionicons name="sparkles" size={15} color={financialHealth.color} />
                </View>
                <View>
                  <Text style={styles.aiHealthTitle}>{t('financial_vitality')}</Text>
                  <Text style={styles.aiHealthSub}>{t('ai_analysis')}</Text>
                </View>
              </View>
              <View style={[styles.healthScoreBadge, { backgroundColor: financialHealth.color + '15', borderColor: financialHealth.color + '40' }]}>
                <Text style={[styles.healthScoreText, { color: financialHealth.color }]}>
                  {financialHealth.score}/100 • {financialHealth.rating}
                </Text>
              </View>
            </View>

            {/* Health Score Gauge Bar */}
            <View style={styles.healthScoreTrack}>
              <View style={[styles.healthScoreFill, { width: `${financialHealth.score}%`, backgroundColor: financialHealth.color }]} />
            </View>

            {/* Financial Vitality Tri-Metric KPIs */}
            <View style={styles.vitalityPillRow}>
              <View style={styles.vitalityItem}>
                <Text style={styles.vitalityItemLabel}>Savings Rate</Text>
                <Text style={[styles.vitalityItemVal, { color: metrics.savingsRate >= 20 ? '#10B981' : metrics.savingsRate >= 10 ? '#F59E0B' : '#EF4444' }]}>
                  {metrics.savingsRate}%
                </Text>
              </View>
              <View style={styles.vitalityDivider} />
              <View style={styles.vitalityItem}>
                <Text style={styles.vitalityItemLabel}>Burn Ratio</Text>
                <Text style={[styles.vitalityItemVal, { color: metrics.income > 0 && metrics.expense / metrics.income <= 0.75 ? '#10B981' : '#EF4444' }]}>
                  {metrics.income > 0 ? `${Math.round((metrics.expense / metrics.income) * 100)}%` : '100%'}
                </Text>
              </View>
              <View style={styles.vitalityDivider} />
              <View style={styles.vitalityItem}>
                <Text style={styles.vitalityItemLabel}>Needs Share</Text>
                <Text style={styles.vitalityItemVal}>
                  {rule503020.needsPct}%
                </Text>
              </View>
            </View>

            {/* Dynamic AI Insights Bullet Points */}
            <View style={styles.aiInsightsList}>
              {financialHealth.insights.map((insight, idx) => (
                <View key={idx} style={styles.aiInsightRow}>
                  <View style={styles.aiInsightBullet}>
                    <Ionicons name="checkmark-circle" size={14} color={financialHealth.color} />
                  </View>
                  <Text style={styles.aiInsightText}>{insight}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* CHART VIEW SWITCHER TABS */}
          <View style={styles.chartViewSwitcher}>
            <TouchableOpacity
              style={[styles.chartViewBtn, chartView === 'donut' && styles.chartViewBtnActive]}
              onPress={() => setChartView('donut')}
              activeOpacity={0.8}
            >
              <Ionicons name="pie-chart" size={13} color={chartView === 'donut' ? '#1C1C1E' : '#64748B'} style={{ marginRight: 4 }} />
              <Text style={[styles.chartViewText, chartView === 'donut' && styles.chartViewTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t('expense_breakdown')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.chartViewBtn, chartView === 'curve' && styles.chartViewBtnActive]}
              onPress={() => setChartView('curve')}
              activeOpacity={0.8}
            >
              <Ionicons name="analytics" size={13} color={chartView === 'curve' ? '#1C1C1E' : '#64748B'} style={{ marginRight: 4 }} />
              <Text style={[styles.chartViewText, chartView === 'curve' && styles.chartViewTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t('spending_wave')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.chartViewBtn, chartView === 'bars' && styles.chartViewBtnActive]}
              onPress={() => setChartView('bars')}
              activeOpacity={0.8}
            >
              <Ionicons name="bar-chart" size={13} color={chartView === 'bars' ? '#1C1C1E' : '#64748B'} style={{ marginRight: 4 }} />
              <Text style={[styles.chartViewText, chartView === 'bars' && styles.chartViewTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t('cash_flow_trends')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ACTIVE CHART DISPLAY */}
          {chartView === 'curve' && renderSmoothLineGraph()}
          {chartView === 'bars' && renderMonthlyBarChart()}
          {chartView === 'donut' && (
            <View style={styles.chartWrapperCard}>
              <View style={styles.categoryChartHeader}>
                <View>
                  <Text style={styles.themeCardTitle}>
                    {categoryType === 'expense' ? t('expense_breakdown') : t('income_breakdown')}
                  </Text>
                  <Text style={styles.themeCardSub}>
                    {selectedCategory ? `Viewing "${selectedCategory}" details` : 'Tap on any slice to inspect category share'}
                  </Text>
                </View>
                {selectedCategory && (
                  <TouchableOpacity
                    style={styles.resetCatBtn}
                    onPress={() => setSelectedCategory(null)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle" size={13} color="#64748B" style={{ marginRight: 3 }} />
                    <Text style={styles.resetCatText}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>

              {categoryBreakdown.length > 0 ? (
                renderCategoryDonut()
              ) : (
                <View style={styles.emptyCardBox}>
                  <Ionicons name="pie-chart-outline" size={36} color="#CBD5E1" />
                  <Text style={styles.emptyCardText}>No transactions recorded for this period</Text>
                </View>
              )}
            </View>
          )}

          {/* CATEGORY BREAKDOWN LIST WITH EXPENSE / INCOME TOGGLE */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderBetween}>
              <View>
                <Text style={styles.cardHeading}>{t('top_categories')}</Text>
                <Text style={styles.cardSub}>{t('by_category')}</Text>
              </View>

              {/* Expense vs Income Switcher Pills */}
              <View style={styles.catTypeToggleRow}>
                <TouchableOpacity
                  style={[styles.catTypeBtn, categoryType === 'expense' && styles.catTypeBtnActiveExpense]}
                  onPress={() => {
                    setCategoryType('expense');
                    setSelectedCategory(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.catTypeText, categoryType === 'expense' && styles.catTypeTextActiveExpense]}>
                    {t('type_expense')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.catTypeBtn, categoryType === 'income' && styles.catTypeBtnActiveIncome]}
                  onPress={() => {
                    setCategoryType('income');
                    setSelectedCategory(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.catTypeText, categoryType === 'income' && styles.catTypeTextActiveIncome]}>
                    {t('type_income')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {categoryBreakdown.length === 0 ? (
              <View style={styles.emptyCardBox}>
                <Ionicons name="receipt-outline" size={36} color="#CBD5E1" />
                <Text style={styles.emptyCardText}>No {categoryType} transactions in this period</Text>
              </View>
            ) : (
              <View style={styles.categoryListWrap}>
                {categoryBreakdown.map(cat => {
                  const isSel = selectedCategory === cat.name;
                  return (
                    <TouchableOpacity
                      key={cat.name}
                      style={[styles.categoryRow, isSel && styles.categoryRowSelected]}
                      onPress={() => {
                        setSelectedCategoryDetail(cat);
                        setSelectedCategory(isSel ? null : cat.name);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.categoryIconCircle, { backgroundColor: cat.color + '18' }]}>
                        <CategoryIcon categoryName={cat.name} iconName={cat.icon} color={cat.color} size={20} />
                      </View>
                      <View style={styles.categoryDetailsCol}>
                        <View style={styles.categoryTopRow}>
                          <Text style={[styles.categoryName, isSel && { fontWeight: '900', color: '#0F172A' }]} numberOfLines={1}>
                            {cat.name}
                          </Text>
                          <Text style={styles.categoryAmount}>{curr}{cat.amount.toLocaleString('en-IN')}</Text>
                        </View>
                        <View style={styles.progressBarTrack}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { width: `${Math.min(cat.percentage, 100)}%`, backgroundColor: cat.color },
                            ]}
                          />
                        </View>
                        <View style={styles.categoryBottomRow}>
                          <Text style={styles.categoryPercentText}>{cat.percentage}% of total {categoryType}</Text>
                          <Text style={styles.categoryTxnCount}>
                            {cat.count} txns • Avg {curr}{Math.round(cat.amount / Math.max(cat.count, 1)).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* PAYMENT MODES SPLIT */}
          {paymentModesSplit.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.cardHeading}>{t('payment_split')}</Text>
              <Text style={styles.cardSub}>{t('how_you_pay')}</Text>

              {/* Segmented Bar */}
              <View style={styles.paymentBarContainer}>
                {paymentModesSplit.map((pm, idx) => {
                  const colors = ['#1C1C1E', '#FFD740', '#10B981', '#6366F1'];
                  const c = colors[idx % colors.length];
                  return (
                    <View
                      key={pm.mode}
                      style={{
                        flex: pm.percentage || 1,
                        height: 12,
                        backgroundColor: c,
                        marginHorizontal: 1.5,
                        borderRadius: 4,
                      }}
                    />
                  );
                })}
              </View>

              <View style={styles.paymentPillsRow}>
                {paymentModesSplit.map((pm, idx) => {
                  const colors = ['#1C1C1E', '#FFD740', '#10B981', '#6366F1'];
                  const c = colors[idx % colors.length];
                  return (
                    <View key={pm.mode} style={styles.paymentPillBadge}>
                      <View style={[styles.paymentDot, { backgroundColor: c }]} />
                      <PaymentModeIcon mode={pm.mode} size={14} style={{ marginRight: 4 }} />
                      <Text style={styles.paymentModeLabel}>{pm.mode}: </Text>
                      <Text style={styles.paymentModeValue}>{pm.percentage}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* WEEKEND VS WEEKDAY SPENDING PATTERN */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderBetween}>
              <View>
                <Text style={styles.cardHeading}>{t('weekday_vs_weekend')}</Text>
                <Text style={styles.cardSub}>{t('day_pattern')}</Text>
              </View>
              <View style={[styles.weekendRatioPill, weekendVsWeekday.weekendPct >= 50 && styles.weekendRatioPillHeavy]}>
                <Text style={[styles.weekendRatioText, weekendVsWeekday.weekendPct >= 50 && styles.weekendRatioTextHeavy]}>
                  {weekendVsWeekday.weekendPct >= 50 ? 'Weekend Heavy 🏖️' : 'Weekday Heavy 💼'}
                </Text>
              </View>
            </View>

            <View style={styles.weekendVsWeekdayRow}>
              <View style={styles.weekSplitCard}>
                <View style={styles.weekSplitIconCircle}>
                  <Ionicons name="briefcase-outline" size={16} color="#2563EB" />
                </View>
                <Text style={styles.weekSplitLabel}>Weekdays (Mon–Fri)</Text>
                <Text style={styles.weekSplitAmount}>{curr}{weekendVsWeekday.weekdayTotal.toLocaleString('en-IN')}</Text>
                <Text style={styles.weekSplitSub}>
                  {weekendVsWeekday.weekdayPct}% • {weekendVsWeekday.weekdayCount} txns
                </Text>
              </View>

              <View style={styles.weekSplitCard}>
                <View style={[styles.weekSplitIconCircle, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="sparkles-outline" size={16} color="#D97706" />
                </View>
                <Text style={styles.weekSplitLabel}>Weekends (Sat–Sun)</Text>
                <Text style={styles.weekSplitAmount}>{curr}{weekendVsWeekday.weekendTotal.toLocaleString('en-IN')}</Text>
                <Text style={styles.weekSplitSub}>
                  {weekendVsWeekday.weekendPct}% • {weekendVsWeekday.weekendCount} txns
                </Text>
              </View>
            </View>
          </View>

          {/* DAY-OF-WEEK SPENDING WAVE */}
          <View style={styles.sectionCard}>
            <Text style={styles.cardHeading}>{t('day_pattern')}</Text>
            <Text style={styles.cardSub}>{t('peak_day')}</Text>

            <View style={styles.dayOfWeekRow}>
              {dayOfWeekSpend.map(d => (
                <View key={d.day} style={styles.dayCol}>
                  <View style={styles.dayBarTrack}>
                    <View
                      style={[
                        styles.dayBarFill,
                        { height: `${Math.max(d.percentOfMax, 8)}%` },
                        d.percentOfMax >= 80 && styles.dayBarFillHigh,
                      ]}
                    />
                  </View>
                  <Text style={[styles.dayNameText, d.percentOfMax >= 80 && { color: '#1C1C1E', fontWeight: '900' }]}>
                    {d.day}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* LARGEST EXPENSES */}
          {topExpenses.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.cardHeading}>{t('top_expenses_title')}</Text>
              <Text style={styles.cardSub}>{t('biggest_hits')}</Text>

              <View style={styles.topExpenseList}>
                {topExpenses.map((tx, idx) => (
                  <View key={tx.id || String(idx)} style={styles.topExpenseItem}>
                    <View style={styles.topExpenseRank}>
                      <Text style={styles.topExpenseRankText}>#{idx + 1}</Text>
                    </View>
                    <View style={styles.topExpenseDetails}>
                      <Text style={styles.topExpenseTitle} numberOfLines={1}>
                        {tx.title || tx.category}
                      </Text>
                      <Text style={styles.topExpenseDate}>
                        {tx.date} • {tx.category}
                      </Text>
                    </View>
                    <Text style={styles.topExpenseAmount}>
                      -{curr}{Math.abs(tx.amount).toLocaleString('en-IN')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 110 }} />
        </Animated.View>
      </ScrollView>

      {/* CATEGORY DRILL-DOWN MODAL */}
      <Modal
        visible={!!selectedCategoryDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCategoryDetail(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.categoryIconCircle, { backgroundColor: (selectedCategoryDetail?.color || '#3B82F6') + '20', marginRight: 10 }]}>
                  <CategoryIcon
                    categoryName={selectedCategoryDetail?.name || ''}
                    iconName={selectedCategoryDetail?.icon || 'receipt'}
                    color={selectedCategoryDetail?.color || '#3B82F6'}
                    size={22}
                  />
                </View>
                <View>
                  <Text style={styles.drillModalTitle}>{selectedCategoryDetail?.name} Breakdown</Text>
                  <Text style={styles.drillModalSubTitle}>{curr}{selectedCategoryDetail?.amount.toLocaleString('en-IN')} total • {selectedCategoryDetail?.count} txns</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedCategoryDetail(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380, marginTop: 10 }}>
              {filteredTransactions
                .filter(t => (t.category || '').toLowerCase() === (selectedCategoryDetail?.name || '').toLowerCase() && t.type === categoryType)
                .map((tx, idx) => (
                  <View key={tx.id || String(idx)} style={styles.drillDownItem}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.drillDownTitle} numberOfLines={1}>{tx.title || tx.category}</Text>
                      <Text style={styles.drillDownDate}>{tx.date} • {tx.payment_mode || 'UPI'}</Text>
                    </View>
                    <Text style={[styles.drillDownAmount, categoryType === 'income' ? styles.drillDownAmountIncome : styles.drillDownAmountExpense]}>
                      {categoryType === 'income' ? '+' : '-'}{curr}{Math.abs(tx.amount).toLocaleString('en-IN')}
                    </Text>
                  </View>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* EXPORT OPTIONS MODAL */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowExportModal(false)}
        >
          <View style={styles.exportModalContent}>
            <View style={styles.exportModalHeader}>
              <Ionicons name="share-social" size={22} color="#0F172A" style={{ marginRight: 8 }} />
              <Text style={styles.exportModalTitle}>Share & Export Report</Text>
            </View>
            <Text style={styles.exportModalSub}>
              Download your complete financial statement or share an executive summary.
            </Text>

            <TouchableOpacity
              style={styles.exportOptionRow}
              onPress={handleExportPDF}
              activeOpacity={0.7}
              disabled={isGeneratingPDF}
            >
              <View style={[styles.exportOptionIconCircle, { backgroundColor: '#FEE2E2' }]}>
                {isGeneratingPDF ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Ionicons name="document" size={20} color="#DC2626" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.exportOptionTitle}>Multi-Page PDF Statement</Text>
                  {!isPremium && appConfig?.showSubscriptions !== false && (
                    <View style={[styles.pdfLimitPill, pdfExportCount >= FREE_PDF_EXPORT_LIMIT && styles.pdfLimitPillMax]}>
                      <Text style={[styles.pdfLimitPillText, pdfExportCount >= FREE_PDF_EXPORT_LIMIT && styles.pdfLimitPillTextMax]}>
                        {pdfExportCount >= FREE_PDF_EXPORT_LIMIT ? 'Pro Only (3/3 Used)' : `${pdfExportCount}/${FREE_PDF_EXPORT_LIMIT} Free`}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.exportOptionSub}>Official 3-page HD statement with KPIs, charts & ledger</Text>
              </View>
              <Ionicons name="download-outline" size={18} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.exportOptionRow}
              onPress={handleExportCSV}
              activeOpacity={0.7}
            >
              <View style={[styles.exportOptionIconCircle, { backgroundColor: '#E0E7FF' }]}>
                <Ionicons name="document-text" size={20} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.exportOptionTitle}>Export CSV Spreadsheet</Text>
                <Text style={styles.exportOptionSub}>Excel & Google Sheets compatible ledger</Text>
              </View>
              <Ionicons name="download-outline" size={18} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.exportOptionRow}
              onPress={() => {
                setShowExportModal(false);
                handleShareReport();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.exportOptionIconCircle, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="chatbubbles" size={20} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.exportOptionTitle}>Share Executive Summary</Text>
                <Text style={styles.exportOptionSub}>Send formatted text report via WhatsApp, Email, etc.</Text>
              </View>
              <Ionicons name="paper-plane-outline" size={18} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.exportCancelBtn}
              onPress={() => setShowExportModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.exportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1C1C1E',
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  periodSegmentWrapper: {
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  periodScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  periodSegmentBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodSegmentBtnActive: {
    backgroundColor: '#1C1C1E',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  periodSegmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  periodSegmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // HERO NET SAVINGS CARD - ANIMATED PASTEL THEME
  heroOverviewCard: {
    borderRadius: 26,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: '#4338CA',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
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
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroNetLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  heroNetLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  heroSavingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  heroSavingsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroAmountWrap: {
    marginBottom: 14,
  },
  heroNetValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.8,
  },
  heroCashflowRow: {
    flexDirection: 'row',
    gap: 6,
  },
  heroCardHeaderMini: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  heroIncomeCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  heroIncomeIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroExpenseCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  heroExpenseIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDailyCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  heroDailyIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInnerCardLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    flex: 1,
  },
  heroIncomeAmount: {
    fontSize: 12,
    fontWeight: '900',
    color: '#16A34A',
  },
  heroExpenseAmount: {
    fontSize: 12,
    fontWeight: '900',
    color: '#DC2626',
  },
  heroDailyAmount: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },

  // CHART VIEW SWITCHER
  chartViewSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 3,
    marginBottom: 14,
  },
  chartViewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 11,
  },
  chartViewBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  chartViewText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  chartViewTextActive: {
    color: '#1C1C1E',
    fontWeight: '800',
  },

  // CHART CARDS
  chartWrapperCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  themeCardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1C1C1E',
    letterSpacing: -0.2,
  },
  themeCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  activePointPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF9E7',
    borderWidth: 1,
    borderColor: '#FFD740',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activePointPillDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  activePointPillAmount: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  barLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendDotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },

  // CASH FLOW TRENDS ENHANCEMENTS
  trendLiveBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  trendLiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
  trendSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  trendSummaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  trendSummaryDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E2E8F0',
  },
  trendSummaryLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  trendSummaryValue: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  trendInspectorCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  trendInspectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  trendInspectorIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendInspectorTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  trendNetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  trendNetBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  trendInspectorPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  trendInspectorPillIn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
  },
  trendInspectorPillOut: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
  },
  trendInspectorPillRate: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  trendInspectorPillLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  trendInspectorPillValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },

  // SPENDING WAVE ENHANCEMENTS
  waveLiveBadge: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  waveLiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#D97706',
    textTransform: 'uppercase',
  },
  wavePeakSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  wavePeakSummaryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#B45309',
  },
  waveSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  waveSummaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  waveSummaryDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E2E8F0',
  },
  waveSummaryLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  waveSummaryValue: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  waveInspectorCard: {
    backgroundColor: '#FFFDF7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  waveInspectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  waveInspectorIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveInspectorTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  waveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  waveBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  waveInspectorPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  waveInspectorPillItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
  },
  waveInspectorPillLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  waveInspectorPillValue: {
    fontSize: 12,
    fontWeight: '900',
  },

  // SMART AI FINANCIAL HEALTH CARD
  aiHealthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  aiHealthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiHealthTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiSparkleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiHealthTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  aiHealthSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  healthScoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  healthScoreText: {
    fontSize: 11,
    fontWeight: '900',
  },
  healthScoreTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  healthScoreFill: {
    height: '100%',
    borderRadius: 3,
  },
  vitalityPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  vitalityItem: {
    flex: 1,
    alignItems: 'center',
  },
  vitalityItemLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  vitalityItemVal: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  vitalityDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 6,
  },
  aiInsightsList: {
    gap: 8,
  },
  aiInsightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  aiInsightBullet: {
    marginTop: 2,
  },
  aiInsightText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    lineHeight: 17,
  },

  // SECTION CARDS
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1C1C1E',
    letterSpacing: -0.2,
  },
  cardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  categoryChartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resetCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  resetCatText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  catTypeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  catTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9,
  },
  catTypeBtnActiveExpense: {
    backgroundColor: '#DC2626',
  },
  catTypeBtnActiveIncome: {
    backgroundColor: '#16A34A',
  },
  catTypeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  catTypeTextActiveExpense: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  catTypeTextActiveIncome: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  categoryCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  emptyCardBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },

  // DONUT
  donutCardInner: {
    alignItems: 'center',
  },
  donutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    position: 'relative',
  },
  donutCenterContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
  },
  donutActiveCatIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  donutActiveCatName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 2,
    textAlign: 'center',
  },
  donutActiveCatAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  donutActiveCatPercent: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    marginTop: 1,
  },
  donutCenterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  donutCenterAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1C1C1E',
    marginTop: 1,
  },
  donutTapHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  donutChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  donutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  donutChipDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  donutChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },

  // CATEGORY LIST
  categoryListWrap: {
    gap: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 14,
  },
  categoryRowSelected: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryDetailsCol: {
    flex: 1,
  },
  categoryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  categoryBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  categoryPercentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryTxnCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },

  // PAYMENT BAR
  paymentBarContainer: {
    flexDirection: 'row',
    height: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  paymentPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paymentPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  paymentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  paymentModeLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  paymentModeValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1C1C1E',
  },

  // DAY OF WEEK
  dayOfWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 110,
    paddingTop: 10,
    paddingHorizontal: 6,
  },
  dayCol: {
    alignItems: 'center',
    flex: 1,
  },
  dayBarTrack: {
    width: 14,
    height: 75,
    backgroundColor: '#F1F5F9',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginBottom: 6,
  },
  dayBarFill: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 7,
  },
  dayBarFillHigh: {
    backgroundColor: '#FFD740',
  },
  dayNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },

  // TOP EXPENSES
  topExpenseList: {
    gap: 10,
  },
  topExpenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topExpenseRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  topExpenseRankText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
  },
  topExpenseDetails: {
    flex: 1,
    marginRight: 8,
  },
  topExpenseTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  topExpenseDate: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  topExpenseAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#EF4444',
  },

  // PDF, CSV & HEADER
  pdfExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  pdfExportBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#DC2626',
  },
  csvExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  csvExportBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },

  // VELOCITY CARD
  velocityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#64748B',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  velocityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 6,
  },
  velocityIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  velocityCardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  velocityCardSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  velocityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  velocityPillLower: {
    backgroundColor: '#DCFCE7',
  },
  velocityPillHigher: {
    backgroundColor: '#FEE2E2',
  },
  velocityPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  velocityTextLower: {
    color: '#16A34A',
  },
  velocityTextHigher: {
    color: '#DC2626',
  },
  velocityPillNeutral: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  velocityPillNeutralText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  velocityStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
  },
  velocityStatBox: {
    flex: 1,
  },
  velocityStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 12,
  },
  velocityStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  velocityStatValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  velocityStatHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  safeToSpendBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  safeToSpendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  safeToSpendIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  safeToSpendTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  safeToSpendSub: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 1,
    fontWeight: '500',
  },
  safeToSpendRight: {
    alignItems: 'flex-end',
  },
  safeToSpendValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#065F46',
  },
  safeToSpendPerDay: {
    fontSize: 10,
    fontWeight: '600',
    color: '#047857',
  },
  safeToSpendPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  safeToSpendPillSafe: {
    backgroundColor: '#DCFCE7',
  },
  safeToSpendPillWarning: {
    backgroundColor: '#FEE2E2',
  },
  safeToSpendPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  safeToSpendTextSafe: {
    color: '#16A34A',
  },
  safeToSpendTextWarning: {
    color: '#DC2626',
  },

  // 50/30/20 RULE
  ruleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#64748B',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  ruleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 6,
  },
  ruleIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ruleCardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  ruleCardSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  ruleBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  ruleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  ruleBarTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    marginBottom: 14,
    gap: 2,
  },
  ruleBarSegment: {
    height: '100%',
    borderRadius: 5,
  },
  rulePillarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rulePillarCol: {
    flex: 1,
  },
  ruleDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  rulePillarName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  rulePillarValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  rulePillarPct: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 1,
  },

  // WEEKEND VS WEEKDAY
  weekendRatioPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  weekendRatioPillHeavy: {
    backgroundColor: '#FEF3C7',
  },
  weekendRatioText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  weekendRatioTextHeavy: {
    color: '#D97706',
  },
  weekendVsWeekdayRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  weekSplitCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  weekSplitIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  weekSplitLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  weekSplitAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
    marginBottom: 2,
  },
  weekSplitSub: {
    fontSize: 10.5,
    color: '#94A3B8',
  },

  // DRILL DOWN & EXPORT MODALS
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContentLarge: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drillModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  drillModalSubTitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  drillDownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  drillDownTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  drillDownDate: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  drillDownAmount: {
    fontSize: 14.5,
    fontWeight: '900',
  },
  drillDownAmountExpense: {
    color: '#EF4444',
  },
  drillDownAmountIncome: {
    color: '#10B981',
  },

  // EXPORT MODAL CONTENT
  exportModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    marginHorizontal: 20,
    marginBottom: 40,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
  },
  exportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  exportModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  exportModalSub: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 16,
  },
  exportOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  exportOptionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  exportOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  exportOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  exportCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  exportCancelText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
  },
  pdfLimitPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pdfLimitPillMax: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  pdfLimitPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  pdfLimitPillTextMax: {
    color: '#DC2626',
  },
});
