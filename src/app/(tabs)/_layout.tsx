import React, { useRef, useEffect, useState } from 'react';
import { View, PanResponder, Keyboard, StyleSheet } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import CustomTabBar from '@/components/custom-tab-bar';

const TAB_ROUTES = [
  'dashboard',
  'transactions',
  'ai_insights',
  'settings',
];

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const activeTab = (segments[1] as string) || 'dashboard';
  const activeIndex = TAB_ROUTES.indexOf(activeTab) !== -1 ? TAB_ROUTES.indexOf(activeTab) : 0;

  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const keyboardVisibleRef = useRef(keyboardVisible);
  useEffect(() => {
    keyboardVisibleRef.current = keyboardVisible;
  }, [keyboardVisible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (keyboardVisibleRef.current || isNavigatingRef.current) return false;
        const { dx, dy } = gestureState;
        // Strictly horizontal: dx must be at least 25px and 2.2x vertical movement
        return Math.abs(dx) > 25 && Math.abs(dx) > Math.abs(dy) * 2.2;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderRelease: (_, gestureState) => {
        if (keyboardVisibleRef.current || isNavigatingRef.current) return;
        const { dx, vx } = gestureState;
        const SWIPE_THRESHOLD = 40;
        const VELOCITY_THRESHOLD = 0.25;

        const isSwipeLeft = dx < -SWIPE_THRESHOLD || (dx < -15 && vx < -VELOCITY_THRESHOLD);
        const isSwipeRight = dx > SWIPE_THRESHOLD || (dx > 15 && vx > VELOCITY_THRESHOLD);

        const currIdx = activeIndexRef.current;

        if (isSwipeLeft && currIdx < TAB_ROUTES.length - 1) {
          isNavigatingRef.current = true;
          router.navigate(`/(tabs)/${TAB_ROUTES[currIdx + 1]}` as any);
          setTimeout(() => {
            isNavigatingRef.current = false;
          }, 350);
        } else if (isSwipeRight && currIdx > 0) {
          isNavigatingRef.current = true;
          router.navigate(`/(tabs)/${TAB_ROUTES[currIdx - 1]}` as any);
          setTimeout(() => {
            isNavigatingRef.current = false;
          }, 350);
        }
      },
      onPanResponderTerminate: () => {
        isNavigatingRef.current = false;
      },
    })
  ).current;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...(props as any)} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
          animation: 'shift',
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{ title: 'Dashboard' }}
        />
        <Tabs.Screen
          name="transactions"
          options={{ title: 'Transactions' }}
        />
        <Tabs.Screen
          name="add_action"
          options={{ title: 'Add' }}
        />
        <Tabs.Screen
          name="ai_insights"
          options={{ title: 'Reports' }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: 'Settings' }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
