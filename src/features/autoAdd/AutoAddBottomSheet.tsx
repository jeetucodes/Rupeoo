import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Platform,
  Pressable,
  PanResponder,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { getPendingAlerts } from '@/lib/pendingInbox';
import { useAutoAdd, PauseDuration } from './useAutoAdd';

export interface AutoAddBottomSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AutoAddBottomSheet({ visible, onClose }: AutoAddBottomSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = user?.uid || 'local';

  const {
    enabled,
    isPaused,
    status,
    formattedResumeTime,
    hasNotificationPermission,
    toggle,
    pause,
    resume,
    openListenerSettings,
  } = useAutoAdd();

  const [pendingCount, setPendingCount] = useState<number>(0);

  // Fetch pending inbox count whenever sheet becomes visible
  useEffect(() => {
    if (visible) {
      getPendingAlerts(uid)
        .then((items) => setPendingCount(items.length))
        .catch(() => setPendingCount(0));
    }
  }, [visible, uid]);

  // Swipe-down pan gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 40 || gestureState.vy > 0.4) {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {}
          onClose();
        }
      },
    })
  ).current;

  // Toggle switch handler
  const handleToggle = async () => {
    const nextState = await toggle();
    Toast.show({
      type: nextState ? 'success' : 'info',
      text1: nextState ? 'Auto-Add is ON ⚡' : 'Auto-Add is OFF',
      text2: nextState
        ? 'Automatically tracking bank & UPI alerts.'
        : 'New payments will not be tracked.',
      visibilityTime: 2500,
    });
  };

  // Pause duration handler
  const handlePause = async (duration: PauseDuration, label: string) => {
    await pause(duration);
    onClose();
    Toast.show({
      type: 'info',
      text1: `Auto-add paused for ${label}`,
      text2: 'You can resume tracking anytime from the balance card.',
      visibilityTime: 2800,
    });
  };

  // Resume handler
  const handleResume = async () => {
    await resume();
    onClose();
    Toast.show({
      type: 'success',
      text1: 'Auto-add resumed ⚡',
      text2: 'Bank & UPI payment alerts are being tracked.',
      visibilityTime: 2500,
    });
  };

  // Permission blocked on Android?
  const isPermissionBlocked = Platform.OS === 'android' && !hasNotificationPermission;

  // Status subtitle copy
  const statusSubtitle =
    status === 'on'
      ? 'Active - tracking bank & UPI alerts'
      : status === 'paused'
      ? `Paused - resumes at ${formattedResumeTime || 'scheduled time'}`
      : 'Off - new payments are not tracked';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Dimmed Backdrop */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Bottom Sheet Card */}
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          {/* Drag Handle Container (Swipe down area) */}
          <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
            <View style={styles.dragHandle} />
          </View>

          {/* Inline Permission Warning (If Android Notification Access is OFF) */}
          {isPermissionBlocked && (
            <View style={styles.warningRow}>
              <View style={styles.warningIconBg}>
                <Ionicons name="warning" size={16} color="#D97706" />
              </View>
              <View style={styles.warningTextCol}>
                <Text style={styles.warningTitle}>Notification access is off</Text>
                <Text style={styles.warningSub}>
                  Enable access so Rupeo can detect bank &amp; UPI messages
                </Text>
              </View>
              <TouchableOpacity
                style={styles.enableBtn}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  } catch {}
                  openListenerSettings();
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Enable notification access"
              >
                <Text style={styles.enableBtnText}>Enable</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 1. Header Row: Bolt Icon in tinted square + Title + Status text */}
          <View style={styles.headerRow}>
            <View
              style={[
                styles.headerIconSquare,
                status === 'on' && styles.iconSquareOn,
                status === 'off' && styles.iconSquareOff,
                status === 'paused' && styles.iconSquarePaused,
              ]}
            >
              {status === 'on' && <Ionicons name="flash" size={22} color="#15803D" />}
              {status === 'off' && <Ionicons name="flash-off" size={22} color="#DC2626" />}
              {status === 'paused' && <Ionicons name="time" size={22} color="#D97706" />}
            </View>

            <View style={styles.headerTextCol}>
              <Text style={styles.headerTitle}>Auto-Add</Text>
              <Text style={styles.headerStatusText} numberOfLines={1}>
                {statusSubtitle}
              </Text>
            </View>
          </View>

          {/* 2. Large Row: "Auto-add transactions" + Switch */}
          <View style={[styles.switchRow, isPermissionBlocked && styles.rowDisabled]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchTitle}>Auto-add transactions</Text>
              <Text style={styles.switchSub}>
                {enabled ? 'New alerts will be saved automatically' : 'Tracking is paused / turned off'}
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              trackColor={{ false: '#CBD5E1', true: '#10B981' }}
              thumbColor="#FFFFFF"
              disabled={isPermissionBlocked}
            />
          </View>

          {/* 3. Pause Options or Resume Now */}
          {isPaused ? (
            /* Single "Resume now" button while paused */
            <TouchableOpacity
              style={styles.resumeNowBtn}
              onPress={handleResume}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Resume auto-add tracking now"
            >
              <Ionicons name="play" size={16} color="#FFFFFF" />
              <Text style={styles.resumeNowBtnText}>Resume now</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.pauseChipsRow, (!enabled || isPermissionBlocked) && styles.chipsDisabled]}>
              <TouchableOpacity
                style={styles.pausePill}
                onPress={() => handlePause('30m', '30 minutes')}
                disabled={!enabled || isPermissionBlocked}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Pause auto-add for 30 minutes"
              >
                <Ionicons name="time-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                <Text style={styles.pausePillText} numberOfLines={1}>30 min</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pausePill}
                onPress={() => handlePause('1h', '1 hour')}
                disabled={!enabled || isPermissionBlocked}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Pause auto-add for 1 hour"
              >
                <Ionicons name="time-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                <Text style={styles.pausePillText} numberOfLines={1}>1 hour</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pausePill, styles.pausePillWide]}
                onPress={() => handlePause('tomorrow', 'until tomorrow')}
                disabled={!enabled || isPermissionBlocked}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Pause auto-add until tomorrow"
              >
                <Ionicons name="moon-outline" size={13} color="#64748B" style={{ marginRight: 3 }} />
                <Text
                  style={[styles.pausePillText, styles.pausePillTextWide]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  Until tomorrow
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 4. Small Muted Tip */}
          <Text style={styles.tipText}>
            Tip: turn this off before settling money with friends so it isn't added twice.
          </Text>

          {/* 5. Two Secondary Rows with subtle dividers */}
          <View style={styles.secondarySection}>
            {/* Divider 1 */}
            <View style={styles.divider} />

            {/* Row 1: Pending Alerts Inbox */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => {
                onClose();
                router.push('/pending-inbox');
              }}
              activeOpacity={0.65}
              accessibilityRole="button"
              accessibilityLabel={`Pending Alerts Inbox, ${pendingCount} alerts waiting`}
            >
              <View style={styles.navRowLeft}>
                <View style={[styles.navIconWrap, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="mail-unread-outline" size={17} color="#475569" />
                </View>
                <Text style={styles.navRowLabel}>Pending Alerts Inbox</Text>
              </View>

              <View style={styles.navRowRight}>
                {pendingCount > 0 && (
                  <View style={styles.badgeWrap}>
                    <Text style={styles.badgeText}>{pendingCount}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </View>
            </TouchableOpacity>

            {/* Divider 2 */}
            <View style={styles.divider} />

            {/* Row 2: Auto-Add Settings */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => {
                onClose();
                router.push('/settings/bank-alerts');
              }}
              activeOpacity={0.65}
              accessibilityRole="button"
              accessibilityLabel="Auto-Add Settings"
            >
              <View style={styles.navRowLeft}>
                <View style={[styles.navIconWrap, { backgroundColor: '#F1F5F9' }]}>
                  <Ionicons name="settings-outline" size={17} color="#475569" />
                </View>
                <Text style={styles.navRowLabel}>Auto-Add Settings</Text>
              </View>

              <View style={styles.navRowRight}>
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)', // Dimmed backdrop
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF', // Light theme card background
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 20,
    elevation: 16,
  },
  dragHandleArea: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },

  // Permission warning
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 16,
  },
  warningIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  warningTextCol: {
    flex: 1,
    marginRight: 8,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  warningSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 1,
  },
  enableBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  enableBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // 1. Header row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 4,
  },
  headerIconSquare: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  iconSquareOn: {
    backgroundColor: '#DCFCE7',
  },
  iconSquareOff: {
    backgroundColor: '#FEE2E2',
  },
  iconSquarePaused: {
    backgroundColor: '#FEF3C7',
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerStatusText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },

  // 2. Large switch row
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 12,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  switchSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },

  // 3. Pause pill chips row
  pauseChipsRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 4,
    alignItems: 'center',
  },
  chipsDisabled: {
    opacity: 0.45,
  },
  pausePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 4,
  },
  pausePillWide: {
    flex: 1.35,
    paddingHorizontal: 6,
  },
  pausePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  pausePillTextWide: {
    fontSize: 12,
    letterSpacing: -0.2,
  },

  // Resume button while paused
  resumeNowBtn: {
    height: 42,
    borderRadius: 12,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 4,
    shadowColor: '#10B981',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  resumeNowBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // 4. Muted tip
  tipText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 10,
    marginBottom: 14,
    lineHeight: 16,
  },

  // 5. Secondary rows
  secondarySection: {
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  navRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  navRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  navRowLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  navRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeWrap: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
