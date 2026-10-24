import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export interface SettingsRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  label: string;
  subtitle?: string;
  value?: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  // Right control types
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (val: boolean) => void;
  showChevron?: boolean;
  loading?: boolean;
  isDestructive?: boolean;
  isLast?: boolean;
  disabled?: boolean;
  rightElement?: React.ReactNode;
}

export const SettingsRow = React.memo(function SettingsRow({
  icon,
  iconBg = '#F1F5F9',
  iconColor = '#0F172A',
  label,
  subtitle,
  value,
  badge,
  badgeBg = '#EEF2FF',
  badgeColor = '#4F46E5',
  onPress,
  onLongPress,
  isSwitch = false,
  switchValue = false,
  onSwitchChange,
  showChevron = true,
  loading = false,
  isDestructive = false,
  isLast = false,
  disabled = false,
  rightElement,
}: SettingsRowProps) {
  const handlePress = () => {
    if (disabled || loading) return;
    if (isSwitch && onSwitchChange) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch { }
      onSwitchChange(!switchValue);
      return;
    }
    if (onPress) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch { }
      onPress();
    }
  };

  const isInteractive = Boolean(onPress || isSwitch || onLongPress);
  const Container = isInteractive ? TouchableOpacity : View;

  return (
    <Container
      style={[styles.row, !isLast && styles.rowDivider, disabled && styles.disabled]}
      onPress={isInteractive ? handlePress : undefined}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole={isSwitch ? 'switch' : onPress ? 'button' : undefined}
      accessibilityState={isSwitch ? { checked: switchValue } : undefined}
      accessibilityLabel={`${label}${subtitle ? `, ${subtitle}` : ''}`}
    >
      {/* Icon in soft tinted rounded square */}
      {icon && (
        <View
          style={[
            styles.iconBg,
            {
              backgroundColor: isDestructive ? '#FEF2F2' : iconBg,
              borderColor: isDestructive ? '#FEE2E2' : iconBg,
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={18}
            color={isDestructive ? '#DC2626' : iconColor}
          />
        </View>
      )}

      {/* Label and Subtitle */}
      <View style={styles.textContainer}>
        <View style={styles.labelRow}>
          <Text
            style={[styles.label, isDestructive && styles.destructiveLabel]}
            numberOfLines={2}
          >
            {label}
          </Text>
          {!!badge && (
            <View style={[styles.badgeContainer, { backgroundColor: badgeBg }]}>
              <Text style={[styles.badgeText, { color: badgeColor }]}>{badge}</Text>
            </View>
          )}
        </View>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Right Control */}
      <View style={styles.rightContainer}>
        {loading ? (
          <ActivityIndicator size="small" color="#64748B" />
        ) : isSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={(val) => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              } catch { }
              onSwitchChange?.(val);
            }}
            trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#CBD5E1"
            disabled={disabled}
          />
        ) : rightElement ? (
          rightElement
        ) : (
          <View style={styles.valueRow}>
            {!!value && (
              <Text style={styles.valueText} numberOfLines={1}>
                {value}
              </Text>
            )}
            {showChevron && onPress && (
              <Ionicons
                name="chevron-forward"
                size={16}
                color="#94A3B8"
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        )}
      </View>
    </Container>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 52,
    backgroundColor: '#FFFFFF',
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  disabled: {
    opacity: 0.5,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  destructiveLabel: {
    color: '#DC2626',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  badgeContainer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    maxWidth: 130,
  },
});
