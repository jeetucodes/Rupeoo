/**
 * iap.ts — Google Play Billing service for Rupeo
 *
 * Uses react-native-iap v16 (New Architecture / NitroModules / OpenIAP Spec)
 * Product  : rupeo_premium_monthly
 * Base Plans: monthly (₹99) | quarterly (₹249) | yearly (₹799)
 *
 * API surface used:
 *   fetchProducts({ skus, type: 'subs' })            → ProductSubscription[]
 *   requestPurchase({ type:'subs', request:{ google } })
 *   purchaseUpdatedListener / purchaseErrorListener
 *   finishTransaction({ purchase, isConsumable:false })   ← acknowledge
 *   getAvailablePurchases()                               ← restore
 *   ErrorCode enum  (e.g. ErrorCode.UserCancelled = 'user-cancelled')
 */

import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  getAvailablePurchases,
  ErrorCode,
  type ProductSubscriptionAndroid,
  type Purchase,
  type PurchaseError,
} from 'react-native-iap';
import { Platform } from 'react-native';
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { log, warn, error } from '@/lib/logger';

// ─── Product / Plan constants ────────────────────────────────────────────────

/** Google Play subscription product ID */
export const PRODUCT_ID = 'rupeo_premium_monthly';

/** Monthly price in paise (used for per-month cost calculation) */
const BASE_MONTHLY_PAISE = 9900; // ₹99

export interface PlanConfig {
  id: 'monthly' | 'quarterly' | 'yearly';
  label: string;
  duration: string;
  months: number;
  /** Fallback total price string if Play Store unavailable */
  fallbackPrice: string;
  /** Fallback per-month string */
  fallbackPerMonth: string;
  /** Save percentage vs monthly (shown as badge) */
  savePct?: number;
  /** Badge label text */
  badge?: string;
  badgeVariant?: 'gold' | 'green' | 'purple';
}

export const PLANS: PlanConfig[] = [
  {
    id: 'monthly',
    label: 'Monthly',
    duration: '1 Month',
    months: 1,
    fallbackPrice: '₹99',
    fallbackPerMonth: '₹99/mo',
  },
  {
    id: 'quarterly',
    label: 'Quarterly',
    duration: '3 Months',
    months: 3,
    fallbackPrice: '₹249',
    fallbackPerMonth: '₹83/mo',
    savePct: 16,
    badge: 'Save 16%',
    badgeVariant: 'gold',
  },
  {
    id: 'yearly',
    label: 'Yearly',
    duration: '1 Year',
    months: 12,
    fallbackPrice: '₹799',
    fallbackPerMonth: '₹66/mo',
    savePct: 33,
    badge: 'Save 33% · Best Value',
    badgeVariant: 'green',
  },
];

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SubscriptionPlan {
  planId: 'monthly' | 'quarterly' | 'yearly';
  label: string;
  duration: string;
  months: number;
  /** Total price string from Play Store (e.g. "₹249.00") */
  price: string;
  /** Per-month equivalent (calculated or fallback) */
  perMonth: string;
  /** Save percentage vs monthly plan */
  savePct?: number;
  /** Badge label */
  badge?: string;
  badgeVariant?: 'gold' | 'green' | 'purple';
  /** offerToken required for requestPurchase — empty string if unavailable */
  offerToken: string;
}

/** Firestore subscription record shape */
export interface SubscriptionRecord {
  user_id: string;
  product_id: string;
  base_plan_id: string;
  purchase_token: string;
  /** active | cancelled | expired | on_hold | grace_period | paused */
  status: string;
  purchase_date: any;       // Firestore serverTimestamp
  expiry_date: string | null;
  previous_plan_id: string | null;
  created_at: any;
  updated_at: any;
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _connected = false;
let _purchaseListener: ReturnType<typeof purchaseUpdatedListener> | null = null;
let _errorListener: ReturnType<typeof purchaseErrorListener> | null = null;
let _onPurchaseSuccess: ((purchase: Purchase) => void) | null = null;
let _onPurchaseError: ((error: PurchaseError) => void) | null = null;

// ─── Connection ───────────────────────────────────────────────────────────────

/**
 * Initialize Google Play Billing connection.
 * Safe to call multiple times — idempotent.
 */
export async function initIAP(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (_connected) return true;

  try {
    await initConnection();
    _connected = true;
    _setupListeners();
    log('[IAP] ✅ Connected to Google Play Billing');
    return true;
  } catch (err) {
    error('[IAP] initConnection error:', err);
    _connected = false;
    return false;
  }
}

/**
 * Tear down billing connection and remove listeners.
 * Call on component unmount.
 */
export async function destroyIAP(): Promise<void> {
  _purchaseListener?.remove();
  _errorListener?.remove();
  _purchaseListener = null;
  _errorListener = null;
  _onPurchaseSuccess = null;
  _onPurchaseError = null;

  if (_connected) {
    try {
      await endConnection();
    } catch (_) {
      // Safe cleanup: endConnection throws if Google Play Billing is already disconnected
    }
    _connected = false;
  }
  log('[IAP] Connection destroyed');
}

// ─── Purchase Listeners ───────────────────────────────────────────────────────

function _setupListeners() {
  _purchaseListener?.remove();
  _errorListener?.remove();

  _purchaseListener = purchaseUpdatedListener((purchase: Purchase) => {
    log('[IAP] purchaseUpdated:', purchase.productId, purchase.transactionDate);
    _onPurchaseSuccess?.(purchase);
  });

  _errorListener = purchaseErrorListener((error: PurchaseError) => {
    warn('[IAP] purchaseError:', error.code, error.message);
    _onPurchaseError?.(error);
  });
}

/**
 * Register success/error callbacks for purchase events.
 * Must be called before initiating any purchase.
 */
export function setPurchaseCallbacks(
  onSuccess: (purchase: Purchase) => void,
  onError: (error: PurchaseError) => void,
) {
  _onPurchaseSuccess = onSuccess;
  _onPurchaseError = onError;
}

// ─── Fetch Plans ──────────────────────────────────────────────────────────────

/**
 * Fetch all 3 subscription plans from Google Play.
 *
 * Google Play returns all base plans as SubscriptionOffer entries
 * inside a single ProductSubscriptionAndroid object.
 * Each base plan has a unique basePlanIdAndroid + offerTokenAndroid.
 *
 * Falls back to hardcoded prices if Play Store is unreachable.
 */
export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  if (!_connected) await initIAP();

  try {
    const products = await fetchProducts({ skus: [PRODUCT_ID], type: 'subs' });

    if (!products || products.length === 0) {
      warn('[IAP] No products returned — using fallback prices');
      return _fallbackPlans();
    }

    const sub = products.find(
      (p): p is ProductSubscriptionAndroid =>
        p.id === PRODUCT_ID && 'subscriptionOffers' in p,
    ) as ProductSubscriptionAndroid | undefined;

    if (!sub?.subscriptionOffers?.length) {
      warn('[IAP] subscriptionOffers missing — using fallback prices');
      return _fallbackPlans();
    }

    log('[IAP] subscriptionOffers count:', sub.subscriptionOffers.length);

    const plans: SubscriptionPlan[] = PLANS.map((planConfig) => {
      // Match the base plan offer (no offerId = it IS the base plan, not a promo)
      const offer = sub.subscriptionOffers.find(
        (o) => o.basePlanIdAndroid === planConfig.id,
      );

      const totalPrice = offer?.displayPrice ?? planConfig.fallbackPrice;
      const offerToken = offer?.offerTokenAndroid ?? '';

      // Calculate per-month from Play Store price if possible
      const perMonth = _calcPerMonth(totalPrice, planConfig.months, planConfig.fallbackPerMonth);

      return {
        planId: planConfig.id,
        label: planConfig.label,
        duration: planConfig.duration,
        months: planConfig.months,
        price: totalPrice,
        perMonth,
        savePct: planConfig.savePct,
        badge: planConfig.badge,
        badgeVariant: planConfig.badgeVariant,
        offerToken,
      };
    });

    log('[IAP] Plans fetched:', plans.map((p) => `${p.planId}=${p.price}`).join(', '));
    return plans;
  } catch (err) {
    error('[IAP] fetchProducts error:', err);
    return _fallbackPlans();
  }
}

/** Parse "₹249.00" → 249, divide by months, reformat */
function _calcPerMonth(totalPriceStr: string, months: number, fallback: string): string {
  if (months <= 1) return totalPriceStr;
  try {
    // Strip currency symbol and commas, parse float
    const num = parseFloat(totalPriceStr.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return fallback;
    const perMonth = Math.round(num / months);
    // Detect currency symbol
    const sym = totalPriceStr.match(/[₹$€£¥]/)?.[0] ?? '₹';
    return `${sym}${perMonth}/mo`;
  } catch {
    return fallback;
  }
}

function _fallbackPlans(): SubscriptionPlan[] {
  return PLANS.map((p) => ({
    planId: p.id,
    label: p.label,
    duration: p.duration,
    months: p.months,
    price: p.fallbackPrice,
    perMonth: p.fallbackPerMonth,
    savePct: p.savePct,
    badge: p.badge,
    badgeVariant: p.badgeVariant,
    offerToken: '',
  }));
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

/**
 * Initiate a Google Play subscription purchase.
 *
 * For plan upgrades/downgrades (monthly → yearly, etc.):
 * if `existingPurchaseToken` is provided, it's passed to Play Billing
 * for replacement (proration handled by Google).
 *
 * @param plan                 Target plan from getSubscriptionPlans()
 * @param userId               Firebase UID (used as obfuscatedAccountId)
 * @param existingPurchaseToken Pass current token when switching plans
 *
 * Result arrives via setPurchaseCallbacks — NOT as this function's return value.
 */
export async function purchaseSubscription(
  plan: SubscriptionPlan,
  userId: string,
  existingPurchaseToken?: string,
): Promise<void> {
  if (!_connected) {
    throw new Error('IAP not connected. Call initIAP() first.');
  }
  if (!plan.offerToken) {
    throw new Error(
      'offerToken is empty — app may be running in Expo Go or plans were not ' +
      'fetched from Play Store. Use a real device with a signed build.',
    );
  }

  await requestPurchase({
    type: 'subs',
    request: {
      google: {
        skus: [PRODUCT_ID],
        subscriptionOffers: [{ sku: PRODUCT_ID, offerToken: plan.offerToken }],
        obfuscatedAccountId: userId.substring(0, 64),
        // Pass existing token for upgrade / downgrade
        ...(existingPurchaseToken ? { purchaseToken: existingPurchaseToken } : {}),
      },
    },
  });
}

// ─── Acknowledge + Save to Firestore ─────────────────────────────────────────

/**
 * Called after purchaseUpdatedListener fires.
 *
 * Steps:
 *   1. finishTransaction() — acknowledge purchase (required within 3 days)
 *   2. Save subscription record to Firestore users/{uid}/subscriptions/
 *   3. Update Firestore users/{uid} doc (is_premium = true)
 *
 * @param purchase         Purchase object from listener
 * @param userId           Firebase UID
 * @param previousPlanId   If this was a plan switch, the old base_plan_id
 */
export async function verifyAndActivatePurchase(
  purchase: Purchase,
  userId: string,
  previousPlanId?: string,
): Promise<string> {
  // ── Step 1: Acknowledge ────────────────────────────────────────────────────
  try {
    await finishTransaction({ purchase, isConsumable: false });
    log('[IAP] ✅ Transaction acknowledged:', purchase.id);
  } catch (ackErr: any) {
    // Already acknowledged purchases throw a specific error — safe to ignore
    if (!String(ackErr?.message).includes('already')) {
      error('[IAP] finishTransaction error:', ackErr);
    }
  }

  // ── Step 2: Determine base plan ────────────────────────────────────────────
  // PurchaseCommon.currentPlanId = basePlanId on Android (OpenIAP Spec)
  const basePlanId: string = purchase.currentPlanId ?? 'monthly';
  const purchaseToken: string = purchase.purchaseToken ?? '';

  // ── Step 3: Save subscription record to Firestore ──────────────────────────
  if (db && userId) {
    try {
      // subscriptions sub-collection under users/{uid}
      // Doc ID = purchaseToken ensures idempotency on re-delivery
      const subDocRef = doc(db, 'users', userId, 'subscriptions', purchaseToken || purchase.id);

      const record: SubscriptionRecord = {
        user_id: userId,
        product_id: purchase.productId,
        base_plan_id: basePlanId,
        purchase_token: purchaseToken,
        status: 'active',
        purchase_date: serverTimestamp(),
        expiry_date: null,          // populated by RTDN webhook on renewal/expiry
        previous_plan_id: previousPlanId ?? null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      await setDoc(subDocRef, record, { merge: true });
      log('[IAP] ✅ Subscription record saved:', basePlanId, purchaseToken.substring(0, 20));

      // ── Step 4: Server-side verification (Supabase Edge Function or Firebase Cloud Function) ──
      // The server verifies the purchase and writes premium status to Firestore users/{uid}
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY;
      const endpoint = supabaseUrl
        ? `${supabaseUrl}/functions/v1/verify-subscription`
        : 'https://us-central1-paisewaise-e545e.cloudfunctions.net/verifySubscription';

      if (purchaseToken) {
        const idToken = await auth?.currentUser?.getIdToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken || ''}`,
        };
        if (supabaseAnonKey) {
          headers['apikey'] = supabaseAnonKey;
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            purchase_token: purchaseToken,
            product_id: purchase.productId,
            base_plan_id: basePlanId,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          error('[IAP] Server verification failed:', res.status, errData);
          throw new Error(errData?.error || `Server verification failed (HTTP ${res.status})`);
        }

        const verifyResult = await res.json();
        log('[IAP] Server verification result:', verifyResult);
      }
    } catch (fsErr) {
      error('[IAP] Purchase activation error:', fsErr);
      throw fsErr;
    }
  }

  return basePlanId;
}

// ─── Restore Purchases ────────────────────────────────────────────────────────

/**
 * Restore the user's existing active Google Play subscription.
 * Returns the restored Purchase or null if none found.
 */
export async function restorePurchases(userId: string): Promise<Purchase | null> {
  if (!_connected) await initIAP();

  try {
    const purchases = await getAvailablePurchases();
    // Find the most recent purchase for our product
    const activeSub = purchases
      .filter((p) => p.productId === PRODUCT_ID)
      .sort((a, b) => b.transactionDate - a.transactionDate)[0];

    if (activeSub) {
      log('[IAP] Restoring subscription:', activeSub.productId, activeSub.currentPlanId);
      await verifyAndActivatePurchase(activeSub, userId);
      return activeSub;
    }

    log('[IAP] No active subscriptions to restore');
    return null;
  } catch (err) {
    error('[IAP] restorePurchases error:', err);
    return null;
  }
}

// ─── Check Active Subscription (Firestore) ────────────────────────────────────

/**
 * Read the current active subscription from Firestore.
 * Used to detect upgrade/switch scenarios.
 */
export async function getActiveSubscription(userId: string): Promise<{
  basePlanId: string;
  purchaseToken: string;
} | null> {
  if (!db || !userId) return null;
  try {
    const q = query(
      collection(db, 'users', userId, 'subscriptions'),
      where('status', '==', 'active'),
      orderBy('purchase_date', 'desc'),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0].data();
    return { basePlanId: d.base_plan_id, purchaseToken: d.purchase_token };
  } catch (err: any) {
    if (err?.code === 'failed-precondition' || String(err?.message || '').includes('failed-precondition')) {
      warn(
        '[IAP] getActiveSubscription failed-precondition: Missing Firestore composite index for subscriptions (status == active, purchase_date desc). Deploy firestore.indexes.json to resolve.',
        err
      );
    } else {
      warn('[IAP] getActiveSubscription error:', err);
    }
    return null;
  }
}

// ─── Plan & Premium Helpers ───────────────────────────────────────────────────

/**
 * Check whether a user object has an active premium entitlement.
 */
export function isUserPremium(user: { isPremium?: boolean } | null | undefined): boolean {
  return Boolean(user?.isPremium);
}

/**
 * Get the current active plan id ('monthly' | 'quarterly' | 'yearly' | null).
 */
export function getCurrentPlan(
  user: { isPremium?: boolean; premiumPlan?: string } | null | undefined,
): 'monthly' | 'quarterly' | 'yearly' | string | null {
  if (!user?.isPremium) return null;
  return user?.premiumPlan ?? null;
}

/**
 * Human-readable plan name with duration and price badge.
 */
export function getPlanDisplayName(planId: string | null | undefined): string {
  if (!planId) return 'Free Plan';
  switch (planId.toLowerCase()) {
    case 'monthly':
      return 'Monthly Plan (₹99/mo)';
    case 'quarterly':
      return 'Quarterly Plan (₹83/mo)';
    case 'yearly':
      return 'Yearly Plan (₹66/mo · Best Value)';
    default:
      return `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`;
  }
}

// ─── Re-exports ───────────────────────────────────────────────────────────────
export { ErrorCode, type Purchase, type PurchaseError };
