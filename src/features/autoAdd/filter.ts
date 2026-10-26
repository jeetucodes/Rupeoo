/**
 * On-Device Filter for Auto-Add Notification Listener
 *
 * Enforces strict privacy and relevance:
 * 1. Allowlisted package IDs only (SMS apps and official Indian banking/UPI apps).
 * 2. Strict rejection of OTPs, security codes, promotional offers, and personal chats.
 * 3. Required financial pattern matching (currency symbols and debit/credit verbs).
 */

export const ALLOWED_SMS_PACKAGES = new Set([
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
  'com.android.mms',
  'com.miui.mms',
  'com.coloros.mms',
  'com.oppo.mms',
  'com.vivo.mms',
  'com.motorola.messaging',
  'com.oneplus.mms',
]);

export const ALLOWED_UPI_AND_BANK_PACKAGES = new Set([
  // UPI & Fintech
  'com.google.android.apps.nbu.paisa.user', // Google Pay
  'com.phonepe.app',                       // PhonePe
  'net.one97.paytm',                       // Paytm
  'in.org.npci.upiapp',                    // BHIM UPI
  'com.dreamplug.androidapp',              // CRED
  'com.citrus.citruspay',                  // LazyPay
  'com.jupiter.money',                     // Jupiter
  'com.epifi',                             // Fi Money
  'com.onecard',                           // OneCard
  'com.freecharge.android',                // Freecharge
  'com.mobikwik_new',                      // MobiKwik
  'in.amazon.mShop.android.shopping',      // Amazon Pay
  'org.indyfin.slice',                     // Slice
  'com.navi.finance',                      // Navi
  'money.super.app',                       // super.money
  'com.tatadigital.tcp',                   // Tata Neu
  'com.myairtelapp',                       // Airtel Payments Bank
  'com.jio.myjio',                         // MyJio UPI
  'com.jio.finance',                       // JioFinance
  'com.samsung.android.spay',              // Samsung Wallet
  'com.samsung.android.raja.pay',          // Samsung Wallet India

  // Top Indian Banks
  'com.csam.icici.bank.imobile',           // ICICI iMobile
  'com.icicibank.pockets',                 // ICICI Pockets
  'com.snapwork.hdfc',                     // HDFC Bank MobileBanking
  'com.hdfcbank.payzapp',                  // HDFC PayZapp
  'com.hdfc.mycards',                      // HDFC MyCards
  'com.sbi.SBIFreedomPlus',                // YONO SBI
  'com.sbi.lotuslite',                     // YONO Lite SBI
  'com.sbi.upi',                           // BHIM SBI Pay
  'com.axis.mobile',                       // Axis Mobile
  'com.axis.netbanking',                   // Axis NetBanking
  'com.msf.kbank.mobile',                  // Kotak 811 Mobile Banking
  'com.kotak.mobile',                      // Kotak Bank
  'com.kotak.mb',                          // Kotak Mobile
  'com.kotak.cherry',                      // Kotak Cherry
  'com.rblbank.mobank',                    // RBL MoBank
  'com.bankofbaroda.mconnect',             // bob World
  'com.bob.upi',                           // bob UPI
  'com.infrasofttech.canarabank',          // Canara ai1
  'com.canarabank.mobility',               // Canara Bank
  'com.fss.pnb',                           // PNB One
  'com.pnb.upi',                           // PNB BHIM
  'com.infrasofttech.uboi',                // Union Bank of India
  'com.unionbank.unionrush',               // Union Bank
  'com.unionbank.vyom',                    // Union Bank Vyom
  'com.boimobile',                         // Bank of India Mobile
  'com.bankofindia.bhim',                  // BOI BHIM UPI
  'com.infrasoft.indianbank',              // Indian Bank IndOASIS
  'com.infrasofttech.centralbank',         // Central Bank Cent Mobile
  'com.fedmobile',                         // Federal Bank FedMobile
  'com.federalbank.fedbook',               // FedBook
  'com.idfcfirstbank.optimus',             // IDFC FIRST Bank
  'com.indusind.indusmobile',              // IndusInd Bank
  'com.yesbank',                           // YES Bank
  'com.yesbank.iris',                      // YES Bank IRIS
  'com.aubank.aupay',                      // AU 0101
  'com.equitasbank.mobilebanking',         // Equitas Bank
  'com.ujjivan.mobile',                    // Ujjivan SFB
]);

export const ALL_ALLOWED_PACKAGES = new Set([
  ...ALLOWED_SMS_PACKAGES,
  ...ALLOWED_UPI_AND_BANK_PACKAGES,
]);

// Flexible banking & fintech package regex fallback for any Indian banking app
export const BANK_OR_FINTECH_PACKAGE_REGEX =
  /(?:bank|kbank|upi|paisa|payzapp|imobile|yono|canara|unionbank|bobworld|fednet|fedmobile|indusnet|idfc|kotak|hdfc|icici|axis|sbi|paytm|phonepe|cred|mobikwik|freecharge|slice|navi|super\.money)/i;

export const PACKAGE_BRAND_NAMES: Record<string, string> = {
  // UPI & Fintech
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm',
  'in.org.npci.upiapp': 'BHIM UPI',
  'com.dreamplug.androidapp': 'CRED',
  'com.citrus.citruspay': 'LazyPay',
  'com.jupiter.money': 'Jupiter',
  'com.epifi': 'Fi Money',
  'com.onecard': 'OneCard',
  'com.freecharge.android': 'Freecharge',
  'com.mobikwik_new': 'MobiKwik',
  'in.amazon.mShop.android.shopping': 'Amazon Pay',
  'org.indyfin.slice': 'Slice',
  'com.navi.finance': 'Navi',
  'money.super.app': 'super.money',
  'com.tatadigital.tcp': 'Tata Neu',
  'com.myairtelapp': 'Airtel Payments Bank',
  'com.jio.myjio': 'Jio Payments',
  'com.jio.finance': 'JioFinance',
  'com.samsung.android.spay': 'Samsung Wallet',
  'com.samsung.android.raja.pay': 'Samsung Wallet',

  // Top Indian Banks
  'com.csam.icici.bank.imobile': 'ICICI Bank',
  'com.icicibank.pockets': 'ICICI Pockets',
  'com.snapwork.hdfc': 'HDFC Bank',
  'com.hdfcbank.payzapp': 'PayZapp',
  'com.hdfc.mycards': 'HDFC Bank',
  'com.sbi.SBIFreedomPlus': 'SBI YONO',
  'com.sbi.lotuslite': 'SBI YONO Lite',
  'com.sbi.upi': 'BHIM SBI Pay',
  'com.axis.mobile': 'Axis Bank',
  'com.axis.netbanking': 'Axis Bank',
  'com.msf.kbank.mobile': 'Kotak Bank',
  'com.kotak.mobile': 'Kotak Bank',
  'com.kotak.mb': 'Kotak Bank',
  'com.kotak.cherry': 'Kotak Cherry',
  'com.rblbank.mobank': 'RBL Bank',
  'com.bankofbaroda.mconnect': 'Bank of Baroda',
  'com.bob.upi': 'Bank of Baroda',
  'com.infrasofttech.canarabank': 'Canara Bank',
  'com.canarabank.mobility': 'Canara Bank',
  'com.fss.pnb': 'PNB One',
  'com.pnb.upi': 'PNB One',
  'com.infrasofttech.uboi': 'Union Bank',
  'com.unionbank.unionrush': 'Union Bank',
  'com.unionbank.vyom': 'Union Bank Vyom',
  'com.boimobile': 'Bank of India',
  'com.bankofindia.bhim': 'Bank of India',
  'com.infrasoft.indianbank': 'Indian Bank',
  'com.infrasofttech.centralbank': 'Central Bank of India',
  'com.fedmobile': 'Federal Bank',
  'com.federalbank.fedbook': 'Federal Bank',
  'com.idfcfirstbank.optimus': 'IDFC FIRST Bank',
  'com.indusind.indusmobile': 'IndusInd Bank',
  'com.yesbank': 'YES Bank',
  'com.yesbank.iris': 'YES Bank IRIS',
  'com.aubank.aupay': 'AU Small Finance Bank',
  'com.equitasbank.mobilebanking': 'Equitas Bank',
  'com.ujjivan.mobile': 'Ujjivan Bank',
};

/**
 * Resolves a human-friendly sender or bank name from package and title.
 * Ensures package names like com.google.android.apps.messaging never leak to UI or notes.
 */
export function getFriendlySenderName(packageName: string, title?: string): string {
  if (isSmsPackage(packageName)) {
    const cleanTitle = (title || '').trim();
    if (cleanTitle && !/^(?:messages|sms|mms|message)$/i.test(cleanTitle) && !cleanTitle.includes('.')) {
      return cleanTitle;
    }
    return 'Bank SMS';
  }

  const brand = PACKAGE_BRAND_NAMES[packageName.toLowerCase()];
  if (brand) return brand;

  if (title && title.trim().length > 0 && !title.includes('.')) {
    return title.trim();
  }

  return 'Bank Alert';
}

/**
 * Checks if the notification package belongs to our approved allowlist or contains banking/UPI markers.
 */
export function isPackageAllowed(packageName: string): boolean {
  if (!packageName) return false;
  const clean = packageName.trim().toLowerCase();
  if (ALL_ALLOWED_PACKAGES.has(clean)) {
    return true;
  }
  return BANK_OR_FINTECH_PACKAGE_REGEX.test(clean);
}

/**
 * Checks whether the package is an SMS app.
 */
export function isSmsPackage(packageName: string): boolean {
  if (!packageName) return false;
  return ALLOWED_SMS_PACKAGES.has(packageName.trim().toLowerCase());
}

/**
 * Checks whether the package is a UPI or bank app.
 */
export function isUpiOrBankPackage(packageName: string): boolean {
  if (!packageName) return false;
  const clean = packageName.trim().toLowerCase();
  return ALLOWED_UPI_AND_BANK_PACKAGES.has(clean) || BANK_OR_FINTECH_PACKAGE_REGEX.test(clean);
}

/**
 * Patterns that indicate OTPs, authentication tokens, promotional spam, or non-actionable alerts.
 */
const OTP_AND_PROMO_PATTERNS: RegExp[] = [
  /\b(?:otp|one[\s-]?time[\s-]?password|verification\s*code|security\s*code|secret\s*code)\b/i,
  /\b(?:never\s*share|do\s*not\s*share|don't\s*share|strictly\s*confidential)\b/i,
  /\b(?:valid\s*for\s*\d+\s*(?:mins|minutes|secs|seconds))\b/i,
  /\b(?:promo|promotion|cashback\s*offer|flat\s*\d+%\s*off|discount\s*coupon|use\s*code)\b/i,
  /\b(?:congratulations|exclusive\s*deal|pre-approved|apply\s*now|claim\s*reward)\b/i,
  /\b(?:mandate\s*scheduled|will\s*be\s*debited|upcoming\s*auto[ -]?pay)\b/i,
  /\b(?:auto[ -]?pay|mandate|e-?mandate|auto[ -]?debit|standing\s+instruction|\bsi\b|enach|e-nach|nach)\b[\s\S]*?\b(?:cancel(?:led|ed|lation|ling)?|revok(?:ed|e)?|revocation|paus(?:ed|e|ing)?|stop(?:ped|e|ping)?|delet(?:ed|e|ing)?|remov(?:ed|e|al|ing)?|deactivat(?:ed|e|ion)?|terminat(?:ed|e|ion)?|disabled?|hata(?:ya|ye|diya)?|rok(?:a|i)?|band|delete\s+kiya|cancel\s+kiya|unlink(?:ed)?|failed|rejected|expired)\b/i,
  /\b(?:cancel(?:led|ed|lation|ling)?|revok(?:ed|e)?|revocation|paus(?:ed|e|ing)?|stop(?:ped|e|ping)?|delet(?:ed|e|ing)?|remov(?:ed|e|al|ing)?|deactivat(?:ed|e|ion)?|terminat(?:ed|e|ion)?|disabled?|hata(?:ya|ye|diya)?|rok(?:a|i)?|band|delete\s+kiya|cancel\s+kiya|unlink(?:ed)?)\b[\s\S]*?\b(?:auto[ -]?pay|mandate|e-?mandate|auto[ -]?debit|standing\s+instruction|\bsi\b|enach|e-nach|nach)\b/i,
  /\b(?:auto[ -]?pay|mandate|e-?mandate|auto[ -]?debit|standing\s+instruction|\bsi\b|enach|e-nach|nach)\b[\s\S]*?\b(?:creat(?:ed|e|ion)?|register(?:ed)?|registration|set\s*up|setup|add(?:ed|ing)?|activat(?:ed|e|ion)?|schedul(?:ed|e)?|approv(?:ed|al)?|confirm(?:ed|ation)?|enabl(?:ed|e)?|initiat(?:ed|e|ion)?|shuru|jod|lagay(?:a|e)|lgya|laga\s+diya|link(?:ed)?)\b/i,
  /\b(?:creat(?:ed|e|ion)?|register(?:ed)?|registration|set\s*up|setup|add(?:ed|ing)?|activat(?:ed|e|ion)?|schedul(?:ed|e)?|approv(?:ed|al)?|confirm(?:ed|ation)?|enabl(?:ed|e)?|initiat(?:ed|e|ion)?|lagay(?:a|e)|lgya|laga\s+diya|link(?:ed)?)\b[\s\S]*?\b(?:auto[ -]?pay|mandate|e-?mandate|auto[ -]?debit|standing\s+instruction|\bsi\b|enach|e-nach|nach)\b/i,
  /\bauto[ -]?pay\s+(?:request|setup|mandate|alert|notification|authorized|authorization)\b/i,
  /\b(?:setup|registration)\s+successful\b/i,
  /\b(?:mandate|autopay|si)\s+(?:id|ref|status|details)\b/i,
  /\blogin\s*alert|logged\s*in|password\s*reset|profile\s*updated\b/i,
];

/**
 * Determines whether text is an OTP, promotional offer, or security message.
 */
export function isOtpOrPromo(text: string): boolean {
  if (!text) return true;
  return OTP_AND_PROMO_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Patterns that confirm the message represents a debit or credit financial event.
 */
const AMOUNT_PATTERN = /(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d{1,2})?/i;
const TRANSACTION_VERB_PATTERN = /\b(?:debited|credited|spent|paid|sent|withdrawn|deposited|received|transferred|refunded|dr\.?|cr\.?)\b/i;
const ACCOUNT_OR_CHANNEL_PATTERN = /\b(?:a\/c|account|acct|card|upi|vpa|wallet|ref(?:\s*no)?|utr|rrn)\b/i;

/**
 * Checks if the notification text matches required financial debit/credit criteria.
 */
export function hasFinancialPattern(text: string): boolean {
  if (!text) return false;
  const hasAmount = AMOUNT_PATTERN.test(text);
  const hasVerb = TRANSACTION_VERB_PATTERN.test(text);
  const hasAcctOrChannel = ACCOUNT_OR_CHANNEL_PATTERN.test(text);

  // Must have amount AND (transaction verb OR account/channel indication with financial verb)
  return hasAmount && (hasVerb || hasAcctOrChannel);
}

/**
 * Combined gate check: True only if the notification is from an allowlisted app,
 * is free of OTP/promo keywords, and contains valid financial transaction language.
 */
export function shouldProcessNotification(packageName: string, text: string): boolean {
  if (!isPackageAllowed(packageName)) {
    return false;
  }
  if (!text || text.trim().length < 8) {
    return false;
  }
  if (isOtpOrPromo(text)) {
    return false;
  }
  if (!hasFinancialPattern(text)) {
    return false;
  }
  return true;
}
