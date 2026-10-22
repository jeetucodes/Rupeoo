/**
 * Central Currency Formatter for Rupeo
 *
 * Uses the Unicode escape '\u20B9' for the Rupee symbol to prevent encoding/mojibake corruption.
 * Formats with standard Indian grouping via Intl.NumberFormat('en-IN') with 2 decimals,
 * and formats signs cleanly (e.g. "-\u20B9349.00", "+\u20B91.00").
 */

export const RUPEE_SYMBOL = '\u20B9';

export interface FormatCurrencyOptions {
  /** Include explicit '+' sign for positive non-zero numbers */
  showPlus?: boolean;
  /** Currency code or symbol. Defaults to INR '\u20B9' */
  currency?: string;
  /** Decimal places (defaults to 2) */
  decimals?: number;
}

const indianCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Resolves standard currency symbol from code or existing symbol string.
 * Uses unicode escapes for symbols to guarantee file-encoding independence.
 */
export function resolveCurrencySymbol(codeOrSymbol?: string): string {
  if (!codeOrSymbol) return RUPEE_SYMBOL;
  const clean = codeOrSymbol.trim();
  switch (clean.toUpperCase()) {
    case 'INR':
    case '₹':
    case '\u20B9':
    case 'RS':
    case 'RS.':
    case '\u00E2\u201A\u00B9':
    case '\u00E2,\u00B9':
      return RUPEE_SYMBOL;
    case 'USD':
    case '$':
      return '$';
    case 'EUR':
    case '€':
      return '\u20AC';
    case 'GBP':
    case '£':
      return '\u00A3';
    case 'AED':
      return 'AED ';
    case 'SAR':
      return 'SAR ';
    case 'CAD':
      return 'CA$';
    case 'AUD':
      return 'A$';
    case 'SGD':
      return 'S$';
    default:
      return clean;
  }
}

/**
 * Formats a monetary amount into a localized currency string.
 *
 * Examples:
 *   formatCurrency(13971.89)               => "₹13,971.89"
 *   formatCurrency(-349)                   => "-₹349.00"
 *   formatCurrency(1, { showPlus: true })  => "+₹1.00"
 *   formatCurrency(168939.47)              => "₹1,68,939.47"
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options?: FormatCurrencyOptions | string
): string {
  const num = typeof amount === 'number'
    ? (isNaN(amount) ? 0 : amount)
    : parseFloat(String(amount ?? 0)) || 0;

  let showPlus = false;
  let currencyCode = 'INR';
  let decimals = 2;

  if (typeof options === 'string') {
    currencyCode = options;
  } else if (options) {
    if (options.showPlus) showPlus = true;
    if (options.currency) currencyCode = options.currency;
    if (typeof options.decimals === 'number') decimals = options.decimals;
  }

  const symbol = resolveCurrencySymbol(currencyCode);
  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formattedAbs = decimals === 2
    ? indianCurrencyFormatter.format(absNum)
    : absNum.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  if (isNegative) {
    return `-${symbol}${formattedAbs}`;
  }
  if (showPlus && num > 0) {
    return `+${symbol}${formattedAbs}`;
  }
  return `${symbol}${formattedAbs}`;
}

/**
 * Formats a raw number with Indian numbering grouping (2 decimal places by default).
 */
export function formatAmountNumber(
  amount: number | string | null | undefined,
  decimals: number = 2
): string {
  const num = typeof amount === 'number'
    ? (isNaN(amount) ? 0 : amount)
    : parseFloat(String(amount ?? 0)) || 0;

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formatted = decimals === 2
    ? indianCurrencyFormatter.format(absNum)
    : absNum.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return isNegative ? `-${formatted}` : formatted;
}

export default formatCurrency;
