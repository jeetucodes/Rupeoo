import test from 'node:test';
import assert from 'node:assert';
import {
  WELCOME_NOTIFICATION_ID,
  WELCOME_SCHEDULE_DELAY_SECONDS,
  WELCOME_SCHEDULED_KEY_PREFIX,
  WELCOME_SHOWN_KEY_PREFIX,
  WELCOME_CANCELLED_ON_LOGOUT_PREFIX,
  getWelcomeNotificationContent,
  shouldScheduleWelcomeNotification,
  shouldPresentWelcomeNotification,
  calculateRemainingWelcomeDelay,
  determineExistingUserStatus,
} from '../welcomeNotificationCore.ts';

/**
 * In-memory Mock State Harness for Welcome Notification tests.
 * Simulates OS Notifications queue, AsyncStorage, Auth session, and Settings.
 */
class WelcomeNotificationTestHarness {
  public asyncStorage: Map<string, string> = new Map();
  public scheduledNotifications: Map<string, any> = new Map();
  public dismissedNotifications: Set<string> = new Set();
  public currentAuthUser: { uid: string; displayName?: string | null } | null = null;
  public masterNotificationsEnabled: boolean = true;
  public osPermissionStatus: 'granted' | 'denied' = 'granted';
  public firestoreUserDoc: Record<string, any> | null = null;
  public offlineTransactions: any[] = [];
  public appOpenCount: number = 0;

  // AsyncStorage methods
  async getItem(key: string): Promise<string | null> {
    return this.asyncStorage.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.asyncStorage.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.asyncStorage.delete(key);
  }

  // Flags helpers
  async getWelcomeScheduledAt(userId: string): Promise<number | null> {
    const val = await this.getItem(`${WELCOME_SCHEDULED_KEY_PREFIX}${userId}`);
    if (!val) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  }
  async setWelcomeScheduledAt(userId: string, timestamp: number): Promise<void> {
    await this.setItem(`${WELCOME_SCHEDULED_KEY_PREFIX}${userId}`, String(timestamp));
  }
  async getWelcomeShown(userId: string): Promise<boolean> {
    const val = await this.getItem(`${WELCOME_SHOWN_KEY_PREFIX}${userId}`);
    return val === 'true';
  }
  async setWelcomeShown(userId: string, shown: boolean): Promise<void> {
    await this.setItem(`${WELCOME_SHOWN_KEY_PREFIX}${userId}`, shown ? 'true' : 'false');
  }
  async getWelcomeCancelledOnLogout(userId: string): Promise<boolean> {
    const val = await this.getItem(`${WELCOME_CANCELLED_ON_LOGOUT_PREFIX}${userId}`);
    return val === 'true';
  }
  async setWelcomeCancelledOnLogout(userId: string, cancelled: boolean): Promise<void> {
    await this.setItem(`${WELCOME_CANCELLED_ON_LOGOUT_PREFIX}${userId}`, cancelled ? 'true' : 'false');
  }

  // Notification methods
  async cancelScheduledNotificationAsync(identifier: string): Promise<void> {
    this.scheduledNotifications.delete(identifier);
  }
  async dismissNotificationAsync(identifier: string): Promise<void> {
    this.dismissedNotifications.add(identifier);
  }
  async scheduleNotificationAsync(request: { identifier?: string; content: any; trigger: any }): Promise<string> {
    const id = request.identifier || 'random-id';
    this.scheduledNotifications.set(id, request);
    return id;
  }

  // App open simulation
  async onAppOpen(): Promise<void> {
    this.appOpenCount++;
    // If there is NO logged-in session, cancel and dismiss welcome notification
    if (!this.currentAuthUser) {
      await this.cancelScheduledNotificationAsync(WELCOME_NOTIFICATION_ID);
      await this.dismissNotificationAsync(WELCOME_NOTIFICATION_ID);
    }
  }

  // Logout simulation
  async onLogout(): Promise<void> {
    if (this.currentAuthUser) {
      const uid = this.currentAuthUser.uid;
      const scheduledAt = await this.getWelcomeScheduledAt(uid);
      const isShown = await this.getWelcomeShown(uid);
      // Cancelled before it was shown (user logged out within 5 minutes)
      if (scheduledAt && !isShown) {
        await this.setWelcomeCancelledOnLogout(uid, true);
      }
    }
    await this.cancelScheduledNotificationAsync(WELCOME_NOTIFICATION_ID);
    await this.dismissNotificationAsync(WELCOME_NOTIFICATION_ID);
    this.currentAuthUser = null;
  }

  // Existing user detection
  async checkIsExistingUser(userId: string): Promise<boolean> {
    if (this.offlineTransactions.length > 0) {
      await this.setWelcomeShown(userId, true);
      return true;
    }
    if (this.firestoreUserDoc) {
      const data = this.firestoreUserDoc;
      if (data.welcomeShown === true || data.welcome_shown === true || data.welcomeScheduledAt) {
        await this.setWelcomeShown(userId, true);
        return true;
      }
      if (data.has_set_starting_balance === true || (typeof data.starting_balance === 'number' && data.starting_balance > 0)) {
        await this.setWelcomeShown(userId, true);
        return true;
      }
      if (data.createdAt) {
        const createdMs = new Date(data.createdAt).getTime();
        if (!isNaN(createdMs) && Date.now() - createdMs > 15 * 60 * 1000) {
          await this.setWelcomeShown(userId, true);
          return true;
        }
      }
    }
    return false;
  }

  // Schedule logic
  async scheduleWelcomeNotification(options: { userId: string; displayName?: string | null; language?: string }): Promise<boolean> {
    const { userId, displayName, language } = options;
    if (!userId) return false;

    // 1. OS permission check
    if (this.osPermissionStatus !== 'granted') return false;

    // 2. Master Notifications toggle check
    if (!this.masterNotificationsEnabled) return false;

    // 3. Once-only guard: If already shown, never schedule again
    const alreadyShown = await this.getWelcomeShown(userId);
    if (alreadyShown) return false;

    // 4. Check if already scheduled
    const scheduledAt = await this.getWelcomeScheduledAt(userId);
    if (scheduledAt) {
      const wasCancelledOnLogout = await this.getWelcomeCancelledOnLogout(userId);
      if (!wasCancelledOnLogout) return false;
    }

    // 5. Existing user guard
    const isExisting = await this.checkIsExistingUser(userId);
    if (isExisting) return false;

    // 6. Fixed identifier cancel before scheduling
    await this.cancelScheduledNotificationAsync(WELCOME_NOTIFICATION_ID);

    // 7. Resolve content
    const { title, body } = getWelcomeNotificationContent(displayName, language);

    // 8. Schedule with 300s trigger
    await this.scheduleNotificationAsync({
      identifier: WELCOME_NOTIFICATION_ID,
      content: {
        title,
        body,
        sound: 'default',
        data: {
          type: 'welcome_notification',
          userId,
          route: '/add',
        },
      },
      trigger: {
        type: 'timeInterval',
        seconds: WELCOME_SCHEDULE_DELAY_SECONDS,
        repeats: false,
      },
    });

    // 9. Persist per-user flags
    await this.setWelcomeScheduledAt(userId, Date.now());
    await this.setWelcomeCancelledOnLogout(userId, false);
    return true;
  }

  // Update content if pending
  async updateWelcomeNotificationContentIfPending(userId: string, language: string, displayName?: string | null): Promise<boolean> {
    const isShown = await this.getWelcomeShown(userId);
    if (isShown) return false;

    const scheduledAt = await this.getWelcomeScheduledAt(userId);
    if (!scheduledAt) return false;

    const elapsedSeconds = Math.floor((Date.now() - scheduledAt) / 1000);
    const remainingSeconds = Math.max(10, WELCOME_SCHEDULE_DELAY_SECONDS - elapsedSeconds);

    await this.cancelScheduledNotificationAsync(WELCOME_NOTIFICATION_ID);

    const { title, body } = getWelcomeNotificationContent(displayName, language);
    await this.scheduleNotificationAsync({
      identifier: WELCOME_NOTIFICATION_ID,
      content: {
        title,
        body,
        sound: 'default',
        data: {
          type: 'welcome_notification',
          userId,
          route: '/add',
        },
      },
      trigger: {
        type: 'timeInterval',
        seconds: remainingSeconds,
        repeats: false,
      },
    });
    return true;
  }

  // Fire-time guard in setNotificationHandler
  async evaluatePresentation(notification: any): Promise<{ handled: boolean; shouldShow: boolean }> {
    const identifier = notification?.request?.identifier;
    const data = notification?.request?.content?.data;
    const isWelcome = identifier === WELCOME_NOTIFICATION_ID || data?.type === 'welcome_notification';

    if (!isWelcome) return { handled: false, shouldShow: true };

    const activeUid = this.currentAuthUser?.uid;
    const targetUid = data?.userId;

    // Guard 1: Logged-in session must exist
    if (!activeUid || (targetUid && activeUid !== targetUid)) {
      return { handled: true, shouldShow: false };
    }

    // Guard 2: Master toggle must be ON
    if (!this.masterNotificationsEnabled) {
      return { handled: true, shouldShow: false };
    }

    // Guard 3: welcomeShown must be false
    const alreadyShown = await this.getWelcomeShown(activeUid);
    if (alreadyShown) {
      return { handled: true, shouldShow: false };
    }

    // Mark shown
    await this.setWelcomeShown(activeUid, true);
    return { handled: true, shouldShow: true };
  }
}

test('Welcome Notification Specification & Lifecycle Suite', async (t) => {
  // ── 1. Logged-out app open x3 -> nothing scheduled ────────────────────────
  await t.test('1. logged-out app open x3 -> nothing scheduled and pending welcome is cancelled/dismissed', async () => {
    const h = new WelcomeNotificationTestHarness();
    h.currentAuthUser = null;

    // Simulate opening the app 3 times while logged out
    await h.onAppOpen();
    await h.onAppOpen();
    await h.onAppOpen();

    assert.strictEqual(h.appOpenCount, 3);
    assert.strictEqual(h.scheduledNotifications.size, 0, 'Zero notifications scheduled for logged-out app open');
    assert.ok(h.dismissedNotifications.has(WELCOME_NOTIFICATION_ID), 'Dismiss called on app open when logged out');
  });

  // ── 2. Login -> exactly one scheduled with 300s trigger ───────────────────
  await t.test('2. login -> exactly one scheduled with 300s trigger and fixed identifier', async () => {
    const h = new WelcomeNotificationTestHarness();
    const userId = 'user_new_123';
    h.currentAuthUser = { uid: userId, displayName: 'Jeetu' };

    const scheduled = await h.scheduleWelcomeNotification({
      userId,
      displayName: 'Jeetu',
      language: 'English',
    });

    assert.strictEqual(scheduled, true, 'Should successfully schedule for new user on login');
    assert.strictEqual(h.scheduledNotifications.size, 1, 'Exactly one notification scheduled');

    const notif = h.scheduledNotifications.get(WELCOME_NOTIFICATION_ID);
    assert.ok(notif, 'Must use fixed identifier "welcome-notification"');
    assert.strictEqual(notif.trigger.seconds, 300, 'Must fire 5 minutes later ({ seconds: 300 })');
    assert.strictEqual(notif.trigger.repeats, false, 'Must not repeat');
    assert.strictEqual(notif.content.data.route, '/add', 'Deep link route must be /add');
    assert.strictEqual(notif.content.data.type, 'welcome_notification');

    const scheduledAt = await h.getWelcomeScheduledAt(userId);
    assert.ok(typeof scheduledAt === 'number' && scheduledAt > 0, 'welcomeScheduledAt must be stored');
    const shown = await h.getWelcomeShown(userId);
    assert.strictEqual(shown, false, 'welcomeShown must remain false until fire time');
  });

  // ── 3. Open app 5 times after login -> still one ──────────────────────────
  await t.test('3. open app 5 times after login -> still only one scheduled', async () => {
    const h = new WelcomeNotificationTestHarness();
    const userId = 'user_new_456';
    h.currentAuthUser = { uid: userId, displayName: 'Rahul' };

    // Initial login schedules once
    await h.scheduleWelcomeNotification({ userId, displayName: 'Rahul' });
    assert.strictEqual(h.scheduledNotifications.size, 1);

    // Simulate opening the app 5 times while logged in
    for (let i = 0; i < 5; i++) {
      await h.onAppOpen();
      // Even if scheduleWelcomeNotification is called again, once-only guard suppresses it
      const res = await h.scheduleWelcomeNotification({ userId, displayName: 'Rahul' });
      assert.strictEqual(res, false, 'Subsequent attempts on app open must be skipped');
    }

    assert.strictEqual(h.scheduledNotifications.size, 1, 'Still exactly one scheduled notification');
  });

  // ── 4. Logout within 5 min -> cancelled ───────────────────────────────────
  await t.test('4. logout within 5 min -> cancelled and dismissed', async () => {
    const h = new WelcomeNotificationTestHarness();
    const userId = 'user_fast_logout';
    h.currentAuthUser = { uid: userId, displayName: 'Priya' };

    // Login schedules notification
    await h.scheduleWelcomeNotification({ userId, displayName: 'Priya' });
    assert.strictEqual(h.scheduledNotifications.size, 1);

    // Logout within 5 minutes before notification fires
    await h.onLogout();

    assert.strictEqual(h.scheduledNotifications.size, 0, 'Scheduled welcome notification must be removed from queue');
    assert.ok(h.dismissedNotifications.has(WELCOME_NOTIFICATION_ID), 'Welcome notification must be dismissed');

    const cancelledOnLogout = await h.getWelcomeCancelledOnLogout(userId);
    assert.strictEqual(cancelledOnLogout, true, 'welcomeCancelledOnLogout flag must be true');
  });

  // ── 5. Login again -> rescheduled once ────────────────────────────────────
  await t.test('5. login again -> rescheduled once with fresh 5-minute delay', async () => {
    const h = new WelcomeNotificationTestHarness();
    const userId = 'user_relogin';
    h.currentAuthUser = { uid: userId, displayName: 'Aman' };

    // First login -> scheduled
    await h.scheduleWelcomeNotification({ userId, displayName: 'Aman' });
    // User logs out after 2 minutes
    await h.onLogout();
    assert.strictEqual(h.scheduledNotifications.size, 0);

    // User logs in again later
    h.currentAuthUser = { uid: userId, displayName: 'Aman' };
    const rescheduled = await h.scheduleWelcomeNotification({ userId, displayName: 'Aman' });

    assert.strictEqual(rescheduled, true, 'Must allow rescheduling once when previous schedule was cancelled on logout');
    assert.strictEqual(h.scheduledNotifications.size, 1, 'Exactly one rescheduled');

    const notif = h.scheduledNotifications.get(WELCOME_NOTIFICATION_ID);
    assert.strictEqual(notif.trigger.seconds, 300, 'Fresh 5-minute delay applied');

    const cancelledFlagCleared = await h.getWelcomeCancelledOnLogout(userId);
    assert.strictEqual(cancelledFlagCleared, false, 'Cancellation flag cleared after reschedule');

    // Attempting to schedule again without logout must be rejected
    const secondAttempt = await h.scheduleWelcomeNotification({ userId, displayName: 'Aman' });
    assert.strictEqual(secondAttempt, false, 'Cannot reschedule twice without logout');
  });

  // ── 6. After shown, never again ───────────────────────────────────────────
  await t.test('6. after shown, never again (fire-time guard sets welcomeShown=true and blocks all future schedules)', async () => {
    const h = new WelcomeNotificationTestHarness();
    const userId = 'user_shown_flow';
    h.currentAuthUser = { uid: userId, displayName: 'Ananya' };

    await h.scheduleWelcomeNotification({ userId, displayName: 'Ananya' });
    const scheduledNotif = h.scheduledNotifications.get(WELCOME_NOTIFICATION_ID);

    // Simulate 5 minutes passing and notification firing into setNotificationHandler
    const evalResult = await h.evaluatePresentation({
      request: {
        identifier: WELCOME_NOTIFICATION_ID,
        content: scheduledNotif.content,
      },
    });

    assert.strictEqual(evalResult.handled, true);
    assert.strictEqual(evalResult.shouldShow, true, 'Should show when logged in and not yet shown');

    const isShown = await h.getWelcomeShown(userId);
    assert.strictEqual(isShown, true, 'welcomeShown must be set to true after being shown');

    // Future presentation attempts are suppressed
    const secondFire = await h.evaluatePresentation({
      request: {
        identifier: WELCOME_NOTIFICATION_ID,
        content: scheduledNotif.content,
      },
    });
    assert.strictEqual(secondFire.shouldShow, false, 'Must be suppressed if already shown');

    // Future logins or app opens never schedule
    const reLoginSchedule = await h.scheduleWelcomeNotification({ userId, displayName: 'Ananya' });
    assert.strictEqual(reLoginSchedule, false, 'Must never schedule again after being shown');
  });

  // ── 7. Existing/updated user -> none ──────────────────────────────────────
  await t.test('7. existing/updated user -> none (treated as already welcomed)', async () => {
    const h = new WelcomeNotificationTestHarness();
    const existingUserId = 'user_existing_v1';
    h.currentAuthUser = { uid: existingUserId, displayName: 'OldUser' };

    // Case A: User has local offline transactions from previous version
    h.offlineTransactions = [{ id: 'tx_old_1', amount: 50 }];
    const resA = await h.scheduleWelcomeNotification({ userId: existingUserId, displayName: 'OldUser' });
    assert.strictEqual(resA, false, 'Must not schedule for user with existing local transactions');
    assert.strictEqual(h.scheduledNotifications.size, 0);
    const shownA = await h.getWelcomeShown(existingUserId);
    assert.strictEqual(shownA, true, 'Marked as already welcomed');

    // Case B: Fresh install of existing user (remote Firestore doc has createdAt in past or has_set_starting_balance)
    const freshInstallUid = 'user_fresh_install_old_account';
    const h2 = new WelcomeNotificationTestHarness();
    h2.currentAuthUser = { uid: freshInstallUid, displayName: 'CloudUser' };
    h2.firestoreUserDoc = {
      createdAt: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
      has_set_starting_balance: true,
    };

    const resB = await h2.scheduleWelcomeNotification({ userId: freshInstallUid, displayName: 'CloudUser' });
    assert.strictEqual(resB, false, 'Must not schedule for fresh install of existing user');
    assert.strictEqual(h2.scheduledNotifications.size, 0);
    const shownB = await h2.getWelcomeShown(freshInstallUid);
    assert.strictEqual(shownB, true, 'Marked as already welcomed in cloud sync check');
  });

  // ── 8. Notifications toggle OFF -> none ───────────────────────────────────
  await t.test('8. notifications toggle OFF -> none (both scheduling and presentation suppressed)', async () => {
    const h = new WelcomeNotificationTestHarness();
    const userId = 'user_toggle_off';
    h.currentAuthUser = { uid: userId, displayName: 'QuietUser' };
    h.masterNotificationsEnabled = false;

    // Scheduling attempt when toggle is OFF
    const scheduled = await h.scheduleWelcomeNotification({ userId, displayName: 'QuietUser' });
    assert.strictEqual(scheduled, false, 'Scheduling skipped when master toggle is OFF');
    assert.strictEqual(h.scheduledNotifications.size, 0);

    // Fire-time guard check when toggle was turned OFF after scheduling
    h.masterNotificationsEnabled = true;
    await h.scheduleWelcomeNotification({ userId, displayName: 'QuietUser' });
    assert.strictEqual(h.scheduledNotifications.size, 1);

    // User disables notifications in Settings before 5 min fires
    h.masterNotificationsEnabled = false;
    const evalResult = await h.evaluatePresentation({
      request: {
        identifier: WELCOME_NOTIFICATION_ID,
        content: { data: { userId, type: 'welcome_notification' } },
      },
    });
    assert.strictEqual(evalResult.shouldShow, false, 'Presentation suppressed when master toggle is OFF at fire time');
  });

  // ── 9. Language change -> correct text ────────────────────────────────────
  await t.test('9. language change -> personalized and localized content (English, Hindi, Hinglish)', async () => {
    // English with name
    const enWithName = getWelcomeNotificationContent('Karan', 'English');
    assert.strictEqual(enWithName.title, 'Welcome to Rupeo 💛');
    assert.strictEqual(enWithName.body, "Welcome to Rupeo, Karan! Add your first expense and let's start tracking 💛");

    // English without name
    const enWithoutName = getWelcomeNotificationContent('', 'English');
    assert.strictEqual(enWithoutName.body, "Welcome to Rupeo! Add your first expense and let's start tracking 💛");

    // Hindi with name (UTF-8 Devanagari)
    const hiWithName = getWelcomeNotificationContent('करण', 'Hindi');
    assert.strictEqual(hiWithName.title, 'Rupeo में आपका स्वागत है 💛');
    assert.ok(hiWithName.body.includes('करण'), 'Must include personalized Hindi name');
    assert.ok(hiWithName.body.includes('पहला खर्च जोड़ें'), 'Must contain natural Hindi action prompt');

    // Hinglish with name
    const hinglishWithName = getWelcomeNotificationContent('Karan', 'Hinglish');
    assert.strictEqual(hinglishWithName.title, 'Rupeo me Welcome 💛');
    assert.strictEqual(
      hinglishWithName.body,
      'Welcome to Rupeo, Karan! Apna pehla expense add karein aur tracking shuru karein 💛'
    );

    // Dynamic pending content update on language change
    const h = new WelcomeNotificationTestHarness();
    const userId = 'user_lang_switch';
    h.currentAuthUser = { uid: userId, displayName: 'Karan' };

    // Initially scheduled in English
    await h.scheduleWelcomeNotification({ userId, displayName: 'Karan', language: 'English' });
    let notif = h.scheduledNotifications.get(WELCOME_NOTIFICATION_ID);
    assert.ok(notif.content.body.includes("Add your first expense"));

    // User switches to Hindi in Setup or Settings
    await h.updateWelcomeNotificationContentIfPending(userId, 'Hindi', 'Karan');
    notif = h.scheduledNotifications.get(WELCOME_NOTIFICATION_ID);
    assert.strictEqual(notif.content.title, 'Rupeo में आपका स्वागत है 💛');
    assert.ok(notif.content.body.includes('पहला खर्च जोड़ें'), 'Updated pending notification has Hindi text');
    assert.strictEqual(notif.content.data.route, '/add');
  });
});
