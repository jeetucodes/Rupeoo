import { useAuth } from '@/context/AuthContext';
import OnboardingScreen from './onboarding';
import { Redirect } from 'expo-router';

export default function IndexScreen() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return null;
  }
  
  if (user) {
    return <Redirect href="/(tabs)/dashboard" />;
  }
  
  return <OnboardingScreen />;
}
