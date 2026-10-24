import React, { useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAutoAdd, AutoAddStatus } from './useAutoAdd';

export interface AutoAddBoltButtonProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function AutoAddBoltButton({ onPress, style }: AutoAddBoltButtonProps) {
  const { status, countdownLabel } = useAutoAdd();

  const scale = useSharedValue(1);
  const prevStatusRef = useRef<AutoAddStatus>(status);

  // Animate on status change: small scale pulse
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      scale.value = withSequence(
        withTiming(1.08, { duration: 110 }),
        withTiming(1, { duration: 130 })
      );
    }
  }, [status, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onPress();
  };

  const accessibilityStatusText =
    status === 'on'
      ? 'Auto-add on, tap for options'
      : status === 'paused'
      ? `Auto-add paused, ${countdownLabel} remaining, tap for options`
      : 'Auto-add off, tap for options';

  return (
    <Animated.View style={[animatedStyle, style]}>
      <TouchableOpacity
        style={styles.touchable}
        onPress={handlePress}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={accessibilityStatusText}
      >
        {status === 'on' && (
          <LinearGradient
            colors={['#FFFFFF', '#F0FDF4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.pillContainer, styles.pillOn]}
          >
            <View style={styles.iconCircleOn}>
              <Ionicons name="flash" size={11} color="#059669" />
            </View>
            <Text style={styles.labelOn}>Auto Add</Text>
            <View style={styles.liveDotWrap}>
              <View style={styles.liveDotRing} />
              <View style={styles.liveDotCore} />
            </View>
          </LinearGradient>
        )}

        {status === 'off' && (
          <LinearGradient
            colors={['#FFFFFF', '#F8FAFC']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.pillContainer, styles.pillOff]}
          >
            <View style={styles.iconCircleOff}>
              <Ionicons name="flash-off" size={11} color="#94A3B8" />
            </View>
            <Text style={styles.labelOff}>Auto Add</Text>
            <View style={styles.offTag}>
              <Text style={styles.offTagText}>OFF</Text>
            </View>
          </LinearGradient>
        )}

        {status === 'paused' && (
          <LinearGradient
            colors={['#FFFBEB', '#FEF3C7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.pillContainer, styles.pillPaused]}
          >
            <View style={styles.iconCirclePaused}>
              <Ionicons name="time" size={11} color="#D97706" />
            </View>
            <Text style={styles.labelPaused}>Auto</Text>
            <View style={styles.countdownPill}>
              <Text style={styles.countdownText} numberOfLines={1}>
                {countdownLabel || 'Paused'}
              </Text>
            </View>
          </LinearGradient>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  touchable: {
    borderRadius: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1.5 },
    shadowRadius: 3,
    elevation: 2,
  },
  pillContainer: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 5,
    paddingRight: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
  },

  // ON STATE
  pillOn: {
    borderColor: '#86EFAC',
  },
  iconCircleOn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelOn: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
    letterSpacing: 0.1,
  },
  liveDotWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 1,
  },
  liveDotRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  liveDotCore: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },

  // OFF STATE
  pillOff: {
    borderColor: '#E2E8F0',
  },
  iconCircleOff: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelOff: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.1,
  },
  offTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginLeft: 1,
  },
  offTagText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.2,
  },

  // PAUSED STATE
  pillPaused: {
    borderColor: '#FCD34D',
  },
  iconCirclePaused: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelPaused: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#92400E',
    letterSpacing: 0.1,
  },
  countdownPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#FDE68A',
  },
  countdownText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: -0.2,
  },
});
