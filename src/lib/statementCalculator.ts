import type { UdharEntry, FriendContact, InterestPeriod, InterestCalcType } from './udharStorage';

export interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  paymentMode?: string;
  note?: string;
}

/**
 * Pure interest calculation utility
 */
export function calculateAccruedInterest(
  baseAmount: number,
  ratePercent: number,
  period: InterestPeriod,
  startDateStr: string,
  calcType: InterestCalcType = 'pro_rata',
  asOfDate: Date = new Date()
): {
  daysElapsed: number;
  monthsElapsed: number;
  yearsElapsed: number;
  accruedAmount: number;
  dailyRate: number;
  periodAmount: number;
} {
  if (!baseAmount || baseAmount <= 0 || !ratePercent || ratePercent <= 0) {
    return { daysElapsed: 0, monthsElapsed: 0, yearsElapsed: 0, accruedAmount: 0, dailyRate: 0, periodAmount: 0 };
  }

  const parts = (startDateStr || '').split('-').map(Number);
  const startYear = parts[0] || asOfDate.getFullYear();
  const startMonth = (parts[1] || 1) - 1;
  const startDay = parts[2] || 1;
  const start = new Date(startYear, startMonth, startDay, 0, 0, 0, 0);

  const now = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate(), 23, 59, 59, 999);
  const diffTime = Math.max(0, now.getTime() - start.getTime());
  const daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const monthsElapsed = Number((daysElapsed / 30.4375).toFixed(1));
  const yearsElapsed = Number((daysElapsed / 365.25).toFixed(2));

  let accruedAmount = 0;
  let periodAmount = 0;
  let dailyRate = 0;

  if (period === 'monthly') {
    periodAmount = Math.round((baseAmount * ratePercent) / 100);
    dailyRate = periodAmount / 30;
    if (calcType === 'cycle') {
      const cycleCount = Math.max(1, Math.floor(daysElapsed / 30) + 1);
      accruedAmount = cycleCount * periodAmount;
    } else {
      accruedAmount = Math.round((baseAmount * (ratePercent / 100) * Math.max(0, daysElapsed)) / 30);
    }
  } else if (period === 'yearly') {
    periodAmount = Math.round((baseAmount * ratePercent) / 100);
    dailyRate = periodAmount / 365;
    if (calcType === 'cycle') {
      const cycleCount = Math.max(1, Math.floor(daysElapsed / 365) + 1);
      accruedAmount = cycleCount * periodAmount;
    } else {
      accruedAmount = Math.round((baseAmount * (ratePercent / 100) * Math.max(0, daysElapsed)) / 365);
    }
  } else {
    // one_time
    accruedAmount = Math.round((baseAmount * ratePercent) / 100);
    periodAmount = accruedAmount;
  }

  return {
    daysElapsed,
    monthsElapsed,
    yearsElapsed,
    accruedAmount,
    dailyRate: Number(dailyRate.toFixed(2)),
    periodAmount,
  };
}

export interface StatementParty {
  name: string;
  phone?: string;
  initials: string;
  isCurrentUser: boolean;
}

export interface StatementInterestRecord {
  id: string;
  title: string;
  ratePercent: number;
  period: InterestPeriod;
  periodLabel: string;
  baseAmount: number;
  accruedAmount: number;
  daysElapsed: number;
  startDateStr: string;
  calcType: InterestCalcType;
  formulaStr: string;
}

export interface StatementCalculationResult {
  statementId: string;
  generatedDateStr: string;
  generatedTimestampStr: string;
  
  lender: StatementParty;
  borrower: StatementParty;
  isUserLender: boolean;
  directionTitle: string; // 'Money Lent' | 'Money Borrowed'
  
  principalAmount: number;
  entryDateStr: string;
  
  hasInterest: boolean;
  interestPercent?: number;
  interestPeriod?: InterestPeriod;
  interestPeriodLabel?: string;
  interestStartDateStr?: string;
  interestBaseAmount?: number;
  accruedInterest: number;
  daysElapsed?: number;
  interestFormulaStr?: string;
  interestRecords: StatementInterestRecord[];
  
  totalWithInterest: number;
  
  hasPayments: boolean;
  paymentsReceived: PaymentRecord[];
  totalPaymentsReceived: number;
  
  netDue: number;
  remainingDue: number;
  isSettled: boolean;
  settledDateStr?: string;
  overpaidAmount: number;
  statusText: string;
  
  shouldShowPaymentSection: boolean;
  upiId?: string;
  upiUri?: string;
}

export interface StatementCalcOptions {
  entry: UdharEntry;
  friend: FriendContact;
  currentUserName: string;
  currentUserPhone?: string;
  currentUserUpiId?: string;
  childSettlements?: UdharEntry[];
  asOfDate?: Date;
  hideMyPhone?: boolean;
}

export function getInitials(name?: string): string {
  if (!name) return 'RU';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatIndianCurrency(amount: number): string {
  const isNegative = amount < 0;
  const absAmt = Math.abs(amount);
  
  // If whole number, don't show decimals
  const hasDecimals = absAmt % 1 !== 0;
  const formatted = absAmt.toLocaleString('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  
  return `${isNegative ? '-' : ''}₹${formatted}`;
}

export function formatStatementDate(rawDate?: string | Date): string {
  if (!rawDate) {
    const d = new Date();
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (rawDate instanceof Date) {
    return rawDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  // Check if string is already like "08 Oct 2026"
  if (/^\d{2}\s[A-Za-z]{3}\s\d{4}$/.test(rawDate)) {
    return rawDate;
  }
  try {
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
    const dt = new Date(rawDate);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {
    // Intentional: fall back to String(rawDate) if date parsing fails
  }
  return String(rawDate);
}

/**
 * Builds the standard UPI deep link for payment
 */
export function buildUpiPayUri(params: {
  upiId: string;
  payeeName: string;
  amount: number;
  statementId: string;
}): string {
  const { upiId, payeeName, amount, statementId } = params;
  const cleanUpi = upiId.trim();
  const cleanName = payeeName.trim();
  const amtFormatted = amount.toFixed(2);
  const note = `Rupeo Khata ${statementId}`;
  
  return `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(cleanName)}&am=${amtFormatted}&cu=INR&tn=${encodeURIComponent(note)}`;
}

/**
 * Core calculation function for a single Udhar entry statement
 */
export function calculateStatementDetails(options: StatementCalcOptions): StatementCalculationResult {
  const {
    entry,
    friend,
    currentUserName,
    currentUserPhone,
    currentUserUpiId,
    childSettlements = [],
    asOfDate = new Date(),
    hideMyPhone = true,
  } = options;

  // 1. Statement ID (last 5 chars of entry id uppercase or pad)
  const rawId = (entry.id || 'STMT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const shortId = `#${rawId.slice(-5).padStart(5, '0')}`;

  const generatedDateStr = formatStatementDate(asOfDate);
  const generatedTimestampStr = `${generatedDateStr}, ${asOfDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

  // 2. Roles: 'gave' = User lent, Friend borrowed. 'got' = Friend lent, User borrowed.
  const isGave = entry.type === 'gave';
  const isUserLender = isGave;

  const userParty: StatementParty = {
    name: currentUserName || 'Rupeo User',
    phone: hideMyPhone ? undefined : currentUserPhone,
    initials: getInitials(currentUserName || 'Rupeo User'),
    isCurrentUser: true,
  };

  const friendParty: StatementParty = {
    name: friend.name || 'Friend',
    phone: friend.phone,
    initials: getInitials(friend.name || 'Friend'),
    isCurrentUser: false,
  };

  const lender = isUserLender ? userParty : friendParty;
  const borrower = isUserLender ? friendParty : userParty;
  const directionTitle = isUserLender ? 'Money Lent' : 'Money Borrowed';

  // 3. Principal amount & entry date
  const isDirectInterestEntry = Boolean(entry.isInterest || entry.settlementType === 'interest');
  const principalAmount = isDirectInterestEntry && entry.baseAmount
    ? Number(entry.baseAmount) || 0
    : Number(entry.amount) || 0;
  const entryDateStr = formatStatementDate(entry.date);

  // 4. Interest calculation
  // Check child settlements for interest entries (added via '% Interest' button)
  const interestChildren = childSettlements.filter(
    c => c.settlementType === 'interest' || c.isInterest === true
  );

  const entryHasInterest = Boolean(
    entry.isInterest || (entry.interestPercent && entry.interestPercent > 0)
  );

  const hasInterest = interestChildren.length > 0 || entryHasInterest;

  const records: StatementInterestRecord[] = [];
  let totalAccruedInterest = 0;
  let primaryInterestPercent: number | undefined = undefined;
  let primaryPeriod: InterestPeriod = 'monthly';
  let primaryPeriodLabel: string = '/mo';
  let primaryStartDateStr: string | undefined = undefined;
  let maxDaysElapsed = 0;
  let accumulatedBaseAmount = 0;

  // Compute accrued interest from child interest records
  interestChildren.forEach((child) => {
    const rate = child.interestPercent || 0;
    const period = child.interestPeriod || 'monthly';
    const periodLabel = period === 'yearly' ? '/yr' : period === 'one_time' ? ' Flat' : '/mo';
    const rawStart = child.interestStartDate || child.date || entry.date;
    const startStr = formatStatementDate(rawStart);
    const base = child.baseAmount || principalAmount;
    const calcType = child.interestCalcType || 'pro_rata';

    let accrued = 0;
    let days = 0;
    let formula = '';

    if (period === 'one_time') {
      accrued = Number(child.amount) || Math.round((base * rate) / 100);
      formula = `${formatIndianCurrency(base)} @ ${rate}% Flat = +${formatIndianCurrency(accrued)}`;
    } else if (rate > 0) {
      const calc = calculateAccruedInterest(
        base,
        rate,
        period,
        rawStart,
        calcType,
        asOfDate
      );
      accrued = Math.max(Number(child.amount) || 0, calc.accruedAmount);
      days = calc.daysElapsed;
      if (calcType === 'cycle') {
        const cycleDays = period === 'yearly' ? 365 : 30;
        const cycles = Math.max(1, Math.floor(days / cycleDays) + 1);
        formula = `${formatIndianCurrency(base)} × ${rate}%${periodLabel} (${cycles} cycle${cycles > 1 ? 's' : ''}) = +${formatIndianCurrency(accrued)}`;
      } else {
        formula = `${formatIndianCurrency(base)} × ${rate}%${periodLabel} (${days} days) = +${formatIndianCurrency(accrued)}`;
      }
    } else {
      accrued = Number(child.amount) || 0;
      formula = `+${formatIndianCurrency(accrued)}`;
    }

    totalAccruedInterest += accrued;
    accumulatedBaseAmount += base;
    if (days > maxDaysElapsed) maxDaysElapsed = days;

    if (primaryInterestPercent === undefined && rate > 0) {
      primaryInterestPercent = rate;
      primaryPeriod = period;
      primaryPeriodLabel = periodLabel;
      primaryStartDateStr = startStr;
    }

    records.push({
      id: child.id,
      title: child.note || `Interest (${rate}%${periodLabel})`,
      ratePercent: rate,
      period,
      periodLabel,
      baseAmount: base,
      accruedAmount: accrued,
      daysElapsed: days,
      startDateStr: startStr,
      calcType,
      formulaStr: formula,
    });
  });

  // Compute accrued interest if parent entry itself has interest directly
  if (entryHasInterest && interestChildren.length === 0) {
    const rate = entry.interestPercent || 0;
    const period = entry.interestPeriod || 'monthly';
    const periodLabel = period === 'yearly' ? '/yr' : period === 'one_time' ? ' Flat' : '/mo';
    const rawStart = entry.interestStartDate || entry.date;
    const startStr = formatStatementDate(rawStart);
    const base = entry.baseAmount || principalAmount;
    const calcType = entry.interestCalcType || 'pro_rata';

    let accrued = 0;
    let days = 0;
    let formula = '';

    if (period === 'one_time') {
      accrued = rate > 0 ? Math.round((base * rate) / 100) : (Number(entry.amount) || 0);
      formula = `${formatIndianCurrency(base)} @ ${rate}% Flat = +${formatIndianCurrency(accrued)}`;
    } else if (rate > 0) {
      const calc = calculateAccruedInterest(
        base,
        rate,
        period,
        rawStart,
        calcType,
        asOfDate
      );
      accrued = calc.accruedAmount;
      days = calc.daysElapsed;
      if (calcType === 'cycle') {
        const cycleDays = period === 'yearly' ? 365 : 30;
        const cycles = Math.max(1, Math.floor(days / cycleDays) + 1);
        formula = `${formatIndianCurrency(base)} × ${rate}%${periodLabel} (${cycles} cycle${cycles > 1 ? 's' : ''}) = +${formatIndianCurrency(accrued)}`;
      } else {
        formula = `${formatIndianCurrency(base)} × ${rate}%${periodLabel} (${days} days) = +${formatIndianCurrency(accrued)}`;
      }
    } else {
      accrued = Number(entry.amount) || 0;
      formula = `+${formatIndianCurrency(accrued)}`;
    }

    totalAccruedInterest += accrued;
    accumulatedBaseAmount += base;
    if (days > maxDaysElapsed) maxDaysElapsed = days;

    if (primaryInterestPercent === undefined && rate > 0) {
      primaryInterestPercent = rate;
      primaryPeriod = period;
      primaryPeriodLabel = periodLabel;
      primaryStartDateStr = startStr;
    }

    records.push({
      id: entry.id,
      title: entry.note || `Interest (${rate}%${periodLabel})`,
      ratePercent: rate,
      period,
      periodLabel,
      baseAmount: base,
      accruedAmount: accrued,
      daysElapsed: days,
      startDateStr: startStr,
      calcType,
      formulaStr: formula,
    });
  }

  const accruedInterest = Math.round(totalAccruedInterest * 100) / 100;
  const totalWithInterest = Math.round((principalAmount + accruedInterest) * 100) / 100;

  const interestBaseAmount = accumulatedBaseAmount > 0
    ? (records.length === 1 ? records[0].baseAmount : accumulatedBaseAmount)
    : (entry.baseAmount || principalAmount);

  let interestFormulaStr = '';
  if (records.length === 1) {
    interestFormulaStr = records[0].formulaStr;
  } else if (records.length > 1) {
    interestFormulaStr = records.map(r => r.formulaStr).join(' + ');
  } else if (hasInterest && primaryInterestPercent) {
    interestFormulaStr = `${formatIndianCurrency(interestBaseAmount)} × ${primaryInterestPercent}%${primaryPeriodLabel} = +${formatIndianCurrency(accruedInterest)}`;
  }

  // 5. Partial payments / settlements received (excluding interest charges)
  const paymentsReceived: PaymentRecord[] = childSettlements
    .filter(c => c.settlementType === 'partial' || c.settlementType === 'full' || (!c.isInterest && c.settlementType !== 'interest'))
    .map(c => ({
      id: c.id,
      date: formatStatementDate(c.date),
      amount: Number(c.amount) || 0,
      paymentMode: c.paymentMode || 'Cash',
      note: c.note,
    }));

  const totalPaymentsReceived = paymentsReceived.reduce((acc, p) => acc + p.amount, 0);
  const hasPayments = paymentsReceived.length > 0;

  // 6. Net remaining balance due (Principal + Accrued Interest - Payments)
  const netDueRaw = totalWithInterest - totalPaymentsReceived;
  const netDue = Math.round(netDueRaw * 100) / 100;
  const isSettled = netDue <= 0;
  const remainingDue = Math.max(0, netDue);
  const overpaidAmount = netDue < 0 ? Math.round(Math.abs(netDue) * 100) / 100 : 0;

  let settledDateStr: string | undefined;
  if (isSettled) {
    // If settlements exist, take the last settlement date, else statement date
    if (paymentsReceived.length > 0) {
      settledDateStr = paymentsReceived[paymentsReceived.length - 1].date;
    } else {
      settledDateStr = generatedDateStr;
    }
  }

  const statusText = isSettled
    ? 'Settled in Full'
    : hasPayments
      ? 'Partially Settled'
      : 'Active Unsettled Loan';

  // 7. Payment section & QR code
  // Only show if user is LENDER (money to be received), net due > 0, and lender has valid UPI ID
  const cleanUpi = (currentUserUpiId || '').trim();
  const shouldShowPaymentSection = Boolean(isUserLender && !isSettled && remainingDue > 0 && cleanUpi);

  let upiUri: string | undefined;
  if (shouldShowPaymentSection && cleanUpi) {
    upiUri = buildUpiPayUri({
      upiId: cleanUpi,
      payeeName: currentUserName || 'Rupeo User',
      amount: remainingDue,
      statementId: shortId,
    });
  }

  return {
    statementId: shortId,
    generatedDateStr,
    generatedTimestampStr,
    lender,
    borrower,
    isUserLender,
    directionTitle,
    principalAmount,
    entryDateStr,
    hasInterest,
    interestPercent: primaryInterestPercent ?? entry.interestPercent,
    interestPeriod: primaryPeriod ?? entry.interestPeriod,
    interestPeriodLabel: primaryPeriodLabel,
    interestStartDateStr: primaryStartDateStr || (entry.interestStartDate ? formatStatementDate(entry.interestStartDate) : undefined),
    interestBaseAmount,
    accruedInterest,
    daysElapsed: maxDaysElapsed,
    interestFormulaStr: interestFormulaStr || undefined,
    interestRecords: records,
    totalWithInterest,
    hasPayments,
    paymentsReceived,
    totalPaymentsReceived,
    netDue,
    remainingDue,
    isSettled,
    settledDateStr,
    overpaidAmount,
    statusText,
    shouldShowPaymentSection,
    upiId: cleanUpi || undefined,
    upiUri,
  };
}
