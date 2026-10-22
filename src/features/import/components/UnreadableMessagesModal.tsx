import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Clipboard,
  useColorScheme,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { maskAccountNumbersInText } from '@/lib/smsSettings';

interface UnreadableMessagesModalProps {
  visible: boolean;
  onClose: () => void;
  unreadableMessages: string[];
}

export function UnreadableMessagesModal({
  visible,
  onClose,
  unreadableMessages,
}: UnreadableMessagesModalProps) {
  const isDark = useColorScheme() === 'dark';

  const handleCopyMasked = async (text: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    // Mask sensitive accounts, UPI refs, and OTPs
    let masked = maskAccountNumbersInText(text);
    // Mask potential OTPs (6-digit standalone codes)
    masked = masked.replace(/\b\d{4,8}\b/g, (match) => '******');
    // Mask potential UPI refs / RRNs
    masked = masked.replace(/(?:ref|rrn|utr)[\s:]*([0-9]{8,16})/gi, 'Ref: ******');

    Clipboard.setString(masked);
    Toast.show({
      type: 'success',
      text1: 'Masked Format Copied',
      text2: 'Account details masked. You can share this format to help us add support.',
    });
  };

  const bgColor = isDark ? '#18191D' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#272A30' : '#E2E8F0';
  const cardBg = isDark ? '#22252B' : '#F8FAFC';
  const closeBtnBg = isDark ? '#22252B' : '#F1F5F9';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: bgColor }]} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View>
              <Text style={[styles.title, { color: textColor }]}>
                Couldn't Read {unreadableMessages.length} {unreadableMessages.length === 1 ? 'Message' : 'Messages'}
              </Text>
              <Text style={[styles.subtitle, { color: subtextColor }]}>
                These messages didn't match known debit/credit payment patterns
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: closeBtnBg }]}
              accessibilityRole="button"
              accessibilityLabel="Close unreadable messages"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={subtextColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {unreadableMessages.map((msg, idx) => (
              <View key={idx} style={[styles.messageCard, { backgroundColor: cardBg, borderColor }]}>
                <View style={styles.msgHeader}>
                  <View style={styles.badgeWrap}>
                    <Ionicons name="alert-circle" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                    <Text style={styles.badgeText}>Unreadable Format #{idx + 1}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => handleCopyMasked(msg)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Report this format"
                  >
                    <Ionicons name="copy-outline" size={13} color="#4F46E5" style={{ marginRight: 4 }} />
                    <Text style={styles.copyBtnText}>Report this format</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.msgBody, { color: textColor }]}>{msg}</Text>
              </View>
            ))}

            <View style={{ height: 32 }} />
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
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
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
    marginTop: 14,
  },
  messageCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  msgBody: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
});
