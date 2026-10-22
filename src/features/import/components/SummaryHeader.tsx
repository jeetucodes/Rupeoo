import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface SummaryHeaderProps {
  foundText: string;
  totalsSubtitle: string;
  selectedSubtitle: string | null;
  selectAllState: 'all' | 'none' | 'some';
  onToggleSelectAll: () => void;
  hasSelectableItems: boolean;
}

export function SummaryHeader({
  foundText,
  totalsSubtitle,
  selectedSubtitle,
  selectAllState,
  onToggleSelectAll,
  hasSelectableItems,
}: SummaryHeaderProps) {
  const isDark = useColorScheme() === 'dark';

  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const selectedTextColor = isDark ? '#818CF8' : '#4F46E5';
  const borderColor = isDark ? '#272A30' : '#E2E8F0';
  const bgCard = isDark ? '#18191D' : '#FFFFFF';

  const handleSelectAll = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    onToggleSelectAll();
  };

  return (
    <View style={[styles.container, { backgroundColor: bgCard, borderBottomColor: borderColor }]}>
      <View style={styles.textWrap}>
        <Text style={[styles.foundTitle, { color: textColor }]}>{foundText}</Text>
        <Text style={[styles.totalsSubtitle, { color: subtextColor }]}>{totalsSubtitle}</Text>
        {selectedSubtitle && (
          <Text style={[styles.selectedSubtitle, { color: selectedTextColor }]}>
            {selectedSubtitle}
          </Text>
        )}
      </View>

      {hasSelectableItems && (
        <TouchableOpacity
          style={[styles.selectAllBtn, { borderColor }]}
          onPress={handleSelectAll}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selectAllState === 'all' }}
          accessibilityLabel="Select all selectable transactions"
        >
          {selectAllState === 'all' ? (
            <Ionicons name="checkbox" size={20} color="#4F46E5" />
          ) : selectAllState === 'some' ? (
            <Ionicons name="remove-circle" size={20} color="#4F46E5" />
          ) : (
            <Ionicons name="square-outline" size={20} color={subtextColor} />
          )}
          <Text style={[styles.selectAllText, { color: textColor }]}>
            {selectAllState === 'all' ? 'Deselect' : 'Select All'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  textWrap: {
    flex: 1,
    paddingRight: 12,
  },
  foundTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  totalsSubtitle: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 2,
  },
  selectedSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
    minHeight: 44, // 44px min touch target
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
