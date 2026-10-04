/**
 * premium.tsx — Clean & Modern Rupeo Pro Subscription Screen
 *
 * Designed with a clean, distraction-free aesthetic:
 *   - Clear, punchy core benefits (Ad-free, Unlimited Statements, Reminders, Custom Categories)
 *   - Beautiful, high-contrast plan comparison cards
 *   - Real prices from Google Play with robust fallback
 *   - 1-tap restore and seamless upgrade/switch handling
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';

import {
  initIAP,
  destroyIAP,
  getSubscriptionPlans,
  purchaseSubscription,
  restorePurchases,
  verifyAndActivatePurchase,
  getActiveSubscription,
  setPurchaseCallbacks,
  ErrorCode,
  type SubscriptionPlan,
  type Purchase,
  type PurchaseError,
} from '@/lib/iap';
import { useAuth } from '@/context/AuthContext';
import { validateCoupon, redeemCoupon, CouponItem } from '@/lib/database';

// ─── Core Benefits ────────────────────────────────────────────────────────────

const KEY_BENEFITS = [
  {
    icon: 'ban-outline' as const,
    iconColor: '#EF4444',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    title: '100% Ad-Free Experience',
    desc: 'Bina kisi ads, banner ya popup ke tez aur clean experience.',
  },
  {
    icon: 'document-text-outline' as const,
    iconColor: '#0EA5E9',
    iconBg: 'rgba(14, 165, 233, 0.12)',
    title: 'Unlimited PDF & Excel Statements',
    desc: 'Apne transactions ke full multi-page PDF reports unlimited download karein.',
  },
  {
    icon: 'notifications-outline' as const,
    iconColor: '#3B82F6',
    iconBg: 'rgba(59, 130, 246, 0.12)',
    title: 'Unlimited Bill & EMI Reminders',
    desc: 'Jitne chahein utne bill, recharge aur EMI reminders bina kisi limit ke add karein.',
  },
  {
    icon: 'apps-outline' as const,
    iconColor: '#8B5CF6',
    iconBg: 'rgba(139, 92, 246, 0.12)',
    title: 'Unlimited Custom Categories',
    desc: 'Apni zaroorat ke hisaab se jitne chahein naye custom categories aur icons banayein.',
  },
];

// ─── Price Parser Helper ───────────────────────────────────────────────────────
function extractPrice(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/,/g, '.');
  const match = cleaned.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? 0 : Math.round(num);
  }
  return 0;
}

function getPlanPricing(priceStr: string, coupon?: CouponItem | null) {
  const rawPrice = extractPrice(priceStr);
  let discountAmount = 0;
  let badgeText = '';

  if (coupon && !coupon.isFree) {
    const flat = Number(coupon.discountAmount);
    const pct = Number(coupon.discountPercent);

    if (flat && !isNaN(flat) && flat > 0) {
      discountAmount = Math.min(flat, rawPrice);
      badgeText = `₹${flat} FLAT OFF APPLIED`;
    } else if (pct && !isNaN(pct) && pct > 0) {
      discountAmount = Math.round((rawPrice * pct) / 100);
      badgeText = `${pct}% OFF APPLIED`;
    }
  }

  const finalPrice = Math.max(0, rawPrice - discountAmount);
  return {
    rawPrice,
    discountAmount,
    finalPrice,
    hasDiscount: discountAmount > 0,
    badgeText,
  };
}

// ─── Plan Card Component ──────────────────────────────────────────────────────

interface PlanCardProps {
  plan: SubscriptionPlan;
  isSelected: boolean;
  isCurrent: boolean;
  appliedCoupon?: CouponItem | null;
  onPress: () => void;
}

function CleanPlanCard({ plan, isSelected, isCurrent, appliedCoupon, onPress }: PlanCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { rawPrice, discountAmount, finalPrice, hasDiscount, badgeText } = getPlanPricing(plan.price, appliedCoupon);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.98, duration: 80, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.88}
        accessibilityLabel={`Select ${plan.label} plan at ${hasDiscount ? `₹${finalPrice}` : plan.price}`}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        style={[
          styles.planCard,
          isSelected && styles.planCardSelected,
        ]}
      >
        {/* Top Badge (if any or discount badge) */}
        {hasDiscount ? (
          <View style={[styles.planBadge, styles.planBadgeDiscount]}>
            <Text style={styles.planBadgeDiscountText}>{badgeText}</Text>
          </View>
        ) : plan.badge ? (
          <View style={[styles.planBadge, isSelected ? styles.planBadgeActive : styles.planBadgeDefault]}>
            <Text style={[styles.planBadgeText, isSelected && styles.planBadgeTextActive]}>
              {plan.badge}
            </Text>
          </View>
        ) : null}

        <View style={styles.planCardBody}>
          {/* Radio Indicator */}
          <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
            {isSelected && <Ionicons name="checkmark" size={13} color="#0B0F19" />}
          </View>

          {/* Plan Info */}
          <View style={styles.planDetails}>
            <View style={styles.planNameRow}>
              <Text style={[styles.planTitle, isSelected && styles.planTitleSelected]}>
                {plan.label}
              </Text>
              {isCurrent && (
                <View style={styles.currentPlanPill}>
                  <Text style={styles.currentPlanPillText}>Current Plan</Text>
                </View>
              )}
            </View>
            <Text style={styles.planDurationText}>{plan.duration} access</Text>
          </View>

          {/* Pricing Block */}
          <View style={styles.planPriceBlock}>
            {hasDiscount ? (
              <>
                <Text style={styles.planOriginalPriceStrike}>₹{rawPrice}</Text>
                <Text style={[styles.planPriceText, styles.planPriceTextDiscounted]}>
                  ₹{finalPrice}
                </Text>
                <Text style={styles.planDiscountSavedText}>
                  Save ₹{discountAmount}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.planPriceText, isSelected && styles.planPriceTextSelected]}>
                  {plan.price}
                </Text>
                <Text style={[styles.planPerMonthText, isSelected && styles.planPerMonthTextSelected]}>
                  {plan.perMonth}
                </Text>
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PremiumScreen() {
  const router = useRouter();
  const { user, upgradeToPremium, refreshUser, appConfig } = useAuth();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>('yearly');
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ─── Initialize ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      setLoading(true);
      setErrorMsg(null);

      setPurchaseCallbacks(
        async (purchase: Purchase) => {
          if (!mounted) return;
          await onPurchaseSuccess(purchase);
        },
        (err: PurchaseError) => {
          if (!mounted) return;
          setPurchasing(false);
          onPurchaseError(err);
        },
      );

      try {
        await Promise.race([
          initIAP(),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
        if (!mounted) return;

        const [fetchedPlans, activeSub] = await Promise.all([
          getSubscriptionPlans().catch(() => []),
          user?.uid ? getActiveSubscription(user.uid).catch(() => null) : Promise.resolve(null),
        ]);

        if (!mounted) return;

        if (fetchedPlans && fetchedPlans.length > 0) {
          setPlans(fetchedPlans);
        }

        if (activeSub) {
          setCurrentPlanId(activeSub.basePlanId);
          setCurrentToken(activeSub.purchaseToken);
          setSelectedPlan(activeSub.basePlanId);
        }
      } catch (err) {
        console.warn('[premium] init warning:', err);
      } finally {
        if (mounted) {
          setLoading(false);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: Platform.OS !== 'web',
          }).start();
        }
      }
    };

    setup();

    return () => {
      mounted = false;
      destroyIAP();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Purchase Success ───────────────────────────────────────────────────────
  const onPurchaseSuccess = async (purchase: Purchase) => {
    try {
      const basePlanId = await verifyAndActivatePurchase(
        purchase,
        user?.uid ?? '',
        currentPlanId ?? undefined,
      );
      await upgradeToPremium(basePlanId);
      if (appliedCoupon && user?.uid) {
        await redeemCoupon(appliedCoupon.code, user.uid).catch(() => { });
      }
      await refreshUser();
      setPurchasing(false);
      setCurrentPlanId(basePlanId);
      setCurrentToken(purchase.purchaseToken ?? null);

      Toast.show({
        type: 'success',
        text1: '🎉 Welcome to Rupeo Pro!',
        text2: 'Aapke sabhi premium features turant unlock ho gaye hain.',
        visibilityTime: 4000,
      });

      setTimeout(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)/dashboard');
      }, 1000);
    } catch (err: any) {
      setPurchasing(false);
      setErrorMsg('Purchase verify ho gaya par profile sync mein thoda waqt lag raha hai.');
    }
  };

  // ─── Purchase Error ─────────────────────────────────────────────────────────
  const onPurchaseError = (err: PurchaseError) => {
    switch (err.code) {
      case ErrorCode.UserCancelled:
        // Silent — user intentionally closed sheet
        break;
      case ErrorCode.AlreadyOwned:
        Toast.show({
          type: 'info',
          text1: 'Already Subscribed',
          text2: 'Aapke paas already subscription hai. Restore button dabayein.',
        });
        break;
      case ErrorCode.BillingUnavailable:
        setErrorMsg('Google Play Billing is currently unavailable.');
        break;
      default:
        setErrorMsg(err.message || 'Payment complete nahi ho paya. Dobara koshish karein.');
    }
  };

  // ─── Subscribe Handler ─────────────────────────────────────────────────────
  const handleSubscribe = useCallback(async () => {
    if (!user?.uid) {
      Toast.show({ type: 'error', text1: 'Login Required', text2: 'Kripya pehle login karein.' });
      Alert.alert('Login Required', 'Kripya subscribe karne ke liye login karein.');
      return;
    }

    const plan = plans.find((p) => p.planId === selectedPlan);
    if (!plan) {
      setErrorMsg('Selected plan filhal available nahi hai.');
      return;
    }

    // If already on the same plan
    if (currentPlanId === selectedPlan) {
      Alert.alert(
        'Already Active',
        `Aap pehle se hi ${plan.label} plan par hain. Kya aap plan restore karna chahte hain?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore', onPress: () => handleRestore() },
        ],
      );
      return;
    }

    if (!plan.offerToken) {
      const msg = Platform.OS === 'android'
        ? 'Google Play connection missing. Real Android device pe signed build / internal testing APK se test karein.'
        : 'Google Play Billing sirf Android device (APK / EAS build) pe chalta hai. Web browser pe test nahi ho sakta.';
      setErrorMsg(msg);
      Toast.show({
        type: 'info',
        text1: 'Google Play Required',
        text2: msg,
        visibilityTime: 5000,
      });
      Alert.alert('Google Play Required', msg);
      return;
    }

    // Switch plan confirm
    if (currentPlanId) {
      const confirm = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Switch Plan',
          `Aap ${currentPlanId} se ${plan.label} (${plan.price}) pe switch kar rahe hain.\n\nGoogle Play bache hue dinon ka proration turant adjust karega.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Confirm Switch', onPress: () => resolve(true) },
          ],
        );
      });
      if (!confirm) return;
    }

    setPurchasing(true);
    setErrorMsg(null);

    try {
      await purchaseSubscription(plan, user.uid, currentToken ?? undefined);
    } catch (err: any) {
      setPurchasing(false);
      if (!err.message?.toLowerCase().includes('cancel') && !err.message?.toLowerCase().includes('user')) {
        setErrorMsg(err.message || 'Purchase shuru nahi ho saka.');
      }
    }
  }, [plans, selectedPlan, user, currentPlanId, currentToken]);

  // ─── Restore Handler ───────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (!user?.uid) return;
    setRestoring(true);
    setErrorMsg(null);

    try {
      const restored = await restorePurchases(user.uid);
      setRestoring(false);

      if (restored) {
        const plan = restored.currentPlanId ?? 'monthly';
        await upgradeToPremium(plan);
        await refreshUser();
        setCurrentPlanId(plan);
        setCurrentToken(restored.purchaseToken ?? null);
        Toast.show({
          type: 'success',
          text1: 'Subscription Restored! 🎉',
          text2: `Aapka ${plan} plan wapas active ho gaya hai.`,
        });
      } else {
        Toast.show({
          type: 'info',
          text1: 'No Active Subscription',
          text2: 'Is Google account pe koi active subscription nahi mila.',
        });
      }
    } catch (err: any) {
      setRestoring(false);
      Toast.show({ type: 'error', text1: 'Restore Failed', text2: err?.message || 'Error occurred.' });
    }
  }, [user, upgradeToPremium, refreshUser]);

  // ─── Coupon Code & Discount Handler ─────────────────────────────────────────
  const [couponCode, setCouponCode] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccess, setCouponSuccess] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponItem | null>(null);

  const selectedPlanData = plans.find((p) => p.planId === selectedPlan);
  const isCurrentlySamePlan = currentPlanId === selectedPlan;

  // Selected Plan Pricing Calculations
  const selectedPricing = getPlanPricing(selectedPlanData?.price || '99', appliedCoupon);
  const selectedRawPrice = selectedPricing.rawPrice;
  const selectedDiscount = selectedPricing.discountAmount;
  const selectedFinalPrice = selectedPricing.finalPrice;
  const isDiscountApplied = selectedPricing.hasDiscount;

  const handleApplyCoupon = async () => {
    if (!user?.uid) {
      Toast.show({
        type: 'error',
        text1: 'Login Required',
        text2: 'Kripya coupon apply karne ke liye login karein.',
      });
      return;
    }

    const clean = couponCode.trim().toUpperCase();
    if (!clean) return;

    setApplyingCoupon(true);
    setCouponError(null);
    setCouponSuccess(null);

    try {
      const res = await validateCoupon(clean, selectedRawPrice, user.uid, selectedPlan);
      if (!res.valid) {
        setCouponError(res.error || 'Invalid or inactive coupon code.');
        return;
      }

      // Check if truly 100% Free or Discount
      const isTrulyFree = Boolean(res.coupon?.isFree) && !res.coupon?.discountAmount;
      if (isTrulyFree || (res.coupon?.discountPercent === 100 && !res.coupon?.discountAmount)) {
        // 100% Free Coupon -> Activate immediately
        const planToActivate = res.coupon?.plan && res.coupon?.plan !== 'all' ? res.coupon.plan : 'lifetime';
        await upgradeToPremium(planToActivate);
        await redeemCoupon(clean, user.uid);
        await refreshUser();

        setCouponSuccess(`🎉 Code "${clean}" applied! Pro unlocked (${planToActivate.toUpperCase()}).`);
        Toast.show({
          type: 'success',
          text1: '🎉 Coupon Applied Successfully!',
          text2: `Welcome to Rupeo Pro (${planToActivate.toUpperCase()})!`,
          visibilityTime: 4000,
        });

        setTimeout(() => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/dashboard');
        }, 1500);
      } else {
        // Discount Coupon (Flat ₹ Off or % Discount) -> Save in state and let user pay discounted amount via Google Play!
        setAppliedCoupon(res.coupon || null);
        const discountLabel = res.coupon?.discountAmount
          ? `Flat ₹${res.coupon.discountAmount} OFF`
          : `${res.coupon?.discountPercent}% OFF`;

        setCouponSuccess(
          `🎉 Coupon "${clean}" applied! (${discountLabel}). Neeche "Continue with Google Play" dabakar subscribe karein.`
        );
        Toast.show({
          type: 'success',
          text1: `${discountLabel} Code Applied! 🎉`,
          text2: 'Continue dabakar Google Play se subscribe karein.',
          visibilityTime: 4000,
        });
      }
    } catch (err: any) {
      setCouponError(err?.message || 'Failed to apply coupon. Please check network.');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponSuccess(null);
    setCouponCode('');
  };

  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/dashboard');
  };

  // Remote Admin Control: If admin turned off subscriptions / pro features
  if (appConfig?.showSubscriptions === false || appConfig?.showProFeatures === false) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0F19" />
        <View style={styles.navBar}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeBtn}
            activeOpacity={0.7}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color="#94A3B8" />
          </TouchableOpacity>
          <View style={styles.proPillHeader}>
            <Ionicons name="sparkles" size={13} color="#F59E0B" />
            <Text style={styles.proPillHeaderText}>RUPEO PRO</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <View
            style={[
              styles.crownCircle,
              {
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                marginBottom: 20,
              },
            ]}
          >
            <Ionicons name="lock-closed" size={32} color="#EF4444" />
          </View>
          <Text style={[styles.heroTitle, { textAlign: 'center', fontSize: 22 }]}>
            Subscriptions Paused
          </Text>
          <Text style={[styles.heroSubtitle, { textAlign: 'center', marginTop: 10, maxWidth: 300, lineHeight: 20 }]}>
            Rupeo Pro subscriptions are temporarily paused by the administrator. Please check back later!
          </Text>
          <TouchableOpacity
            style={[styles.ctaButtonWrapper, { marginTop: 32, width: '100%', maxWidth: 260 }]}
            onPress={handleClose}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#334155', '#1E293B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Text style={[styles.ctaButtonText, { color: '#FFFFFF' }]}>Go Back</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F19" />

      {/* ── Top Navigation Bar ── */}
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.closeBtn}
          activeOpacity={0.7}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <View style={styles.proPillHeader}>
          <Ionicons name="sparkles" size={13} color="#F59E0B" />
          <Text style={styles.proPillHeaderText}>RUPEO PRO</Text>
        </View>

        <TouchableOpacity
          onPress={handleRestore}
          disabled={restoring || purchasing}
          style={styles.navRestoreBtn}
          activeOpacity={0.7}
        >
          {restoring ? (
            <ActivityIndicator size="small" color="#94A3B8" />
          ) : (
            <Text style={styles.navRestoreText}>Restore</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Hero Title ── */}
        <View style={styles.heroBlock}>
          <View style={styles.crownCircle}>
            <Ionicons name="diamond" size={28} color="#F59E0B" />
          </View>
          <Text style={styles.heroTitle}>Upgrade to Rupeo Pro</Text>
          <Text style={styles.heroSubtitle}>
            Smart financial insights, zero ads aur complete peace of mind.
          </Text>
        </View>

        {/* ── Core Benefits List ── */}
        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsCardTitle}>PRO FEATURES INCLUDED</Text>

          {KEY_BENEFITS.map((b, idx) => (
            <View key={idx} style={styles.benefitRow}>
              <View style={[styles.benefitIconWrap, { backgroundColor: b.iconBg }]}>
                <Ionicons name={b.icon} size={18} color={b.iconColor} />
              </View>
              <View style={styles.benefitTextWrap}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitDesc}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Plan Selector ── */}
        <View style={styles.plansSection}>
          <View style={styles.planSectionHeader}>
            <Text style={styles.planSectionTitle}>SELECT YOUR PLAN</Text>
            <Text style={styles.planSectionSub}>Cancel anytime in Play Store</Text>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#F59E0B" size="small" />
              <Text style={styles.loadingText}>Loading plans from Google Play…</Text>
            </View>
          ) : (
            <Animated.View style={[styles.planList, { opacity: fadeAnim }]}>
              {plans.map((p) => (
                <CleanPlanCard
                  key={p.planId}
                  plan={p}
                  isSelected={p.planId === selectedPlan}
                  isCurrent={p.planId === currentPlanId}
                  appliedCoupon={appliedCoupon}
                  onPress={() => setSelectedPlan(p.planId)}
                />
              ))}
            </Animated.View>
          )}
        </View>

        {/* ── Error Message Banner ── */}
        {errorMsg && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginTop: 1 }} />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={() => setErrorMsg(null)} style={{ padding: 4 }}>
              <Ionicons name="close" size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Promo / Coupon Code Section ── */}
        <View style={styles.couponSection}>
          <View style={styles.couponHeaderRow}>
            <View style={styles.couponIconWrap}>
              <Ionicons name="pricetag" size={13} color="#818CF8" />
            </View>
            <Text style={styles.couponSectionTitle}>HAVE A PROMO / COUPON CODE?</Text>
          </View>

          <View style={styles.couponInputRow}>
            <TextInput
              style={styles.couponTextInput}
              placeholder="Enter Code (e.g. PROVIP)"
              placeholderTextColor="#64748B"
              value={couponCode}
              onChangeText={(t) => {
                setCouponCode(t.toUpperCase());
                setCouponError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!applyingCoupon}
            />
            <TouchableOpacity
              style={[
                styles.applyCouponBtn,
                (!couponCode.trim() || applyingCoupon) && styles.applyCouponBtnDisabled,
              ]}
              onPress={handleApplyCoupon}
              disabled={!couponCode.trim() || applyingCoupon}
              activeOpacity={0.8}
            >
              {applyingCoupon ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.applyCouponBtnText}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>

          {couponError && (
            <View style={styles.couponFeedbackRow}>
              <Ionicons name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.couponErrorText}>{couponError}</Text>
            </View>
          )}

          {couponSuccess && (
            <View style={styles.couponFeedbackRow}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={styles.couponSuccessText}>{couponSuccess}</Text>
              <TouchableOpacity onPress={handleRemoveCoupon} style={styles.removeCouponBtn}>
                <Text style={styles.removeCouponBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Main CTA Button (Google Play Billing) ── */}
        <TouchableOpacity
          onPress={isCurrentlySamePlan ? handleRestore : handleSubscribe}
          disabled={purchasing || loading || restoring}
          activeOpacity={0.88}
          style={styles.ctaButtonWrapper}
        >
          <LinearGradient
            colors={
              purchasing || loading || restoring
                ? ['#334155', '#1E293B']
                : ['#F59E0B', '#D97706']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            {purchasing || restoring ? (
              <View style={styles.ctaLoadingRow}>
                <ActivityIndicator color="#0B0F19" size="small" />
                <Text style={styles.ctaButtonText}>
                  {purchasing ? 'Connecting to Google Play…' : 'Restoring…'}
                </Text>
              </View>
            ) : (
              <View style={styles.ctaContentRow}>
                <Text style={styles.ctaButtonText}>
                  {isCurrentlySamePlan
                    ? 'Restore Current Plan'
                    : selectedPlanData
                      ? isDiscountApplied
                        ? `Continue with Google Play · ${selectedPlanData.label} (₹${selectedFinalPrice})`
                        : `Continue with ${selectedPlanData.label} · ${selectedPlanData.price}`
                      : 'Continue with Google Play'}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#0B0F19" />
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Security Trust Footer ── */}
        <View style={styles.trustFooter}>
          <View style={styles.trustRow}>
            <Ionicons name="shield-checkmark" size={14} color="#10B981" />
            <Text style={styles.trustText}>
              100% Safe & Secure via Google Play
            </Text>
          </View>
          <Text style={styles.legalNotice}>
            Subscription renews automatically unless cancelled 24h before expiry. Play Store settings se kabhi bhi 1-click mein cancel karein.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },

  // Navigation Bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  proPillHeaderText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#F59E0B',
    letterSpacing: 0.8,
  },
  navRestoreBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  navRestoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Hero Section
  heroBlock: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 22,
  },
  crownCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 13.5,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },

  // Benefits Card
  benefitsCard: {
    backgroundColor: '#111827',
    borderRadius: 0,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1F2937',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 24,
  },
  benefitsCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  benefitIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTextWrap: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F3F4F6',
    marginBottom: 2,
  },
  benefitDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
  },

  // Plans Section
  plansSection: {
    marginBottom: 20,
  },
  planSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  planSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  planSectionSub: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
  },
  loadingBox: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12.5,
    color: '#94A3B8',
  },
  planList: {
    gap: 10,
  },

  // Plan Card
  planCard: {
    backgroundColor: '#111827',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#1F2937',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  planCardSelected: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderRadius: 0,
  },
  planBadgeDefault: {
    backgroundColor: '#1F2937',
  },
  planBadgeActive: {
    backgroundColor: '#F59E0B',
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planBadgeTextActive: {
    color: '#0B0F19',
  },
  planCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#F59E0B',
    backgroundColor: '#F59E0B',
  },
  planDetails: {
    flex: 1,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E5E7EB',
  },
  planTitleSelected: {
    color: '#FFFFFF',
  },
  currentPlanPill: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentPlanPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#60A5FA',
  },
  planDurationText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  planPriceBlock: {
    alignItems: 'flex-end',
  },
  planPriceText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#E5E7EB',
  },
  planPriceTextSelected: {
    color: '#F59E0B',
  },
  planOriginalPriceStrike: {
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  planPriceTextDiscounted: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: '900',
  },
  planDiscountSavedText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
    marginTop: 1,
  },
  planBadgeDiscount: {
    backgroundColor: '#34D399',
  },
  planBadgeDiscountText: {
    color: '#064E3B',
    fontSize: 10,
    fontWeight: '900',
  },
  planPerMonthText: {
    fontSize: 11.5,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 1,
  },
  planPerMonthTextSelected: {
    color: '#9CA3AF',
  },

  // Error Banner
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    color: '#EF4444',
    lineHeight: 18,
  },

  // CTA Button
  ctaButtonWrapper: {
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#F59E0B',
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  ctaGradient: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0B0F19',
  },

  // Promo / Coupon Section
  couponSection: {
    backgroundColor: '#111827',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 14,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  couponHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 10,
  },
  couponIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 0,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 0.8,
  },
  couponInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  couponTextInput: {
    flex: 1,
    backgroundColor: '#0B0F19',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 1,
  },
  applyCouponBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyCouponBtnDisabled: {
    backgroundColor: '#1E293B',
    opacity: 0.6,
  },
  applyCouponBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  couponFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  couponErrorText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
    flex: 1,
  },
  couponSuccessText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    flex: 1,
  },
  removeCouponBtn: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  removeCouponBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },

  // Trust Footer
  trustFooter: {
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  legalNotice: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
});
