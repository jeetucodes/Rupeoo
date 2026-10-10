import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

interface Props {
  mode?: string;
  isDark?: boolean;
}

export default function ReceiptPaymentMethodBadge({ mode = 'UPI', isDark = false }: Props) {
  const m = (mode || '').toLowerCase().trim();

  if (m.includes('upi')) {
    return (
      <View style={[styles.badge, isDark ? styles.badgeDarkUpi : styles.badgeLightUpi]}>
        <Svg width={16} height={12} viewBox="0 0 28 20" fill="none">
          <Path d="M7 18L19 2L23 10L11 18H7Z" fill="#0F753A" />
          <Path d="M11 18L23 10L19 2L7 18H11Z" fill="#F47920" />
          <Path d="M3 18L15 2L19 10L7 18H3Z" fill="#0F753A" />
        </Svg>
        <Text style={[styles.badgeText, { color: isDark ? '#34D399' : '#0F753A' }]}>UPI</Text>
      </View>
    );
  }

  if (m.includes('cash')) {
    return (
      <View style={[styles.badge, isDark ? styles.badgeDarkCash : styles.badgeLightCash]}>
        <Svg width={15} height={11} viewBox="0 0 24 18" fill="none">
          <Rect
            x={1}
            y={2}
            width={22}
            height={14}
            rx={3}
            stroke="#16A34A"
            strokeWidth={1.8}
            fill={isDark ? '#064E3B' : '#DCFCE7'}
          />
          <Circle cx={12} cy={9} r={3.2} fill="#16A34A" />
          <Path d="M12 7.2v3.6M10.8 8.1h2.4M10.8 9.2h2.4" stroke="#FFFFFF" strokeWidth={0.8} />
        </Svg>
        <Text style={[styles.badgeText, { color: isDark ? '#34D399' : '#16A34A' }]}>CASH</Text>
      </View>
    );
  }

  if (m.includes('bank')) {
    return (
      <View style={[styles.badge, isDark ? styles.badgeDarkBank : styles.badgeLightBank]}>
        <Svg width={13} height={12} viewBox="0 0 24 22" fill="none">
          <Path d="M12 2L2 7H22L12 2Z" fill="#2563EB" />
          <Rect x={4} y={9} width={2.5} height={8} rx={0.5} fill="#2563EB" />
          <Rect x={8.75} y={9} width={2.5} height={8} rx={0.5} fill="#2563EB" />
          <Rect x={13.5} y={9} width={2.5} height={8} rx={0.5} fill="#2563EB" />
          <Rect x={18} y={9} width={2.5} height={8} rx={0.5} fill="#2563EB" />
          <Rect x={2} y={18} width={20} height={2.5} rx={0.5} fill="#2563EB" />
        </Svg>
        <Text style={[styles.badgeText, { color: isDark ? '#60A5FA' : '#2563EB' }]}>BANK</Text>
      </View>
    );
  }

  if (m.includes('card')) {
    return (
      <View style={[styles.badge, isDark ? styles.badgeDarkCard : styles.badgeLightCard]}>
        <Svg width={15} height={11} viewBox="0 0 26 18" fill="none">
          <Rect
            x={1}
            y={1}
            width={24}
            height={16}
            rx={3}
            stroke={isDark ? '#475569' : '#CBD5E1'}
            strokeWidth={1}
            fill={isDark ? '#1E293B' : '#0F172A'}
          />
          <Circle cx={10} cy={9} r={4.2} fill="#DC2626" opacity={0.9} />
          <Circle cx={16} cy={9} r={4.2} fill="#F59E0B" opacity={0.9} />
        </Svg>
        <Text style={[styles.badgeText, { color: isDark ? '#FCD34D' : '#B45309' }]}>CARD</Text>
      </View>
    );
  }

  // Default / Other
  return (
    <View style={[styles.badge, isDark ? styles.badgeDarkOther : styles.badgeLightOther]}>
      <Svg width={14} height={12} viewBox="0 0 24 20" fill="none" stroke="#7C3AED" strokeWidth={1.8}>
        <Rect x={2} y={4} width={20} height={14} rx={2} fill={isDark ? '#3B0764' : '#F3E8FF'} />
        <Path d="M16 11h4v3h-4a1.5 1.5 0 0 1 0-3z" fill="#7C3AED" />
      </Svg>
      <Text style={[styles.badgeText, { color: isDark ? '#C084FC' : '#7E22CE' }]}>OTHER</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeLightUpi: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  badgeDarkUpi: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  badgeLightCash: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeDarkCash: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  badgeLightBank: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  badgeDarkBank: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.35)',
  },
  badgeLightCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeDarkCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  badgeLightOther: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  badgeDarkOther: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.35)',
  },
});
