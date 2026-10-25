import React, { useEffect, useState, Component } from 'react';
import { Stack, useRouter, useSegments, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => { });

// Global fallback safety timer (max 1.5s): guarantees splash screen NEVER hangs indefinitely under any circumstances
if (Platform.OS !== 'web') {
  setTimeout(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, 1500);
}
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
import { initDatabase, syncUserOfflineData, deleteTransaction, undoBillPayment, createNotification } from '@/lib/database';
import { confirmPendingAlert, dismissPendingAlert } from '@/lib/pendingInbox';
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
import { withTimeout } from '@/lib/safeStorage';
import { SelfHealingWatchdog } from '@/lib/selfHealing/SelfHealingWatchdog';
import { SelfHealingErrorBoundary } from '@/components/SelfHealingErrorBoundary';

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
          onOpenOffline={() => {
            this.setState({ hasError: false, error: null });
            SplashScreen.hideAsync().catch(() => {});
            router.replace('/(tabs)/dashboard');
          }}
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
import {
  getNotificationTargetRoute,
  setPendingNotificationRoute,
  consumePendingNotificationRoute,
  isNotificationResponseHandled,
  markNotificationResponseHandled,
} from '@/lib/notificationNavigation';
import { closeAutoAddDatabase } from '@/features/autoAdd/sqliteStorage';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, settings, appConfig } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [startupTimeout, setStartupTimeout] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const lastActivePullRef = React.useRef<number>(Date.now());
  const hasLoggedTimingsRef = React.useRef<boolean>(false);

  // 1.5-second startup watchdog fallback: clears immediately when loading finishes
  useEffect(() => {
    if (!loading) {
      setStartupTimeout(false);
      return;
    }
    const timer = setTimeout(() => {
      if (loading) {
        setStartupTimeout(true);
        SplashScreen.hideAsync().catch(() => {});
        SelfHealingWatchdog.triggerWatchdogRecovery('auth_guard_hydration_timeout');
        recordCrash(new Error('App startup exceeded 1.5s watchdog timeout'), false, 'startup_watchdog').catch(() => {});
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (user?.uid) {
      SelfHealingWatchdog.initialize(user.uid);
    }
  }, [user?.uid]);

  // Subscribe to background migration status
  useEffect(() => {
    return subscribeMigrationStatus(setMigrationStatus);
  }, []);

  useEffect(() => {
    // Safety timer to prevent splash screen hanging (max 1.5s fallback)
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => { });
    }, 1500);

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

    // Lifecycle triggers on resume: do NOT rebind 24/7 background listeners; throttle routines to background
    let resumeTask: any = null;
    let lastResumeScheduleTime = 0;
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const now = Date.now();
        if (now - lastResumeScheduleTime > 4 * 60 * 60 * 1000) {
          lastResumeScheduleTime = now;
          resumeTask = setTimeout(() => {
            InteractionManager.runAfterInteractions(() => {
              scheduleNext48h(user.uid).catch(() => {});
            });
          }, 3000);
        }
      } else {
        if (resumeTask) {
          clearTimeout(resumeTask);
          resumeTask = null;
        }
        // Release SQLite connection and locks immediately when leaving foreground
        closeAutoAddDatabase();
      }
    });

    return () => {
      stopSyncEngine();
      if (resumeTask) clearTimeout(resumeTask);
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
      const notifId = response?.notification?.request?.identifier || '';
      const action = response.actionIdentifier;
      const data = response?.notification?.request?.content?.data as any;
      const responseDate = (response.notification as any)?.date || 0;
      const dedupeKey = `${notifId}_${action}_${responseDate}`;

      if (isNotificationResponseHandled(dedupeKey)) {
        return;
      }
      markNotificationResponseHandled(dedupeKey);

      // Disarm watchdog so entering non-dashboard screen doesn't cause false positive freeze reset
      SelfHealingWatchdog.disarmWatchdog();
      SplashScreen.hideAsync().catch(() => {});

      const navigateToTarget = (route: string) => {
        if (loading) {
          setPendingNotificationRoute(route);
        } else {
          try {
            router.push(route as any);
          } catch {
            setPendingNotificationRoute(route);
          }
        }
      };

      // 1. Interactive Button Actions
      if (action === 'ADD_INBOX_ACTION') {
        if (data?.pendingId) {
          const targetUid = (data.userId as string) || user?.uid || 'local';
          confirmPendingAlert(targetUid, data.pendingId)
            .then((txId) => {
              if (txId) {
                Toast.show({
                  type: 'success',
                  text1: 'Transaction Added ✅',
                  text2: 'Alert confirmed and added to transactions.',
                  visibilityTime: 3500,
                });
                import('@/features/notifications').then(({ scheduleNext48h }) => {
                  scheduleNext48h(targetUid).catch(() => {});
                }).catch(() => {});
              }
            })
            .catch(() => {});
        }
        return;
      }

      if (action === 'DISMISS_INBOX_ACTION') {
        if (data?.pendingId) {
          const targetUid = (data.userId as string) || user?.uid || 'local';
          dismissPendingAlert(targetUid, data.pendingId).catch(() => {});
          Toast.show({
            type: 'info',
            text1: 'Alert Dismissed',
            text2: 'Alert removed from pending inbox.',
            visibilityTime: 2500,
          });
        }
        return;
      }

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
                import('@/features/notifications').then(({ scheduleNext48h }) => {
                  scheduleNext48h(targetUid).catch(() => {});
                }).catch(() => {});
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
                import('@/features/notifications').then(({ scheduleNext48h }) => {
                  scheduleNext48h(targetUid).catch(() => {});
                }).catch(() => {});
              })
              .catch(() => {});
          }
        }
        return;
      }

      if (action === 'CHANGE_CATEGORY_ACTION') {
        if (data?.transactionId) {
          navigateToTarget(`/transaction/${data.transactionId}?openCategory=true`);
        } else if (data?.pendingId) {
          navigateToTarget('/pending-inbox');
        } else {
          navigateToTarget('/(tabs)/dashboard');
        }
        return;
      }

      if (action === 'VIEW_DETAILS_ACTION') {
        navigateToTarget('/daily-report');
        return;
      }

      if (action === 'SEE_SPENDING_ACTION') {
        navigateToTarget('/budget');
        return;
      }

      if (action === 'ADD_EXPENSE_ACTION') {
        navigateToTarget('/add');
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
      const targetRoute = getNotificationTargetRoute(data);
      navigateToTarget(targetRoute);
    };

    // Check if app was opened from killed state by tapping notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    }).catch(() => {});

    // Active foreground/background response listener
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    // Clean up any stray/stuck sample notifications from previous sessions
    if (Platform.OS !== 'web') {
      Notifications.dismissNotificationAsync('rupeo_sample_preview').catch(() => {});
      Notifications.cancelScheduledNotificationAsync('rupeo_sample_preview').catch(() => {});
    }

    // Active listener for when ANY notification is delivered/received on device
    // (captures morning/evening routines, daily reports, auto-add alerts into in-app inbox)
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      try {
        const identifier = notification.request.identifier || '';
        const content = notification.request.content;
        const data: Record<string, any> = (content.data || {}) as Record<string, any>;

        // CRITICAL ANTI-LOOP GUARDS:
        // 1. Ignore sample preview notifications completely
        if (
          data.type === 'sample' ||
          data.isSample ||
          data.silentInbox ||
          data.source === 'sample_preview' ||
          identifier === 'rupeo_sample_preview'
        ) {
          return;
        }

        // 2. Ignore push loopbacks from remote listener
        if (identifier.startsWith('push_') || data.source === 'admin_push') {
          return;
        }

        const type = (data.type === 'budget' || data.type === 'budget_over' || data.type === 'budget_80')
          ? 'budget'
          : (data.type === 'reminder' || data.type === 'report' || data.slotId)
            ? 'reminder'
            : 'system';

        createNotification(user?.uid, {
          id: identifier || undefined,
          title: content.title || 'Rupeo Alert',
          message: content.body || '',
          type,
          source: data.source || data.type || data.typeKey || 'os_notification',
          silentPush: true, // NEVER re-trigger a remote push
        }).catch(() => {});
      } catch (err) {
        warn('Error recording received notification into inbox:', err);
      }
    });

    return () => {
      sub.remove();
      receivedSub.remove();
    };
  }, [router, user?.uid]);

  useEffect(() => {
    if (loading) return;

    try {
      // Check if a pending notification route exists that needs to be consumed
      const pendingNotification = consumePendingNotificationRoute();
      if (pendingNotification && user) {
        SelfHealingWatchdog.disarmWatchdog();
        SplashScreen.hideAsync().catch(() => {});
        router.replace(pendingNotification as any);
        return;
      }

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
    } catch (navErr) {
      warn('[Navigation] Guard caught error:', navErr);
    }
  }, [user, loading, settings, segments]);

  // Sync widgets on App foreground (debounced and deferred after interactions)
  useEffect(() => {
    let widgetTimer: any = null;
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active' && user?.uid) {
        if (widgetTimer) clearTimeout(widgetTimer);
        widgetTimer = setTimeout(() => {
          InteractionManager.runAfterInteractions(() => {
            syncWidgetWithTransactions(user.uid).catch(() => {});
          });
        }, 1500);
      } else if (widgetTimer) {
        clearTimeout(widgetTimer);
        widgetTimer = null;
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      if (widgetTimer) clearTimeout(widgetTimer);
      sub.remove();
    };
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

  // Initialize Ads respecting Real-time Remote Admin Config (deferred after interactions with timeout)
  useEffect(() => {
    if (appConfig && !loading) {
      const task = InteractionManager.runAfterInteractions(() => {
        withTimeout(initializeAds(appConfig), 4000, undefined).catch((e) => warn('Ads init warning:', e));
      });
      return () => task.cancel();
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
      // If user session is already present, render cached Home screen immediately
      if (user) {
        return <>{children}</>;
      }
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
          onOpenOffline={() => {
            setStartupTimeout(false);
            SplashScreen.hideAsync().catch(() => {});
            router.replace('/(tabs)/dashboard');
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
          onOpenOffline={() => {
            setStartupTimeout(false);
            SplashScreen.hideAsync().catch(() => {});
            router.replace('/(tabs)/dashboard');
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
  const [softResetKey, setSoftResetKey] = useState(0);

  useEffect(() => {
    installGlobalErrorHandler((err) => {
      SplashScreen.hideAsync().catch(() => {});
    });

    // Initialize Self-Healing Watchdog system (1.5s startup watchdog + UI heartbeat monitor)
    SelfHealingWatchdog.initialize(auth?.currentUser?.uid);

    const unsubReset = SelfHealingWatchdog.onSoftReset((reason) => {
      log('[RootLayout] Executing Soft UI Reset:', reason);
      setSoftResetKey((k) => k + 1);
    });

    const unsubBypass = SelfHealingWatchdog.onBypassLoading(() => {
      SplashScreen.hideAsync().catch(() => {});
    });

    initDatabase()
      .then(() => {
        dbOpenDuration = Date.now() - startupStartTime;
      })
      .catch((e) => logError('Database init error:', e));

    // Clear any stale migration lock left behind if app was previously killed
    AsyncStorage.removeItem('@rupeo_migration_in_progress').catch(() => {});

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
      unsubReset();
      unsubBypass();
      task.cancel();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SelfHealingErrorBoundary name="RootApp">
          <RootErrorBoundary>
            <AuthProvider>
              <AuthGuard>
                <View
                  key={`root-shell-${softResetKey}`}
                  style={[styles.appContainer, isTransparentOverlay && { backgroundColor: 'transparent' }]}
                >
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
                      name="settings/finance-apps"
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
      </SelfHealingErrorBoundary>
    </SafeAreaProvider>
  </GestureHandlerRootView>
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
