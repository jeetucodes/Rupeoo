import test from 'node:test';
import assert from 'node:assert';
import {
  resolveRegionFromCurrency,
  getProvidersForRegion,
  getRegionPreset,
  REGIONAL_PRESETS,
  resolveBrandTheme,
} from '../billProviders.ts';
import { resolveCurrency } from '../currencies.ts';
import {
  generateAutoIcon,
  normalizeProviderName,
  isDuplicateProviderName,
  extractInitials,
  pickDeterministicColor,
} from '../autoIcon.ts';

test('Bill Providers & AutoIcon Unit Tests', async (t) => {
  // ==================== 1. CURRENCY RESOLUTION (resolveCurrency) ====================
  await t.test('1. resolveCurrency resolves by currency code', () => {
    const usd = resolveCurrency('USD');
    assert.strictEqual(usd.code, 'USD');
    assert.strictEqual(usd.symbol, '$');

    const inr = resolveCurrency('INR');
    assert.strictEqual(inr.code, 'INR');
    assert.strictEqual(inr.symbol, '₹');

    const eur = resolveCurrency('EUR');
    assert.strictEqual(eur.code, 'EUR');
    assert.strictEqual(eur.symbol, '€');
  });

  await t.test('2. resolveCurrency resolves by symbol and handles ambiguous "$"', () => {
    // Ambiguous '$' must default to USD
    const dollar = resolveCurrency('$');
    assert.strictEqual(dollar.code, 'USD');

    // Indian Rupee symbol
    const rupee = resolveCurrency('₹');
    assert.strictEqual(rupee.code, 'INR');

    // Euro symbol
    const euro = resolveCurrency('€');
    assert.strictEqual(euro.code, 'EUR');

    // British Pound symbol
    const pound = resolveCurrency('£');
    assert.strictEqual(pound.code, 'GBP');
  });

  await t.test('3. resolveCurrency falls back to INR for unknown or empty values', () => {
    const unknown = resolveCurrency('UNKNOWN_XYZ');
    assert.strictEqual(unknown.code, 'INR');

    const empty = resolveCurrency('');
    assert.strictEqual(empty.code, 'INR');

    const nil = resolveCurrency(null);
    assert.strictEqual(nil.code, 'INR');
  });

  // ==================== 2. REGION & PRESET RESOLUTION ====================
  await t.test('4. resolveRegionFromCurrency resolves currency codes correctly', () => {
    assert.strictEqual(resolveRegionFromCurrency('INR'), 'INR');
    assert.strictEqual(resolveRegionFromCurrency('USD'), 'USD');
    assert.strictEqual(resolveRegionFromCurrency('GBP'), 'GBP');
    assert.strictEqual(resolveRegionFromCurrency('EUR'), 'EUR');
    assert.strictEqual(resolveRegionFromCurrency('AED'), 'AED');
    assert.strictEqual(resolveRegionFromCurrency('SAR'), 'SAR');
    assert.strictEqual(resolveRegionFromCurrency('PKR'), 'PKR');
    assert.strictEqual(resolveRegionFromCurrency('BDT'), 'BDT');
    assert.strictEqual(resolveRegionFromCurrency('CAD'), 'CAD');
    assert.strictEqual(resolveRegionFromCurrency('AUD'), 'AUD');
  });

  await t.test('5. resolveRegionFromCurrency resolves currency symbols correctly', () => {
    assert.strictEqual(resolveRegionFromCurrency('₹'), 'INR');
    assert.strictEqual(resolveRegionFromCurrency('€'), 'EUR');
    assert.strictEqual(resolveRegionFromCurrency('£'), 'GBP');
    assert.strictEqual(resolveRegionFromCurrency('৳'), 'BDT');
    assert.strictEqual(resolveRegionFromCurrency('₱'), 'PHP');
    assert.strictEqual(resolveRegionFromCurrency('RM'), 'MYR');
    assert.strictEqual(resolveRegionFromCurrency('Rp'), 'IDR');
    assert.strictEqual(resolveRegionFromCurrency('₦'), 'NGN');
  });

  await t.test('6. resolveRegionFromCurrency defaults ambiguous "$" symbol to USD', () => {
    assert.strictEqual(resolveRegionFromCurrency('$'), 'USD');
  });

  await t.test('7. resolveRegionFromCurrency falls back to GENERIC for unknown and INR for empty', () => {
    assert.strictEqual(resolveRegionFromCurrency('XYZ'), 'GENERIC');
    assert.strictEqual(resolveRegionFromCurrency(''), 'INR');
    assert.strictEqual(resolveRegionFromCurrency(undefined), 'INR');
  });

  await t.test('8. EUR preset includes only pan-regional services & generics, NO country carriers', () => {
    const eurProviders = getProvidersForRegion('EUR');
    assert.ok(eurProviders.length >= 8);

    // Must not contain country-specific carriers
    assert.ok(!eurProviders.some(p => p.id === 'eu_orange'));
    assert.ok(!eurProviders.some(p => p.id === 'eu_telekom'));
    assert.ok(!eurProviders.some(p => p.id === 'eu_vodafone'));

    // Must contain pan-regional & generics
    assert.ok(eurProviders.some(p => p.id === 'eu_mobile'));
    assert.ok(eurProviders.some(p => p.id === 'eu_fiber'));
    assert.ok(eurProviders.some(p => p.id === 'eu_netflix'));
    assert.ok(eurProviders.some(p => p.id === 'eu_spotify'));
    assert.ok(eurProviders.some(p => p.id === 'eu_rent'));
    assert.ok(eurProviders.some(p => p.id === 'eu_electricity'));
  });

  await t.test('9. GENERIC preset provides universal items for unlisted currencies', () => {
    const genericProviders = getProvidersForRegion('GENERIC');
    assert.ok(genericProviders.length >= 8);

    // Generic items: mobile, internet, rent, electricity, gas, water, loan, gym
    assert.ok(genericProviders.some(p => p.id === 'gen_mobile'));
    assert.ok(genericProviders.some(p => p.id === 'gen_internet'));
    assert.ok(genericProviders.some(p => p.id === 'gen_rent'));
    assert.ok(genericProviders.some(p => p.id === 'gen_electricity'));
    assert.ok(genericProviders.some(p => p.id === 'gen_gas'));
    assert.ok(genericProviders.some(p => p.id === 'gen_water'));
    assert.ok(genericProviders.some(p => p.id === 'gen_loan'));
    assert.ok(genericProviders.some(p => p.id === 'gen_gym'));
  });

  // ==================== 3. NAME VALIDATION & DUPLICATE TESTS ====================
  await t.test('10. normalizeProviderName collapses spaces, trims and strips control chars', () => {
    assert.strictEqual(normalizeProviderName('  My   WiFi \u0000  '), 'My WiFi');
    assert.strictEqual(normalizeProviderName('Netflix\t\nPremium'), 'Netflix Premium');
  });

  await t.test('11. isDuplicateProviderName performs case-insensitive check against lists', () => {
    const existing = ['Jio Mobile Recharge', 'Airtel Fiber', 'Netflix'];
    assert.strictEqual(isDuplicateProviderName('jio mobile recharge', existing), true);
    assert.strictEqual(isDuplicateProviderName('AIRTEL FIBER', existing), true);
    assert.strictEqual(isDuplicateProviderName('netflix', existing), true);
    assert.strictEqual(isDuplicateProviderName('Gym Membership', existing), false);
  });

  // ==================== 4. AUTO ICON KEYWORD MATCHING TESTS ====================
  await t.test('12. generateAutoIcon matches English and Hindi/Hinglish telecom keywords', () => {
    const res1 = generateAutoIcon('Jio Recharge');
    assert.strictEqual(res1.iconKey, 'phone-portrait');

    const res2 = generateAutoIcon('Airtel SIM Card');
    assert.strictEqual(res2.iconKey, 'phone-portrait');

    const res3 = generateAutoIcon('Phone Pe Data Pack');
    assert.strictEqual(res3.iconKey, 'phone-portrait');
  });

  await t.test('13. generateAutoIcon matches utilities: electricity / bijli, gas, water', () => {
    assert.strictEqual(generateAutoIcon('Bijli Bill').iconKey, 'flash');
    assert.strictEqual(generateAutoIcon('Electricity Board').iconKey, 'flash');
    assert.strictEqual(generateAutoIcon('Indane Gas Cylinder').iconKey, 'flame');
    assert.strictEqual(generateAutoIcon('Water Supply Paani').iconKey, 'water');
  });

  await t.test('14. generateAutoIcon matches rent, home, and flat keywords', () => {
    assert.strictEqual(generateAutoIcon('Flat Rent PG').iconKey, 'home');
    assert.strictEqual(generateAutoIcon('Room Kiraya').iconKey, 'home');
    assert.strictEqual(generateAutoIcon('Office Rent').iconKey, 'home');
  });

  await t.test('15. generateAutoIcon matches food, mess, tiffin, milk, dairy', () => {
    assert.strictEqual(generateAutoIcon('Sharma Mess Tiffin Service').iconKey, 'restaurant');
    assert.strictEqual(generateAutoIcon('Sharma Mess').iconKey, 'restaurant');
    assert.strictEqual(generateAutoIcon('Amul Milk Dairy').iconKey, 'nutrition');
  });

  await t.test('16. generateAutoIcon matches streaming / OTT keywords', () => {
    assert.strictEqual(generateAutoIcon('Netflix Family').iconKey, 'film');
    assert.strictEqual(generateAutoIcon('Spotify Premium Music').iconKey, 'musical-notes');
    assert.strictEqual(generateAutoIcon('YouTube Membership').iconKey, 'logo-youtube');
  });

  await t.test('17. generateAutoIcon matches EMI, loans, school fees, and gym', () => {
    assert.strictEqual(generateAutoIcon('HDFC Home Loan EMI').iconKey, 'card');
    assert.strictEqual(generateAutoIcon('DPS School Fees').iconKey, 'school');
    assert.strictEqual(generateAutoIcon('Gold Gym Membership').iconKey, 'barbell');
  });

  // ==================== 5. MULTI-SCRIPT INITIALS EXTRACTION TESTS ====================
  await t.test('18. extractInitials handles ASCII English correctly', () => {
    assert.strictEqual(extractInitials('My WiFi'), 'MW');
    assert.strictEqual(extractInitials('Netflix'), 'NE');
    assert.strictEqual(extractInitials('A'), 'A');
  });

  await t.test('19. extractInitials safely extracts Devanagari Hindi characters without splitting code points', () => {
    const hindi1 = extractInitials('बिजली बिल');
    assert.ok(hindi1.length > 0);

    const hindi2 = extractInitials('किराया');
    assert.ok(hindi2.length > 0);
  });

  await t.test('20. extractInitials safely handles Arabic characters', () => {
    const arabic = extractInitials('فاتورة كهرباء');
    assert.ok(arabic.length > 0);
  });

  await t.test('21. extractInitials safely handles emoji characters', () => {
    const emoji = extractInitials('🍕 Pizza Club');
    assert.ok(emoji.length > 0);

    const lightning = extractInitials('⚡ Electricity');
    assert.ok(lightning.length > 0);
  });

  // ==================== 6. COLOR DETERMINISM TESTS ====================
  await t.test('22. pickDeterministicColor is consistent and deterministic for the same input', () => {
    const color1 = pickDeterministicColor('Gym Membership');
    const color2 = pickDeterministicColor('Gym Membership');
    assert.strictEqual(color1, color2);

    const color3 = pickDeterministicColor('gym membership');
    assert.strictEqual(color1, color3); // Case-insensitive determinism
  });

  await t.test('23. pickDeterministicColor produces a valid hex color string', () => {
    const color = pickDeterministicColor('Sample Bill');
    assert.match(color, /^#[0-9A-Fa-f]{6}$/);
  });

  await t.test('24. generateAutoIcon provides complete result object', () => {
    const res = generateAutoIcon('Starlink Internet');
    assert.ok(res.iconKey);
    assert.ok(res.color);
    assert.ok(res.initials);
  });

  await t.test('25. fallback category icon is used when no keyword matches', () => {
    const res = generateAutoIcon('Unknown Random Name 123', 'Rent');
    assert.strictEqual(res.iconKey, 'home');
  });

  // ==================== 7. LEGACY COMPATIBILITY TESTS ====================
  await t.test('26. legacy resolveBrandTheme resolves "jio" correctly', () => {
    const theme = resolveBrandTheme('jio');
    assert.strictEqual(theme.id, 'jio');
    assert.strictEqual(theme.name, 'Jio');
    assert.strictEqual(theme.accent, '#0A2885');
    assert.strictEqual(theme.badge, 'Jio');
  });

  await t.test('27. legacy resolveBrandTheme resolves "airtel" correctly', () => {
    const theme = resolveBrandTheme('airtel');
    assert.strictEqual(theme.id, 'airtel');
    assert.strictEqual(theme.name, 'Airtel');
    assert.strictEqual(theme.accent, '#ED1C24');
    assert.strictEqual(theme.badge, 'airtel');
  });

  await t.test('28. legacy resolveBrandTheme resolves "custom" correctly', () => {
    const theme = resolveBrandTheme('custom', 'Old Custom Bill', 'Food');
    assert.strictEqual(theme.id, 'custom');
    assert.strictEqual(theme.name, 'Old Custom Bill');
    assert.strictEqual(theme.category, 'Food');
    assert.strictEqual(theme.accent, '#6366F1');
  });

  await t.test('29. resolveBrandTheme resolves "custom:slug" with brandColor and brandBadge', () => {
    const theme = resolveBrandTheme('custom:society-maintenance', 'Society Maintenance', 'Bills', '#0284C7', 'SM');
    assert.strictEqual(theme.id, 'custom:society-maintenance');
    assert.strictEqual(theme.name, 'Society Maintenance');
    assert.strictEqual(theme.accent, '#0284C7');
    assert.strictEqual(theme.badge, 'SM');
  });
});
