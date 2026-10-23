import React, { useEffect, useState, Component } from 'react';
import { Stack, useRouter, useSegments, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => { });
import {
  useColorScheme,
  View,
  Text,
  Platform,
  StyleSheet,
  TouchableOpacity,
  AppState,
  InteractionManager,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { initDatabase, syncUserOfflineData, deleteTransaction, undoBillPayment } from '@/lib/database';
import { initializeAds } from '@/lib/ads';
import Toast from 'react-native-toast-message';
import { customToastConfig } from '@/components/custom-toast';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import { useAppUpdate } from '@/lib/appUpdate';
import { UpdateAvailableModal } from '@/components/UpdateAvailableModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import '@/widgets';
import { syncWidgetWithTransactions } from '@/lib/widgetSync';
import { preloadFriendsAndUdhar } from '@/lib/udharStorage';
import { auth } from '@/lib/firebase';
import { isVerificationRequired } from '@/lib/authVerification';
import { isListenerEnabled, requestRebind } from '@/features/autoAdd/nativeModule';
import { setupAutoAddNotificationChannel } from '@/features/autoAdd/notifTask';
import { runMojibakeMigration } from '@/utils/migrateMojibake';
import { pullFromCloud } from '@/lib/cloudSync';
import { runBackgroundMigrations, subscribeMigrationStatus, MigrationStatus } from '@/lib/backgroundMigrations';
import AppShellSkeleton from '@/components/AppShellSkeleton';
import { warn, error as logError, log } from '@/lib/logger';
import { initSyncEngine } from '@/lib/syncEngine';
import { installGlobalErrorHandler, recordCrash } from '@/lib/crashReporting';
import { StartupRecoveryScreen } from '@/components/StartupRecoveryScreen';

const startupStartTime = Date.now();
let dbOpenDuration = 0;
let authDuration = 0;
let firstRenderDuration = 0;

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
    logError('RootErrorBoundary caught an unhandled error:', error, errorInfo);
    recordCrash(error, true, 'root_error_boundary').catch(() => {});
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
    try {
      SplashScreen.hideAsync().catch(() => {});
      const hasSession = Boolean(auth?.currentUser);
      if (hasSession) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/login');
      }
    } catch (e) {
      warn('ErrorBoundary recovery navigation warning:', e);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <StartupRecoveryScreen
          onRetry={this.resetError}
          errorMessage={this.state.error?.message}
          isWatchdogTriggered={false}
        />
      );
    }
    return this.props.children;
  }
}

import * as Notifications from 'expo-notifications';
import {
  requestNotificationPermissions,
  registerDeviceForPushNotifications,
  cancelAndDismissWelcomeNotification,
  startRealtimeNotificationWatcher,
  runOneTimeOldNotificationMigration,
  setupNotificationChannels,
  scheduleNext48h,
} from '@/lib/notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, settings, appConfig } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [startupTimeout, setStartupTimeout] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const lastActivePullRef = React.useRef<number>(Date.now());
  const hasLoggedTimingsRef = React.useRef<boolean>(false);

  // 8-second startup timeout: show recovery fallback instead of blank screen
  useEffect(() => {
    const timer = setTimeout(() => {
      setStartupTimeout(true);
      SplashScreen.hideAsync().catch(() => {});
      recordCrash(new Error('App startup exceeded 8 seconds watchdog timeout'), false, 'startup_watchdog').catch(() => {});
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  // Subscribe to background migration status
  useEffect(() => {
    return subscribeMigrationStatus(setMigrationStatus);
  }, []);

  useEffect(() => {
    // Safety timer to prevent splash screen hanging
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => { });
    }, 3500);

    if (!loading) {
      SplashScreen.hideAsync().catch(() => { });
      clearTimeout(timer);
      if (authDuration === 0) {
        authDuration = Date.now() - startupStartTime;
      }
    }

    return () => clearTimeout(timer);
  }, [loading]);

  // Dev startup timing logging
  useEffect(() => {
    if (!loading && !hasLoggedTimingsRef.current) {
      hasLoggedTimingsRef.current = true;
      firstRenderDuration = Date.now() - startupStartTime;
      if (__DEV__) {
        log(`[StartupTimings] dbOpen: ${dbOpenDuration}ms, auth: ${authDuration}ms, firstRender: ${firstRenderDuration}ms`);
      }
    }
  }, [loading]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      unsub = startRealtimeNotificationWatcher(user?.uid);

      if (user?.uid) {
        requestNotificationPermissions()
          .then(granted => {
            if (granted) return registerDeviceForPushNotifications(user.uid);
            return null;
          })
          .catch(error => warn('Push registration error:', error));
      }
    });

    return () => {
      task.cancel();
      if (unsub) unsub();
    };
  }, [user?.uid]);

  // Automatic background data sync via event-driven SyncEngine (single-flight, debounced, pauses when backgrounded)
  useEffect(() => {
    if (!user?.uid) return;

    // Store active user ID for background headless notification task
    AsyncStorage.setItem('@rupeo_active_user_id', user.uid).catch(() => {});

    // Preload friends and udhar into memory cache instantly (<1ms)
    preloadFriendsAndUdhar(user.uid).catch(() => {});

    // Initialize single-flight, battery-friendly sync engine
    const stopSyncEngine = initSyncEngine(user.uid);

    // Lifecycle triggers for local non-sync notifications & widget
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        scheduleNext48h(user.uid).catch(() => {});
        if (Platform.OS === 'android') {
          requestRebind().catch(() => {});
          isListenerEnabled().catch(() => {});
        }
      }
    });

    return () => {
      stopSyncEngine();
      appStateSub.remove();
    };
  }, [user?.uid]);

  // Startup: run background migrations in chunks, setup channels & schedule lookahead
  useEffect(() => {
    runBackgroundMigrations(user?.uid).catch((e) => warn('[Migration] Background migration error:', e));
    setupNotificationChannels().catch(() => {});
    scheduleNext48h(user?.uid).catch(() => {});
    if (Platform.OS === 'android') {
      requestRebind().catch(() => {});
      isListenerEnabled().catch(() => {});
      setupAutoAddNotificationChannel().catch(() => {});
    }
  }, [user?.uid]);

  useEffect(() => {
    const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
      if (!response) return;
      const data = response?.notification?.request?.content?.data as any;
      const action = response.actionIdentifier;

      // 1. Interactive Button Actions
      if (action === 'UNDO_ACTION') {
        if (data?.transactionId) {
          const targetUid = (data.userId as string) || user?.uid || 'local';
          if (data.billId) {
            undoBillPayment(targetUid, data.billId as string, data.transactionId as string, data.prevDueDate as string)
              .then(() => {
                Toast.show({
                  type: 'info',
                  text1: 'Bill Payment Undone',
                  text2: 'Bill marked unpaid and transaction removed.',
                  visibilityTime: 3500,
                });
                scheduleNext48h(targetUid).catch(() => {});
              })
              .catch(() => {});
          } else {
            deleteTransaction(targetUid, data.transactionId as string)
              .then(() => {
                Toast.show({
                  type: 'info',
                  text1: 'Transaction Undone',
                  text2: 'The auto-added transaction was removed.',
                  visibilityTime: 3500,
                });
                scheduleNext48h(targetUid).catch(() => {});
              })
              .catch(() => {});
          }
        }
        return;
      }

      if (action === 'CHANGE_CATEGORY_ACTION') {
        if (data?.transactionId) {
          router.push(`/transaction/${data.transactionId}` as any);
        } else {
          router.push('/(tabs)/dashboard');
        }
        return;
      }

      if (action === 'VIEW_DETAILS_ACTION') {
        router.push('/daily-report');
        return;
      }

      if (action === 'SEE_SPENDING_ACTION') {
        router.push('/budget');
        return;
      }

      if (action === 'ADD_EXPENSE_ACTION') {
        router.push('/add');
        return;
      }

      if (action === 'NOTHING_TODAY_ACTION') {
        Toast.show({
          type: 'success',
          text1: 'Zero Spend Noted! 👏',
          text2: 'Great discipline today!',
          visibilityTime: 2500,
        });
        return;
      }

      // 2. Notification Body Tap Navigation
      const type = data?.type || data?.typeKey;
      if (type === 'daily_report' || type === 'report' || data?.typeKey === 'daily_report') {
        router.push('/daily-report');
      } else if (
        type === 'budget_over' ||
        type === 'budget_80' ||
        type === 'budget_alert' ||
        type === 'budget'
      ) {
        router.push('/budget');
      } else if (type === 'AUTO_ADD_TRANSACTION' || type === 'transaction_added') {
        if (data?.transactionId) {
          router.push(`/transaction/${data.transactionId}` as any);
        } else {
          router.push('/(tabs)/dashboard');
        }
      } else if (
        type === 'welcome_notification' ||
        data?.route === '/add' ||
        type === 'morning' ||
        type === 'morning_with_budget' ||
        type === 'lunch' ||
        type === 'lunch_spent' ||
        type === 'teatime' ||
        type === 'evening' ||
        type === 'reminder'
      ) {
        router.push('/add');
      } else {
        router.push('/notifications');
      }
    };

    // Check if app was opened from killed state by tapping notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    }).catch(() => {});

    // Active foreground/background response listener
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    return () => sub.remove();
  }, [router, user?.uid]);

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
      currentSegment === 'setup' ||
      currentSegment === 'verify-email';

    if (!user && !isPublicRoute) {
      cancelAndDismissWelcomeNotification().catch(() => {});
      if (currentSegment === 'quick-add' || currentSegment === 'quick-add-voice' || currentSegment === 'add') {
        AsyncStorage.setItem('@rupeo_pending_redirect', `/${currentSegment}`).catch(() => {});
      }
      router.replace('/login');
    } else if (!user) {
      // User is logged out on a public route - ensure pending welcome notification is cancelled & dismissed
      cancelAndDismissWelcomeNotification().catch(() => {});
    } else if (user) {
      // A9. Gate unverified email/password accounts created after VERIFICATION_CUTOFF
      if (isVerificationRequired(auth?.currentUser)) {
        if (currentSegment !== 'verify-email') {
          router.replace('/verify-email');
        }
        return;
      } else if (currentSegment === 'verify-email') {
        router.replace(user.hasSetStartingBalance ? '/(tabs)/dashboard' : '/starting-balance');
        return;
      }

      // Sync widget with user's latest transaction summary (deferred after interactions)
      InteractionManager.runAfterInteractions(() => {
        syncWidgetWithTransactions(user.uid).catch(() => {});
      });

      if (currentSegment === 'login') {
        AsyncStorage.getItem('@rupeo_pending_redirect').then((pending) => {
          if (pending) {
            AsyncStorage.removeItem('@rupeo_pending_redirect').catch(() => {});
            router.replace(pending as any);
          } else {
            router.replace(user.hasSetStartingBalance ? '/(tabs)/dashboard' : '/starting-balance');
          }
        }).catch(() => {
          router.replace(user.hasSetStartingBalance ? '/(tabs)/dashboard' : '/starting-balance');
        });
      }
    }
  }, [user, loading, settings, segments]);

  // Sync widgets on App foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active' && user?.uid) {
        syncWidgetWithTransactions(user.uid).catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [user?.uid]);

  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      try {
        const parsed = Linking.parse(event.url);
        if (parsed.path === 'quick-add' || parsed.path === 'quick-add-voice' || parsed.path === 'add') {
          const typeParam = parsed.queryParams?.type ? `?type=${parsed.queryParams.type}` : '';
          const fullPath = `/${parsed.path}${typeParam}`;
          if (!user) {
            AsyncStorage.setItem('@rupeo_pending_redirect', fullPath).catch(() => {});
          }
        }
      } catch (err) {
        warn('Deep link parse error:', err);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    }).catch(() => {});

    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, [user]);

  // Initialize Ads respecting Real-time Remote Admin Config
  useEffect(() => {
    if (appConfig) {
      initializeAds(appConfig).catch((e) => warn('Ads init warning:', e));
    }
  }, [loading, appConfig?.networkAdsEnabled, appConfig?.showAds, appConfig?.adMobTestMode]);

  const currentSegment = segments[0] as string | undefined;
  const isNormalScreen =
    !loading &&
    !appConfig?.maintenanceMode &&
    currentSegment !== 'index' &&
    currentSegment !== 'onboarding' &&
    currentSegment !== 'setup';

  const {
    updateState,
    dismissSoftUpdate,
  } = useAppUpdate(appConfig, isNormalScreen);

  if (loading || (migrationStatus?.needsProgressOverlay && migrationStatus.inProgress)) {
    if (startupTimeout) {
      SplashScreen.hideAsync().catch(() => {});
      return (
        <StartupRecoveryScreen
          onRetry={() => {
            setStartupTimeout(false);
            SplashScreen.hideAsync().catch(() => {});
            if (user) {
              router.replace('/(tabs)/dashboard');
            } else {
              router.replace('/login');
            }
          }}
          isWatchdogTriggered={true}
        />
      );
    }
    return (
      <AppShellSkeleton
        startupTimeout={startupTimeout}
        migrationStatus={migrationStatus}
      />
    );
  }

  // Real-time Maintenance Mode Block
  if (appConfig?.maintenanceMode) {
    return <MaintenanceScreen />;
  }

  // Auth Guard: If not logged in and on a protected screen, render skeleton while redirecting to /login
  // This guarantees protected screens never mount or re-render with user = null and never flash a white screen
  const isPublicRoute =
    !currentSegment ||
    currentSegment === 'index' ||
    currentSegment === 'onboarding' ||
    currentSegment === 'login' ||
    currentSegment === 'forgot-password' ||
    currentSegment === 'starting-balance' ||
    currentSegment === 'setup' ||
    currentSegment === 'verify-email';

  if (!user && !isPublicRoute) {
    if (startupTimeout) {
      SplashScreen.hideAsync().catch(() => {});
      return (
        <StartupRecoveryScreen
          onRetry={() => {
            setStartupTimeout(false);
            SplashScreen.hideAsync().catch(() => {});
            router.replace('/login');
          }}
          isWatchdogTriggered={true}
        />
      );
    }
    return <AppShellSkeleton />;
  }

  return (
    <>
      {children}
      <UpdateAvailableModal
        visible={updateState.mode !== 'NONE'}
        mode={updateState.mode}
        title={updateState.title}
        message={updateState.message}
        updateUrl={updateState.updateUrl}
        latestVersion={updateState.latestVersion}
        onDismiss={dismissSoftUpdate}
      />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const currentSegment = segments[0] as string | undefined;
  const isTransparentOverlay = currentSegment === 'quick-add-voice';

  useEffect(() => {
    installGlobalErrorHandler((err) => {
      SplashScreen.hideAsync().catch(() => {});
    });

    initDatabase()
      .then(() => {
        dbOpenDuration = Date.now() - startupStartTime;
      })
      .catch((e) => logError('Database init error:', e));

    // One-time migration: Cancel all previously scheduled routines, bills & quiet hours local notifications
    const CANCEL_MIGRATION_KEY = '@rupeo_cancelled_legacy_scheduled_notifs_v1';
    AsyncStorage.getItem(CANCEL_MIGRATION_KEY).then(async (migrated) => {
      if (!migrated) {
        try {
          await Notifications.cancelAllScheduledNotificationsAsync();
          await AsyncStorage.setItem(CANCEL_MIGRATION_KEY, 'true');
        } catch {
          // ignore
        }
      }
    }).catch(() => {});

    const task = InteractionManager.runAfterInteractions(() => {
      // App start safety check: If no logged-in session, cancel and dismiss welcome notification
      if (!auth?.currentUser) {
        cancelAndDismissWelcomeNotification().catch(() => {});
      }
      requestNotificationPermissions()
        .then(() => {})
        .catch((e) => logError('Notification permission error:', e));
    });
    return () => {
      task.cancel();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <RootErrorBoundary>
        <AuthProvider>
          <AuthGuard>
            <View style={[styles.appContainer, isTransparentOverlay && { backgroundColor: 'transparent' }]}>
              <View style={[styles.appContent, isTransparentOverlay && { backgroundColor: 'transparent' }]}>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    animation: 'none',
                    contentStyle: { backgroundColor: isTransparentOverlay ? 'transparent' : '#F1F5F9' }
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
                  <Stack.Screen name="udhar" />
                  <Stack.Screen name="transaction/[id]" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                    name="add"
                    options={{
                      presentation: 'modal',
                      animation: 'slide_from_bottom'
                    }}
                  />
                  <Stack.Screen
                    name="quick-add"
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      contentStyle: { backgroundColor: '#FFFFFF' },
                    }}
                  />
                  <Stack.Screen
                    name="quick-add-voice"
                    options={{
                      presentation: 'transparentModal',
                      animation: 'fade',
                      contentStyle: { backgroundColor: 'transparent' }
                    }}
                  />
                  <Stack.Screen
                    name="sms-import"
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: '#F8FAFC' },
                    }}
                  />
                  <Stack.Screen
                    name="pending-inbox"
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: '#F8FAFC' },
                    }}
                  />
                  <Stack.Screen
                    name="settings/bank-alerts"
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: '#F8FAFC' },
                    }}
                  />
                  <Stack.Screen
                    name="settings/notifications"
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: '#F8FAFC' },
                    }}
                  />
                  <Stack.Screen
                    name="daily-report"
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: '#F8FAFC' },
                    }}
                  />
                  <Stack.Screen
                    name="settings/advanced"
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: '#F8FAFC' },
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
