import { useAuth } from '@/context/AuthContext';
import OnboardingScreen from './onboarding';
import { Redirect } from 'expo-router';

import AppShellSkeleton from '@/components/AppShellSkeleton';

export default function IndexScreen() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <AppShellSkeleton />;
  }
  
  if (user) {
    return <Redirect href="/(tabs)/dashboard" />;
  }
  
  return <OnboardingScreen />;
}
