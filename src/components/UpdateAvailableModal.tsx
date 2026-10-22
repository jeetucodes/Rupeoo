import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTranslation } from '@/lib/i18n';
import {
  UpdateMode,
  startAppUpdate,
} from '@/lib/appUpdate';

interface UpdateAvailableModalProps {
  visible: boolean;
  mode: UpdateMode;
  title?: string;
  message?: string;
  updateUrl?: string;
  latestVersion?: string;
  onDismiss?: () => void;
}

export function UpdateAvailableModal({
  visible,
  mode,
  title,
  message,
  updateUrl,
  latestVersion,
  onDismiss,
}: UpdateAvailableModalProps) {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const isForce = mode === 'FORCE';

  // In FORCE mode: Block the hardware back button on Android
  useEffect(() => {
    if (!visible || !isForce) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Return true to prevent default back action
      return true;
    });

    return () => backHandler.remove();
  }, [visible, isForce]);

  if (!visible || mode === 'NONE') {
    return null;
  }

  const handleUpdatePress = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    setIsUpdating(true);
    try {
      await startAppUpdate(updateUrl);
    } catch (err) {
      if (__DEV__) {
        console.warn('[UpdateAvailableModal] Error triggering update:', err);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDismissPress = () => {
    if (isForce) return; // Cannot dismiss in FORCE mode
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    if (onDismiss) {
      onDismiss();
    }
  };

  // Content configuration based on mode
  const modalTitle = title || (isForce ? t('update_critical_title') : t('update_available_title'));
  const modalMessage = message || (isForce ? t('update_critical_msg') : t('update_available_msg'));
  const badgeText = isForce
    ? 'MANDATORY'
    : latestVersion
    ? `v${latestVersion.replace(/^v/i, '')} AVAILABLE`
    : 'NEW VERSION';
  const badgeBg = isForce ? '#FEE2E2' : '#EFF6FF';
  const badgeColor = isForce ? '#DC2626' : '#2563EB';
  const gradientColors: [string, string] = isForce
    ? ['#EF4444', '#DC2626']
    : ['#3B82F6', '#2563EB'];
  const iconName: keyof typeof Ionicons.glyphMap = isForce
    ? 'alert-circle'
    : 'cloud-download';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isForce ? () => {} : handleDismissPress}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={isForce ? undefined : handleDismissPress}
        />
        <View style={styles.card}>
          {/* Top Squircle Icon with Subtle Glow */}
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconSquircle}
          >
            <Ionicons name={iconName} size={30} color="#FFFFFF" />
          </LinearGradient>

          {/* Badge */}
          <View style={[styles.badge, { backgroundColor: badgeBg }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeText}</Text>
          </View>

          {/* Title & Message */}
          <Text style={styles.title}>{modalTitle}</Text>
          <Text style={styles.message}>{modalMessage}</Text>

          {/* Action Buttons */}
          <View style={[styles.actionRow, isForce && styles.actionRowForce]}>
            {!isForce && (
              <TouchableOpacity
                style={styles.laterBtn}
                onPress={handleDismissPress}
                disabled={isUpdating}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('update_later')}
              >
                <Text style={styles.laterBtnText}>{t('update_later')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.updateBtn, isForce && styles.updateBtnForce]}
              onPress={handleUpdatePress}
              disabled={isUpdating}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('update_now')}
            >
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.updateGradient}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="download-outline"
                      size={18}
                      color="#FFFFFF"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.updateBtnText}>{t('update_now')}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  iconSquircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 12,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  message: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  actionRowForce: {
    flexDirection: 'column',
  },
  laterBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  laterBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
  },
  updateBtn: {
    flex: 1.3,
    height: 50,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  updateBtnForce: {
    flex: 0,
    width: '100%',
  },
  updateGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  updateBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
