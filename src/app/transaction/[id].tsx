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
import { useAuth } from '@/context/AuthContext';
import { RupeoAdBanner } from '@/lib/ads';
import {
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getUserCategories,
  CategoryItem,
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

  useEffect(() => {
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
          setMerchant(tx.merchant_name || '');
          setDescription(tx.description || '');
          setDate(tx.date || getLocalDateString());
          setTime(tx.time || '');
          setCategory(tx.category || 'Food');
          setPaymentMode(tx.payment_mode || 'Cash');
          setReceiptImage(tx.receipt_image || tx.receiptImage || null);

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
        console.error('Error fetching transaction details:', err);
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
      console.warn('Error picking image:', err);
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
        description: description.trim(),
        date,
        category,
        payment_mode: paymentMode,
        receipt_image: receiptImage || null,
      });

      Toast.show({ type: 'success', text1: 'Saved', text2: 'Transaction updated successfully.' });
      safeGoBack(router);
    } catch (err) {
      console.error('Error saving transaction:', err);
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
      console.error('Error deleting transaction:', err);
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
      `Date: ${date || 'Not set'}${time ? ` at ${formatTime12Hour(time)}` : ''}`,
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

        // 1. Android: Use native RupeoShare to send BOTH receipt image and text together
        if (Platform.OS === 'android' && NativeModules.RupeoShare?.shareImageAndText) {
          try {
            await NativeModules.RupeoShare.shareImageAndText(
              uri,
              receiptText,
              `Rupeo Receipt (${formattedAmt})`
            );
            return;
          } catch (nativeErr) {
            console.warn('Native RupeoShare receipt error:', nativeErr);
          }
        }

        // 2. iOS: Share.share handles message + url (image)
        if (Platform.OS === 'ios') {
          try {
            await Share.share({
              message: receiptText,
              url: uri,
            });
            return;
          } catch (iosErr) {
            console.warn('iOS share error, falling back to expo-sharing:', iosErr);
          }
        }

        // 3. Fallback to standard sharing
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Rupeo Receipt (${formattedAmt})`,
            UTI: 'public.png',
          });
          return;
        }
      }

      // Fallback for Web or if native sharing is unavailable
      await Share.share({
        title: `Rupeo Transaction Receipt - ${formattedAmt}`,
        message: receiptText,
      });
    } catch (err) {
      console.error('Error sharing receipt:', err);
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
          <View style={[styles.receiptCard, { backgroundColor: '#FFFFFF' }]}>
            <View style={[styles.receiptCardTop, { backgroundColor: '#F0EEE7', height: 180, alignItems: 'center', justifyContent: 'center' }]}>
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

          {/* ANIMATED RECEIPT CARD */}
          <Animated.View
            ref={receiptCardRef}
            collapsable={false}
            style={[
              styles.receiptCard,
              {
                opacity: cardOpacityAnim,
                transform: [
                  { translateY: cardSlideAnim },
                  {
                    scale: cardOpacityAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1]
                    })
                  }
                ]
              }
            ]}
          >

            {/* GRADIENT TOP BANNER */}
            <LinearGradient
              colors={
                type === 'credit'
                  ? ['#064E3B', '#047857', '#10B981']
                  : ['#7F1D1D', '#991B1B', '#DC2626']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.receiptCardTop}
            >
              {/* Decorative blob circles */}
              <View style={[styles.receiptBlob1, {
                backgroundColor: type === 'credit' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'
              }]} />
              <View style={[styles.receiptBlob2, {
                backgroundColor: type === 'credit' ? 'rgba(16,185,129,0.15)' : 'rgba(255,215,64,0.18)'
              }]} />

              {/* Rupeo watermark */}
              <Animated.View
                style={[
                  styles.receiptWatermark,
                  {
                    opacity: cardOpacityAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.15]
                    })
                  }
                ]}
              >
                <Text style={styles.receiptWatermarkText}>RUPEO</Text>
              </Animated.View>

              {/* HERO ARROW ICON BADGE (CLEAN & STATIC) */}
              <Animated.View
                style={[
                  styles.receiptCardIcon,
                  {
                    backgroundColor: type === 'credit' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.22)',
                    borderColor: type === 'credit' ? '#34D399' : 'rgba(255, 255, 255, 0.45)',
                    borderWidth: 2,
                    transform: [
                      { scale: logoScaleAnim }
                    ]
                  }
                ]}
              >
                <Ionicons
                  name={type === 'credit' ? 'arrow-down' : 'arrow-up'}
                  size={30}
                  color="#FFFFFF"
                />
              </Animated.View>

              {/* BIG FORMATTED AMOUNT */}
              <Animated.Text
                style={[
                  styles.receiptCardAmount,
                  {
                    color: type === 'credit' ? '#6EE7B7' : '#FFFFFF',
                    transform: [{ scale: amountBounceAnim }]
                  }
                ]}
              >
                {type === 'debit' ? '−' : '+'}{currency}{parseFloat(amount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Animated.Text>
              
              <Text style={styles.receiptCardMerchant}>{merchant || 'Transaction'}</Text>
              
              <View style={styles.receiptCardStatusChip}>
                <View style={[styles.receiptCardStatusDot, { backgroundColor: type === 'credit' ? '#34D399' : '#10B981' }]} />
                <Text style={styles.receiptCardStatusText}>TRANSACTION SUCCESSFUL</Text>
              </View>
            </LinearGradient>

            {/* NOTCH DIVIDER */}
            <View style={styles.receiptNotchRow}>
              <View style={styles.receiptNotchLeft} />
              <View style={styles.receiptNotchDash} />
              <View style={styles.receiptNotchRight} />
            </View>

            {/* DETAILS */}
            <View style={styles.receiptCardBody}>
              <View style={styles.receiptRefLineRow}>
                <Text style={styles.receiptRefLine}>RUPEO TXN · {(id as string || '').slice(0, 12).toUpperCase()}</Text>
                <View style={styles.secureTag}>
                  <Ionicons name="shield-checkmark" size={11} color="#059669" style={{ marginRight: 3 }} />
                  <Text style={styles.secureTagText}>VERIFIED</Text>
                </View>
              </View>

              <View style={styles.receiptSummaryGrid}>
                <View style={styles.receiptSummaryItem}>
                  <View style={[styles.receiptSummaryIcon, { backgroundColor: '#EFF6FF' }]}>
                    <ExpoImage
                      source={{ uri: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Calendar.png' }}
                      style={{ width: 18, height: 18 }}
                      contentFit="contain"
                    />
                  </View>
                  <View>
                    <Text style={styles.receiptSummaryLabel}>DATE</Text>
                    <Text style={styles.receiptSummaryValue}>{date || 'Not set'}</Text>
                  </View>
                </View>
                
                <View style={styles.receiptSummaryItem}>
                  <View style={[styles.receiptSummaryIcon, { backgroundColor: '#ECFDF5' }]}>
                    <ExpoImage
                      source={{ uri: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Sun.png' }}
                      style={{ width: 18, height: 18 }}
                      contentFit="contain"
                    />
                  </View>
                  <View>
                    <Text style={styles.receiptSummaryLabel}>TIME</Text>
                    <Text style={styles.receiptSummaryValue}>{time ? formatTime12Hour(time) : 'Recorded'}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptRowLabel}>Category</Text>
                <View style={styles.receiptRowValueContainer}>
                  {(() => {
                    const catObj = categories.find(c => c.name.toLowerCase() === category.toLowerCase());
                    return <CategoryIcon categoryName={catObj?.name || category} iconName={catObj?.icon || 'receipt-outline'} size={18} color={catObj?.color || '#3B82F6'} />;
                  })()}
                  <Text style={styles.receiptRowValue}>{category}</Text>
                </View>
              </View>

              <View style={styles.receiptRow}>
                <Text style={styles.receiptRowLabel}>Payment Mode</Text>
                <View style={styles.receiptRowValueContainer}>
                  {(() => {
                    const modeObj = PAYMENT_MODES.find(m => m.id === paymentMode);
                    return <PaymentModeIcon mode={modeObj?.id || paymentMode} size={16} color={modeObj?.color || '#7C3AED'} />;
                  })()}
                  <Text style={styles.receiptRowValue}>{paymentMode}</Text>
                </View>
              </View>

              {description ? (
                <View style={[styles.receiptRow, { alignItems: 'flex-start' }]}>
                  <Text style={styles.receiptRowLabel}>Note / Memo</Text>
                  <Text style={[styles.receiptRowValue, { flex: 1, textAlign: 'right', lineHeight: 20 }]}>{description}</Text>
                </View>
              ) : null}

              {/* PHOTO SECTION */}
              {receiptImage && (
                <>
                  <View style={styles.receiptInnerDash} />
                  <View style={styles.receiptPhotoLabelRow}>
                    <Ionicons name="image" size={14} color="#2563EB" style={{ marginRight: 4 }} />
                    <Text style={styles.receiptPhotoLabel}>Payment Screenshot / Bill Proof</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPreviewModalOpen(true)}
                    activeOpacity={0.92}
                    style={styles.receiptPhotoWrap}
                  >
                    <Image
                      source={{ uri: receiptImage }}
                      style={[
                        styles.receiptPhoto,
                        imageAspectRatio ? { aspectRatio: imageAspectRatio } : { height: 200 },
                      ]}
                      resizeMode="contain"
                    />
                    <View style={styles.receiptPhotoExpandPill}>
                      <Ionicons name="expand" size={14} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                </>
              )}

              {!receiptImage && (
                <View style={styles.receiptNoPhoto}>
                  <View style={styles.receiptNoPhotoIcon}>
                    <Ionicons name="image-outline" size={20} color="#64748B" />
                  </View>
                  <View style={styles.receiptNoPhotoTextWrap}>
                    <Text style={styles.receiptNoPhotoTitle}>No receipt photo attached</Text>
                    <Text style={styles.receiptNoPhotoSub}>You can attach bills or screenshots anytime via Edit.</Text>
                  </View>
                </View>
              )}

              {/* AUTHENTIC FINTECH SCANNABLE CODE 39 BARCODE */}
              <ScannableBarcode value={barcodeValue} width={280} height={50} />
            </View>

            {/* CARD FOOTER WITH RUPEO BRANDING */}
            <View style={styles.receiptCardFooter}>
              <Animated.View
                style={[
                  styles.rupeoLogoSection,
                  {
                    opacity: cardOpacityAnim,
                    transform: [{
                      translateY: cardOpacityAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0]
                      })
                    }]
                  }
                ]}
              >
                <Animated.View
                  style={[
                    styles.rupeoLogoIcon,
                    {
                      transform: [{ scale: logoScaleAnim }]
                    }
                  ]}
                >
                  <Text style={styles.rupeoLogoText}>₹</Text>
                </Animated.View>
                <Text style={styles.rupeoAppName}>Rupeo</Text>
                <Animated.View
                  style={[
                    styles.verifiedBadge,
                    {
                      opacity: cardOpacityAnim,
                      transform: [{
                        scale: cardOpacityAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1]
                        })
                      }]
                    }
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={13} color="#10B981" style={{ marginRight: 3 }} />
                  <Text style={styles.verifiedText}>Saved & Verified</Text>
                </Animated.View>
              </Animated.View>
              <Animated.Text
                style={[
                  styles.receiptFooterSubtext,
                  {
                    opacity: cardOpacityAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.7]
                    })
                  }
                ]}
              >
                Tracked with Rupeo • Smart Expense Tracker
              </Animated.Text>
              <TouchableOpacity
                onPress={() => Linking.openURL('https://rupeoo.vercel.app/scanner').catch(() => {})}
                activeOpacity={0.7}
                style={styles.verifyPillSlip}
              >
                <Ionicons name="shield-checkmark" size={10} color="#0F172A" style={{ marginRight: 3.5 }} />
                <Text style={styles.verifyPillSlipText}>
                  Verify: rupeoo.vercel.app/scanner
                </Text>
              </TouchableOpacity>
            </View>

          </Animated.View>

          {/* SHIFTED SHARE RECEIPT BUTTON */}
          <TouchableOpacity
            style={[styles.bottomShareButton, sharingImage && { opacity: 0.75 }]}
            onPress={handleShareReceipt}
            disabled={sharingImage}
            activeOpacity={0.85}
          >
            {sharingImage ? (
              <ActivityIndicator size="small" color="#0F172A" style={{ marginRight: 8 }} />
            ) : (
              <View style={styles.bottomShareIconBg}>
                <Ionicons name="share-social-outline" size={16} color="#0F172A" />
              </View>
            )}
            <Text style={styles.bottomShareText}>
              {sharingImage ? 'Generating Receipt ...' : 'Share Receipt'}
            </Text>
          </TouchableOpacity>

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
                  {PAYMENT_MODES.map(pm => (
                    <TouchableOpacity
                      key={pm.id}
                      style={[styles.modeChip, paymentMode === pm.id && styles.modeChipActive]}
                      onPress={() => setPaymentMode(pm.id)}
                      activeOpacity={0.7}
                    >
                      <PaymentModeIcon
                        mode={pm.id}
                        size={14}
                        color={paymentMode === pm.id ? '#1C1C1E' : pm.color}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.modeChipText, paymentMode === pm.id && styles.modeChipTextActive]}>
                        {pm.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
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
    borderRadius: 0,
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
    borderRadius: 0,
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
  bottomShareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 0,
    marginTop: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
    alignSelf: 'center',
    width: '100%',
  },
  bottomShareIconBg: {
    width: 28,
    height: 28,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bottomShareText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF4FF',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  editButtonBg: {
    width: 26,
    height: 26,
    borderRadius: 0,
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
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  shareButtonBg: {
    width: 26,
    height: 26,
    borderRadius: 0,
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
    borderRadius: 0,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteButtonBg: {
    width: 26,
    height: 26,
    borderRadius: 0,
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
  receiptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  receiptCardTop: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  receiptWatermark: {
    position: 'absolute',
    top: 16,
    right: 20,
    opacity: 0.15,
  },
  receiptWatermarkText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  receiptBlob1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -60,
    right: -50,
  },
  receiptBlob2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -30,
    left: -30,
  },
  receiptCardIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  receiptCardAmount: {
    fontSize: 42,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: -1,
  },
  receiptCardMerchant: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
    textAlign: 'center',
  },
  receiptCardDate: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  receiptCardStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  receiptCardStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 0,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  receiptCardStatusText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  receiptNotchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  receiptNotchLeft: {
    width: 20,
    height: 20,
    borderRadius: 0,
    backgroundColor: '#F1F5F9',
    marginLeft: -10,
  },
  receiptNotchDash: {
    flex: 1,
    height: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginHorizontal: 8,
  },
  receiptNotchRight: {
    width: 20,
    height: 20,
    borderRadius: 0,
    backgroundColor: '#F1F5F9',
    marginRight: -10,
  },
  receiptCardBody: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
  },
  receiptRefLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  receiptRefLine: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  secureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  secureTagText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.5,
  },
  receiptSummaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  receiptSummaryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  receiptSummaryIcon: {
    width: 30,
    height: 30,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  receiptSummaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  receiptSummaryValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  receiptRowLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  receiptRowValue: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '800',
  },
  receiptRowValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  receiptInnerDash: {
    height: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    marginTop: 16,
    marginBottom: 14,
  },
  receiptNoPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    borderRadius: 0,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  receiptNoPhotoIcon: {
    width: 38,
    height: 38,
    borderRadius: 0,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  receiptNoPhotoTextWrap: {
    flex: 1,
  },
  receiptNoPhotoTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  receiptNoPhotoSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 3,
  },
  receiptPhotoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  receiptPhotoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  receiptPhotoWrap: {
    width: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  receiptPhoto: {
    width: '100%',
    maxHeight: 280,
  },
  receiptPhotoExpandPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.72)',
  },
  receiptCardFooter: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  rupeoLogoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rupeoLogoIcon: {
    width: 24,
    height: 24,
    borderRadius: 0,
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
  rupeoLogoText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  rupeoAppName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1C1C1E',
    marginRight: 10,
    letterSpacing: 0.5,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
    marginLeft: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  receiptFooterSubtext: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  receiptFooterText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 0,
    padding: 4,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
    paddingVertical: 14,
  },
  uploadProofText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  saveButton: {
    backgroundColor: '#FFD740',
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
});
