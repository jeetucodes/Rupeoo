/**
 * redeem-coupon — Supabase Edge Function
 *
 * Validates and redeems 100% free / promo coupons on the server.
 * Ensures premium status (is_premium, premium_plan, premium_activated_at)
 * is written to Firestore ONLY by the server with verified service credentials.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getGoogleAccessToken } from '../_shared/google-auth.ts';
import { updateFirestoreUser } from '../_shared/firestore-rest.ts';

// ─── Environment ──────────────────────────────────────────────────────────────
const SA_EMAIL         = Deno.env.get('GOOGLE_SA_EMAIL') ?? '';
const SA_KEY           = (Deno.env.get('GOOGLE_SA_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');
const FIREBASE_PROJECT = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'paisewaise-e545e';
const FIREBASE_API_KEY = Deno.env.get('FIREBASE_WEB_API_KEY') ?? 'AIzaSyAy0P_i2ywT_jpF_leDU-oo3juR1Pu9VJE';

const DATASTORE_SCOPE    = 'https://www.googleapis.com/auth/datastore';
const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1';

// ─── CORS headers ─────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * Verify a Firebase ID token using Google Identity Toolkit accounts:lookup API.
 * Returns the authenticated user's Firebase UID.
 */
async function verifyFirebaseIdToken(idToken: string): Promise<string> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Invalid Firebase ID token: ${msg}`);
  }

  const data = await res.json();
  const user = data.users?.[0];
  if (!user?.localId) {
    throw new Error('User not found in Firebase ID token lookup');
  }

  return user.localId;
}

function fromFirestoreValue(v: any): any {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return parseFloat(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) {
    const res: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue?.fields || {})) {
      res[k] = fromFirestoreValue(val);
    }
    return res;
  }
  return null;
}

interface ParsedCoupon {
  docId: string;
  code: string;
  isActive: boolean;
  isFree: boolean;
  discountAmount?: number;
  discountPercent?: number;
  plan?: string;
  expiresAt?: string;
  maxUses?: number;
  usedCount: number;
  redeemedUsers: string[];
}

function parseCouponFields(docName: string, fields: Record<string, any>): ParsedCoupon {
  const docId = docName.split('/').pop() || '';
  const d: Record<string, any> = {};
  for (const [k, val] of Object.entries(fields)) {
    d[k] = fromFirestoreValue(val);
  }

  const code = String(d.code || d.coupon_code || docId).trim().toUpperCase();
  const type = d.couponType || d.type;

  let discountAmount: number | undefined;
  if (d.discountAmount && Number(d.discountAmount) > 0) discountAmount = Number(d.discountAmount);
  else if (d.discount_amount && Number(d.discount_amount) > 0) discountAmount = Number(d.discount_amount);
  else if (d.flatDiscount && Number(d.flatDiscount) > 0) discountAmount = Number(d.flatDiscount);
  else if (d.flat && Number(d.flat) > 0) discountAmount = Number(d.flat);

  let discountPercent: number | undefined;
  if (!discountAmount) {
    if (d.discountPercent && Number(d.discountPercent) > 0) discountPercent = Number(d.discountPercent);
    else if (d.discount_percent && Number(d.discount_percent) > 0) discountPercent = Number(d.discount_percent);
    else if (d.percentage && Number(d.percentage) > 0) discountPercent = Number(d.percentage);
    else if (type === 'percent' && d.discount && Number(d.discount) > 0) discountPercent = Number(d.discount);
  }

  const isFree = !discountAmount && (
    d.isFree === true ||
    type === 'free' ||
    discountPercent === 100 ||
    (!discountPercent && !discountAmount)
  );

  return {
    docId,
    code,
    isActive: d.isActive !== false && d.active !== false && d.status !== 'inactive',
    isFree: Boolean(isFree),
    discountAmount: isFree ? undefined : discountAmount,
    discountPercent: isFree ? (discountPercent === 100 ? 100 : undefined) : discountPercent,
    plan: d.plan || 'all',
    expiresAt: d.expiresAt || d.expires_at || undefined,
    maxUses: d.maxUses || d.max_uses ? Number(d.maxUses || d.max_uses) : undefined,
    usedCount: Number(d.usedCount || d.used_count || 0),
    redeemedUsers: Array.isArray(d.redeemedUsers) ? d.redeemedUsers : [],
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Authenticate via Firebase ID token ────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  let uid: string;
  try {
    uid = await verifyFirebaseIdToken(idToken);
  } catch (authErr: unknown) {
    const msg = authErr instanceof Error ? authErr.message : String(authErr);
    console.error('[redeem-coupon] Auth error:', msg);
    return json({ error: `Unauthorized: ${msg}` }, 401);
  }

  // ── Parse request body ───────────────────────────────────────────────────
  let body: { code?: string; plan?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const cleanCode = String(body.code || '').trim().toUpperCase();
  if (!cleanCode) {
    return json({ error: 'Please enter a coupon code' }, 400);
  }

  if (!SA_EMAIL || !SA_KEY) {
    console.error('[redeem-coupon] Service account not configured');
    return json({ error: 'Server configuration error' }, 500);
  }

  // ── Fetch coupons from Firestore via REST ────────────────────────────────
  const accessToken = await getGoogleAccessToken(SA_EMAIL, SA_KEY, DATASTORE_SCOPE);
  const couponsUrl = `${FIRESTORE_BASE_URL}/projects/${FIREBASE_PROJECT}/databases/(default)/documents/coupons`;

  const couponsRes = await fetch(couponsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!couponsRes.ok) {
    const errText = await couponsRes.text();
    console.error('[redeem-coupon] Failed to fetch coupons:', errText);
    return json({ error: 'Could not verify coupon. Please try again later.' }, 502);
  }

  const couponsData = await couponsRes.json();
  const rawDocs: any[] = couponsData.documents || [];

  // Match coupon by code (case-insensitive) or document ID
  let matchedCoupon: ParsedCoupon | null = null;
  for (const doc of rawDocs) {
    if (!doc.fields) continue;
    const parsed = parseCouponFields(doc.name, doc.fields);
    if (parsed.code === cleanCode || parsed.docId.trim().toUpperCase() === cleanCode) {
      matchedCoupon = parsed;
      break;
    }
  }

  if (!matchedCoupon) {
    return json({ error: `Coupon "${cleanCode}" not found.` }, 404);
  }

  if (!matchedCoupon.isActive) {
    return json({ error: 'This coupon is currently inactive.' }, 400);
  }

  if (matchedCoupon.expiresAt) {
    const expiryTime = new Date(matchedCoupon.expiresAt).getTime();
    if (expiryTime < Date.now()) {
      return json({ error: 'This coupon has expired.' }, 400);
    }
  }

  if (matchedCoupon.maxUses && matchedCoupon.usedCount >= matchedCoupon.maxUses) {
    return json({ error: 'This coupon has reached its maximum usage limit.' }, 400);
  }

  if (matchedCoupon.redeemedUsers.includes(uid)) {
    return json({ error: 'Aap is coupon ko pehle hi redeem kar chuke hain.' }, 400);
  }

  // Ensure this is a 100% free coupon
  if (!matchedCoupon.isFree) {
    return json({
      error: 'Yeh discount coupon hai. Kripya purchase screen par apply karke continue karein.',
    }, 400);
  }

  // Check plan restriction if coupon specifies a plan
  const requestedPlan = body.plan ? String(body.plan).toLowerCase() : '';
  if (
    matchedCoupon.plan &&
    matchedCoupon.plan !== 'all' &&
    requestedPlan &&
    matchedCoupon.plan.toLowerCase() !== requestedPlan &&
    !(matchedCoupon.plan.toLowerCase() === 'yearly' && requestedPlan === 'annual')
  ) {
    return json({
      error: `Yeh coupon sirf "${matchedCoupon.plan.toUpperCase()}" plan ke liye valid hai.`,
    }, 400);
  }

  const planToActivate = matchedCoupon.plan && matchedCoupon.plan !== 'all'
    ? matchedCoupon.plan.toLowerCase()
    : (requestedPlan || 'lifetime');

  const now = new Date().toISOString();

  // ── Step 1: Update coupon usage in Firestore ─────────────────────────────
  const newUsedCount = matchedCoupon.usedCount + 1;
  const updatedRedeemedUsers = [...matchedCoupon.redeemedUsers, uid];

  const patchCouponUrl =
    `${couponsUrl}/${encodeURIComponent(matchedCoupon.docId)}` +
    `?updateMask.fieldPaths=usedCount` +
    `&updateMask.fieldPaths=used_count` +
    `&updateMask.fieldPaths=redeemedUsers`;

  const patchCouponRes = await fetch(patchCouponUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        usedCount: { integerValue: String(newUsedCount) },
        used_count: { integerValue: String(newUsedCount) },
        redeemedUsers: {
          arrayValue: {
            values: updatedRedeemedUsers.map((u) => ({ stringValue: u })),
          },
        },
      },
    }),
  });

  if (!patchCouponRes.ok) {
    console.warn('[redeem-coupon] Failed to update coupon record:', await patchCouponRes.text());
  }

  // ── Step 2: Grant premium in Firestore users/{uid} ───────────────────────
  try {
    await updateFirestoreUser(
      FIREBASE_PROJECT,
      uid,
      {
        is_premium:           true,
        premium_plan:         planToActivate,
        premium_activated_at: now,
        premium_coupon_code:  cleanCode,
        updated_at:           now,
      },
      SA_EMAIL,
      SA_KEY,
    );
    console.log(`[redeem-coupon] ✅ Premium granted to ${uid}: plan=${planToActivate}`);
  } catch (fsErr: unknown) {
    const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
    console.error('[redeem-coupon] Firestore update error:', msg);
    return json({ error: `Failed to activate premium: ${msg}` }, 500);
  }

  return json({
    success: true,
    plan: planToActivate,
    message: `Code "${cleanCode}" applied! Pro unlocked (${planToActivate.toUpperCase()}).`,
  });
});
