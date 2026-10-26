/**
 * Layered, Explainable Transaction Categorizer for Rupeo.
 * Pure TypeScript module with zero heavy external dependencies.
 *
 * PIPELINE ORDER (First confident match wins):
 * 1. User rules: Local + synced map of normalizedMerchant -> category (Highest priority, conf = 1.0)
 * 2. History: Most frequent past category for the same normalized merchant/VPA (>= 2 consistent entries, conf = 0.92)
 * 3. Bill match: Exact amount + provider/keyword match against recurring bills (conf = 0.95)
 * 4. Brand dictionary: Curated India-specific brand token map (conf = 0.94)
 * 5. Keyword rules: Semantic shop and service tokens (e.g. cafe, clinic, fuel, kirana) (conf = 0.88)
 * 6. UPI MCC: Scanned UPI QR or link 'mc=' parameter (conf = 0.90)
 * 7. AI fallback: Server endpoint with ONLY normalized merchant name (optional, default OFF)
 * 8. Weak hints: Time of day, small amounts (slight confidence nudge, never decides alone)
 *
 * Default threshold: 0.85
 * Below 0.85 -> Uncategorized for one-tap review.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { warn } from './logger.ts';
import { safeJsonParse } from './safeStorage.ts';

export type CategorizationSource =
  | 'user_rule'
  | 'history'
  | 'bill_match'
  | 'brand_dict'
  | 'keyword_rule'
  | 'upi_mcc'
  | 'ai_fallback'
  | 'uncategorized';

export interface CategorizationResult {
  category: string;
  confidence: number;
  source: CategorizationSource;
  ruleMatched?: string;
  isAutoAssigned: boolean;
  suggestions: string[];
}

export interface UserMerchantRule {
  normalizedMerchant: string;
  rawMerchant?: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

export interface CategorizationContext {
  userId?: string;
  amount?: number;
  type?: 'expense' | 'income' | 'transfer' | 'debit' | 'credit' | string;
  channel?: string;
  upiUri?: string;
  rawText?: string;
  candidateBills?: Array<{
    title: string;
    amount: number;
    category?: string;
    provider?: string;
  }>;
  historyTransactions?: Array<{
    merchant_name?: string | null;
    merchant?: string | null;
    category?: string | null;
  }>;
  aiFallbackEnabled?: boolean;
  timestamp?: number;
}

export const AUTO_ASSIGN_THRESHOLD = 0.85;
export const UNCATEGORIZED_LABEL = 'Uncategorized';

// Storage Keys
export const USER_RULES_STORAGE_PREFIX = '@rupeo_user_merchant_rules_';
export const AI_CAT_CACHE_STORAGE_KEY = '@rupeo_ai_cat_cache_v1';
export const CATEGORIZATION_SETTINGS_KEY = '@rupeo_categorization_settings_v1';

// In-Memory caches for high-speed synchronous classification
let inMemoryUserRules = new Map<string, string>();
let inMemoryUserRulesUserId: string | null = null;
let inMemoryAiCache = new Map<string, { category: string; confidence: number }>();

// ---------------------------------------------------------------------------
// 1. Merchant Normalization (Shared with parser)
// ---------------------------------------------------------------------------

const HONORIFICS = new Set(['mrs', 'mr', 'miss', 'ms', 'shri', 'smt', 'dr', 'prof', 'master']);
const RELATIONS_REGEX = /\b(?:w\/o|s\/o|d\/o|c\/o|w\s+o|s\s+o|d\s+o|c\s+o)\b/gi;
const UPI_PREFIX_REGEX = /^(?:upi[-/:\s]|vpa[:\s]|to[:\s]|from[:\s]|at[:\s]|paid\s+to[:\s]|sent\s+to[:\s]|info[:\s]|desc[:\s]|towards[:\s]|for[:\s]|by[:\s]|salary\/|billdesk\/|paytm\/)/i;
const UPI_HANDLE_REGEX = /@[a-zA-Z0-9_.-]+$/i;
const PAYTM_QR_REGEX = /\bpaytm-?qr[a-zA-Z0-9]+\b/gi;
const LONG_DIGITS_REGEX = /\b\d{6,}\b/g;

/**
 * Normalizes raw merchant / payee string:
 * - Strips prefixes/suffixes (UPI-, VPA, TO, @ybl, @okaxis, numbers)
 * - Lowercases, collapses whitespace
 * - Strips honorifics (Mrs, Mr, Smt, etc.) and relations (w/o, s/o, d/o)
 * - Returns clean normalized merchant name
 */
export function normalizeMerchant(rawMerchant: string | null | undefined): string {
  if (!rawMerchant) return '';

  let m = String(rawMerchant).trim().toLowerCase();

  // Strip prefixes like "UPI-", "PAID TO", "TO:", "VPA"
  m = m.replace(UPI_PREFIX_REGEX, '');

  // Strip Paytm QR codes
  m = m.replace(PAYTM_QR_REGEX, '');

  // Strip UPI VPA handles (@okaxis, @ybl, @okhdfcbank, @paytm, etc.)
  m = m.replace(UPI_HANDLE_REGEX, '');

  // Strip relation markers (w/o, s/o, d/o)
  m = m.replace(RELATIONS_REGEX, ' ');

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

  // Strip common corporate entity suffixes, but leave domain-specific keywords
  m = m.replace(/(?<!air\s+)\b(?:pvt\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|inc\.?|corp\.?|services|india|order|purchase|subscription|booking)\b/gi, ' ');

  // Strip web domains (.com, .in, etc.)
  m = m.replace(/\.(?:com|in|org|net|co|io)\b/gi, ' ');

  // Strip long trailing reference digits
  m = m.replace(LONG_DIGITS_REGEX, ' ');

  // Remove non-alphanumeric chars except spaces and & / '
  m = m.replace(/[^a-zA-Z0-9\s&']/g, ' ');

  // Tokenize and filter honorifics
  const tokens = m
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && !HONORIFICS.has(t));

  return tokens.join(' ');
}

const COMPOUND_KEYWORDS = [
  'dairy', 'doodh', 'teastall', 'chaistall', 'chaiwala', 'teawala', 'kirana',
  'kiranastore', 'sweetmart', 'mithaiwala', 'fastfood', 'foodcourt', 'bhojanalaya'
];

/**
 * Extracts discrete lower-case word tokens from normalized merchant name
 */
export function getMerchantTokens(normalized: string): string[] {
  if (!normalized) return [];
  const rawTokens = normalized
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length > 0);

  const tokens: string[] = [];
  for (const t of rawTokens) {
    tokens.push(t);
    for (const kw of COMPOUND_KEYWORDS) {
      if (t.length > kw.length && (t.endsWith(kw) || t.startsWith(kw) || t.includes(kw))) {
        if (kw === 'teastall') {
          if (!tokens.includes('tea')) tokens.push('tea');
          if (!tokens.includes('stall')) tokens.push('stall');
        } else if (kw === 'chaistall') {
          if (!tokens.includes('chai')) tokens.push('chai');
          if (!tokens.includes('stall')) tokens.push('stall');
        } else if (kw === 'kiranastore') {
          if (!tokens.includes('kirana')) tokens.push('kirana');
          if (!tokens.includes('store')) tokens.push('store');
        } else {
          if (!tokens.includes(kw)) tokens.push(kw);
        }
      }
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// 2. Curated Brand Dictionary (Tokens Map)
// ---------------------------------------------------------------------------

export interface BrandEntry {
  category: string;
  brandTokens: string[]; // sequence of tokens that uniquely identify the brand
}

export const BRAND_DICTIONARY: BrandEntry[] = [
  // Food & Dining
  { category: 'Food', brandTokens: ['swiggy'] },
  { category: 'Food', brandTokens: ['zomato'] },
  { category: 'Food', brandTokens: ['eatclub'] },
  { category: 'Food', brandTokens: ['behrouz'] },
  { category: 'Food', brandTokens: ['faasos'] },
  { category: 'Food', brandTokens: ['box8'] },
  { category: 'Food', brandTokens: ['dominos'] },
  { category: 'Food', brandTokens: ['domino'] },
  { category: 'Food', brandTokens: ['pizzahut'] },
  { category: 'Food', brandTokens: ['pizza', 'hut'] },
  { category: 'Food', brandTokens: ['mcdonalds'] },
  { category: 'Food', brandTokens: ['mcdonald'] },
  { category: 'Food', brandTokens: ['kfc'] },
  { category: 'Food', brandTokens: ['burgerking'] },
  { category: 'Food', brandTokens: ['burger', 'king'] },
  { category: 'Food', brandTokens: ['subway'] },
  { category: 'Food', brandTokens: ['haldirams'] },
  { category: 'Food', brandTokens: ['haldiram'] },
  { category: 'Food', brandTokens: ['bikanervala'] },
  { category: 'Food', brandTokens: ['bikano'] },
  { category: 'Food', brandTokens: ['chaayos'] },
  { category: 'Food', brandTokens: ['chaipoint'] },
  { category: 'Food', brandTokens: ['chai', 'point'] },
  { category: 'Coffee', brandTokens: ['starbucks'] },
  { category: 'Coffee', brandTokens: ['bluetokai'] },
  { category: 'Coffee', brandTokens: ['blue', 'tokai'] },
  { category: 'Coffee', brandTokens: ['thirdwave'] },
  { category: 'Coffee', brandTokens: ['third', 'wave'] },
  { category: 'Food', brandTokens: ['ovenstory'] },
  { category: 'Food', brandTokens: ['rebelfoods'] },
  { category: 'Food', brandTokens: ['wendys'] },
  { category: 'Food', brandTokens: ['tacobell'] },
  { category: 'Food', brandTokens: ['taco', 'bell'] },
  { category: 'Dining', brandTokens: ['barbequenation'] },
  { category: 'Dining', brandTokens: ['barbeque', 'nation'] },
  { category: 'Food', brandTokens: ['wowmomo'] },
  { category: 'Food', brandTokens: ['wow', 'momo'] },
  { category: 'Food', brandTokens: ['freshmenu'] },
  { category: 'Food', brandTokens: ['biryanibykilo'] },
  { category: 'Food', brandTokens: ['madoverdonuts'] },
  { category: 'Food', brandTokens: ['dunkin'] },
  { category: 'Food', brandTokens: ['theobroma'] },

  // Groceries & Supermarkets
  { category: 'Groceries', brandTokens: ['blinkit'] },
  { category: 'Groceries', brandTokens: ['zepto'] },
  { category: 'Groceries', brandTokens: ['instamart'] },
  { category: 'Groceries', brandTokens: ['bigbasket'] },
  { category: 'Groceries', brandTokens: ['bbdaily'] },
  { category: 'Groceries', brandTokens: ['dmart'] },
  { category: 'Groceries', brandTokens: ['spencers'] },
  { category: 'Groceries', brandTokens: ['naturesbasket'] },
  { category: 'Groceries', brandTokens: ['nature', 'basket'] },
  { category: 'Groceries', brandTokens: ['countrydelight'] },
  { category: 'Groceries', brandTokens: ['country', 'delight'] },
  { category: 'Groceries', brandTokens: ['milkbasket'] },
  { category: 'Groceries', brandTokens: ['motherdairy'] },
  { category: 'Groceries', brandTokens: ['mother', 'dairy'] },
  { category: 'Groceries', brandTokens: ['amul'] },
  { category: 'Groceries', brandTokens: ['patanjali'] },
  { category: 'Groceries', brandTokens: ['moreretail'] },
  { category: 'Groceries', brandTokens: ['reliance', 'fresh'] },
  { category: 'Groceries', brandTokens: ['reliance', 'smart'] },
  { category: 'Groceries', brandTokens: ['smart', 'bazaar'] },

  // Travel, Commute, Fuel
  { category: 'Travel', brandTokens: ['uber'] },
  { category: 'Travel', brandTokens: ['ola'] },
  { category: 'Travel', brandTokens: ['rapido'] },
  { category: 'Travel', brandTokens: ['irctc'] },
  { category: 'Travel', brandTokens: ['makemytrip'] },
  { category: 'Travel', brandTokens: ['goibibo'] },
  { category: 'Travel', brandTokens: ['yatra'] },
  { category: 'Travel', brandTokens: ['indigo'] },
  { category: 'Travel', brandTokens: ['airindia'] },
  { category: 'Travel', brandTokens: ['air', 'india'] },
  { category: 'Travel', brandTokens: ['vistara'] },
  { category: 'Travel', brandTokens: ['akasa'] },
  { category: 'Travel', brandTokens: ['spicejet'] },
  { category: 'Travel', brandTokens: ['redbus'] },
  { category: 'Travel', brandTokens: ['abhibus'] },
  { category: 'Travel', brandTokens: ['chalo'] },
  { category: 'Travel', brandTokens: ['fastag'] },
  { category: 'Travel', brandTokens: ['netc'] },
  { category: 'Travel', brandTokens: ['nhai'] },
  { category: 'Travel', brandTokens: ['toll'] },
  { category: 'Travel', brandTokens: ['dmrc'] },
  { category: 'Travel', brandTokens: ['bmrc'] },
  { category: 'Travel', brandTokens: ['mmrda'] },
  { category: 'Travel', brandTokens: ['cmrl'] },
  { category: 'Travel', brandTokens: ['cleartrip'] },
  { category: 'Travel', brandTokens: ['ixigo'] },
  { category: 'Travel', brandTokens: ['easemytrip'] },

  // Fuel
  { category: 'Fuel', brandTokens: ['indianoil'] },
  { category: 'Fuel', brandTokens: ['indian', 'oil'] },
  { category: 'Fuel', brandTokens: ['iocl'] },
  { category: 'Fuel', brandTokens: ['bharatpetroleum'] },
  { category: 'Fuel', brandTokens: ['bharat', 'petroleum'] },
  { category: 'Fuel', brandTokens: ['bpcl'] },
  { category: 'Fuel', brandTokens: ['hindustanpetroleum'] },
  { category: 'Fuel', brandTokens: ['hindustan', 'petroleum'] },
  { category: 'Fuel', brandTokens: ['hpcl'] },
  { category: 'Fuel', brandTokens: ['shell'] },
  { category: 'Fuel', brandTokens: ['nayara'] },
  { category: 'Fuel', brandTokens: ['jiobp'] },
  { category: 'Fuel', brandTokens: ['jio', 'bp'] },

  // Shopping & E-Commerce
  { category: 'Shopping', brandTokens: ['amazon'] },
  { category: 'Shopping', brandTokens: ['flipkart'] },
  { category: 'Shopping', brandTokens: ['myntra'] },
  { category: 'Shopping', brandTokens: ['ajio'] },
  { category: 'Shopping', brandTokens: ['meesho'] },
  { category: 'Shopping', brandTokens: ['nykaa'] },
  { category: 'Shopping', brandTokens: ['tatacliq'] },
  { category: 'Shopping', brandTokens: ['tata', 'cliq'] },
  { category: 'Shopping', brandTokens: ['zara'] },
  { category: 'Shopping', brandTokens: ['hnm'] },
  { category: 'Shopping', brandTokens: ['decathlon'] },
  { category: 'Shopping', brandTokens: ['croma'] },
  { category: 'Shopping', brandTokens: ['reliancedigital'] },
  { category: 'Shopping', brandTokens: ['reliance', 'digital'] },
  { category: 'Shopping', brandTokens: ['vijaysales'] },
  { category: 'Shopping', brandTokens: ['vijay', 'sales'] },
  { category: 'Shopping', brandTokens: ['ikea'] },
  { category: 'Shopping', brandTokens: ['lenskart'] },
  { category: 'Shopping', brandTokens: ['westside'] },
  { category: 'Shopping', brandTokens: ['pantaloons'] },
  { category: 'Shopping', brandTokens: ['shoppersstop'] },
  { category: 'Shopping', brandTokens: ['shoppers', 'stop'] },
  { category: 'Shopping', brandTokens: ['urbanic'] },
  { category: 'Shopping', brandTokens: ['bewakoof'] },
  { category: 'Shopping', brandTokens: ['snitch'] },
  { category: 'Shopping', brandTokens: ['uniqlo'] },
  { category: 'Shopping', brandTokens: ['zudio'] },
  { category: 'Shopping', brandTokens: ['fabindia'] },
  { category: 'Shopping', brandTokens: ['firstcry'] },

  // Bills & Telecom / DTH / Broadband
  { category: 'Bills', brandTokens: ['airtel'] },
  { category: 'Bills', brandTokens: ['jio'] },
  { category: 'Bills', brandTokens: ['vodafone'] },
  { category: 'Bills', brandTokens: ['bsnl'] },
  { category: 'Bills', brandTokens: ['tataplay'] },
  { category: 'Bills', brandTokens: ['tata', 'play'] },
  { category: 'Bills', brandTokens: ['tatasky'] },
  { category: 'Bills', brandTokens: ['tata', 'sky'] },
  { category: 'Bills', brandTokens: ['dishtv'] },
  { category: 'Bills', brandTokens: ['dish', 'tv'] },
  { category: 'Bills', brandTokens: ['sundirect'] },
  { category: 'Bills', brandTokens: ['sun', 'direct'] },
  { category: 'Bills', brandTokens: ['actfibernet'] },
  { category: 'Bills', brandTokens: ['act', 'fibernet'] },
  { category: 'Bills', brandTokens: ['hathway'] },
  { category: 'Bills', brandTokens: ['excitel'] },

  // Utilities: Electricity / Gas / Water
  { category: 'Utilities', brandTokens: ['bescom'] },
  { category: 'Utilities', brandTokens: ['tatapower'] },
  { category: 'Utilities', brandTokens: ['tata', 'power'] },
  { category: 'Utilities', brandTokens: ['adani', 'electricity'] },
  { category: 'Utilities', brandTokens: ['torrent', 'power'] },
  { category: 'Utilities', brandTokens: ['cesc'] },
  { category: 'Utilities', brandTokens: ['mseb'] },
  { category: 'Utilities', brandTokens: ['msedcl'] },
  { category: 'Utilities', brandTokens: ['dhbvn'] },
  { category: 'Utilities', brandTokens: ['uppcl'] },
  { category: 'Utilities', brandTokens: ['pspcl'] },
  { category: 'Utilities', brandTokens: ['bses'] },
  { category: 'Utilities', brandTokens: ['igl'] },
  { category: 'Utilities', brandTokens: ['mgl'] },
  { category: 'Utilities', brandTokens: ['mahanagar', 'gas'] },
  { category: 'Utilities', brandTokens: ['indraprastha', 'gas'] },
  { category: 'Utilities', brandTokens: ['gujarat', 'gas'] },
  { category: 'Utilities', brandTokens: ['indane'] },

  // Subscriptions & Streaming
  { category: 'Subscriptions', brandTokens: ['netflix'] },
  { category: 'Subscriptions', brandTokens: ['hotstar'] },
  { category: 'Subscriptions', brandTokens: ['spotify'] },
  { category: 'Subscriptions', brandTokens: ['youtube'] },
  { category: 'Subscriptions', brandTokens: ['prime', 'video'] },
  { category: 'Subscriptions', brandTokens: ['sonyliv'] },
  { category: 'Subscriptions', brandTokens: ['sony', 'liv'] },
  { category: 'Subscriptions', brandTokens: ['zee5'] },
  { category: 'Subscriptions', brandTokens: ['jiocinema'] },
  { category: 'Subscriptions', brandTokens: ['jio', 'cinema'] },
  { category: 'Subscriptions', brandTokens: ['audible'] },
  { category: 'Subscriptions', brandTokens: ['gaana'] },

  // Entertainment: Movies & Events
  { category: 'Entertainment', brandTokens: ['bookmyshow'] },
  { category: 'Entertainment', brandTokens: ['book', 'my', 'show'] },
  { category: 'Entertainment', brandTokens: ['pvr'] },
  { category: 'Entertainment', brandTokens: ['inox'] },
  { category: 'Entertainment', brandTokens: ['cinepolis'] },

  // Health & Pharmacy
  { category: 'Health', brandTokens: ['apollo'] },
  { category: 'Health', brandTokens: ['pharmeasy'] },
  { category: 'Health', brandTokens: ['1mg'] },
  { category: 'Health', brandTokens: ['tata1mg'] },
  { category: 'Health', brandTokens: ['tata', '1mg'] },
  { category: 'Health', brandTokens: ['netmeds'] },
  { category: 'Health', brandTokens: ['medplus'] },
  { category: 'Health', brandTokens: ['practo'] },
  { category: 'Health', brandTokens: ['lalpathlabs'] },
  { category: 'Health', brandTokens: ['lal', 'pathlabs'] },
  { category: 'Health', brandTokens: ['metropolis'] },
  { category: 'Health', brandTokens: ['maxhealthcare'] },
  { category: 'Health', brandTokens: ['fortis'] },
  { category: 'Health', brandTokens: ['manipal'] },

  // Education
  { category: 'Education', brandTokens: ['coursera'] },
  { category: 'Education', brandTokens: ['udemy'] },
  { category: 'Education', brandTokens: ['unacademy'] },
  { category: 'Education', brandTokens: ['physicswallah'] },
  { category: 'Education', brandTokens: ['byjus'] },
  { category: 'Education', brandTokens: ['simplilearn'] },
  { category: 'Education', brandTokens: ['duolingo'] },
  { category: 'Education', brandTokens: ['vedantu'] },

  // Fitness
  { category: 'Fitness', brandTokens: ['cultfit'] },
  { category: 'Fitness', brandTokens: ['cult', 'fit'] },
  { category: 'Fitness', brandTokens: ['cult'] },
  { category: 'Fitness', brandTokens: ['curefit'] },
  { category: 'Fitness', brandTokens: ['anytimefitness'] },
  { category: 'Fitness', brandTokens: ['anytime', 'fitness'] },
  // Additional Groceries / Shopping / Subscriptions
  { category: 'Groceries', brandTokens: ['bb', 'daily'] },
  { category: 'Groceries', brandTokens: ['natures', 'basket'] },
  { category: 'Shopping', brandTokens: ['h', 'm'] },
  { category: 'Shopping', brandTokens: ['hm'] },
  { category: 'Shopping', brandTokens: ['hennes', 'mauritz'] },
  { category: 'Subscriptions', brandTokens: ['amazon', 'prime'] },
];

// Pre-sort brand dictionary so multi-token brands (e.g. 'prime video', 'amazon prime') match before single token brands ('amazon')
export const SORTED_BRAND_DICTIONARY: BrandEntry[] = [...BRAND_DICTIONARY].sort(
  (a, b) => b.brandTokens.length - a.brandTokens.length
);

// ---------------------------------------------------------------------------
// 3. Keyword Semantic Rules (Token-based)
// ---------------------------------------------------------------------------

export interface KeywordRule {
  category: string;
  tokens: string[];
}

export const KEYWORD_RULES: KeywordRule[] = [
  // Food & Dining
  {
    category: 'Food',
    tokens: [
      'chat', 'chaat', 'cafe', 'cafeteria', 'dhaba', 'bakery', 'bakes', 'bake',
      'restaurant', 'hotel', 'juice', 'sweets', 'sweet', 'mithai', 'bhojanalaya',
      'tiffin', 'canteen', 'kitchen', 'bistro', 'bar', 'pub', 'eatery', 'pizza',
      'burger', 'biryani', 'chai', 'tea', 'coffee', 'shawarma', 'rolls', 'dosa',
      'idli', 'chole', 'samosa', 'paratha', 'momos', 'icecream', 'nashta', 'rasoi',
      'stall', 'corner', 'tapri', 'thela', 'point', 'fastfood', 'foodcourt', 'food',
      'dining', 'snack', 'snacks', 'refreshment', 'refreshments', 'mess', 'bhojan',
      'bhojnalay', 'thali', 'namkeen', 'farsan', 'halwai', 'mithaiwala', 'chaiwala',
      'teawala', 'cake', 'cakes', 'pastry', 'pastries', 'baker', 'kulfi', 'falooda',
      'shake', 'shakes', 'sandwich', 'momo', 'panipuri', 'golgappa', 'poha', 'kachori', 'paan'
    ],
  },
  // Health & Medicine
  {
    category: 'Health',
    tokens: [
      'medical', 'medicals', 'pharmacy', 'clinic', 'hospital', 'chemist', 'pathology',
      'diagnostics', 'labs', 'doctor', 'healthcare', 'meds', 'dispensary', 'dental',
      'eyecare', 'optical', 'opticals', 'druggist', 'ayurveda', 'homeopathy',
      'dawa', 'dawakhana', 'medico', 'medicos', 'pharma', 'wellness'
    ],
  },
  // Lifestyle / Personal Care (Mapped to Shopping per app's category list)
  {
    category: 'Shopping',
    tokens: [
      'salon', 'saloon', 'studio', 'parlour', 'parlor', 'spa', 'barber', 'hair',
      'beauty', 'makeover', 'tattoo', 'boutique', 'tailor', 'fashion', 'jewellers',
      'jeweller', 'jewellery', 'apparel', 'garments', 'footwear', 'clothing', 'dresses'
    ],
  },
  // Fuel
  {
    category: 'Fuel',
    tokens: [
      'petrol', 'fuel', 'diesel', 'cng', 'hp', 'iocl', 'bpcl', 'gasoline', 'auto fuels'
    ],
  },
  // Groceries & Provisions
  {
    category: 'Groceries',
    tokens: [
      'kirana', 'mart', 'supermarket', 'fresh', 'provision', 'provisions', 'bazaar',
      'bazar', 'hypermarket', 'dairy', 'doodh', 'vegetables', 'fruits', 'sabzi',
      'mandi', 'ration', 'grocery', 'milk', 'milkbooth', 'paneer', 'curd', 'lassi',
      'butter', 'ghee', 'sabji', 'bhaji', 'vegetable', 'fruit', 'tarkari', 'meat',
      'chicken', 'mutton', 'fish', 'egg', 'eggs', 'masala', 'spices', 'dryfruits', 'dailyneeds'
    ],
  },
  // Bills & Utilities
  {
    category: 'Bills',
    tokens: [
      'recharge', 'broadband', 'bill', 'bills', 'dth', 'postpaid', 'prepaid',
      'electricity', 'bijli', 'water', 'cable', 'telecom', 'fibernet', 'wifi'
    ],
  },
  // Fitness
  {
    category: 'Fitness',
    tokens: ['gym', 'fitness', 'workout', 'crossfit', 'yoga', 'pilates', 'badminton'],
  },
  // Entertainment
  {
    category: 'Entertainment',
    tokens: ['cinema', 'multiplex', 'theatre', 'theater', 'movie', 'movies', 'film']
  },
  // Education
  {
    category: 'Education',
    tokens: ['school', 'college', 'university', 'tuition', 'coaching', 'classes', 'academy', 'vidyapeeth', 'books', 'stationery']
  },
  // Rent
  {
    category: 'Rent',
    tokens: ['rent', 'maintenance', 'society', 'pg', 'hostel']
  },
];

// ---------------------------------------------------------------------------
// 4. UPI MCC Mapping (Merchant Category Codes)
// ---------------------------------------------------------------------------

export const UPI_MCC_MAP: Record<string, string> = {
  // Food & Dining
  '5812': 'Food', // Restaurants, Dining
  '5814': 'Food', // Fast Food, Quick Service
  '5813': 'Food', // Bars, Taverns, Lounges
  '5811': 'Food', // Caterers
  '5462': 'Food', // Bakeries

  // Groceries & Supermarkets
  '5411': 'Groceries', // Grocery Stores, Supermarkets
  '5422': 'Groceries', // Meat Markets, Freezer
  '5441': 'Groceries', // Candy, Nut, Confectionery
  '5451': 'Groceries', // Dairy Products
  '5499': 'Groceries', // Misc Food Stores, Convenience

  // Fuel & Service Stations
  '5541': 'Fuel', // Service Stations
  '5542': 'Fuel', // Automated Fuel Dispensers
  '5983': 'Fuel', // Fuel Dealers

  // Lifestyle / Personal Services (Shopping in Rupeo)
  '7230': 'Shopping', // Barber & Beauty Shops
  '7298': 'Shopping', // Health & Beauty Spas
  '7297': 'Shopping', // Massage Parlors
  '7216': 'Shopping', // Dry Cleaners

  // Health & Medical
  '8011': 'Health', // Doctors, Physicians
  '8021': 'Health', // Dentists, Orthodontists
  '8042': 'Health', // Optometrists, Ophthalmologists
  '8062': 'Health', // Hospitals
  '8099': 'Health', // Medical Services
  '5912': 'Health', // Drug Stores & Pharmacies

  // Travel & Transport
  '4111': 'Travel', // Commuter Transport, Railways
  '4121': 'Travel', // Taxicabs, Rideshares
  '4131': 'Travel', // Bus Lines
  '4511': 'Travel', // Airlines, Air Carriers
  '4789': 'Travel', // Transport Services

  // Bills & Utilities
  '4814': 'Bills', // Telecom / Cell Phone Service
  '4899': 'Bills', // Cable, Satellite, Pay TV
  '4900': 'Utilities', // Electric, Gas, Water Utilities

  // Retail & Shopping
  '5311': 'Shopping', // Department Stores
  '5651': 'Shopping', // Family Clothing
  '5691': 'Shopping', // Men's & Women's Clothing
  '5944': 'Shopping', // Jewelry Stores
  '5999': 'Shopping', // Misc Retail

  // Entertainment
  '7832': 'Entertainment', // Motion Picture Theaters
  '7991': 'Entertainment', // Tourist Attractions
  '7996': 'Entertainment', // Amusement Parks
  '7999': 'Entertainment', // Recreation Services

  // Education
  '8211': 'Education', // Elementary & Secondary Schools
  '8220': 'Education', // Colleges, Universities
  '8299': 'Education', // Schools & Educational Services
};

/**
 * Extracts UPI MCC from a URI string or text (e.g. "mc=5812" or "mc=5411")
 */
export function extractUpiMcc(input?: string): string | null {
  if (!input) return null;
  const match = input.match(/[?&]mc=([0-9]{4})\b/i) || input.match(/\bmc=([0-9]{4})\b/i);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// 5. User Rules Management (Local + Sync)
// ---------------------------------------------------------------------------

export function setInMemoryUserRules(rules: Record<string, string>, userId = 'test'): void {
  inMemoryUserRules = new Map(Object.entries(rules));
  inMemoryUserRulesUserId = userId;
}

export function clearInMemoryUserRules(): void {
  inMemoryUserRules.clear();
  inMemoryUserRulesUserId = null;
}

export async function getUserRules(userId?: string): Promise<Record<string, string>> {
  const uid = userId || 'local';
  if (inMemoryUserRulesUserId === uid && inMemoryUserRules.size > 0) {
    const res: Record<string, string> = {};
    inMemoryUserRules.forEach((v, k) => {
      res[k] = v;
    });
    return res;
  }

  try {
    const rulesKey = `${USER_RULES_STORAGE_PREFIX}${uid}`;
    const raw = await AsyncStorage.getItem(rulesKey);
    if (raw) {
      const parsed = safeJsonParse<Record<string, string>>(raw, {}, rulesKey, (v) => typeof v === 'object' && v !== null);
      inMemoryUserRules = new Map(Object.entries(parsed));
      inMemoryUserRulesUserId = uid;
      return parsed;
    }
  } catch (e) {
    warn('Failed to load user merchant rules from storage:', e);
  }

  return {};
}

export async function saveUserRule(
  rawMerchant: string,
  category: string,
  userId?: string
): Promise<void> {
  const normalized = normalizeMerchant(rawMerchant);
  if (!normalized || !category || category === UNCATEGORIZED_LABEL) return;

  const uid = userId || 'local';
  inMemoryUserRules.set(normalized, category);
  inMemoryUserRulesUserId = uid;

  try {
    const current = await getUserRules(uid);
    current[normalized] = category;
    await AsyncStorage.setItem(
      `${USER_RULES_STORAGE_PREFIX}${uid}`,
      JSON.stringify(current)
    );
    await AsyncStorage.setItem(
      `${USER_RULES_STORAGE_PREFIX}global`,
      JSON.stringify(current)
    );
  } catch (e) {
    warn('Failed to persist user rule to AsyncStorage:', e);
  }

  try {
    const { saveUserRuleToSQLite } = require('../features/autoAdd/sqliteStorage.ts');
    saveUserRuleToSQLite(normalized, category, uid);
  } catch {}
}

/**
 * Initializes and hydrates in-memory user rules from AsyncStorage and SQLite.
 */
export async function initUserRules(userId?: string): Promise<void> {
  const uid = userId || 'local';
  try {
    const rulesKey = `${USER_RULES_STORAGE_PREFIX}${uid}`;
    const raw = await AsyncStorage.getItem(rulesKey);
    if (raw) {
      const parsed = safeJsonParse<Record<string, string>>(raw, {}, rulesKey, (v) => typeof v === 'object' && v !== null);
      for (const [k, v] of Object.entries(parsed)) {
        inMemoryUserRules.set(k, v);
      }
    }
    const globalRaw = await AsyncStorage.getItem(`${USER_RULES_STORAGE_PREFIX}global`);
    if (globalRaw) {
      const parsed = safeJsonParse<Record<string, string>>(globalRaw, {}, 'global_rules', (v) => typeof v === 'object' && v !== null);
      for (const [k, v] of Object.entries(parsed)) {
        if (!inMemoryUserRules.has(k)) {
          inMemoryUserRules.set(k, v);
        }
      }
    }
  } catch (e) {
    warn('Failed to load user rules from AsyncStorage:', e);
  }

  try {
    const { getAllUserRulesFromSQLite } = require('../features/autoAdd/sqliteStorage.ts');
    const sqliteRules = getAllUserRulesFromSQLite();
    for (const [k, v] of Object.entries(sqliteRules)) {
      if (!inMemoryUserRules.has(k)) {
        inMemoryUserRules.set(k, v);
      }
    }
  } catch {}
}

export async function deleteUserRule(
  normalizedMerchant: string,
  userId?: string
): Promise<void> {
  const norm = normalizedMerchant.trim().toLowerCase();
  const uid = userId || 'local';
  const current = await getUserRules(uid);
  delete current[norm];

  inMemoryUserRules.delete(norm);

  try {
    await AsyncStorage.setItem(
      `${USER_RULES_STORAGE_PREFIX}${uid}`,
      JSON.stringify(current)
    );
  } catch (e) {
    warn('Failed to delete user rule from AsyncStorage:', e);
  }
}

// ---------------------------------------------------------------------------
// 6. Core Layered Classifier
// ---------------------------------------------------------------------------

/**
 * Checks whether an array of merchant tokens contains the consecutive brand tokens
 */
function matchesBrandTokens(merchantTokens: string[], brandTokens: string[]): boolean {
  if (brandTokens.length === 0 || merchantTokens.length < brandTokens.length) {
    return false;
  }
  for (let i = 0; i <= merchantTokens.length - brandTokens.length; i++) {
    let match = true;
    for (let j = 0; j < brandTokens.length; j++) {
      if (merchantTokens[i + j] !== brandTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Classifies an incoming transaction through the 8-layer pipeline.
 * Deterministic, explainable, and returns { category, confidence, source, isAutoAssigned }.
 */
export function classifyTransaction(
  rawMerchant: string | null | undefined,
  context?: CategorizationContext
): CategorizationResult {
  const normalized = normalizeMerchant(rawMerchant);
  const merchantTokens = getMerchantTokens(normalized);

  // Default fallback suggestions
  const defaultSuggestions = ['Food', 'Groceries', 'Shopping', 'Travel', 'Bills'];

  // Income / Transfer Directional Checks
  const typeStr = String(context?.type || '').toLowerCase();
  const isIncome = typeStr === 'income' || typeStr === 'credit';
  const isTransfer = typeStr === 'transfer';

  if (isIncome) {
    if (normalized && /salary|payroll|employer/i.test(normalized)) {
      return {
        category: 'Salary',
        confidence: 0.98,
        source: 'brand_dict',
        ruleMatched: 'salary_payroll',
        isAutoAssigned: true,
        suggestions: ['Salary', 'Income', 'Freelance', 'Investments', 'Savings'],
      };
    }
    return {
      category: 'Income',
      confidence: 0.95,
      source: 'brand_dict',
      ruleMatched: 'credit_income',
      isAutoAssigned: true,
      suggestions: ['Income', 'Salary', 'Cashback', 'Investments', 'Freelance'],
    };
  }

  if (isTransfer) {
    return {
      category: 'Others',
      confidence: 0.95,
      source: 'brand_dict',
      ruleMatched: 'account_transfer',
      isAutoAssigned: true,
      suggestions: ['Others', 'Friend', 'Bills', 'Investments', 'EMI'],
    };
  }

  // LAYER 1: User Rules (Highest Priority)
  if (normalized) {
    let cat = inMemoryUserRules.get(normalized);
    if (!cat) {
      // Substring / partial match on user rules
      for (const [ruleMerchant, ruleCat] of inMemoryUserRules.entries()) {
        if (ruleMerchant && (normalized === ruleMerchant || normalized.includes(ruleMerchant) || ruleMerchant.includes(normalized))) {
          cat = ruleCat;
          break;
        }
      }
    }
    // Also try SQLite user rules if not in memory
    if (!cat) {
      try {
        const { getUserRuleFromSQLite } = require('../features/autoAdd/sqliteStorage.ts');
        cat = getUserRuleFromSQLite(normalized) || undefined;
      } catch {}
    }

    if (cat) {
      return {
        category: cat,
        confidence: 1.0,
        source: 'user_rule',
        ruleMatched: `user_rule:${normalized}`,
        isAutoAssigned: true,
        suggestions: [cat, ...defaultSuggestions.filter(s => s !== cat)].slice(0, 5),
      };
    }
  }

  // LAYER 2: History (>= 1 consistent past entry)
  if (normalized) {
    let historyList = context?.historyTransactions;
    if (!historyList || historyList.length === 0) {
      try {
        const { getAutoAddDatabase } = require('../features/autoAdd/sqliteStorage.ts');
        const db = getAutoAddDatabase();
        if (db) {
          const rows = db.getAllSync<{ merchant: string; category: string }>(
            `SELECT merchant, category FROM auto_added_transactions 
             WHERE (LOWER(merchant) = ? OR LOWER(merchant) LIKE ? OR ? LIKE '%' || LOWER(merchant) || '%')
               AND category IS NOT NULL 
               AND category != ? 
               AND category != 'Others'
             ORDER BY timestamp DESC LIMIT 10;`,
            [normalized, `%${normalized}%`, normalized, UNCATEGORIZED_LABEL]
          );
          if (rows && rows.length > 0) {
            historyList = rows.map((r: { merchant: string; category: string }) => ({ merchant_name: r.merchant, category: r.category }));
          }
        }
      } catch {}
    }

    if (historyList && historyList.length > 0) {
      const counts = new Map<string, number>();
      let totalMatches = 0;

      for (const tx of historyList) {
        const txNorm = normalizeMerchant(tx.merchant_name || tx.merchant);
        if (
          txNorm &&
          (txNorm === normalized || normalized.includes(txNorm) || txNorm.includes(normalized)) &&
          tx.category &&
          tx.category !== UNCATEGORIZED_LABEL &&
          tx.category !== 'Others'
        ) {
          counts.set(tx.category, (counts.get(tx.category) || 0) + 1);
          totalMatches++;
        }
      }

      if (totalMatches >= 1) {
        let topCategory = '';
        let topCount = 0;
        counts.forEach((count, cat) => {
          if (count > topCount) {
            topCount = count;
            topCategory = cat;
          }
        });

        // If single entry: 100% agreement -> confidence 0.90.
        // If >= 2 entries: require strict majority (> 50%) -> confidence 0.92.
        const hasMajority = totalMatches === 1 || topCount / totalMatches > 0.5;
        if (topCount >= 1 && hasMajority) {
          const conf = totalMatches >= 2 ? 0.92 : 0.90;
          return {
            category: topCategory,
            confidence: conf,
            source: 'history',
            ruleMatched: `history:${topCount}/${totalMatches}`,
            isAutoAssigned: true,
            suggestions: [topCategory, ...defaultSuggestions.filter(s => s !== topCategory)].slice(0, 5),
          };
        }
      }
    }
  }

  // LAYER 3: Bill Match (Exact amount + recurring bill provider/keyword)
  if (context?.candidateBills && context.candidateBills.length > 0 && context.amount) {
    for (const bill of context.candidateBills) {
      if (bill && bill.amount && Math.abs(bill.amount - context.amount) < 0.01) {
        const billTitleNorm = normalizeMerchant(bill.title || bill.provider);
        const billTokens = getMerchantTokens(billTitleNorm);
        const hasKeywordMatch =
          matchesBrandTokens(merchantTokens, billTokens) ||
          (billTokens.length > 0 && merchantTokens.some(t => billTokens.includes(t)));

        if (hasKeywordMatch) {
          const cat = bill.category || 'Bills';
          return {
            category: cat,
            confidence: 0.95,
            source: 'bill_match',
            ruleMatched: `bill:${bill.title}`,
            isAutoAssigned: true,
            suggestions: [cat, 'Bills', 'Utilities', 'Subscriptions', 'Rent'],
          };
        }
      }
    }
  }

  // LAYER 4: Curated Brand Dictionary (Token-based matching)
  if (merchantTokens.length > 0) {
    for (const entry of SORTED_BRAND_DICTIONARY) {
      if (matchesBrandTokens(merchantTokens, entry.brandTokens)) {
        return {
          category: entry.category,
          confidence: 0.94,
          source: 'brand_dict',
          ruleMatched: `brand:${entry.brandTokens.join(' ')}`,
          isAutoAssigned: true,
          suggestions: [entry.category, ...defaultSuggestions.filter(s => s !== entry.category)].slice(0, 5),
        };
      }
    }
  }

  // LAYER 5: Keyword Rules (Discrete token lookup)
  if (merchantTokens.length > 0) {
    for (const rule of KEYWORD_RULES) {
      for (const token of rule.tokens) {
        if (merchantTokens.includes(token)) {
          return {
            category: rule.category,
            confidence: 0.88,
            source: 'keyword_rule',
            ruleMatched: `keyword:${token}`,
            isAutoAssigned: true,
            suggestions: [rule.category, ...defaultSuggestions.filter(s => s !== rule.category)].slice(0, 5),
          };
        }
      }
    }
  }

  // LAYER 6: UPI MCC (Merchant Category Code)
  const mcc = extractUpiMcc(context?.upiUri || context?.rawText);
  if (mcc && UPI_MCC_MAP[mcc]) {
    const cat = UPI_MCC_MAP[mcc];
    return {
      category: cat,
      confidence: 0.90,
      source: 'upi_mcc',
      ruleMatched: `mcc:${mcc}`,
      isAutoAssigned: true,
      suggestions: [cat, ...defaultSuggestions.filter(s => s !== cat)].slice(0, 5),
    };
  }

  // LAYER 7: AI Fallback (Cached lookup or server endpoint, default OFF)
  if (context?.aiFallbackEnabled && normalized) {
    if (inMemoryAiCache.has(normalized)) {
      const cached = inMemoryAiCache.get(normalized)!;
      if (cached.confidence >= AUTO_ASSIGN_THRESHOLD) {
        return {
          category: cached.category,
          confidence: cached.confidence,
          source: 'ai_fallback',
          ruleMatched: `ai_cached:${normalized}`,
          isAutoAssigned: true,
          suggestions: [cached.category, ...defaultSuggestions.filter(s => s !== cached.category)].slice(0, 5),
        };
      }
    }
  }

  // LAYER 8: Weak Hints Adjustment (Can nudge confidence slightly, never decides alone)
  // Person-name detection: 2-3 words with no commercial tokens
  // If merchant has no signals, it stays Uncategorized with low confidence
  return {
    category: UNCATEGORIZED_LABEL,
    confidence: 0.20,
    source: 'uncategorized',
    isAutoAssigned: false,
    suggestions: defaultSuggestions,
  };
}

/**
 * Top 5 suggestions generator based on context and popular categories
 */
export function getTopCategorySuggestions(
  currentCategory?: string | null,
  allCategories?: string[]
): string[] {
  const fallback = ['Food', 'Groceries', 'Dining', 'Shopping', 'Travel', 'Fuel', 'Bills', 'Utilities', 'Health', 'Entertainment'];
  const pool = allCategories && allCategories.length > 0 ? allCategories : fallback;
  const result: string[] = [];

  if (currentCategory && pool.includes(currentCategory)) {
    result.push(currentCategory);
  }

  for (const cat of pool) {
    if (!result.includes(cat) && cat !== UNCATEGORIZED_LABEL) {
      result.push(cat);
      if (result.length >= 5) break;
    }
  }

  return result;
}
