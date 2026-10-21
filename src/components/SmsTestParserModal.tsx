import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { parseAlert, ParsedAlert } from '@/lib/alertParser';
import { saveWrongParseReport, getSmsImportSettings } from '@/lib/smsSettings';
import { useAuth } from '@/context/AuthContext';

interface SmsTestParserModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SmsTestParserModal({ visible, onClose }: SmsTestParserModalProps) {
  const { user } = useAuth();
  const userId = user?.uid || 'local';

  const [inputText, setInputText] = useState('');
  const [senderText, setSenderText] = useState('VM-HDFCBK');
  const [parsedResult, setParsedResult] = useState<ParsedAlert | null>(null);

  const handleParse = async () => {
    if (!inputText.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Empty message',
        text2: 'Please paste a bank or UPI message to test.',
      });
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    const settings = await getSmsImportSettings(userId);
    const result = parseAlert(inputText, {
      sender: senderText.trim(),
      timestamp: Date.now(),
      customCategoryRules: settings.customCategoryRules,
    });

    setParsedResult(result);
  };

  const handleReportWrongParse = async () => {
    if (!parsedResult) return;

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }

    await saveWrongParseReport(parsedResult, 'User reported inaccurate field extraction from test sandbox');

    Toast.show({
      type: 'success',
      text1: 'Report Stored Locally',
      text2: 'Saved on-device for developer review. No raw text was transmitted.',
    });
  };

  const handleExportReport = async () => {
    if (!parsedResult) return;

    // Export only parsed fields without full message body for privacy
    const safeDump = {
      amount: parsedResult.amount,
      type: parsedResult.type,
      merchant: parsedResult.merchant,
      merchantNormalized: parsedResult.merchantNormalized,
      accountLast4: parsedResult.accountLast4,
      channel: parsedResult.channel,
      category: parsedResult.category,
      confidence: parsedResult.confidence,
      refNo: parsedResult.refNo ? parsedResult.refNo.slice(0, 4) + '****' : null,
      isOtpOrPromo: parsedResult.isOtpOrPromo,
      timestamp: new Date().toISOString(),
    };

    try {
      await Share.share({
        title: 'Rupeo Parser Diagnostic',
        message: JSON.stringify(safeDump, null, 2),
      });
    } catch { }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.dragHandle} />
          
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIcon}>
                <Ionicons name="flask" size={20} color="#6366F1" />
              </View>
              <View>
                <Text style={styles.title}>Test SMS Alert Parser</Text>
                <Text style={styles.subtitle}>Inspect on-device field extraction & confidence</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Sender input */}
            <Text style={styles.fieldLabel}>DLT Header / Sender</Text>
            <TextInput
              style={styles.senderInput}
              value={senderText}
              onChangeText={setSenderText}
              placeholder="e.g. AD-HDFCBK or VM-ICICIB"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
            />

            {/* Message Body Input */}
            <Text style={styles.fieldLabel}>Message Text</Text>
            <TextInput
              style={styles.textArea}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Paste bank debit/credit alert or UPI SMS here..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity style={styles.parseBtn} onPress={handleParse} activeOpacity={0.85}>
              <Ionicons name="play" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.parseBtnText}>Run Parser</Text>
            </TouchableOpacity>

            {/* Parsed Output */}
            {parsedResult && (
              <View style={styles.resultBox}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultTitle}>Extraction Results</Text>
                  <View style={[
                    styles.confidenceBadge,
                    { backgroundColor: parsedResult.confidence >= 0.9 ? '#ECFDF5' : parsedResult.confidence >= 0.6 ? '#FEF3C7' : '#FEF2F2' }
                  ]}>
                    <Text style={[
                      styles.confidenceText,
                      { color: parsedResult.confidence >= 0.9 ? '#059669' : parsedResult.confidence >= 0.6 ? '#D97706' : '#DC2626' }
                    ]}>
                      Confidence: {(parsedResult.confidence * 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>

                {parsedResult.isOtpOrPromo && (
                  <View style={styles.alertBanner}>
                    <Ionicons name="warning" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                    <Text style={styles.alertBannerText}>
                      Flagged as OTP, promo, bill reminder, or non-transactional alert (Rejected).
                    </Text>
                  </View>
                )}

                <View style={styles.grid}>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Amount</Text>
                    <Text style={styles.gridValue}>
                      {parsedResult.amount !== null ? `₹${parsedResult.amount.toLocaleString('en-IN')}` : 'None'}
                    </Text>
                  </View>

                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Direction</Text>
                    <Text style={[
                      styles.gridValue,
                      { color: parsedResult.type === 'income' ? '#16A34A' : parsedResult.type === 'transfer' ? '#2563EB' : '#DC2626' }
                    ]}>
                      {parsedResult.type.toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Merchant / Payee</Text>
                    <Text style={styles.gridValue}>
                      {parsedResult.merchantNormalized || parsedResult.merchant || 'None'}
                    </Text>
                  </View>

                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Category</Text>
                    <Text style={styles.gridValue}>{parsedResult.category}</Text>
                  </View>

                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Account Last 4</Text>
                    <Text style={styles.gridValue}>
                      {parsedResult.accountLast4 ? `*${parsedResult.accountLast4}` : 'None'}
                    </Text>
                  </View>

                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Channel</Text>
                    <Text style={styles.gridValue}>{parsedResult.channel.toUpperCase()}</Text>
                  </View>

                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Ref / UTR</Text>
                    <Text style={styles.gridValue}>{parsedResult.refNo || 'None'}</Text>
                  </View>

                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Balance</Text>
                    <Text style={styles.gridValue}>
                      {parsedResult.balance !== null ? `₹${parsedResult.balance.toLocaleString('en-IN')}` : 'None'}
                    </Text>
                  </View>
                </View>

                {/* Privacy-safe Report Actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.reportBtn}
                    onPress={handleReportWrongParse}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="bug-outline" size={16} color="#475569" style={{ marginRight: 6 }} />
                    <Text style={styles.reportBtnText}>Report Wrong Parse (Local)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exportDiagBtn}
                    onPress={handleExportReport}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="share-outline" size={16} color="#2563EB" style={{ marginRight: 4 }} />
                    <Text style={styles.exportDiagBtnText}>Share Diagnostics</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  dragHandle: {
    width: 38,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    paddingTop: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  senderInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 88,
  },
  parseBtn: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  parseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  resultBox: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '800',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  alertBannerText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  gridLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 3,
  },
  gridValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  reportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  reportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  exportDiagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  exportDiagBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
});
