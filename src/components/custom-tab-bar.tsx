import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../lib/i18n';

const BRAND_ACTIVE = '#1C1C1E';
const BRAND_HIGHLIGHT = '#FEF9E7';
const BRAND_YELLOW = '#FFD740';
const INACTIVE_COLOR = '#8E8E93';

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

function FabTabItem({ onPress, isActive }: TabItemProps) {
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 0.88,
        useNativeDriver: true,
        tension: 500,
        friction: 8,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }),
    ]).start();
    onPress();
  };

  return (
    <View style={styles.fabWrapper}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={styles.fabTouchable}
        accessibilityLabel="Add transaction"
        accessibilityRole="button"
      >
        <Animated.View style={[styles.fab, { transform: [{ scale: scaleAnim }] }]}>
          <Animated.View
            style={[
              styles.fabGlowRing,
              {
                transform: [{ scale: pulseAnim }],
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.2],
                  outputRange: [0.35, 0],
                }),
              },
            ]}
          />
          <View style={[styles.fabInner, isActive && { backgroundColor: '#FFCA28', transform: [{ scale: 1.05 }] }]}>
            <Ionicons name="add" size={32} color="#1C1C1E" />
          </View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

function RegularTabItem({ config, isActive, onPress, onLongPress, t }: TabItemProps) {
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [pillOpacity] = useState(() => new Animated.Value(isActive ? 1 : 0));
  const [iconScale] = useState(() => new Animated.Value(isActive ? 1.08 : 1));

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pillOpacity, {
        toValue: isActive ? 1 : 0,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }),
      Animated.spring(iconScale, {
        toValue: isActive ? 1.08 : 1,
        useNativeDriver: true,
        tension: 300,
        friction: 12,
      }),
    ]).start();
  }, [isActive, pillOpacity, iconScale]);

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 0.9,
        useNativeDriver: true,
        tension: 500,
        friction: 8,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={onLongPress}
      activeOpacity={1}
      style={styles.tabItem}
      accessibilityRole="tab"
      accessibilityLabel={config.label}
    >
      <Animated.View style={[styles.tabContent, { transform: [{ scale: scaleAnim }] }]}>
        <Animated.View style={[styles.activePill, { opacity: pillOpacity }]} />
        <Animated.View style={[styles.iconWrapper, { transform: [{ scale: iconScale }] }]}>
          <Ionicons
            name={isActive ? config.icon : config.iconOutline}
            size={24}
            color={isActive ? BRAND_ACTIVE : INACTIVE_COLOR}
          />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={styles.tabBarWrapper} pointerEvents="box-none">
      <BlurView intensity={90} tint="light" style={[styles.tabBarInner, { paddingBottom: insets.bottom > 0 ? insets.bottom / 2 : 0 }]}>
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
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
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
      </BlurView>
    </View>
  );
}

const BAR_HEIGHT = 64;
const FAB_SIZE = 54;

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
    borderRadius: 36,
  },
  tabBarInner: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8ECF2',
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
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  activePill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    backgroundColor: BRAND_HIGHLIGHT,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabTouchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
    width: FAB_SIZE + 10,
    height: FAB_SIZE + 10,
  },
  fabGlowRing: {
    position: 'absolute',
    width: FAB_SIZE + 10,
    height: FAB_SIZE + 10,
    borderRadius: (FAB_SIZE + 10) / 2,
    backgroundColor: BRAND_YELLOW,
  },
  fabInner: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD740',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});
