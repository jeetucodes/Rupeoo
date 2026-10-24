import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import CategoryIcon from './CategoryIcon';
import PaymentModeIcon from './PaymentModeIcon';
import { useTranslation } from '@/lib/i18n';
import { formatPaymentModeDisplay } from '@/lib/dataMinimization';

// 3D Sugary Fluent Emojis for Calendar Elements
const ICONS_3D = {
  calendar: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Spiral%20Calendar.png',
  money_bag: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Money%20Bag.png',
  chart_up: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Chart%20Increasing.png',
  sparkles: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Sparkles.png',
  fire: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Fire.png',
  shield: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Shield.png',
  trophy: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Trophy.png',
  star: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Glowing%20Star.png',
};

export interface CalendarTxItem {
  id?: string;
  date: string; // YYYY-MM-DD or parseable date string
  amount: number;
  type: 'income' | 'expense';
  category: string;
  title?: string;
  merchant_name?: string;
  payee?: string;
  merchant?: string;
  description?: string;
  note?: string;
  userNote?: string;
  payment_mode?: string;
  paymentMode?: string;
  time?: string;
}

interface Props {
  transactions: CalendarTxItem[];
  currency?: string;
  onSelectTransactionDate?: (dateStr: string) => void;
  onMonthChange?: (year: number, month: number) => void;
  style?: object;
}

interface DayAggregate {
  dayNum: number;
  dateStr: string; // YYYY-MM-DD
  dayName: string;
  fullDateLabel: string;
  expense: number;
  income: number;
  txns: CalendarTxItem[];
  isFuture: boolean;
  isToday: boolean;
}

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_HI = [
  'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'
];

const WEEK_DAYS_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEK_DAYS_HI = ['सो', 'मं', 'बु', 'गु', 'शु', 'श', 'र'];

const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_HI = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];

export default function SpendingCalendarCard({
  transactions,
  currency = '₹',
  onSelectTransactionDate,
  onMonthChange,
  style,
}: Props) {
  const { t, lang } = useTranslation();
  const isHindi = lang === 'Hindi';
  const monthNames = isHindi ? MONTH_NAMES_HI : MONTH_NAMES_EN;
  const weekDays = isHindi ? WEEK_DAYS_HI : WEEK_DAYS_EN;
  const dayNames = isHindi ? DAY_NAMES_HI : DAY_NAMES_EN;
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, [today]);

  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(todayStr);
  const [viewMode, setViewMode] = useState<'calendar' | 'ranking'>('calendar');
  const [rankingFilter, setRankingFilter] = useState<'all' | 'highest' | 'lowest' | 'zero'>('all');

  // Month navigation
  const handlePrevMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const newMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    setCurrentYear(newYear);
    setCurrentMonth(newMonth);
    onMonthChange?.(newYear, newMonth);
    if (newYear === today.getFullYear() && newMonth === today.getMonth()) {
      setSelectedDateStr(todayStr);
    } else {
      setSelectedDateStr(null);
    }
  };

  const handleNextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const newMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    setCurrentYear(newYear);
    setCurrentMonth(newMonth);
    onMonthChange?.(newYear, newMonth);
    if (newYear === today.getFullYear() && newMonth === today.getMonth()) {
      setSelectedDateStr(todayStr);
    } else {
      setSelectedDateStr(null);
    }
  };

  const handleResetToCurrentMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDateStr(todayStr);
  };

  // Group transactions by date for the active month
  const {
    daysGrid,
    leadingEmptyDays,
    totalMonthExpense,
    totalMonthIncome,
    daysWithExpenseCount,
    highestSpendDay,
    lowestNonZeroDay,
    zeroSpendDaysList,
    rankedHighestDays,
    rankedLowestDays,
    dailyAvgSpend,
    peakSpendAmount,
  } = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    // Monday as day 0 in week: Sunday = 0 -> 6, Monday = 1 -> 0
    const firstDayOfWeek = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7;

    const dayMap: { [dayNum: number]: DayAggregate } = {};

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(currentYear, currentMonth, day);
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayName = dayNames[d.getDay()];

      dayMap[day] = {
        dayNum: day,
        dateStr,
        dayName,
        fullDateLabel: `${dayName}, ${day} ${monthNames[currentMonth].slice(0, 3)}`,
        expense: 0,
        income: 0,
        txns: [],
        isFuture: d > today,
        isToday: dateStr === todayStr,
      };
    }

    // Populate with transactions using fast string parsing (10x faster on low-end devices)
    transactions.forEach(tx => {
      if (!tx.date) return;
      let txYear: number;
      let txMonth: number;
      let day: number;

      if (typeof tx.date === 'string' && tx.date.length >= 10 && tx.date[4] === '-' && tx.date[7] === '-') {
        txYear = parseInt(tx.date.substring(0, 4), 10);
        txMonth = parseInt(tx.date.substring(5, 7), 10) - 1;
        day = parseInt(tx.date.substring(8, 10), 10);
      } else {
        const txDate = new Date(tx.date);
        if (isNaN(txDate.getTime())) return;
        txYear = txDate.getFullYear();
        txMonth = txDate.getMonth();
        day = txDate.getDate();
      }

      if (txYear === currentYear && txMonth === currentMonth) {
        if (dayMap[day]) {
          const amt = Math.abs(Number(tx.amount) || 0);
          if (tx.type === 'expense') {
            dayMap[day].expense += amt;
          } else {
            dayMap[day].income += amt;
          }
          dayMap[day].txns.push(tx);
        }
      }
    });

    const daysList = Object.values(dayMap);

    // Compute metrics
    let totalExp = 0;
    let totalInc = 0;
    let expDaysCount = 0;

    daysList.forEach(d => {
      totalExp += d.expense;
      totalInc += d.income;
      if (d.expense > 0) expDaysCount++;
    });

    // Past or current days only for zero spend computation
    const pastOrTodayDays = daysList.filter(d => !d.isFuture);
    const zeroDays = pastOrTodayDays.filter(d => d.expense === 0);

    // Highest and lowest spend days
    const daysWithExpense = daysList.filter(d => d.expense > 0);
    const sortedDesc = [...daysWithExpense].sort((a, b) => b.expense - a.expense);
    const sortedAsc = [...daysWithExpense].sort((a, b) => a.expense - b.expense);

    const highestDay = sortedDesc.length > 0 ? sortedDesc[0] : null;
    const lowestDay = sortedAsc.length > 0 ? sortedAsc[0] : null;

    const avgSpend = expDaysCount > 0 ? Math.round(totalExp / expDaysCount) : 0;
    const peakAmt = highestDay ? highestDay.expense : 1;

    return {
      daysGrid: daysList,
      leadingEmptyDays: firstDayOfWeek,
      totalMonthExpense: totalExp,
      totalMonthIncome: totalInc,
      daysWithExpenseCount: expDaysCount,
      highestSpendDay: highestDay,
      lowestNonZeroDay: lowestDay,
      zeroSpendDaysList: zeroDays,
      rankedHighestDays: sortedDesc.slice(0, 5),
      rankedLowestDays: sortedAsc.slice(0, 5),
      dailyAvgSpend: avgSpend,
      peakSpendAmount: peakAmt,
    };
  }, [currentYear, currentMonth, transactions, today, todayStr, dayNames, monthNames]);

  // Selected Day Details (defaults to Today)
  const activeDay = useMemo(() => {
    if (selectedDateStr) {
      const match = daysGrid.find(d => d.dateStr === selectedDateStr);
      if (match) return match;
    }
    const todayMatch = daysGrid.find(d => d.isToday);
    if (todayMatch) return todayMatch;
    return highestSpendDay || daysGrid[0] || null;
  }, [selectedDateStr, daysGrid, highestSpendDay]);

  const isCurrentMonthView = currentYear === today.getFullYear() && currentMonth === today.getMonth();

  const handleSelectDay = (dateStr: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDateStr(dateStr);
    if (viewMode !== 'calendar') {
      setViewMode('calendar');
    }
  };

  return (
    <View style={[styles.cardContainer, style]}>
      {/* 1. HEADER ROW WITH VIEW SWITCHER */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.headerIconBadge}>
            <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.calendar }} style={{ width: 26, height: 26 }} contentFit="contain" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit>
              {t('spending_calendar')}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {t('calendar_sub')}
            </Text>
          </View>
        </View>

        {/* View Toggle Tabs (Calendar vs High/Low) */}
        <View style={styles.viewToggleWrap}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'calendar' && styles.viewToggleBtnActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setViewMode('calendar');
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="calendar-outline"
              size={12}
              color={viewMode === 'calendar' ? '#FFFFFF' : '#64748B'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.viewToggleText, viewMode === 'calendar' && styles.viewToggleTextActive]}>
              {t('calendar_view')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'ranking' && styles.viewToggleBtnActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setViewMode('ranking');
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="swap-vertical"
              size={12}
              color={viewMode === 'ranking' ? '#FFFFFF' : '#64748B'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.viewToggleText, viewMode === 'ranking' && styles.viewToggleTextActive]}>
              {t('high_low')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. MINIMALIST MONTH NAVIGATION BAR (< April 2026 >) */}
      <View style={styles.monthNavRow}>
        <TouchableOpacity style={styles.monthNavArrow} onPress={handlePrevMonth} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={18} color="#0F172A" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.monthTitleWrap} onPress={handleResetToCurrentMonth} activeOpacity={0.8}>
          <Text style={styles.monthNavTitle}>
            {monthNames[currentMonth]} {currentYear}
          </Text>
          {!isCurrentMonthView && (
            <View style={styles.todaySmallPill}>
              <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.sparkles }} style={{ width: 11, height: 11, marginRight: 3 }} contentFit="contain" />
              <Text style={styles.todaySmallPillText}>{t('current_month')}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.monthNavArrow} onPress={handleNextMonth} activeOpacity={0.6}>
          <Ionicons name="chevron-forward" size={18} color="#0F172A" />
        </TouchableOpacity>
      </View>

      {/* 3. EXECUTIVE MONTH SPEND SNAPSHOT PILL (Clean & compact with 3D Sugary Icons) */}
      <View style={styles.monthSnapshotCard}>
        <View style={styles.monthSnapshotLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.money_bag }} style={{ width: 15, height: 15, marginRight: 4 }} contentFit="contain" />
            <Text style={styles.monthSnapshotLabel}>{t('total_spent_cap')}</Text>
          </View>
          <Text style={styles.monthSnapshotAmount}>
            {currency}{totalMonthExpense.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.monthSnapshotSub}>
            {daysWithExpenseCount} {t('spend_days_in')} {monthNames[currentMonth].slice(0, 3)}
          </Text>
        </View>

        <View style={styles.monthSnapshotDivider} />

        <View style={styles.monthSnapshotRight}>
          <View style={styles.monthSnapshotMetricItem}>
            <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.chart_up }} style={{ width: 15, height: 15, marginRight: 5 }} contentFit="contain" />
            <Text style={styles.monthSnapshotMetricText}>
              Avg <Text style={{ fontWeight: '800', color: '#0F172A' }}>{currency}{dailyAvgSpend.toLocaleString('en-IN')}</Text>/day
            </Text>
          </View>

          <View style={[styles.monthSnapshotMetricItem, { marginTop: 6 }]}>
            <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.shield }} style={{ width: 15, height: 15, marginRight: 5 }} contentFit="contain" />
            <Text style={styles.monthSnapshotMetricText}>
              <Text style={{ fontWeight: '800', color: '#059669' }}>{zeroSpendDaysList.length} {t('zero_spend')}</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* 4. CALENDAR VIEW */}
      {viewMode === 'calendar' ? (
        <View style={styles.calendarContainer}>
          {/* Framed Calendar Box with Crisp Border */}
          <View style={styles.calendarGridBox}>
            {/* Weekday Header: M  T  W  T  F  S  S */}
            <View style={styles.weekDaysRow}>
              {weekDays.map((w, idx) => (
                <Text
                  key={`${w}-${idx}`}
                  style={[
                    styles.weekDayHeader,
                    (idx === 5 || idx === 6) && styles.weekDayHeaderWeekend,
                  ]}
                >
                  {w}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGridWrap}>
              {/* Leading empty slots */}
              {Array.from({ length: leadingEmptyDays }).map((_, i) => (
                <View key={`empty-${i}`} style={styles.emptyDayCell} />
              ))}

              {/* Days of Month */}
              {daysGrid.map(d => {
                const isSelected = activeDay?.dateStr === d.dateStr;
                const hasSpend = d.expense > 0;
                const isPeak = highestSpendDay && d.dateStr === highestSpendDay.dateStr && hasSpend;

                return (
                  <View key={d.dateStr} style={styles.dayCellContainer}>
                    <TouchableOpacity
                      style={[
                        styles.dayCellPill,
                        d.isFuture && styles.dayCellPillFuture,
                        isSelected && styles.dayCellPillSelected,
                        d.isToday && !isSelected && styles.dayCellPillToday,
                      ]}
                      onPress={() => {
                        if (!d.isFuture) {
                          handleSelectDay(d.dateStr);
                        }
                      }}
                      activeOpacity={d.isFuture ? 1 : 0.7}
                      disabled={d.isFuture}
                    >
                    <Text
                      style={[
                        styles.dayCellNumber,
                        isSelected && styles.dayCellNumberSelected,
                        d.isToday && !isSelected && styles.dayCellNumberToday,
                        d.isFuture && styles.dayCellNumberFuture,
                      ]}
                    >
                      {d.dayNum}
                    </Text>

                    {/* Spend Indicator Dot */}
                    {hasSpend && (
                      <View
                        style={[
                          styles.dayActivityDot,
                          isPeak && styles.dayActivityDotPeak,
                          isSelected && styles.dayActivityDotSelected,
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        {/* 5. INTERACTIVE DAY DETAIL INSPECTOR */}
          {activeDay && (
            <View style={styles.dayInspectorCard}>
              <View style={styles.dayInspectorHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.dayInspectorDate}>
                      {activeDay.dayName}, {activeDay.dayNum} {monthNames[currentMonth]}
                    </Text>
                    {activeDay.isToday && (
                      <View style={styles.inspectorTodayBadge}>
                        <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.sparkles }} style={{ width: 12, height: 12, marginRight: 3 }} contentFit="contain" />
                        <Text style={styles.inspectorTodayBadgeText}>{t('today')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.dayInspectorSub}>
                    {activeDay.txns.length === 1 ? t('one_txn_recorded') : t('txns_recorded').replace('{count}', String(activeDay.txns.length))}
                  </Text>
                </View>

                {/* Day Total Amount Pill */}
                <View style={[styles.dayTotalPill, activeDay.expense > 0 ? styles.dayTotalPillExpense : styles.dayTotalPillZero]}>
                  <Text style={[styles.dayTotalPillText, activeDay.expense > 0 ? styles.dayTotalTextExpense : styles.dayTotalTextZero]}>
                    {activeDay.expense > 0 ? `-${currency}${activeDay.expense.toLocaleString('en-IN')}` : t('zero_spent_sparkle')}
                  </Text>
                </View>
              </View>

              {/* Day Transactions List */}
              {activeDay.txns.length > 0 ? (
                <View style={styles.dayTxnList}>
                  {activeDay.txns.map((tx, idx) => {
                    const isIncome = tx.type === 'income';
                    const amt = Math.abs(Number(tx.amount) || 0);

                    return (
                      <View key={tx.id || `txn-${idx}`} style={styles.dayTxnItem}>
                        <View style={[styles.dayTxnIcon, { backgroundColor: isIncome ? '#F0FDF4' : '#F8FAFC' }]}>
                          <CategoryIcon categoryName={tx.category} iconName={isIncome ? 'wallet' : 'receipt'} size={18} />
                        </View>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.dayTxnTitle} numberOfLines={1}>
                            {tx.title || tx.merchant_name || tx.payee || tx.merchant || tx.category || 'Transaction'}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <PaymentModeIcon mode={tx.payment_mode || tx.paymentMode || 'unknown'} size={11} />
                            <Text style={styles.dayTxnMeta}>
                              {tx.category} • {formatPaymentModeDisplay(tx.payment_mode || tx.paymentMode)}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.dayTxnAmount, { color: isIncome ? '#10B981' : '#0F172A' }]}>
                          {isIncome ? '+' : '-'}{currency}{amt.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.dayEmptyBox}>
                  <View style={styles.dayEmptyIconWrap}>
                    <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.trophy }} style={{ width: 24, height: 24 }} contentFit="contain" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayEmptyTitle}>{t('zero_outflow_day')}</Text>
                    <Text style={styles.dayEmptySub}>{t('zero_outflow_desc')}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* 6. BOTTOM EXECUTIVE HIGH/LOW/ZERO METRIC TILES */}
          <View style={styles.summaryMicroRow}>
            {/* Peak Spend Day */}
            <TouchableOpacity
              style={[styles.summaryPillBox, styles.summaryPillBoxPeak]}
              onPress={() => {
                if (highestSpendDay) {
                  handleSelectDay(highestSpendDay.dateStr);
                }
              }}
              activeOpacity={0.8}
            >
              <View style={styles.summaryPillHeader}>
                <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.fire }} style={{ width: 14, height: 14, marginRight: 4 }} contentFit="contain" />
                <Text style={[styles.summaryPillLabel, { color: '#FF5722' }]}>{t('peak_day_cap')}</Text>
              </View>
              <Text style={styles.summaryPillValue} numberOfLines={1}>
                {highestSpendDay ? `${currency}${highestSpendDay.expense.toLocaleString('en-IN')}` : '—'}
              </Text>
              <Text style={styles.summaryPillSub} numberOfLines={1}>
                {highestSpendDay ? highestSpendDay.fullDateLabel : t('no_spends')}
              </Text>
            </TouchableOpacity>

            {/* Lowest Spend Day */}
            <TouchableOpacity
              style={[styles.summaryPillBox, styles.summaryPillBoxLow]}
              onPress={() => {
                if (lowestNonZeroDay) {
                  handleSelectDay(lowestNonZeroDay.dateStr);
                }
              }}
              activeOpacity={0.8}
            >
              <View style={styles.summaryPillHeader}>
                <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.star }} style={{ width: 14, height: 14, marginRight: 4 }} contentFit="contain" />
                <Text style={[styles.summaryPillLabel, { color: '#059669' }]}>{t('lowest_cap')}</Text>
              </View>
              <Text style={styles.summaryPillValue} numberOfLines={1}>
                {lowestNonZeroDay ? `${currency}${lowestNonZeroDay.expense.toLocaleString('en-IN')}` : '—'}
              </Text>
              <Text style={styles.summaryPillSub} numberOfLines={1}>
                {lowestNonZeroDay ? lowestNonZeroDay.fullDateLabel : t('no_spends')}
              </Text>
            </TouchableOpacity>

            {/* Zero-Spend Days */}
            <TouchableOpacity
              style={styles.summaryPillBox}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setViewMode('ranking');
                setRankingFilter('zero');
              }}
              activeOpacity={0.8}
            >
              <View style={styles.summaryPillHeader}>
                <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.shield }} style={{ width: 14, height: 14, marginRight: 4 }} contentFit="contain" />
                <Text style={[styles.summaryPillLabel, { color: '#7C3AED' }]}>{t('zero_spend')}</Text>
              </View>
              <Text style={styles.summaryPillValue} numberOfLines={1}>
                {zeroSpendDaysList.length} {t('zero_spend_days')}
              </Text>
              <Text style={styles.summaryPillSub} numberOfLines={1}>
                {t('view_all_arrow')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* 7. HIGH / LOW EXECUTIVE RANKING VIEW */
        <View style={styles.rankingContainer}>
          {/* Top Comparison KPI Grid: 2 Balanced Comparison Cards + 1 Zero Spend Banner */}
          <View style={styles.rankingKpiGrid}>
            <View style={styles.rankingKpiRow}>
              {/* Highest Spend Card */}
              <TouchableOpacity
                style={[
                  styles.rankingKpiCard,
                  { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' },
                  rankingFilter === 'highest' && { borderColor: '#EA580C', borderWidth: 2 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRankingFilter(rankingFilter === 'highest' ? 'all' : 'highest');
                }}
                activeOpacity={0.75}
              >
                <View style={styles.rankingKpiHeaderRow}>
                  <View style={styles.rankingKpiIconWrap}>
                    <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.fire }} style={{ width: 18, height: 18 }} contentFit="contain" />
                  </View>
                  <Text style={[styles.rankingKpiLabel, { color: '#C2410C' }]} numberOfLines={1}>
                    {t('highest_spend')}
                  </Text>
                </View>
                <Text style={styles.rankingKpiValue} numberOfLines={1}>
                  {highestSpendDay ? `${currency}${highestSpendDay.expense.toLocaleString('en-IN')}` : '—'}
                </Text>
                <Text style={styles.rankingKpiSub} numberOfLines={1}>
                  {highestSpendDay ? highestSpendDay.fullDateLabel : t('no_spends')}
                </Text>
              </TouchableOpacity>

              {/* Lowest Spend Card */}
              <TouchableOpacity
                style={[
                  styles.rankingKpiCard,
                  { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
                  rankingFilter === 'lowest' && { borderColor: '#16A34A', borderWidth: 2 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRankingFilter(rankingFilter === 'lowest' ? 'all' : 'lowest');
                }}
                activeOpacity={0.75}
              >
                <View style={styles.rankingKpiHeaderRow}>
                  <View style={styles.rankingKpiIconWrap}>
                    <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.star }} style={{ width: 18, height: 18 }} contentFit="contain" />
                  </View>
                  <Text style={[styles.rankingKpiLabel, { color: '#15803D' }]} numberOfLines={1}>
                    {t('lowest_spend')}
                  </Text>
                </View>
                <Text style={styles.rankingKpiValue} numberOfLines={1}>
                  {lowestNonZeroDay ? `${currency}${lowestNonZeroDay.expense.toLocaleString('en-IN')}` : '—'}
                </Text>
                <Text style={styles.rankingKpiSub} numberOfLines={1}>
                  {lowestNonZeroDay ? lowestNonZeroDay.fullDateLabel : t('no_spends')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Zero-Spend Days Banner */}
            <TouchableOpacity
              style={[
                styles.rankingZeroBanner,
                rankingFilter === 'zero' && { borderColor: '#6366F1', borderWidth: 2, backgroundColor: '#EEF2FF' },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRankingFilter(rankingFilter === 'zero' ? 'all' : 'zero');
              }}
              activeOpacity={0.75}
            >
              <View style={styles.rankingZeroLeft}>
                <View style={styles.rankingZeroIconWrap}>
                  <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.shield }} style={{ width: 18, height: 18 }} contentFit="contain" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankingZeroTitle} numberOfLines={1}>{t('zero_spend_days')}</Text>
                  <Text style={styles.rankingZeroSub} numberOfLines={1}>{t('frugal_days')}</Text>
                </View>
              </View>
              <View style={styles.rankingZeroBadge}>
                <Text style={styles.rankingZeroBadgeText}>
                  {zeroSpendDaysList.length} {zeroSpendDaysList.length === 1 ? 'Day' : 'Days'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Sub-Filters: [All] [Highest] [Lowest] [Zero Spends] */}
          <View style={styles.filterPillsRow}>
            <TouchableOpacity
              style={[styles.filterPill, rankingFilter === 'all' && styles.filterPillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRankingFilter('all');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterPillText, rankingFilter === 'all' && styles.filterPillTextActive]}>
                {t('all_insights')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, rankingFilter === 'highest' && styles.filterPillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRankingFilter('highest');
              }}
              activeOpacity={0.7}
            >
              <ExpoImage cachePolicy="memory-disk"
                source={{ uri: ICONS_3D.fire }}
                style={{ width: 13, height: 13, marginRight: 4 }}
                contentFit="contain"
              />
              <Text style={[styles.filterPillText, rankingFilter === 'highest' && styles.filterPillTextActive]}>
                {t('highest_spends_filter')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, rankingFilter === 'lowest' && styles.filterPillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRankingFilter('lowest');
              }}
              activeOpacity={0.7}
            >
              <ExpoImage cachePolicy="memory-disk"
                source={{ uri: ICONS_3D.star }}
                style={{ width: 13, height: 13, marginRight: 4 }}
                contentFit="contain"
              />
              <Text style={[styles.filterPillText, rankingFilter === 'lowest' && styles.filterPillTextActive]}>
                {t('lowest_spends_filter')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, rankingFilter === 'zero' && styles.filterPillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRankingFilter('zero');
              }}
              activeOpacity={0.7}
            >
              <ExpoImage cachePolicy="memory-disk"
                source={{ uri: ICONS_3D.shield }}
                style={{ width: 13, height: 13, marginRight: 4 }}
                contentFit="contain"
              />
              <Text style={[styles.filterPillText, rankingFilter === 'zero' && styles.filterPillTextActive]}>
                {t('zero_days_filter')} ({zeroSpendDaysList.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* 1. TOP HIGHEST SPEND DAYS */}
          {(rankingFilter === 'all' || rankingFilter === 'highest') && (
            <View style={styles.rankingSection}>
              <View style={styles.rankingHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.rankSectionBadge, { backgroundColor: '#FEE2E2' }]}>
                    <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.fire }} style={{ width: 16, height: 16 }} contentFit="contain" />
                  </View>
                  <Text style={styles.rankingSectionTitle}>{t('highest_spends_filter')}</Text>
                </View>
                <Text style={styles.rankingSectionHint}>{t('top_peak_outflows')}</Text>
              </View>

              {rankedHighestDays.length > 0 ? (
                <View style={styles.rankingList}>
                  {rankedHighestDays.map((d, idx) => {
                    const relativePct = Math.min(Math.max(Math.round((d.expense / peakSpendAmount) * 100), 12), 100);
                    const isRankOne = idx === 0;

                    return (
                      <TouchableOpacity
                        key={d.dateStr}
                        style={[styles.rankItemCard, isRankOne && styles.rankItemCardPeak]}
                        onPress={() => handleSelectDay(d.dateStr)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.rankBadge, isRankOne ? styles.rankBadgeGold : styles.rankBadgeNormal]}>
                          <Text style={[styles.rankBadgeText, isRankOne && { color: '#B45309' }]}>
                            #{idx + 1}
                          </Text>
                        </View>

                        <View style={{ flex: 1, marginRight: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.rankItemDate}>
                              {d.dayName}, {d.dayNum} {monthNames[currentMonth]}
                            </Text>
                            {isRankOne && (
                              <View style={styles.peakTag}>
                                <Text style={styles.peakTagText}>{t('highest_spend')}</Text>
                              </View>
                            )}
                          </View>

                          {/* Relative Spend Bar */}
                          <View style={styles.relativeBarTrack}>
                            <View style={[styles.relativeBarFill, { width: `${relativePct}%`, backgroundColor: isRankOne ? '#EA580C' : '#F97316' }]} />
                          </View>

                          <Text style={styles.rankItemMeta}>
                            {d.txns.length} txn{d.txns.length === 1 ? '' : 's'} • {d.txns[0]?.category || 'General'}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.rankItemAmountHigh}>
                            -{currency}{d.expense.toLocaleString('en-IN')}
                          </Text>
                          <Text style={styles.rankItemTapHint}>{t('tap_to_view')}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyRankBox}>
                  <Text style={styles.emptyRankText}>{t('no_month_expenses')}</Text>
                </View>
              )}
            </View>
          )}

          {/* 2. TOP LOWEST SPEND DAYS */}
          {(rankingFilter === 'all' || rankingFilter === 'lowest') && (
            <View style={[styles.rankingSection, { marginTop: 16 }]}>
              <View style={styles.rankingHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.rankSectionBadge, { backgroundColor: '#DCFCE7' }]}>
                    <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.star }} style={{ width: 16, height: 16 }} contentFit="contain" />
                  </View>
                  <Text style={styles.rankingSectionTitle}>{t('lowest_spends_filter')}</Text>
                </View>
                <Text style={styles.rankingSectionHint}>{t('top_frugal_days')}</Text>
              </View>

              {rankedLowestDays.length > 0 ? (
                <View style={styles.rankingList}>
                  {rankedLowestDays.map((d, idx) => (
                    <TouchableOpacity
                      key={d.dateStr}
                      style={styles.rankItemCard}
                      onPress={() => handleSelectDay(d.dateStr)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.rankBadge, styles.rankBadgeLow]}>
                        <Text style={[styles.rankBadgeText, { color: '#059669' }]}>
                          #{idx + 1}
                        </Text>
                      </View>

                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.rankItemDate}>
                          {d.dayName}, {d.dayNum} {monthNames[currentMonth]}
                        </Text>
                        <Text style={styles.rankItemMeta}>
                          {d.txns.length} txn{d.txns.length === 1 ? '' : 's'} • {t('minimal_outflow')}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.rankItemAmountLow}>
                          -{currency}{d.expense.toLocaleString('en-IN')}
                        </Text>
                        <Text style={styles.rankItemTapHint}>{t('tap_to_view')}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyRankBox}>
                  <Text style={styles.emptyRankText}>{t('no_spending_recorded')}</Text>
                </View>
              )}
            </View>
          )}

          {/* 3. ZERO SPEND DAYS DISCIPLINE BOARD */}
          {(rankingFilter === 'all' || rankingFilter === 'zero') && (
            <View style={[styles.rankingSection, { marginTop: 16 }]}>
              <View style={styles.rankingHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.rankSectionBadge, { backgroundColor: '#F3E8FF' }]}>
                    <ExpoImage cachePolicy="memory-disk" source={{ uri: ICONS_3D.shield }} style={{ width: 16, height: 16 }} contentFit="contain" />
                  </View>
                  <Text style={styles.rankingSectionTitle}>{t('zero_spend_streak')}</Text>
                </View>
                <Text style={styles.rankingSectionHint}>{t('days_saved').replace('{count}', String(zeroSpendDaysList.length))}</Text>
              </View>

              <View style={styles.zeroDaysCard}>
                <Text style={styles.zeroDaysCardDesc}>
                  {t('zero_days_desc').replace('{count}', String(zeroSpendDaysList.length)).replace('{month}', monthNames[currentMonth])}
                </Text>

                {zeroSpendDaysList.length > 0 ? (
                  <View style={styles.zeroDaysChipWrap}>
                    {zeroSpendDaysList.map(d => (
                      <TouchableOpacity
                        key={d.dateStr}
                        style={styles.zeroDayChip}
                        onPress={() => handleSelectDay(d.dateStr)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                        <Text style={styles.zeroDayChipText}>
                          {d.dayNum} {monthNames[currentMonth].slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noZeroDaysText}>{t('every_day_spent')}</Text>
                )}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  headerContainer: {
    marginBottom: 12,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '600',
  },
  viewToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignSelf: 'flex-start',
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 11,
  },
  viewToggleBtnActive: {
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  viewToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.2,
  },
  viewToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // MINIMALIST MONTH NAVIGATION (< April 2026 >)
  monthNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  monthNavArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  monthTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthNavTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  todaySmallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  todaySmallPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.3,
  },

  // MONTH SPEND SNAPSHOT
  monthSnapshotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthSnapshotLeft: {
    flex: 1.1,
  },
  monthSnapshotLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  monthSnapshotAmount: {
    fontSize: 21,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  monthSnapshotSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  monthSnapshotDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 12,
  },
  monthSnapshotRight: {
    flex: 1,
    justifyContent: 'center',
  },
  monthSnapshotMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  microIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthSnapshotMetricText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },

  // CALENDAR
  calendarContainer: {},
  calendarGridBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  weekDayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  weekDayHeaderWeekend: {
    color: '#94A3B8',
  },
  daysGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyDayCell: {
    width: `${100 / 7}%`,
    height: 44,
  },
  dayCellContainer: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dayCellPill: {
    width: 38,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  dayCellPillSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  dayCellPillToday: {
    borderWidth: 1.5,
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  dayCellPillFuture: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  dayCellNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  dayCellNumberSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  dayCellNumberToday: {
    color: '#2563EB',
    fontWeight: '900',
  },
  dayCellNumberFuture: {
    color: '#CBD5E1',
    fontWeight: '500',
  },
  dayActivityDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#2563EB',
    marginTop: 2,
  },
  dayActivityDotPeak: {
    backgroundColor: '#EF4444',
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dayActivityDotSelected: {
    backgroundColor: '#FFFFFF',
  },

  // DAY INSPECTOR CARD
  dayInspectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginTop: 2,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  dayInspectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dayInspectorDate: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  inspectorTodayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  inspectorTodayBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.3,
  },
  dayInspectorSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '600',
  },
  dayTotalPill: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  dayTotalPillExpense: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  dayTotalPillZero: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  dayTotalPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  dayTotalTextExpense: {
    color: '#DC2626',
  },
  dayTotalTextZero: {
    color: '#059669',
  },
  dayTxnList: {
    gap: 8,
  },
  dayTxnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  dayTxnIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dayTxnTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  dayTxnMeta: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  dayTxnAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  dayEmptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dayEmptyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayEmptyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  dayEmptySub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },

  // SUMMARY MICRO STRIP
  summaryMicroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryPillBox: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  summaryPillBoxPeak: {
    backgroundColor: '#FFF7F7',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  summaryPillBoxLow: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  summaryPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  summaryPillLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryPillValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  summaryPillSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },

  // RANKING VIEW
  rankingContainer: {
    paddingTop: 2,
  },
  rankingKpiGrid: {
    marginBottom: 14,
    gap: 10,
  },
  rankingKpiRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  rankingKpiCard: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  rankingKpiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  rankingKpiIconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankingKpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rankingKpiValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  rankingKpiSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  // Full-width Zero Spend Banner
  rankingZeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  rankingZeroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  rankingZeroIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankingZeroTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  rankingZeroSub: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  rankingZeroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  rankingZeroBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#4338CA',
  },

  // FILTER PILLS
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  filterPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.2,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // RANKING SECTIONS
  rankingSection: {},
  rankingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rankSectionBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  rankingSectionHint: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  rankingList: {
    gap: 8,
  },
  rankItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rankItemCardPeak: {
    backgroundColor: '#FFF7F7',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#F8FAFC',
  },
  rankBadgeGold: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  rankBadgeLow: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  rankBadgeNormal: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F172A',
  },
  rankItemDate: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  peakTag: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  peakTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  relativeBarTrack: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    marginVertical: 4,
    overflow: 'hidden',
  },
  relativeBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  rankItemMeta: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  rankItemAmountHigh: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#EF4444',
  },
  rankItemAmountLow: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#10B981',
  },
  rankItemTapHint: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 2,
  },
  emptyRankBox: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyRankText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
  },

  // ZERO DAYS BOARD
  zeroDaysCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 14,
    borderWidth: 0,
  },
  zeroDaysCardDesc: {
    fontSize: 11.5,
    color: '#334155',
    marginBottom: 10,
    lineHeight: 16,
    fontWeight: '600',
  },
  zeroDaysChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  zeroDayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 0,
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  zeroDayChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  noZeroDaysText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
});
