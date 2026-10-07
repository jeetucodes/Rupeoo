import React, { useEffect, useRef, memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../lib/i18n';

const BRAND_ACTIVE = '#1C1C1E';
const BRAND_YELLOW = '#FFD740';
const INACTIVE_COLOR = '#A0AEC0';
const ACTIVE_LABEL = '#1C1C1E';
const INACTIVE_LABEL = '#A0AEC0';

const TAB_CONFIG = [
  {
    name: 'dashboard',
    icon: 'home' as const,
    iconOutline: 'home-outline' as const,
    label: 'Home',
    isFab: false,
  },
  {
    name: 'transactions',
    icon: 'receipt' as const,
    iconOutline: 'receipt-outline' as const,
    label: 'History',
    isFab: false,
  },
  {
    name: 'add_action',
    icon: 'add' as const,
    iconOutline: 'add' as const,
    label: 'Add',
    isFab: true,
  },
  {
    name: 'ai_insights',
    icon: 'bar-chart' as const,
    iconOutline: 'bar-chart-outline' as const,
    label: 'Reports',
    isFab: false,
  },
  {
    name: 'settings',
    icon: 'person' as const,
    iconOutline: 'person-outline' as const,
    label: 'Profile',
    isFab: false,
  },
];

type TabConfig = (typeof TAB_CONFIG)[number];

interface TabItemProps {
  config: TabConfig;
  isActive: boolean;
  onPress: () => void;
  onLongPress: () => void;
  t?: any;
}

const FabTabItem = memo(function FabTabItem({ onPress, isActive }: TabItemProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true, tension: 500, friction: 10 }),
        Animated.timing(rotateAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 350, friction: 12 }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]),
    ]).start();
    onPress();
  };

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <View style={styles.fabWrapper}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        style={styles.fabTouchable}
        accessibilityLabel="Add transaction"
        accessibilityRole="button"
      >
        <Animated.View style={[styles.fabInner, isActive && styles.fabInnerActive, { transform: [{ scale: scaleAnim }] }]}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="add" size={30} color="#1C1C1E" />
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
});

const RegularTabItem = memo(function RegularTabItem({ config, isActive, onPress, onLongPress }: TabItemProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dotScale = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const bgOpacity = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const iconScale = useRef(new Animated.Value(isActive ? 1.08 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(dotScale, {
        toValue: isActive ? 1 : 0,
        useNativeDriver: true,
        tension: 300,
        friction: 14,
      }),
      Animated.spring(bgOpacity, {
        toValue: isActive ? 1 : 0,
        useNativeDriver: true,
        tension: 260,
        friction: 18,
      }),
      Animated.spring(iconScale, {
        toValue: isActive ? 1.12 : 1,
        useNativeDriver: true,
        tension: 260,
        friction: 18,
      }),
    ]).start();
  }, [isActive]);

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true, tension: 450, friction: 12 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 350, friction: 12 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
      style={styles.tabItem}
      accessibilityRole="tab"
      accessibilityLabel={config.label}
    >
      <Animated.View style={[styles.tabContent, { transform: [{ scale: scaleAnim }] }]}>
        {/* Active background pill */}
        <Animated.View style={[styles.activePill, { opacity: bgOpacity }]} />

        {/* Icon */}
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <Ionicons
            name={isActive ? config.icon : config.iconOutline}
            size={20}
            color={isActive ? BRAND_ACTIVE : INACTIVE_COLOR}
          />
        </Animated.View>

        {/* Label — always visible */}
        <Text
          style={[
            styles.tabLabel,
            isActive ? styles.tabLabelActive : styles.tabLabelInactive,
          ]}
          numberOfLines={1}
        >
          {config.label}
        </Text>

        {/* Active dot indicator */}
        <Animated.View style={[styles.activeDot, { transform: [{ scale: dotScale }] }]} />
      </Animated.View>
    </TouchableOpacity>
  );
});

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const bottomOffset = insets.bottom > 0 ? insets.bottom + 8 : 16;
  const isIOS = Platform.OS === 'ios';

  const tabBarContent = (
    <>
      {/* Subtle top border highlight */}
      <View style={styles.topHighlight} />

      {TAB_CONFIG.map((config) => {
        const route = state.routes.find((r: any) => r.name === config.name);
        if (!route) return null;

        const routeIndex = state.routes.indexOf(route);
        const isActive = state.index === routeIndex;

        const onPress = () => {
          if (config.isFab) {
            router.push('/add');
            return;
          }
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isActive && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        if (config.isFab) {
          return (
            <FabTabItem
              key={config.name}
              config={config}
              isActive={isActive}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        }

        return (
          <RegularTabItem
            key={config.name}
            config={config}
            isActive={isActive}
            onPress={onPress}
            onLongPress={onLongPress}
            t={t}
          />
        );
      })}
    </>
  );

  return (
    <View style={[styles.tabBarWrapper, { bottom: bottomOffset }]} pointerEvents="box-none">
      {isIOS ? (
        <BlurView
          intensity={80}
          tint="light"
          style={styles.tabBarInner}
        >
          {tabBarContent}
        </BlurView>
      ) : (
        <View style={[styles.tabBarInner, styles.androidTabBarInner]}>
          {tabBarContent}
        </View>
      )}
    </View>
  );
}

const BAR_HEIGHT = 72;
const FAB_SIZE = 52;

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 22,
    borderRadius: 32,
  },
  tabBarInner: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
  },
  androidTabBarInner: {
    backgroundColor: '#FFFFFF',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 32,
    right: 32,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: BAR_HEIGHT,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 2,
    minWidth: 52,
  },
  activePill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    backgroundColor: '#F0EFFF',
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  tabLabelActive: {
    fontWeight: '800',
    color: '#1C1C1E',
  },
  tabLabelInactive: {
    fontWeight: '600',
    color: '#B0BAC8',
  },
  activeDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: BRAND_YELLOW,
  },

  // FAB
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabGlowRing: {
    position: 'absolute',
    width: FAB_SIZE + 14,
    height: FAB_SIZE + 14,
    borderRadius: (FAB_SIZE + 14) / 2,
    backgroundColor: BRAND_YELLOW,
  },
  fabTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabInner: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  fabInnerActive: {
    backgroundColor: '#FFCA28',
    shadowOpacity: 0.6,
  },
});
