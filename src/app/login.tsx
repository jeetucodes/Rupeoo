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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  getAdditionalUserInfo,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { promptGoogleSignIn } from '@/lib/google-auth';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  requestNotificationPermissions,
  sendWelcomeNotification,
  setupPeriodicSmartNotifications,
} from '@/lib/notifications';

export default function AuthScreen() {
  const router = useRouter();

  // Mode: 'signin' | 'signup'
  const [isSignUp, setIsSignUp] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
    if (isSignUp && !name.trim()) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Please enter your name' });
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

          await setDoc(doc(db, 'users', cred.user.uid), {
            email: cred.user.email,
            name: name.trim() || 'User',
            createdAt: new Date().toISOString(),
            starting_balance: 0,
            has_set_starting_balance: false,
          }, { merge: true });

          requestNotificationPermissions().then((granted) => {
            if (granted) setupPeriodicSmartNotifications().catch(() => {});
          }).catch(() => {});

          sendWelcomeNotification(cred.user.uid).catch(() => {});
          router.replace('/setup');
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
    } catch (error: any) {
      console.error('Email Auth Error:', error);
      let msg = error?.message || 'Authentication failed. Please try again.';

      if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password' || error?.code === 'auth/user-not-found') {
        msg = 'Incorrect email or password. Please check your credentials.';
      } else if (error?.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Please sign in instead.';
      } else if (error?.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }

      Toast.show({ type: 'error', text1: isSignUp ? 'Sign Up Failed' : 'Sign In Failed', text2: msg });
    } finally {
      setLoading(false);
    }
  };

  // Google Sign In Handler
  const handleGoogleAuth = async () => {
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
      console.warn('Google Auth Error:', error.message);
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

            {/* SUBMIT BUTTON */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && { opacity: 0.75 }]}
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
});
