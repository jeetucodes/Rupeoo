/**
 * Auto Icon & Color Generator for Custom Bill Providers.
 * Pure functions, zero network dependencies.
 */

export const AUTO_ICON_PALETTE = [
  '#4F46E5', // Indigo
  '#059669', // Emerald
  '#DC2626', // Red
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#0284C7', // Sky Blue
  '#0D9488', // Teal
  '#EA580C', // Orange
  '#BE185D', // Pink
  '#475569', // Slate
] as const;

export const OVERRIDE_ICON_OPTIONS = [
  'receipt-outline',
  'wifi',
  'flash',
  'flame',
  'water',
  'home',
  'phone-portrait',
  'film',
  'musical-notes',
  'school',
  'barbell',
  'car-sport',
] as const;

export const OVERRIDE_COLOR_OPTIONS = [
  '#4F46E5',
  '#059669',
  '#DC2626',
  '#D97706',
  '#7C3AED',
  '#0284C7',
  '#0D9488',
  '#EA580C',
] as const;

export const CATEGORY_FALLBACK_ICONS: Record<string, string> = {
  Subscriptions: 'play-circle',
  Bills: 'receipt-outline',
  Food: 'restaurant',
  Groceries: 'nutrition',
  Rent: 'home',
  EMI: 'card',
  Entertainment: 'film',
  Utilities: 'flash',
  Others: 'receipt-outline',
};

interface KeywordRule {
  keywords: string[];
  icon: string;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    keywords: ['wifi', 'wi-fi', 'fiber', 'fibre', 'broadband', 'internet', 'net', 'xstream', 'router'],
    icon: 'wifi',
  },
  {
    keywords: ['sim', 'recharge', 'data', 'mobile', 'phone', 'cellular', 'talktime', 'call', 'prepaid', 'postpaid'],
    icon: 'phone-portrait',
  },
  {
    keywords: ['electricity', 'bijli', 'power', 'light', 'current', 'electric', 'energy', 'bijlee'],
    icon: 'flash',
  },
  {
    keywords: ['gas', 'cylinder', 'lpg', 'cng', 'petrol', 'fuel', 'diesel'],
    icon: 'flame',
  },
  {
    keywords: ['water', 'pani', 'paani', 'jal', 'sewer', 'tanker'],
    icon: 'water',
  },
  {
    keywords: ['rent', 'room', 'flat', 'house', 'pg', 'hostel', 'kiraya', 'kiraye', 'makan', 'apart'],
    icon: 'home',
  },
  {
    keywords: ['school', 'college', 'tuition', 'fees', 'education', 'course', 'class', 'classes', 'padhai', 'study', 'uni', 'university'],
    icon: 'school',
  },
  {
    keywords: ['gym', 'fitness', 'workout', 'training', 'yoga', 'exercise', 'kasrat'],
    icon: 'barbell',
  },
  {
    keywords: ['insurance', 'bima', 'beema', 'policy', 'lic', 'health', 'medicare'],
    icon: 'shield-checkmark',
  },
  {
    keywords: ['loan', 'emi', 'credit', 'card', 'kist', 'kisht', 'installment', 'debt', 'mortgage'],
    icon: 'card',
  },
  {
    keywords: ['netflix', 'ott', 'stream', 'prime', 'hotstar', 'movie', 'tv', 'cinema', 'theatre', 'show', 'disney'],
    icon: 'film',
  },
  {
    keywords: ['youtube', 'video', 'play'],
    icon: 'logo-youtube',
  },
  {
    keywords: ['spotify', 'music', 'gaana', 'sound', 'audio', 'podcast', 'wynk', 'saavn'],
    icon: 'musical-notes',
  },
  {
    keywords: ['mess', 'tiffin', 'food', 'khana', 'meal', 'canteen', 'lunch', 'dinner', 'swiggy', 'zomato'],
    icon: 'restaurant',
  },
  {
    keywords: ['milk', 'dairy', 'doodh', 'doodhiya', 'paneer'],
    icon: 'nutrition',
  },
  {
    keywords: ['maid', 'domestic', 'bai', 'servant', 'cleaner', 'cook', 'safai', 'helper'],
    icon: 'person',
  },
  {
    keywords: ['car', 'bike', 'vehicle', 'auto', 'fuel', 'petrol', 'parking', 'toll', 'fastag'],
    icon: 'car-sport',
  },
  {
    keywords: ['newspaper', 'akhbar', 'paper', 'mag', 'magazine'],
    icon: 'newspaper',
  },
  {
    keywords: ['medicine', 'doctor', 'hospital', 'pharma', 'dawakhana', 'clinic', 'medical'],
    icon: 'medkit',
  },
  {
    keywords: ['cloud', 'software', 'saas', 'domain', 'hosting', 'server', 'drive', 'icloud', 'google one'],
    icon: 'cloud',
  },
];

/**
 * Normalizes a provider name for comparison and hashing.
 */
export function normalizeProviderName(name: string): string {
  return (name || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Checks if a provider name already exists in an existing list (case-insensitive).
 */
export function isDuplicateProviderName(name: string, existingNames: string[]): boolean {
  const norm = normalizeProviderName(name).toLowerCase();
  if (!norm) return false;
  return existingNames.some(existing => normalizeProviderName(existing).toLowerCase() === norm);
}

/**
 * Extracts 1-2 initials safely supporting Devanagari, Arabic, emoji, and surrogate pairs.
 */
export function extractInitials(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';

  const chars = Array.from(trimmed);
  if (chars.length === 0) return '?';

  // If there are multiple words, take the first letter of first two words
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const firstChar = Array.from(words[0])[0] || '';
    const secondChar = Array.from(words[1])[0] || '';
    return (firstChar + secondChar).toUpperCase();
  }

  // Single word: take first 1 or 2 characters
  return chars.slice(0, Math.min(chars.length, 2)).join('').toUpperCase();
}

/**
 * Deterministically pick an accessible color from the 10-color palette using a hash of the name.
 */
export function getDeterministicColor(normalizedName: string): string {
  const clean = (normalizedName || '').toLowerCase().trim();
  if (!clean) return AUTO_ICON_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % AUTO_ICON_PALETTE.length;
  return AUTO_ICON_PALETTE[index];
}

/**
 * Finds the best Ionicons icon matching any keyword in the name,
 * or falls back to category default icon.
 */
export function matchIconForName(name: string, category: string = 'Bills'): string {
  const norm = normalizeProviderName(name).toLowerCase();
  const words = norm.split(/[\s,.-]+/).filter(Boolean);

  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      const kwLower = kw.toLowerCase();
      if (kwLower.includes(' ') || kwLower.includes('-')) {
        if (norm.includes(kwLower)) return rule.icon;
      } else {
        if (words.includes(kwLower)) return rule.icon;
        if (kwLower.length >= 4 && words.some(w => w.startsWith(kwLower))) return rule.icon;
      }
    }
  }

  return CATEGORY_FALLBACK_ICONS[category] || 'receipt-outline';
}

/**
 * Auto-generates iconKey, color and initials for a given provider name and category.
 */
export function getAutoIconForName(
  name: string,
  category: string = 'Bills'
): {
  iconKey: string;
  color: string;
  initials: string;
} {
  const normalized = normalizeProviderName(name);
  const initials = extractInitials(name);
  const color = getDeterministicColor(normalized);
  const iconKey = matchIconForName(name, category);

  return {
    iconKey,
    color,
    initials,
  };
}

/**
 * Creates a slug from a custom name (e.g., "Mummy's Phone" -> "mummys-phone").
 */
export function slugifyProviderName(name: string): string {
  return normalizeProviderName(name)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30) || 'custom';
}

export const generateAutoIcon = getAutoIconForName;
export const pickDeterministicColor = getDeterministicColor;
