/**
 * Global Regional Bill Providers Catalogue.
 * Keyed by region / currency code.
 *
 * NOTE FOR REVIEW:
 * All regional provider presets are well-known operating service providers in each country.
 * Brand lists should be periodically verified before major regional releases.
 * No proprietary brand image assets are bundled — text badges & palette colors only.
 */

export interface BrandProvider {
  id: string;
  name: string;
  badge: string;
  category: string;
  type: 'cycle_days' | 'monthly_date';
  dueDay: string;
  cycleDays: string;
  color: string;
  bgColor: string;
  icon: string;
  group: 'sim' | 'daily' | 'ott' | 'wifi' | 'utility' | 'other';
}

export interface RegionPreset {
  code: string;
  currency: string;
  currencySymbol: string;
  name: string;
  flag: string;
  quickAmounts?: {
    cycle_days?: string[];
    monthly_date?: string[];
  };
  providers: BrandProvider[];
}

// 1. INDIA (INR) - Preserving exact existing provider IDs and configs
export const INDIA_PROVIDERS: BrandProvider[] = [
  // Telecom SIMs (Recharge Packs)
  { id: 'jio', name: 'Jio Mobile Recharge', badge: 'Jio', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#0A2885', bgColor: '#0A288518', icon: 'phone-portrait', group: 'sim' },
  { id: 'airtel', name: 'Airtel Mobile Recharge', badge: 'airtel', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#ED1C24', bgColor: '#ED1C2418', icon: 'phone-portrait', group: 'sim' },
  { id: 'vi', name: 'Vi (Vodafone Idea) Recharge', badge: 'Vi', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#E60000', bgColor: '#E6000018', icon: 'phone-portrait', group: 'sim' },
  { id: 'bsnl', name: 'BSNL Mobile Recharge', badge: 'BSNL', category: 'Subscriptions', type: 'cycle_days', dueDay: '30', cycleDays: '28', color: '#005BA6', bgColor: '#005BA618', icon: 'phone-portrait', group: 'sim' },

  // Daily Services, Mess & Food (Monthly)
  { id: 'tiffin', name: 'Mess / Tiffin Service', badge: 'Mess / Tiffin', category: 'Food', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#F97316', bgColor: '#F9731618', icon: 'restaurant', group: 'daily' },
  { id: 'rent', name: 'Room / Flat Rent', badge: 'Flat Rent', category: 'Rent', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#10B981', bgColor: '#10B98118', icon: 'home', group: 'daily' },
  { id: 'milk', name: 'Milk Delivery', badge: 'Milk / Dairy', category: 'Groceries', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#0284C7', bgColor: '#0284C718', icon: 'nutrition', group: 'daily' },
  { id: 'maid', name: 'Maid Salary', badge: 'House Maid', category: 'Bills', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#8B5CF6', bgColor: '#8B5CF618', icon: 'person', group: 'daily' },

  // Utilities & Bills (Monthly)
  { id: 'electricity', name: 'Electricity Bill', badge: 'Bijli Bill', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
  { id: 'gas', name: 'LPG Cylinder / Gas', badge: 'Gas Cylinder', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#F97316', bgColor: '#F9731618', icon: 'flame', group: 'utility' },
  { id: 'water', name: 'Water Supply Bill', badge: 'Water Bill', category: 'Bills', type: 'monthly_date', dueDay: '25', cycleDays: '30', color: '#06B6D4', bgColor: '#06B6D418', icon: 'water', group: 'utility' },
  { id: 'emi', name: 'Loan / Credit EMI', badge: 'Loan EMI', category: 'EMI', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#E11D48', bgColor: '#E11D4818', icon: 'card', group: 'utility' },
  { id: 'gym', name: 'Gym Membership', badge: 'Gym / Fitness', category: 'Others', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#10B981', bgColor: '#10B98118', icon: 'barbell', group: 'utility' },

  // WiFi & Broadband (Monthly)
  { id: 'jiofiber', name: 'JioFiber Broadband', badge: 'JioFiber', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#0A2885', bgColor: '#0A288518', icon: 'wifi', group: 'wifi' },
  { id: 'airtel_xstream', name: 'Airtel Xstream Fiber', badge: 'Airtel Fiber', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#ED1C24', bgColor: '#ED1C2418', icon: 'wifi', group: 'wifi' },
  { id: 'act', name: 'ACT Fibernet', badge: 'ACT Fiber', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#E31E24', bgColor: '#E31E2418', icon: 'wifi', group: 'wifi' },

  // OTT & Subscriptions (Monthly)
  { id: 'netflix', name: 'Netflix Subscription', badge: 'Netflix', category: 'Subscriptions', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#E50914', bgColor: '#E5091418', icon: 'film', group: 'ott' },
  { id: 'prime', name: 'Amazon Prime', badge: 'Prime Video', category: 'Subscriptions', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#00A8E1', bgColor: '#00A8E118', icon: 'play-circle', group: 'ott' },
  { id: 'hotstar', name: 'Disney+ Hotstar', badge: 'Hotstar', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#0C1E3C', bgColor: '#0C1E3C18', icon: 'play-circle', group: 'ott' },
  { id: 'spotify', name: 'Spotify Premium', badge: 'Spotify', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#1DB954', bgColor: '#1DB95418', icon: 'musical-notes', group: 'ott' },
  { id: 'youtube', name: 'YouTube Premium', badge: 'YouTube', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#FF0000', bgColor: '#FF000018', icon: 'logo-youtube', group: 'ott' },
];

// RE-EXPORT FOR BACKWARD COMPATIBILITY
export const BRAND_PROVIDERS: BrandProvider[] = INDIA_PROVIDERS;

// Universal baseline items added to regional catalogues
const getUniversalItems = (currencyCode: string): BrandProvider[] => [
  { id: `${currencyCode}_rent`, name: 'House / Apartment Rent', badge: 'Rent', category: 'Rent', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#10B981', bgColor: '#10B98118', icon: 'home', group: 'daily' },
  { id: `${currencyCode}_electricity`, name: 'Electricity / Power', badge: 'Electric', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
  { id: `${currencyCode}_water`, name: 'Water / Sewage Bill', badge: 'Water', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#06B6D4', bgColor: '#06B6D418', icon: 'water', group: 'utility' },
  { id: `${currencyCode}_gas`, name: 'Gas / Heating', badge: 'Gas', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#F97316', bgColor: '#F9731618', icon: 'flame', group: 'utility' },
  { id: `${currencyCode}_loan`, name: 'Loan / Mortgage / EMI', badge: 'Loan EMI', category: 'EMI', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#E11D48', bgColor: '#E11D4818', icon: 'card', group: 'utility' },
  { id: `${currencyCode}_insurance`, name: 'Insurance (Health / Auto)', badge: 'Insurance', category: 'Bills', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#6366F1', bgColor: '#6366F118', icon: 'shield-checkmark', group: 'utility' },
  { id: `${currencyCode}_gym`, name: 'Gym / Fitness Membership', badge: 'Gym', category: 'Others', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#10B981', bgColor: '#10B98118', icon: 'barbell', group: 'utility' },
  { id: `${currencyCode}_netflix`, name: 'Netflix', badge: 'Netflix', category: 'Subscriptions', type: 'monthly_date', dueDay: '5', cycleDays: '30', color: '#E50914', bgColor: '#E5091418', icon: 'film', group: 'ott' },
  { id: `${currencyCode}_spotify`, name: 'Spotify', badge: 'Spotify', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#1DB954', bgColor: '#1DB95418', icon: 'musical-notes', group: 'ott' },
  { id: `${currencyCode}_youtube`, name: 'YouTube Premium', badge: 'YouTube', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#FF0000', bgColor: '#FF000018', icon: 'logo-youtube', group: 'ott' },
  { id: `${currencyCode}_prime`, name: 'Amazon Prime', badge: 'Prime', category: 'Subscriptions', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#00A8E1', bgColor: '#00A8E118', icon: 'play-circle', group: 'ott' },
];

export const REGIONAL_PRESETS: Record<string, RegionPreset> = {
  INR: {
    code: 'INR',
    currency: 'INR',
    currencySymbol: '₹',
    name: 'India',
    flag: '🇮🇳',
    quickAmounts: {
      cycle_days: ['199', '299', '666', '749', '1499', '2999'],
      monthly_date: ['500', '1500', '3000', '5000', '8000', '15000'],
    },
    providers: INDIA_PROVIDERS,
  },

  USD: {
    code: 'USD',
    currency: 'USD',
    currencySymbol: '$',
    name: 'United States',
    flag: '🇺🇸',
    quickAmounts: {
      cycle_days: ['35', '50', '65', '85'],
      monthly_date: ['25', '50', '100', '250', '500', '1200'],
    },
    providers: [
      { id: 'us_verizon', name: 'Verizon Wireless', badge: 'Verizon', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#CD040B', bgColor: '#CD040B18', icon: 'phone-portrait', group: 'sim' },
      { id: 'us_att', name: 'AT&T Mobility', badge: 'AT&T', category: 'Subscriptions', type: 'monthly_date', dueDay: '18', cycleDays: '30', color: '#00A8E0', bgColor: '#00A8E018', icon: 'phone-portrait', group: 'sim' },
      { id: 'us_tmobile', name: 'T-Mobile', badge: 'T-Mobile', category: 'Subscriptions', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#E20074', bgColor: '#E2007418', icon: 'phone-portrait', group: 'sim' },
      { id: 'us_xfinity', name: 'Xfinity Internet / Comcast', badge: 'Xfinity', category: 'Bills', type: 'monthly_date', dueDay: '12', cycleDays: '30', color: '#7822FF', bgColor: '#7822FF18', icon: 'wifi', group: 'wifi' },
      { id: 'us_spectrum', name: 'Charter Spectrum Internet', badge: 'Spectrum', category: 'Bills', type: 'monthly_date', dueDay: '14', cycleDays: '30', color: '#00629B', bgColor: '#00629B18', icon: 'wifi', group: 'wifi' },
      { id: 'us_disney', name: 'Disney+ / Hulu / ESPN Bundle', badge: 'Disney+', category: 'Subscriptions', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#113CCF', bgColor: '#113CCF18', icon: 'film', group: 'ott' },
      { id: 'us_appleone', name: 'Apple One / iCloud', badge: 'Apple', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#000000', bgColor: '#00000018', icon: 'cloud', group: 'ott' },
      ...getUniversalItems('us'),
    ],
  },

  GBP: {
    code: 'GBP',
    currency: 'GBP',
    currencySymbol: '£',
    name: 'United Kingdom',
    flag: '🇬🇧',
    quickAmounts: {
      cycle_days: ['10', '15', '20', '30'],
      monthly_date: ['20', '40', '80', '150', '350', '800'],
    },
    providers: [
      { id: 'uk_ee', name: 'EE Mobile', badge: 'EE', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#007B85', bgColor: '#007B8518', icon: 'phone-portrait', group: 'sim' },
      { id: 'uk_o2', name: 'O2 (Virgin Media O2)', badge: 'O2', category: 'Subscriptions', type: 'monthly_date', dueDay: '12', cycleDays: '30', color: '#032B82', bgColor: '#032B8218', icon: 'phone-portrait', group: 'sim' },
      { id: 'uk_vodafone', name: 'Vodafone UK', badge: 'Vodafone', category: 'Subscriptions', type: 'monthly_date', dueDay: '18', cycleDays: '30', color: '#E60000', bgColor: '#E6000018', icon: 'phone-portrait', group: 'sim' },
      { id: 'uk_bt', name: 'BT Broadband', badge: 'BT', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#5514B4', bgColor: '#5514B418', icon: 'wifi', group: 'wifi' },
      { id: 'uk_virgin', name: 'Virgin Media Broadband', badge: 'Virgin', category: 'Bills', type: 'monthly_date', dueDay: '8', cycleDays: '30', color: '#CC0000', bgColor: '#CC000018', icon: 'wifi', group: 'wifi' },
      { id: 'uk_council_tax', name: 'Council Tax', badge: 'Council Tax', category: 'Bills', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#0284C7', bgColor: '#0284C718', icon: 'receipt-outline', group: 'utility' },
      ...getUniversalItems('uk'),
    ],
  },

  EUR: {
    code: 'EUR',
    currency: 'EUR',
    currencySymbol: '€',
    name: 'Eurozone (Europe)',
    flag: '🇪🇺',
    quickAmounts: {
      cycle_days: ['15', '25', '35'],
      monthly_date: ['30', '60', '120', '250', '500', '900'],
    },
    // Pan-regional Eurozone services plus generics — strictly no country-specific carriers
    providers: [
      { id: 'eu_mobile', name: 'Mobile Recharge / Plan', badge: 'Mobile', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#2563EB', bgColor: '#2563EB18', icon: 'phone-portrait', group: 'sim' },
      { id: 'eu_fiber', name: 'Internet / Fiber Broadband', badge: 'Internet', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#0284C7', bgColor: '#0284C718', icon: 'wifi', group: 'wifi' },
      { id: 'eu_disney', name: 'Disney+', badge: 'Disney+', category: 'Subscriptions', type: 'monthly_date', dueDay: '12', cycleDays: '30', color: '#113CCF', bgColor: '#113CCF18', icon: 'film', group: 'ott' },
      { id: 'eu_apple', name: 'Apple One / iCloud', badge: 'Apple', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#334155', bgColor: '#33415518', icon: 'cloud', group: 'ott' },
      ...getUniversalItems('eu'),
    ],
  },

  AED: {
    code: 'AED',
    currency: 'AED',
    currencySymbol: 'د.إ',
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    quickAmounts: {
      cycle_days: ['50', '100', '150', '250'],
      monthly_date: ['100', '250', '500', '1000', '2500', '5000'],
    },
    providers: [
      { id: 'ae_etisalat', name: 'e& (Etisalat) Mobile', badge: 'e&', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#719E19', bgColor: '#719E1918', icon: 'phone-portrait', group: 'sim' },
      { id: 'ae_du', name: 'du Telecom', badge: 'du', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#00A9CE', bgColor: '#00A9CE18', icon: 'phone-portrait', group: 'sim' },
      { id: 'ae_dewa', name: 'DEWA (Dubai Electricity & Water)', badge: 'DEWA', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#006633', bgColor: '#00663318', icon: 'flash', group: 'utility' },
      { id: 'ae_sewa', name: 'SEWA (Sharjah Electricity & Water)', badge: 'SEWA', category: 'Bills', type: 'monthly_date', dueDay: '25', cycleDays: '30', color: '#0B5394', bgColor: '#0B539418', icon: 'flash', group: 'utility' },
      { id: 'ae_salik', name: 'Salik Toll Recharge', badge: 'Salik', category: 'Bills', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#FF6D00', bgColor: '#FF6D0018', icon: 'car-sport', group: 'utility' },
      ...getUniversalItems('ae'),
    ],
  },

  SAR: {
    code: 'SAR',
    currency: 'SAR',
    currencySymbol: '﷼',
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    quickAmounts: {
      cycle_days: ['50', '100', '170', '230'],
      monthly_date: ['100', '200', '400', '800', '1500', '3000'],
    },
    providers: [
      { id: 'sa_stc', name: 'stc Mobile (Sawa)', badge: 'stc', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '28', color: '#4F008C', bgColor: '#4F008C18', icon: 'phone-portrait', group: 'sim' },
      { id: 'sa_mobily', name: 'Mobily Recharge', badge: 'Mobily', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '28', color: '#0097D7', bgColor: '#0097D718', icon: 'phone-portrait', group: 'sim' },
      { id: 'sa_zain', name: 'Zain KSA', badge: 'Zain', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '28', color: '#231F20', bgColor: '#231F2018', icon: 'phone-portrait', group: 'sim' },
      { id: 'sa_sec', name: 'Saudi Electricity Company (SEC)', badge: 'SEC', category: 'Bills', type: 'monthly_date', dueDay: '28', cycleDays: '30', color: '#E86C00', bgColor: '#E86C0018', icon: 'flash', group: 'utility' },
      ...getUniversalItems('sa'),
    ],
  },

  PKR: {
    code: 'PKR',
    currency: 'PKR',
    currencySymbol: '₨',
    name: 'Pakistan',
    flag: '🇵🇰',
    quickAmounts: {
      cycle_days: ['500', '1000', '1500', '2500'],
      monthly_date: ['2000', '5000', '10000', '20000', '40000', '80000'],
    },
    providers: [
      { id: 'pk_jazz', name: 'Jazz Mobile Package', badge: 'Jazz', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#D4101A', bgColor: '#D4101A18', icon: 'phone-portrait', group: 'sim' },
      { id: 'pk_zong', name: 'Zong 4G Package', badge: 'Zong', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#669933', bgColor: '#66993318', icon: 'phone-portrait', group: 'sim' },
      { id: 'pk_telenor', name: 'Telenor Pakistan', badge: 'Telenor', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#0099FF', bgColor: '#0099FF18', icon: 'phone-portrait', group: 'sim' },
      { id: 'pk_ufone', name: 'Ufone 4G', badge: 'Ufone', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#F7941E', bgColor: '#F7941E18', icon: 'phone-portrait', group: 'sim' },
      { id: 'pk_ptcl', name: 'PTCL Broadband / Flash Fiber', badge: 'PTCL', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#00543D', bgColor: '#00543D18', icon: 'wifi', group: 'wifi' },
      { id: 'pk_kelectric', name: 'K-Electric / LESCO / WAPDA', badge: 'Bijli', category: 'Bills', type: 'monthly_date', dueDay: '18', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
      { id: 'pk_sui_gas', name: 'SSGC / SNGPL Sui Gas', badge: 'Gas', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#F97316', bgColor: '#F9731618', icon: 'flame', group: 'utility' },
      ...getUniversalItems('pk'),
    ],
  },

  BDT: {
    code: 'BDT',
    currency: 'BDT',
    currencySymbol: '৳',
    name: 'Bangladesh',
    flag: '🇧🇩',
    quickAmounts: {
      cycle_days: ['199', '349', '499', '999'],
      monthly_date: ['1000', '2500', '5000', '10000', '20000'],
    },
    providers: [
      { id: 'bd_grameenphone', name: 'Grameenphone (GP)', badge: 'GP', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#00A9E0', bgColor: '#00A9E018', icon: 'phone-portrait', group: 'sim' },
      { id: 'bd_robi', name: 'Robi Axiata', badge: 'Robi', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#E4002B', bgColor: '#E4002B18', icon: 'phone-portrait', group: 'sim' },
      { id: 'bd_banglalink', name: 'Banglalink', badge: 'Banglalink', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#F37021', bgColor: '#F3702118', icon: 'phone-portrait', group: 'sim' },
      { id: 'bd_teletalk', name: 'Teletalk Bangladesh', badge: 'Teletalk', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#00923F', bgColor: '#00923F18', icon: 'phone-portrait', group: 'sim' },
      { id: 'bd_desco', name: 'DESCO / DPDC Electricity', badge: 'DESCO', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
      ...getUniversalItems('bd'),
    ],
  },

  NPR: {
    code: 'NPR',
    currency: 'NPR',
    currencySymbol: 'रू',
    name: 'Nepal',
    flag: '🇳🇵',
    quickAmounts: {
      cycle_days: ['299', '599', '999', '1499'],
      monthly_date: ['1000', '2500', '5000', '10000', '25000'],
    },
    providers: [
      { id: 'np_ntc', name: 'Nepal Telecom (NTC)', badge: 'NTC', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '28', color: '#0B5394', bgColor: '#0B539418', icon: 'phone-portrait', group: 'sim' },
      { id: 'np_ncell', name: 'Ncell Axiata', badge: 'Ncell', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '28', color: '#6A1B9A', bgColor: '#6A1B9A18', icon: 'phone-portrait', group: 'sim' },
      { id: 'np_worldlink', name: 'WorldLink Internet', badge: 'WorldLink', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#E65100', bgColor: '#E6510018', icon: 'wifi', group: 'wifi' },
      { id: 'np_nea', name: 'Nepal Electricity Authority (NEA)', badge: 'NEA', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
      ...getUniversalItems('np'),
    ],
  },

  LKR: {
    code: 'LKR',
    currency: 'LKR',
    currencySymbol: 'Rs',
    name: 'Sri Lanka',
    flag: '🇱🇰',
    quickAmounts: {
      cycle_days: ['499', '999', '1999', '3499'],
      monthly_date: ['2500', '5000', '10000', '25000', '50000'],
    },
    providers: [
      { id: 'lk_dialog', name: 'Dialog Axiata', badge: 'Dialog', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#D91D24', bgColor: '#D91D2418', icon: 'phone-portrait', group: 'sim' },
      { id: 'lk_mobitel', name: 'Mobitel (SLT-Mobitel)', badge: 'Mobitel', category: 'Subscriptions', type: 'monthly_date', dueDay: '18', cycleDays: '30', color: '#005BA6', bgColor: '#005BA618', icon: 'phone-portrait', group: 'sim' },
      { id: 'lk_ceb', name: 'CEB Electricity Bill', badge: 'CEB', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
      ...getUniversalItems('lk'),
    ],
  },

  IDR: {
    code: 'IDR',
    currency: 'IDR',
    currencySymbol: 'Rp',
    name: 'Indonesia',
    flag: '🇮🇩',
    quickAmounts: {
      cycle_days: ['50000', '100000', '150000', '250000'],
      monthly_date: ['200000', '500000', '1000000', '2500000'],
    },
    providers: [
      { id: 'id_telkomsel', name: 'Telkomsel', badge: 'Telkomsel', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#ED1C24', bgColor: '#ED1C2418', icon: 'phone-portrait', group: 'sim' },
      { id: 'id_indosat', name: 'Indosat Ooredoo Hutchison', badge: 'Indosat', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#FFB800', bgColor: '#FFB80018', icon: 'phone-portrait', group: 'sim' },
      { id: 'id_xl', name: 'XL Axiata', badge: 'XL', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#002D72', bgColor: '#002D7218', icon: 'phone-portrait', group: 'sim' },
      { id: 'id_indihome', name: 'IndiHome Internet', badge: 'IndiHome', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#E60000', bgColor: '#E6000018', icon: 'wifi', group: 'wifi' },
      { id: 'id_pln', name: 'PLN Electricity (Listrik)', badge: 'PLN', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#0097D7', bgColor: '#0097D718', icon: 'flash', group: 'utility' },
      ...getUniversalItems('id'),
    ],
  },

  PHP: {
    code: 'PHP',
    currency: 'PHP',
    currencySymbol: '₱',
    name: 'Philippines',
    flag: '🇵🇭',
    quickAmounts: {
      cycle_days: ['99', '299', '599', '999'],
      monthly_date: ['500', '1500', '3000', '6000', '12000'],
    },
    providers: [
      { id: 'ph_globe', name: 'Globe Telecom', badge: 'Globe', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#0047BA', bgColor: '#0047BA18', icon: 'phone-portrait', group: 'sim' },
      { id: 'ph_smart', name: 'Smart Communications', badge: 'Smart', category: 'Subscriptions', type: 'monthly_date', dueDay: '18', cycleDays: '30', color: '#00853F', bgColor: '#00853F18', icon: 'phone-portrait', group: 'sim' },
      { id: 'ph_pldt', name: 'PLDT Home Fiber', badge: 'PLDT', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#D91D24', bgColor: '#D91D2418', icon: 'wifi', group: 'wifi' },
      { id: 'ph_meralco', name: 'Meralco Electricity', badge: 'Meralco', category: 'Bills', type: 'monthly_date', dueDay: '22', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
      ...getUniversalItems('ph'),
    ],
  },

  MYR: {
    code: 'MYR',
    currency: 'MYR',
    currencySymbol: 'RM',
    name: 'Malaysia',
    flag: '🇲🇾',
    quickAmounts: {
      cycle_days: ['30', '50', '80', '120'],
      monthly_date: ['50', '100', '200', '500', '1200'],
    },
    providers: [
      { id: 'my_maxis', name: 'Maxis / Hotlink', badge: 'Maxis', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#78BE20', bgColor: '#78BE2018', icon: 'phone-portrait', group: 'sim' },
      { id: 'my_celcomdigi', name: 'CelcomDigi', badge: 'Digi', category: 'Subscriptions', type: 'monthly_date', dueDay: '12', cycleDays: '30', color: '#FFD100', bgColor: '#FFD10018', icon: 'phone-portrait', group: 'sim' },
      { id: 'my_unifi', name: 'Unifi Broadband (TM)', badge: 'Unifi', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#F15A24', bgColor: '#F15A2418', icon: 'wifi', group: 'wifi' },
      { id: 'my_tnb', name: 'TNB Electricity (Tenaga Nasional)', badge: 'TNB', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#0054A6', bgColor: '#0054A618', icon: 'flash', group: 'utility' },
      ...getUniversalItems('my'),
    ],
  },

  SGD: {
    code: 'SGD',
    currency: 'SGD',
    currencySymbol: 'S$',
    name: 'Singapore',
    flag: '🇸🇬',
    quickAmounts: {
      cycle_days: ['15', '25', '45', '70'],
      monthly_date: ['50', '120', '300', '800', '2000'],
    },
    providers: [
      { id: 'sg_singtel', name: 'Singtel Mobile', badge: 'Singtel', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#E1000F', bgColor: '#E1000F18', icon: 'phone-portrait', group: 'sim' },
      { id: 'sg_starhub', name: 'StarHub', badge: 'StarHub', category: 'Subscriptions', type: 'monthly_date', dueDay: '18', cycleDays: '30', color: '#7AC142', bgColor: '#7AC14218', icon: 'phone-portrait', group: 'sim' },
      { id: 'sg_m1', name: 'M1 Singapore', badge: 'M1', category: 'Subscriptions', type: 'monthly_date', dueDay: '12', cycleDays: '30', color: '#F58220', bgColor: '#F5822018', icon: 'phone-portrait', group: 'sim' },
      { id: 'sg_spgroup', name: 'SP Group Utilities', badge: 'SP Group', category: 'Bills', type: 'monthly_date', dueDay: '25', cycleDays: '30', color: '#0072CE', bgColor: '#0072CE18', icon: 'flash', group: 'utility' },
      ...getUniversalItems('sg'),
    ],
  },

  NGN: {
    code: 'NGN',
    currency: 'NGN',
    currencySymbol: '₦',
    name: 'Nigeria',
    flag: '🇳🇬',
    quickAmounts: {
      cycle_days: ['1500', '3000', '6000', '12000'],
      monthly_date: ['5000', '15000', '35000', '80000', '200000'],
    },
    providers: [
      { id: 'ng_mtn', name: 'MTN Nigeria', badge: 'MTN', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#FFCC00', bgColor: '#FFCC0018', icon: 'phone-portrait', group: 'sim' },
      { id: 'ng_airtel', name: 'Airtel Nigeria', badge: 'Airtel', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#ED1C24', bgColor: '#ED1C2418', icon: 'phone-portrait', group: 'sim' },
      { id: 'ng_glo', name: 'Glo (Globacom)', badge: 'Glo', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#00853F', bgColor: '#00853F18', icon: 'phone-portrait', group: 'sim' },
      { id: 'ng_dstv', name: 'DStv / GOtv Subscription', badge: 'DStv', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#0047BA', bgColor: '#0047BA18', icon: 'film', group: 'ott' },
      { id: 'ng_nepa', name: 'NEPA / PHCN Electricity (IKEDC/EKEDC)', badge: 'Electric', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
      ...getUniversalItems('ng'),
    ],
  },

  ZAR: {
    code: 'ZAR',
    currency: 'ZAR',
    currencySymbol: 'R',
    name: 'South Africa',
    flag: '🇿🇦',
    quickAmounts: {
      cycle_days: ['99', '199', '349', '599'],
      monthly_date: ['350', '800', '1800', '4000', '9000'],
    },
    providers: [
      { id: 'za_vodacom', name: 'Vodacom South Africa', badge: 'Vodacom', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#E60000', bgColor: '#E6000018', icon: 'phone-portrait', group: 'sim' },
      { id: 'za_mtn', name: 'MTN South Africa', badge: 'MTN', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#FFCC00', bgColor: '#FFCC0018', icon: 'phone-portrait', group: 'sim' },
      { id: 'za_telkom', name: 'Telkom Mobile & Fiber', badge: 'Telkom', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#0097D7', bgColor: '#0097D718', icon: 'wifi', group: 'wifi' },
      { id: 'za_eskom', name: 'Eskom Electricity', badge: 'Eskom', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#003366', bgColor: '#00336618', icon: 'flash', group: 'utility' },
      { id: 'za_dstv', name: 'MultiChoice DStv', badge: 'DStv', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#0047BA', bgColor: '#0047BA18', icon: 'film', group: 'ott' },
      ...getUniversalItems('za'),
    ],
  },

  KES: {
    code: 'KES',
    currency: 'KES',
    currencySymbol: 'KSh',
    name: 'Kenya',
    flag: '🇰🇪',
    quickAmounts: {
      cycle_days: ['500', '1000', '2000', '3500'],
      monthly_date: ['1500', '3500', '8000', '18000', '35000'],
    },
    providers: [
      { id: 'ke_safaricom', name: 'Safaricom M-Pesa / Data', badge: 'Safaricom', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#00853F', bgColor: '#00853F18', icon: 'phone-portrait', group: 'sim' },
      { id: 'ke_airtel', name: 'Airtel Kenya', badge: 'Airtel', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '30', color: '#ED1C24', bgColor: '#ED1C2418', icon: 'phone-portrait', group: 'sim' },
      { id: 'ke_kplc', name: 'Kenya Power (KPLC)', badge: 'KPLC', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
      ...getUniversalItems('ke'),
    ],
  },

  EGP: {
    code: 'EGP',
    currency: 'EGP',
    currencySymbol: 'E£',
    name: 'Egypt',
    flag: '🇪🇬',
    quickAmounts: {
      cycle_days: ['100', '200', '350', '600'],
      monthly_date: ['300', '700', '1500', '3000', '7000'],
    },
    providers: [
      { id: 'eg_vodafone', name: 'Vodafone Egypt', badge: 'Vodafone', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '28', color: '#E60000', bgColor: '#E6000018', icon: 'phone-portrait', group: 'sim' },
      { id: 'eg_orange', name: 'Orange Egypt', badge: 'Orange', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '28', color: '#FF7900', bgColor: '#FF790018', icon: 'phone-portrait', group: 'sim' },
      { id: 'eg_etisalat', name: 'Etisalat Egypt (e&)', badge: 'e&', category: 'Subscriptions', type: 'cycle_days', dueDay: '1', cycleDays: '28', color: '#719E19', bgColor: '#719E1918', icon: 'phone-portrait', group: 'sim' },
      { id: 'eg_we', name: 'WE (Telecom Egypt)', badge: 'WE', category: 'Bills', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#6A1B9A', bgColor: '#6A1B9A18', icon: 'wifi', group: 'wifi' },
      ...getUniversalItems('eg'),
    ],
  },

  CAD: {
    code: 'CAD',
    currency: 'CAD',
    currencySymbol: 'CA$',
    name: 'Canada',
    flag: '🇨🇦',
    quickAmounts: {
      cycle_days: ['40', '60', '85', '110'],
      monthly_date: ['35', '75', '150', '350', '800', '1800'],
    },
    providers: [
      { id: 'ca_rogers', name: 'Rogers Wireless', badge: 'Rogers', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#DA291C', bgColor: '#DA291C18', icon: 'phone-portrait', group: 'sim' },
      { id: 'ca_bell', name: 'Bell Canada', badge: 'Bell', category: 'Subscriptions', type: 'monthly_date', dueDay: '18', cycleDays: '30', color: '#005596', bgColor: '#00559618', icon: 'phone-portrait', group: 'sim' },
      { id: 'ca_telus', name: 'Telus Mobility', badge: 'Telus', category: 'Subscriptions', type: 'monthly_date', dueDay: '12', cycleDays: '30', color: '#4B286D', bgColor: '#4B286D18', icon: 'phone-portrait', group: 'sim' },
      { id: 'ca_hydro', name: 'Hydro / Electricity', badge: 'Hydro', category: 'Bills', type: 'monthly_date', dueDay: '20', cycleDays: '30', color: '#F59E0B', bgColor: '#F59E0B18', icon: 'flash', group: 'utility' },
      ...getUniversalItems('ca'),
    ],
  },

  AUD: {
    code: 'AUD',
    currency: 'AUD',
    currencySymbol: 'A$',
    name: 'Australia',
    flag: '🇦🇺',
    quickAmounts: {
      cycle_days: ['35', '55', '75', '100'],
      monthly_date: ['40', '80', '180', '400', '900', '2000'],
    },
    providers: [
      { id: 'au_telstra', name: 'Telstra Mobile & Broadband', badge: 'Telstra', category: 'Subscriptions', type: 'monthly_date', dueDay: '15', cycleDays: '30', color: '#0064D2', bgColor: '#0064D218', icon: 'phone-portrait', group: 'sim' },
      { id: 'au_optus', name: 'Optus', badge: 'Optus', category: 'Subscriptions', type: 'monthly_date', dueDay: '18', cycleDays: '30', color: '#FFE600', bgColor: '#FFE60018', icon: 'phone-portrait', group: 'sim' },
      { id: 'au_vodafone', name: 'Vodafone Australia', badge: 'Vodafone', category: 'Subscriptions', type: 'monthly_date', dueDay: '12', cycleDays: '30', color: '#E60000', bgColor: '#E6000018', icon: 'phone-portrait', group: 'sim' },
      { id: 'au_origin', name: 'Origin Energy (Gas & Electric)', badge: 'Origin', category: 'Bills', type: 'monthly_date', dueDay: '22', cycleDays: '30', color: '#FF5C35', bgColor: '#FF5C3518', icon: 'flash', group: 'utility' },
      ...getUniversalItems('au'),
    ],
  },

  GENERIC: {
    code: 'GENERIC',
    currency: 'USD',
    currencySymbol: '$',
    name: 'Global / Other',
    flag: '🌐',
    quickAmounts: {
      cycle_days: ['25', '50', '100'],
      monthly_date: ['25', '50', '100', '250', '500'],
    },
    providers: [
      { id: 'gen_mobile', name: 'Mobile / Cellular Plan', badge: 'Mobile', category: 'Subscriptions', type: 'monthly_date', dueDay: '1', cycleDays: '30', color: '#0284C7', bgColor: '#0284C718', icon: 'phone-portrait', group: 'sim' },
      { id: 'gen_internet', name: 'Broadband / Internet', badge: 'Internet', category: 'Bills', type: 'monthly_date', dueDay: '10', cycleDays: '30', color: '#7C3AED', bgColor: '#7C3AED18', icon: 'wifi', group: 'wifi' },
      ...getUniversalItems('gen'),
    ],
  },
};

/**
 * List of selectable regions for the region picker header chip.
 */
export const REGIONS_LIST = Object.values(REGIONAL_PRESETS).map(r => ({
  code: r.code,
  name: r.name,
  flag: r.flag,
  currency: r.currency,
  currencySymbol: r.currencySymbol,
}));

/**
 * Maps any stored currency code or symbol to a supported region preset code.
 * Follows exact requirements: ambiguous '$' defaults to USD, '₹' to INR, etc.
 */
export function resolveRegionFromCurrency(value?: string | null): string {
  if (!value) return 'INR'; // default Rupeo app base

  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();

  // 1. Direct code match
  if (REGIONAL_PRESETS[upper]) {
    return upper;
  }

  // 2. Exact symbol matches
  switch (trimmed) {
    case '₹':
      return 'INR';
    case '$':
      return 'USD'; // Ambiguous '$' defaults to USD per prompt specification
    case '€':
      return 'EUR';
    case '£':
      return 'GBP';
    case 'د.إ':
      return 'AED';
    case '﷼':
      return 'SAR';
    case '₨':
    case 'Rs':
    case 'PKR':
      return 'PKR';
    case '৳':
      return 'BDT';
    case 'रू':
      return 'NPR';
    case 'Rp':
      return 'IDR';
    case '₱':
      return 'PHP';
    case 'RM':
      return 'MYR';
    case 'S$':
      return 'SGD';
    case '₦':
      return 'NGN';
    case 'R':
      return 'ZAR';
    case 'KSh':
      return 'KES';
    case 'E£':
      return 'EGP';
    case 'CA$':
      return 'CAD';
    case 'A$':
      return 'AUD';
    default:
      break;
  }

  // 3. Fallback: check if the trimmed symbol matches any region's currency or symbol
  for (const preset of Object.values(REGIONAL_PRESETS)) {
    if (preset.currency.toUpperCase() === upper || preset.currencySymbol === trimmed) {
      return preset.code;
    }
  }

  return 'GENERIC';
}

/**
 * Returns providers for a given region code.
 */
export function getProvidersForRegion(regionCode: string): BrandProvider[] {
  const code = (regionCode || 'INR').toUpperCase();
  const preset = REGIONAL_PRESETS[code] || REGIONAL_PRESETS['GENERIC'] || REGIONAL_PRESETS['INR'];
  return (preset && Array.isArray(preset.providers)) ? preset.providers : INDIA_PROVIDERS;
}

export type RegionalProvider = BrandProvider;

export function getRegionPreset(regionCode: string): RegionPreset {
  const code = (regionCode || 'INR').toUpperCase();
  return REGIONAL_PRESETS[code] || REGIONAL_PRESETS['GENERIC'] || REGIONAL_PRESETS['INR'];
}

export interface BrandCardTheme {
  id: string;
  name: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
  innerBg: string;
  innerBorder: string;
  tagBg: string;
  tagText: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  category: string;
}

export function resolveBrandTheme(
  providerId?: string,
  title?: string,
  category?: string,
  brandColor?: string,
  brandBadge?: string
): BrandCardTheme {
  const normTitle = (title || '').toLowerCase().trim();
  const id = (providerId || '').toLowerCase().trim();

  // Jio - Clean Minimal Soft Light Blue
  if (id === 'jio' || id === 'jiofiber' || normTitle.includes('jio')) {
    return {
      id: 'jio',
      name: 'Jio',
      cardBg: '#F0F7FF',        // Minimal ultra light blue
      cardBorder: '#BAE6FD',    // Clean soft light blue border
      accent: '#0A2885',        // Jio brand royal blue
      innerBg: '#FFFFFF',
      innerBorder: '#E0F2FE',
      tagBg: '#E0F2FE',
      tagText: '#0369A1',
      badge: 'Jio',
      badgeBg: '#0A2885',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Airtel - Clean Minimal Soft Light Red / Rose
  if (id === 'airtel' || id === 'airtel_xstream' || normTitle.includes('airtel')) {
    return {
      id: 'airtel',
      name: 'Airtel',
      cardBg: '#FFF5F5',        // Minimal ultra light red / rose
      cardBorder: '#FECDD3',    // Delicate soft rose border
      accent: '#ED1C24',        // Airtel crimson red
      innerBg: '#FFFFFF',
      innerBorder: '#FFE4E6',
      tagBg: '#FFE4E6',
      tagText: '#BE123C',
      badge: 'airtel',
      badgeBg: '#ED1C24',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Vi (Vodafone Idea) - Soft Warm Vermilion / Light Blush
  if (id === 'vi' || normTitle.includes('vi ') || normTitle.includes('vodafone') || normTitle.includes('idea')) {
    return {
      id: 'vi',
      name: 'Vi',
      cardBg: '#FFF6F5',
      cardBorder: '#FED7AA',
      accent: '#E60000',
      innerBg: '#FFFFFF',
      innerBorder: '#FFEDD5',
      tagBg: '#FFEDD5',
      tagText: '#C2410C',
      badge: 'Vi',
      badgeBg: '#E60000',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // BSNL - Soft Cobalt Sky
  if (id === 'bsnl' || normTitle.includes('bsnl')) {
    return {
      id: 'bsnl',
      name: 'BSNL',
      cardBg: '#F0F9FF',
      cardBorder: '#BAE6FD',
      accent: '#005BA6',
      innerBg: '#FFFFFF',
      innerBorder: '#E0F2FE',
      tagBg: '#E0F2FE',
      tagText: '#0284C7',
      badge: 'BSNL',
      badgeBg: '#005BA6',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Electricity / Bijli - Soft Warm Golden Amber
  if (id === 'electricity' || normTitle.includes('electr') || normTitle.includes('bijli') || normTitle.includes('power') || normTitle.includes('light bill')) {
    return {
      id: 'electricity',
      name: 'Electricity Bill',
      cardBg: '#FFFDF0',        // Minimal soft warm amber
      cardBorder: '#FDE68A',
      accent: '#D97706',
      innerBg: '#FFFFFF',
      innerBorder: '#FEF3C7',
      tagBg: '#FEF3C7',
      tagText: '#B45309',
      badge: 'Bijli',
      badgeBg: '#F59E0B',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // LPG Cylinder / Gas - Soft Light Orange
  if (id === 'gas' || normTitle.includes('gas') || normTitle.includes('cylinder') || normTitle.includes('lpg')) {
    return {
      id: 'gas',
      name: 'LPG Gas Cylinder',
      cardBg: '#FFF7ED',        // Minimal soft light orange
      cardBorder: '#FED7AA',
      accent: '#EA580C',
      innerBg: '#FFFFFF',
      innerBorder: '#FFEDD5',
      tagBg: '#FFEDD5',
      tagText: '#C2410C',
      badge: 'Gas',
      badgeBg: '#F97316',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // Water Supply - Soft Aqua Cyan
  if (id === 'water' || normTitle.includes('water') || normTitle.includes('paani') || normTitle.includes('jal')) {
    return {
      id: 'water',
      name: 'Water Supply',
      cardBg: '#ECFEFF',        // Minimal soft aqua cyan
      cardBorder: '#A5F3FC',
      accent: '#0891B2',
      innerBg: '#FFFFFF',
      innerBorder: '#CFFAFE',
      tagBg: '#CFFAFE',
      tagText: '#0E7490',
      badge: 'Water',
      badgeBg: '#06B6D4',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // Room / Flat Rent - Soft Mint Emerald
  if (id === 'rent' || normTitle.includes('rent') || normTitle.includes('room') || normTitle.includes('flat') || normTitle.includes('pg')) {
    return {
      id: 'rent',
      name: 'Room / Flat Rent',
      cardBg: '#F0FDF4',        // Minimal soft emerald
      cardBorder: '#BBF7D0',
      accent: '#059669',
      innerBg: '#FFFFFF',
      innerBorder: '#DCFCE7',
      tagBg: '#DCFCE7',
      tagText: '#15803D',
      badge: 'Flat Rent',
      badgeBg: '#10B981',
      badgeText: '#FFFFFF',
      category: 'Rent',
    };
  }

  // Maid / Cook Salary - Soft Lavender
  if (id === 'maid' || normTitle.includes('maid') || normTitle.includes('kamwali') || normTitle.includes('salary') || normTitle.includes('cook')) {
    return {
      id: 'maid',
      name: 'Maid Salary',
      cardBg: '#F5F3FF',        // Minimal soft lavender
      cardBorder: '#DDD6FE',
      accent: '#7C3AED',
      innerBg: '#FFFFFF',
      innerBorder: '#EDE9FE',
      tagBg: '#EDE9FE',
      tagText: '#6D28D9',
      badge: 'House Maid',
      badgeBg: '#8B5CF6',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // Mess / Tiffin - Soft Light Peach
  if (id === 'tiffin' || normTitle.includes('tiffin') || normTitle.includes('mess') || normTitle.includes('dabba') || normTitle.includes('khana')) {
    return {
      id: 'tiffin',
      name: 'Mess / Tiffin',
      cardBg: '#FFF7ED',        // Minimal soft peach
      cardBorder: '#FED7AA',
      accent: '#EA580C',
      innerBg: '#FFFFFF',
      innerBorder: '#FFEDD5',
      tagBg: '#FFEDD5',
      tagText: '#C2410C',
      badge: 'Mess / Tiffin',
      badgeBg: '#F97316',
      badgeText: '#FFFFFF',
      category: 'Food',
    };
  }

  // Milk Delivery - Soft Azure
  if (id === 'milk' || normTitle.includes('milk') || normTitle.includes('dairy') || normTitle.includes('doodh')) {
    return {
      id: 'milk',
      name: 'Milk Delivery',
      cardBg: '#F0F9FF',        // Minimal soft azure
      cardBorder: '#BAE6FD',
      accent: '#0284C7',
      innerBg: '#FFFFFF',
      innerBorder: '#E0F2FE',
      tagBg: '#E0F2FE',
      tagText: '#0369A1',
      badge: 'Milk / Dairy',
      badgeBg: '#0284C7',
      badgeText: '#FFFFFF',
      category: 'Groceries',
    };
  }

  // Netflix - Soft Minimal Ruby
  if (id === 'netflix' || normTitle.includes('netflix')) {
    return {
      id: 'netflix',
      name: 'Netflix',
      cardBg: '#FFF5F5',
      cardBorder: '#FECDD3',
      accent: '#E50914',
      innerBg: '#FFFFFF',
      innerBorder: '#FFE4E6',
      tagBg: '#FFE4E6',
      tagText: '#BE123C',
      badge: 'Netflix',
      badgeBg: '#000000',
      badgeText: '#E50914',
      category: 'Subscriptions',
    };
  }

  // Prime Video
  if (id === 'prime' || normTitle.includes('prime') || normTitle.includes('amazon')) {
    return {
      id: 'prime',
      name: 'Amazon Prime',
      cardBg: '#F0F9FF',
      cardBorder: '#BAE6FD',
      accent: '#00A8E1',
      innerBg: '#FFFFFF',
      innerBorder: '#E0F2FE',
      tagBg: '#E0F2FE',
      tagText: '#0369A1',
      badge: 'Prime Video',
      badgeBg: '#00A8E1',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Disney+ Hotstar
  if (id === 'hotstar' || normTitle.includes('hotstar') || normTitle.includes('disney')) {
    return {
      id: 'hotstar',
      name: 'Disney+ Hotstar',
      cardBg: '#F1F5F9',
      cardBorder: '#CBD5E1',
      accent: '#0C1E3C',
      innerBg: '#FFFFFF',
      innerBorder: '#E2E8F0',
      tagBg: '#E2E8F0',
      tagText: '#0C1E3C',
      badge: 'Hotstar',
      badgeBg: '#0C1E3C',
      badgeText: '#FFD700',
      category: 'Subscriptions',
    };
  }

  // Spotify
  if (id === 'spotify' || normTitle.includes('spotify')) {
    return {
      id: 'spotify',
      name: 'Spotify',
      cardBg: '#F0FDF4',
      cardBorder: '#BBF7D0',
      accent: '#1DB954',
      innerBg: '#FFFFFF',
      innerBorder: '#DCFCE7',
      tagBg: '#DCFCE7',
      tagText: '#15803D',
      badge: 'Spotify',
      badgeBg: '#1DB954',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // YouTube Premium
  if (id === 'youtube' || normTitle.includes('youtube')) {
    return {
      id: 'youtube',
      name: 'YouTube Premium',
      cardBg: '#FFF1F2',
      cardBorder: '#FECDD3',
      accent: '#FF0000',
      innerBg: '#FFFFFF',
      innerBorder: '#FFE4E6',
      tagBg: '#FFE4E6',
      tagText: '#BE123C',
      badge: 'YouTube',
      badgeBg: '#FF0000',
      badgeText: '#FFFFFF',
      category: 'Subscriptions',
    };
  }

  // Loan / Credit EMI
  if (id === 'emi' || normTitle.includes('emi') || normTitle.includes('loan') || normTitle.includes('credit')) {
    return {
      id: 'emi',
      name: 'Loan / Credit EMI',
      cardBg: '#FFF1F2',
      cardBorder: '#FECDD3',
      accent: '#E11D48',
      innerBg: '#FFFFFF',
      innerBorder: '#FFE4E6',
      tagBg: '#FFE4E6',
      tagText: '#BE123C',
      badge: 'Loan EMI',
      badgeBg: '#E11D48',
      badgeText: '#FFFFFF',
      category: 'EMI',
    };
  }

  // Gym / Fitness
  if (id === 'gym' || normTitle.includes('gym') || normTitle.includes('fitness')) {
    return {
      id: 'gym',
      name: 'Gym / Fitness',
      cardBg: '#F0FDF4',
      cardBorder: '#BBF7D0',
      accent: '#10B981',
      innerBg: '#FFFFFF',
      innerBorder: '#DCFCE7',
      tagBg: '#DCFCE7',
      tagText: '#15803D',
      badge: 'Gym',
      badgeBg: '#10B981',
      badgeText: '#FFFFFF',
      category: 'Others',
    };
  }

  // WiFi / Broadband / ACT Fibernet
  if (id === 'act' || normTitle.includes('wifi') || normTitle.includes('fiber') || normTitle.includes('broadband')) {
    return {
      id: 'wifi',
      name: 'WiFi / Broadband',
      cardBg: '#F8FAFC',
      cardBorder: '#CBD5E1',
      accent: '#475569',
      innerBg: '#FFFFFF',
      innerBorder: '#F1F5F9',
      tagBg: '#F1F5F9',
      tagText: '#334155',
      badge: 'WiFi',
      badgeBg: '#475569',
      badgeText: '#FFFFFF',
      category: 'Bills',
    };
  }

  // Custom or regional brand with brandColor or custom:
  if (id.startsWith('custom:') || id === 'custom' || brandColor) {
    const accent = brandColor || '#6366F1';
    return {
      id: providerId || 'custom',
      name: title || 'Bill Reminder',
      cardBg: '#F8FAFC',
      cardBorder: accent + '33',
      accent,
      innerBg: '#FFFFFF',
      innerBorder: '#F1F5F9',
      tagBg: accent + '18',
      tagText: accent,
      badge: brandBadge || (title ? title.slice(0, 4) : 'Bill'),
      badgeBg: accent,
      badgeText: '#FFFFFF',
      category: category || 'Bills',
    };
  }

  // Default Custom / Others
  return {
    id: 'custom',
    name: title || 'Bill Reminder',
    cardBg: '#F8FAFC',
    cardBorder: '#E2E8F0',
    accent: '#6366F1',
    innerBg: '#FFFFFF',
    innerBorder: '#F1F5F9',
    tagBg: '#EEF2FF',
    tagText: '#4F46E5',
    badge: category || 'Bill',
    badgeBg: '#6366F1',
    badgeText: '#FFFFFF',
    category: category || 'Bills',
  };
}
