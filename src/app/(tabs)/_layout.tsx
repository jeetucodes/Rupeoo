import React, { useRef, useEffect, useState } from 'react';
import { View, PanResponder, Keyboard, StyleSheet, useWindowDimensions, Easing } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import * as Haptics from 'expo-haptics';
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
  const { width: windowWidth } = useWindowDimensions();
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
      onMoveShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (keyboardVisibleRef.current || isNavigatingRef.current) return false;
        const { dx, dy, vx } = gestureState;

        // Never intercept vertical scrolls
        if (Math.abs(dy) >= Math.abs(dx)) return false;

        // Distinct horizontal swipe:
        // Must be predominantly horizontal to avoid diagonal misdetection
        const isDominantHorizontal = Math.abs(dx) > Math.abs(dy) * 2.2;
        const isDragSwipe = Math.abs(dx) > 30 && isDominantHorizontal;
        const isFlickSwipe = Math.abs(dx) > 16 && Math.abs(vx) > 0.35 && isDominantHorizontal;

        return isDragSwipe || isFlickSwipe;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (keyboardVisibleRef.current || isNavigatingRef.current) return;

        const { dx, vx } = gestureState;
        const currIdx = activeIndexRef.current;

        const isSwipeLeft = dx < -35 || (dx < -15 && vx < -0.22);
        const isSwipeRight = dx > 35 || (dx > 15 && vx > 0.22);

        if (isSwipeLeft && currIdx < TAB_ROUTES.length - 1) {
          isNavigatingRef.current = true;
          Haptics.selectionAsync().catch(() => {});
          router.navigate(`/(tabs)/${TAB_ROUTES[currIdx + 1]}` as any);
          setTimeout(() => {
            isNavigatingRef.current = false;
          }, 260);
        } else if (isSwipeRight && currIdx > 0) {
          isNavigatingRef.current = true;
          Haptics.selectionAsync().catch(() => {});
          router.navigate(`/(tabs)/${TAB_ROUTES[currIdx - 1]}` as any);
          setTimeout(() => {
            isNavigatingRef.current = false;
          }, 260);
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
          lazy: false,
          freezeOnBlur: false,
          animation: 'shift',
          transitionSpec: {
            animation: 'timing',
            config: {
              duration: 200,
              easing: Easing.out(Easing.poly(4)),
            },
          },
          sceneStyleInterpolator: ({ current }: any) => ({
            sceneStyle: {
              opacity: current.progress.interpolate({
                inputRange: [-1, -0.5, 0, 0.5, 1],
                outputRange: [0, 0.85, 1, 0.85, 0],
              }),
              transform: [
                {
                  translateX: current.progress.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [-windowWidth * 0.25, 0, windowWidth * 0.25],
                  }),
                },
              ],
            },
          }),
        } as any}
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
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              router.push('/add');
            },
          }}
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
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
});
