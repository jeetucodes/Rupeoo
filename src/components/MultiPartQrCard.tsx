import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Share,
  ActivityIndicator,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { SplitPart } from '@/lib/splitPayment';
import BankLogo from '@/components/BankLogo';

// Safe dynamic getter for expo-media-library that avoids crashing on Web
const getMediaLibrary = () => {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-media-library');
  } catch {
    return null;
  }
};

interface MultiPartQrCardProps {
  part: SplitPart;
  upiId: string;
  payeeName?: string;
  totalAmountFormatted: string;
  onTogglePaid: (partId: string) => void;
  onSavePaymentCard?: () => void;
  cardWidth?: number;
}

export const MultiPartQrCard: React.FC<MultiPartQrCardProps> = ({
  part,
  upiId,
  payeeName,
  totalAmountFormatted,
  onTogglePaid,
  onSavePaymentCard,
  cardWidth = 340,
}) => {
  const viewShotRef = useRef<any>(null);
  const svgRef = useRef<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const qrSize = Math.min(cardWidth - 110, 200);
  const logoSize = Math.round(qrSize * 0.22);

  // Helper to trigger browser download on Web
  const triggerWebDownload = (dataUrl: string) => {
    if (typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.download = `Rupeo-UPI-Part-${part.partIndex}.png`;
      link.href = dataUrl;
      link.click();
      Toast.show({
        type: 'success',
        text1: 'Downloaded QR Code! 📸',
        text2: `Part ${part.partIndex} (₹${part.amountFormatted}) image saved.`,
        position: 'top',
        visibilityTime: 3500,
      });
    }
  };

  // Save QR code image to device gallery (with Web & native fallback)
  const handleSaveToGallery = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // Web: direct SVG-to-DataURL browser download
      if (Platform.OS === 'web') {
        if (svgRef.current?.toDataURL) {
          svgRef.current.toDataURL((data: string) => {
            const fullDataUrl = data.startsWith('data:') ? data : `data:image/png;base64,${data}`;
            triggerWebDownload(fullDataUrl);
          });
          return;
        }
      }

      // Capture screenshot of the printable QR pass
      let uri: string | null = null;
      if (viewShotRef.current?.capture) {
        try {
          uri = await viewShotRef.current.capture();
        } catch (captureErr) {
          console.warn('ViewShot capture failed:', captureErr);
        }
      }

      if (uri) {
        if (Platform.OS === 'web') {
          triggerWebDownload(uri);
          return;
        }

        const MediaLibrary = getMediaLibrary();
        if (MediaLibrary?.requestPermissionsAsync && MediaLibrary?.saveToLibraryAsync) {
          try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status === 'granted') {
              await MediaLibrary.saveToLibraryAsync(uri);
              Toast.show({
                type: 'success',
                text1: 'Saved to Gallery! 📸',
                text2: `QR code for Part ${part.partIndex} (₹${part.amountFormatted}) saved.`,
                position: 'top',
                visibilityTime: 3500,
              });
              return;
            }
          } catch (mediaErr) {
            console.warn('MediaLibrary save error, falling back to Sharing:', mediaErr);
          }
        }

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Save Part ${part.partIndex} QR Code`,
          });
          return;
        }
      }

      Toast.show({
        type: 'info',
        text1: 'Save Unavailable',
        text2: 'You can take a screenshot or share the UPI link directly.',
        position: 'top',
      });
    } catch (err: any) {
      console.warn('Error saving QR code:', err);
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: err?.message || 'Could not save QR code image.',
        position: 'top',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Share QR code image or UPI deep link
  const handleShareQr = async () => {
    if (isSharing) return;
    setIsSharing(true);

    try {
      if (viewShotRef.current && (await Sharing.isAvailableAsync()) && Platform.OS !== 'web') {
        const uri = await viewShotRef.current.capture();
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Rupeo UPI QR - Part ${part.partIndex}/${part.totalParts} (₹${part.amountFormatted})`,
        });
      } else {
        await Share.share({
          title: `UPI Payment Part ${part.partIndex}/${part.totalParts}`,
          message: `Pay ₹${part.amountFormatted} via UPI to ${payeeName || upiId} (${upiId}).\nLink: ${part.upiUri}\n\nNote: ${part.note}`,
        });
      }
    } catch (err) {
      console.warn('Error sharing QR:', err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <View style={[styles.cardContainer, { width: cardWidth }]}>
      {/* Printable / Snapshot ViewShot Container */}
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 1.0, result: 'tmpfile' }}
        style={styles.viewShotPass}
      >
        {/* Red Decorative Top Bar */}
        <View style={styles.passTopRedBar} />

        {/* Header: Centered Rupeo PASS + NPCI Unified badge */}
        <View style={styles.passHeader}>
          <View style={styles.centerBrandRow}>
            <View style={styles.logoSquare}>
              <Text style={styles.logoSquareText}>₹</Text>
            </View>
            <View style={styles.logoTitleRow}>
              <Text style={styles.logoTitle}>Rupeo</Text>
              <View style={styles.passBadge}>
                <Text style={styles.passBadgeText}>PASS</Text>
              </View>
            </View>
          </View>

          <View style={styles.passSubHeaderRow}>
            <Text style={styles.passSubtitle}>
              Payment Part {part.partIndex} of {part.totalParts}
            </Text>
            <View style={styles.metaDot} />
            <View style={styles.npciBadge}>
              <Ionicons name="checkmark-circle-outline" size={12} color="#059669" />
              <Text style={styles.npciBadgeText}>NPCI Unified</Text>
            </View>
          </View>
        </View>

        {/* Payee VPA Tag Pill */}
        <View style={styles.vpaPillContainer}>
          <Text style={styles.vpaPillText}>{upiId}</Text>
        </View>

        {/* Big Amount Card with INR Badge */}
        <View style={styles.amountBox}>
          <Text style={styles.amountBoxSymbol}>₹</Text>
          <Text style={styles.amountBoxValue}>{part.amountFormatted}</Text>
          <View style={styles.inrBadge}>
            <Text style={styles.inrBadgeText}>INR</Text>
          </View>
        </View>

        {/* Direct Bank-to-bank Sub-badge */}
        <View style={styles.secureTransferPill}>
          <Ionicons name="lock-closed" size={11} color="#64748B" />
          <Text style={styles.secureTransferText}>
            Direct Bank-to-Bank · Zero Extra Surcharge
          </Text>
        </View>

        {/* Part Subtitle */}
        <Text style={styles.partTotalSubtitle}>
          Part {part.partIndex} of {part.totalParts} · Total ₹{totalAmountFormatted}
        </Text>

        {/* Note Quote Box */}
        {part.note ? (
          <View style={styles.quoteBox}>
            <Text style={styles.quoteText}>"{part.note}"</Text>
          </View>
        ) : null}

        {/* Viewfinder QR Code Container with 4 Corner Brackets */}
        <View style={styles.qrViewfinderContainer}>
          {/* Top-Left Corner Bracket */}
          <View style={[styles.cornerBracket, styles.cornerTopLeft]} />
          {/* Top-Right Corner Bracket */}
          <View style={[styles.cornerBracket, styles.cornerTopRight]} />
          {/* Bottom-Left Corner Bracket */}
          <View style={[styles.cornerBracket, styles.cornerBottomLeft]} />
          {/* Bottom-Right Corner Bracket */}
          <View style={[styles.cornerBracket, styles.cornerBottomRight]} />

          {/* Inner QR */}
          <View style={styles.qrInnerBox}>
            <QRCode
              value={part.upiUri}
              size={qrSize}
              color={part.isPaid ? '#475569' : '#0F172A'}
              backgroundColor="#FFFFFF"
              quietZone={10}
              ecl="H"
              logo={require('../../assets/images/rupeo-qr-emblem.png')}
              logoSize={logoSize}
              logoBackgroundColor="transparent"
              logoMargin={0}
              logoBorderRadius={Math.round(logoSize * 0.215)}
              getRef={(c) => (svgRef.current = c)}
            />

            {/* Paid Watermark Overlay */}
            {part.isPaid && (
              <View style={styles.paidWatermarkOverlay} pointerEvents="none">
                <View style={styles.paidStampBadge}>
                  <Ionicons name="checkmark-done" size={26} color="#16A34A" />
                  <Text style={styles.paidStampText}>PAID</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Caption below QR */}
        <Text style={styles.scanCaption}>Scan & Pay with any UPI App</Text>

        {/* Supported UPI Apps Logos Row under QR */}
        <View style={styles.qrFooterLogosRow}>
          <BankLogo id="gpay" height={16} />
          <BankLogo id="phonepe" height={16} />
          <BankLogo id="paytm" height={16} />
          <BankLogo id="bhim" height={16} />
        </View>
      </ViewShot>

      {/* Action Controls Section */}
      <View style={styles.controlsContainer}>
        {/* Toggle "Mark as Paid" Button */}
        <TouchableOpacity
          style={[styles.paidToggleBtn, part.isPaid && styles.paidToggleBtnActive]}
          onPress={() => onTogglePaid(part.id)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={part.isPaid ? 'checkbox' : 'square-outline'}
            size={19}
            color={part.isPaid ? '#16A34A' : '#64748B'}
          />
          <Text style={[styles.paidToggleBtnText, part.isPaid && styles.paidToggleBtnTextActive]}>
            {part.isPaid ? 'Marked as Paid' : 'Mark as Paid'}
          </Text>
        </TouchableOpacity>

        {/* Secondary Action Row: Save QR, Share, Save Card */}
        <View style={styles.secondaryActionsRow}>
          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={handleSaveToGallery}
            disabled={isSaving}
            activeOpacity={0.75}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <>
                <Ionicons name="download-outline" size={16} color="#0F172A" style={{ marginRight: 5 }} />
                <Text style={styles.secondaryActionText}>Save QR</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={handleShareQr}
            disabled={isSharing}
            activeOpacity={0.75}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <>
                <Ionicons name="share-social-outline" size={16} color="#0F172A" style={{ marginRight: 5 }} />
                <Text style={styles.secondaryActionText}>Share</Text>
              </>
            )}
          </TouchableOpacity>

          {onSavePaymentCard && (
            <TouchableOpacity
              style={[styles.secondaryActionBtn, styles.saveCardBtnHighlight]}
              onPress={onSavePaymentCard}
              activeOpacity={0.75}
            >
              <Ionicons name="bookmark-outline" size={16} color="#2563EB" style={{ marginRight: 5 }} />
              <Text style={[styles.secondaryActionText, { color: '#2563EB' }]}>Save Bill</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  viewShotPass: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 4,
    alignItems: 'center',
    paddingBottom: 18,
  },
  passTopRedBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#DC2626',
  },
  passHeader: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  centerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoSquare: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSquareText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFD740',
  },
  logoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  passBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  passBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFD740',
    letterSpacing: 0.8,
  },
  passSubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  passSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  metaDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
  },
  npciBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 4,
  },
  npciBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  vpaPillContainer: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
    marginBottom: 10,
  },
  vpaPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 8,
    width: '85%',
  },
  amountBoxSymbol: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginRight: 4,
  },
  amountBoxValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  inrBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 10,
  },
  inrBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  secureTransferPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
    gap: 5,
  },
  secureTransferText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  partTotalSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 6,
  },
  quoteBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: '85%',
  },
  quoteText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#475569',
    textAlign: 'center',
  },
  qrViewfinderContainer: {
    position: 'relative',
    padding: 14,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerBracket: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#0F172A',
  },
  cornerTopLeft: {
    top: 4,
    left: 4,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTopRight: {
    top: 4,
    right: 4,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBottomLeft: {
    bottom: 4,
    left: 4,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBottomRight: {
    bottom: 4,
    right: 4,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  qrInnerBox: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidWatermarkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidStampBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#16A34A',
    alignItems: 'center',
    shadowColor: '#16A34A',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  paidStampText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16A34A',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  scanCaption: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 10,
  },
  qrFooterLogosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  controlsContainer: {
    width: '100%',
    marginTop: 14,
    gap: 10,
  },
  paidToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 8,
  },
  paidToggleBtnActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  paidToggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  paidToggleBtnTextActive: {
    color: '#15803D',
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  saveCardBtnHighlight: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
});

export default MultiPartQrCard;
