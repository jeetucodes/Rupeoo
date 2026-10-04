import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

export default function AddActionDummyScreen() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      // If this dummy tab ever receives direct focus, redirect to dashboard.
      // The '+' FAB button in CustomTabBar opens /add directly.
      router.replace('/(tabs)/dashboard');
    }, [router])
  );

  return <View style={{ flex: 1, backgroundColor: '#F8FAFC' }} />;
}

