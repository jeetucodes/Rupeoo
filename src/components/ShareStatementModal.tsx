import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Platform,
  Linking,
  Share,
  NativeModules,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { captureRef, ViewShotRef } from 'react-native-view-shot';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import Toast from 'react-native-toast-message';

import { StatementCard } from './StatementCard';
import {
  calculateStatementDetails,
  formatIndianCurrency,
} from '@/lib/statementCalculator';
import { UdharEntry, FriendContact } from '@/lib/udharStorage';
import { shareImageAndText } from '@/lib/shareHelper';

export interface ShareStatementModalProps {
  visible: boolean;
  onClose: () => void;
  entry: UdharEntry;
  friend: FriendContact;
  currentUserName: string;
  currentUserPhone?: string;
  currentUserUpiId?: string;
  childSettlements?: UdharEntry[];
  onOpenSettingsForUpi?: () => void;
}

function sanitizeFilename(friendName: string, ext: 'png' | 'pdf'): string {
  const cleanName = (friendName || 'Friend')
    .trim()
    .replace(/[^a-zA-Z0-9_\u0900-\u097F-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 24);
  const now = new Date();
  const dateStr = now
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace(/\s+/g, '-');
  return `Rupeo-Khata-${cleanName}-${dateStr}.${ext}`;
}

export const ShareStatementModal: React.FC<ShareStatementModalProps> = ({
  visible,
  onClose,
  entry,
  friend,
  currentUserName,
  currentUserPhone,
  currentUserUpiId,
  childSettlements = [],
  onOpenSettingsForUpi,
}) => {
  const [hideMyPhone, setHideMyPhone] = useState(true);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState(false);

  // Auto-resolve user phone: from prop, or extract 10-digit mobile from UPI ID (e.g. 7061461954@...)
  const defaultUserPhone = useMemo(() => {
    if (currentUserPhone && currentUserPhone.trim()) return currentUserPhone.trim();
    const upiPhone = currentUserUpiId?.match(/^(\d{10})@/)?.[1];
    return upiPhone || '';
  }, [currentUserPhone, currentUserUpiId]);

  const [userPhone, setUserPhone] = useState(defaultUserPhone);

  useEffect(() => {
    if (!userPhone && defaultUserPhone) {
      setUserPhone(defaultUserPhone);
    }
  }, [defaultUserPhone]);

  const cardRef = useRef<ViewShotRef>(null);

  // Calculate statement data dynamically
  const statementData = useMemo(() => {
    return calculateStatementDetails({
      entry,
      friend,
      currentUserName,
      currentUserPhone: userPhone.trim() || undefined,
      currentUserUpiId,
      childSettlements,
      hideMyPhone,
    });
  }, [entry, friend, currentUserName, userPhone, currentUserUpiId, childSettlements, hideMyPhone]);

  // WhatsApp prefilled message
  const whatsappMessage = useMemo(() => {
    const friendName = friend.name || 'Friend';
    const amtStr = formatIndianCurrency(statementData.remainingDue);
    const upiStr = statementData.upiId ? ` or UPI ID: ${statementData.upiId}` : '';
    const linkStr = statementData.upiUri ? `\n\n👉 Pay via UPI: ${statementData.upiUri}` : '';

    return `Hi ${friendName}, here is your Rupeo Khata statement for ${amtStr}.${statementData.upiId ? ` You can pay by scanning the QR code${upiStr}.` : ''}${linkStr}\n\nTracked smartly with Rupeo.`;
  }, [friend.name, statementData]);

  // Capture statement card as PNG
  const captureStatementCardPng = async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    try {
      if (typeof cardRef.current.capture === 'function') {
        return await cardRef.current.capture();
      }
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });
      return uri;
    } catch (err) {
      console.error('Error capturing statement card:', err);
      return null;
    }
  };

  // 1. Share as Image
  const handleShareImage = async () => {
    if (isGeneratingImage || isGeneratingPdf || isSharingWhatsApp) return;
    try {
      setIsGeneratingImage(true);
      const capturedUri = await captureStatementCardPng();
      if (!capturedUri) {
        Toast.show({ type: 'error', text1: 'Capture Failed', text2: 'Could not render statement card.' });
        return;
      }

      const filename = sanitizeFilename(friend.name, 'png');

      // Web: Direct file download
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const link = document.createElement('a');
        link.href = capturedUri;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Toast.show({
          type: 'success',
          text1: 'Statement Image Saved',
          text2: filename,
        });
        return;
      }

      const targetUri = `${FileSystem.documentDirectory}${filename}`;

      try {
        await FileSystem.copyAsync({ from: capturedUri, to: targetUri });
      } catch {
        // Fallback to capturedUri
      }

      const finalUri = (await FileSystem.getInfoAsync(targetUri)).exists ? targetUri : capturedUri;

      await shareImageAndText({
        uri: finalUri,
        title: `Rupeo Khata - ${friend.name}`,
        dialogTitle: `Rupeo Khata Statement (${formatIndianCurrency(statementData.remainingDue)})`,
      });
    } catch (err: any) {
      console.error('Share image error:', err);
      Toast.show({ type: 'error', text1: 'Share Failed', text2: err?.message || 'Could not share image.' });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 2. Share as PDF
  const handleSharePdf = async () => {
    if (isGeneratingImage || isGeneratingPdf || isSharingWhatsApp) return;
    try {
      setIsGeneratingPdf(true);
      Toast.show({
        type: 'info',
        text1: 'Preparing PDF...',
        text2: 'Generating high-definition statement document.',
        visibilityTime: 2000,
      });

      // 1. Capture card as PNG
      const capturedUri = await captureStatementCardPng();
      if (!capturedUri) {
        Toast.show({ type: 'error', text1: 'PDF Failed', text2: 'Could not snapshot statement card.' });
        return;
      }

      // 2. Convert to Base64
      const base64Data = await FileSystem.readAsStringAsync(capturedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 3. HTML template embedding the image
      const filename = sanitizeFilename(friend.name, 'pdf');
      const targetUri = `${FileSystem.documentDirectory}${filename}`;

      const plainPayInfo = statementData.upiUri ? statementData.upiUri : undefined;

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${filename}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #FFFFFF;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 16px 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .card-wrap {
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
      text-align: center;
    }
    .statement-img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }
    .pay-link-card {
      margin-top: 14px;
      padding: 10px 14px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      text-align: left;
    }
    .pay-link-label {
      font-size: 10px;
      font-weight: 800;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 3px;
    }
    .pay-link-text {
      font-size: 11px;
      font-family: monospace;
      color: #0284C7;
      word-break: break-all;
      line-height: 1.4;
    }
    @page { margin: 0; size: auto; }
    @media print {
      body { padding: 16px 0 !important; }
      .statement-img { box-shadow: none !important; }
    }
  </style>
</head>
<body>
  <div class="card-wrap">
    <img src="data:image/png;base64,${base64Data}" class="statement-img" alt="Rupeo Statement" />
    ${
      plainPayInfo
        ? `
    <div class="pay-link-card">
      <div class="pay-link-label">Direct UPI Payment Link (Tap / Copy)</div>
      <div class="pay-link-text">${plainPayInfo}</div>
    </div>`
        : ''
    }
  </div>
</body>
</html>
      `;

      // On web, isolated iframe prevents printing background tabs and action buttons
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.setAttribute('title', 'Rupeo Statement Print Frame');
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();
        }

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn('Iframe print error:', e);
          } finally {
            setTimeout(() => {
              try {
                document.body.removeChild(iframe);
              } catch {}
            }, 3000);
          }
        }, 350);

        return;
      }

      const printResult = await Print.printToFileAsync({
        html,
        base64: false,
      });

      if (!printResult || !printResult.uri) {
        throw new Error('Failed to generate PDF file.');
      }

      try {
        await FileSystem.copyAsync({ from: printResult.uri, to: targetUri });
      } catch {}

      const finalPdfUri = (await FileSystem.getInfoAsync(targetUri)).exists ? targetUri : printResult.uri;

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(finalPdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Rupeo Khata Statement - ${friend.name}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (err: any) {
      console.error('Share PDF error:', err);
      Toast.show({ type: 'error', text1: 'PDF Failed', text2: err?.message || 'Could not export PDF statement.' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 3. Share to WhatsApp
  const handleShareWhatsApp = async () => {
    if (isGeneratingImage || isGeneratingPdf || isSharingWhatsApp) return;
    try {
      setIsSharingWhatsApp(true);

      const cleanPhone = (friend.phone || '').replace(/[^0-9]/g, '');
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      const waWebUrl = formattedPhone
        ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(whatsappMessage)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessage)}`;

      const waScheme = formattedPhone
        ? `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(whatsappMessage)}`
        : `whatsapp://send?text=${encodeURIComponent(whatsappMessage)}`;

      // 1. On Web: Open WhatsApp directly in new window/tab without triggering Navigator.share restriction
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.open(waWebUrl, '_blank');
        } else {
          await Linking.openURL(waWebUrl);
        }
        Toast.show({
          type: 'success',
          text1: 'Opening WhatsApp...',
          text2: 'Message prefilled with statement details.',
        });
        return;
      }

      // 2. On Mobile: Capture card as PNG
      const capturedUri = await captureStatementCardPng();

      // Android with native RupeoShare
      if (Platform.OS === 'android' && capturedUri && NativeModules.RupeoShare?.shareToWhatsApp) {
        try {
          await NativeModules.RupeoShare.shareToWhatsApp(capturedUri, whatsappMessage, formattedPhone || undefined);
          return;
        } catch (waNativeErr) {
          console.warn('Native shareToWhatsApp failed, fallback:', waNativeErr);
        }
      }

      // Try WhatsApp deep link scheme
      const canOpen = await Linking.canOpenURL(waScheme).catch(() => false);
      if (canOpen) {
        await Linking.openURL(waScheme);
        return;
      }

      // Universal shareImageAndText fallback
      if (capturedUri) {
        await shareImageAndText({
          uri: capturedUri,
          text: whatsappMessage,
          title: `Rupeo Khata - ${friend.name}`,
          dialogTitle: 'Share to WhatsApp',
        });
        return;
      }

      await Linking.openURL(waWebUrl);
    } catch (err: any) {
      console.error('WhatsApp share error:', err);
      Toast.show({
        type: 'error',
        text1: 'WhatsApp Share Failed',
        text2: err?.message || 'Could not open WhatsApp.',
      });
    } finally {
      setIsSharingWhatsApp(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Top Navbar */}
        <View style={styles.navbar}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <View style={styles.navTitleCol}>
            <Text style={styles.navTitle}>Share Statement</Text>
            <Text style={styles.navSubtitle}>{friend.name}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Missing UPI ID Hint Banner */}
          {statementData.isUserLender && !statementData.upiId && !statementData.isSettled && (
            <View style={styles.upiHintBanner}>
              <View style={styles.upiHintIcon}>
                <Ionicons name="bulb-outline" size={20} color="#D97706" />
              </View>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Text style={styles.upiHintTitle}>Add your UPI ID for Scannable QR</Text>
                <Text style={styles.upiHintSub}>
                  Save your UPI ID in Settings so friends can scan and pay you back directly from this statement.
                </Text>
              </View>
              {onOpenSettingsForUpi ? (
                <TouchableOpacity onPress={onOpenSettingsForUpi} style={styles.upiHintBtn} activeOpacity={0.8}>
                  <Text style={styles.upiHintBtnText}>Set Now</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* Privacy Toggle: Hide my phone number */}
          <TouchableOpacity
            style={styles.privacyCard}
            onPress={() => setHideMyPhone((prev) => !prev)}
            activeOpacity={0.8}
          >
            <View style={styles.privacyLeft}>
              <View style={[styles.privacyIconBadge, hideMyPhone && styles.privacyIconBadgeActive]}>
                <Ionicons
                  name={hideMyPhone ? 'eye-off' : 'eye'}
                  size={16}
                  color={hideMyPhone ? '#D97706' : '#2563EB'}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.privacyTitle}>Hide my phone number</Text>
                <Text style={styles.privacySub} numberOfLines={1}>
                  {hideMyPhone
                    ? `Hidden on card${userPhone ? ` (${userPhone})` : ''}`
                    : `Shown on card${userPhone ? ` (${userPhone})` : ' (Tap to add)'}`}
                </Text>
              </View>
            </View>
            <Switch
              value={hideMyPhone}
              onValueChange={setHideMyPhone}
              trackColor={{ false: '#CBD5E1', true: '#0F172A' }}
              thumbColor="#FFFFFF"
            />
          </TouchableOpacity>

          {/* Inline Phone Editor when unhidden */}
          {!hideMyPhone && (
            <View style={styles.phoneInputRow}>
              <Ionicons name="call-outline" size={15} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.phoneInputField}
                value={userPhone}
                onChangeText={setUserPhone}
                placeholder="Enter 10-digit mobile number"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                maxLength={15}
              />
              {userPhone ? (
                <TouchableOpacity
                  onPress={() => setUserPhone('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* Card Live Preview & Capture ViewShot */}
          <View style={styles.cardPreviewWrap}>
            <ViewShot ref={cardRef} options={{ format: 'png', quality: 1.0, result: 'tmpfile' }}>
              <StatementCard data={statementData} width={390} />
            </ViewShot>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {/* Share to WhatsApp */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnWhatsApp]}
              onPress={handleShareWhatsApp}
              disabled={isSharingWhatsApp || isGeneratingImage || isGeneratingPdf}
              activeOpacity={0.85}
            >
              {isSharingWhatsApp ? (
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="logo-whatsapp" size={19} color="#FFFFFF" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.actionBtnTextWhite}>
                {isSharingWhatsApp ? 'Preparing WhatsApp...' : 'Share to WhatsApp'}
              </Text>
            </TouchableOpacity>

            <View style={styles.secondaryActionRow}>
              {/* Share as Image */}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary, { flex: 1 }]}
                onPress={handleShareImage}
                disabled={isGeneratingImage || isGeneratingPdf || isSharingWhatsApp}
                activeOpacity={0.85}
              >
                {isGeneratingImage ? (
                  <ActivityIndicator size="small" color="#0F172A" style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons name="image-outline" size={17} color="#0F172A" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.actionBtnTextDark}>
                  {isGeneratingImage ? 'Exporting...' : 'Share Image'}
                </Text>
              </TouchableOpacity>

              {/* Share as PDF */}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary, { flex: 1 }]}
                onPress={handleSharePdf}
                disabled={isGeneratingPdf || isGeneratingImage || isSharingWhatsApp}
                activeOpacity={0.85}
              >
                {isGeneratingPdf ? (
                  <ActivityIndicator size="small" color="#0F172A" style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons name="document-text-outline" size={17} color="#0F172A" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.actionBtnTextDark}>
                  {isGeneratingPdf ? 'Creating PDF...' : 'Share PDF'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  navTitleCol: {
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  navSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
  },
  upiHintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  upiHintIcon: {
    marginRight: 10,
  },
  upiHintTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
  },
  upiHintSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 14,
  },
  upiHintBtn: {
    backgroundColor: '#92400E',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  upiHintBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  privacyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  privacySub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  privacyIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  privacyIconBadgeActive: {
    backgroundColor: '#FEF3C7',
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: -8,
    marginBottom: 16,
  },
  phoneInputField: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
    fontWeight: '600',
  },
  cardPreviewWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  actionsContainer: {
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
  },
  actionBtnWhatsApp: {
    backgroundColor: '#16A34A',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  actionBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnTextWhite: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  actionBtnTextDark: {
    color: '#0F172A',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
