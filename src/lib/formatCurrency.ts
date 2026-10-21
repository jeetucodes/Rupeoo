/**
 * Currency and amount formatting utilities.
 * Handles global currency formatting without hardcoding 'en-IN'.
 */

export function resolveCurrencySymbol(codeOrSymbol?: string): string {
  if (!codeOrSymbol) return '₹';
  const clean = codeOrSymbol.trim();
  switch (clean.toUpperCase()) {
    case 'INR':
    case '₹':
      return '₹';
    case 'USD':
    case '$':
      return '$';
    case 'EUR':
    case '€':
      return '€';
    case 'GBP':
    case '£':
      return '£';
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
    case 'MYR':
      return 'RM ';
    case 'IDR':
      return 'Rp ';
    case 'PHP':
      return '₱';
    case 'PKR':
      return 'Rs ';
    case 'BDT':
      return '৳';
    case 'NPR':
      return 'Rs ';
    case 'LKR':
      return 'Rs ';
    case 'NGN':
      return '₦';
    case 'ZAR':
      return 'R ';
    case 'KES':
      return 'KSh ';
    case 'EGP':
      return 'E£ ';
    default:
      return clean;
  }
}

export function formatCurrency(amount: number | string, currencyOrSymbol?: string): string {
  const num = Number(amount) || 0;
  const symbol = resolveCurrencySymbol(currencyOrSymbol);
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

export function formatAmountNumber(amount: number | string): string {
  const num = Number(amount) || 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
