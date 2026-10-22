/**
 * Mojibake detection and cleanup utilities.
 * Uses unicode escapes so encoding issues never recur.
 */

export const RUPEE_SYMBOL = '\u20B9';

// Repair map using escaped unicode sequences
export const MOJIBAKE_REPLACEMENTS: [RegExp, string][] = [
  [/\u00E2\u201A\u00B9/g, RUPEE_SYMBOL], // Broken UTF-8 rupee symbol
  [/\u00E2,\u00B9/g, RUPEE_SYMBOL],      // Broken comma-separated rupee symbol
  [/\u00E2\u20AC\u201D/g, '—'],          // Em dash
  [/\u00E2\u20AC\u00A2/g, '•'],          // Bullet dot
  [/\u00E2\u0153\u00A6/g, '✦'],          // Star symbol
  [/\u00E2\u0153\u2026/g, '✅'],         // Checkmark emoji
  [/\u00E2\u20AC\u2122/g, "'"],          // Right single quote
  [/\u00E2\u20AC\u02DC/g, "'"],          // Left single quote
  [/\u00E2\u20AC\u0153/g, '"'],          // Left double quote
  [/\u00C2/g, ''],                        // Non-breaking space artifact
];

export function cleanMojibakeString(str: string): string {
  if (!str || typeof str !== 'string') return str;
  let res = str;
  for (const [regex, replacement] of MOJIBAKE_REPLACEMENTS) {
    if (regex.test(res)) {
      res = res.replace(regex, replacement);
    }
  }
  return res;
}

export function cleanMojibakeRecursive(obj: any): any {
  if (typeof obj === 'string') {
    return cleanMojibakeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanMojibakeRecursive);
  }
  if (obj && typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      cleaned[key] = cleanMojibakeRecursive(obj[key]);
    }
    return cleaned;
  }
  return obj;
}
