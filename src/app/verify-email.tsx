import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  AppState,
  AppStateStatus,
  ScrollView,
  Linking,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { maskEmail, sendEmailOtpOnServer, verifyEmailOtpOnServer } from '@/lib/authVerification';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from '@/lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  requestNotificationPermissions,
  sendWelcomeNotification,

} from '@/lib/notifications';
import { warn, error } from '@/lib/logger';

type VerifyMode = 'otp' | 'link';

const LINK_WAIT_SECONDS = 30; // seconds before "Verify via Link" button unlocks

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const currentUser = auth.currentUser;
  const userEmail = currentUser?.email || '';

  // ── Mode ───────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<VerifyMode>('otp');

  // ── OTP ────────────────────────────────────────────────────────────────────
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Cooldowns ──────────────────────────────────────────────────────────────
  const [resendCooldown, setResendCooldown] = useState(60);
  const [linkWait, setLinkWait] = useState(LINK_WAIT_SECONDS); // 30s before link button unlocks
  const [resendingOtp, setResendingOtp] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [resendLinkCooldown, setResendLinkCooldown] = useState(0);

  // ── Link-mode ──────────────────────────────────────────────────────────────
  const [linkVerified, setLinkVerified] = useState(false);

  // ── Animations ─────────────────────────────────────────────────────────────
  const tickScale = useRef(new Animated.Value(0)).current;
  const tickOpacity = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current; // 0→1 over 30s
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Progress ring animation (30s countdown)
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: LINK_WAIT_SECONDS * 1000,
      useNativeDriver: false,
    }).start();
  }, []);

  // OTP error shake
  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // Tick animation on link verified
  const animateTick = useCallback(() => {
    Animated.parallel([
      Animated.spring(tickScale, { toValue: 1, useNativeDriver: true, tension: 55, friction: 6 }),
      Animated.timing(tickOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [tickScale, tickOpacity]);

  // ── 30s link-wait countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (linkWait <= 0) return;
    const t = setInterval(() => {
      setLinkWait((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(t);
  }, [linkWait]);

  // ── OTP resend cooldown ────────────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // ── Link resend cooldown ───────────────────────────────────────────────────
  useEffect(() => {
    if (resendLinkCooldown <= 0) return;
    const t = setInterval(() => {
      setResendLinkCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(t);
  }, [resendLinkCooldown]);

  // ── Auto-send OTP on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    AsyncStorage.getItem(`@pending_email_otp_${uid}`).then((stored) => {
      if (!stored) {
        sendEmailOtpOnServer().catch((err) => warn('Auto OTP warning:', err));
      }
    }).catch(() => {});
  }, []);

  // ── Complete signup ────────────────────────────────────────────────────────
  const completeVerifiedSignup = useCallback(async () => {
    try {
      if (!auth.currentUser) return;
      await auth.currentUser.getIdToken(true);
      const uid = auth.currentUser.uid;
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          email: auth.currentUser.email,
          name: auth.currentUser.displayName || 'User',
          createdAt: new Date().toISOString(),
          starting_balance: 0,
          has_set_starting_balance: false,
        }, { merge: true });
        requestNotificationPermissions().then((g) => {

        }).catch(() => {});
        sendWelcomeNotification(uid).catch(() => {});
      }
      Toast.show({ type: 'success', text1: 'Email Verified ✓', text2: 'Welcome to Rupeo!' });
      router.replace('/setup');
    } catch (err) {
      error('Signup finalize error:', err);
      router.replace('/setup');
    }
  }, [router]);

  // ── Check Firebase email_verified ─────────────────────────────────────────
  const checkEmailVerification = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        if (mode === 'link') {
          setLinkVerified(true);
          animateTick();
          setTimeout(() => completeVerifiedSignup(), 1600);
        } else {
          await completeVerifiedSignup();
        }
      }
    } catch (err) { warn('Verification check error:', err); }
  }, [completeVerifiedSignup, mode, animateTick]);

  // ── Poll while in link mode ────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'link') return;
    const interval = setInterval(() => checkEmailVerification(), 3000);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') checkEmailVerification();
    });
    return () => { clearInterval(interval); sub.remove(); };
  }, [mode, checkEmailVerification]);

  // ── OTP handlers ──────────────────────────────────────────────────────────
  const handleOtpChange = (value: string, index: number) => {
    setErrorMessage(null);
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 1) {
      const newOtp = [...otp];
      for (let i = 0; i < 6; i++) newOtp[i] = cleaned[i] || '';
      setOtp(newOtp);
      const nextFocus = Math.min(cleaned.length, 5);
      inputRefs.current[nextFocus]?.focus();
      if (cleaned.length === 6) handleVerifyOtp(newOtp.join(''));
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = cleaned;
    setOtp(newOtp);
    if (cleaned && index < 5) inputRefs.current[index + 1]?.focus();
    if (cleaned && index === 5) {
      const full = newOtp.join('');
      if (full.length === 6) handleVerifyOtp(full);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = codeToVerify || otp.join('');
    if (code.length !== 6) { setErrorMessage('Enter the complete 6-digit code'); return; }
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await verifyEmailOtpOnServer(code);
      if (res?.success && res?.verified) await completeVerifiedSignup();
    } catch (err: any) {
      error('OTP error:', err);
      triggerShake();
      const c = err?.code;
      if (c === 'expired') setErrorMessage('Code expired. Please request a new one.');
      else if (c === 'locked') setErrorMessage('Too many attempts. Please wait before retrying.');
      else setErrorMessage(err?.message || 'Invalid code. Please try again.');
    } finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    if (resendingOtp || resendCooldown > 0) return;
    try {
      setResendingOtp(true);
      setErrorMessage(null);
      await sendEmailOtpOnServer();
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setResendCooldown(60);
      Toast.show({ type: 'success', text1: 'New code sent', text2: 'Check your inbox.' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed', text2: err?.message || 'Try again.' });
    } finally { setResendingOtp(false); }
  };

  const handleSendVerifyLink = async () => {
    if (sendingLink || linkWait > 0 || !auth.currentUser) return;
    try {
      setSendingLink(true);
      await sendEmailVerification(auth.currentUser);
      setResendLinkCooldown(60);
      setMode('link');
      setLinkVerified(false);
      tickScale.setValue(0);
      tickOpacity.setValue(0);
      Toast.show({ type: 'success', text1: 'Link sent!', text2: 'Check your inbox and click the link.' });
    } catch (err: any) {
      if (err?.code === 'auth/too-many-requests') {
        setResendLinkCooldown(60);
        Toast.show({ type: 'error', text1: 'Too many requests', text2: 'Please wait a minute.' });
      } else {
        Toast.show({ type: 'error', text1: 'Failed to send', text2: err?.message || 'Try again.' });
      }
    } finally { setSendingLink(false); }
  };

  const handleResendLink = async () => {
    if (sendingLink || resendLinkCooldown > 0 || !auth.currentUser) return;
    try {
      setSendingLink(true);
      await sendEmailVerification(auth.currentUser);
      setResendLinkCooldown(60);
      Toast.show({ type: 'success', text1: 'Link resent', text2: 'Check your inbox.' });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed', text2: err?.message || 'Try again.' });
    } finally { setSendingLink(false); }
  };

  const handleOpenMail = async () => {
    try {
      const can = await Linking.canOpenURL('message:');
      if (can) await Linking.openURL('message:');
      else await Linking.openURL('mailto:');
    } catch { await Linking.openURL('mailto:'); }
  };

  const handleSignOut = async () => {
    try { await signOut(auth); } catch {}
    router.replace('/login');
  };

  const isCodeComplete = otp.every((d) => d.length === 1);
  const linkButtonUnlocked = linkWait <= 0;

  // ══════════════════════════════════════════════════════════════════════════
  // LINK WAITING SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  if (mode === 'link') {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.center} showsVerticalScrollIndicator={false}>

          {/* Icon area */}
          <View style={styles.iconArea}>
            {linkVerified ? (
              <Animated.View style={[styles.successCircle, { transform: [{ scale: tickScale }], opacity: tickOpacity }]}>
                <Ionicons name="checkmark" size={42} color="#fff" />
              </Animated.View>
            ) : (
              <View style={styles.envelopeCircle}>
                <Ionicons name="mail-open-outline" size={36} color="#4F46E5" />
              </View>
            )}
          </View>

          {/* Text */}
          {linkVerified ? (
            <View style={styles.textBlock}>
              <Text style={styles.heading}>Verified!</Text>
              <Text style={styles.sub}>Setting up your account...</Text>
              <ActivityIndicator size="small" color="#4F46E5" style={{ marginTop: 20 }} />
            </View>
          ) : (
            <>
              <View style={styles.textBlock}>
                <Text style={styles.heading}>Check your inbox</Text>
                <Text style={styles.sub}>We sent a verification link to</Text>
                <View style={styles.emailPill}>
                  <Ionicons name="mail" size={13} color="#4F46E5" />
                  <Text style={styles.emailPillText}>{maskEmail(userEmail)}</Text>
                </View>
                <Text style={styles.instruction}>
                  Tap the link in that email to verify your account. This screen updates automatically once verified.
                </Text>
              </View>

              {/* Waiting indicator */}
              <View style={styles.waitingRow}>
                <ActivityIndicator size="small" color="#9CA3AF" />
                <Text style={styles.waitingLabel}>Waiting for verification…</Text>
              </View>

              {/* Already verified */}
              <TouchableOpacity style={styles.alreadyBtn} onPress={checkEmailVerification} activeOpacity={0.75}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#4F46E5" />
                <Text style={styles.alreadyBtnText}>I already clicked the link</Text>
              </TouchableOpacity>

              {/* Open mail */}
              <TouchableOpacity style={styles.outlineBtn} onPress={handleOpenMail} activeOpacity={0.75}>
                <Ionicons name="open-outline" size={15} color="#374151" />
                <Text style={styles.outlineBtnText}>Open Email App</Text>
              </TouchableOpacity>

              {/* Resend link */}
              <TouchableOpacity
                style={[styles.ghostBtn, (resendLinkCooldown > 0 || sendingLink) && styles.ghostBtnDisabled]}
                onPress={handleResendLink}
                disabled={resendLinkCooldown > 0 || sendingLink}
                activeOpacity={0.7}
              >
                {sendingLink ? <ActivityIndicator size="small" color="#9CA3AF" /> : (
                  <Text style={styles.ghostBtnText}>
                    {resendLinkCooldown > 0 ? `Resend link in ${resendLinkCooldown}s` : 'Resend link'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Back to OTP */}
              <TouchableOpacity style={styles.backLink} onPress={() => setMode('otp')} activeOpacity={0.7}>
                <Ionicons name="arrow-back" size={14} color="#6B7280" />
                <Text style={styles.backLinkText}>Back to OTP code</Text>
              </TouchableOpacity>

              {/* Spam hint */}
              <View style={styles.hint}>
                <Ionicons name="information-circle-outline" size={15} color="#9CA3AF" />
                <Text style={styles.hintText}>
                  Can't find it? Check <Text style={styles.hintBold}>Spam</Text> or{' '}
                  <Text style={styles.hintBold}>Promotions</Text> folder.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OTP SCREEN (primary)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Icon */}
          <View style={styles.iconArea}>
            <View style={styles.envelopeCircle}>
              <Ionicons name="mail-unread-outline" size={36} color="#4F46E5" />
            </View>
            <View style={styles.iconBadge}>
              <Text style={styles.iconBadgeText}>6</Text>
            </View>
          </View>

          {/* Heading */}
          <View style={styles.textBlock}>
            <Text style={styles.heading}>Enter verification code</Text>
            <Text style={styles.sub}>We sent a 6-digit code to</Text>
            <View style={styles.emailPill}>
              <Ionicons name="mail" size={13} color="#4F46E5" />
              <Text style={styles.emailPillText}>{maskEmail(userEmail)}</Text>
            </View>
          </View>

          {/* OTP Inputs */}
          <Animated.View style={[styles.otpRow, { transform: [{ translateX: shakeAnim }] }]}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={(r) => { inputRefs.current[i] = r; }}
                style={[
                  styles.otpBox,
                  digit ? styles.otpBoxFilled : null,
                  errorMessage ? styles.otpBoxError : null,
                  i === 2 ? { marginRight: 18 } : null,
                ]}
                value={digit}
                onChangeText={(v) => handleOtpChange(v, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                autoFocus={i === 0}
                selectTextOnFocus
              />
            ))}
          </Animated.View>

          {/* Error */}
          {errorMessage && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.primaryBtn, (!isCodeComplete || loading) && styles.primaryBtnDisabled]}
            onPress={() => handleVerifyOtp()}
            disabled={!isCodeComplete || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.primaryBtnText}>Verify & Continue</Text>
            }
          </TouchableOpacity>

          {/* Resend OTP */}
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive it?</Text>
            <TouchableOpacity
              onPress={handleResendOtp}
              disabled={resendingOtp || resendCooldown > 0}
              activeOpacity={0.7}
            >
              {resendingOtp
                ? <ActivityIndicator size="small" color="#4F46E5" />
                : <Text style={[styles.resendLink, resendCooldown > 0 && styles.resendLinkDisabled]}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Verify via Link — locked for 30s */}
          <View style={styles.linkSection}>
            <Text style={styles.linkSectionLabel}>Prefer a verification link?</Text>
            <Text style={styles.linkSectionSub}>
              {linkButtonUnlocked
                ? 'Send a one-click verification link to your email.'
                : `Available in ${linkWait}s — give your inbox a moment to receive the code first.`}
            </Text>

            {/* 30s progress bar */}
            {!linkButtonUnlocked && (
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.linkBtn, (!linkButtonUnlocked || sendingLink) && styles.linkBtnDisabled]}
              onPress={handleSendVerifyLink}
              disabled={!linkButtonUnlocked || sendingLink}
              activeOpacity={0.8}
            >
              {sendingLink
                ? <ActivityIndicator size="small" color="#4F46E5" />
                : (
                  <>
                    <Ionicons
                      name="link-outline"
                      size={15}
                      color={linkButtonUnlocked ? '#4F46E5' : '#D1D5DB'}
                    />
                    <Text style={[styles.linkBtnText, !linkButtonUnlocked && styles.linkBtnTextDisabled]}>
                      Send Verification Link
                    </Text>
                  </>
                )
              }
            </TouchableOpacity>
          </View>

          {/* Spam hint */}
          <View style={styles.hint}>
            <Ionicons name="information-circle-outline" size={15} color="#9CA3AF" />
            <Text style={styles.hintText}>
              Can't find the email? Check{' '}
              <Text style={styles.hintBold}>Spam</Text> or{' '}
              <Text style={styles.hintBold}>Promotions</Text>.
            </Text>
          </View>

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={13} color="#9CA3AF" />
            <Text style={styles.signOutText}>Use a different account</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const INDIGO = '#4F46E5';
const INDIGO_LIGHT = '#EEF2FF';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },

  // ── Icon ──────────────────────────────────────────────────────────────────
  iconArea: {
    marginBottom: 28,
    position: 'relative',
    alignItems: 'center',
  },
  envelopeCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: INDIGO_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  iconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: INDIGO,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FAFAFA',
  },
  iconBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  successCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
  },

  // ── Text ──────────────────────────────────────────────────────────────────
  textBlock: {
    alignItems: 'center',
    marginBottom: 28,
    width: '100%',
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 10,
  },
  instruction: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
    paddingHorizontal: 8,
  },
  emailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: INDIGO_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  emailPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3730A3',
  },

  // ── OTP ───────────────────────────────────────────────────────────────────
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  otpBox: {
    width: 46,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderColor: INDIGO,
    backgroundColor: INDIGO_LIGHT,
  },
  otpBoxError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },

  // ── Error ─────────────────────────────────────────────────────────────────
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12.5,
    color: '#EF4444',
    fontWeight: '600',
  },

  // ── Primary button ────────────────────────────────────────────────────────
  primaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: INDIGO,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: INDIGO,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtnDisabled: {
    backgroundColor: '#C7D2FE',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },

  // ── Resend OTP ────────────────────────────────────────────────────────────
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  resendLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  resendLink: {
    fontSize: 13,
    fontWeight: '700',
    color: INDIGO,
  },
  resendLinkDisabled: {
    color: '#9CA3AF',
    fontWeight: '600',
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },

  // ── Link section ──────────────────────────────────────────────────────────
  linkSection: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
    gap: 10,
  },
  linkSectionLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111827',
  },
  linkSectionSub: {
    fontSize: 12.5,
    color: '#6B7280',
    lineHeight: 18,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: INDIGO,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: INDIGO,
    backgroundColor: INDIGO_LIGHT,
  },
  linkBtnDisabled: {
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  linkBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: INDIGO,
  },
  linkBtnTextDisabled: {
    color: '#D1D5DB',
  },

  // ── Link mode buttons ─────────────────────────────────────────────────────
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  waitingLabel: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  alreadyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    marginBottom: 12,
  },
  alreadyBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#059669',
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    width: '100%',
    height: 46,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  outlineBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#374151',
  },
  ghostBtn: {
    width: '100%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  ghostBtnDisabled: {
    opacity: 0.5,
  },
  ghostBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    marginBottom: 16,
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },

  // ── Hint ──────────────────────────────────────────────────────────────────
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  hintBold: {
    fontWeight: '700',
    color: '#6B7280',
  },

  // ── Sign out ──────────────────────────────────────────────────────────────
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  signOutText: {
    fontSize: 12.5,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});
