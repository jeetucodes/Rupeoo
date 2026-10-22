import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  isListenerEnabled,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from './nativeModule';

const DISMISSED_DAY_KEY = '@rupeo_battery_warning_dismissed_day';

export function DashboardBatteryWarningCard() {
  const [visible, setVisible] = useState(false);

  const checkStatus = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setVisible(false);
      return;
    }

    try {
      const listenerActive = await isListenerEnabled();
      if (!listenerActive) {
        // Only warn if listener is enabled (user wants auto-add) but battery is optimized
        setVisible(false);
        return;
      }

      const batteryUnrestricted = await isIgnoringBatteryOptimizations();
      if (batteryUnrestricted) {
        setVisible(false);
        return;
      }

      // Check if dismissed today
      const todayStr = new Date().toISOString().slice(0, 10);
      const dismissedDay = await AsyncStorage.getItem(DISMISSED_DAY_KEY);
      if (dismissedDay === todayStr) {
        setVisible(false);
        return;
      }

      setVisible(true);
    } catch {
      setVisible(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        checkStatus();
      }
    });
    return () => sub.remove();
  }, [checkStatus]);

  const handleFixNow = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    await requestIgnoreBatteryOptimizations();
  };

  const handleDismiss = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    const todayStr = new Date().toISOString().slice(0, 10);
    await AsyncStorage.setItem(DISMISSED_DAY_KEY, todayStr);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <View style={styles.card}>
      <View style={styles.leftIcon}>
        <Ionicons name="battery-charging" size={18} color="#D97706" />
      </View>

      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          Auto-add may miss payments.
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Allow background activity to track spends.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.fixButton}
        onPress={handleFixNow}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Fix battery optimization"
      >
        <Text style={styles.fixButtonText}>Fix now</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleDismiss}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss warning for today"
      >
        <Ionicons name="close" size={16} color="#B45309" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
      web: {
        boxShadow: '0 1px 3px rgba(217,119,6,0.08)',
      },
    }),
  },
  leftIcon: {
    marginRight: 9,
  },
  textWrap: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#B45309',
    marginTop: 1,
  },
  fixButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 7,
    marginRight: 6,
  },
  fixButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 3,
  },
});
