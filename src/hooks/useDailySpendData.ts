import { useState, useMemo } from 'react';
import { normalizeDate } from '@/lib/database';
import {
  DailySpendBarPoint,
  DailySpendSummary,
  generateRollingDateSlots,
  calculateDailySpendingSummary,
  calculateYAxisTicks,
} from '@/features/reports/dailySpendCore';

export interface RawTransactionInput {
  id?: string;
  date: string;
  amount: number | string;
  type: string;
  category?: string;
  title?: string;
  description?: string;
  payment_mode?: string;
}

export interface UseDailySpendDataReturn {
  rangeDays: 7 | 14 | 30;
  setRangeDays: (range: 7 | 14 | 30) => void;
  dailyPoints: DailySpendBarPoint[];
  summary: DailySpendSummary;
  selectedPointIndex: number | null;
  setSelectedPointIndex: (idx: number | null) => void;
  activePoint: DailySpendBarPoint | null;
  yAxis: { maxTick: number; ticks: number[] };
  peakIndex: number;
}

/**
 * Custom data hook for the Daily Spend & Average Bar Chart.
 * Handles Asia/Calcutta day boundaries, debits-only aggregation,
 * transfer/refund exclusion, dynamic range switching (7D / 14D / 30D),
 * and computes exact matching summary metrics.
 */
export function useDailySpendData(
  transactions: RawTransactionInput[] = [],
  initialRange: 7 | 14 | 30 = 7
): UseDailySpendDataReturn {
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(initialRange);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  // Generate rolling date slots ending today in local timezone
  const dailyPoints = useMemo<DailySpendBarPoint[]>(() => {
    const slots = generateRollingDateSlots(rangeDays);
    const dateMap = new Map<string, number>();

    slots.forEach((s, idx) => {
      dateMap.set(s.dateStr, idx);
    });

    if (Array.isArray(transactions)) {
      transactions.forEach(tx => {
        if (!tx || !tx.date) return;

        // Debits only: check type
        const typeStr = String(tx.type || '').toLowerCase();
        const isDebit = typeStr === 'expense' || typeStr === 'debit';
        if (!isDebit) return;

        // Exclude internal transfers and refunds
        const catStr = String(tx.category || '').toLowerCase();
        if (catStr === 'transfer' || catStr === 'refund') return;

        const normDate = normalizeDate(String(tx.date));
        const slotIdx = dateMap.get(normDate);

        if (slotIdx !== undefined) {
          const val = Math.abs(Number(tx.amount) || 0);
          slots[slotIdx].amount += val;
        }
      });
    }

    return slots;
  }, [transactions, rangeDays]);

  // Compute summary matching chart bars exactly
  const summary = useMemo<DailySpendSummary>(() => {
    return calculateDailySpendingSummary(dailyPoints, rangeDays);
  }, [dailyPoints, rangeDays]);

  // Y-axis ticks calculation
  const yAxis = useMemo(() => {
    const rawMax = Math.max(summary.peakSpend, summary.avgDailySpend * 1.25);
    return calculateYAxisTicks(rawMax);
  }, [summary.peakSpend, summary.avgDailySpend]);

  // Identify peak point index
  const peakIndex = useMemo(() => {
    if (summary.peakSpend <= 0) return -1;
    return dailyPoints.findIndex(p => p.amount === summary.peakSpend && p.amount > 0);
  }, [dailyPoints, summary.peakSpend]);

  const activePoint = selectedPointIndex !== null && dailyPoints[selectedPointIndex]
    ? dailyPoints[selectedPointIndex]
    : null;

  return {
    rangeDays,
    setRangeDays: (newRange) => {
      setRangeDays(newRange);
      setSelectedPointIndex(null);
    },
    dailyPoints,
    summary,
    selectedPointIndex,
    setSelectedPointIndex,
    activePoint,
    yAxis,
    peakIndex,
  };
}
