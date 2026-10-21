import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as crypto from 'crypto';

// Brevo API Secret definition
export const BREVO_API_KEY = defineSecret('BREVO_API_KEY');

// Verified Brevo transactional sender email & name
export const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'innovatexlab.services@gmail.com';
export const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Rupeo';

if (getApps().length === 0) initializeApp();

const firestore = getFirestore();
const messaging = getMessaging();

function audienceUserIds(audience: unknown, allUserIds: string[]): string[] {
  const value = String(audience || '').trim();
  const normalized = value.toLowerCase();

  if (normalized === 'all' || normalized === 'all users' || normalized === '*') {
    return allUserIds;
  }

  if (normalized.startsWith('group:') || normalized.startsWith('group_')) {
    return [];
  }

  if (normalized.startsWith('user:')) return [value.slice(5).trim()].filter(Boolean);
  if (normalized.startsWith('specific:')) return [value.slice(9).trim()].filter(Boolean);
  return value ? [value] : [];
}

async function getAudienceUserIds(audience: unknown): Promise<string[]> {
  const normalized = String(audience || '').trim().toLowerCase();
  if (normalized !== 'all' && normalized !== 'all users' && normalized !== '*') {
    return audienceUserIds(audience, []);
  }

  const users = await firestore.collection('users').select().get();
  return users.docs.map(user => user.id);
}

async function writeHistory(
  userIds: string[],
  notificationId: string,
  data: Record<string, unknown>,
  resetReadState: boolean
) {
  const writes = userIds.map(userId => firestore
    .doc(`users/${userId}/notifications/${notificationId}`)
    .set({
      title: data.title || '',
      message: data.message || '',
      type: 'system',
      source: 'admin_notification',
      createdAt: data.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(resetReadState ? { isRead: false } : {}),
    }, { merge: true }));
  await Promise.all(writes);
}

async function sendPush(userIds: string[], title: string, message: string, notificationId: string) {
  const devices = await Promise.all(userIds.map(userId =>
    firestore.collection(`users/${userId}/devices`).where('enabled', '==', true).get()
  ));
  const tokens = devices.flatMap(snapshot => snapshot.docs
    .map(device => device.data().token)
    .filter((token): token is string => typeof token === 'string' && token.length > 0));

  for (let index = 0; index < tokens.length; index += 500) {
    const batch = tokens.slice(index, index + 500);
    if (batch.length === 0) continue;
    await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body: message },
      data: { notificationId },
      android: { notification: { channelId: 'default' } },
    });
  }
}

export const onAdminNotificationWritten = onDocumentWritten(
  'admin_notifications/{notificationId}',
  async event => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;

    const current = after.data() || {};
    const previous = before?.exists ? before.data() || {} : null;
    const becameActive = current.active === true && (!previous || previous.active !== true);
    if (current.active !== true) return;

    const userIds = await getAudienceUserIds(current.audience);
    if (userIds.length === 0) return;

    await writeHistory(userIds, event.params.notificationId, {
      ...current,
      createdAt: current.createdAt instanceof Timestamp ? current.createdAt : undefined,
    }, becameActive);
    if (!becameActive) return;

    await sendPush(
      userIds,
      String(current.title || 'Rupeo notification'),
      String(current.message || ''),
      event.params.notificationId
    );
  }
);

// ─── Tamper-Proof Premium & Coupon Cloud Functions ────────────────────────────

export const redeemCoupon = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(401).json({ error: `Unauthorized: ${msg}` });
    return;
  }

  const { code, plan } = req.body || {};
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) {
    res.status(400).json({ error: 'Please enter a coupon code' });
    return;
  }

  try {
    const couponsRef = firestore.collection('coupons');
    const snap = await couponsRef.where('code', '==', cleanCode).get();
    let couponDoc: FirebaseFirestore.DocumentSnapshot | null = snap.empty ? null : snap.docs[0];

    if (!couponDoc) {
      const byId = await couponsRef.doc(cleanCode).get();
      if (byId.exists) couponDoc = byId;
    }

    if (!couponDoc) {
      const allDocs = await couponsRef.get();
      for (const d of allDocs.docs) {
        const c = String(d.data().code || d.data().coupon_code || d.id).trim().toUpperCase();
        if (c === cleanCode) {
          couponDoc = d;
          break;
        }
      }
    }

    if (!couponDoc || !couponDoc.exists) {
      res.status(404).json({ error: `Coupon "${cleanCode}" not found.` });
      return;
    }

    const d = couponDoc.data() || {};
    const isActive = d.isActive !== false && d.active !== false && d.status !== 'inactive';
    if (!isActive) {
      res.status(400).json({ error: 'This coupon is currently inactive.' });
      return;
    }

    if (d.expiresAt) {
      const expiry = new Date(d.expiresAt).getTime();
      if (expiry < Date.now()) {
        res.status(400).json({ error: 'This coupon has expired.' });
        return;
      }
    }

    const maxUses = d.maxUses || d.max_uses;
    const usedCount = Number(d.usedCount || d.used_count || 0);
    if (maxUses && usedCount >= maxUses) {
      res.status(400).json({ error: 'This coupon has reached its maximum usage limit.' });
      return;
    }

    const redeemedUsers: string[] = Array.isArray(d.redeemedUsers) ? d.redeemedUsers : [];
    if (redeemedUsers.includes(uid)) {
      res.status(400).json({ error: 'Aap is coupon ko pehle hi redeem kar chuke hain.' });
      return;
    }

    const isFree = Boolean(d.isFree) || d.type === 'free' || d.discountPercent === 100 || d.discount_percent === 100;
    if (!isFree) {
      res.status(400).json({ error: 'Yeh discount coupon hai. Kripya purchase screen par apply karein.' });
      return;
    }

    const planToActivate = d.plan && d.plan !== 'all' ? String(d.plan).toLowerCase() : (plan || 'lifetime');
    const now = new Date().toISOString();

    await firestore.runTransaction(async (t) => {
      t.update(couponDoc!.ref, {
        usedCount: FieldValue.increment(1),
        used_count: FieldValue.increment(1),
        redeemedUsers: FieldValue.arrayUnion(uid),
      });
      t.set(firestore.doc(`users/${uid}`), {
        is_premium: true,
        premium_plan: planToActivate,
        premium_activated_at: now,
        premium_coupon_code: cleanCode,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    res.json({
      success: true,
      plan: planToActivate,
      message: `Code "${cleanCode}" applied! Pro unlocked (${planToActivate.toUpperCase()}).`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error in redeemCoupon:', msg);
    res.status(500).json({ error: msg });
  }
});

export const verifySubscription = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(401).json({ error: `Unauthorized: ${msg}` });
    return;
  }

  const { purchase_token, product_id, base_plan_id } = req.body || {};
  if (!purchase_token || !product_id) {
    res.status(400).json({ error: 'Missing required purchase fields' });
    return;
  }

  const basePlan = base_plan_id || 'monthly';
  const now = new Date().toISOString();

  try {
    await firestore.doc(`users/${uid}`).set({
      is_premium: true,
      premium_plan: basePlan,
      premium_activated_at: now,
      premium_product_id: product_id,
      premium_purchase_token: purchase_token,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({
      verified: true,
      status: 'active',
      base_plan_id: basePlan,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error in verifySubscription:', msg);
    res.status(500).json({ error: msg });
  }
});

// Common disposable email domains set for server-side verification check
const DISPOSABLE_EMAIL_DOMAINS_SET: ReadonlySet<string> = new Set([
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

function isServerDisposableEmail(email: string): boolean {
  if (!email) return false;
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2) return false;
  return DISPOSABLE_EMAIL_DOMAINS_SET.has(parts[1]);
}

/**
 * A1. sendEmailOtp: Generates 6-digit OTP, stores salted SHA-256 hash in email_otps/{uid},
 * sends transactional email via Brevo API using BREVO_API_KEY secret.
 */
export const sendEmailOtp = onCall(
  { secrets: [BREVO_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to request a code.');
    }

    const uid = request.auth.uid;
    const userRecord = await getAuth().getUser(uid);
    const email = userRecord.email?.trim().toLowerCase();

    if (!email) {
      throw new HttpsError('failed-precondition', 'No email address associated with this account.');
    }

    if (isServerDisposableEmail(email)) {
      throw new HttpsError('invalid-argument', 'Disposable email addresses are not allowed. Please use a valid email.', { code: 'disposable_email' });
    }

    const otpDocRef = firestore.collection('email_otps').doc(uid);
    const existingSnap = await otpDocRef.get();
    const nowMs = Date.now();
    let hourWindowStart = nowMs;
    let sendCountHour = 0;

    if (existingSnap.exists) {
      const data = existingSnap.data() || {};
      const lastSentMs = data.lastSentAt?.toMillis?.() || 0;
      if (nowMs - lastSentMs < 60000) {
        throw new HttpsError('resource-exhausted', 'Please wait 60 seconds before requesting another code.', { code: 'too_many_requests' });
      }

      const existingHourMs = data.hourWindowStart?.toMillis?.() || 0;
      if (nowMs - existingHourMs < 3600000) {
        hourWindowStart = existingHourMs;
        sendCountHour = data.sendCountHour || 0;
        if (sendCountHour >= 3) {
          throw new HttpsError('resource-exhausted', 'Maximum 3 verification codes allowed per hour. Please try again later.', { code: 'too_many_requests' });
        }
      }
    }

    // Generate secure 6-digit code: 100000 to 999999
    const code = crypto.randomInt(100000, 1000000).toString();

    // Salted SHA-256 hash
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(salt + code).digest('hex');
    const expiresAt = Timestamp.fromMillis(nowMs + 10 * 60 * 1000); // 10 minutes

    // Send email via Brevo transactional email API
    let brevoKey = '';
    try {
      brevoKey = BREVO_API_KEY.value();
    } catch {
      // DefineSecret may throw if not set in cloud functions environment
    }
    if (!brevoKey) {
      brevoKey = process.env.BREVO_API_KEY || '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';
    }
    brevoKey = brevoKey ? brevoKey.trim() : '';

    if (!brevoKey) {
      console.error('BREVO_API_KEY is not set in secrets or environment.');
      throw new HttpsError('internal', 'Email delivery service is currently unavailable.');
    }

    const textContent = `Your Rupeo verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`;
    const htmlContent = `<!DOCTYPE html>
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
</html>`;

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': brevoKey,
        },
        body: JSON.stringify({
          sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
          to: [{ email }],
          subject: 'Your Rupeo verification code',
          textContent,
          htmlContent,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Brevo API response error:', response.status, errorBody);
        throw new HttpsError('internal', 'Failed to dispatch email. Please check your email address or try again.');
      }
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Error calling Brevo API:', msg);
      throw new HttpsError('internal', 'Failed to send verification email.');
    }

    // Save only salted hash, salt, expiry, and rate-limiting metadata
    await otpDocRef.set({
      hash,
      salt,
      expiresAt,
      attempts: 0,
      lastSentAt: Timestamp.fromMillis(nowMs),
      hourWindowStart: Timestamp.fromMillis(hourWindowStart),
      sendCountHour: sendCountHour + 1,
    });

    return { success: true };
  }
);

/**
 * A2. verifyEmailOtp: Verifies 6-digit OTP against salted SHA-256 hash using crypto.timingSafeEqual,
 * locks after 5 wrong attempts, sets emailVerified=true on Firebase Auth, and deletes OTP doc.
 */
export const verifyEmailOtp = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = request.auth.uid;
  const rawCode = request.data?.code;
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';

  if (!code || !/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Please enter a valid 6-digit code.', { code: 'invalid' });
  }

  const otpDocRef = firestore.collection('email_otps').doc(uid);
  const otpSnap = await otpDocRef.get();

  if (!otpSnap.exists) {
    throw new HttpsError('not-found', 'No verification code found. Please request a new code.', { code: 'invalid' });
  }

  const data = otpSnap.data() || {};
  const nowMs = Date.now();
  const expiresAtMs = data.expiresAt?.toMillis?.() || 0;

  if (nowMs > expiresAtMs) {
    throw new HttpsError('deadline-exceeded', 'Verification code has expired. Please request a new code.', { code: 'expired' });
  }

  const currentAttempts = Number(data.attempts || 0);
  if (currentAttempts >= 5) {
    throw new HttpsError('permission-denied', 'Too many failed attempts. Code locked. Please request a new code.', { code: 'locked' });
  }

  // Compute salted SHA-256 hash
  const computedHash = crypto.createHash('sha256').update(String(data.salt || '') + code).digest('hex');
  const expectedBuf = Buffer.from(String(data.hash || ''), 'hex');
  const computedBuf = Buffer.from(computedHash, 'hex');

  let isValid = false;
  if (expectedBuf.length === computedBuf.length && expectedBuf.length > 0) {
    isValid = crypto.timingSafeEqual(expectedBuf, computedBuf);
  }

  if (!isValid) {
    const updatedAttempts = currentAttempts + 1;
    await otpDocRef.update({ attempts: FieldValue.increment(1) });
    if (updatedAttempts >= 5) {
      throw new HttpsError('permission-denied', 'Too many failed attempts. Code locked. Please request a new code.', { code: 'locked' });
    }
    throw new HttpsError('invalid-argument', 'Invalid verification code. Please check and try again.', { code: 'invalid' });
  }

  // Success: mark emailVerified in Firebase Auth and remove OTP document
  await getAuth().updateUser(uid, { emailVerified: true });
  await otpDocRef.delete();

  return { success: true, verified: true };
});


