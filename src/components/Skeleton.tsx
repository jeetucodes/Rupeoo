import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import { isLowEndDevice } from '@/lib/devicePerf';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  color?: string;
}

export default function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
  color = '#E2E8F0', // Default tailwind slate-200
}: SkeletonProps) {
  const opacityAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (isLowEndDevice()) {
      opacityAnim.setValue(0.5);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [opacityAnim]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: color,
          opacity: opacityAnim,
        },
        style,
      ]}
    />
  );
}
