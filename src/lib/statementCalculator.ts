import type { UdharEntry, FriendContact } from './udharStorage';

export interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  paymentMode?: string;
  note?: string;
}

export interface StatementParty {
  name: string;
  phone?: string;
  initials: string;
  isCurrentUser: boolean;
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
  interestPeriodLabel?: string;
  interestStartDateStr?: string;
  accruedInterest: number;
  daysElapsed?: number;
  
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
  } catch {}
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
  const principalAmount = Number(entry.amount) || 0;
  const entryDateStr = formatStatementDate(entry.date);

  // 4. Interest calculation
  const hasInterest = Boolean(entry.isInterest && entry.interestPercent && entry.interestPercent > 0);
  let accruedInterest = 0;
  let interestStartDateStr: string | undefined;
  let daysElapsed = 0;

  if (hasInterest && entry.interestPercent) {
    const rawStart = entry.interestStartDate || entry.date;
    interestStartDateStr = formatStatementDate(rawStart);

    const parts = (rawStart || '').split('-').map(Number);
    const startYear = parts[0] || asOfDate.getFullYear();
    const startMonth = (parts[1] || 1) - 1;
    const startDay = parts[2] || 1;
    const start = new Date(startYear, startMonth, startDay, 0, 0, 0, 0);

    const now = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate(), 23, 59, 59, 999);
    const diffTime = Math.max(0, now.getTime() - start.getTime());
    daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Simple interest per month: principal * (rate / 100) * (elapsed days / 30)
    const baseAmt = entry.baseAmount || principalAmount;
    const rawInterest = (baseAmt * (entry.interestPercent / 100) * daysElapsed) / 30;
    accruedInterest = Math.round(rawInterest * 100) / 100;
  }

  // 5. Partial payments / settlements received
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

  // 6. Net remaining balance due
  const netDueRaw = (principalAmount + accruedInterest) - totalPaymentsReceived;
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
    interestPercent: entry.interestPercent,
    interestPeriodLabel: entry.interestPeriod === 'yearly' ? '/yr' : '/mo',
    interestStartDateStr,
    accruedInterest,
    daysElapsed,
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
