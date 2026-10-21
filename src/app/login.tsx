import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  getAdditionalUserInfo,
  sendEmailVerification,
} from 'firebase/auth';
import { sendEmailOtpOnServer } from '@/lib/authVerification';
import { doc, getDoc, setDoc } from 'firebase/firestore';
// @ts-ignore
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/lib/firebase';
import { isDisposableEmail } from '@/lib/disposableDomains';
import { useTranslation } from '@/lib/i18n';
import { promptGoogleSignIn } from '@/lib/google-auth';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  requestNotificationPermissions,
  sendWelcomeNotification,
  setupPeriodicSmartNotifications,
} from '@/lib/notifications';
import { warn, error } from '@/lib/logger';
import { LegalModal } from '@/components/LegalModal';

export default function AuthScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  // Mode: 'signin' | 'signup'
  const [isSignUp, setIsSignUp] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const ambientMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(ambientMotion, {
        toValue: 1,
        duration: 16000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [ambientMotion]);

  // Email & Password Auth Handler
  const handleEmailAuth = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter your email address' });
      return;
    }
    if (!trimmedPassword) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter your password' });
      return;
    }
    if (trimmedPassword.length < 6) {
      Toast.show({ type: 'error', text1: 'Weak Password', text2: 'Password must be at least 6 characters' });
      return;
    }
    if (isSignUp && isDisposableEmail(trimmedEmail)) {
      Toast.show({ type: 'error', text1: 'Invalid Email', text2: t('disposable_email_error') });
      return;
    }
    if (isSignUp && !name.trim()) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter your name' });
      return;
    }
    if (isSignUp && !agreedToTerms) {
      Toast.show({
        type: 'error',
        text1: 'Terms & Conditions Required',
        text2: 'Please accept the Terms & Conditions and Privacy Policy to create an account.',
      });
      return;
    }

    try {
      setLoading(true);

      if (isSignUp) {
        // 1. Create New Account
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
        if (cred.user) {
          if (name.trim()) {
            await updateProfile(cred.user, { displayName: name.trim() });
          }

          // Send 6-digit OTP via Supabase Edge Function (primary verification method)
          // The Firebase magic link is sent on-demand from the verify-email screen if the user requests it
          try {
            await sendEmailOtpOnServer();
          } catch (otpErr: any) {
            warn('Initial sendEmailOtp warning:', otpErr);
          }

          router.replace('/verify-email');
        }
      } else {
        // 2. Sign In to Existing Account
        const cred = await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
        if (cred.user) {
          requestNotificationPermissions().then((granted) => {
            if (granted) setupPeriodicSmartNotifications().catch(() => {});
          }).catch(() => {});

          const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
          if (!userDoc.exists() || userDoc.data()?.has_set_starting_balance === false) {
            router.replace('/setup');
          } else {
            router.replace('/(tabs)/dashboard');
          }
        }
      }
    } catch (err: any) {
      error('Email Auth Error:', err);
      let msg = err?.message || 'Authentication failed. Please try again.';

      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found') {
        msg = 'Incorrect email or password. Please check your credentials.';
      } else if (err?.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Please sign in instead.';
        setIsSignUp(false);
      } else if (err?.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }

      Toast.show({ type: 'error', text1: isSignUp ? 'Sign Up Failed' : 'Sign In Failed', text2: msg });
    } finally {
      setLoading(false);
    }
  };

  // Google Sign In Handler
  const handleGoogleAuth = async () => {
    if (isSignUp && !agreedToTerms) {
      Toast.show({
        type: 'error',
        text1: 'Terms & Conditions Required',
        text2: 'Please accept the Terms & Conditions and Privacy Policy to create an account.',
      });
      return;
    }

    try {
      setGoogleLoading(true);
      const result = await promptGoogleSignIn();
      if (result?.user) {
        requestNotificationPermissions().then((granted) => {
          if (granted) {
            setupPeriodicSmartNotifications().catch(() => {});
          }
        }).catch(() => {});

        if (getAdditionalUserInfo(result)?.isNewUser) {
          await setDoc(doc(db, 'users', result.user.uid), {
            email: result.user.email,
            name: result.user.displayName || 'User',
            createdAt: new Date().toISOString(),
            starting_balance: 0,
            has_set_starting_balance: false,
          }, { merge: true });

          sendWelcomeNotification(result.user.uid).catch(() => {});
          router.replace('/setup');
        } else {
          router.replace('/(tabs)/dashboard');
        }
      }
    } catch (error: any) {
      warn('Google Auth Error:', error.message);
      if (error?.message !== 'GoogleSignin native module unavailable') {
        Alert.alert('Google Sign-In', error.message || 'Could not sign in with Google.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FBFAF5" />

      {/* Animated Background Blobs */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowTopRight,
          {
            transform: [
              { translateX: ambientMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -40, 0] }) },
              { translateY: ambientMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 30, 0] }) },
              { scale: ambientMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.25, 1] }) }
            ]
          }
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowBottomLeft,
          {
            transform: [
              { translateX: ambientMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 50, 0] }) },
              { translateY: ambientMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -40, 0] }) },
              { scale: ambientMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.35, 1] }) }
            ]
          }
        ]}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Text Section */}
          <View style={styles.header}>
            <Text style={styles.title}>Rupeo</Text>
            <Text style={styles.subtitle}>
              {isSignUp ? 'Create your account to start managing expenses.' : 'Welcome back! Sign in to access your wallet.'}
            </Text>
          </View>

          {/* TAB TOGGLE: SIGN IN / SIGN UP */}
          <View style={styles.tabTrack}>
            <TouchableOpacity
              style={[styles.tabBtn, !isSignUp && styles.tabBtnActive]}
              onPress={() => setIsSignUp(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabBtnText, !isSignUp && styles.tabBtnTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, isSignUp && styles.tabBtnActive]}
              onPress={() => setIsSignUp(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabBtnText, isSignUp && styles.tabBtnTextActive]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* FORM INPUTS */}
          <View style={styles.formContainer}>
            {/* FULL NAME (SIGN UP ONLY) */}
            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>FULL NAME</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. Rahul Sharma"
                    placeholderTextColor="#94A3B8"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    editable={!loading}
                  />
                </View>
              </View>
            )}

            {/* EMAIL */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.inputField}
                  placeholder="name@example.com"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
            </View>

            {/* PASSWORD */}
            <View style={styles.inputGroup}>
              <View style={styles.passwordLabelRow}>
                <Text style={styles.inputLabel}>PASSWORD</Text>
                {!isSignUp && (
                  <TouchableOpacity
                    onPress={() => router.push('/forgot-password')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.forgotPassLink}>Forgot password?</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.inputField}
                  placeholder={isSignUp ? 'Minimum 6 characters' : 'Enter your password'}
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* TERMS & CONDITIONS CHECKBOX (SIGN UP ONLY) */}
            {isSignUp && (
              <View style={styles.termsContainer}>
                <TouchableOpacity
                  style={styles.termsRow}
                  onPress={() => setAgreedToTerms(!agreedToTerms)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreedToTerms }}
                >
                  <View style={[styles.checkboxBox, agreedToTerms && styles.checkboxBoxChecked]}>
                    {agreedToTerms && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.termsText}>
                    I agree to the{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={(e) => {
                        e.stopPropagation();
                        setLegalModal('terms');
                      }}
                    >
                      Terms & Conditions
                    </Text>
                    {' '}and{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={(e) => {
                        e.stopPropagation();
                        setLegalModal('privacy');
                      }}
                    >
                      Privacy Policy
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* SUBMIT BUTTON */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                loading && { opacity: 0.75 },
                isSignUp && !agreedToTerms && styles.primaryButtonDisabled,
              ]}
              onPress={handleEmailAuth}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.btnRow}>
                  <Text style={styles.primaryButtonText}>
                    {isSignUp ? 'Create Free Account' : 'Sign In'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </View>
              )}
            </TouchableOpacity>

            {/* DIVIDER */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* GOOGLE SIGN IN BUTTON */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleAuth}
              disabled={loading || googleLoading}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#EA4335" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#EA4335" style={styles.googleIcon} />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* TOGGLE BOTTOM TEXT */}
            <TouchableOpacity
              onPress={() => setIsSignUp(!isSignUp)}
              style={styles.switchModeBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.switchModeText}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={styles.switchModeHighlight}>
                  {isSignUp ? 'Sign In' : 'Create One Free'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* FOOTER */}
          <View style={styles.footerInfo}>
            <Ionicons name="shield-checkmark" size={15} color="#10B981" />
            <Text style={styles.footerText}>100% Secure & Private • Cloud Encrypted</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* TERMS & PRIVACY MODAL */}
      <LegalModal
        visible={legalModal !== null}
        type={legalModal}
        onClose={() => setLegalModal(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBFAF5',
  },
  glowTopRight: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 44,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -1,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  tabTrack: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 3,
    marginBottom: 20,
    width: '100%',
    maxWidth: 340,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  formContainer: {
    width: '100%',
    maxWidth: 340,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotPassLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 6,
  },
  primaryButton: {
    backgroundColor: '#0F172A',
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    paddingHorizontal: 10,
    letterSpacing: 0.6,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 50,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '700',
  },
  switchModeBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  switchModeText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  switchModeHighlight: {
    color: '#0F172A',
    fontWeight: '800',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  footerText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },

  // Terms & Conditions Checkbox
  termsContainer: {
    marginBottom: 14,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxBoxChecked: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    fontWeight: '500',
  },
  termsLink: {
    color: '#2563EB',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  primaryButtonDisabled: {
    opacity: 0.65,
    backgroundColor: '#64748B',
    borderColor: '#64748B',
  },

  // Legal Modal
  legalModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  legalModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  legalModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  legalModalScroll: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  legalHeadTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  legalSubDate: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 16,
  },
  legalIntroText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
    marginBottom: 16,
  },
  legalSectionHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 14,
    marginBottom: 6,
  },
  legalText: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18.5,
    marginBottom: 12,
  },
  legalModalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  legalAgreeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    height: 50,
    borderRadius: 14,
  },
  legalAgreeBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
});
