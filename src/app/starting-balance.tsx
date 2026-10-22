import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { saveStartingBalance } from '@/lib/database';
import OnboardingPermissionStep from '@/features/autoAdd/OnboardingPermissionStep';

export default function StartingBalanceScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'balance' | 'import_prompt'>('balance');

  const finish = async (value: number) => {
    if (!user?.uid || loading) return;
    setLoading(true);
    try {
      await saveStartingBalance(user.uid, value);
      await refreshUser();
      if (Platform.OS === 'android') {
        setStep('import_prompt');
      } else {
        router.replace('/(tabs)/dashboard');
      }
    } catch (err) {
      console.error('Could not save starting balance:', err);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'import_prompt') {
    return (
      <OnboardingPermissionStep
        onComplete={() => router.replace('/(tabs)/dashboard')}
        onSkip={() => router.replace('/(tabs)/dashboard')}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="wallet-outline" size={38} color="#0F172A" />
          </View>
          <Text style={styles.title}>What&apos;s your current balance?</Text>
          <Text style={styles.subtitle}>
            This helps us show your accurate total balance from day one. You can update this anytime later.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.currency}>₹</Text>
            <TextInput
              style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as unknown as TextStyle)]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              editable={!loading}
              autoFocus
              showSoftInputOnFocus
              returnKeyType="done"
              onSubmitEditing={() => finish(Number(amount) || 0)}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabled]}
            onPress={() => finish(Number(amount) || 0)}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.primaryText}>Save & Continue</Text>}
            {!loading && <Ionicons name="arrow-forward" size={20} color="#0F172A" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => finish(0)}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FC' },
  keyboardView: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  badgeWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  badgeText: {
    color: '#4F46E5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  benefitsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  benefitIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  benefitTextWrap: {
    flex: 1,
  },
  benefitTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  benefitDesc: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  benefitDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  iconCircle: {
    alignSelf: 'center',
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: '#FFD740',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputGroup: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    paddingHorizontal: 18,
    marginBottom: 18,
  },
  currency: { color: '#B45309', fontSize: 25, fontWeight: '900', marginRight: 10 },
  input: {
    flex: 1,
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '800',
  },
  primaryButton: {
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFD740',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disabled: { opacity: 0.65 },
  primaryText: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  skipButton: { alignItems: 'center', paddingVertical: 20 },
  skipText: { color: '#64748B', fontSize: 14, fontWeight: '800' },
});
