import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { saveUserSettings, UserSettings } from '@/lib/database';
import { sendWelcomeNotification, setupPeriodicSmartNotifications } from '@/lib/notifications';

const LANGUAGES = [
  { id: 'English', label: 'English', char: 'A' },
  { id: 'Hindi', label: 'Hindi', char: 'अ' },
  { id: 'Hinglish', label: 'Hinglish', char: 'H' },
];

import { ALL_CURRENCIES } from '@/lib/currencies';
import { CurrencySelectorModal } from '@/components/CurrencySelectorModal';

export default function SetupScreen() {
  const router = useRouter();
  const { user, setSettings } = useAuth();
  
  const [language, setLanguage] = useState<string>('');
  const [currency, setCurrency] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);

  // Helper to find the currency object for the selected symbol/code
  const selectedCurrencyObj = ALL_CURRENCIES.find(c => c.symbol === currency || c.code === currency);

  const handleContinue = async () => {
    if (!language || !currency) {
      Alert.alert('Incomplete', 'Please select both your preferred language and currency.');
      return;
    }
    
    if (!user) {
      Alert.alert('Error', 'No user logged in.');
      return;
    }

    setLoading(true);
    try {
      const newSettings: UserSettings = { language, currency };
      await saveUserSettings(user.uid, newSettings);
      setSettings(newSettings);
      sendWelcomeNotification(user.uid).catch(() => {});
      setupPeriodicSmartNotifications().catch(() => {});
      router.replace('/starting-balance');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F8FC" />
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconWrapper}>
            <Ionicons name="settings" size={32} color="#1C1C1E" />
            <View style={styles.sparkleBadge}>
              <Ionicons name="sparkles" size={12} color="#FFD740" />
            </View>
          </View>
          <Text style={styles.title}>Let&apos;s set you up</Text>
          <Text style={styles.subtitle}>Customize your experience before we start tracking your finances.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferred Language</Text>
          <View style={styles.optionsRow}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity 
                key={lang.id} 
                style={[styles.optionCard, language === lang.id && styles.optionCardActive]}
                onPress={() => setLanguage(lang.id)}
              >
                <View style={[styles.charAvatar, language === lang.id && styles.charAvatarActive]}>
                  <Text style={[styles.charText, language === lang.id && styles.charTextActive]}>{lang.char}</Text>
                </View>
                <Text style={[styles.optionText, language === lang.id && styles.optionTextActive]}>{lang.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferred Currency</Text>
          <TouchableOpacity 
            style={[styles.selectorBtn, currency ? styles.selectorBtnActive : null]}
            onPress={() => setShowCurrencyModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.selectorLeft}>
              <View style={[styles.currencyIconWrap, currency ? styles.currencyIconWrapActive : null]}>
                {currency ? (
                  <Text style={styles.currencySymbolText}>{selectedCurrencyObj?.symbol}</Text>
                ) : (
                  <Ionicons name="cash-outline" size={24} color="#8E8E93" />
                )}
              </View>
              <View>
                <Text style={[styles.selectorLabel, currency ? styles.selectorLabelActive : null]}>
                  {currency ? selectedCurrencyObj?.name : 'Select your currency'}
                </Text>
                {currency ? (
                  <Text style={styles.selectorSubLabel}>{selectedCurrencyObj?.code}</Text>
                ) : null}
              </View>
            </View>
            <Ionicons name="chevron-down" size={20} color="#1C1C1E" />
          </TouchableOpacity>
        </View>

        <CurrencySelectorModal
          visible={showCurrencyModal}
          onClose={() => setShowCurrencyModal(false)}
          selectedCurrency={currency}
          onSelect={setCurrency}
        />

        <View style={{ flex: 1 }} />

        <TouchableOpacity 
          style={[styles.primaryButton, loading && { opacity: 0.7 }]} 
          onPress={handleContinue}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>{loading ? 'Saving...' : 'Continue to Dashboard'}</Text>
          {!loading && <Ionicons name="arrow-forward" size={20} color="#3A3314" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FC' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  
  header: { alignItems: 'center', marginBottom: 40, marginTop: 40 },
  iconWrapper: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#FFD740',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: '900', color: '#1C1C1E', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#8E8E93', textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },

  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: '#1C1C1E', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  optionsRow: { flexDirection: 'row', gap: 12 },
  
  optionCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 1,
  },
  optionCardActive: { borderColor: '#FFD740', backgroundColor: '#FEF9E7' },
  
  charAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  charAvatarActive: { backgroundColor: '#FFD740' },
  charText: { fontSize: 16, fontWeight: '900', color: '#9CA3AF' },
  charTextActive: { color: '#1C1C1E' },
  
  optionText: { fontSize: 14, fontWeight: '800', color: '#8E8E93' },
  optionTextActive: { color: '#3A3314', fontWeight: '900' },
  
  sparkleBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#1C1C1E',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#F7F8FC',
  },

  primaryButton: {
    backgroundColor: '#FFD740', borderRadius: 20, height: 60,
    borderWidth: 1, borderColor: '#F59E0B',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,
    marginBottom: 20,
  },
  primaryButtonText: { color: '#3A3314', fontSize: 16, fontWeight: '900', marginRight: 8 },

  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  selectorBtnActive: {
    borderColor: '#FFD740',
    backgroundColor: '#FEF9E7',
  },
  selectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  currencyIconWrapActive: {
    backgroundColor: '#FFD740',
  },
  currencySymbolText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  selectorLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8E8E93',
  },
  selectorLabelActive: {
    color: '#1C1C1E',
    marginBottom: 2,
  },
  selectorSubLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
});
