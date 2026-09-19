import React, { useEffect, useState, Component } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { 
  useColorScheme, 
  View, 
  Text, 
  Platform, 
  StyleSheet, 
  TouchableOpacity 
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { initDatabase } from '@/lib/database';
import { initializeAds } from '@/lib/ads';
import Toast from 'react-native-toast-message';
import { customToastConfig } from '@/components/custom-toast';
import MaintenanceScreen from '@/components/MaintenanceScreen';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('RootErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <View style={errorStyles.card}>
            <View style={errorStyles.iconContainer}>
              <Ionicons name="alert-circle" size={44} color="#EF4444" />
            </View>
            <Text style={errorStyles.title}>Something went wrong</Text>
            <Text style={errorStyles.subtitle}>
              {this.state.error?.message || 'An unexpected runtime error occurred.'}
            </Text>
            <TouchableOpacity 
              style={errorStyles.retryButton} 
              onPress={this.resetError} 
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={18} color="#1C1C1E" style={{ marginRight: 8 }} />
              <Text style={errorStyles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

import AppLoadingSkeleton from '@/components/app-loading-skeleton';

import * as Notifications from 'expo-notifications';
import { 
  requestNotificationPermissions, 
  registerDeviceForPushNotifications,
  sendWelcomeNotification, 
  setupPeriodicSmartNotifications,
  startRealtimeNotificationWatcher
} from '@/lib/notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, settings, appConfig } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const unsub = startRealtimeNotificationWatcher(user?.uid);

    if (user?.uid) {
      requestNotificationPermissions()
        .then(granted => {
          if (granted) return registerDeviceForPushNotifications(user.uid);
          return null;
        })
        .catch(error => console.warn('Push registration error:', error));
    }

    return () => {
      if (unsub) unsub();
    };
  }, [user?.uid]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'budget_alert' || data?.type === 'budget') {
        router.push('/budget');
      } else {
        router.push('/notifications');
      }
    });

    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (loading) return;

    const currentSegment = segments[0] as string | undefined;
    const isPublicRoute =
      !currentSegment ||
      currentSegment === 'index' ||
      currentSegment === 'onboarding' ||
      currentSegment === 'login' ||
      currentSegment === 'forgot-password' ||
      currentSegment === 'starting-balance' ||
      currentSegment === 'setup';

    if (!user && !isPublicRoute) {
      router.replace('/login');
    } else if (user) {
      if (currentSegment === 'login') {
        router.replace(user.hasSetStartingBalance ? '/(tabs)/dashboard' : '/starting-balance');
      }
    }
  }, [user, loading, settings, segments]);

  if (loading) {
    return <AppLoadingSkeleton />;
  }

  // Real-time Maintenance Mode Block
  if (appConfig?.maintenanceMode) {
    return <MaintenanceScreen />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initDatabase().catch((e) => console.error('Database init error:', e));
    initializeAds().catch((e) => console.warn('AdMob init error:', e));
    requestNotificationPermissions()
      .then((granted) => {
        if (granted) {
          sendWelcomeNotification().catch(() => {});
          setupPeriodicSmartNotifications().catch(() => {});
        }
      })
      .catch((e) => console.error('Notification permission error:', e));
  }, []);

  return (
    <SafeAreaProvider>
      <RootErrorBoundary>
        <AuthProvider>
          <AuthGuard>
            <View style={styles.appContainer}>
              <View style={styles.appContent}>
                <Stack 
                  screenOptions={{ 
                    headerShown: false,
                    animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
                    contentStyle: { backgroundColor: '#F1F5F9' }
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="login" />
                  <Stack.Screen name="forgot-password" />
                  <Stack.Screen name="starting-balance" />
                  <Stack.Screen name="setup" />
                  <Stack.Screen name="onboarding" />
                  <Stack.Screen name="edit-profile" />
                  <Stack.Screen name="notifications" />
                  <Stack.Screen name="budget" />
                  <Stack.Screen name="categories" />
                  <Stack.Screen name="premium" />
                  <Stack.Screen name="reminders" />
                  <Stack.Screen name="split-qr" />
                  <Stack.Screen name="transaction/[id]" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen 
                    name="add" 
                    options={{ 
                      presentation: 'modal',
                      animation: 'slide_from_bottom'
                    }} 
                  />
                </Stack>
              </View>
            </View>
          </AuthGuard>
        </AuthProvider>
        <StatusBar style="dark" />
        <Toast config={customToastConfig} topOffset={Platform.OS === 'ios' ? 55 : 45} />
      </RootErrorBoundary>
    </SafeAreaProvider>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F7F8FC',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
    fontWeight: '500',
  },
  retryButton: {
    flexDirection: 'row',
    backgroundColor: '#FFD740',
    paddingHorizontal: 28,
    paddingVertical: 15,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
    width: '100%',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1C1C1E',
  },
});

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    ...(Platform.OS === 'web' ? { alignItems: 'center' } : {}),
  },
  appContent: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : undefined,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 24px rgba(0,0,0,0.1)' } : {}),
  },
});
