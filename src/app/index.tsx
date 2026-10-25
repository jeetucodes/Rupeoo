import { useAuth } from '@/context/AuthContext';
import OnboardingScreen from './onboarding';
import { Redirect } from 'expo-router';

import AppShellSkeleton from '@/components/AppShellSkeleton';
import { consumePendingNotificationRoute } from '@/lib/notificationNavigation';

export default function IndexScreen() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <AppShellSkeleton />;
  }
  
  if (user) {
    const pendingRoute = consumePendingNotificationRoute();
    if (pendingRoute) {
      return <Redirect href={pendingRoute as any} />;
    }
    return <Redirect href="/(tabs)/dashboard" />;
  }
  
  return <OnboardingScreen />;
}

