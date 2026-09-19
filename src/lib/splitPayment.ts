/**
 * Rupeo Split Payment / Multi-Part UPI Engine
 * Implements high-precision integer-paise chunking, UPI intent generation,
 * validation, and NPCI MDR savings calculation.
 */

export type SplitMode = 'greedy' | 'equal';

export interface PaymentParams {
  upiId: string;
  payeeName?: string;
  amount: number;
  note?: string;
}

export interface SplitConfig {
  enabled: boolean;
  maxLimit: number;
  mode: SplitMode;
}

export interface SplitPart {
  id: string;
  partIndex: number;
  totalParts: number;
  amount: number;
  amountFormatted: string;
  upiUri: string;
  note: string;
  isPaid: boolean;
}

export interface SplitBreakdown {
  totalAmount: number;
  totalAmountFormatted: string;
  parts: SplitPart[];
  totalParts: number;
  mode: SplitMode;
  maxLimit: number;
  isSingle: boolean;
  estimatedMdrSavings: number;
  estimatedMdrSavingsFormatted: string;
  hasExceededSafetyCap: boolean;
  validationError?: string;
}

export const DEFAULT_SPLIT_LIMIT = 1999;
export const MAX_SAFETY_PARTS_CAP = 30;
export const LIMIT_PRESETS = [
  { label: '₹1,999 (MDR Saver)', value: 1999, tag: 'Recommended' },
  { label: '₹2,000', value: 2000 },
  { label: '₹5,000', value: 5000 },
  { label: '₹10,000', value: 10000 },
];

/**
 * Standard UPI ID (VPA) Regex:
 * Username (alphanumeric, dot, underscore, hyphen) + @ + bank/PSP handle
 */
export const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;

/**
 * Validates UPI ID format
 */
export function validateUpiId(upiId: string): { isValid: boolean; error?: string } {
  const trimmed = (upiId || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'UPI ID is required.' };
  }
  if (trimmed.startsWith('@')) {
    return { isValid: false, error: 'Please enter your UPI username or mobile number before "@".' };
  }
  if (!trimmed.includes('@')) {
    return { isValid: false, error: 'UPI ID must include a bank handle "@" (e.g. name@bank).' };
  }
  if (trimmed.endsWith('@')) {
    return { isValid: false, error: 'Please enter bank handle after "@" (e.g. @okhdfcbank).' };
  }
  if (!UPI_ID_REGEX.test(trimmed)) {
    return { isValid: false, error: 'Invalid UPI ID format (e.g. name@bank or phone@upi).' };
  }
  return { isValid: true };
}

/**
 * Validates transaction amount
 */
export function validateAmount(amount: number): { isValid: boolean; error?: string } {
  if (isNaN(amount) || amount <= 0) {
    return { isValid: false, error: 'Please enter a valid amount greater than ₹0.' };
  }
  if (amount > 1000000) {
    return { isValid: false, error: 'Amount exceeds standard UPI transaction ceiling (₹10,00,000).' };
  }
  return { isValid: true };
}

/**
 * Generates official NPCI UPI Deep Link URI
 * Specification: upi://pay?pa={vpa}&pn={name}&am={amount}&cu=INR&tn={note}
 */
export function generateUpiUri(params: {
  upiId: string;
  payeeName?: string;
  amount: number;
  note?: string;
  partIndex?: number;
  totalParts?: number;
}): string {
  const { upiId, payeeName, amount, note, partIndex, totalParts } = params;

  // Amount strictly formatted to 2 decimal places
  const formattedAmount = amount.toFixed(2);

  // Construct part-specific transaction note
  let txNote = (note || '').trim();
  if (partIndex !== undefined && totalParts !== undefined && totalParts > 1) {
    const partTag = `Part ${partIndex}/${totalParts}`;
    txNote = txNote ? `${txNote} (${partTag})` : `Rupeo Split Payment (${partTag})`;
  } else if (!txNote) {
    txNote = 'Rupeo UPI Payment';
  }

  const queryParts: string[] = [
    `pa=${encodeURIComponent(upiId.trim())}`,
    `pn=${encodeURIComponent((payeeName || upiId).trim())}`,
    `am=${formattedAmount}`,
    `cu=INR`,
    `tn=${encodeURIComponent(txNote)}`,
  ];

  return `upi://pay?${queryParts.join('&')}`;
}

/**
 * Calculates UPI Split Payment Breakdown
 * Utilizes integer-paise math to guarantee ZERO floating-point rounding errors.
 */
export function calculateSplitBreakdown(
  params: PaymentParams,
  config: SplitConfig
): SplitBreakdown {
  const { upiId, payeeName, amount, note } = params;
  const { enabled, maxLimit, mode } = config;

  const totalPaise = Math.round((amount || 0) * 100);
  const effectiveLimitPaise = Math.max(100, Math.round((maxLimit || DEFAULT_SPLIT_LIMIT) * 100));

  // If split is disabled or total is less than or equal to limit: single QR
  if (!enabled || totalPaise <= effectiveLimitPaise) {
    const singleUri = generateUpiUri({
      upiId,
      payeeName,
      amount,
      note,
    });

    return {
      totalAmount: amount,
      totalAmountFormatted: amount.toFixed(2),
      parts: [
        {
          id: 'part_1',
          partIndex: 1,
          totalParts: 1,
          amount: amount,
          amountFormatted: amount.toFixed(2),
          upiUri: singleUri,
          note: note || 'Rupeo UPI Payment',
          isPaid: false,
        },
      ],
      totalParts: 1,
      mode,
      maxLimit: maxLimit || DEFAULT_SPLIT_LIMIT,
      isSingle: true,
      estimatedMdrSavings: 0,
      estimatedMdrSavingsFormatted: '0.00',
      hasExceededSafetyCap: false,
    };
  }

  // Calculate estimated part count
  let partsPaise: number[] = [];

  if (mode === 'greedy') {
    // Greedy / Max Chunks: Fill each QR to max limit until remainder
    let remaining = totalPaise;
    while (remaining > 0) {
      const chunk = Math.min(remaining, effectiveLimitPaise);
      partsPaise.push(chunk);
      remaining -= chunk;
    }
  } else {
    // Equal Split: Divide into N parts where each part <= maxLimit
    const numParts = Math.ceil(totalPaise / effectiveLimitPaise);
    const basePaise = Math.floor(totalPaise / numParts);
    const remainderPaise = totalPaise % numParts;

    // Distribute base and spread remainder 1 paisa at a time across first parts
    for (let i = 0; i < numParts; i++) {
      const part = basePaise + (i < remainderPaise ? 1 : 0);
      partsPaise.push(part);
    }
  }

  // Safety Cap Check
  const hasExceededSafetyCap = partsPaise.length > MAX_SAFETY_PARTS_CAP;
  if (hasExceededSafetyCap) {
    return {
      totalAmount: amount,
      totalAmountFormatted: amount.toFixed(2),
      parts: [],
      totalParts: partsPaise.length,
      mode,
      maxLimit,
      isSingle: false,
      estimatedMdrSavings: 0,
      estimatedMdrSavingsFormatted: '0.00',
      hasExceededSafetyCap: true,
      validationError: `This configuration creates ${partsPaise.length} parts (maximum allowed is ${MAX_SAFETY_PARTS_CAP}). Please increase the limit per QR or reduce total amount.`,
    };
  }

  const totalParts = partsPaise.length;

  const parts: SplitPart[] = partsPaise.map((partPaise, index) => {
    const partIndex = index + 1;
    const partAmount = partPaise / 100;
    const partUri = generateUpiUri({
      upiId,
      payeeName,
      amount: partAmount,
      note,
      partIndex,
      totalParts,
    });

    const partTag = `Part ${partIndex}/${totalParts}`;
    const txNote = note ? `${note} (${partTag})` : `Rupeo Split Payment (${partTag})`;

    return {
      id: `part_${partIndex}_${Date.now()}`,
      partIndex,
      totalParts,
      amount: partAmount,
      amountFormatted: partAmount.toFixed(2),
      upiUri: partUri,
      note: txNote,
      isPaid: false,
    };
  });

  // Calculate estimated MDR savings:
  // Under official NPCI regulations, P2M transactions > ₹2,000 attract 0.40% MDR (and up to 1.1% on PPI wallets).
  // Transactions <= ₹2,000 remain strictly 0% free.
  let estimatedMdrSavings = 0;
  if (amount > 2000 && maxLimit <= 2000) {
    estimatedMdrSavings = Math.round(amount * 0.004 * 100) / 100;
  }

  return {
    totalAmount: amount,
    totalAmountFormatted: amount.toFixed(2),
    parts,
    totalParts,
    mode,
    maxLimit,
    isSingle: false,
    estimatedMdrSavings,
    estimatedMdrSavingsFormatted: estimatedMdrSavings.toFixed(2),
    hasExceededSafetyCap: false,
  };
}

/**
 * Generates an executive summary text for sharing all parts via text / WhatsApp
 */
export function generateBreakdownShareText(params: {
  payeeName?: string;
  upiId: string;
  breakdown: SplitBreakdown;
}): string {
  const { payeeName, upiId, breakdown } = params;
  const title = payeeName ? `Payment to ${payeeName}` : `Payment Request`;

  let text = `⚡ ${title} (via Rupeo Split Payment)\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💰 Total Amount: ₹${breakdown.totalAmountFormatted}\n`;
  text += `📱 Payee UPI ID: ${upiId}\n`;
  text += `🔢 Total Parts: ${breakdown.totalParts} (${breakdown.mode === 'greedy' ? 'Max Chunks' : 'Equal Split'})\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  breakdown.parts.forEach((p) => {
    const status = p.isPaid ? '✅ [PAID]' : '⏳ [PENDING]';
    text += `Part ${p.partIndex}/${p.totalParts}: ₹${p.amountFormatted} ${status}\n`;
    text += `👉 UPI Link: ${p.upiUri}\n\n`;
  });

  text += `Generated with Rupeo · Fast, secure & MDR-compliant payment tracking.`;
  return text;
}
