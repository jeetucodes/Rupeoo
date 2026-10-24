/**
 * Pure calculation and formatting utilities for Daily Spend & Average Chart.
 * Free of React Native / Expo UI bindings for seamless unit testing in Node.js.
 */

export interface DailySpendBarPoint {
  dateStr: string;        // YYYY-MM-DD
  dayNum: number;         // 1 - 31
  dayName: string;        // 'Thu'
  fullDayName: string;    // 'Thursday'
  monthShort: string;     // 'Oct'
  fullMonthName: string;  // 'October'
  label: string;          // '22 Oct'
  fullDateLabel: string;  // 'Thu, 22 Oct'
  amount: number;         // Debit spend amount
  isToday: boolean;
  isFuture: boolean;
}

export interface DailySpendSummary {
  totalSpend: number;
  avgDailySpend: number;
  peakSpend: number;
  peakDayLabel: string;
  peakDayName: string;
  peakDayDate: string;
  rangeDays: 7 | 14 | 30;
}

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Compact Indian Number Formatter
 * 0 -> "0"
 * 999 -> "999"
 * 1000 -> "1k"
 * 2500 -> "2.5k"
 * 125000 -> "1.25L"
 * 10000000 -> "1Cr"
 */
export function formatCompactNumberIndian(num: number): string {
  const n = Math.abs(Math.round(num));
  if (n === 0) return '0';
  if (n < 1000) return `${n}`;

  // Thousands (< 1 Lakh)
  if (n < 100000) {
    const k = n / 1000;
    const formatted = k % 1 === 0 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '');
    return `${formatted}k`;
  }

  // Lakhs (< 1 Crore)
  if (n < 10000000) {
    const l = n / 100000;
    // Keep up to 2 decimal places if needed (e.g. 1.25L, 1.2L, 2L)
    const formatted = l % 1 === 0 ? l.toFixed(0) : l.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
    return `${formatted}L`;
  }

  // Crores
  const cr = n / 10000000;
  const formatted = cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
  return `${formatted}Cr`;
}

/**
 * Calculates 3-4 nice evenly-spaced Y-axis ticks starting at 0.
 * Handles edge cases like maxVal === 0, small amounts, and large values.
 */
export function calculateYAxisTicks(rawMax: number): { maxTick: number; ticks: number[] } {
  if (rawMax <= 0 || !isFinite(rawMax)) {
    return {
      maxTick: 1000,
      ticks: [0, 500, 1000],
    };
  }

  // Choose a nice step based on magnitude
  const targetTicks = 3;
  const roughStep = rawMax / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  let niceMultiplier = 1;
  if (normalized <= 1.2) niceMultiplier = 1;
  else if (normalized <= 2.5) niceMultiplier = 2;
  else if (normalized <= 6) niceMultiplier = 5;
  else niceMultiplier = 10;

  const niceStep = niceMultiplier * magnitude;
  const maxTick = Math.ceil(rawMax / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let val = 0; val <= maxTick; val += niceStep) {
    ticks.push(val);
  }

  // Ensure at least 3 ticks
  if (ticks.length < 3) {
    return {
      maxTick,
      ticks: [0, Math.round(maxTick / 2), maxTick],
    };
  }

  return { maxTick, ticks };
}

/**
 * Computes summary metrics: Total spend, Average spend, and Peak day.
 * Average = total spend / number of days in selected range (7 / 14 / 30).
 */
export function calculateDailySpendingSummary(
  dailyPoints: DailySpendBarPoint[],
  rangeDays: 7 | 14 | 30
): DailySpendSummary {
  let totalSpend = 0;
  let peakSpend = 0;
  let peakDayLabel = '';
  let peakDayName = '';
  let peakDayDate = '';

  dailyPoints.forEach(p => {
    totalSpend += p.amount;
    if (p.amount > peakSpend) {
      peakSpend = p.amount;
      peakDayLabel = p.label;
      peakDayName = p.dayName;
      peakDayDate = p.label;
    }
  });

  // Average = total / N days in selected range
  const avgDailySpend = Math.round(totalSpend / rangeDays);

  return {
    totalSpend,
    avgDailySpend,
    peakSpend,
    peakDayLabel,
    peakDayName,
    peakDayDate,
    rangeDays,
  };
}

/**
 * Accessibility label for a single bar on the chart.
 * Example: "Thursday 22 October, 3,390 rupees"
 */
export function formatBarAccessibilityLabel(
  point: DailySpendBarPoint,
  currencyName: string = 'rupees'
): string {
  const amountStr = Math.round(point.amount).toLocaleString('en-IN');
  return `${point.fullDayName} ${point.dayNum} ${point.fullMonthName}, ${amountStr} ${currencyName}`;
}

/**
 * Formats tooltip marker text for peak or selected bar.
 * Example: "Peak ₹3,390, Thu 22" or "Thu, 22 Oct • ₹3,390"
 */
export function formatBarTooltipText(
  point: DailySpendBarPoint,
  formattedAmount: string,
  isPeak: boolean = false
): string {
  if (isPeak) {
    return `Peak ${formattedAmount}, ${point.dayName} ${point.dayNum}`;
  }
  return `${point.dayName}, ${point.dayNum} ${point.monthShort} • ${formattedAmount}`;
}

/**
 * Builds rolling date slots for the last N days (7, 14, or 30 days) ending today.
 */
export function generateRollingDateSlots(
  rangeDays: 7 | 14 | 30,
  referenceDate: Date = new Date()
): DailySpendBarPoint[] {
  const result: DailySpendBarPoint[] = [];
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDate = referenceDate.getDate();

  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(refYear, refMonth, refDate - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const dayOfWeek = d.getDay();
    const monthIndex = d.getMonth();
    const dayNum = d.getDate();

    result.push({
      dateStr,
      dayNum,
      dayName: DAY_NAMES_SHORT[dayOfWeek],
      fullDayName: DAY_NAMES_FULL[dayOfWeek],
      monthShort: MONTH_NAMES_SHORT[monthIndex],
      fullMonthName: MONTH_NAMES_FULL[monthIndex],
      label: `${dayNum} ${MONTH_NAMES_SHORT[monthIndex]}`,
      fullDateLabel: `${DAY_NAMES_SHORT[dayOfWeek]}, ${dayNum} ${MONTH_NAMES_SHORT[monthIndex]}`,
      amount: 0,
      isToday: i === 0,
      isFuture: false,
    });
  }

  return result;
}
