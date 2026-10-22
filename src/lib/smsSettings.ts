import AsyncStorage from '@react-native-async-storage/async-storage';
import { warn } from './logger.ts';
import { cleanMojibakeString } from '../utils/mojibake.ts';

export interface SmsImportSettings {
  autoAddEnabled: boolean;          // High confidence >= 0.9 auto-added
  reviewBeforeAdding: boolean;      // Always require review before adding
  saveOriginalInNote: boolean;      // Default: false (Privacy)
  maskAccountNumbers: boolean;      // Default: true (Keep only last 4 digits)
  customCategoryRules: Record<string, string>; // e.g. { "swiggy": "Food" }
  allowedSenders: string[];         // Empty = all known Indian banks
  customBanks: string[];            // Custom banks or international senders added by user (e.g. Chase, Emirates NBD)
}

export const DEFAULT_SMS_SETTINGS: SmsImportSettings = {
  autoAddEnabled: true,
  reviewBeforeAdding: false,
  saveOriginalInNote: true,
  maskAccountNumbers: true,
  customCategoryRules: {},
  allowedSenders: [],
  customBanks: [],
};

const getSmsSettingsKey = (userId: string) => `@rupeo_sms_settings_${userId}`;
const WRONG_PARSES_KEY = '@rupeo_sms_wrong_parses';

export const AUTO_ADD_PAUSED_UNTIL_KEY = '@rupeo_auto_add_paused_until';

/**
 * Gets the timestamp until which Auto-Add is paused (0 = not paused).
 */
export async function getAutoAddPausedUntil(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(AUTO_ADD_PAUSED_UNTIL_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Temporarily pauses Auto-Add for the specified number of hours (default: 1 hour).
 */
export async function pauseAutoAddFor(hours: number = 1): Promise<number> {
  const pausedUntil = Date.now() + Math.round(hours * 60 * 60 * 1000);
  try {
    await AsyncStorage.setItem(AUTO_ADD_PAUSED_UNTIL_KEY, pausedUntil.toString());
  } catch (err) {
    warn('Error saving auto-add paused until:', err);
  }
  return pausedUntil;
}

/**
 * Resumes Auto-Add by clearing the pausedUntil timestamp.
 */
export async function resumeAutoAdd(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTO_ADD_PAUSED_UNTIL_KEY);
  } catch (err) {
    warn('Error clearing auto-add pause:', err);
  }
}

/**
 * Checks whether Auto-Add is currently in a paused state.
 */
export async function isAutoAddPaused(): Promise<boolean> {
  const until = await getAutoAddPausedUntil();
  return until > Date.now();
}

/**
 * Loads SMS & Auto-Add import settings for user. Always reads fresh from AsyncStorage
 * so changes in UI or headless background tasks take effect immediately with no stale cache.
 */
export async function getSmsImportSettings(userId: string, _fresh = true): Promise<SmsImportSettings> {
  if (!userId) return DEFAULT_SMS_SETTINGS;

  try {
    const raw = await AsyncStorage.getItem(getSmsSettingsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SMS_SETTINGS,
        ...parsed,
      };
    }
  } catch (err) {
    warn('Error loading SMS settings:', err);
  }

  return DEFAULT_SMS_SETTINGS;
}

/**
 * Saves SMS & Auto-Add import settings for user and updates persistent storage.
 */
export async function saveSmsImportSettings(
  userId: string,
  settings: Partial<SmsImportSettings>
): Promise<SmsImportSettings> {
  if (!userId) return DEFAULT_SMS_SETTINGS;

  const current = await getSmsImportSettings(userId, true);
  const updated: SmsImportSettings = {
    ...current,
    ...settings,
  };

  try {
    await AsyncStorage.setItem(getSmsSettingsKey(userId), JSON.stringify(updated));
  } catch (err) {
    warn('Error saving SMS settings:', err);
  }

  return updated;
}

/**
 * Adds a custom bank name or country sender code.
 */
export async function addCustomBank(userId: string, bankName: string): Promise<SmsImportSettings> {
  const clean = bankName.trim().toUpperCase();
  if (!clean) return getSmsImportSettings(userId);

  const current = await getSmsImportSettings(userId);
  const existing = current.customBanks || [];
  if (existing.includes(clean)) {
    return current;
  }

  const updatedBanks = [...existing, clean];
  return saveSmsImportSettings(userId, {
    customBanks: updatedBanks,
    allowedSenders: updatedBanks,
  });
}

/**
 * Removes a custom bank name or country sender code.
 */
export async function removeCustomBank(userId: string, bankName: string): Promise<SmsImportSettings> {
  const clean = bankName.trim().toUpperCase();
  const current = await getSmsImportSettings(userId);
  const updatedBanks = (current.customBanks || []).filter((b) => b !== clean);

  return saveSmsImportSettings(userId, {
    customBanks: updatedBanks,
    allowedSenders: updatedBanks,
  });
}

// ---------------------------------------------------------------------------
// Privacy: Account Number Masking & Note Formatting
// ---------------------------------------------------------------------------

/**
 * Masks account/card numbers in text, preserving only the last 4 digits.
 * e.g. "A/c 123456789012" -> "A/c ********9012"
 * "Card 4111222233334444" -> "Card ************4444"
 */
export function maskAccountNumbersInText(text: string): string {
  if (!text) return '';

  // Pattern 1: A/c or card followed by long digit sequences (>= 5 digits)
  let masked = text.replace(
    /(a\/c|account|acct|ac|card|no\.?)\s*[:#-]?\s*([0-9]{5,20})/gi,
    (match, prefix, digits) => {
      const last4 = digits.slice(-4);
      const asterisks = '*'.repeat(digits.length - 4);
      return `${prefix} ${asterisks}${last4}`;
    }
  );

  // Pattern 2: Isolated sequences of 10-16 consecutive digits (credit cards, bank accounts)
  masked = masked.replace(/\b(\d{6,12})(\d{4})\b/g, (match, head, tail) => {
    // Avoid masking timestamps (e.g., 20261022 or 10-digit epoch timestamp if within reasonable range)
    if (head.length + tail.length === 10 && (head.startsWith('17') || head.startsWith('18') || head.startsWith('20'))) {
      return match;
    }
    return '*'.repeat(head.length) + tail;
  });

  return masked;
}

/**
 * Strips Android package names, system debug headers, and google.android strings from the text.
 */
export function cleanOriginalMessage(rawText: string): string {
  if (!rawText) return '';
  let cleaned = cleanMojibakeString(rawText).trim();

  // 1. Remove any "Imported from SMS" or "Imported from Notification" header line(s)
  cleaned = cleaned.replace(/Imported from (?:SMS|Notification)[^\n·]*[·\n]*/gi, '');

  // 2. Remove Android package identifiers anywhere in the text (e.g. com.google.android.apps.messaging, com.phonepe.app, etc.)
  cleaned = cleaned.replace(/\b[a-z0-9_]+(?:\.[a-z0-9_]+)+\b/gi, (match) => {
    if (/^(?:com|in|net|org|io|ai|app)\./i.test(match) || /google|android/i.test(match)) {
      return '';
    }
    return match;
  });

  // 3. Remove any occurrence of google.android (or typo google.andriod)
  cleaned = cleaned.replace(/google\.(?:android|andriod)[a-zA-Z0-9_.]*/gi, '');

  // 4. Split lines and filter out empty lines, standalone separator lines, or lines containing package/system metadata
  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (/^[·\-\s:,\*•|]+$/.test(l)) return false;
      if (/google\.(?:android|andriod)/i.test(l)) return false;
      if (/^(?:com\.|in\.|net\.|org\.|io\.|app\.)/i.test(l)) return false;
      if (/^Imported from/i.test(l)) return false;
      return true;
    });

  cleaned = lines.join('\n').trim();

  // Remove leading leftover separators like "·", "-", ":", ",", "•"
  cleaned = cleaned.replace(/^[·\-\s:,•|]+/, '').trim();

  // If text already has "Original Message:" header, strip it so we don't repeat
  cleaned = cleaned.replace(/^Original (?:Message|SMS):\s*/i, '').trim();

  return cleaned;
}

/**
 * Returns clean, presentation-ready transaction note.
 * Strips legacy prefixes like "Imported from SMS · com.google.android.apps.messaging · "
 * and formats clean original SMS/Bank alert text with "Original Message:" header.
 */
export function getDisplayTransactionNote(description: string | null | undefined): string {
  if (!description) return '';
  const trimmed = description.trim();
  if (!trimmed) return '';

  const isImported =
    trimmed.includes('Imported from SMS') ||
    trimmed.includes('Imported from Notification') ||
    /google\.(?:android|andriod)/i.test(trimmed) ||
    /\b(?:com|in|net|org)\.[a-zA-Z0-9_.]+/i.test(trimmed) ||
    /^Original (?:Message|SMS):\s*/i.test(trimmed);

  if (isImported) {
    const clean = cleanOriginalMessage(trimmed);
    if (!clean) return '';
    return `Original Message:\n${clean}`;
  }

  return trimmed;
}

/**
 * Formats note text for the transaction.
 * Saves cleanly formatted original message without system package metadata:
 * "Original Message:
 * <message body, masked>"
 */
export function formatTransactionNote(
  sender: string,
  rawText: string,
  settings?: Partial<SmsImportSettings>
): string | null {
  if (settings && settings.saveOriginalInNote === false) {
    return null;
  }

  const cleanBody = cleanOriginalMessage(rawText);
  if (!cleanBody) {
    return null;
  }

  const mask = settings?.maskAccountNumbers !== false;
  const bodyText = mask ? maskAccountNumbersInText(cleanBody) : cleanBody;

  return `Original Message:\n${bodyText}`;
}

// ---------------------------------------------------------------------------
// "Report Wrong Parse" Local Storage (Developer Export)
// ---------------------------------------------------------------------------

export interface WrongParseReport {
  id: string;
  timestamp: number;
  sender: string;
  parsedAmount: number | null;
  parsedType: string;
  parsedMerchant: string | null;
  parsedRefNo: string | null;
  parsedCategory: string;
  confidence: number;
  userCorrection?: string;
  includesRawText: boolean;
  maskedText?: string;
}

/**
 * Saves a wrong parse report locally on device (no raw text sent to any server).
 */
export async function reportWrongParse(report: Omit<WrongParseReport, 'id' | 'timestamp'>): Promise<void> {
  try {
    const existingRaw = await AsyncStorage.getItem(WRONG_PARSES_KEY);
    const list: WrongParseReport[] = existingRaw ? JSON.parse(existingRaw) : [];

    const newReport: WrongParseReport = {
      ...report,
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };

    // Keep up to 50 reports locally
    list.unshift(newReport);
    if (list.length > 50) list.pop();

    await AsyncStorage.setItem(WRONG_PARSES_KEY, JSON.stringify(list));
  } catch (err) {
    warn('Failed to save wrong parse report:', err);
  }
}

/**
 * Gets all saved wrong parse reports for local review or manual export.
 */
export async function getWrongParseReports(): Promise<WrongParseReport[]> {
  try {
    const raw = await AsyncStorage.getItem(WRONG_PARSES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clears saved wrong parse reports.
 */
export async function clearWrongParseReports(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WRONG_PARSES_KEY);
  } catch (err) {
    warn('Failed to clear wrong parse reports:', err);
  }
}

/**
 * Saves a wrong parse report directly from a ParsedAlert object.
 */
export async function saveWrongParseReport(
  parsed: {
    sender: string;
    amount: number | null;
    type: string | null;
    merchant: string | null;
    refNo: string | null;
    category: string | null;
    confidence: number;
    rawText: string;
  },
  userCorrection?: string
): Promise<void> {
  await reportWrongParse({
    sender: parsed.sender,
    parsedAmount: parsed.amount,
    parsedType: parsed.type || 'unknown',
    parsedMerchant: parsed.merchant,
    parsedRefNo: parsed.refNo,
    parsedCategory: parsed.category || 'Other',
    confidence: parsed.confidence,
    userCorrection,
    includesRawText: false,
    maskedText: maskAccountNumbersInText(parsed.rawText),
  });
}

// ---------------------------------------------------------------------------
// Privacy Disclosure Storage (Safety Block Requirement 4)
// ---------------------------------------------------------------------------

const getPrivacyDisclosureKey = (userId: string) => `@rupeo_sms_privacy_disclosure_${userId}`;

/**
 * Checks if the user has completed or accepted the one-time SMS privacy disclosure.
 */
export async function hasCompletedSmsPrivacyDisclosure(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const val = await AsyncStorage.getItem(getPrivacyDisclosureKey(userId));
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Marks the one-time SMS privacy disclosure as completed for the user.
 */
export async function markSmsPrivacyDisclosureDone(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(getPrivacyDisclosureKey(userId), 'true');
  } catch (err) {
    warn('Failed to save SMS privacy disclosure state:', err);
  }
}
