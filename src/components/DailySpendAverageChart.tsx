import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  useWindowDimensions,
} from 'react-native';
import Svg, {
  Rect,
  Line,
  Text as SvgText,
  G,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  RawTransactionInput,
  useDailySpendData,
} from '@/hooks/useDailySpendData';
import {
  formatCompactNumberIndian,
  formatBarAccessibilityLabel,
  formatBarTooltipText,
} from '@/features/reports/dailySpendCore';

interface DailySpendAverageChartProps {
  transactions: RawTransactionInput[];
  currency?: string;
  style?: object;
  initialRange?: 7 | 14 | 30;
}

export default function DailySpendAverageChart({
  transactions,
  currency = '₹',
  style,
  initialRange = 7,
}: DailySpendAverageChartProps) {
  const { width: windowWidth } = useWindowDimensions();
  // Safe responsive chart width fitting card padding
  const chartWidth = Math.max(windowWidth - 76, 280);
  const chartHeight = 150;
  const paddingLeft = 36;
  const paddingRight = 14;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = 110;
  const baselineY = chartHeight - 24;

  const {
    rangeDays,
    setRangeDays,
    dailyPoints,
    summary,
    selectedPointIndex,
    setSelectedPointIndex,
    activePoint,
    yAxis,
    peakIndex,
  } = useDailySpendData(transactions, initialRange);

  // 200ms animation on range change or mount (Requirement 8)
  const animProgress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    animProgress.setValue(0);
    Animated.timing(animProgress, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [rangeDays]);

  const maxVal = Math.max(yAxis.maxTick, 1);
  const avgY = summary.avgDailySpend > 0
    ? baselineY - (summary.avgDailySpend / maxVal) * plotHeight
    : baselineY;

  // Bar slot math
  const count = dailyPoints.length;
  const slotWidth = plotWidth / Math.max(count, 1);
  // Bar width tailored to range
  const barWidth = rangeDays === 7
    ? Math.min(22, slotWidth * 0.52)
    : rangeDays === 14
      ? Math.min(12, slotWidth * 0.6)
      : Math.min(6, slotWidth * 0.65);

  const getSvgTouchProps = (handler: () => void) => {
    return Platform.OS === 'web'
      ? ({ onClick: handler, style: { cursor: 'pointer' } } as any)
      : { onPress: handler };
  };

  const handleBarPress = (index: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setSelectedPointIndex(selectedPointIndex === index ? null : index);
  };

  const isEmpty = summary.totalSpend === 0;

  return (
    <View style={[styles.card, style]}>
      {/* ── 1. HEADER ROW: Title & Subtitle (Own Row, 2 lines, no clipping) ──── */}
      <View style={styles.headerBlock}>
        <View style={styles.titleRow}>
          <View style={styles.titleIconBadge}>
            <Ionicons name="stats-chart" size={15} color="#4F46E5" />
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>
            Daily Spend & Average
          </Text>
        </View>
        <Text style={styles.cardSub} numberOfLines={2}>
          {activePoint
            ? `Inspecting ${activePoint.fullDateLabel} daily spend`
            : 'Daily spending & daily average benchmark'}
        </Text>
      </View>

      {/* ── 2. RANGE TOGGLE (Own Row Below, 44px min touch area) ─────────────── */}
      <View style={styles.rangeRow}>
        <View style={styles.segmentedControl}>
          {([7, 14, 30] as const).map(num => {
            const isSelected = rangeDays === num;
            return (
              <TouchableOpacity
                key={`range-${num}`}
                style={[styles.rangePillBtn, isSelected && styles.rangePillBtnActive]}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch {}
                  setRangeDays(num);
                }}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${num} day range`}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.rangePillText, isSelected && styles.rangePillTextActive]}>
                  {num}D
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── 3. LEGEND & ACTIONS ─────────────────────────────────────────────── */}
      <View style={styles.legendRow}>
        <View style={styles.legendGroup}>
          <View style={styles.legendItem}>
            <View style={[styles.legendBarSwatch, { backgroundColor: '#4F46E5' }]} />
            <Text style={styles.legendLabel}>Daily spend</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendDashedSwatch} />
            <Text style={[styles.legendLabel, { color: '#4F46E5', fontWeight: '700' }]}>
              Daily average
            </Text>
          </View>
        </View>

        {activePoint && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => setSelectedPointIndex(null)}
            activeOpacity={0.7}
          >
            <Ionicons name="close-circle" size={13} color="#64748B" style={{ marginRight: 3 }} />
            <Text style={styles.resetBtnText}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 4. SUMMARY ROW: 3 Stats ({N}-DAY TOTAL, DAILY AVERAGE, PEAK DAY) ─── */}
      <View style={styles.summaryRow}>
        {/* Total Spend */}
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>{rangeDays}-DAY TOTAL</Text>
          <Text style={[styles.summaryValue, { color: '#0F172A' }]} numberOfLines={1}>
            {formatCurrency(summary.totalSpend, { decimals: 0, currency })}
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        {/* Daily Average */}
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>DAILY AVERAGE</Text>
          <Text style={[styles.summaryValue, { color: '#4F46E5' }]} numberOfLines={1}>
            {formatCurrency(summary.avgDailySpend, { decimals: 0, currency })}
            <Text style={styles.summaryPerDay}>/d</Text>
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        {/* Peak Day */}
        <View style={styles.summaryCol}>
          <Text style={styles.summaryLabel}>PEAK DAY</Text>
          <Text style={[styles.summaryValue, { color: '#DC2626' }]} numberOfLines={1}>
            {summary.peakSpend > 0
              ? formatCurrency(summary.peakSpend, { decimals: 0, currency })
              : '-'}
          </Text>
          {summary.peakDayName ? (
            <Text style={styles.summarySubtext} numberOfLines={1}>
              {summary.peakDayName}, {summary.peakDayDate.split(' ')[0]}
            </Text>
          ) : null}
        </View>
      </View>

      {/* ── 5. ACTIVE INSPECTOR / TOOLTIP BANNER ───────────────────────────────── */}
      {activePoint && (
        <View style={styles.inspectorBanner}>
          <View style={styles.inspectorLeft}>
            <View
              style={[
                styles.inspectorDot,
                {
                  backgroundColor:
                    activePoint.amount === summary.peakSpend && summary.peakSpend > 0
                      ? '#DC2626'
                      : activePoint.amount > summary.avgDailySpend
                        ? '#F59E0B'
                        : activePoint.amount === 0
                          ? '#94A3B8'
                          : '#4F46E5',
                },
              ]}
            />
            <Text style={styles.inspectorDateText}>{activePoint.fullDateLabel}</Text>
          </View>
          <View style={styles.inspectorRight}>
            <Text style={styles.inspectorAmount}>
              {formatCurrency(activePoint.amount, { decimals: 0, currency })}
            </Text>
            {activePoint.amount > 0 && summary.avgDailySpend > 0 && (
              <Text
                style={[
                  styles.inspectorDiff,
                  {
                    color:
                      activePoint.amount >= summary.avgDailySpend ? '#DC2626' : '#16A34A',
                  },
                ]}
              >
                {activePoint.amount >= summary.avgDailySpend
                  ? `+${formatCurrency(activePoint.amount - summary.avgDailySpend, { decimals: 0, currency })}`
                  : `-${formatCurrency(summary.avgDailySpend - activePoint.amount, { decimals: 0, currency })}`}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* ── 6. SVG BAR CHART ─────────────────────────────────────────────────── */}
      <View style={styles.chartContainer}>
        <Svg width={chartWidth} height={chartHeight} style={{ alignSelf: 'center' }}>
          <Defs>
            <SvgLinearGradient id="themeBarGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#6366F1" />
              <Stop offset="1" stopColor="#4F46E5" />
            </SvgLinearGradient>
            <SvgLinearGradient id="peakBarGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#EF4444" />
              <Stop offset="1" stopColor="#DC2626" />
            </SvgLinearGradient>
            <SvgLinearGradient id="todayBarGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#312E81" />
              <Stop offset="1" stopColor="#1E1B4B" />
            </SvgLinearGradient>
          </Defs>

          {/* Y Axis Gridlines and Ticks */}
          {yAxis.ticks.map(tickVal => {
            const y = baselineY - (tickVal / maxVal) * plotHeight;
            const isBase = tickVal === 0;
            return (
              <G key={`tick-${tickVal}`}>
                {/* Horizontal gridline */}
                <Line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke={isBase ? '#E2E8F0' : '#F1F5F9'}
                  strokeWidth={isBase ? 1.2 : 1}
                  strokeDasharray={isBase ? undefined : '4 4'}
                />
                {/* Y Axis Label */}
                <SvgText
                  x={paddingLeft - 6}
                  y={y + 3.5}
                  fontSize="8.5"
                  fontWeight="600"
                  fill="#94A3B8"
                  textAnchor="end"
                >
                  {formatCompactNumberIndian(tickVal)}
                </SvgText>
              </G>
            );
          })}

          {/* Average Line Across FULL Width */}
          {summary.avgDailySpend > 0 && (
            <G>
              <Line
                x1={paddingLeft}
                y1={avgY}
                x2={chartWidth - paddingRight}
                y2={avgY}
                stroke="#6366F1"
                strokeWidth="1.6"
                strokeDasharray="4 3"
              />
              {/* Average Pill Chip at Right End (placed above line without covering bars) */}
              {(() => {
                const avgText = `Avg ${formatCurrency(summary.avgDailySpend, { decimals: 0, currency })}`;
                const chipW = Math.max(60, avgText.length * 6.5);
                const chipH = 17;
                const chipX = chartWidth - paddingRight - chipW;
                const chipY = avgY < 22 ? avgY + 4 : avgY - chipH - 3;

                return (
                  <G>
                    <Rect
                      x={chipX}
                      y={chipY}
                      width={chipW}
                      height={chipH}
                      rx={8}
                      fill="#EEF2FF"
                      stroke="#C7D2FE"
                      strokeWidth="1"
                    />
                    <SvgText
                      x={chipX + chipW / 2}
                      y={chipY + 11.5}
                      fontSize="8.5"
                      fontWeight="800"
                      fill="#4338CA"
                      textAnchor="middle"
                    >
                      {avgText}
                    </SvgText>
                  </G>
                );
              })()}
            </G>
          )}

          {/* Bars, Baseline Stubs, Tooltip Markers & Touch Targets */}
          {dailyPoints.map((p, idx) => {
            const centerX = paddingLeft + (idx + 0.5) * slotWidth;
            const barX = centerX - barWidth / 2;
            const isZero = p.amount === 0;
            const isPeak = idx === peakIndex && summary.peakSpend > 0;
            const isToday = p.isToday;
            const isSelected = selectedPointIndex === idx;

            // Height calculation: zero spend shows 3px baseline stub, never dipping below zero
            const rawBarH = isZero ? 3 : Math.max(4, (p.amount / maxVal) * plotHeight);
            const barH = rawBarH;
            const barY = baselineY - barH;

            // X-Axis Label display logic:
            // 7D: all days
            // 14D: even indices + last day
            // 30D: every 5th day + last day
            const showXLabel =
              rangeDays === 7 ||
              (rangeDays === 14 && (idx % 2 === 0 || idx === count - 1)) ||
              (rangeDays === 30 && (idx % 5 === 0 || idx === count - 1)) ||
              isSelected;

            const accessLabel = formatBarAccessibilityLabel(p, 'rupees');

            return (
              <G
                key={`bar-group-${p.dateStr}`}
                accessibilityLabel={accessLabel}
                accessibilityRole="button"
              >
                {/* Full-Height Column Touch Strip */}
                <Rect
                  x={centerX - slotWidth / 2}
                  y={0}
                  width={slotWidth}
                  height={chartHeight}
                  fill="transparent"
                  {...getSvgTouchProps(() => handleBarPress(idx))}
                />

                {/* Selection column glow */}
                {isSelected && (
                  <Rect
                    x={centerX - slotWidth / 2 + 1}
                    y={6}
                    width={slotWidth - 2}
                    height={baselineY - 6}
                    rx={4}
                    fill="#4F46E5"
                    opacity={0.06}
                  />
                )}

                {/* Main Bar */}
                <Rect
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barH}
                  rx={Math.min(barWidth / 2, 4)}
                  fill={
                    isZero
                      ? '#E2E8F0'
                      : isPeak
                        ? 'url(#peakBarGrad)'
                        : isToday
                          ? 'url(#todayBarGrad)'
                          : 'url(#themeBarGrad)'
                  }
                  stroke={isSelected ? '#F59E0B' : isToday ? '#4338CA' : 'none'}
                  strokeWidth={isSelected ? 1.5 : isToday ? 1 : 0}
                  {...getSvgTouchProps(() => handleBarPress(idx))}
                />

                {/* Peak Marker Badge above Peak Bar (when not inspecting another bar) */}
                {isPeak && !selectedPointIndex && (
                  <G>
                    {(() => {
                      const markerText = formatBarTooltipText(
                        p,
                        formatCurrency(p.amount, { decimals: 0, currency }),
                        true
                      );
                      const markerW = Math.max(76, markerText.length * 5.8);
                      const markerH = 16;
                      // Clamp marker horizontally inside chart bounds
                      const markerX = Math.min(
                        Math.max(paddingLeft, centerX - markerW / 2),
                        chartWidth - paddingRight - markerW
                      );
                      const markerY = Math.max(4, barY - markerH - 4);

                      return (
                        <G>
                          <Rect
                            x={markerX}
                            y={markerY}
                            width={markerW}
                            height={markerH}
                            rx={8}
                            fill="#FEE2E2"
                            stroke="#FCA5A5"
                            strokeWidth="1"
                          />
                          <SvgText
                            x={markerX + markerW / 2}
                            y={markerY + 11}
                            fontSize="8"
                            fontWeight="800"
                            fill="#B91C1C"
                            textAnchor="middle"
                          >
                            {markerText}
                          </SvgText>
                        </G>
                      );
                    })()}
                  </G>
                )}

                {/* Selected Marker Badge above Selected Bar */}
                {isSelected && (
                  <G>
                    {(() => {
                      const selText = formatCurrency(p.amount, { decimals: 0, currency });
                      const selW = Math.max(48, selText.length * 6.5);
                      const selH = 16;
                      const selX = Math.min(
                        Math.max(paddingLeft, centerX - selW / 2),
                        chartWidth - paddingRight - selW
                      );
                      const selY = Math.max(4, barY - selH - 4);

                      return (
                        <G>
                          <Rect
                            x={selX}
                            y={selY}
                            width={selW}
                            height={selH}
                            rx={8}
                            fill="#FEF3C7"
                            stroke="#FCD34D"
                            strokeWidth="1"
                          />
                          <SvgText
                            x={selX + selW / 2}
                            y={selY + 11}
                            fontSize="8"
                            fontWeight="800"
                            fill="#92400E"
                            textAnchor="middle"
                          >
                            {selText}
                          </SvgText>
                        </G>
                      );
                    })()}
                  </G>
                )}

                {/* X Axis Day Label */}
                {showXLabel && (
                  <G>
                    <SvgText
                      x={centerX}
                      y={chartHeight - 11}
                      fontSize={rangeDays === 30 ? '7.5' : '8.5'}
                      fontWeight={isToday || isSelected ? '800' : '600'}
                      fill={isSelected ? '#0F172A' : isToday ? '#4F46E5' : '#64748B'}
                      textAnchor="middle"
                      {...getSvgTouchProps(() => handleBarPress(idx))}
                    >
                      {rangeDays === 30 ? p.dayNum : p.dayName}
                    </SvgText>
                    {rangeDays !== 30 && (
                      <SvgText
                        x={centerX}
                        y={chartHeight - 1}
                        fontSize="7"
                        fontWeight={isToday || isSelected ? '700' : '500'}
                        fill={isSelected ? '#4F46E5' : '#94A3B8'}
                        textAnchor="middle"
                        {...getSvgTouchProps(() => handleBarPress(idx))}
                      >
                        {p.dayNum}
                      </SvgText>
                    )}
                  </G>
                )}
              </G>
            );
          })}
        </Svg>
      </View>

      {/* ── 7. TINY CAPTION UNDER CHART (Requirement 4) ─────────────────────── */}
      <Text style={styles.formulaCaption}>
        Average = total / {rangeDays} days
      </Text>

      {/* ── 8. FRIENDLY EMPTY STATE (Requirement 8) ─────────────────────────── */}
      {isEmpty && (
        <View style={styles.emptyStateBanner}>
          <Ionicons name="information-circle-outline" size={15} color="#6366F1" style={{ marginRight: 5 }} />
          <Text style={styles.emptyStateText}>
            No spending in this period. Add expenses to view daily benchmark!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerBlock: {
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  titleIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    letterSpacing: -0.2,
  },
  cardSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    paddingLeft: 34,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
    marginTop: 2,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  rangePillBtn: {
    minHeight: 44, // Requirement 9: 44px min touch target
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rangePillBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  rangePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  rangePillTextActive: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    marginBottom: 12,
  },
  legendGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendBarSwatch: {
    width: 10,
    height: 8,
    borderRadius: 2,
  },
  legendDashedSwatch: {
    width: 14,
    height: 0,
    borderTopWidth: 2,
    borderTopColor: '#6366F1',
    borderStyle: 'dashed',
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  resetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  summaryLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  summaryPerDay: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6366F1',
  },
  summarySubtext: {
    fontSize: 8.5,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 1,
  },
  inspectorBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  inspectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inspectorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  inspectorDateText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#312E81',
  },
  inspectorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inspectorAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  inspectorDiff: {
    fontSize: 11,
    fontWeight: '700',
  },
  chartContainer: {
    width: '100%',
    alignItems: 'center',
  },
  formulaCaption: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 5,
    fontWeight: '500',
  },
  emptyStateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyStateText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
});
