/**
 * Pure Function Bill Matching Engine
 *
 * Matches incoming parsed financial notifications against candidate bills.
 * Designed to be 100% deterministic, side-effect free, and unit-testable.
 */

export interface BillMatchTransactionInput {
  amount: number;
  type?: 'debit' | 'credit' | 'expense' | 'income' | string;
  merchant?: string | null;
  rawText?: string | null;
  note?: string | null;
  category?: string | null;
  date?: string | Date | number;
}

export interface MatchedBillCandidate {
  id?: string;
  title: string;
  amount: number;
  category: string;
  type?: 'monthly_date' | 'cycle_days' | string;
  frequency?: 'monthly' | 'quarterly' | 'yearly' | string;
  provider?: string | null;
  dueDay?: number | null;
  cycleDays?: number | null;
  nextDueDate: string;
  status?: string;
  autoConfirm?: boolean;
  keywords?: string | string[] | null;
  amountTolerance?: number;
  linkedTransactionId?: string | null;
  lastPaidDate?: string | null;
  paymentHistory?: any[];
  score: number;
  hasKeywordMatch: boolean;
  daysDiff: number;
  [key: string]: any;
}

export interface BillMatchResult {
  matchType: 'auto' | 'inbox' | 'none';
  candidates: MatchedBillCandidate[];
  suggestedBill: MatchedBillCandidate | null;
  confidence: number;
  reason?:
    | 'credit_transactions_never_match'
    | 'no_candidates'
    | 'auto_match'
    | 'merchant_mismatch'
    | 'multiple_candidates'
    | 'auto_confirm_disabled';
}

/**
 * Standard provider alias map for Indian & global recurring services.
 */
export const BILL_ALIAS_MAP: Record<string, string[]> = {
  jio: ['jio', 'reliance jio', 'rjio', 'myjio', 'reliance'],
  airtel: [
    'airtel',
    'bharti airtel',
    'airtel payments bank',
    'airtelfiber',
    'airtel fiber',
    'airtel broadband',
    'airtel thanks',
  ],
  vi: ['vi', 'vodafone', 'idea', 'vodafone idea', 'vodafoneidea'],
  bsnl: ['bsnl', 'bharat sanchar', 'bsnl broadband'],
  electricity: [
    'electricity',
    'electric',
    'power',
    'bijli',
    'bses',
    'tata power',
    'uppcl',
    'mpeb',
    'tneb',
    'bescom',
    'mseb',
    'mahadiscom',
    'cesc',
    'dhbvn',
    'uhbvn',
    'discom',
    'torrent power',
    'adani electricity',
  ],
  water: ['water', 'jal', 'delhi jal board', 'bwssb', 'hmwssb', 'water bill'],
  gas: [
    'gas',
    'indane',
    'hp gas',
    'bharat gas',
    'igl',
    'indraprastha gas',
    'mgl',
    'piped gas',
    'lpg',
    'cylinder',
  ],
  broadband: [
    'broadband',
    'act fibernet',
    'act broadband',
    'hathway',
    'excitel',
    'wifi',
    'fiber',
    'internet',
  ],
  rent: [
    'rent',
    'landlord',
    'flat rent',
    'room rent',
    'house rent',
    'pg rent',
    'apartment rent',
    'society maintenance',
  ],
  dth: [
    'dth',
    'tata sky',
    'tata play',
    'dish tv',
    'airtel dth',
    'sun direct',
    'videocon d2h',
  ],
  netflix: ['netflix'],
  spotify: ['spotify'],
  prime: ['prime', 'amazon prime'],
  hotstar: ['hotstar', 'disney+', 'disney plus'],
  youtube: ['youtube', 'yt premium'],
  google: ['google one', 'google play', 'google cloud'],
  apple: ['apple', 'icloud', 'apple music', 'itunes'],
  emi: ['loan', 'emi', 'hdfc loan', 'sbi loan', 'bajaj finserv', 'cred'],
};

/**
 * Words to ignore when matching generic title tokens against transaction text.
 */
const GENERIC_BILL_TOKENS = new Set([
  'bill',
  'bills',
  'recharge',
  'payment',
  'pay',
  'paid',
  'monthly',
  'yearly',
  'cycle',
  'due',
  'pack',
  'plan',
  'prepaid',
  'postpaid',
  'service',
  'services',
  'subscription',
  'the',
  'and',
  'for',
]);

/**
 * Parses any date representation into a normalized UTC date (year, month 0-indexed, day).
 */
export function parseDateOnly(val?: string | Date | number | null): Date {
  if (val instanceof Date) {
    return new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate()));
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    const match = val.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      const [, y, m, d] = match;
      return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    }
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Computes difference in days: (refDate - targetDate).
 * Positive means refDate is after targetDate; negative means refDate is before targetDate.
 */
export function getDiffInDays(refDate: Date, targetDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((refDate.getTime() - targetDate.getTime()) / msPerDay);
}

/**
 * Checks whether merchant / notification text matches the bill's keywords, title, provider, or aliases.
 */
export function checkMerchantKeywordMatch(
  bill: {
    title: string;
    provider?: string | null;
    category?: string | null;
    keywords?: string | string[] | null;
  },
  transaction: BillMatchTransactionInput
): boolean {
  const textPieces: string[] = [
    transaction.merchant || '',
    transaction.rawText || '',
    transaction.note || '',
  ];
  const combinedTxText = textPieces.join(' ').toLowerCase();
  if (!combinedTxText.trim()) return false;

  // 1. Check custom keywords assigned to the bill
  if (bill.keywords) {
    const customList = Array.isArray(bill.keywords)
      ? bill.keywords
      : bill.keywords.split(',').map((k) => k.trim());
    for (const kw of customList) {
      const normalizedKw = kw.toLowerCase().trim();
      if (normalizedKw && combinedTxText.includes(normalizedKw)) {
        return true;
      }
    }
  }

  // 2. Check provider direct match
  const provider = (bill.provider || '').toLowerCase().trim();
  if (provider && provider !== 'custom' && provider !== 'other') {
    if (combinedTxText.includes(provider)) {
      return true;
    }
    // Check aliases of this provider
    const aliases = BILL_ALIAS_MAP[provider];
    if (aliases) {
      for (const alias of aliases) {
        if (combinedTxText.includes(alias.toLowerCase())) {
          return true;
        }
      }
    }
  }

  // 3. Check bill title words and alias groups
  const title = (bill.title || '').toLowerCase();
  const titleTokens = title
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !GENERIC_BILL_TOKENS.has(w));

  for (const token of titleTokens) {
    if (combinedTxText.includes(token)) {
      return true;
    }

    // Check if title token is a key or member in alias map
    for (const [key, aliases] of Object.entries(BILL_ALIAS_MAP)) {
      if (key === token || aliases.includes(token)) {
        for (const alias of aliases) {
          if (combinedTxText.includes(alias.toLowerCase())) {
            return true;
          }
        }
      }
    }
  }

  // 4. Check category aliases (e.g. Electricity, Broadband)
  const category = (bill.category || '').toLowerCase().trim();
  if (category && BILL_ALIAS_MAP[category]) {
    for (const alias of BILL_ALIAS_MAP[category]) {
      if (combinedTxText.includes(alias.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Pure matcher function.
 * Evaluates candidate bills against a transaction.
 *
 * Candidate Rules:
 * - Status !== 'paid' (must be pending, unpaid, due_soon, due_today, overdue, etc.)
 * - Amount matches transaction (within bill.amountTolerance, default 0 for exact match)
 * - Reference date is within [dueDate - 5 days, dueDate + 5 days] (diffDays between -5 and +5)
 *
 * Scoring:
 * - Amount match: 50 points
 * - Date proximity: 10 to 20 points
 * - Keyword match: 30 points
 *
 * Output:
 * - Exactly 1 candidate + keyword match + autoConfirm ON => 'auto'
 * - Exactly 1 candidate without keyword match => 'inbox' (merchant_mismatch)
 * - Exactly 1 candidate with autoConfirm OFF => 'inbox' (auto_confirm_disabled)
 * - >1 candidates => 'inbox' (multiple_candidates)
 * - 0 candidates => 'none'
 */
export function matchBill(
  transaction: BillMatchTransactionInput,
  bills: Array<{
    id?: string;
    title: string;
    amount: number;
    category?: string;
    type?: string;
    frequency?: string;
    provider?: string | null;
    dueDay?: number | null;
    cycleDays?: number | null;
    nextDueDate: string;
    status?: string;
    autoConfirm?: boolean;
    keywords?: string | string[] | null;
    amountTolerance?: number;
    linkedTransactionId?: string | null;
    lastPaidDate?: string | null;
    paymentHistory?: any[];
    [key: string]: any;
  }>,
  now?: string | Date | number | null
): BillMatchResult {
  // Rule 1: Only debit transactions are matched. Credits never match.
  const txType = (transaction.type || 'debit').toLowerCase();
  const isDebit = txType === 'debit' || txType === 'expense';
  if (!isDebit) {
    return {
      matchType: 'none',
      candidates: [],
      suggestedBill: null,
      confidence: 0,
      reason: 'credit_transactions_never_match',
    };
  }

  const txAmount = Number(transaction.amount);
  if (isNaN(txAmount) || txAmount <= 0) {
    return {
      matchType: 'none',
      candidates: [],
      suggestedBill: null,
      confidence: 0,
      reason: 'no_candidates',
    };
  }

  const refDate = parseDateOnly(transaction.date || now || new Date());
  const candidates: MatchedBillCandidate[] = [];

  for (const bill of bills) {
    if (!bill || !bill.title) continue;

    // Rule: Exclude bills already marked as paid
    const status = (bill.status || '').toLowerCase();
    if (status === 'paid') {
      continue;
    }

    // Rule: Exclude if already linked to this transaction
    if (bill.linkedTransactionId && bill.linkedTransactionId === (transaction as any).id) {
      continue;
    }

    // Amount match check
    const billAmount = Number(bill.amount);
    if (isNaN(billAmount) || billAmount <= 0) continue;

    const tolerance =
      typeof bill.amountTolerance === 'number' && bill.amountTolerance >= 0
        ? bill.amountTolerance
        : 0;

    const amountDiff = Math.abs(billAmount - txAmount);
    if (amountDiff > tolerance + 0.001) {
      continue; // Amount did not match
    }

    // Date window check: within [dueDate - 5 days, dueDate + 5 days]
    if (!bill.nextDueDate) continue;
    const dueDate = parseDateOnly(bill.nextDueDate);
    const daysDiff = getDiffInDays(refDate, dueDate); // e.g. -5 to +5
    if (Math.abs(daysDiff) > 5) {
      continue; // Outside date window
    }

    // Candidate qualified! Compute confidence score
    const hasKeywordMatch = checkMerchantKeywordMatch(bill, transaction);

    // Scoring formula:
    // Amount match: 50 pts
    // Date proximity: 20 pts (0 days diff = 20, 1 day = 18, 2 = 16, 3 = 14, 4 = 12, 5 = 10)
    // Keyword match: 30 pts
    const amountScore = 50;
    const dateProximityScore = Math.max(10, 20 - Math.abs(daysDiff) * 2);
    const keywordScore = hasKeywordMatch ? 30 : 0;
    const totalScore = amountScore + dateProximityScore + keywordScore;

    candidates.push({
      ...bill,
      category: bill.category || 'Bills',
      score: totalScore,
      hasKeywordMatch,
      daysDiff,
    });
  }

  if (candidates.length === 0) {
    return {
      matchType: 'none',
      candidates: [],
      suggestedBill: null,
      confidence: 0,
      reason: 'no_candidates',
    };
  }

  // Sort candidates by score descending, then by date closeness
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Math.abs(a.daysDiff) - Math.abs(b.daysDiff);
  });

  // Decision Logic
  if (candidates.length === 1) {
    const candidate = candidates[0];
    const autoConfirmEnabled = candidate.autoConfirm !== false;

    if (candidate.hasKeywordMatch) {
      if (autoConfirmEnabled) {
        return {
          matchType: 'auto',
          candidates,
          suggestedBill: candidate,
          confidence: candidate.score,
          reason: 'auto_match',
        };
      } else {
        return {
          matchType: 'inbox',
          candidates,
          suggestedBill: candidate,
          confidence: candidate.score,
          reason: 'auto_confirm_disabled',
        };
      }
    } else {
      return {
        matchType: 'inbox',
        candidates,
        suggestedBill: candidate,
        confidence: candidate.score,
        reason: 'merchant_mismatch',
      };
    }
  }

  // Multiple candidates exist -> do NOT auto-confirm, route to inbox
  return {
    matchType: 'inbox',
    candidates,
    suggestedBill: candidates[0],
    confidence: candidates[0].score,
    reason: 'multiple_candidates',
  };
}

/**
 * Advances the next due date for a recurring bill by its cycle or frequency.
 */
export function calculateAdvancedDueDate(
  bill: {
    type?: string;
    frequency?: string;
    dueDay?: number | null;
    cycleDays?: number | null;
    nextDueDate: string;
  },
  baseDateStr?: string
): string {
  const base = (baseDateStr || bill.nextDueDate || '').split('T')[0];
  const [y, m, d] = base.split('-').map(Number);
  const validY = !isNaN(y) && y > 2000 ? y : new Date().getFullYear();
  const validM = !isNaN(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  const validD = !isNaN(d) && d >= 1 && d <= 31 ? d : new Date().getDate();

  // 1. Cycle days (e.g. 28, 56, 84 days)
  if (bill.type === 'cycle_days' && bill.cycleDays && bill.cycleDays > 0) {
    const dt = new Date(Date.UTC(validY, validM - 1, validD));
    dt.setUTCDate(dt.getUTCDate() + bill.cycleDays);
    const nextY = dt.getUTCFullYear();
    const nextM = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const nextD = String(dt.getUTCDate()).padStart(2, '0');
    return `${nextY}-${nextM}-${nextD}`;
  }

  // 2. Frequency: Yearly
  if (bill.frequency === 'yearly') {
    const nextY = validY + 1;
    const nextM = String(validM).padStart(2, '0');
    const nextD = String(validD).padStart(2, '0');
    return `${nextY}-${nextM}-${nextD}`;
  }

  // 3. Frequency: Quarterly (3 months)
  if (bill.frequency === 'quarterly') {
    return advanceByMonths(validY, validM, validD, 3, bill.dueDay);
  }

  // 4. Monthly (default)
  return advanceByMonths(validY, validM, validD, 1, bill.dueDay);
}

function advanceByMonths(
  year: number,
  month: number, // 1-12
  day: number,
  monthsToAdd: number,
  targetDueDay?: number | null
): string {
  let targetYear = year;
  let targetMonth = month - 1 + monthsToAdd; // 0-indexed

  targetYear += Math.floor(targetMonth / 12);
  targetMonth = ((targetMonth % 12) + 12) % 12;

  const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const resolvedDay = targetDueDay ? Math.min(targetDueDay, maxDay) : Math.min(day, maxDay);

  const nextY = targetYear;
  const nextM = String(targetMonth + 1).padStart(2, '0');
  const nextD = String(resolvedDay).padStart(2, '0');
  return `${nextY}-${nextM}-${nextD}`;
}
