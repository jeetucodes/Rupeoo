import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type StatusChipType = 'needs_category' | 'low_confidence' | 'already_added' | 'bill_match';

interface StatusChipProps {
  type: StatusChipType;
  label?: string;
  onPress?: () => void;
}

export function StatusChip({ type, label, onPress }: StatusChipProps) {
  const isDark = useColorScheme() === 'dark';

  let iconName: keyof typeof Ionicons.glyphMap = 'help-circle-outline';
  let defaultText = '';
  let textColor = '#D97706';
  let bgColor = isDark ? '#2D2305' : '#FEF3C7';
  let borderColor = isDark ? '#78350F' : '#FDE68A';

  switch (type) {
    case 'needs_category':
      iconName = 'pricetag-outline';
      defaultText = 'Needs category';
      textColor = '#D97706';
      bgColor = isDark ? '#2D2305' : '#FEF3C7';
      borderColor = isDark ? '#78350F' : '#FDE68A';
      break;

    case 'low_confidence':
      iconName = 'alert-circle-outline';
      defaultText = 'Low confidence • Tap to edit';
      textColor = '#B45309';
      bgColor = isDark ? '#311E08' : '#FFFBEB';
      borderColor = isDark ? '#92400E' : '#FEEBC8';
      break;

    case 'already_added':
      iconName = 'checkmark-done-outline';
      defaultText = 'Already added';
      textColor = isDark ? '#94A3B8' : '#64748B';
      bgColor = isDark ? '#1E293B' : '#F1F5F9';
      borderColor = isDark ? '#334155' : '#E2E8F0';
      break;

    case 'bill_match':
      iconName = 'receipt-outline';
      defaultText = label || 'Matches bill';
      textColor = isDark ? '#60A5FA' : '#2563EB';
      bgColor = isDark ? '#1E293B' : '#EFF6FF';
      borderColor = isDark ? '#1D4ED8' : '#BFDBFE';
      break;
  }

  const displayText = label || defaultText;

  const content = (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor }]}>
      <Ionicons name={iconName} size={12} color={textColor} style={{ marginRight: 4 }} />
      <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
        {displayText}
      </Text>
      {onPress && type === 'needs_category' && (
        <Ionicons name="chevron-forward" size={10} color={textColor} style={{ marginLeft: 2 }} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={displayText}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
