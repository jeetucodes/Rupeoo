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
        withTiming(1.18, { duration: 100 }),
        withTiming(1, { duration: 120 })
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
        style={[
          styles.baseBtn,
          status === 'on' && styles.btnOn,
          status === 'off' && styles.btnOff,
          status === 'paused' && styles.btnPaused,
        ]}
        onPress={handlePress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={accessibilityStatusText}
      >
        {status === 'on' && (
          <>
            <Ionicons name="flash" size={14} color="#059669" />
            <View style={styles.activeDot} />
          </>
        )}

        {status === 'off' && (
          <Ionicons name="flash-off" size={14} color="#DC2626" />
        )}

        {status === 'paused' && (
          <View style={styles.pausedContent}>
            <Ionicons name="time" size={12} color="#D97706" />
            <Text style={styles.countdownText} numberOfLines={1}>
              {countdownLabel || 'Paused'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  baseBtn: {
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    position: 'relative',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  // ON: soft green tint, green bolt, small green status dot
  btnOn: {
    width: 32,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  // OFF: soft red tint (theme danger tint), crossed-out red bolt, thin red border
  btnOff: {
    width: 32,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  // PAUSED: soft amber tint, clock icon, tiny countdown label
  btnPaused: {
    minWidth: 32,
    paddingHorizontal: 8,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  pausedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
  },
  activeDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  countdownText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: -0.2,
  },
});
