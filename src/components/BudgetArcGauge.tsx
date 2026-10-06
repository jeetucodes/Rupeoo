import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

interface BudgetArcGaugeProps {
  spent: number;
  limit: number;
  currency?: string;
  monthName?: string;
  remainingDays?: number;
  onEditLimit?: () => void;
  style?: any;
  theme?: 'light' | 'dark';
  title?: string;
  limitLabel?: string;
}

export default function BudgetArcGauge({
  spent,
  limit,
  currency = '₹',
  monthName,
  remainingDays,
  onEditLimit,
  style,
  theme = 'light',
  title,
  limitLabel,
}: BudgetArcGaugeProps) {
  const isDark = theme === 'dark';
  const now = new Date();
  const currentMonth = monthName || now.toLocaleString('default', { month: 'long' });
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, now.getMonth() + 1, 0).getDate();
  const daysLeft = remainingDays !== undefined ? remainingDays : Math.max(1, daysInMonth - now.getDate() + 1);

  const remaining = Math.max(0, limit - spent);
  const isOverBudget = limit > 0 && spent > limit;
  const progress = limit > 0 ? Math.min(Math.max(spent / limit, 0), 1) : 0;

  // Arc calculations (180-degree semi-circle dome)
  const SVG_WIDTH = 260;
  const SVG_HEIGHT = 145;
  const cx = 130;
  const cy = 130;
  const r = 95;
  const strokeWidth = 18;
  const arcLength = Math.PI * r; // ~298.45

  // Start from left (cx - r, cy) to right (cx + r, cy) arching over the top
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const strokeDashoffset = arcLength * (1 - progress);

  const safePerDayAmount = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : 0;
  const formattedSafePerDay = safePerDayAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight, style]}>
      {/* Optional Card Header with Title & Edit button */}
      <View style={styles.cardHeader}>
        {title ? (
          <Text style={[styles.headerTitle, isDark ? styles.textLight : styles.textDark]}>
            {title}
          </Text>
        ) : (
          <View />
        )}
        {onEditLimit && (
          <TouchableOpacity
            style={[styles.editBtn, isDark ? styles.editBtnDark : styles.editBtnLight]}
            onPress={onEditLimit}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="pencil" size={15} color={isDark ? '#94A3B8' : '#64748B'} />
          </TouchableOpacity>
        )}
      </View>

      {/* SVG Arc Gauge */}
      <View style={styles.gaugeContainer}>
        <Svg width={SVG_WIDTH} height={SVG_HEIGHT} viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}>
          <Defs>
            {/* Vibrant Green-to-Electric-Lime Gradient */}
            <LinearGradient id="budgetGaugeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#10B981" />
              <Stop offset="55%" stopColor="#22C55E" />
              <Stop offset="100%" stopColor="#84CC16" />
            </LinearGradient>

            {/* Over Budget Crimson-to-Amber Gradient */}
            <LinearGradient id="budgetGaugeGradOver" x1="0%" y1="100%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#F59E0B" />
              <Stop offset="100%" stopColor="#EF4444" />
            </LinearGradient>
          </Defs>

          {/* Background Track Arc */}
          <Path
            d={arcPath}
            stroke={isDark ? 'rgba(255, 255, 255, 0.12)' : '#F1F5F9'}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
          />

          {/* Active Progress Arc */}
          {limit > 0 && progress > 0 && (
            <Path
              d={arcPath}
              stroke={isOverBudget ? 'url(#budgetGaugeGradOver)' : 'url(#budgetGaugeGrad)'}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={arcLength}
              strokeDashoffset={strokeDashoffset}
            />
          )}
        </Svg>

        {/* Center Text: REMAINING & Big Amount */}
        <View style={styles.centerContent} pointerEvents="none">
          <Text style={[styles.remainingLabel, isDark ? styles.subLabelDark : styles.subLabelLight]}>
            REMAINING
          </Text>
          <Text
            style={[styles.remainingAmount, isDark ? styles.textLight : styles.textDark]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {currency}
            {remaining.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
      </View>

      {/* Spent & Limit Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={[styles.statLabel, isDark ? styles.subLabelDark : styles.subLabelLight]}>
            Spent
          </Text>
          <Text
            style={[
              styles.statValue,
              isDark ? styles.textLight : styles.textDark,
              isOverBudget && { color: '#EF4444' },
            ]}
          >
            {currency}
            {spent.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>

        <View style={[styles.statCol, { alignItems: 'flex-end' }]}>
          <Text style={[styles.statLabel, isDark ? styles.subLabelDark : styles.subLabelLight]}>
            {limitLabel || 'Limit'}
          </Text>
          <Text style={[styles.statValue, isDark ? styles.textLight : styles.textDark]}>
            {currency}
            {limit.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
      </View>

      {/* Safe to Spend Bottom Strip */}
      <View style={[styles.safeSpendBanner, isDark ? styles.safeSpendDark : styles.safeSpendLight]}>
        <Text style={[styles.safeSpendText, isDark ? styles.safeSpendTextDark : styles.safeSpendTextLight]}>
          {isOverBudget ? (
            <Text style={{ color: '#EF4444', fontWeight: '800' }}>
              Over budget by {currency}{(spent - limit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>
          ) : limit === 0 ? (
            'Tap pencil to set budget limit.'
          ) : daysLeft === 0 ? (
            <Text style={{ color: '#10B981', fontWeight: '800' }}>
              Cycle completed • {currency}{remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })} under budget.
            </Text>
          ) : (
            <>
              Safe to spend:{' '}
              <Text style={isDark ? styles.safeSpendHighlightDark : styles.safeSpendHighlightLight}>
                {currency}{formattedSafePerDay}/day
              </Text>{' '}
              ({daysLeft} days left in cycle).
            </>
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    position: 'relative',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardDark: {
    backgroundColor: '#111827',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnLight: {
    backgroundColor: '#F1F5F9',
  },
  editBtnDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  textLight: {
    color: '#FFFFFF',
  },
  textDark: {
    color: '#0F172A',
  },
  subLabelLight: {
    color: '#64748B',
  },
  subLabelDark: {
    color: '#94A3B8',
  },
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 4,
    marginBottom: 6,
  },
  centerContent: {
    position: 'absolute',
    bottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: 170,
  },
  remainingLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  remainingAmount: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: 12,
  },
  statCol: {},
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  safeSpendBanner: {
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  safeSpendLight: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  safeSpendDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  safeSpendText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  safeSpendTextLight: {
    color: '#475569',
  },
  safeSpendTextDark: {
    color: '#94A3B8',
  },
  safeSpendHighlightLight: {
    color: '#16A34A',
    fontWeight: '800',
  },
  safeSpendHighlightDark: {
    color: '#CCFF00',
    fontWeight: '800',
  },
});
