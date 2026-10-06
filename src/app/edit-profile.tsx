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
  ActivityIndicator,
  Modal,
  Clipboard,
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
import * as Haptics from 'expo-haptics';
import { uploadImage } from '@/lib/upload';
import { getUserSettings, saveUserSettings } from '@/lib/database';
import { safeGoBack } from '@/lib/navigation';
import Toast from 'react-native-toast-message';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ALL_CURRENCIES } from '@/lib/currencies';
import { CurrencySelectorModal } from '@/components/CurrencySelectorModal';
import { VipAvatar } from '@/components/VipAvatar';

// ---------------------------------------------------------------------------
// FieldRow — Clean modern labeled input field
// ---------------------------------------------------------------------------
function FieldRow({
  icon,
  iconColor = '#64748B',
  label,
  helper,
  last = false,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  label: string;
  helper?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[fieldStyles.row, last && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
      <View style={fieldStyles.headerRow}>
        <View style={fieldStyles.iconWrap}>
          <Ionicons name={icon} size={15} color={iconColor} />
        </View>
        <Text style={fieldStyles.label}>{label}</Text>
        {helper && <Text style={fieldStyles.helper}>{helper}</Text>}
      </View>
      <View style={fieldStyles.contentBody}>
        {children}
      </View>
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.3,
  },
  helper: {
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 'auto',
    fontWeight: '500',
  },
  contentBody: {
    paddingLeft: 2,
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
  const [photoURL, setPhotoURL] = useState<string | null>(user?.photoURL || null);
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
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const selectedCurrencyObj = ALL_CURRENCIES.find(c => c.symbol === currency || c.code === currency);

  useEffect(() => {
    async function loadUserData() {
      if (!user?.uid) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          if (d.phone) setPhone(d.phone);
          if (d.defaultPaymentMode) setDefaultPaymentMode(d.defaultPaymentMode);
          if (d.photoURL !== undefined) setPhotoURL(d.photoURL);
        }
      } catch (err) {
        console.error('Error fetching user profile data:', err);
      }
    }
    loadUserData();
  }, [user?.uid]);

  // ---- Image Processing & Upload -----------------------------------------

  const processAndUpload = async (sourceUri: string) => {
    try {
      setUploadingImage(true);
      setShowPhotoModal(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Show instant preview
      setPhotoURL(sourceUri);

      // Compress and optimize image
      let compressedDataUri = sourceUri;
      try {
        const manipResult = await manipulateAsync(
          sourceUri,
          [{ resize: { width: 300, height: 300 } }],
          { compress: 0.65, format: SaveFormat.JPEG, base64: true }
        );
        compressedDataUri = manipResult.base64
          ? `data:image/jpeg;base64,${manipResult.base64}`
          : manipResult.uri || sourceUri;
      } catch (e) {
        console.warn('Image compression note:', e);
      }

      // Upload to cloud storage
      const finalUrl = await uploadImage(compressedDataUri);
      if (finalUrl) {
        setPhotoURL(finalUrl);
        Toast.show({
          type: 'success',
          text1: 'Photo Selected',
          text2: 'Tap "Save Changes" to apply to your profile.',
        });
      }
    } catch (err: any) {
      console.error('Error uploading avatar:', err);
      Toast.show({
        type: 'error',
        text1: 'Upload Notice',
        text2: err.message || 'Could not upload image.',
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Gallery access is needed to select a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        await processAndUpload(result.assets[0].uri);
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Gallery Error', text2: err.message || 'Failed to pick image' });
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Camera access is needed to take a profile picture.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        await processAndUpload(result.assets[0].uri);
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Camera Error', text2: err.message || 'Failed to capture photo' });
    }
  };

  const handleRemovePhoto = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPhotoURL(null);
    setShowPhotoModal(false);
    Toast.show({
      type: 'info',
      text1: 'Photo Removed',
      text2: 'Initial avatar will be used. Tap Save to apply.',
    });
  };

  // ---- Save Profile -------------------------------------------------------

  const handleSave = async () => {
    if (!name.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: 'error', text1: 'Name Required', text2: 'Please enter your full name.' });
      return;
    }
    if (!auth?.currentUser) {
      Toast.show({ type: 'error', text1: 'Session Error', text2: 'User not signed in.' });
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      let safePhotoURL = photoURL;
      if (safePhotoURL && safePhotoURL.length > 300000) {
        try {
          const compressed = await manipulateAsync(
            safePhotoURL,
            [{ resize: { width: 220, height: 220 } }],
            { compress: 0.45, format: SaveFormat.JPEG, base64: true }
          );
          if (compressed.base64) safePhotoURL = `data:image/jpeg;base64,${compressed.base64}`;
        } catch (e) {
          console.warn('Avatar compression notice:', e);
        }
      }

      // Update Firebase Auth profile
      try {
        await updateProfile(auth.currentUser, {
          displayName: name.trim(),
          photoURL: safePhotoURL && !safePhotoURL.startsWith('data:') ? safePhotoURL : null,
        });
      } catch (authErr) {
        console.warn('Firebase Auth updateProfile non-fatal:', authErr);
      }

      // Update Firestore user document
      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        {
          name: name.trim(),
          photoURL: safePhotoURL || null,
          phone: phone.trim(),
          defaultPaymentMode,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // Save user settings (currency & monthly budget)
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

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Toast.show({
        type: 'success',
        text1: 'Profile Saved! ✨',
        text2: 'Your profile and settings have been updated.',
      });

      setTimeout(() => safeGoBack(router), 1200);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Toast.show({ type: 'error', text1: 'Save Failed', text2: err.message || 'Could not update profile.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUid = () => {
    if (user?.uid) {
      Clipboard.setString(user.uid);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Toast.show({
        type: 'success',
        text1: 'Copied to Clipboard 📋',
        text2: 'User Account ID copied.',
      });
    }
  };

  const PAYMENT_MODES = [
    { id: 'UPI', label: 'UPI', icon: 'qr-code-outline' as const, color: '#7C3AED' },
    { id: 'Cash', label: 'Cash', icon: 'wallet-outline' as const, color: '#16A34A' },
    { id: 'Card', label: 'Card', icon: 'card-outline' as const, color: '#2563EB' },
    { id: 'Bank', label: 'Bank', icon: 'business-outline' as const, color: '#D97706' },
  ];

  const QUICK_BUDGETS = [15000, 25000, 50000, 100000];
  const isGoogle = user?.providerData?.[0]?.providerId === 'google.com';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── Top Header ── */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => safeGoBack(router)}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity
            style={[styles.saveTopBtn, (loading || uploadingImage) && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={loading || uploadingImage}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
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

          {/* ── Profile Hero / Avatar Section ── */}
          <View style={styles.heroCard}>
            <View style={styles.avatarContainer}>
              <TouchableOpacity
                onPress={() => setShowPhotoModal(true)}
                disabled={uploadingImage}
                activeOpacity={0.85}
                style={styles.avatarTouchTarget}
              >
                <View style={[styles.avatarRing, isPremium && styles.avatarRingVip]}>
                  <VipAvatar
                    photoURL={photoURL}
                    name={name}
                    email={user?.email}
                    isPremium={isPremium}
                    size={104}
                    showBadge={false}
                  />
                  {uploadingImage && (
                    <View style={styles.avatarLoadingOverlay}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    </View>
                  )}
                </View>

                {/* Floating Edit Camera Badge */}
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={15} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>

            <Text style={styles.heroName}>{name || 'Your Name'}</Text>
            <View style={styles.emailPill}>
              <Ionicons name="shield-checkmark" size={12} color="#10B981" />
              <Text style={styles.heroEmail}>{user?.email || 'No email attached'}</Text>
            </View>

            {isPremium ? (
              <View style={styles.vipTag}>
                <Ionicons name="star" size={12} color="#D97706" />
                <Text style={styles.vipTagText}>Rupeo VIP Member</Text>
              </View>
            ) : null}
          </View>

          {/* ── Personal Information ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Personal Information</Text>
            <Text style={styles.cardSubtitle}>Your personal contact details and identity</Text>

            <FieldRow icon="person-outline" iconColor="#3B82F6" label="Full Name">
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.fieldInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your full name"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="words"
                />
                {name.length > 0 && (
                  <TouchableOpacity onPress={() => setName('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color="#CBD5E1" />
                  </TouchableOpacity>
                )}
              </View>
            </FieldRow>

            <FieldRow
              icon="mail-outline"
              iconColor="#10B981"
              label="Email Address"
              helper="Primary Login"
            >
              <View style={styles.lockedInputWrap}>
                <Text style={styles.lockedText} numberOfLines={1}>
                  {user?.email || '—'}
                </Text>
                <View style={styles.lockedPill}>
                  <Ionicons name="lock-closed" size={11} color="#64748B" />
                  <Text style={styles.lockedPillText}>Locked</Text>
                </View>
              </View>
            </FieldRow>

            <FieldRow
              icon="call-outline"
              iconColor="#F59E0B"
              label="Phone Number"
              helper="Optional"
              last
            >
              <View style={styles.phoneInputWrap}>
                <View style={styles.countryCodeBadge}>
                  <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={[styles.fieldInput, { flex: 1 }]}
                  value={phone.replace(/^\+91\s*/, '')}
                  onChangeText={(val) => setPhone(val ? `+91 ${val.replace(/[^0-9]/g, '')}` : '')}
                  placeholder="00000 00000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  maxLength={11}
                />
              </View>
            </FieldRow>
          </View>

          {/* ── Financial Preferences ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Financial Preferences</Text>
            <Text style={styles.cardSubtitle}>Customize currency and monthly expense targets</Text>

            <FieldRow icon="cash-outline" iconColor="#10B981" label="Base Currency">
              <TouchableOpacity
                style={styles.currencySelectorBtn}
                onPress={() => setShowCurrencyModal(true)}
                activeOpacity={0.7}
              >
                <View style={styles.currencySelectorLeft}>
                  <View style={styles.currencyIconWrap}>
                    <Text style={styles.currencySymbolText}>{selectedCurrencyObj?.symbol || currency}</Text>
                  </View>
                  <View>
                    <Text style={styles.currencySelectorName}>
                      {selectedCurrencyObj?.name || 'Indian Rupee'}
                    </Text>
                    <Text style={styles.currencySelectorCode}>
                      {selectedCurrencyObj?.code || 'INR'} ({selectedCurrencyObj?.symbol || currency})
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
              </TouchableOpacity>
            </FieldRow>

            <FieldRow
              icon="wallet-outline"
              iconColor="#3B82F6"
              label={`Monthly Budget Target (${currency})`}
              helper="Personal limit"
            >
              <View style={styles.inputWrap}>
                <Text style={styles.inputPrefix}>{currency}</Text>
                <TextInput
                  style={[styles.fieldInput, { fontWeight: '700' }]}
                  value={monthlyBudget}
                  onChangeText={setMonthlyBudget}
                  placeholder="e.g. 25000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
                {monthlyBudget.length > 0 && (
                  <TouchableOpacity onPress={() => setMonthlyBudget('')}>
                    <Ionicons name="close-circle" size={16} color="#CBD5E1" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Quick suggestions */}
              <View style={styles.quickBudgetRow}>
                {QUICK_BUDGETS.map((amt) => {
                  const isSelected = monthlyBudget === String(amt);
                  return (
                    <TouchableOpacity
                      key={amt}
                      style={[styles.quickBudgetChip, isSelected && styles.quickBudgetChipActive]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setMonthlyBudget(String(amt));
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.quickBudgetText, isSelected && styles.quickBudgetTextActive]}>
                        {currency}{amt.toLocaleString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FieldRow>

            <FieldRow
              icon="swap-horizontal-outline"
              iconColor="#7C3AED"
              label="Default Payment Mode"
              helper="Quick add default"
              last
            >
              <View style={styles.chipRow}>
                {PAYMENT_MODES.map((m) => {
                  const active = defaultPaymentMode === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setDefaultPaymentMode(m.id);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={m.icon}
                        size={14}
                        color={active ? '#FFFFFF' : m.color}
                        style={{ marginRight: 5 }}
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

          {/* ── Account Information & Security ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account Security</Text>
            <Text style={styles.cardSubtitle}>Linked credentials and session details</Text>

            {/* Account ID / UID */}
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="key-outline" size={16} color="#64748B" />
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Account ID (UID)</Text>
                <Text style={styles.infoValueMono} numberOfLines={1}>
                  {user?.uid ? `${user.uid.substring(0, 14)}...` : '—'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={handleCopyUid}
                activeOpacity={0.7}
              >
                <Ionicons name="copy-outline" size={14} color="#0F172A" />
                <Text style={styles.copyBtnText}>Copy</Text>
              </TouchableOpacity>
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
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Active user'}
                </Text>
              </View>
            </View>

            <View style={styles.infoSep} />

            {/* Sign-in Provider */}
            <View style={[styles.infoRow, { paddingBottom: 0 }]}>
              <View style={styles.infoIconWrap}>
                <Ionicons
                  name={isGoogle ? 'logo-google' : 'mail-unread-outline'}
                  size={16}
                  color={isGoogle ? '#EA4335' : '#64748B'}
                />
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Authentication Method</Text>
                <Text style={styles.infoValue}>
                  {isGoogle ? 'Google Sign-In' : 'Email & Password'}
                </Text>
              </View>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={styles.verifiedBadgeText}>Verified</Text>
              </View>
            </View>
          </View>

          {/* ── Prominent Bottom Save Button ── */}
          <TouchableOpacity
            style={[styles.primarySaveBtn, (loading || uploadingImage) && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={loading || uploadingImage}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primarySaveBtnText}>Save Profile Changes</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Photo Management Bottom Sheet Modal ── */}
      <Modal
        visible={showPhotoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowPhotoModal(false)}
        >
          <View style={styles.photoSheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Profile Photo</Text>
            <Text style={styles.sheetSubtitle}>Upload your own image or take a fresh photo</Text>

            <View style={styles.sheetOptions}>
              {/* Take Photo */}
              <TouchableOpacity
                style={styles.sheetOptionBtn}
                onPress={handleTakePhoto}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="camera" size={20} color="#4F46E5" />
                </View>
                <View style={styles.sheetOptionTextWrap}>
                  <Text style={styles.sheetOptionTitle}>Take Photo</Text>
                  <Text style={styles.sheetOptionDesc}>Use camera to take a new picture</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </TouchableOpacity>

              {/* Choose from Gallery */}
              <TouchableOpacity
                style={styles.sheetOptionBtn}
                onPress={handlePickFromGallery}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetIconWrap, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="images" size={20} color="#059669" />
                </View>
                <View style={styles.sheetOptionTextWrap}>
                  <Text style={styles.sheetOptionTitle}>Choose from Gallery</Text>
                  <Text style={styles.sheetOptionDesc}>Select from photos on your device</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
              </TouchableOpacity>

              {/* Remove Photo */}
              {photoURL && (
                <TouchableOpacity
                  style={[styles.sheetOptionBtn, { borderBottomWidth: 0 }]}
                  onPress={handleRemovePhoto}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sheetIconWrap, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="trash-outline" size={20} color="#DC2626" />
                  </View>
                  <View style={styles.sheetOptionTextWrap}>
                    <Text style={[styles.sheetOptionTitle, { color: '#DC2626' }]}>Remove Photo</Text>
                    <Text style={styles.sheetOptionDesc}>Revert to clean initial avatar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                </TouchableOpacity>
              )}
            </View>

            {/* Cancel */}
            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setShowPhotoModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTopBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Scroll Container
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },

  // Hero Avatar Card
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarTouchTarget: {
    position: 'relative',
  },
  avatarRing: {
    padding: 3,
    borderRadius: 58,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarRingVip: {
    borderColor: '#F59E0B',
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 54,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  changePhotoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  changePhotoText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  heroName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  emailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
  },
  heroEmail: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  vipTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  vipTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },

  // General Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 14,
    marginTop: 2,
  },

  // Input Wrap
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 46,
  },
  inputPrefix: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 6,
  },
  fieldInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    height: '100%',
  },
  lockedInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 46,
  },
  lockedText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lockedPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },

  // Phone Input
  phoneInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 46,
  },
  countryCodeBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  countryCodeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Currency Selector
  currencySelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  currencySelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  currencySymbolText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  currencySelectorName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  currencySelectorCode: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },

  // Quick budget suggestions
  quickBudgetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  quickBudgetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickBudgetChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  quickBudgetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  quickBudgetTextActive: {
    color: '#FFFFFF',
  },

  // Payment Mode Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },

  // Account Info Rows
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
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  infoBody: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoValueMono: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  infoSep: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  verifiedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },

  // Primary Bottom Save Button
  primarySaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primarySaveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // Photo Action Modal / Bottom Sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  photoSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  sheetOptions: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  sheetOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sheetOptionTextWrap: {
    flex: 1,
  },
  sheetOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  sheetOptionDesc: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  sheetCancelBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
});
