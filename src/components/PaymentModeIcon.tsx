import React from 'react';
import { Image, StyleProp, ImageStyle, TextStyle } from 'react-native';
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
    return <Image source={require('@/assets/images/upi_user.png')} style={[{ width: size * 1.5, height: size, resizeMode: 'contain' }, style]} />;
  }
  if (m.includes('bank')) {
    return <Image source={require('@/assets/images/bank_user.png')} style={[{ width: size, height: size, resizeMode: 'contain' }, style]} />;
  }
  if (m.includes('card')) {
    return <Image source={require('@/assets/images/card_user.png')} style={[{ width: size, height: size, resizeMode: 'contain' }, style]} />;
  }
  if (m.includes('cash')) {
    return <Image source={require('@/assets/images/cash_user.png')} style={[{ width: size, height: size, resizeMode: 'contain' }, style]} />;
  }

  // Fallback
  return <Ionicons name="cash-outline" size={size} color={color} style={style as StyleProp<TextStyle>} />;
}

export default React.memo(PaymentModeIconComponent);
