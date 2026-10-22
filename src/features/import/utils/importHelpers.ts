/**
 * Helper utilities for Import Messages & Pending Alerts Inbox
 */

import { formatCurrency } from '../../../utils/formatCurrency.ts';

export interface DraftItemLike {
  id: string;
  amount: number;
  type: string;
  merchant?: string | null;
  category?: string | null;
  bankName?: string | null;
  accountLast4?: string | null;
  date: number;
  channel?: string | null;
  confidence?: number;
  refNo?: string | null;
  rawText?: string;
  selected?: boolean;
  isAlreadyAdded?: boolean;
  isLowConfidence?: boolean;
  matchedBillTitle?: string | null;
  candidateBills?: any[];
  [key: string]: any;
}

/**
 * Returns human-friendly bank name from bankName or raw text.
 * Never returns 'Pasted Alert', 'Bank Alert', or 'Bank SMS'.
 */
export function getCleanBankName(bankName?: string | null, rawText?: string): string {
  const cleanBank = (bankName || '').trim();
  const lowerBank = cleanBank.toLowerCase();

  const isGeneric =
    !cleanBank ||
    lowerBank === 'pasted alert' ||
    lowerBank === 'bank alert' ||
    lowerBank === 'bank sms' ||
    lowerBank === 'alert';

  if (!isGeneric) {
    // Clean DLT prefixes like AD-KOTAKB or VM-HDFCBK
    const dltMatch = cleanBank.match(/^[A-Za-z]{2}-([A-Za-z0-9]+)(?:-[A-Za-z])?$/);
    const code = (dltMatch ? dltMatch[1] : cleanBank).toUpperCase();

    if (/KOTAK/i.test(code)) return 'Kotak';
    if (/HDFC/i.test(code)) return 'HDFC';
    if (/SBI/i.test(code)) return 'SBI';
    if (/ICICI/i.test(code)) return 'ICICI';
    if (/AXIS/i.test(code)) return 'Axis';
    if (/PNB/i.test(code)) return 'PNB';
    if (/BARBOD|BOB/i.test(code)) return 'BOB';
    if (/CANARA|CANBNK/i.test(code)) return 'Canara';
    if (/UNIONB|UBI/i.test(code)) return 'Union Bank';
    if (/BOI/i.test(code)) return 'Bank of India';
    if (/IDFC/i.test(code)) return 'IDFC First';
    if (/INDUS/i.test(code)) return 'IndusInd';
    if (/YES/i.test(code)) return 'Yes Bank';
    if (/FED/i.test(code)) return 'Federal Bank';
    if (/RBL/i.test(code)) return 'RBL';
    if (/AU/i.test(code)) return 'AU Bank';
    if (/PAYTM/i.test(code)) return 'Paytm';
    if (/PHONEPE/i.test(code)) return 'PhonePe';
    if (/GPAY/i.test(code)) return 'Google Pay';
    if (/CRED/i.test(code)) return 'CRED';
    
    // Fall back to clean code if short, or clean bank
    if (code.length <= 15) return cleanBank;
  }

  // Fallback to inspecting raw message text for bank names
  const text = (rawText || '').toLowerCase();
  if (/kotak\s*(?:bank|mahindra)?/i.test(text)) return 'Kotak';
  if (/hdfc\s*(?:bank)?/i.test(text)) return 'HDFC';
  if (/sbi\b|state\s+bank\s+of\s+india/i.test(text)) return 'SBI';
  if (/icici\s*(?:bank)?/i.test(text)) return 'ICICI';
  if (/axis\s*(?:bank)?/i.test(text)) return 'Axis';
  if (/punjab\s+national\s+bank|pnb\b/i.test(text)) return 'PNB';
  if (/bank\s+of\s+baroda|bob\b/i.test(text)) return 'BOB';
  if (/canara\s*(?:bank)?/i.test(text)) return 'Canara';
  if (/union\s+bank/i.test(text)) return 'Union Bank';
  if (/bank\s+of\s+india|boi\b/i.test(text)) return 'Bank of India';
  if (/idfc\s*(?:first)?\s*(?:bank)?/i.test(text)) return 'IDFC First';
  if (/indusind\s*(?:bank)?/i.test(text)) return 'IndusInd';
  if (/yes\s+bank/i.test(text)) return 'Yes Bank';
  if (/federal\s+bank/i.test(text)) return 'Federal Bank';
  if (/rbl\s*(?:bank)?/i.test(text)) return 'RBL';
  if (/au\s*(?:small\s+finance)?\s*bank/i.test(text)) return 'AU Bank';
  if (/equitas/i.test(text)) return 'Equitas';
  if (/paytm/i.test(text)) return 'Paytm';
  if (/phonepe/i.test(text)) return 'PhonePe';
  if (/google\s*pay|gpay/i.test(text)) return 'Google Pay';
  if (/cred\b/i.test(text)) return 'CRED';

  return 'Bank';
}

/**
 * Masks account number to standard '••0741' format.
 * Never returns raw '**0741' or 'X0741'.
 */
export function getMaskedAccount(accountLast4?: string | null): string | null {
  if (!accountLast4) return null;
  const digits = accountLast4.replace(/\D/g, '').slice(-4);
  if (digits.length >= 2) {
    return `••${digits}`;
  }
  return null;
}

/**
 * Normalizes payment mode / channel to readable string ('UPI', 'Card', 'ATM', etc.)
 */
export function getCleanPaymentMode(channel?: string | null): string {
  if (!channel) return 'UPI';
  const c = channel.trim().toUpperCase();
  if (c === 'CARD') return 'Card';
  if (c === 'ATM') return 'ATM';
  if (c === 'NEFT') return 'NEFT';
  if (c === 'IMPS') return 'IMPS';
  if (c === 'EMI') return 'EMI';
  if (c === 'WALLET') return 'Wallet';
  if (c === 'BANK') return 'Bank';
  return 'UPI';
}

/**
 * Builds the standard subtitle: "Kotak ••0741 · UPI"
 */
export function buildCardSubtitle(
  bankName?: string | null,
  accountLast4?: string | null,
  channel?: string | null,
  rawText?: string
): string {
  const bank = getCleanBankName(bankName, rawText);
  const acct = getMaskedAccount(accountLast4);
  const mode = getCleanPaymentMode(channel);

  if (acct) {
    return `${bank} ${acct} · ${mode}`;
  }
  return `${bank} · ${mode}`;
}

/**
 * Checks whether an item needs category classification
 */
export function checkNeedsCategory(category?: string | null): boolean {
  if (!category) return true;
  const lower = category.trim().toLowerCase();
  return lower === 'others' || lower === 'other' || lower === 'uncategorized' || lower === 'general';
}

/**
 * Group drafts into sections:
 * - "Ready to add": non-duplicate, confidence >= 0.8, has category
 * - "Needs review": non-duplicate, confidence < 0.8 or needs category
 * - "Already added": duplicate item (collapsed by default)
 */
export function groupDrafts<T extends DraftItemLike>(drafts: T[]): {
  readyToAdd: T[];
  needsReview: T[];
  alreadyAdded: T[];
} {
  const readyToAdd: T[] = [];
  const needsReview: T[] = [];
  const alreadyAdded: T[] = [];

  for (const d of drafts) {
    if (d.isAlreadyAdded) {
      alreadyAdded.push(d);
    } else {
      const needsCat = checkNeedsCategory(d.category);
      const conf = d.confidence !== undefined ? d.confidence : 1.0;
      if (conf >= 0.8 && !needsCat) {
        readyToAdd.push(d);
      } else {
        needsReview.push(d);
      }
    }
  }

  return { readyToAdd, needsReview, alreadyAdded };
}

/**
 * Calculates summary totals for all non-duplicate items and selected items.
 * Guaranteed never to show ₹0 when items exist.
 */
export function calculateSummaryTotals<T extends DraftItemLike>(drafts: T[]): {
  foundCount: number;
  foundText: string;
  totalSpent: number;
  totalReceived: number;
  totalsSubtitle: string;
  selectedCount: number;
  selectedTotal: number;
  selectedSubtitle: string | null;
} {
  const foundCount = drafts.length;
  const nonDuplicates = drafts.filter((d) => !d.isAlreadyAdded);

  let totalSpent = 0;
  let totalReceived = 0;

  for (const d of nonDuplicates) {
    if (d.type === 'income' || d.type === 'credit') {
      totalReceived += d.amount;
    } else {
      totalSpent += d.amount;
    }
  }

  const selectedItems = nonDuplicates.filter((d) => d.selected);
  const selectedCount = selectedItems.length;
  let selectedTotal = 0;
  for (const d of selectedItems) {
    selectedTotal += d.amount;
  }

  const foundText = foundCount === 1 ? 'Found 1 transaction' : `Found ${foundCount} transactions`;

  const spentFormatted = formatCurrency(totalSpent);
  const receivedFormatted = formatCurrency(totalReceived);
  const totalsSubtitle = `Spent ${spentFormatted} · Received ${receivedFormatted}`;

  const selectedSubtitle =
    selectedCount > 0 ? `Selected: ${selectedCount} · ${formatCurrency(selectedTotal)}` : null;

  return {
    foundCount,
    foundText,
    totalSpent,
    totalReceived,
    totalsSubtitle,
    selectedCount,
    selectedTotal,
    selectedSubtitle,
  };
}

/**
 * Select All state: 'all' | 'none' | 'some'
 */
export function getSelectAllState<T extends DraftItemLike>(
  selectableDrafts: T[]
): 'all' | 'none' | 'some' {
  if (selectableDrafts.length === 0) return 'none';
  const selectedCount = selectableDrafts.filter((d) => d.selected).length;
  if (selectedCount === 0) return 'none';
  if (selectedCount === selectableDrafts.length) return 'all';
  return 'some';
}

/**
 * Discard dialog rule:
 * Only appears when there are selected drafts OR edited drafts.
 * If nothing is selected and nothing was edited, returns false (navigate/exit without dialog).
 */
export function shouldShowDiscardDialog<T extends DraftItemLike>(
  drafts: T[],
  hasEdits: boolean
): boolean {
  if (hasEdits) return true;
  const hasSelectedNonDuplicate = drafts.some((d) => !d.isAlreadyAdded && d.selected);
  return hasSelectedNonDuplicate;
}
