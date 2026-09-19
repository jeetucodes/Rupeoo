import React, { useState, useEffect } from 'react';
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
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/lib/i18n';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from '@/lib/upload';
import { getUserSettings, saveUserSettings } from '@/lib/database';
import { safeGoBack } from '@/lib/navigation';
import Toast from 'react-native-toast-message';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ALL_CURRENCIES } from '@/lib/currencies';
import { CurrencySelectorModal } from '@/components/CurrencySelectorModal';
import { VipAvatar } from '@/components/VipAvatar';

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
];

// ---------------------------------------------------------------------------
// FieldRow — reusable labeled row inside a card
// ---------------------------------------------------------------------------
function FieldRow({
  icon,
  iconColor = '#94A3B8',
  label,
  last = false,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[fieldStyles.row, last && { borderBottomWidth: 0 }]}>
      <View style={fieldStyles.iconWrap}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View style={fieldStyles.body}>
        <Text style={fieldStyles.label}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  body: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 5,
  },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function EditProfileScreen() {
  const router = useRouter();
  const { user, settings, isPremium, refreshUser, refreshSettings } = useAuth();
  const { t } = useTranslation();

  const [name, setName] = useState(user?.displayName || '');
  const [photoURL, setPhotoURL] = useState(user?.photoURL || AVATAR_PRESETS[0]);
  const [phone, setPhone] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState(
    settings?.monthlyBudget ? String(settings.monthlyBudget) : ''
  );
  const [currency, setCurrency] = useState(
    settings?.currency === 'INR' ? '₹' : settings?.currency || '₹'
  );
  const [defaultPaymentMode, setDefaultPaymentMode] = useState('UPI');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);

  const selectedCurrencyObj = ALL_CURRENCIES.find(c => c.symbol === currency || c.code === currency);

  const initial = (name || user?.email || 'U')[0]?.toUpperCase();

  useEffect(() => {
    async function loadUserData() {
      if (!user?.uid) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          if (d.phone) setPhone(d.phone);
          if (d.defaultPaymentMode) setDefaultPaymentMode(d.defaultPaymentMode);
        }
      } catch (err) {
        console.error('Error fetching user profile data:', err);
      }
    }
    loadUserData();
  }, [user?.uid]);

  // ---- Handlers -----------------------------------------------------------

  const handlePickAndUploadImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        if (Platform.OS === 'web') {
          window.alert('Gallery access permission is required to upload a profile photo.');
        } else {
          Alert.alert('Permission Required', 'Gallery access permission is required.');
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        if (asset.uri) setPhotoURL(asset.uri);
        setUploadingImage(true);

        let compressedData = asset.uri;
        try {
          const manipResult = await manipulateAsync(
            asset.uri,
            [{ resize: { width: 240, height: 240 } }],
            { compress: 0.5, format: SaveFormat.JPEG, base64: true }
          );
          compressedData = manipResult.base64
            ? `data:image/jpeg;base64,${manipResult.base64}`
            : manipResult.uri || asset.uri;
        } catch (e) {
          console.warn('Image compression notice:', e);
        }

        const finalUrl = await uploadImage(compressedData);
        if (finalUrl) setPhotoURL(finalUrl);
        Toast.show({ type: 'success', text1: 'Photo Selected', text2: 'Tap "Save" to apply.' });
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Upload Notice', text2: err.message || 'Could not process image' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Info', text2: 'Name cannot be empty.' });
      return;
    }
    if (!auth?.currentUser) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'User session not found.' });
      return;
    }

    setLoading(true);
    try {
      let safePhotoURL = photoURL;
      if (safePhotoURL && safePhotoURL.length > 300000) {
        try {
          const compressed = await manipulateAsync(
            safePhotoURL,
            [{ resize: { width: 200, height: 200 } }],
            { compress: 0.4, format: SaveFormat.JPEG, base64: true }
          );
          if (compressed.base64) safePhotoURL = `data:image/jpeg;base64,${compressed.base64}`;
        } catch (e) {
          console.warn('Avatar compression notice:', e);
        }
      }

      try {
        await updateProfile(auth.currentUser, {
          displayName: name.trim(),
          photoURL:
            safePhotoURL && !safePhotoURL.startsWith('data:')
              ? safePhotoURL
              : auth.currentUser.photoURL,
        });
      } catch (authErr) {
        console.warn('Firebase Auth updateProfile non-fatal:', authErr);
      }

      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        {
          name: name.trim(),
          photoURL: safePhotoURL,
          phone: phone.trim(),
          defaultPaymentMode,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const currentSettings = (await getUserSettings(auth.currentUser.uid)) || {
        language: settings?.language || 'English',
        currency,
      };
      await saveUserSettings(auth.currentUser.uid, {
        ...currentSettings,
        currency,
        monthlyBudget: monthlyBudget ? Number(monthlyBudget) : undefined,
      });

      await refreshUser();
      await refreshSettings();

      Toast.show({ type: 'success', text1: 'Profile Updated', text2: 'Your details have been saved.' });
      setTimeout(() => safeGoBack(router), 1500);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to update profile.' });
    } finally {
      setLoading(false);
    }
  };

  // ---- Render -------------------------------------------------------------

  const PAYMENT_MODES = [
    { id: 'UPI',  label: 'UPI',  icon: 'qr-code-outline'  as const, color: '#7C3AED' },
    { id: 'Cash', label: 'Cash', icon: 'wallet-outline'    as const, color: '#16A34A' },
    { id: 'Card', label: 'Card', icon: 'card-outline'      as const, color: '#2563EB' },
    { id: 'Bank', label: 'Bank', icon: 'business-outline'  as const, color: '#D97706' },
  ];

  const isGoogle = user?.providerData?.[0]?.providerId === 'google.com';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── Top Bar ── */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => safeGoBack(router)} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity
            style={[styles.saveTopBtn, (loading || uploadingImage) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={loading || uploadingImage}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveTopBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Avatar ── */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={handlePickAndUploadImage}
              disabled={uploadingImage}
              activeOpacity={0.85}
              style={{ position: 'relative' }}
            >
              <VipAvatar
                photoURL={photoURL}
                name={name}
                email={user?.email}
                isPremium={isPremium}
                size={100}
                showBadge={false}
              />
              {uploadingImage ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : (
                <View style={styles.cameraBtn}>
                  <Ionicons name="camera" size={14} color="#1C1C1E" />
                </View>
              )}
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <Text style={styles.avatarName}>{name || 'Your Name'}</Text>
            </View>
            <Text style={styles.avatarEmail}>{user?.email}</Text>

            {/* Avatar presets */}
            <View style={styles.presetsRow}>
              {AVATAR_PRESETS.map((url, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.preset, photoURL === url && styles.presetActive]}
                  onPress={() => setPhotoURL(url)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: url }} style={styles.presetImg} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Personal Info ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Personal Information</Text>

            <FieldRow icon="person-outline" label="Full Name">
              <TextInput
                style={[styles.fieldInput, { color: '#1C1C1E' }]}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
              />
            </FieldRow>

            <FieldRow icon="mail-outline" label="Email Address">
              <View style={styles.lockedRow}>
                <Text style={styles.lockedText}>{user?.email || '—'}</Text>
                <Ionicons name="lock-closed" size={13} color="#CBD5E1" />
              </View>
            </FieldRow>

            <FieldRow icon="call-outline" label="Phone (Optional)" last>
              <TextInput
                style={[styles.fieldInput, { color: '#1C1C1E' }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 00000 00000"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            </FieldRow>
          </View>

          {/* ── Financial Preferences ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Financial Preferences</Text>

            <FieldRow icon="cash-outline" iconColor="#10B981" label="Currency">
              <TouchableOpacity 
                style={styles.currencySelectorBtn}
                onPress={() => setShowCurrencyModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.currencySelectorLeft}>
                  <View style={styles.currencyIconWrap}>
                    <Text style={styles.currencySymbolText}>{selectedCurrencyObj?.symbol || currency}</Text>
                  </View>
                  <Text style={styles.currencySelectorLabel}>
                    {selectedCurrencyObj?.name || 'Select Currency'}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={16} color="#94A3B8" />
              </TouchableOpacity>
            </FieldRow>

            <FieldRow icon="wallet-outline" iconColor="#3B82F6" label={`Monthly Budget (${currency})`}>
              <TextInput
                style={[styles.fieldInput, { color: '#1C1C1E' }]}
                value={monthlyBudget}
                onChangeText={setMonthlyBudget}
                placeholder="e.g. 25000"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
            </FieldRow>

            <FieldRow icon="swap-horizontal-outline" iconColor="#7C3AED" label="Default Payment Mode" last>
              <View style={styles.chipRow}>
                {PAYMENT_MODES.map(m => {
                  const active = defaultPaymentMode === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setDefaultPaymentMode(m.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={m.icon}
                        size={13}
                        color={active ? '#fff' : m.color}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FieldRow>
          </View>

          {/* ── Account Information ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account Information</Text>

            {/* Email */}
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="mail-outline" size={16} color="#64748B" />
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Email Address</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{user?.email || '—'}</Text>
              </View>
            </View>

            <View style={styles.infoSep} />

            {/* Member Since */}
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="calendar-outline" size={16} color="#64748B" />
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Member Since</Text>
                <Text style={styles.infoValue}>
                  {user?.metadata?.creationTime
                    ? new Date(user.metadata.creationTime).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : '—'}
                </Text>
              </View>
            </View>

            <View style={styles.infoSep} />

            {/* Sign-in Provider */}
            <View style={[styles.infoRow, { paddingBottom: 0 }]}>
              <View style={styles.infoIconWrap}>
                <Ionicons
                  name={isGoogle ? 'logo-google' : 'shield-checkmark-outline'}
                  size={16}
                  color="#64748B"
                />
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Sign-in Provider</Text>
                <Text style={styles.infoValue}>
                  {isGoogle ? 'Google Account' : 'Email & Password'}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <CurrencySelectorModal
        visible={showCurrencyModal}
        onClose={() => setShowCurrencyModal(false)}
        selectedCurrency={currency}
        onSelect={setCurrency}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  saveTopBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  saveTopBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Scroll
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },

  // Avatar section
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatarImg: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#E2E8F0',
  },
  avatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 34, fontWeight: '900', color: '#FFFFFF' },
  avatarOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 45,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F8FAFC',
  },
  avatarName: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  avatarEmail: { fontSize: 13, color: '#94A3B8', fontWeight: '500', marginBottom: 14 },
  presetsRow: { flexDirection: 'row', gap: 10 },
  preset: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetActive: { borderColor: '#0F172A' },
  presetImg: { width: '100%', height: '100%' },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#64748B',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: -0.2,
  },

  // Field inputs
  fieldInput: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    paddingVertical: 0,
    minHeight: 24,
  },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockedText: { fontSize: 14, fontWeight: '600', color: '#94A3B8', flex: 1 },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  chipTextActive: { color: '#FFFFFF' },

  currencySelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  currencySelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  currencySymbolText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  currencySelectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },

  // Account info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoBody: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  infoSep: { height: 1, backgroundColor: '#F1F5F9' },
});
