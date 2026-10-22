import type { NotificationLanguage, NotificationMessageVariant, NotificationPlaceholders } from '../types.ts';
import { enMessages } from './en.ts';
import { hiMessages } from './hi.ts';
import { hinglishMessages } from './hinglish.ts';

export function getMessageDictionary(language: NotificationLanguage): Record<string, NotificationMessageVariant[]> {
  switch (language) {
    case 'hi':
      return hiMessages;
    case 'hinglish':
      return hinglishMessages;
    case 'en':
    default:
      return enMessages;
  }
}

/**
 * Replace placeholders like {name}, {spent}, {budget}, etc. in a string.
 */
export function formatStringWithPlaceholders(
  text: string,
  placeholders: NotificationPlaceholders
): string {
  let result = text;
  const entries: [string, string | number | undefined][] = [
    ['name', placeholders.name || 'Friend'],
    ['spent', placeholders.spent || '₹0'],
    ['budget', placeholders.budget || '₹0'],
    ['left', placeholders.left || '₹0'],
    ['over', placeholders.over || '₹0'],
    ['top_category', placeholders.top_category || 'General'],
    ['top_amount', placeholders.top_amount || '₹0'],
    ['count', placeholders.count ?? 0],
    ['biggest', placeholders.biggest || '₹0'],
    ['amount', placeholders.amount || '₹0'],
    ['merchant', placeholders.merchant || 'Store'],
  ];

  for (const [key, val] of entries) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, String(val ?? ''));
  }
  return result;
}

/**
 * Pick a variant randomly from the list while avoiding repeating yesterday's variant index.
 */
export function pickVariantIndex(
  variantCount: number,
  previousIndex: number = -1
): number {
  if (variantCount <= 1) return 0;

  // Generate available candidates excluding previousIndex
  const candidates: number[] = [];
  for (let i = 0; i < variantCount; i++) {
    if (i !== previousIndex) {
      candidates.push(i);
    }
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return chosen !== undefined ? chosen : 0;
}

/**
 * Resolve a fully rendered message with title and body.
 */
export function resolveNotificationMessage(
  key: string,
  language: NotificationLanguage,
  placeholders: NotificationPlaceholders,
  previousIndex: number = -1
): { title: string; body: string; variantIndex: number } {
  const dict = getMessageDictionary(language);
  const variants = dict[key] || enMessages[key] || [
    { title: 'Rupeo 💛', body: 'Friendly reminder from Rupeo.' },
  ];

  const variantIndex = pickVariantIndex(variants.length, previousIndex);
  const template = variants[variantIndex] || variants[0];

  return {
    title: formatStringWithPlaceholders(template.title, placeholders),
    body: formatStringWithPlaceholders(template.body, placeholders),
    variantIndex,
  };
}
