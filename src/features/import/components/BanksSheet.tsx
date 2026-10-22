import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  useColorScheme,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

interface BanksSheetProps {
  visible: boolean;
  onClose: () => void;
  customBanks: string[];
  onAddCustomBank: (bankName: string) => Promise<void>;
  onRemoveCustomBank: (bankName: string) => Promise<void>;
}

const PRE_SAVED_BANKS = [
  { name: 'State Bank of India (SBI)', code: 'SBI', type: 'Public Bank' },
  { name: 'HDFC Bank', code: 'HDFC', type: 'Private Bank' },
  { name: 'ICICI Bank', code: 'ICICI', type: 'Private Bank' },
  { name: 'Axis Bank', code: 'AXIS', type: 'Private Bank' },
  { name: 'Kotak Mahindra Bank', code: 'KOTAK', type: 'Private Bank' },
  { name: 'Punjab National Bank (PNB)', code: 'PNB', type: 'Public Bank' },
  { name: 'Bank of Baroda (BOB)', code: 'BOB', type: 'Public Bank' },
  { name: 'Canara Bank', code: 'CANARA', type: 'Public Bank' },
  { name: 'Union Bank of India', code: 'UNION', type: 'Public Bank' },
  { name: 'Bank of India (BOI)', code: 'BOI', type: 'Public Bank' },
  { name: 'IndusInd Bank', code: 'INDUS', type: 'Private Bank' },
  { name: 'IDFC FIRST Bank', code: 'IDFC', type: 'Private Bank' },
  { name: 'YES Bank', code: 'YES', type: 'Private Bank' },
  { name: 'Federal Bank', code: 'FEDERAL', type: 'Private Bank' },
  { name: 'RBL Bank', code: 'RBL', type: 'Private Bank' },
  { name: 'Central Bank of India', code: 'CBI', type: 'Public Bank' },
  { name: 'Indian Bank', code: 'INDIAN', type: 'Public Bank' },
  { name: 'Indian Overseas Bank (IOB)', code: 'IOB', type: 'Public Bank' },
  { name: 'UCO Bank', code: 'UCO', type: 'Public Bank' },
  { name: 'Bank of Maharashtra', code: 'BOM', type: 'Public Bank' },
  { name: 'Punjab & Sind Bank', code: 'PSB', type: 'Public Bank' },
  { name: 'AU Small Finance Bank', code: 'AU', type: 'SFB' },
  { name: 'Equitas Small Finance Bank', code: 'EQUITAS', type: 'SFB' },
  { name: 'Ujjivan Small Finance Bank', code: 'UJJIVAN', type: 'SFB' },
  { name: 'Bandhan Bank', code: 'BANDHAN', type: 'Private Bank' },
  { name: 'Karur Vysya Bank (KVB)', code: 'KVB', type: 'Private Bank' },
  { name: 'South Indian Bank', code: 'SIB', type: 'Private Bank' },
  { name: 'City Union Bank', code: 'CUB', type: 'Private Bank' },
  { name: 'Google Pay (GPay)', code: 'GPAY', type: 'UPI' },
  { name: 'PhonePe', code: 'PHONEPE', type: 'UPI' },
  { name: 'Paytm Payments Bank', code: 'PAYTM', type: 'UPI & Bank' },
  { name: 'BHIM UPI', code: 'BHIM', type: 'NPCI UPI' },
  { name: 'CRED', code: 'CRED', type: 'Credit Card & UPI' },
  { name: 'Amazon Pay', code: 'AMAZON', type: 'UPI' },
  { name: 'Airtel Payments Bank', code: 'AIRTEL', type: 'Payments Bank' },
  { name: 'Jio Payments Bank', code: 'JIO', type: 'Payments Bank' },
];

export function BanksSheet({
  visible,
  onClose,
  customBanks,
  onAddCustomBank,
  onRemoveCustomBank,
}: BanksSheetProps) {
  const isDark = useColorScheme() === 'dark';
  const [search, setSearch] = useState('');
  const [customBankInput, setCustomBankInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const filteredBanks = useMemo(() => {
    if (!search.trim()) return PRE_SAVED_BANKS;
    const q = search.trim().toLowerCase();
    return PRE_SAVED_BANKS.filter(
      (b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || b.type.toLowerCase().includes(q)
    );
  }, [search]);

  const handleAddCustom = async () => {
    const clean = customBankInput.trim().toUpperCase();
    if (!clean) return;

    setIsAdding(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onAddCustomBank(clean);
      setCustomBankInput('');
      Toast.show({
        type: 'success',
        text1: 'Bank Added',
        text2: `${clean} will now be auto-detected in SMS and alerts.`,
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Failed to Add',
        text2: 'Could not save custom bank. Please try again.',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const bgColor = isDark ? '#18191D' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#272A30' : '#E2E8F0';
  const inputBg = isDark ? '#22252B' : '#F1F5F9';
  const bannerBg = isDark ? '#143823' : '#DCFCE7';
  const bannerBorder = isDark ? '#166534' : '#BBF7D0';
  const bannerText = isDark ? '#86EFAC' : '#166534';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: bgColor }]} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View>
              <Text style={[styles.title, { color: textColor }]}>Supported Banks</Text>
              <Text style={[styles.subtitle, { color: subtextColor }]}>
                75+ Indian Banks, Wallets &amp; Custom Senders
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: inputBg }]}
              accessibilityRole="button"
              accessibilityLabel="Close banks sheet"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={subtextColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* 75+ Indian Banks Banner (Moved here from screen top) */}
            <View style={[styles.banner, { backgroundColor: bannerBg, borderColor: bannerBorder }]}>
              <View style={styles.bannerIconWrap}>
                <Ionicons name="shield-checkmark" size={20} color={bannerText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerTitle, { color: bannerText }]}>75+ Indian Banks Pre-Saved</Text>
                <Text style={[styles.bannerDesc, { color: bannerText }]}>
                  SBI, HDFC, ICICI, Axis, Kotak, PNB, BOB, Canara, PhonePe, GPay, Paytm, CRED &amp; UPI are 100% pre-configured.
                </Text>
              </View>
            </View>

            {/* Custom Banks Section */}
            <View style={[styles.customSection, { backgroundColor: inputBg, borderColor }]}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Add Custom Bank / Country Sender</Text>
              <Text style={[styles.customDesc, { color: subtextColor }]}>
                For international banks (e.g. Chase, Barclays, Emirates NBD) or custom SMS sender codes:
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.customInput, { backgroundColor: bgColor, color: textColor, borderColor }]}
                  placeholder="e.g. CHASE, BARCLAYS"
                  placeholderTextColor={subtextColor}
                  value={customBankInput}
                  onChangeText={setCustomBankInput}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.addBtn, isAdding && { opacity: 0.6 }]}
                  onPress={handleAddCustom}
                  disabled={isAdding}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {customBanks && customBanks.length > 0 && (
                <View style={styles.activeCustomWrap}>
                  <Text style={[styles.activeCustomLabel, { color: subtextColor }]}>
                    Active Custom Senders ({customBanks.length}):
                  </Text>
                  <View style={styles.chipsWrap}>
                    {customBanks.map((b) => (
                      <View key={b} style={[styles.customTag, { backgroundColor: bgColor, borderColor }]}>
                        <Text style={[styles.customTagText, { color: textColor }]}>{b}</Text>
                        <TouchableOpacity
                          onPress={async () => {
                            try {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              await onRemoveCustomBank(b);
                            } catch { }
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="close-circle" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Search Box */}
            <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor }]}>
              <Ionicons name="search" size={16} color={subtextColor} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: textColor }]}
                placeholder="Search supported banks..."
                placeholderTextColor={subtextColor}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color={subtextColor} />
                </TouchableOpacity>
              )}
            </View>

            {/* Bank List */}
            <View style={styles.bankList}>
              {filteredBanks.map((bank) => (
                <View key={bank.name} style={[styles.bankItem, { borderBottomColor: borderColor }]}>
                  <View style={[styles.bankAvatar, { backgroundColor: inputBg }]}>
                    <Text style={[styles.bankAvatarText, { color: textColor }]}>
                      {bank.code.slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bankName, { color: textColor }]}>{bank.name}</Text>
                    <Text style={[styles.bankType, { color: subtextColor }]}>{bank.type}</Text>
                  </View>
                  <View style={[styles.activeBadge, { backgroundColor: isDark ? '#143823' : '#DCFCE7' }]}>
                    <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                    <Text style={styles.activeBadgeText}>Ready</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    marginTop: 12,
  },
  banner: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  bannerIconWrap: {
    marginRight: 10,
    marginTop: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  bannerDesc: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  customSection: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  customDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  addBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  activeCustomWrap: {
    marginTop: 10,
  },
  activeCustomLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  customTag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 6,
  },
  customTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  bankList: {
    marginTop: 4,
  },
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  bankAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bankAvatarText: {
    fontSize: 13,
    fontWeight: '800',
  },
  bankName: {
    fontSize: 13,
    fontWeight: '700',
  },
  bankType: {
    fontSize: 11.5,
    marginTop: 1,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
});
