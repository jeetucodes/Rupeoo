/**
 * Pure TypeScript Bank & UPI Alert Parser.
 *
 * Extracts high-accuracy financial fields from Indian bank SMS / UPI notifications:
 * - Amount (with Indian comma grouping; never uses balance)
 * - Direction (expense/income/transfer)
 * - Merchant / Payee (normalized, clean)
 * - Account / Card last 4 digits
 * - Reference / UTR / RRN
 * - Channel (UPI, card, ATM, NEFT, IMPS, EMI, bank, wallet)
 * - Balance (never confused with amount)
 * - Confidence score (0 to 1)
 *
 * Strict negative filters reject OTPs, promotions, loan offers,
 * mandate reminders ("will be debited"), balance inquiries, and failed transactions.
 */

export interface ParsedAlert {
  amount: number | null;
  type: 'expense' | 'income' | 'transfer';
  merchant: string | null;
  merchantNormalized: string | null;
  accountLast4: string | null;
  refNo: string | null;
  timestamp: number;
  channel: 'UPI' | 'card' | 'ATM' | 'NEFT' | 'IMPS' | 'EMI' | 'bank' | 'wallet' | 'other';
  balance: number | null;
  confidence: number;
  category: string;
  isReversal: boolean;
  isTransfer: boolean;
  isAtm: boolean;
  isOtpOrPromo: boolean;
  rawText: string;
  sender: string;
}

import { classifyTransaction } from './categorizer.ts';

// ---------------------------------------------------------------------------
// Known Indian Financial Entities & Bank DLT Code Mapping
// ---------------------------------------------------------------------------

export const KNOWN_BANK_CODES = new Set([
  // Public Sector Banks
  'HDFCBK', 'HDFC', 'HDFCAM', 'SBIINB', 'SBISMS', 'SBI', 'SBIPAY', 'ICICIB', 'ICICI', 'ICICIT',
  'AXISBK', 'AXIS', 'AXISTX', 'KOTAKB', 'KOTAK', 'KMBL', 'PNBSMS', 'PNB', 'PUNJAB',
  'CANBNK', 'CANARA', 'CANMS', 'UNIONB', 'UBI', 'UBISMS', 'BOIIND', 'BOI', 'BOISMS',
  'INDIANB', 'INDBNK', 'ALBK', 'CENTBK', 'CBI', 'CBINB', 'IOBIND', 'IOB',
  'UCOBNK', 'UCO', 'MAHABK', 'BOM', 'MAHBK', 'PSBINB', 'PSB', 'BARBOD', 'BOB', 'BOBSMS',

  // Private Sector Banks
  'YESBNK', 'YES', 'YESB', 'INDUSB', 'INDB', 'IDFCSM', 'IDFCFB', 'IDFC',
  'FEDBNK', 'FEDERAL', 'RBLBNK', 'RBL', 'BANDHAN', 'BNDHAN', 'KVBANK', 'KVB',
  'SIBLTD', 'SIB', 'CSBBANK', 'CSB', 'CITYUB', 'CUB', 'JKBANK', 'JKB',
  'KTKBNK', 'KARNATAKA', 'DCBBNK', 'DCB', 'TMBLTD', 'TMB', 'IDBIBK', 'IDBI',

  // Small Finance Banks (SFBs)
  'AUBANK', 'AU', 'EQUIF', 'EQUITAS', 'UJJIVN', 'UJJIVAN', 'ESAFSF', 'ESAF',
  'JANABK', 'JANA', 'UTKMSH', 'UTKARSH', 'FINCRV', 'FINCARE', 'SURYOD', 'SURYODAY',
  'CAPITL', 'CAPITAL', 'SHIVAM', 'SHIVALIK', 'NESFB', 'UNITY', 'UNITYSFB',

  // Payments Banks
  'PAYTM', 'PAYTMB', 'AIRTEL', 'AIRBNK', 'IPPB', 'POSTBK', 'FINO', 'FINOBK',
  'NSDL', 'NSDLBK', 'JIO', 'JIOBNK',

  // Foreign Banks in India
  'SCBANK', 'SCB', 'STANCHAR', 'HSBCBK', 'HSBC', 'CITIBK', 'CITI', 'AMEX', 'AMEXIN',
  'DBSBNK', 'DBS', 'DIGIBK', 'DEUTSC', 'DEUTSCHE', 'BARC', 'BARCLAYS',

  // UPI Apps, Cards & Fintech
  'GPAY', 'GOOGLEPAY', 'OKAXIS', 'OKHDFC', 'OKSBI', 'OKICICI',
  'PHNP', 'PHONEPE', 'YESBPHONEPE', 'IBLPHONEPE',
  'CRED', 'CREDAPP', 'BHIM', 'NPCI', 'AMZPAY', 'AMAZONPAY', 'AMAZON',
  'MOBIKWIK', 'MOBIKW', 'FREECHARGE', 'FREECHG', 'SLICE', 'SLICECARD',
  'JUPITER', 'JUPTR', 'FI', 'FIMONEY', 'ONECARD', 'FPLONECARD', 'UNI', 'UNICARD',
  'LAZYPAY', 'SIMPL', 'POSTPE', 'EPAYLATER', 'PAYU', 'RAZORPAY', 'CASHFREE',

  // Cooperative & Regional Banks
  'SARASW', 'SARASWAT', 'COSMOS', 'SVCBNK', 'SVC', 'TJSB', 'NKGSB'
]);

// ---------------------------------------------------------------------------
// Common Merchant Categorization Dictionary
// ---------------------------------------------------------------------------

const MERCHANT_CATEGORY_MAP: Record<string, string> = {
  // Food & Dining
  swiggy: 'Food',
  zomato: 'Food',
  mcdonalds: 'Food',
  mcdonald: 'Food',
  starbucks: 'Coffee',
  dominos: 'Food',
  kfc: 'Food',
  burgerking: 'Food',
  subway: 'Food',
  pizzahut: 'Food',
  haldirams: 'Food',
  chaayos: 'Coffee',
  chai: 'Coffee',
  behrouz: 'Food',
  faasos: 'Food',
  eatclub: 'Food',
  stall: 'Food',
  teastall: 'Food',
  chaiwala: 'Food',
  sweets: 'Food',
  bakery: 'Food',
  dhaba: 'Food',

  // Groceries
  blinkit: 'Groceries',
  zepto: 'Groceries',
  instamart: 'Groceries',
  bigbasket: 'Groceries',
  bbdaily: 'Groceries',
  dmart: 'Groceries',
  spencers: 'Groceries',
  naturebasket: 'Groceries',
  countrydelight: 'Groceries',
  milk: 'Groceries',
  motherdairy: 'Groceries',
  dairy: 'Groceries',
  kirana: 'Groceries',

  // Travel & Commute
  uber: 'Travel',
  ola: 'Travel',
  rapido: 'Travel',
  irctc: 'Travel',
  makemytrip: 'Travel',
  goibibo: 'Travel',
  yatra: 'Travel',
  indigo: 'Travel',
  airindia: 'Travel',
  vistara: 'Travel',
  akasa: 'Travel',
  redbus: 'Travel',
  abhibus: 'Travel',
  fastag: 'Travel',
  toll: 'Travel',
  metro: 'Travel',
  dmrc: 'Travel',

  // Shopping & Ecommerce
  amazon: 'Shopping',
  flipkart: 'Shopping',
  myntra: 'Shopping',
  ajio: 'Shopping',
  meesho: 'Shopping',
  nykaa: 'Shopping',
  tatacliq: 'Shopping',
  zara: 'Shopping',
  hnm: 'Shopping',
  'h&m': 'Shopping',
  decathlon: 'Shopping',
  croma: 'Shopping',
  reliancedigital: 'Shopping',
  reliance: 'Shopping',
  ikea: 'Shopping',
  lenskart: 'Shopping',
  westside: 'Shopping',

  // Bills & Utilities
  airtel: 'Bills',
  jio: 'Bills',
  vodafone: 'Bills',
  vi: 'Bills',
  bsnl: 'Bills',
  bescom: 'Utilities',
  tatapower: 'Utilities',
  adani: 'Utilities',
  torrent: 'Utilities',
  cesc: 'Utilities',
  electricity: 'Utilities',
  water: 'Utilities',
  gas: 'Utilities',
  igl: 'Utilities',
  mgl: 'Utilities',
  actfibernet: 'Bills',
  broadband: 'Bills',
  recharge: 'Bills',

  // Entertainment & Subscriptions
  netflix: 'Subscriptions',
  hotstar: 'Subscriptions',
  spotify: 'Subscriptions',
  youtube: 'Subscriptions',
  prime: 'Subscriptions',
  bookmyshow: 'Entertainment',
  pvr: 'Entertainment',
  inox: 'Entertainment',
  sonyliv: 'Subscriptions',
  zee5: 'Subscriptions',

  // Health & Medicine
  apollo: 'Health',
  pharmeasy: 'Health',
  '1mg': 'Health',
  tata1mg: 'Health',
  netmeds: 'Health',
  medplus: 'Health',
  practo: 'Health',
  hospital: 'Health',
  clinic: 'Health',
  pharmacy: 'Health',

  // Fuel
  indianoil: 'Fuel',
  ioc: 'Fuel',
  iocl: 'Fuel',
  bharatpetroleum: 'Fuel',
  bpcl: 'Fuel',
  hpcl: 'Fuel',
  shell: 'Fuel',
  petrol: 'Fuel',

  // Rent / Housing
  rent: 'Rent',
  nobroker: 'Rent',
  housing: 'Rent',

  // Salary
  salary: 'Salary',
  payroll: 'Salary',
};

// ---------------------------------------------------------------------------
// Negative Filter Patterns (Rejects OTPs, Promotions, Mandates, Inquiries)
// ---------------------------------------------------------------------------

const OTP_PATTERNS = [
  /\botp\b/i,
  /\bone[ -]time[ -]password\b/i,
  /\bverification\s+code\b/i,
  /\bsecret\s+code\b/i,
  /\bsecurity\s+code\b/i,
  /\blogin\s+code\b/i,
  /\bdo\s+not\s+share\b/i,
  /\bnever\s+share\b/i,
  /\bvalid\s+for\s+\d+\s*(?:mins|minutes|seconds)\b/i,
  /\buse\s+code\s+\d{4,8}\b/i,
  /\bis\s+your\s+(?:auth|login|netbanking|hdfc|sbi|icici|axis)\s+otp\b/i,
];

const PROMOTION_PATTERNS = [
  /\bapply\s+now\b/i,
  /\bclick\s+here\b/i,
  /\bpre[ -]?approved\b/i,
  /\bspecial\s+offer\b/i,
  /\bexclusive\s+offer\b/i,
  /\bcongratulations\b/i,
  /\bflat\s+\d+%\s+off\b/i,
  /\bcall\s+now\b/i,
  /\binstant\s+personal\s+loan\b/i,
  /\bavail\s+loan\b/i,
  /\binstant\s+credit\s+limit\b/i,
  /\bupgrade\s+your\s+card\b/i,
  /\bwin\s+up\s+to\b/i,
  /\bchance\s+to\s+win\b/i,
  /\bhurry\b/i,
  /\blimited\s+period\s+offer\b/i,
  /\bdiscounts?\s+up\s+to\b/i,
];

const MANDATE_AND_SCHEDULED_PATTERNS = [
  // Future debits & scheduled reminders
  /\bwill\s+be\s+debited\b/i,
  /\bscheduled\s+to\s+be\s+debited\b/i,
  /\bwill\s+be\s+deducted\b/i,
  /\bmandate\s+(?:created|registered|reminder|scheduled)\b/i,
  /\bauto[ -]debit\s+(?:due|scheduled|reminder)\b/i,
  /\bstanding\s+instruction\s+reminder\b/i,
  /\breminder\s*:\s*your\s+(?:emi|bill|payment)\s+is\s+due\b/i,
  /\bupcoming\s+debit\b/i,
  /\bis\s+scheduled\s+for\b/i,
  /\bupcoming\s+auto[ -]?pay\b/i,

  // Autopay / Mandate / Auto-debit / SI / eNACH Cancellation & Revocation (cancel, revoke, pause, delete, stop, hata, band)
  /\b(?:auto[ -]?pay|mandate|e-?mandate|auto[ -]?debit|standing\s+instruction|\bsi\b|enach|e-nach|nach)\b[\s\S]*?\b(?:cancel(?:led|ed|lation|ling)?|revok(?:ed|e)?|revocation|paus(?:ed|e|ing)?|stop(?:ped|e|ping)?|delet(?:ed|e|ing)?|remov(?:ed|e|al|ing)?|deactivat(?:ed|e|ion)?|terminat(?:ed|e|ion)?|disabled?|hata(?:ya|ye|diya)?|rok(?:a|i)?|band|delete\s+kiya|cancel\s+kiya|unlink(?:ed)?|failed|rejected|expired)\b/i,
  /\b(?:cancel(?:led|ed|lation|ling)?|revok(?:ed|e)?|revocation|paus(?:ed|e|ing)?|stop(?:ped|e|ping)?|delet(?:ed|e|ing)?|remov(?:ed|e|al|ing)?|deactivat(?:ed|e|ion)?|terminat(?:ed|e|ion)?|disabled?|hata(?:ya|ye|diya)?|rok(?:a|i)?|band|delete\s+kiya|cancel\s+kiya|unlink(?:ed)?)\b[\s\S]*?\b(?:auto[ -]?pay|mandate|e-?mandate|auto[ -]?debit|standing\s+instruction|\bsi\b|enach|e-nach|nach)\b/i,

  // Autopay / Mandate / Auto-debit / SI / eNACH Creation, Registration, Setup, Addition (add, create, set up, register, lgya, lagaya)
  /\b(?:auto[ -]?pay|mandate|e-?mandate|auto[ -]?debit|standing\s+instruction|\bsi\b|enach|e-nach|nach)\b[\s\S]*?\b(?:creat(?:ed|e|ion)?|register(?:ed)?|registration|set\s*up|setup|add(?:ed|ing)?|activat(?:ed|e|ion)?|schedul(?:ed|e)?|approv(?:ed|al)?|confirm(?:ed|ation)?|enabl(?:ed|e)?|initiat(?:ed|e|ion)?|shuru|jod|lagay(?:a|e)|lgya|laga\s+diya|link(?:ed)?)\b/i,
  /\b(?:creat(?:ed|e|ion)?|register(?:ed)?|registration|set\s*up|setup|add(?:ed|ing)?|activat(?:ed|e|ion)?|schedul(?:ed|e)?|approv(?:ed|al)?|confirm(?:ed|ation)?|enabl(?:ed|e)?|initiat(?:ed|e|ion)?|lagay(?:a|e)|lgya|laga\s+diya|link(?:ed)?)\b[\s\S]*?\b(?:auto[ -]?pay|mandate|e-?mandate|auto[ -]?debit|standing\s+instruction|\bsi\b|enach|e-nach|nach)\b/i,

  // Standalone Autopay request & setup notifications
  /\bauto[ -]?pay\s+(?:request|setup|mandate|alert|notification|authorized|authorization)\b/i,
  /\b(?:setup|registration)\s+successful\b/i,
  /\b(?:mandate|autopay|si)\s+(?:id|ref|status|details)\b/i,
];

const BALANCE_ONLY_PATTERNS = [
  /(?:dear\s+customer[, ]*)?(?:your\s+)?(?:avail(?:able)?\s+)?bal(?:ance)?\s+(?:in|for)?\s*(?:a\/c|account)?[^.]*?(?:is|:)\s*(?:rs\.?|inr|₹)\s*[0-9,.]+\s*(?:\.|$)/i,
  /clear\s+balance\s+for\s+a\/c[^.]*?is\s+(?:rs\.?|inr|₹)\s*[0-9,.]+/i,
  /balance\s+enquiry/i,
  /mini[ -]statement/i,
  /your\s+a\/c\s+balance\s+for\s+[a-zA-Z0-9*]+\s+is\s+(?:rs\.?|inr|₹)\s*[0-9,.]+/i,
];

const FAILED_PATTERNS = [
  /\bdeclined\b/i,
  /\btransaction\s+failed\b/i,
  /\bfailed\s+to\s+process\b/i,
  /\bunsuccessful\b/i,
  /\bcould\s+not\s+be\s+processed\b/i,
  /\binsufficient\s+(?:balance|funds)\b/i,
  /\bpayment\s+declined\b/i,
  /\bpayment\s+failed\b/i,
  /\bfailed\s+due\s+to\b/i,
  /\btransaction\s+was\s+declined\b/i,
];

const BILL_DUE_PATTERNS = [
  /\btotal\s+amount\s+due\b/i,
  /\bminimum\s+amount\s+due\b/i,
  /\bstatement\s+for\s+(?:your\s+)?credit\s+card\b/i,
  /\bbill\s+(?:is\s+)?generated\b/i,
  /\bdue\s+date\s+is\b/i,
  /\bpay\s+before\s+\d{1,2}[-/.]\d{1,2}\b/i,
  /\bpayment\s+due\s+date\b/i,
];

// ---------------------------------------------------------------------------
// Sender Utilities
// ---------------------------------------------------------------------------

export interface DltSenderInfo {
  isDlt: boolean;
  operatorPrefix: string | null;
  bankCode: string | null;
  suffix: string | null;
  isKnownBank: boolean;
}

export function parseDltSender(sender: string, customBanks?: string[]): DltSenderInfo {
  if (!sender) {
    return { isDlt: false, operatorPrefix: null, bankCode: null, suffix: null, isKnownBank: false };
  }

  const clean = sender.trim().toUpperCase();

  // Check custom bank names or sender IDs first
  if (customBanks && customBanks.length > 0) {
    for (const b of customBanks) {
      const upper = b.trim().toUpperCase();
      if (upper && (clean.includes(upper) || upper.includes(clean))) {
        return {
          isDlt: false,
          operatorPrefix: null,
          bankCode: upper,
          suffix: null,
          isKnownBank: true,
        };
      }
    }
  }

  const dltMatch = clean.match(/^([A-Z]{2})-([A-Z0-9]{3,8})(?:-([A-Z]))?$/);
  if (dltMatch) {
    const operatorPrefix = dltMatch[1];
    const rawBankCode = dltMatch[2];
    const suffix = dltMatch[3] || null;

    let matchedCode: string | null = null;
    for (const code of KNOWN_BANK_CODES) {
      if (rawBankCode.includes(code) || code.includes(rawBankCode)) {
        matchedCode = code;
        break;
      }
    }

    if (!matchedCode && customBanks && customBanks.length > 0) {
      for (const b of customBanks) {
        const upper = b.trim().toUpperCase();
        if (upper && (rawBankCode.includes(upper) || upper.includes(rawBankCode))) {
          matchedCode = upper;
          break;
        }
      }
    }

    return {
      isDlt: true,
      operatorPrefix,
      bankCode: matchedCode || rawBankCode,
      suffix,
      isKnownBank: Boolean(matchedCode) || KNOWN_BANK_CODES.has(rawBankCode),
    };
  }

  let known = false;
  let codeFound: string | null = null;
  for (const code of KNOWN_BANK_CODES) {
    if (clean.includes(code)) {
      known = true;
      codeFound = code;
      break;
    }
  }

  return {
    isDlt: false,
    operatorPrefix: null,
    bankCode: codeFound || clean,
    suffix: null,
    isKnownBank: known,
  };
}

// ---------------------------------------------------------------------------
// Text Normalization & Helper Extractors
// ---------------------------------------------------------------------------

export function normalizeWhitespace(str: string): string {
  if (!str) return '';
  return str.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parses numeric string formatted with Indian comma grouping:
 * "1,23,456.78" -> 123456.78
 */
export function parseIndianNumber(numStr: string): number | null {
  if (!numStr) return null;
  const clean = numStr.replace(/,/g, '').trim();
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

// ---------------------------------------------------------------------------
// Core Extraction Functions
// ---------------------------------------------------------------------------

/**
 * Extracts transaction amount from SMS body.
 * Guaranteed never to return account balance as the transaction amount.
 */
function extractAmount(text: string): { amount: number | null; matchIndex: number } {
  const verbAmountPatterns = [
    /(?:debited|spent|paid|sent|withdrawn|withdrew|deposited|transferred|reversal\s+of|refund\s+of|cashback\s+of|credited|received|charged)\s+(?:by|with|for|to|from|of)?\s*(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+(?:is|has\s+been|was|bhej\s+diye)?\s*(?:debited|spent|paid|sent|withdrawn|deposited|transferred|credited|received|refunded|charged|bhej\s+diye)/i,
    /(?:dr|cr)\.?\s*(?:by|for)?\s*(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:dr|cr)\b/i,
    /purchase\s+of\s+(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /payment\s+of\s+(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /vpa\s+.*?\s+(?:for\s+)?(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:charged|spent|paid|transferred)\s+([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:usd|gbp|eur|aed|sar|cad|aud|sgd)/i,
  ];

  for (const regex of verbAmountPatterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const parsed = parseIndianNumber(match[1]);
      if (parsed !== null && parsed > 0) {
        return { amount: parsed, matchIndex: match.index ?? -1 };
      }
    }
  }

  // Fallback for generic amount pattern, ignoring anything preceded by balance words
  const balMatch = text.match(/(?:bal|balance|avail\s+bal|available\s+bal|a\/c\s+bal|clear\s+bal)[^.]*?(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  const balIndex = balMatch?.index ?? -1;
  const balLength = balMatch?.[0]?.length ?? 0;

  const genericMatches = Array.from(text.matchAll(/(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi));
  for (const gm of genericMatches) {
    const idx = gm.index ?? -1;
    if (balIndex !== -1 && idx >= balIndex && idx < balIndex + balLength + 10) {
      continue;
    }
    const val = parseIndianNumber(gm[1]);
    if (val !== null && val > 0) {
      return { amount: val, matchIndex: idx };
    }
  }

  return { amount: null, matchIndex: -1 };
}

/**
 * Extracts balance amount if present.
 */
function extractBalance(text: string): number | null {
  const match = text.match(
    /(?:bal|balance|avail\s+bal|available\s+bal|avail\s+balance|a\/c\s+bal|clear\s+bal)\s*(?:is|:)?\s*(?:rs\.?|inr|₹|\$|usd|£|gbp|€|eur|aed|sar|cad|aud|sgd)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
  );
  if (match && match[1]) {
    return parseIndianNumber(match[1]);
  }
  return null;
}

/**
 * Determines transaction direction: expense, income, or transfer.
 */
function extractTypeAndCategory(text: string): {
  type: 'expense' | 'income' | 'transfer';
  isReversal: boolean;
  isTransfer: boolean;
  isAtm: boolean;
} {
  const isReversal = /\b(?:reversed|reversal|refund|refunded|credited\s+back)\b/i.test(text);
  const isAtm = /\b(?:atm\b|cash\s+withdr|withdrawn\s+at\s+atm|at\s+atm)/i.test(text);
  const isTransfer =
    /\b(?:transferred|transfer)\s+.*?\s+(?:to\s+(?:your\s+)?(?:own\s+|self\s+)?a\/c|to\s+own\s+account|to\s+self\s+account|between\s+your\s+accounts)\b/i.test(text) ||
    /\b(?:self\s+transfer|own\s+account\s+transfer)\b/i.test(text);

  if (isReversal) {
    return { type: 'income', isReversal: true, isTransfer: false, isAtm: false };
  }
  if (isTransfer) {
    return { type: 'transfer', isReversal: false, isTransfer: true, isAtm: false };
  }

  // Words like "paid you", "paid to you", "sent you", "sent to you", "paid into your account" are incoming money (credits)
  const isIncomingP2P =
    /\b(?:paid\s+(?:to\s+)?you|has\s+paid\s+you|sent\s+(?:to\s+)?you|bhej\s+diye\s+(?:aapko|apko)|paid\s+in(?:to)?\s+your)\b/i.test(text);

  // Strong Credit Signals (Incoming funds into user's account)
  const isCreditSignal =
    isIncomingP2P ||
    /\b(?:received\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*in\s+(?:your\s+)?(?:[a-z]+\s+)?(?:a\/c|ac|account)|received\s+in\s+(?:your\s+)?(?:[a-z]+\s+)?(?:a\/c|ac|account))\b/i.test(text) ||
    /\b(?:received\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*from|received\s+from|payment\s+received|money\s+received|amount\s+received|funds?\s+received)\b/i.test(text) ||
    /\b(?:credited\s+to\s+(?:your\s+)?(?:[a-z]+\s+)?(?:a\/c|ac|account)|credited\s+to|credited\s+with|credited\s+in|credited\s+by)\b/i.test(text) ||
    /\b(?:transferred\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*to\s+your\s+(?:[a-z]+\s+)?(?:a\/c|ac|account)|transferred\s+to\s+your\s+(?:[a-z]+\s+)?(?:a\/c|ac|account)|transferred\s+to\s+you)\b/i.test(text) ||
    /\b(?:deposited\s+(?:to|in|into)\s+(?:your\s+)?(?:[a-z]+\s+)?(?:a\/c|ac|account))\b/i.test(text) ||
    /\b(?:credited|received|deposited|cashback)\b/i.test(text) ||
    /\b(?:cr\b|cr\.?|aaya|mila|jama\s+hua|prapt\s+hue)\b/i.test(text);

  // Strong Debit Signals (Outgoing funds from user's account)
  const isDebitSignal =
    /\b(?:debited\s+from\s+(?:your\s+)?(?:[a-z]+\s+)?(?:a\/c|ac|account)|debited\s+by|withdrawn\s+from)\b/i.test(text) ||
    /\b(?:paid\s+to\s+(?!you\b)[A-Za-z0-9]|paid\s+for\s+[A-Za-z0-9]|sent\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*to\s+(?!you\b)[A-Za-z0-9])\b/i.test(text) ||
    /\b(?:spent\s+(?:on|at)|purchase\s+(?:at|of)|charged\s+to)\b/i.test(text) ||
    /\b(?:debited|spent|withdrawn|withdrew|purchase\s+of)\b/i.test(text) ||
    /\b(?:dr\b|dr\.?|a\/c\s+se\s+kat|kat\s+gaye|se\s+debit\s+hua)\b/i.test(text) ||
    (/\b(?:paid|sent|bhej\s+diye)\b/i.test(text) && !isIncomingP2P);

  if (isCreditSignal && !isDebitSignal) {
    return { type: 'income', isReversal: false, isTransfer: false, isAtm: false };
  }
  if (isDebitSignal && !isCreditSignal) {
    return { type: 'expense', isReversal: false, isTransfer: false, isAtm };
  }

  // When both match, check account-level directional phrase:
  if (
    /\b(?:received\s+in\s+(?:your\s+)?(?:[a-z]+\s+)?(?:a\/c|ac|account)|received\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*in\s+(?:your\s+)?(?:[a-z]+\s+)?(?:a\/c|ac|account))\b/i.test(text) ||
    /\b(?:credited\s+to\s+(?:your\s+)?(?:[a-z]+\s+)?(?:a\/c|ac|account)|credited\s+with|credited\s+in)\b/i.test(text) ||
    /\b(?:received\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*from|received\s+from|payment\s+received\s+from)\b/i.test(text) ||
    isIncomingP2P
  ) {
    return { type: 'income', isReversal: false, isTransfer: false, isAtm: false };
  }

  if (/\b(?:debited\s+from\s+(?:your\s+)?(?:[a-z]+\s+)?(?:a\/c|ac|account)|debited\s+by|withdrawn\s+from)\b/i.test(text)) {
    return { type: 'expense', isReversal: false, isTransfer: false, isAtm };
  }

  return { type: 'expense', isReversal: false, isTransfer: false, isAtm };
}

/**
 * Extracts account or card number (last 4 digits).
 */
function extractAccountLast4(text: string): string | null {
  const patterns = [
    /(?:a\/c|acct|account|card|ac|ending|no\.?)\s*(?:no\.?|with)?\s*[:#-]?\s*[*xX.]*(\d{3,4})\b/i,
    /\b(?:xx|[*]{2,}|[.]{2,})([0-9]{4})\b/i,
    /card\s+ending\s+(?:with\s+)?(\d{4})/i,
    /a\/c\s+([0-9]{3,4})\b/i,
  ];

  for (const p of patterns) {
    const match = text.match(p);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extracts Reference number, UTR, or RRN.
 */
function extractRefNo(text: string): string | null {
  const patterns = [
    /\b(?:rrn|utr|ref\s*no|ref|txn\s*id|transaction\s*id|txn|reference)\s*[:#\s-]?\s*([a-zA-Z0-9]{6,25})\b/i,
    /\bupi\/(?:p2[am]\/|cr\/)?([0-9]{10,18})\b/i,
    /\bupi\s+([0-9]{10,18})\b/i,
    /\bupi\s*[:\s]+([0-9]{10,18})\b/i,
    /\bref[:\s]*([0-9]{8,18})\b/i,
  ];

  for (const p of patterns) {
    const match = text.match(p);
    if (match && match[1]) {
      const val = match[1].trim();
      if (!/^(and|the|not|with|for|your|bank|from|card)$/i.test(val)) {
        return val;
      }
    }
  }
  return null;
}

/**
 * Extracts transaction channel (UPI, card, ATM, NEFT, IMPS, EMI, etc.).
 */
function extractChannel(text: string): ParsedAlert['channel'] {
  const lower = text.toLowerCase();
  if (/\batm\b|cash\s+withdr/i.test(lower)) return 'ATM';
  if (/\bupi\b|vpa|gpay|phonepe|paytm\s+upi|@okhdfcbank|@okaxis|@ybl|upi\/p2[am]/i.test(lower)) return 'UPI';
  if (/\b(?:debit|credit)\s+card\b|card\s+ending|pos\b|visa|mastercard|rupay/i.test(lower)) return 'card';
  if (/\bneft\b/i.test(lower)) return 'NEFT';
  if (/\bimps\b/i.test(lower)) return 'IMPS';
  if (/\bemi\b/i.test(lower)) return 'EMI';
  if (/\bwallet\b/i.test(lower)) return 'wallet';
  if (/\bnetbanking\b|rtgs|cheque/i.test(lower)) return 'bank';
  return 'other';
}

/**
 * Normalizes merchant name by removing UPI prefixes, VPA suffixes, business suffixes, etc.
 */
export function normalizeMerchant(rawMerchant: string | null): string | null {
  if (!rawMerchant) return null;

  let m = rawMerchant.trim();

  // Strip prefix labels
  m = m.replace(/^(?:upi[-/]|vpa[:\s]|to[:\s]|from[:\s]|at[:\s]|paid\s+to[:\s]|info[:\s]|desc[:\s]|towards[:\s]|for[:\s]|by[:\s]|salary\/)/i, '');

  // Strip UPI VPA handles (@okaxis, @okhdfcbank, @ybl, @paytm, @ibl, @axl, etc.)
  m = m.replace(/@[a-zA-Z0-9_.-]+$/i, '');

  // Strip trailing "on <date>" if accidentally matched
  m = m.replace(/\s+on\s+\d{1,2}[-/\s]+[a-zA-Z0-9]+.*$/i, '');

  // Strip trailing "for Rs X", "of Rs X", "Rs X", "INR X", "₹ X"
  m = m.replace(/\s+(?:for\s+|of\s+)?(?:rs\.?|inr|₹)\s*[0-9,.]*.*$/i, '');
  m = m.replace(/\s+(?:for|of)\s+[0-9,.]+(?:\s*(?:rs\.?|inr|₹))?.*$/i, '');

  // Strip trailing transaction status / outcome words
  m = m.replace(/\s+(?:successful(?:ly)?|completed|done|failed|debited|credited|declined|sent|paid|transfer(?:red)?).*$/i, '');

  // Strip trailing "via/using/through/from/with"
  m = m.replace(/\s+(?:via|using|through|from|with)\s+.*$/i, '');

  // Strip trailing reference / UTR / RRN / A/C
  m = m.replace(/\s+(?:ref(?:\s*no\.?)?|utr|rrn|txn(?:\s*id)?|upi\s*ref|a\/c|account)\b.*$/i, '');

  // Strip common corporate entity suffixes
  m = m.replace(/\b(?:pvt\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|inc\.?|corp\.?|services|india|order|purchase|subscription|flight|booking|premium)\b/gi, '');

  // Strip .com, .in, web domains
  m = m.replace(/\.(?:com|in|org|net|co)\b/gi, '');

  // Remove leading/trailing non-alphanumeric chars
  m = m.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

  // Collapse multiple spaces
  m = m.replace(/\s+/g, ' ');

  if (!m || m.length < 2) return null;

  // Title Case
  return m
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extracts raw merchant / payee name from text.
 */
function extractMerchant(text: string, type: 'expense' | 'income' | 'transfer', channel: ParsedAlert['channel']): string | null {
  if (channel === 'ATM') {
    return 'ATM Cash Withdrawal';
  }

  const patterns = [
    // "Money sent to you by AKASH", "Payment received from AKASH", "sent to you by AKASH"
    /(?:payment\s+from|payment\s+received\s+from|money\s+received\s+from|money\s+sent\s+(?:to\s+you\s+)?by|sent\s+(?:to\s+you\s+)?by)\s+([A-Za-z0-9\s&'.-]{2,35}?)(?:\s+(?:on|with|ref|rrn|utr|using|via|avail|bal|for|of|rs\.?|inr|₹)|\.|\n|$)/i,
    // P2P Incoming payment patterns: "AKASH paid you", "AKASH has paid you", "AKASH sent you"
    /(?:^|\b)(?!money\b|payment\b|funds?\b)([A-Za-z0-9\s&'.-]{2,35}?)\s+(?:has\s+)?(?:paid|sent)\s+(?:you|to\s+you)\b/i,
    // NPCI UPI Credit: "UPI/CR/628719284910/PRIYA SHARMA"
    /upi\/(?:cr|p2[am])\/[0-9]+\/([a-zA-Z0-9\s&'.-]{2,35})/i,
    // "through UPI: upi-tea-stall@sbi"
    /through\s+upi\s*[:\s]+(?:upi-)?([a-zA-Z0-9_.-]+)@/i,
    // "credited to <card/ac> ... from <merchant>"
    /(?:credited\s+to|refund\s+of\s+[^.]+?\s+credited\s+to)[^.]+?\s+from\s+([A-Za-z0-9\s&'.-]{2,35}?)(?:\s+(?:on|with|ref|rrn|utr|using|via|avail|bal)|\.|\n|$)/i,
    // "towards cashback from <merchant>"
    /towards\s+cashback\s+from\s+([A-Za-z0-9\s&'.-]{2,35}?)(?:\s+(?:on|with|ref|rrn|utr|using|via|avail|bal)|\.|\n|$)/i,
    // "paid to <merchant> on/ref/at/bal/."
    /(?:paid\s+to|payment\s+to|payment\s+of\s+[^.]+?\s+to|sent\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*to|transferred\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*to|bhej\s+diye\s+to)\s+([A-Za-z0-9\s&'.-]{2,40}?)(?:\s+(?:on|with|ref|rrn|utr|using|via|avail|bal|a\/c|from|upi|for|of|rs|inr|₹|successful)|\.|\n|$)/i,
    // "debited ... to <merchant>"
    /(?:debited|spent|paid)\s+.*?\s+to\s+([A-Za-z0-9\s&'.-]{2,40}?)(?:\s+(?:on|with|ref|rrn|utr|using|via|avail|bal|from|upi)|\.|\n|$)/i,
    // "spent on card XX1234 at <merchant> on/ref" or "spent at <merchant>"
    /(?:spent\s+on\s+card\s+[^a-zA-Z0-9]*\d*\s*at|spent\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*at|purchase\s+at|used\s+at)\s+([A-Za-z0-9\s&'.-]{2,40}?)(?:\s+(?:with|on|ref|rrn|utr|using|via|avail|bal)|\.|\n|$)/i,
    // "towards <merchant> on/ref/at"
    /towards\s+([A-Za-z0-9\s&'.-]{2,40}?)(?:\s+(?:on|with|ref|rrn|utr|using|via|avail|bal)|\.|\n|$)/i,
    // "paid for <merchant> on/ref/at" or "for <merchant> purchase/subscription/flight"
    /(?:paid\s+for|for)\s+([A-Za-z0-9\s&'.-]{2,40}?)(?:\s+(?:flight|purchase|subscription|booking|order|recharge|on|from|via|ref|rrn|utr|avail|bal)|\.|\n|$)/i,
    // "Info: <merchant> on/ref"
    /(?:info\s*[:\s]|desc\s*[:\s])\s*([A-Za-z0-9\s&'.-]{2,30}?)(?:\s+(?:on|ref|rrn|utr|avail|bal)|\.|\n|$)/i,
    // "by SALARY/TECHCORP" or "by SALARY"
    /by\s+(salary(?:\/[A-Za-z0-9\s&'.-]{2,30})?|[A-Za-z0-9/&'.-]{2,35}?)(?:\s+(?:on|ref|rrn|utr|avail|bal)|\.|\n|$)/i,
    // "credited with Rs X by/from <merchant>"
    /(?:credited\s+by|received\s+(?:rs\.?|inr|₹)?\s*[0-9,.]*\s*from|from)\s+([A-Za-z0-9\s&'.-]{2,40}?)(?:\s+(?:on|with|ref|rrn|utr|avail|bal|using|via)\b|\.|\n|$)/i,
    // "VPA <merchant> on/ref"
    /\bvpa\s+([A-Za-z0-9@_.-]{3,35})/i,
    // Generic "at <merchant>"
    /\bat\s+([A-Za-z0-9\s&'.-]{2,35}?)(?:\s+(?:on|with|ref|rrn|utr|using|via|avail|bal)|\.|\n|$)/i,
    // Generic "to <merchant> via UPI"
    /\bto\s+([A-Za-z0-9\s&'.-]{2,35}?)(?:\s+(?:via|using|from|on|ref|rrn|utr|upi)|\.|\n|$)/i,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Skip false candidates
      if (
        /^(?:your|the|a\/c|account|bank|branch|inr|rs|card|pos|atm|upi|paytm\s+wallet|money|payment|funds?)$/i.test(candidate) ||
        /^(?:rs\.?|inr|₹)?\s*[0-9,.]+(?:\s*(?:rs|inr))?$/i.test(candidate) ||
        /^(?:hdfc|sbi|icici|axis|kotak|pnb|canara)\s+(?:card|bank|a\/c)/i.test(candidate)
      ) {
        continue;
      }
      return candidate;
    }
  }

  return null;
}

/**
 * Categorizes transaction based on merchant name, channel, and keywords,
 * with support for user-defined custom override rules.
 */
export function categorizeTransaction(
  merchantNorm: string | null,
  channel: ParsedAlert['channel'],
  type: 'expense' | 'income' | 'transfer',
  isAtm: boolean,
  customRules?: Record<string, string>
): string {
  if (isAtm || channel === 'ATM') {
    return 'Cash';
  }

  if (type === 'transfer') {
    return 'Others';
  }

  if (type === 'income') {
    if (merchantNorm && /salary|payroll|employer/i.test(merchantNorm)) {
      return 'Salary';
    }
    return 'Income';
  }

  // Check user custom rules first
  if (merchantNorm && customRules) {
    const lowerM = merchantNorm.toLowerCase();
    for (const [key, cat] of Object.entries(customRules)) {
      if (lowerM.includes(key.toLowerCase())) {
        return cat;
      }
    }
  }

  // Use Layered Categorizer (Brand Dictionary, Keyword Rules, UPI MCC, etc.)
  if (merchantNorm) {
    const classified = classifyTransaction(merchantNorm, {
      type,
      channel,
    });
    if (classified.isAutoAssigned && classified.category !== 'Uncategorized') {
      return classified.category;
    }
  }

  // Check legacy dictionary as safety net
  if (merchantNorm) {
    const lowerM = merchantNorm.toLowerCase();
    for (const [key, cat] of Object.entries(MERCHANT_CATEGORY_MAP)) {
      if (lowerM.includes(key)) {
        return cat;
      }
    }
  }

  return 'Uncategorized';
}

/**
 * Extracts in-message date/time as fallback if SMS timestamp is absent.
 */
function extractInMessageTimestamp(text: string, fallbackTimestamp?: number): number {
  if (fallbackTimestamp && fallbackTimestamp > 0) {
    return fallbackTimestamp;
  }

  const dateMatch = text.match(/\b(\d{1,2})[-/]([A-Za-z]{3}|\d{1,2})[-/](\d{2,4})\b/);
  if (dateMatch) {
    try {
      const d = parseInt(dateMatch[1], 10);
      let m = 0;
      const mStr = dateMatch[2];
      if (isNaN(parseInt(mStr, 10))) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        m = months.indexOf(mStr.toLowerCase());
      } else {
        m = parseInt(mStr, 10) - 1;
      }
      let y = parseInt(dateMatch[3], 10);
      if (y < 100) y += 2000;

      const dateObj = new Date(y, m, d);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.getTime();
      }
    } catch {
      // Fallback
    }
  }

  return Date.now();
}

// ---------------------------------------------------------------------------
// Main Parser Entry Point
// ---------------------------------------------------------------------------

export interface ParseAlertOptions {
  sender?: string;
  timestamp?: number;
  customCategoryRules?: Record<string, string>;
  customBanks?: string[];
  allowedSenders?: string[];
}

export function parseAlert(body: string, options?: ParseAlertOptions): ParsedAlert {
  const rawText = body || '';
  const sender = options?.sender || '';
  const cleanBody = normalizeWhitespace(rawText);
  const customBanks = options?.customBanks || options?.allowedSenders || [];
  const senderInfo = parseDltSender(sender, customBanks);

  // Check if message body explicitly mentions a custom bank name
  if (!senderInfo.isKnownBank && customBanks.length > 0) {
    const upperBody = cleanBody.toUpperCase();
    for (const b of customBanks) {
      const upper = b.trim().toUpperCase();
      if (upper && upperBody.includes(upper)) {
        senderInfo.isKnownBank = true;
        if (!senderInfo.bankCode) senderInfo.bankCode = upper;
        break;
      }
    }
  }

  // 1. Negative Filter Check (Reject OTPs, promos, loan offers, mandates, failed txns, bills)
  const isOtp = OTP_PATTERNS.some(p => p.test(cleanBody));
  const isPromo = PROMOTION_PATTERNS.some(p => p.test(cleanBody));
  const isMandate = MANDATE_AND_SCHEDULED_PATTERNS.some(p => p.test(cleanBody));
  const isBalanceOnly = BALANCE_ONLY_PATTERNS.some(p => p.test(cleanBody));
  const isFailed = FAILED_PATTERNS.some(p => p.test(cleanBody));
  const isBillDue = BILL_DUE_PATTERNS.some(p => p.test(cleanBody));

  const isOtpOrPromo = isOtp || isPromo || isMandate || isBalanceOnly || isFailed || isBillDue;

  if (isOtpOrPromo) {
    return {
      amount: null,
      type: 'expense',
      merchant: null,
      merchantNormalized: null,
      accountLast4: null,
      refNo: null,
      timestamp: options?.timestamp || Date.now(),
      channel: 'other',
      balance: null,
      confidence: 0,
      category: 'Others',
      isReversal: false,
      isTransfer: false,
      isAtm: false,
      isOtpOrPromo: true,
      rawText,
      sender,
    };
  }

  // 2. Extract Amount (with Indian grouping; strictly isolates from balance)
  const { amount } = extractAmount(cleanBody);
  const balance = extractBalance(cleanBody);

  // 3. Direction and Special Flags
  const { type, isReversal, isTransfer, isAtm } = extractTypeAndCategory(cleanBody);

  // 4. Channel
  const channel = extractChannel(cleanBody);

  // 5. Account Last 4
  const accountLast4 = extractAccountLast4(cleanBody);

  // 6. Ref No / UTR / RRN
  const refNo = extractRefNo(cleanBody);

  // 7. Merchant & Normalized Payee
  const rawMerchant = extractMerchant(cleanBody, type, channel);
  const merchantNormalized = normalizeMerchant(rawMerchant);

  // 8. Timestamp
  const timestamp = extractInMessageTimestamp(cleanBody, options?.timestamp);

  // 9. Category
  const category = categorizeTransaction(
    merchantNormalized,
    channel,
    type,
    isAtm,
    options?.customCategoryRules
  );

  // 10. Compute Confidence Score (0 to 1)
  let score = 0;

  if (amount !== null && amount > 0) {
    score += 0.35;
  }

  // Clear directional verb
  if (/\b(?:debited|credited|spent|paid|sent|withdrawn|deposited|transferred|dr\.?|cr\.?)\b/i.test(cleanBody)) {
    score += 0.25;
  }

  // Sender authenticity
  if (senderInfo.isKnownBank) {
    score += 0.20;
  } else if (senderInfo.isDlt) {
    score += 0.10;
  } else if (sender) {
    // Unknown sender penalty unless both account & ref are present
    if (!accountLast4 || !refNo) {
      score -= 0.10;
    }
  }

  if (accountLast4) {
    score += 0.10;
  }

  if (refNo) {
    score += 0.05;
  }

  if (merchantNormalized) {
    score += 0.05;
  }

  // Penalize missing amount
  if (amount === null || amount <= 0) {
    score = 0;
  }

  // Clamp confidence between 0.0 and 1.0
  const confidence = Math.max(0, Math.min(1, Math.round(score * 100) / 100));

  return {
    amount,
    type,
    merchant: rawMerchant,
    merchantNormalized,
    accountLast4,
    refNo,
    timestamp,
    channel,
    balance,
    confidence,
    category,
    isReversal,
    isTransfer,
    isAtm,
    isOtpOrPromo: false,
    rawText,
    sender,
  };
}
