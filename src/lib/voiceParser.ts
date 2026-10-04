/**
 * Rupeo Voice Transaction Parser
 * Rule-based local NLP parser for Hindi, English, and Hinglish speech.
 * Converts spoken phrases into structured transactions without any paid API.
 */

export interface ParsedVoiceTransaction {
  amount: number | null;
  amountText?: string;
  type: 'debit' | 'credit'; // 'debit' = expense, 'credit' = income
  category: string;
  note: string;
  friendName?: string;
  isUdhar?: boolean;
  paymentMode?: 'UPI' | 'Cash' | 'Bank' | 'Card';
  confidence: number; // 0 to 1
  rawTranscript: string;
}

export interface CategoryRule {
  category: string;
  type?: 'debit' | 'credit';
  keywords: string[];
}

/**
 * Easily extensible Category Keyword Mapping
 * Add new keywords or categories here to enhance voice classification.
 */
export const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'Food',
    type: 'debit',
    keywords: [
      'chai', 'tea', 'coffee', 'khana', 'nashta', 'lunch', 'dinner', 'breakfast',
      'samosa', 'maggi', 'zomato', 'swiggy', 'restaurant', 'cafe', 'pizza', 'burger',
      'biryani', 'roti', 'sabzi', 'grocery', 'ration', 'kirana', 'dukan', 'doodh',
      'milk', 'paneer', 'mithai', 'sweet', 'sweets', 'snack', 'snacks', 'fast food',
      'food', 'swiggy instamart', 'blinkit', 'zepto', 'fruits', 'fal', 'vegetables',
    ],
  },
  {
    category: 'Travel',
    type: 'debit',
    keywords: [
      'auto', 'cab', 'taxi', 'ola', 'uber', 'metro', 'train', 'bus', 'petrol',
      'diesel', 'fuel', 'toll', 'parking', 'ticket', 'flight', 'rapido', 'transport',
      'bike', 'scooter', 'travel', 'rickshaw', 'e-rickshaw', 'railway', 'gas',
    ],
  },
  {
    category: 'Bills',
    type: 'debit',
    keywords: [
      'recharge', 'mobile', 'wifi', 'electricity', 'bijli', 'water', 'pani',
      'cylinder', 'broadband', 'rent', 'kiraya', 'ott', 'netflix', 'prime',
      'hotstar', 'jio', 'airtel', 'vi', 'bill', 'dth', 'maintenance', 'emi',
    ],
  },
  {
    category: 'Shopping',
    type: 'debit',
    keywords: [
      'kapde', 'clothes', 'shoes', 'amazon', 'flipkart', 'myntra', 'meesho', 'mall',
      'market', 'shopping', 'salon', 'haircut', 'dress', 'bag', 'watch', 'makeup',
      'cosmetics', 'chashma', 'purchase', 'bought',
    ],
  },
  {
    category: 'Health',
    type: 'debit',
    keywords: [
      'dawai', 'medicine', 'medicines', 'doctor', 'clinic', 'hospital', 'pharmacy',
      'medical', 'test', 'blood test', 'tablets', 'syrup', 'dentist', 'dental',
      'injection', 'health', 'consultation',
    ],
  },
  {
    category: 'Entertainment',
    type: 'debit',
    keywords: [
      'movie ticket', 'movie', 'cinema', 'theatre', 'gaming', 'game', 'party', 'club', 'match',
      'trip', 'outing', 'leisure', 'concert', 'amusement', 'fun',
    ],
  },
  {
    category: 'Education',
    type: 'debit',
    keywords: [
      'fees', 'fee', 'school', 'college', 'tuition', 'coaching', 'books', 'book',
      'exam', 'pen', 'stationery', 'course', 'class', 'classes', 'study',
    ],
  },
  {
    category: 'Salary',
    type: 'credit',
    keywords: [
      'salary', 'tankhwah', 'stipend', 'pocket money', 'bonus', 'wage', 'wages',
      'overtime', 'paycheck',
    ],
  },
  {
    category: 'Business',
    type: 'credit',
    keywords: [
      'business', 'client', 'payment', 'sale', 'sales', 'profit', 'invoice',
      'customer', 'dukandari', 'advance',
    ],
  },
  {
    category: 'Freelance',
    type: 'credit',
    keywords: [
      'freelance', 'freelancing', 'project', 'gig', 'upwork', 'fiverr',
    ],
  },
  {
    category: 'Investments',
    keywords: [
      'mutual fund', 'sip', 'stocks', 'share', 'crypto', 'gold', 'share market',
      'fd', 'rd', 'dividend', 'interest', 'trading',
    ],
  },
  {
    category: 'Personal',
    keywords: [
      'gift', 'donation', 'charity', 'puja', 'mandir', 'tip', 'cashback', 'reward',
    ],
  },
];

// Single word to number map (English, Hindi transliteration, Devanagari)
const WORD_NUMBER_MAP: Record<string, number> = {
  // English
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, lakh: 100000, lac: 100000, million: 1000000, crore: 10000000,

  // Hindi Transliteration (Hinglish)
  shunya: 0, sifar: 0,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, che: 6, chhah: 6, chheh: 6, saat: 7, aath: 8, nau: 9, das: 10,
  gyarah: 11, gyara: 11, barah: 12, bara: 12, terah: 13, tera: 13, chaudah: 14, chauda: 14,
  pandrah: 15, pandra: 15, solah: 16, sola: 16, satrah: 17, satra: 17, atharah: 18, athara: 18, unnis: 19,
  bees: 20, biis: 20, ikkis: 21, baais: 22, teis: 23, chaubis: 24, pachis: 25, pachhis: 25,
  chhabbis: 26, sattais: 27, atthais: 28, untees: 29, tees: 30, tis: 30,
  ikattis: 31, battis: 32, taintis: 33, chauntis: 34, paintis: 35, chattis: 36, saintis: 37, adhtis: 38, untalis: 39,
  chalis: 40, chaalis: 40, iktalis: 41, bayalis: 42, taintalis: 43, chavalis: 44, paintalis: 45, chiyalis: 46, saintalis: 47, adhtalis: 48, unchas: 49,
  pachas: 50, pachaas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
  sau: 100, so: 100,
  hazar: 1000, hazaar: 1000, hazaare: 1000, k: 1000,
  laakh: 100000,
  karod: 10000000,

  // Devanagari numerals and words
  '१': 1, '२': 2, '३': 3, '४': 4, '५': 5, '६': 6, '७': 7, '८': 8, '९': 9, '०': 0,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19,
  'बीस': 20, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90,
  'सौ': 100, 'हजार': 1000, 'हज़ार': 1000, 'लाख': 100000, 'करोड़': 10000000,
};

// Special fractions / multipliers in Hindi
const SPECIAL_COMBINATIONS: Array<{ pattern: RegExp; value: number }> = [
  { pattern: /\b(dedh|dehd)\s+(sau|so)\b/i, value: 150 },
  { pattern: /\b(dhai|dhaai)\s+(sau|so)\b/i, value: 250 },
  { pattern: /\b(dedh|dehd)\s+(hazar|hazaar)\b/i, value: 1500 },
  { pattern: /\b(dhai|dhaai)\s+(hazar|hazaar)\b/i, value: 2500 },
  { pattern: /\b(dedh|dehd)\s+(lakh|laakh)\b/i, value: 150000 },
  { pattern: /\b(dhai|dhaai)\s+(lakh|laakh)\b/i, value: 250000 },
];

/**
 * Extracts numeric amount from text containing digits, "k", or number words
 */
export function extractAmount(text: string): { amount: number | null; matchedPhrase: string } {
  const normalized = text.toLowerCase();

  // 1. Check special combinations first (e.g. "dedh sau", "dhai hazaar")
  for (const combo of SPECIAL_COMBINATIONS) {
    const match = normalized.match(combo.pattern);
    if (match && match[0]) {
      return { amount: combo.value, matchedPhrase: match[0] };
    }
  }

  // 2. Direct digits with optional multiplier suffix (e.g. "25000", "500.50", "5k", "2.5 lakh")
  const digitWithMultiplierMatch = normalized.match(
    /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|hazar|hazaar|thousand|lakh|laakh|lac|crore|sau)?\b/i
  );
  if (digitWithMultiplierMatch && digitWithMultiplierMatch[1]) {
    const base = parseFloat(digitWithMultiplierMatch[1]);
    const multWord = (digitWithMultiplierMatch[2] || '').toLowerCase();
    let mult = 1;
    if (multWord === 'k' || multWord === 'thousand' || multWord === 'hazar' || multWord === 'hazaar') {
      mult = 1000;
    } else if (multWord === 'lakh' || multWord === 'laakh' || multWord === 'lac') {
      mult = 100000;
    } else if (multWord === 'crore') {
      mult = 10000000;
    } else if (multWord === 'sau') {
      mult = 100;
    }
    return {
      amount: Math.round(base * mult * 100) / 100,
      matchedPhrase: digitWithMultiplierMatch[0].trim(),
    };
  }

  // 3. Spoken words sequence (e.g. "bees", "pachas hazaar", "two thousand five hundred", "paanch sau")
  const words = normalized.replace(/[^a-zA-Z0-9\u0900-\u097F\s]/g, ' ').split(/\s+/).filter(Boolean);

  let totalAmount = 0;
  let currentGroup = 0;
  let hasFoundNumber = false;
  const matchedWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const val = WORD_NUMBER_MAP[word];

    if (val !== undefined) {
      hasFoundNumber = true;
      matchedWords.push(word);

      if (val === 100) {
        currentGroup = (currentGroup === 0 ? 1 : currentGroup) * 100;
      } else if (val === 1000 || val === 100000 || val === 10000000) {
        currentGroup = (currentGroup === 0 ? 1 : currentGroup) * val;
        totalAmount += currentGroup;
        currentGroup = 0;
      } else {
        currentGroup += val;
      }
    } else if (hasFoundNumber) {
      // Check if word is just "and" or "aur" connecting numbers
      if (word === 'and' || word === 'aur') {
        continue;
      }
      // Stop sequence when non-number word occurs
      break;
    }
  }

  totalAmount += currentGroup;

  if (hasFoundNumber && totalAmount > 0) {
    return {
      amount: totalAmount,
      matchedPhrase: matchedWords.join(' '),
    };
  }

  return { amount: null, matchedPhrase: '' };
}

/**
 * Determines transaction type: 'credit' (income) vs 'debit' (expense)
 */
export function determineTransactionType(text: string): 'debit' | 'credit' {
  const lower = text.toLowerCase();

  const incomeSignals = [
    'aaya', 'aaye', 'aayi', 'aaye hain', 'mila', 'mile', 'mili', 'mile hain',
    'salary', 'tankhwah', 'stipend', 'received', 'income', 'credit', 'credited',
    'jama', 'deposit', 'deposited', 'earned', 'kamaya', 'refund', 'cashback',
    'bheja mujhe', 'diye mujhe',
  ];

  const expenseSignals = [
    'kharch', 'kharcha', 'kharche', 'diye', 'diya', 'de diya', 'de diye',
    'paid', 'spent', 'pay kiya', 'debit', 'debited', 'bhar diya', 'bhara',
    'lag gaya', 'lag gaye', 'laga', 'payment', 'bill bhara', 'chuka diya',
    'khareeda', 'bought', 'purchase', 'spent on',
  ];

  let incomeScore = 0;
  let expenseScore = 0;

  for (const signal of incomeSignals) {
    if (new RegExp(`\\b${signal}\\b`, 'i').test(lower)) {
      incomeScore += signal === 'salary' || signal === 'credited' ? 2 : 1;
    }
  }

  for (const signal of expenseSignals) {
    if (new RegExp(`\\b${signal}\\b`, 'i').test(lower)) {
      expenseScore += signal === 'paid' || signal === 'kharch' ? 2 : 1;
    }
  }

  if (incomeScore > expenseScore) {
    return 'credit';
  }

  // Default in personal finance is expense (debit)
  return 'debit';
}

/**
 * Classifies category based on keyword matching
 */
export function classifyCategory(
  text: string,
  txType: 'debit' | 'credit',
  availableCategories?: string[]
): string {
  const lower = text.toLowerCase();

  let bestCategory: string | null = null;
  let maxScore = 0;

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lower)) {
        // Multi-word keywords get higher weight (e.g. "movie ticket" > "ticket")
        const weight = kw.includes(' ') ? 12 : kw.length;
        score += weight;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestCategory = rule.category;
    }
  }

  if (bestCategory) {
    if (availableCategories && availableCategories.length > 0) {
      const match = availableCategories.find(
        (c) => c.toLowerCase() === bestCategory!.toLowerCase()
      );
      if (match) return match;
    }
    return bestCategory;
  }

  if (txType === 'credit') {
    return 'Salary';
  }

  return 'Food'; // Most common expense fallback
}

/**
 * Checks for Udhar keywords and extracts friend name if present
 */
export function detectUdharAndFriend(
  text: string,
  knownFriends: string[] = []
): { isUdhar: boolean; friendName?: string } {
  const lower = text.toLowerCase();

  // Check known friends first
  for (const friend of knownFriends) {
    if (friend.trim() && new RegExp(`\\b${friend.trim().toLowerCase()}\\b`, 'i').test(lower)) {
      const hasUdharContext =
        /udhar|udhari|udhaar|diye|liye|hisaab|khata|bheje|borrow|lent/i.test(lower);
      return {
        isUdhar: hasUdharContext,
        friendName: friend.trim(),
      };
    }
  }

  // Regex for "Rahul ko ... udhar diye" / "Amit se ... liye"
  const friendRegex = /([a-zA-Z\u0900-\u097F]{2,20})\s+(?:ko|se)\s+(?:.*?)(?:udhar|udhari|hisaab|diye|liye)/i;
  const match = text.match(friendRegex);

  if (match && match[1]) {
    const candidate = match[1].trim();
    const blacklist = ['aaj', 'kal', 'parson', 'mujhe', 'humne', 'sab', 'maine', 'bank', 'cash', 'upi'];
    if (!blacklist.includes(candidate.toLowerCase())) {
      return {
        isUdhar: true,
        friendName: candidate.charAt(0).toUpperCase() + candidate.slice(1),
      };
    }
  }

  const generalUdhar = /\b(udhar|udhari|udhaar|khata)\b/i.test(lower);
  return { isUdhar: generalUdhar };
}

/**
 * Detects explicit user category commands such as:
 * "catagrey : Office", "category: Shopping", "category gym", "office category mein", etc.
 */
export function extractExplicitCategory(
  text: string,
  availableCategories?: string[]
): { category: string; matchedPhrase: string } | null {
  const catKeywords = '(?:category|catergery|catagrey|catagory|kategori|categori|shreni|vibhag)';
  const fillerSeparators = '(?::|=|-|\\bmein\\b|\\bme\\b|\\bhai\\b|\\brakho\\b|\\bkaro\\b|\\bka\\b|\\bki\\b|\\bke\\b)*';

  // 1. Prefix: "category: Office", "category office", "catagrey : gym", "category mein office"
  const prefixRegex = new RegExp(
    `\\b${catKeywords}\\s*${fillerSeparators}\\s*[:=\\-]?\\s*([a-zA-Z0-9_\\u0900-\\u097F]+(?:\\s+[a-zA-Z0-9_\\u0900-\\u097F]+)?)`,
    'i'
  );

  // 2. Suffix: "office category", "snacks category mein", "gym category me"
  const suffixRegex = new RegExp(
    `\\b([a-zA-Z0-9_\\u0900-\\u097F]{2,20})\\s+${catKeywords}(?:\\s+(?:mein|me|hai|rakho|karo))?\\b`,
    'i'
  );

  let rawCatName: string | null = null;
  let matchedPhrase = '';

  const prefixMatch = text.match(prefixRegex);
  if (prefixMatch && prefixMatch[1]) {
    const candidate = prefixMatch[1]
      .replace(/\b(mein|me|hai|tha|thi|the|ka|ki|ke|ko|se|rakho|karo)\b/gi, '')
      .trim();
    if (candidate.length >= 2) {
      rawCatName = candidate;
      matchedPhrase = prefixMatch[0];
    }
  }

  // If prefix match was not valid or empty, try suffix match
  if (!rawCatName) {
    const suffixMatch = text.match(suffixRegex);
    if (suffixMatch && suffixMatch[1]) {
      const candidate = suffixMatch[1]
        .replace(/\b(mein|me|hai|tha|thi|the|ka|ki|ke|ko|se|rakho|karo)\b/gi, '')
        .trim();
      if (candidate.length >= 2) {
        rawCatName = candidate;
        matchedPhrase = suffixMatch[0];
      }
    }
  }

  if (!rawCatName) return null;

  // Check against availableCategories first
  if (availableCategories && availableCategories.length > 0) {
    const found = availableCategories.find(
      (c) => c.toLowerCase() === rawCatName!.toLowerCase()
    );
    if (found) {
      return { category: found, matchedPhrase };
    }
  }

  // Check against built-in category rules
  for (const rule of CATEGORY_RULES) {
    if (rule.category.toLowerCase() === rawCatName.toLowerCase()) {
      return { category: rule.category, matchedPhrase };
    }
  }

  // Title case the user's custom category (e.g. "office supplies" -> "Office Supplies")
  const capitalized = rawCatName
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return { category: capitalized, matchedPhrase };
}

/**
 * Detects payment mode from spoken transcript.
 * Defaults to 'UPI'. If user mentions 'cash', 'bank', 'card', or 'upi', returns that mode.
 */
export function detectPaymentMode(text: string): {
  paymentMode: 'UPI' | 'Cash' | 'Bank' | 'Card';
  matchedPhrase?: string;
} {
  const normalized = text.toLowerCase();

  // 1. Cash keywords (e.g. "cash me", "nagad", "rokad", "by cash", "haath me")
  const cashMatch = normalized.match(/\b(cash|rokad|nagad|nakad|haath me)\b/i);
  if (cashMatch) {
    return { paymentMode: 'Cash', matchedPhrase: cashMatch[0] };
  }

  // 2. Bank keywords (e.g. "bank se", "netbanking", "account", "bank transfer", "cheque", "neft", "rtgs", "imps")
  const bankMatch = normalized.match(/\b(bank transfer|netbanking|net banking|bank|account|cheque|neft|rtgs|imps)\b/i);
  if (bankMatch) {
    return { paymentMode: 'Bank', matchedPhrase: bankMatch[0] };
  }

  // 3. Card keywords (e.g. "credit card", "debit card", "card se", "swipe")
  const cardMatch = normalized.match(/\b(credit card|debit card|card|swipe)\b/i);
  if (cardMatch) {
    return { paymentMode: 'Card', matchedPhrase: cardMatch[0] };
  }

  // 4. UPI keywords (e.g. "upi se", "gpay", "google pay", "phonepe", "paytm", "bhim", "scan", "qr")
  const upiMatch = normalized.match(/\b(upi|gpay|google pay|googlepay|phonepe|phone pe|paytm|bhim|qr|online)\b/i);
  if (upiMatch) {
    return { paymentMode: 'UPI', matchedPhrase: upiMatch[0] };
  }

  // Default is UPI
  return { paymentMode: 'UPI' };
}

/**
 * Cleans the transcript to generate a clear, human-readable transaction note
 */
export function generateCleanNote(
  transcript: string,
  matchedAmountPhrase: string,
  txType: 'debit' | 'credit',
  category: string,
  explicitCategoryPhrase?: string,
  matchedPaymentPhrase?: string
): string {
  let cleaned = transcript.trim();

  // Remove the matched amount phrase
  if (matchedAmountPhrase) {
    cleaned = cleaned.replace(new RegExp(matchedAmountPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
  }

  // Remove explicit category phrase if provided (e.g. "catagrey : office")
  if (explicitCategoryPhrase) {
    cleaned = cleaned.replace(new RegExp(explicitCategoryPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '');
  }

  // Remove matched payment phrase (e.g. "cash", "bank se", "upi")
  if (matchedPaymentPhrase) {
    cleaned = cleaned.replace(new RegExp(`\\b${matchedPaymentPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+(?:se|me|dwara|kare|kiya|through|by|via))?\\b`, 'gi'), ' ');
  }

  // Remove common filler / unit words
  const fillers = [
    'rupaye', 'rupay', 'rupya', 'rupee', 'rupees', 'rs\\.?', 'inr', 'paise', 'paisa',
    'ka', 'ki', 'ke', 'ko', 'se', 'hai', 'tha', 'thi', 'the', 'for', 'of',
    'aaya', 'aayi', 'aaye', 'mila', 'mili', 'mile', 'diye', 'diya', 'paid', 'spent',
    'kharch', 'kharcha', 'kare', 'kiya',
  ];

  for (const filler of fillers) {
    cleaned = cleaned.replace(new RegExp(`\\b${filler}\\b`, 'gi'), ' ');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Fallback to category name or transaction description
  return category || (txType === 'credit' ? 'Income' : 'Expense');
}

/**
 * Main Entry Point: Parses spoken voice transcript into a structured transaction
 */
export function parseVoiceTranscript(
  transcript: string,
  options: {
    availableCategories?: string[];
    knownFriends?: string[];
  } = {}
): ParsedVoiceTransaction {
  const raw = (transcript || '').trim();

  if (!raw) {
    return {
      amount: null,
      type: 'debit',
      category: 'Food',
      note: '',
      paymentMode: 'UPI',
      confidence: 0,
      rawTranscript: '',
    };
  }

  // 1. Amount
  const { amount, matchedPhrase } = extractAmount(raw);

  // 2. Type (Expense vs Income)
  const type = determineTransactionType(raw);

  // 3. Category: First check explicit user category directive (e.g. "catagrey : office", "category: gym")
  const explicitCat = extractExplicitCategory(raw, options.availableCategories);
  let category: string;
  let explicitCategoryPhrase = '';

  if (explicitCat) {
    category = explicitCat.category;
    explicitCategoryPhrase = explicitCat.matchedPhrase;
  } else {
    category = classifyCategory(raw, type, options.availableCategories);
  }

  // 4. Udhar & Friend
  const { isUdhar, friendName } = detectUdharAndFriend(raw, options.knownFriends);

  // 5. Payment Mode (Default: UPI, or detects Cash / Bank / Card if spoken)
  const { paymentMode, matchedPhrase: matchedPaymentPhrase } = detectPaymentMode(raw);

  // 6. Note
  const note = generateCleanNote(raw, matchedPhrase, type, category, explicitCategoryPhrase, matchedPaymentPhrase);

  // 7. Confidence calculation
  let confidence = 0.3; // base confidence for non-empty text
  if (amount !== null && amount > 0) confidence += 0.4;
  if (category && category !== 'Food') confidence += 0.2;
  if (friendName) confidence += 0.1;
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    amount,
    amountText: amount !== null ? amount.toString() : undefined,
    type,
    category,
    paymentMode,
    note: friendName && isUdhar ? `${friendName} ko udhar` : note,
    friendName,
    isUdhar,
    confidence,
    rawTranscript: raw,
  };
}
