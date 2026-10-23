import { User } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '@/lib/firebase';
import { safeJsonParse } from '@/lib/safeStorage';

/**
 * Only email/password accounts created AFTER this cutoff will be gated for email verification.
 * Existing accounts created before this date and Google sign-in users are NEVER gated.
 */
export const VERIFICATION_CUTOFF: number = new Date("2026-10-15T00:00:00Z").getTime();

// In-memory cache of verified user IDs for snappy synchronous checks
const _verifiedUids = new Set<string>();

const VERIFIED_UIDS_KEY = '@rupeo_verified_uids';
// Preload verified UIDs from AsyncStorage
AsyncStorage.getItem(VERIFIED_UIDS_KEY).then((raw) => {
  if (raw) {
    const arr = safeJsonParse<string[]>(raw, [], VERIFIED_UIDS_KEY, (v) => Array.isArray(v));
    arr.forEach((id: string) => _verifiedUids.add(id));
  }
}).catch(() => {});

export function isOtpVerifiedLocal(uid?: string): boolean {
  if (!uid) return false;
  return _verifiedUids.has(uid);
}

export async function markUserOtpVerified(uid: string): Promise<void> {
  if (!uid) return;
  _verifiedUids.add(uid);
  try {
    const arr = Array.from(_verifiedUids);
    await AsyncStorage.setItem('@rupeo_verified_uids', JSON.stringify(arr));
  } catch {}
}

/**
 * A9. GATE (client): require verification only if provider is 'password'
 * AND emailVerified is false AND user hasn't verified OTP locally
 * AND metadata.creationTime is after VERIFICATION_CUTOFF.
 * Google sign-in users and older accounts are never gated.
 */
export function isVerificationRequired(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.emailVerified) return false;
  if (isOtpVerifiedLocal(user.uid)) return false;

  // Google sign-in users are never gated
  const isPasswordProvider = user.providerData?.some(p => p.providerId === 'password');
  if (!isPasswordProvider) return false;

  const creationTime = user.metadata?.creationTime;
  if (!creationTime) return false;

  const createdMs = new Date(creationTime).getTime();
  if (isNaN(createdMs)) return false;

  return createdMs >= VERIFICATION_CUTOFF;
}

/**
 * Masks an email for display (e.g. j***e@example.com).
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [name, domain] = email.trim().toLowerCase().split('@');
  if (!name || !domain) return email;
  if (name.length <= 2) {
    return `${name[0]}*@${domain}`;
  }
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xsphtqvqquizmduajuyq.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY || '';

/**
 * Send 6-digit OTP to user's email via Supabase Edge Function (Brevo transactional email API).
 */
export async function sendEmailOtpOnServer(): Promise<{ success: boolean; message?: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User is not authenticated.');
  }

  const idToken = await currentUser.getIdToken(true);
  const endpoint = `${SUPABASE_URL}/functions/v1/send-email-otp`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
  };
  if (SUPABASE_ANON_KEY) {
    headers['apikey'] = SUPABASE_ANON_KEY;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to send verification code (HTTP ${res.status})`);
  }

  if (data?.token && data?.expiresAt) {
    await AsyncStorage.setItem(
      `@pending_email_otp_${currentUser.uid}`,
      JSON.stringify({ token: data.token, expiresAt: data.expiresAt })
    );
  }

  return { success: true, message: data?.message };
}

/**
 * Verify 6-digit OTP code on server via Supabase Edge Function.
 */
export async function verifyEmailOtpOnServer(code: string): Promise<{ success: boolean; verified: boolean }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User is not authenticated.');
  }

  const cleanCode = code.trim();
  if (!cleanCode || !/^\d{6}$/.test(cleanCode)) {
    throw new Error('Please enter a valid 6-digit code.');
  }

  const pendingKey = `@pending_email_otp_${currentUser.uid}`;
  const storedRaw = await AsyncStorage.getItem(pendingKey);
  let token = '';
  let expiresAt = 0;
  if (storedRaw) {
    const parsed = safeJsonParse<{ token?: string; expiresAt?: number }>(storedRaw, {}, pendingKey);
    token = parsed.token || '';
    expiresAt = Number(parsed.expiresAt || 0);
  }

  const idToken = await currentUser.getIdToken();
  const endpoint = `${SUPABASE_URL}/functions/v1/verify-email-otp`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
  };
  if (SUPABASE_ANON_KEY) {
    headers['apikey'] = SUPABASE_ANON_KEY;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      code: cleanCode,
      token,
      expiresAt,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error || `Invalid verification code (HTTP ${res.status})`);
    if (data?.code) err.code = data.code;
    throw err;
  }

  if (data?.success && data?.verified) {
    await markUserOtpVerified(currentUser.uid);
    await AsyncStorage.removeItem(`@pending_email_otp_${currentUser.uid}`);
  }

  return { success: true, verified: true };
}
