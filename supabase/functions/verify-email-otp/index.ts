/**
 * verify-email-otp — Supabase Edge Function
 *
 * Verifies 6-digit OTP code against the tamper-proof HMAC token.
 * If verified, marks the user's email as verified in Firebase Auth
 * using Google Service Account credentials (if available).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getGoogleAccessToken } from '../_shared/google-auth.ts';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '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';
const FIREBASE_API_KEY = Deno.env.get('FIREBASE_WEB_API_KEY') ?? 'AIzaSyAy0P_i2ywT_jpF_leDU-oo3juR1Pu9VJE';
const FIREBASE_PROJECT = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'paisewaise-e545e';
const OTP_SECRET = Deno.env.get('OTP_SECRET') ?? BREVO_API_KEY;
const SA_EMAIL = Deno.env.get('GOOGLE_SA_EMAIL') ?? '';
const SA_KEY = (Deno.env.get('GOOGLE_SA_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

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

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email: string }> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Invalid authentication token: ${msg}`);
  }

  const data = await res.json();
  const user = data.users?.[0];
  if (!user?.localId || !user?.email) {
    throw new Error('User not found in authentication token');
  }

  return { uid: user.localId, email: user.email };
}

async function createHmacToken(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { uid, email } = await verifyFirebaseIdToken(idToken);

    const body = await req.json().catch(() => ({}));
    const rawCode = String(body.code || '').trim();
    const token = String(body.token || '').trim();
    const expiresAt = Number(body.expiresAt || 0);

    if (!rawCode || !/^\d{6}$/.test(rawCode)) {
      return json({ error: 'Please enter a valid 6-digit code.', code: 'invalid' }, 400);
    }

    if (!token || !expiresAt) {
      return json({ error: 'Invalid or missing verification session. Please request a new code.', code: 'invalid' }, 400);
    }

    if (Date.now() > expiresAt) {
      return json({ error: 'Verification code has expired. Please request a new code.', code: 'expired' }, 400);
    }

    const expectedData = `${uid}:${email.toLowerCase()}:${rawCode}:${expiresAt}`;
    const expectedToken = await createHmacToken(OTP_SECRET, expectedData);

    if (token !== expectedToken) {
      return json({ error: 'Invalid verification code. Please check and try again.', code: 'invalid' }, 400);
    }

    // Code is valid! Mark email as verified on Firebase Auth if SA credentials exist
    if (SA_EMAIL && SA_KEY) {
      try {
        const accessToken = await getGoogleAccessToken(
          SA_EMAIL,
          SA_KEY,
          'https://www.googleapis.com/auth/identitytoolkit'
        );
        const updateUrl = `https://identitytoolkit.googleapis.com/v1/projects/${FIREBASE_PROJECT}/accounts:update`;
        await fetch(updateUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            localId: uid,
            emailVerified: true,
          }),
        });
      } catch (saErr) {
        console.warn('Could not set emailVerified via Google SA:', saErr);
      }
    }

    return json({
      success: true,
      verified: true,
      message: 'Email verified successfully!',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('verify-email-otp error:', msg);
    return json({ error: msg }, 500);
  }
});
