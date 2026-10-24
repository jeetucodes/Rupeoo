import React from 'react';
import { StyleProp, ImageStyle, TextStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  mode: string;
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}

function PaymentModeIconComponent({ mode, size = 16, color = '#6B7280', style }: Props) {
  const m = (mode || '').toLowerCase();

  if (m.includes('upi')) {
    return <ExpoImage source={require('@/assets/images/upi_user.png')} contentFit="contain" cachePolicy="memory-disk" style={[{ width: size * 1.5, height: size }, style]} />;
  }
  if (m.includes('bank')) {
    return <ExpoImage source={require('@/assets/images/bank_user.png')} contentFit="contain" cachePolicy="memory-disk" style={[{ width: size, height: size }, style]} />;
  }
  if (m.includes('card')) {
    return <ExpoImage source={require('@/assets/images/card_user.png')} contentFit="contain" cachePolicy="memory-disk" style={[{ width: size, height: size }, style]} />;
  }
  if (m.includes('cash')) {
    return <ExpoImage source={require('@/assets/images/cash_user.png')} contentFit="contain" cachePolicy="memory-disk" style={[{ width: size, height: size }, style]} />;
  }

  if (m.includes('unknown') || !m) {
    return <Ionicons name="help-circle-outline" size={size} color={color} style={style as StyleProp<TextStyle>} />;
  }

  // Fallback
  return <Ionicons name="wallet-outline" size={size} color={color} style={style as StyleProp<TextStyle>} />;
}

export default React.memo(PaymentModeIconComponent);
