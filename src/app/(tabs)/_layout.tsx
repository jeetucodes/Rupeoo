import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import CustomTabBar from '@/components/custom-tab-bar';

export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...(props as any)} />}
      screenOptions={{
        headerShown: false,
        lazy: false,
        freezeOnBlur: false,
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
  );
}

