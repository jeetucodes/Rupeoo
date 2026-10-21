/**
 * verify-subscription — Supabase Edge Function
 *
 * Called from the Rupeo app immediately after a successful Google Play purchase.
 * 
 * What this function does:
 *   1. Receives purchase_token + product_id + user_id (Firebase UID) from app
 *   2. Calls Google Play subscriptionsv2.get API to verify the token is genuine
 *      and fetch definitive subscription state (status, expiry, basePlanId)
 *   3. Upserts the Supabase `subscriptions` table with verified data
 *      (overwrites the optimistic client-side write with ground truth)
 *   4. Returns verified state to the app
 *
 * Security:
 *   - The Google Play API call is the real verification — only Google can confirm
 *     a purchase_token is valid for your package
 *   - The obfuscatedAccountId in the Play response should match user_id
 *     (we set this at purchase time in purchaseSubscription())
 *   - Requires Supabase anon key in apikey header (standard Supabase function auth)
 *
 * Environment secrets (set via: supabase secrets set KEY=value):
 *   GOOGLE_SA_EMAIL              — service account client_email
 *   GOOGLE_SA_PRIVATE_KEY        — service account private_key (JSON escaped \n)
 *   ANDROID_PACKAGE_NAME         — your app's package name
 *   FIREBASE_PROJECT_ID          — Firebase / GCP project ID
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getPlaySubscription, mapPlayStateToStatus } from '../_shared/play-api.ts';
import { updateFirestoreUser } from '../_shared/firestore-rest.ts';

// ─── Environment ──────────────────────────────────────────────────────────────
const PACKAGE_NAME     = Deno.env.get('ANDROID_PACKAGE_NAME') ?? 'com.innovatexlabs.paisewaise';
const SA_EMAIL         = Deno.env.get('GOOGLE_SA_EMAIL') ?? '';
// Supabase stores secrets with literal \n — replace with real newlines for PEM parsing
const SA_KEY           = (Deno.env.get('GOOGLE_SA_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');
const SUPA_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPA_SRV_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FIREBASE_PROJECT = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'paisewaise-e545e';
const FIREBASE_API_KEY = Deno.env.get('FIREBASE_WEB_API_KEY') ?? 'AIzaSyAy0P_i2ywT_jpF_leDU-oo3juR1Pu9VJE';

// ─── CORS headers (for Expo / React Native fetch calls) ──────────────────────
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

// ─── Handler ──────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Step 0: Authenticate via Firebase ID token in Authorization header ──────
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
    console.error('[verify-subscription] Auth error:', msg);
    return json({ error: `Unauthorized: ${msg}` }, 401);
  }

  // ── Parse request body ─────────────────────────────────────────────────────
  let body: { purchase_token?: string; product_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { purchase_token, product_id } = body;
  // body.user_id is ignored for security; uid is taken directly from the verified Firebase ID token
  if (!purchase_token || !product_id) {
    return json(
      { error: 'Missing required fields: purchase_token, product_id' },
      400,
    );
  }

  // ── Guard: service account must be configured ──────────────────────────────
  if (!SA_EMAIL || !SA_KEY) {
    console.error('[verify-subscription] GOOGLE_SA_EMAIL or GOOGLE_SA_PRIVATE_KEY not set');
    return json({ error: 'Server configuration error — missing service account' }, 500);
  }

  console.log(
    `[verify-subscription] Verifying for authenticated user=${uid} ` +
    `product=${product_id} token=${purchase_token.substring(0, 20)}...`,
  );

  // ── Step 1: Verify with Google Play API ────────────────────────────────────
  let playDetails;
  try {
    playDetails = await getPlaySubscription(PACKAGE_NAME, purchase_token, SA_EMAIL, SA_KEY);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[verify-subscription] Play API error:', msg);
    return json({ error: `Google Play verification failed: ${msg}` }, 502);
  }

  const status     = mapPlayStateToStatus(playDetails.subscriptionState);
  const basePlanId = playDetails.basePlanId ?? product_id;
  const expiryDate = playDetails.expiryTime ?? null;

  console.log(
    `[verify-subscription] Play result: state=${playDetails.subscriptionState} ` +
    `basePlan=${basePlanId} expiry=${expiryDate} status=${status}`,
  );

  // Enforce obfuscatedAccountId matches the verified user UID
  if (
    playDetails.obfuscatedAccountId &&
    !uid.startsWith(playDetails.obfuscatedAccountId.substring(0, 8))
  ) {
    console.error(
      '[verify-subscription] obfuscatedAccountId mismatch — ' +
      `expected prefix: ${uid.substring(0, 8)}, ` +
      `got: ${playDetails.obfuscatedAccountId.substring(0, 8)}`,
    );
    return json({ error: 'Forbidden: Account ID mismatch' }, 403);
  }

  // ── Step 2: Write premium status to Firestore users/{uid} doc ──────────────
  const now = new Date().toISOString();
  try {
    await updateFirestoreUser(
      FIREBASE_PROJECT,
      uid,
      {
        is_premium:           true,
        premium_plan:         basePlanId,
        premium_activated_at: now,
        premium_product_id:   product_id,
        premium_purchase_token: purchase_token,
        premium_subscription_status: status,
        updated_at:           now,
      },
      SA_EMAIL,
      SA_KEY,
    );
    console.log(`[verify-subscription] ✅ Firestore updated: is_premium=true for ${uid}`);
  } catch (fsErr: unknown) {
    const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
    console.error('[verify-subscription] Firestore update error:', msg);
    return json({ error: `Failed to activate premium in Firestore: ${msg}` }, 500);
  }

  // ── Step 3: Upsert Supabase subscriptions table ───────────────────────────
  const supabase = createClient(SUPA_URL, SUPA_SRV_KEY);

  const upsertData = {
    user_id:       uid,
    product_id,
    base_plan_id:  basePlanId,
    purchase_token,
    status,
    purchase_date: playDetails.startTime ?? now,
    expiry_date:   expiryDate,
    updated_at:    now,
  };

  const { error: upsertError } = await supabase
    .from('subscriptions')
    .upsert(upsertData, { onConflict: 'purchase_token' });

  if (upsertError) {
    console.error('[verify-subscription] Supabase upsert error:', upsertError.message);
  } else {
    console.log('[verify-subscription] ✅ Supabase subscriptions upserted');
  }

  // ── Step 4: Return result to app ───────────────────────────────────────────
  return json({
    verified:      true,
    status,
    base_plan_id:  basePlanId,
    expiry_date:   expiryDate,
    auto_renew:    playDetails.autoRenewEnabled,
    play_state:    playDetails.subscriptionState,
  });
});
