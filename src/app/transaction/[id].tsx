import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  Share,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  Easing,
  NativeModules,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { shareImageAndText } from '@/lib/shareHelper';
import { useAuth } from '@/context/AuthContext';
import { isLowEndDevice } from '@/lib/devicePerf';
import { RupeoAdBanner } from '@/lib/ads';
import {
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getUserCategories,
  CategoryItem,
  undoBillPayment,
} from '@/lib/database';
import { safeGoBack } from '@/lib/navigation';
import { useTranslation } from '@/lib/i18n';
import * as ImagePicker from 'expo-image-picker';
import { formatTime12Hour, getLocalDateString } from '@/lib/dateUtils';
import PaymentModeIcon from '@/components/PaymentModeIcon';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';
import CategoryIcon from '@/components/CategoryIcon';
import Toast from 'react-native-toast-message';
import Skeleton from '@/components/Skeleton';
import ScannableBarcode from '@/components/ScannableBarcode';
import ReceiptPaymentMethodBadge from '@/components/ReceiptPaymentMethodBadge';
import { getDisplayTransactionNote } from '@/lib/smsSettings';
import { formatPaymentModeDisplay } from '@/lib/dataMinimization';
import { CategorySheet } from '@/features/import/components/CategorySheet';
import { warn, error } from '@/lib/logger';

function formatDisplayDate(rawDate?: string): string {
  if (!rawDate) {
    const now = new Date();
    return now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (/^\d{2}\s[A-Za-z]{3}\s\d{4}$/.test(rawDate)) {
    return rawDate;
  }
  try {
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {
    // Intentional: fall back to rawDate string if parsing fails
  }
  return rawDate;
}

function formatDisplayTime(rawTime?: string): string {
  if (!rawTime) {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return formatTime12Hour(rawTime);
}

const PAYMENT_MODES = [
  { id: 'UPI', label: 'UPI', icon: 'flash', color: '#7C3AED' },
  { id: 'Cash', label: 'Cash', icon: 'cash', color: '#16A34A' },
  { id: 'Card', label: 'Card', icon: 'card', color: '#2563EB' },
  { id: 'Bank', label: 'Bank', icon: 'business', color: '#D97706' },
];

function ReceiptActionIcon({ type }: { type: 'edit' | 'share' | 'delete' }) {
  if (type === 'edit') {
    return <Ionicons name="pencil-outline" size={18} color="#334155" />;
  }

  if (type === 'share') {
    return <Ionicons name="share-social-outline" size={18} color="#334155" />;
  }

  return <Ionicons name="trash-outline" size={18} color="#DC2626" />;
}

export default function TransactionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, settings } = useAuth();
  const { t } = useTranslation();
  const currency = settings?.currency === 'INR' ? '₹' : (settings?.currency || '₹');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [category, setCategory] = useState('Food');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const receiptCardRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [linkedBillId, setLinkedBillId] = useState<string | null>(null);
  const [showCategorySheet, setShowCategorySheet] = useState(false);

  const handleUnlinkBill = () => {
    if (!linkedBillId || !user?.uid || !id) return;
    Alert.alert(
      'Undo Bill Match',
      'Choose what to do with this transaction and the linked bill:',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Unlink & Keep Transaction',
          onPress: async () => {
            try {
              await undoBillPayment(user.uid, linkedBillId, id, undefined, false);
              setLinkedBillId(null);
              Toast.show({
                type: 'success',
                text1: 'Bill Unlinked',
                text2: 'Bill marked unpaid. Transaction kept as expense.',
              });
            } catch {
              Toast.show({ type: 'error', text1: 'Error unlinking bill' });
            }
          },
        },
        {
          text: 'Delete Transaction & Revert',
          style: 'destructive',
          onPress: async () => {
            try {
              await undoBillPayment(user.uid, linkedBillId, id, undefined, true);
              Toast.show({
                type: 'info',
                text1: 'Payment Undone',
                text2: 'Transaction deleted and bill marked unpaid.',
              });
              safeGoBack(router);
            } catch {
              Toast.show({ type: 'error', text1: 'Error undoing payment' });
            }
          },
        },
      ]
    );
  };

  const barcodeValue = React.useMemo(() => {
    const raw = (id || 'TXN001').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const code = raw.slice(0, 8).padEnd(6, '0');
    return `RP-${code}`;
  }, [id]);

  useEffect(() => {
    if (receiptImage) {
      Image.getSize(
        receiptImage,
        (width, height) => {
          if (width > 0 && height > 0) {
            setImageAspectRatio(width / height);
          }
        },
        () => {
          setImageAspectRatio(null);
        }
      );
    } else {
      setImageAspectRatio(null);
    }
  }, [receiptImage]);

  // Animation values
  const cardSlideAnim = useRef(new Animated.Value(50)).current;
  const cardOpacityAnim = useRef(new Animated.Value(0)).current;
  const logoScaleAnim = useRef(new Animated.Value(0.8)).current;
  const amountBounceAnim = useRef(new Animated.Value(0.95)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  // Background ambient animation (paused on low-end devices)
  useEffect(() => {
    if (isLowEndDevice()) {
      bgAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bgAnim, {
          toValue: 1,
          duration: 14000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bgAnim, {
          toValue: 0,
          duration: 14000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bgAnim]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'rupeo-receipt-print-rules';
      if (!document.getElementById(styleId)) {
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.innerHTML = `
          @media print {
            @page {
              size: auto;
              margin: 0mm;
            }
            body {
              background: #FFFFFF !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            /* Hide top bar, buttons, action bar, edit icons, delete dialogs */
            header, nav, button, [role="button"],
            [data-testid="bottom-actions"],
            div[style*="position: absolute; top: 0; left: 0; right: 0"],
            .no-print {
              display: none !important;
            }
          }
        `;
        document.head.appendChild(styleEl);
      }
    }
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!user || !id) return;
      try {
        const [tx, cats] = await Promise.all([
          getTransactionById(user.uid, id),
          getUserCategories(user.uid),
        ]);

        setCategories(cats);

        if (tx) {
          setType(tx.type === 'credit' ? 'credit' : 'debit');
          setAmount(tx.amount?.toString() || '');
          setMerchant(tx.merchant_name || tx.payee || tx.merchant || '');
          setDescription(tx.description || tx.userNote || tx.note || '');
          setDate(tx.date || getLocalDateString());
          setTime(tx.time || '');
          setCategory(tx.category || 'Food');
          const rawPm = tx.payment_mode || tx.paymentMode;
          const displayPm = formatPaymentModeDisplay(rawPm);
          setPaymentMode(displayPm !== 'Not set' ? displayPm : 'Not set');
          setReceiptImage(tx.receipt_image || tx.receiptImage || null);
          setLinkedBillId((tx as any)?.billId || null);

          // Start entrance animations
          setTimeout(() => {
            Animated.parallel([
              Animated.timing(cardSlideAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
              }),
              Animated.timing(cardOpacityAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
              }),
            ]).start();

            // Logo bounce animation
            setTimeout(() => {
              Animated.sequence([
                Animated.timing(logoScaleAnim, {
                  toValue: 1.1,
                  duration: 200,
                  useNativeDriver: true,
                }),
                Animated.timing(logoScaleAnim, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }),
              ]).start();
            }, 300);

            // Amount bounce effect
            setTimeout(() => {
              Animated.sequence([
                Animated.timing(amountBounceAnim, {
                  toValue: 1.05,
                  duration: 150,
                  useNativeDriver: true,
                }),
                Animated.timing(amountBounceAnim, {
                  toValue: 1,
                  duration: 200,
                  useNativeDriver: true,
                }),
              ]).start();
            }, 500);
          }, 100);
        } else {
          Alert.alert('Error', 'Transaction not found.');
          safeGoBack(router);
        }
      } catch (err) {
        error('Error fetching transaction details:', err);
        Alert.alert('Error', 'Failed to load transaction details.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [user, id]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const base64Uri = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setReceiptImage(base64Uri);
      }
    } catch (err) {
      warn('Error picking image:', err);
      Toast.show({ type: 'error', text1: 'Gallery Notice', text2: 'Could not open image library' });
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Toast.show({ type: 'error', text1: 'Invalid Amount', text2: 'Please enter a valid positive amount.' });
      return;
    }

    if (!user || !id) return;
    setSaving(true);
    try {
      await updateTransaction(user.uid, id, {
        amount: parsedAmount,
        type,
        merchant_name: merchant.trim(),
        payee: merchant.trim(),
        description: description.trim(),
        userNote: description.trim(),
        note: description.trim(),
        date,
        category,
        payment_mode: paymentMode,
        paymentMode: paymentMode,
        receipt_image: receiptImage || null,
      });

      Toast.show({ type: 'success', text1: 'Saved', text2: 'Transaction updated successfully.' });
      safeGoBack(router);
    } catch (err) {
      error('Error saving transaction:', err);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to save changes.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    setDeleteConfirmVisible(true);
  };

  const confirmDelete = async () => {
    if (!user || !id) return;
    setDeleting(true);
    try {
      await deleteTransaction(user.uid, id);
      setDeleteConfirmVisible(false);
      safeGoBack(router);
    } catch (err) {
      error('Error deleting transaction:', err);
      setDeleting(false);
    }
  };

  const handleShareReceipt = async () => {
    const sign = type === 'debit' ? '-' : '+';
    const formattedAmt = `${sign}${currency}${parseFloat(amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const receiptText = [
      `🧾 Rupeo Transaction Receipt: ${formattedAmt}`,
      `Ref ID: ${barcodeValue}`,
      `Paid to: ${merchant || 'Unknown Payee'}`,
      `Date: ${formatDisplayDate(date)} at ${formatDisplayTime(time)}`,
      `Category: ${category} | Payment Mode: ${paymentMode}`,
      ...(description ? [`Note: ${description}`] : []),
      '',
      '🔍 Verify Receipt Authenticity: https://rupeoo.vercel.app/scanner',
      'Track every expense smartly with Rupeo.',
      '📲 Download Rupeo on Google Play Store: https://play.google.com/store/apps/details?id=com.innovatexlabs.paisewaise',
    ].join('\n');

    try {
      setSharingImage(true);

      if (receiptCardRef.current && Platform.OS !== 'web') {
        const uri = await captureRef(receiptCardRef, {
          format: 'png',
          quality: 1.0,
          result: 'tmpfile',
        });

        await shareImageAndText({
          uri,
          text: receiptText,
          title: `Rupeo Receipt (${formattedAmt})`,
          dialogTitle: `Rupeo Receipt (${formattedAmt})`,
        });
        return;
      }

      // Fallback for Web
      await Share.share({
        title: `Rupeo Transaction Receipt - ${formattedAmt}`,
        message: receiptText,
      });
    } catch (err) {
      error('Error sharing receipt:', err);
      Toast.show({ type: 'error', text1: 'Share Failed', text2: 'Could not share this receipt photo.' });
    } finally {
      setSharingImage(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />
        <View style={styles.header}>
          <View style={styles.backBtn}><Skeleton width={24} height={24} borderRadius={12} /></View>
          <Skeleton width={140} height={20} />
          <View style={styles.headerActions}>
            <View style={[styles.headerIconButton]}><Skeleton width={24} height={24} borderRadius={12} /></View>
            <View style={[styles.headerIconButton, { marginLeft: 8 }]}><Skeleton width={24} height={24} borderRadius={12} /></View>
          </View>
        </View>
        
        <ScrollView contentContainerStyle={styles.receiptContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.slipCard, { backgroundColor: '#FFFFFF' }]}>
            <View style={[styles.slipCardTop, { backgroundColor: '#F0EEE7', height: 180, alignItems: 'center', justifyContent: 'center' }]}>
              <Skeleton width={52} height={52} borderRadius={26} style={{ marginBottom: 12 }} />
              <Skeleton width={160} height={32} style={{ marginBottom: 8 }} />
              <Skeleton width={100} height={16} />
            </View>
            <View style={{ padding: 24 }}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' }}>
                  <Skeleton width={80} height={14} />
                  <Skeleton width={120} height={14} />
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (isEditing) setIsEditing(false);
          else safeGoBack(router);
        }} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name={isEditing ? "close" : "chevron-back"} size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{isEditing ? t('edit_transaction') : 'Transaction Receipt'}</Text>
        <View style={styles.headerActions}>
          {!isEditing && (
            <TouchableOpacity
              onPress={() => setIsEditing(true)}
              style={styles.boldEditButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit transaction"
            >
              <Ionicons name="pencil" size={14} color="#0F172A" style={{ marginRight: 5 }} />
              <Text style={styles.boldEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleDelete}
            style={[styles.headerIconButton, styles.deleteIconButton]}
            activeOpacity={0.7}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Delete transaction"
          >
            <ReceiptActionIcon type="delete" />
          </TouchableOpacity>
        </View>
      </View>

      {!isEditing ? (
        <>
          {/* SLOW AMBIENT BACKGROUND GLOW ANIMATION */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Animated.View
              style={[
                styles.bgOrb1,
                {
                  backgroundColor: type === 'credit' ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.14)',
                  transform: [
                    {
                      translateX: bgAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [-25, 35, -25],
                      }),
                    },
                    {
                      translateY: bgAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 50, 0],
                      }),
                    },
                    {
                      scale: bgAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [1, 1.25, 1],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.bgOrb2,
                {
                  backgroundColor: type === 'credit' ? 'rgba(5, 150, 105, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  transform: [
                    {
                      translateX: bgAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [35, -35, 35],
                      }),
                    },
                    {
                      translateY: bgAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, -40, 0],
                      }),
                    },
                    {
                      scale: bgAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.9, 1.2, 0.9],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.bgOrb3,
                {
                  backgroundColor: type === 'credit' ? 'rgba(52, 211, 153, 0.10)' : 'rgba(225, 29, 72, 0.10)',
                  transform: [
                    {
                      translateX: bgAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [-15, 25, -15],
                      }),
                    },
                    {
                      translateY: bgAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [40, -15, 40],
                      }),
                    },
                    {
                      scale: bgAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [1.1, 0.85, 1.1],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>

          <ScrollView contentContainerStyle={styles.receiptContent} showsVerticalScrollIndicator={false}>

          {/* ANIMATED VOUCHER SLIP RECEIPT CARD */}
          {(() => {
            const isCredit = type === 'credit';
            const catObj = categories.find((c) => c.name.toLowerCase() === category.toLowerCase());

            return (
              <Animated.View
                  ref={receiptCardRef}
                  collapsable={false}
                  style={[
                    styles.slipCard,
                    {
                      opacity: cardOpacityAnim,
                      transform: [
                        { translateY: cardSlideAnim },
                        {
                          scale: cardOpacityAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.95, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {/* TOP GRADIENT BANNER */}
                  <LinearGradient
                    colors={
                      type === 'credit'
                        ? ['#065F46', '#047857', '#059669', '#10B981']
                        : ['#7F1D1D', '#991B1B', '#B91C1C', '#DC2626']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.slipCardTop}
                  >
                    {/* Decorative blobs */}
                    <View
                      style={[
                        styles.slipBlob1,
                        {
                          backgroundColor:
                            type === 'credit'
                              ? 'rgba(16, 185, 129, 0.25)'
                              : 'rgba(239, 68, 68, 0.25)',
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.slipBlob2,
                        {
                          backgroundColor:
                            type === 'credit'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(255, 215, 64, 0.18)',
                        },
                      ]}
                    />

                    {/* Rupeo watermark */}
                    <View style={styles.slipWatermark}>
                      <Text style={styles.slipWatermarkText}>RUPEO</Text>
                    </View>

                    {/* HERO ARROW ICON BADGE */}
                    <Animated.View
                      style={[
                        styles.slipCardIcon,
                        {
                          backgroundColor:
                            type === 'credit'
                              ? 'rgba(16, 185, 129, 0.35)'
                              : 'rgba(255, 255, 255, 0.22)',
                          borderColor:
                            type === 'credit' ? '#34D399' : 'rgba(255, 255, 255, 0.45)',
                          borderWidth: 2,
                          transform: [{ scale: logoScaleAnim }],
                        },
                      ]}
                    >
                      <Ionicons
                        name={type === 'credit' ? 'arrow-down' : 'arrow-up'}
                        size={28}
                        color="#FFFFFF"
                      />
                    </Animated.View>

                    {/* BIG FORMATTED AMOUNT */}
                    <Animated.Text
                      style={[
                        styles.slipCardAmount,
                        {
                          color: type === 'credit' ? '#6EE7B7' : '#FFFFFF',
                          transform: [{ scale: amountBounceAnim }],
                        },
                      ]}
                    >
                      {type === 'debit' ? '−' : '+'}
                      {currency}
                      {parseFloat(amount || '0').toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Animated.Text>

                    <Text style={styles.slipCardMerchant} numberOfLines={1}>
                      {merchant || (isCredit ? 'Sender' : 'Transaction')}
                    </Text>

                    <View style={styles.slipCardStatusChip}>
                      <View
                        style={[
                          styles.slipCardStatusDot,
                          {
                            backgroundColor:
                              type === 'credit' ? '#34D399' : '#10B981',
                          },
                        ]}
                      />
                      <Text style={styles.slipCardStatusText}>
                        TRANSACTION SUCCESSFUL
                      </Text>
                    </View>
                  </LinearGradient>

                  {/* NOTCH DIVIDER */}
                  <View style={styles.slipNotchRow}>
                    <View style={styles.slipNotchLeft} />
                    <View style={styles.slipNotchDash} />
                    <View style={styles.slipNotchRight} />
                  </View>

                  {/* SLIP BODY */}
                  <View style={styles.slipCardBody}>
                    <View style={styles.slipRefLineRow}>
                      <Text style={styles.slipRefLine}>
                        RUPEO TXN · {barcodeValue}
                      </Text>
                      <View style={styles.slipSecureTag}>
                        <Ionicons
                          name="shield-checkmark"
                          size={11}
                          color="#059669"
                          style={{ marginRight: 3 }}
                        />
                        <Text style={styles.slipSecureTagText}>VERIFIED</Text>
                      </View>
                    </View>

                    {/* DATE & TIME SUMMARY */}
                    <View style={styles.slipSummaryGrid}>
                      <View style={styles.slipSummaryItem}>
                        <View
                          style={[
                            styles.slipSummaryIcon,
                            { backgroundColor: '#EFF6FF' },
                          ]}
                        >
                          <ExpoImage cachePolicy="memory-disk"
                            source={{
                              uri: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Calendar.png',
                            }}
                            style={{ width: 18, height: 18 }}
                            contentFit="contain"
                          />
                        </View>
                        <View>
                          <Text style={styles.slipSummaryLabel}>DATE</Text>
                          <Text style={styles.slipSummaryValue}>
                            {date || 'Not set'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.slipSummaryItem}>
                        <View
                          style={[
                            styles.slipSummaryIcon,
                            { backgroundColor: '#ECFDF5' },
                          ]}
                        >
                          <ExpoImage cachePolicy="memory-disk"
                            source={{
                              uri: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Sun.png',
                            }}
                            style={{ width: 18, height: 18 }}
                            contentFit="contain"
                          />
                        </View>
                        <View>
                          <Text style={styles.slipSummaryLabel}>TIME</Text>
                          <Text style={styles.slipSummaryValue}>
                            {time ? formatTime12Hour(time) : 'Recorded'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* CATEGORY ROW */}
                    <TouchableOpacity
                      style={styles.slipRow}
                      onPress={() => setShowCategorySheet(true)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Change category from ${category}`}
                    >
                      <Text style={styles.slipRowLabel}>CATEGORY</Text>
                      <View style={styles.slipRowValueContainer}>
                        <CategoryIcon
                          categoryName={catObj?.name || category}
                          iconName={catObj?.icon || 'receipt-outline'}
                          size={18}
                          color={catObj?.color || '#3B82F6'}
                        />
                        <Text style={styles.slipRowValue}>{category}</Text>
                        <Ionicons name="chevron-forward" size={13} color="#94A3B8" style={{ marginLeft: 3 }} />
                      </View>
                    </TouchableOpacity>

                    {/* PAYMENT MODE ROW */}
                    <View style={styles.slipRow}>
                      <Text style={styles.slipRowLabel}>PAYMENT MODE</Text>
                      <View style={styles.slipRowValueContainer}>
                        <ReceiptPaymentMethodBadge mode={paymentMode} isDark={false} />
                        <Text style={styles.slipRowValue}>{paymentMode}</Text>
                      </View>
                    </View>

                    {/* LINKED BILL ROW */}
                    {linkedBillId && (
                      <View style={styles.slipRow}>
                        <Text style={styles.slipRowLabel}>LINKED BILL</Text>
                        <View style={styles.slipRowValueContainer}>
                          <View style={styles.linkedBillBadge}>
                            <Ionicons name="receipt" size={13} color="#4F46E5" style={{ marginRight: 4 }} />
                            <Text style={styles.linkedBillBadgeText}>Bill Payment</Text>
                          </View>
                          <TouchableOpacity
                            onPress={handleUnlinkBill}
                            style={styles.unlinkBillBtn}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.unlinkBillBtnText}>Undo Match</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* NOTE ROW (IF PRESENT) */}
                    {(() => {
                      const noteToShow = getDisplayTransactionNote(description);
                      if (!noteToShow) return null;
                      const isOriginalMsg = noteToShow.startsWith('Original Message:');
                      const messageBody = isOriginalMsg
                        ? noteToShow.replace(/^Original Message:\s*/i, '').trim()
                        : noteToShow;

                      if (isOriginalMsg) {
                        return (
                          <View style={[styles.slipRow, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 12 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
                              <Text style={styles.slipRowLabel}>NOTE</Text>
                              <View style={styles.originalMsgBadge}>
                                <Ionicons
                                  name="chatbox-ellipses-outline"
                                  size={11}
                                  color="#2563EB"
                                  style={{ marginRight: 4 }}
                                />
                                <Text style={styles.originalMsgBadgeText}>Original Message</Text>
                              </View>
                            </View>
                            <View style={styles.originalMsgBox}>
                              <Text style={styles.originalMsgText} selectable>
                                {messageBody}
                              </Text>
                            </View>
                          </View>
                        );
                      }

                      return (
                        <View style={[styles.slipRow, { alignItems: 'flex-start' }]}>
                          <Text style={styles.slipRowLabel}>NOTE</Text>
                          <View style={{ flex: 1, alignItems: 'flex-start', marginLeft: 16 }}>
                            <Text
                              style={[
                                styles.slipRowValue,
                                { textAlign: 'left', lineHeight: 20, fontSize: 13.5, color: '#334155' },
                              ]}
                              selectable
                            >
                              {noteToShow}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}

                    {/* PHOTO OR NO-PHOTO PLACEHOLDER */}
                    {receiptImage ? (
                      <>
                        <View style={styles.slipInnerDash} />
                        <View style={styles.slipPhotoLabelRow}>
                          <Ionicons
                            name="image"
                            size={14}
                            color="#2563EB"
                            style={{ marginRight: 4 }}
                          />
                          <Text style={styles.slipPhotoLabel}>
                            Payment Screenshot / Bill Proof
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setPreviewModalOpen(true)}
                          activeOpacity={0.92}
                          style={styles.slipPhotoWrap}
                        >
                          <Image
                            source={{ uri: receiptImage }}
                            style={[
                              styles.slipPhoto,
                              imageAspectRatio
                                ? { aspectRatio: imageAspectRatio }
                                : { height: 200 },
                            ]}
                            resizeMode="contain"
                          />
                          <View style={styles.slipPhotoExpandPill}>
                            <Ionicons name="expand" size={14} color="#FFFFFF" />
                          </View>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <View style={styles.slipNoPhotoCard}>
                        <View style={styles.slipNoPhotoIcon}>
                          <Ionicons name="image-outline" size={22} color="#64748B" />
                        </View>
                        <View style={styles.slipNoPhotoTextWrap}>
                          <Text style={styles.slipNoPhotoTitle}>
                            No receipt photo attached
                          </Text>
                          <Text style={styles.slipNoPhotoSub}>
                            You can attach bills or screenshots anytime via Edit.
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* SCANNABLE BARCODE */}
                    <View style={styles.slipBarcodeContainer}>
                      <ScannableBarcode value={barcodeValue} width={280} height={50} />
                    </View>
                  </View>

                  {/* FOOTER */}
                  <View style={styles.slipCardFooter}>
                    <View style={styles.slipLogoSection}>
                      <View style={styles.slipLogoIcon}>
                        <Text style={styles.slipLogoText}>₹</Text>
                      </View>
                      <Text style={styles.slipAppName}>Rupeo</Text>
                      <View style={styles.slipVerifiedBadge}>
                        <Ionicons
                          name="checkmark-circle"
                          size={13}
                          color="#10B981"
                          style={{ marginRight: 3 }}
                        />
                        <Text style={styles.slipVerifiedText}>SAVED & VERIFIED</Text>
                      </View>
                    </View>
                    <Text style={styles.slipFooterSubtext}>
                      TRACKED WITH RUPEO • SMART EXPENSE TRACKER
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL('https://rupeoo.vercel.app/scanner').catch(
                          () => {}
                        )
                      }
                      activeOpacity={0.7}
                      style={styles.slipVerifyLinkPill}
                    >
                      <Ionicons
                        name="shield-checkmark"
                        size={11}
                        color="#0F172A"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={styles.slipVerifyLinkText}>
                        Verify: rupeoo.vercel.app/scanner
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              );
            })()}

          {/* ACTION: SHARE RECEIPT */}
          <View style={styles.bottomActionsContainer}>
            <TouchableOpacity
              style={[styles.bottomShareButton, sharingImage && { opacity: 0.75 }]}
              onPress={handleShareReceipt}
              disabled={sharingImage}
              activeOpacity={0.85}
            >
              {sharingImage ? (
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
              ) : (
                <View style={styles.bottomShareIconBg}>
                  <Ionicons name="share-social-outline" size={17} color="#FFFFFF" />
                </View>
              )}
              <Text style={styles.bottomShareText}>
                {sharingImage ? 'Preparing Receipt...' : 'Share Receipt'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* TRANSACTION FOOTER PROMOTIONAL BANNER */}
          <RupeoAdBanner placement="transaction_footer" compact />

        </ScrollView>
        </>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 140 : 160 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {/* TYPE SELECTOR */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'debit' && styles.typeBtnActiveDebit]}
                onPress={() => setType('debit')}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeBtnText, type === 'debit' && styles.typeBtnTextActive]}>
                  {t('expense')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, type === 'credit' && styles.typeBtnActiveCredit]}
                onPress={() => setType('credit')}
                activeOpacity={0.8}
              >
                <Text style={[styles.typeBtnText, type === 'credit' && styles.typeBtnTextActive]}>
                  {t('income')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* AMOUNT CARD */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t('amount')}</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencySymbol}>{currency}</Text>
                <TextInput
                  style={[styles.amountInput, { color: '#1C1C1E' }]}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>

            {/* DETAILS CARD */}
            <View style={styles.card}>
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>{t('payee_merchant')}</Text>
                <TextInput
                  style={[styles.input, { color: '#1C1C1E' }]}
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="e.g. Flat Rent, Jio, Grocery"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>{t('date')}</Text>
                <TextInput
                  style={[styles.input, { color: '#1C1C1E' }]}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Payment Mode</Text>
                <View style={styles.modeRow}>
                  {PAYMENT_MODES.map(pm => {
                    const isSelected =
                      (paymentMode && paymentMode.toLowerCase() === pm.id.toLowerCase()) ||
                      (pm.id === 'Bank' && paymentMode && (paymentMode.toLowerCase() === 'net banking' || paymentMode.toLowerCase() === 'netbanking'));
                    return (
                      <TouchableOpacity
                        key={pm.id}
                        style={[styles.modeChip, isSelected && styles.modeChipActive]}
                        onPress={() => setPaymentMode(pm.id)}
                        activeOpacity={0.7}
                      >
                        <PaymentModeIcon
                          mode={pm.id}
                          size={14}
                          color={isSelected ? '#1C1C1E' : pm.color}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.modeChipText, isSelected && styles.modeChipTextActive]}>
                          {pm.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>{t('category')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                  {categories.map(cat => {
                    const isSelected = category.toLowerCase() === cat.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={cat.id || cat.name}
                        style={[
                          styles.categoryChip,
                          isSelected && { borderColor: cat.color, backgroundColor: cat.color + '15' },
                        ]}
                        onPress={() => setCategory(cat.name)}
                        activeOpacity={0.7}
                      >
                        <CategoryIcon categoryName={cat.name} iconName={cat.icon} size={14} color={cat.color} style={{ marginRight: 4 }} />
                        <Text style={[styles.categoryChipText, isSelected && { color: '#1C1C1E', fontWeight: '800' }]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>{t('description')}</Text>
                <TextInput
                  style={[styles.input, { minHeight: 85, textAlignVertical: 'top', fontSize: 15, lineHeight: 22, color: '#1C1C1E' }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add optional notes..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 350);
                  }}
                />
              </View>
            </View>

            {/* PAYMENT PROOF / SCREENSHOT SECTION (CLEAN ON-DEMAND PREVIEW) */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Payment Proof / Screenshot</Text>

              {receiptImage ? (
                <View>
                  <TouchableOpacity
                    style={styles.proofPillCard}
                    onPress={() => setPreviewModalOpen(true)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.proofPillLeft}>
                      <View style={styles.proofThumbWrap}>
                        <Image source={{ uri: receiptImage }} style={styles.proofThumbnail} resizeMode="cover" />
                        <View style={styles.proofZoomIcon}>
                          <Ionicons name="expand" size={10} color="#FFFFFF" />
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.proofPillTitle}>1 Screenshot Attached</Text>
                      </View>
                    </View>

                    <View style={styles.proofViewBadge}>
                      <Ionicons name="eye-outline" size={14} color="#2563EB" style={{ marginRight: 4 }} />
                      <Text style={styles.proofViewText}>View</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.proofActionRow}>
                    <TouchableOpacity style={styles.changeProofBtn} onPress={pickImage} activeOpacity={0.7}>
                      <Ionicons name="swap-horizontal" size={14} color="#2563EB" style={{ marginRight: 4 }} />
                      <Text style={styles.changeProofBtnText}>Replace Screenshot</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.removeProofBtn}
                      onPress={() => setReceiptImage(null)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                      <Text style={styles.removeProofBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadProofBtn} onPress={pickImage} activeOpacity={0.7}>
                  <Ionicons name="image-outline" size={20} color="#2563EB" style={{ marginRight: 8 }} />
                  <Text style={styles.uploadProofText}>+ Attach Payment Screenshot / Receipt</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* SAVE BUTTON */}
            <TouchableOpacity
              style={[styles.saveButton, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#1C1C1E" />
              ) : (
                <Text style={styles.saveButtonText}>{t('save_changes')}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}





      {/* FULLSCREEN IMAGE PREVIEW MODAL */}
      <Modal visible={previewModalOpen} transparent animationType="fade" onRequestClose={() => setPreviewModalOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalTopBar}>
            <Text style={styles.modalTopTitle}>Payment Screenshot</Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setPreviewModalOpen(false)} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.modalImageContainer}
            activeOpacity={1}
            onPress={() => setPreviewModalOpen(false)}
          >
            {receiptImage && (
              <Image source={{ uri: receiptImage }} style={styles.modalImage} resizeMode="contain" />
            )}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      <ConfirmDialogModal
        visible={deleteConfirmVisible}
        title="Delete Transaction"
        message="Are you sure you want to permanently delete this transaction? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmVisible(false)}
      />

      {/* CATEGORY BOTTOM SHEET */}
      <CategorySheet
        visible={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        currentCategory={category}
        merchantName={merchant || description}
        userId={user?.uid}
        onSelectCategory={async (newCat, applyToAll) => {
          setCategory(newCat);
          if (!isEditing && user?.uid && id) {
            try {
              await updateTransaction(user.uid, id, { category: newCat });
              Toast.show({
                type: 'success',
                text1: 'Category Updated',
                text2: `Changed category to ${newCat}`,
                visibilityTime: 2000,
              });
            } catch (err) {
              warn('Failed to update category directly:', err);
            }
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    marginHorizontal: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  boldEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD740',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  boldEditText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deleteIconButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  bottomActionsContainer: {
    width: '100%',
    marginTop: 16,
    marginBottom: 10,
  },
  bottomShareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 3,
    alignSelf: 'center',
    width: '100%',
  },
  bottomShareIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  bottomShareText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  editButtonBg: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  shareButtonBg: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  shareButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteButtonBg: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    padding: 20,
    paddingBottom: 160,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  receiptContent: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  bgOrb1: {
    position: 'absolute',
    top: 50,
    left: -40,
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  bgOrb2: {
    position: 'absolute',
    top: 260,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  bgOrb3: {
    position: 'absolute',
    bottom: 80,
    left: -30,
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  barcodeSection: {
    marginTop: 18,
    marginBottom: 4,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'center',
  },
  barcodeLinesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3.5,
    height: 32,
    marginBottom: 6,
  },
  barcodeBar: {
    borderRadius: 1,
  },
  barcodeText: {
    fontSize: 9.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.5,
  },


  /* GRADIENT SLIP RECEIPT CARD STYLES */
  slipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  slipCardTop: {
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  slipBlob1: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: -30,
    right: -30,
  },
  slipBlob2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -30,
    left: -30,
  },
  slipWatermark: {
    position: 'absolute',
    top: 14,
    right: 18,
    opacity: 0.22,
  },
  slipWatermarkText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2.2,
  },
  slipCardIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  slipCardAmount: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -1,
  },
  slipCardMerchant: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.92)',
    marginBottom: 10,
    textAlign: 'center',
  },
  slipCardStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  slipCardStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  slipCardStatusText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  slipNotchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: -10,
    marginBottom: 4,
    zIndex: 2,
  },
  slipNotchLeft: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    marginLeft: -10,
  },
  slipNotchDash: {
    flex: 1,
    height: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginHorizontal: 8,
  },
  slipNotchRight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    marginRight: -10,
  },
  slipCardBody: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
  },
  slipRefLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  slipRefLine: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  slipSecureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  slipSecureTagText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.5,
  },
  slipSummaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  slipSummaryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  slipSummaryIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  slipSummaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  slipSummaryValue: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  slipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  slipRowLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  slipRowValue: {
    fontSize: 14.5,
    color: '#1C1C1E',
    fontWeight: '800',
  },
  slipRowValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  originalMsgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  originalMsgBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#2563EB',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  originalMsgBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  originalMsgText: {
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'left',
  },
  slipInnerDash: {
    height: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginTop: 16,
    marginBottom: 14,
  },
  slipPhotoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  slipPhotoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  slipPhotoWrap: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  slipPhoto: {
    width: '100%',
    maxHeight: 280,
  },
  slipPhotoExpandPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.72)',
  },
  slipNoPhotoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  slipNoPhotoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  slipNoPhotoTextWrap: {
    flex: 1,
  },
  slipNoPhotoTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  slipNoPhotoSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  slipBarcodeContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  slipBarcodeFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  slipBarcodeGreenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  slipBarcodeFooterText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.6,
  },
  slipCardFooter: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  slipLogoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  slipLogoIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FFD740',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    shadowColor: '#FFD740',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  slipLogoText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  slipAppName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1C1C1E',
    marginRight: 10,
    letterSpacing: 0.5,
  },
  slipVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  slipVerifiedText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.4,
  },
  slipFooterSubtext: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 10,
    textAlign: 'center',
  },
  slipVerifyLinkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  slipVerifyLinkText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  typeBtnActiveDebit: {
    backgroundColor: '#EF4444',
  },
  typeBtnActiveCredit: {
    backgroundColor: '#10B981',
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  typeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1C1C1E',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '900',
    color: '#1C1C1E',
    padding: 0,
  },
  formGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 8,
  },
  modeChipActive: {
    backgroundColor: '#FFD740',
    borderColor: '#FFD740',
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modeChipTextActive: {
    color: '#1C1C1E',
    fontWeight: '800',
  },
  categoryScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  proofPillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 10,
  },
  proofPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  proofThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  proofThumbnail: {
    width: '100%',
    height: '100%',
  },
  proofZoomIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 2,
  },
  proofPillTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  proofPillSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  proofViewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  proofViewText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  proofActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  changeProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  changeProofBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  removeProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  removeProofBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  uploadProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
  },
  uploadProofText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  saveButton: {
    backgroundColor: '#FFD740',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  modalTopTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalBottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  modalReplaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalReplaceBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  verifyPillSlip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  verifyPillSlipText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  linkedBillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  linkedBillBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  unlinkBillBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unlinkBillBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
});
