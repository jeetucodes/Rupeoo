import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

export default function AddActionDummyScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/add');
  }, [router]);
  return <View style={{ flex: 1, backgroundColor: '#F8FAFC' }} />;
}
