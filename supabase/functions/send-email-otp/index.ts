/**
 * send-email-otp — Supabase Edge Function
 *
 * Generates a secure 6-digit OTP, creates a tamper-proof HMAC signature,
 * and sends the transactional email via Brevo API.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const BREVO_SENDER_EMAIL = Deno.env.get('BREVO_SENDER_EMAIL') ?? 'innovatexlab.services@gmail.com';
const BREVO_SENDER_NAME = Deno.env.get('BREVO_SENDER_NAME') ?? 'Rupeo';
const FIREBASE_API_KEY = Deno.env.get('FIREBASE_WEB_API_KEY') ?? '';
const OTP_SECRET = Deno.env.get('OTP_SECRET') ?? BREVO_API_KEY;

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

// Common disposable email domains set
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', '10minmail.com', 'guerrillamail.com',
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'sharklasers.com',
  'grr.la', 'pokemail.net', 'mailinator.com', 'mailinator.net', 'mailinator2.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'tempmail.com', 'tempmail.net',
  'temp-mail.org', 'temp-mail.io', 'dispostable.com', 'throwawaymail.com',
  'getairmail.com', 'trashmail.com', 'trashmail.net', 'trashmail.org',
  'fakeinbox.com', 'emailondeck.com', 'maildrop.cc', 'inboxkitten.com',
  'nada.ltd', 'getnada.com', 'mohmal.com', 'burnermail.io', 'crazymailing.com',
  'tempail.com', 'mytemp.email', 'generator.email', 'tempinbox.com', 'dropmail.me'
]);

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

    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain && DISPOSABLE_DOMAINS.has(emailDomain)) {
      return json({ error: 'Disposable email addresses are not allowed.' }, 400);
    }

    // Generate secure 6-digit code
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    const code = (100000 + (randomArray[0] % 900000)).toString();

    // 10 minute expiry
    const nowMs = Date.now();
    const expiresAt = nowMs + 10 * 60 * 1000;

    // HMAC token over uid + email + code + expiresAt
    const rawData = `${uid}:${email.toLowerCase()}:${code}:${expiresAt}`;
    const token = await createHmacToken(OTP_SECRET, rawData);

    // Send transactional email via Brevo
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [{ email }],
        subject: 'Your Rupeo verification code',
        textContent: `Your Rupeo verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
        htmlContent: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; max-width: 500px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #0f172a; margin-bottom: 8px;">Verify your Rupeo account</h2>
  <p style="margin-bottom: 20px;">Use the following 6-digit verification code to complete your signup:</p>
  <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px 24px; text-align: center; margin: 24px 0;">
    <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0f172a;">${code}</span>
  </div>
  <p style="font-size: 14px; color: #64748b; margin-top: 20px;">This code will expire in 10 minutes.</p>
  <p style="font-size: 13px; color: #94a3b8; margin-top: 16px;">If you didn't request this, ignore this email.</p>
</body>
</html>`,
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      console.error('Brevo API Error:', brevoRes.status, errText);
      let errMsg = 'Failed to send verification email via Brevo.';
      try {
        const errJson = JSON.parse(errText);
        if (errJson.message) errMsg = errJson.message;
      } catch {}
      return json({ error: errMsg }, brevoRes.status >= 400 && brevoRes.status < 500 ? 400 : 500);
    }

    return json({
      success: true,
      token,
      expiresAt,
      message: 'Verification code sent successfully.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('send-email-otp error:', msg);
    return json({ error: msg }, 500);
  }
});
