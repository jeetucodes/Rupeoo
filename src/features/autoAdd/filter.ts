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

  // Top Indian Banks
  'com.csam.icici.bank.imobile',           // ICICI iMobile
  'com.snapwork.hdfc',                     // HDFC Bank MobileBanking
  'com.sbi.SBIFreedomPlus',                // YONO SBI
  'com.axis.mobile',                       // Axis Mobile
  'com.msf.kbank.mobile',                  // Kotak 811
  'com.rblbank.mobank',                    // RBL MoBank
  'com.bankofbaroda.mconnect',             // bob World
  'com.infrasofttech.canarabank',          // Canara ai1
  'com.fss.pnb',                           // PNB One
  'com.fedmobile',                         // Federal Bank
  'com.idfcfirstbank.optimus',             // IDFC FIRST Bank
  'com.indusind.indusmobile',              // IndusInd Bank
  'com.yesbank',                           // YES Bank
  'com.aubank.aupay',                      // AU 0101
]);

export const ALL_ALLOWED_PACKAGES = new Set([
  ...ALLOWED_SMS_PACKAGES,
  ...ALLOWED_UPI_AND_BANK_PACKAGES,
]);

/**
 * Checks if the notification package belongs to our approved allowlist.
 */
export function isPackageAllowed(packageName: string): boolean {
  if (!packageName) return false;
  return ALL_ALLOWED_PACKAGES.has(packageName.trim().toLowerCase());
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
  return ALLOWED_UPI_AND_BANK_PACKAGES.has(packageName.trim().toLowerCase());
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
  /\b(?:mandate\s*scheduled|will\s*be\s*debited|upcoming\s*autopay)\b/i,
  /\b(?:login\s*alert|logged\s*in|password\s*reset|profile\s*updated)\b/i,
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
