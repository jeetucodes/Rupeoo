export const WELCOME_NOTIFICATION_ID = 'welcome-notification';
export const WELCOME_SCHEDULE_DELAY_SECONDS = 300; // 5 minutes (Requirement 3)

export const WELCOME_SCHEDULED_KEY_PREFIX = '@rupeo_welcome_scheduled_';
export const WELCOME_SHOWN_KEY_PREFIX = '@rupeo_welcome_shown_';
export const WELCOME_CANCELLED_ON_LOGOUT_PREFIX = '@rupeo_welcome_cancelled_logout_';

/**
 * Generates personalized title and body for the welcome notification based on user name and language.
 * Default: English. Also supports Hindi and Hinglish. (Requirement 8)
 */
export function getWelcomeNotificationContent(
  displayName?: string | null,
  language?: string
): { title: string; body: string } {
  const cleanName =
    displayName && typeof displayName === 'string' && displayName.trim().length > 0 && displayName.trim().toLowerCase() !== 'user'
      ? displayName.trim()
      : '';

  const lang = (language || 'English').toLowerCase();

  if (lang === 'hindi') {
    return {
      title: 'Rupeo में आपका स्वागत है 💛',
      body: cleanName
        ? `Rupeo में आपका स्वागत है, ${cleanName}! अपना पहला खर्च जोड़ें और ट्रैकिंग शुरू करें 💛`
        : 'Rupeo में आपका स्वागत है! अपना पहला खर्च जोड़ें और ट्रैकिंग शुरू करें 💛',
    };
  }

  if (lang === 'hinglish') {
    return {
      title: 'Rupeo me Welcome 💛',
      body: cleanName
        ? `Welcome to Rupeo, ${cleanName}! Apna pehla expense add karein aur tracking shuru karein 💛`
        : 'Welcome to Rupeo! Apna pehla expense add karein aur tracking shuru karein 💛',
    };
  }

  // English default
  return {
    title: 'Welcome to Rupeo 💛',
    body: cleanName
      ? `Welcome to Rupeo, ${cleanName}! Add your first expense and let's start tracking 💛`
      : "Welcome to Rupeo! Add your first expense and let's start tracking 💛",
  };
}

/**
 * Pure decision function to determine if an account is an existing/returning user.
 * Existing users must NOT receive a welcome notification. (Requirement 4)
 */
export function determineExistingUserStatus(params: {
  localTransactionCount: number;
  hasCloudWelcomeRecord: boolean;
  hasSetStartingBalance: boolean;
  startingBalance?: number;
  createdAt?: string | null;
  now?: number;
}): { isExisting: boolean; reason: string } {
  const { localTransactionCount, hasCloudWelcomeRecord, hasSetStartingBalance, startingBalance, createdAt, now = Date.now() } = params;

  if (localTransactionCount > 0) {
    return { isExisting: true, reason: 'has_local_transactions' };
  }

  if (hasCloudWelcomeRecord) {
    return { isExisting: true, reason: 'has_cloud_welcome_record' };
  }

  if (hasSetStartingBalance || (typeof startingBalance === 'number' && startingBalance > 0)) {
    return { isExisting: true, reason: 'has_starting_balance_configured' };
  }

  if (createdAt) {
    const createdMs = new Date(createdAt).getTime();
    // If account was created more than 15 minutes ago, treat as existing user
    if (!isNaN(createdMs) && now - createdMs > 15 * 60 * 1000) {
      return { isExisting: true, reason: 'account_created_in_past' };
    }
  }

  return { isExisting: false, reason: 'fresh_new_user' };
}

/**
 * Pure decision function determining whether the welcome notification can be scheduled.
 * Enforces:
 * - OS Permission check (Requirement 7)
 * - Master Notifications toggle check (Requirement 7)
 * - Once-only persistent check (Requirement 4)
 * - Reschedule allowed once if cancelled on early logout within 5 minutes (Requirement 6)
 * - Existing user check (Requirement 4)
 */
export function shouldScheduleWelcomeNotification(params: {
  userId: string;
  isOsPermissionGranted: boolean;
  isMasterToggleEnabled: boolean;
  isAlreadyShown: boolean;
  scheduledAt: number | null;
  wasCancelledOnLogout: boolean;
  isExistingUser: boolean;
}): { shouldSchedule: boolean; reason: string } {
  const {
    userId,
    isOsPermissionGranted,
    isMasterToggleEnabled,
    isAlreadyShown,
    scheduledAt,
    wasCancelledOnLogout,
    isExistingUser,
  } = params;

  if (!userId) {
    return { shouldSchedule: false, reason: 'missing_user_id' };
  }

  if (!isOsPermissionGranted) {
    return { shouldSchedule: false, reason: 'os_permission_not_granted' };
  }

  if (!isMasterToggleEnabled) {
    return { shouldSchedule: false, reason: 'master_notifications_disabled' };
  }

  if (isAlreadyShown) {
    return { shouldSchedule: false, reason: 'welcome_already_shown' };
  }

  if (scheduledAt) {
    // If it was cancelled on early logout within 5 min, allow rescheduling once
    if (!wasCancelledOnLogout) {
      return { shouldSchedule: false, reason: 'already_scheduled' };
    }
  }

  if (isExistingUser) {
    return { shouldSchedule: false, reason: 'existing_user_excluded' };
  }

  return { shouldSchedule: true, reason: 'eligible_for_welcome' };
}

/**
 * Pure fire-time evaluation guard for setNotificationHandler. (Requirement 5)
 * Returns whether the notification is a welcome notification, and whether it should be shown.
 */
export function shouldPresentWelcomeNotification(params: {
  identifier?: string;
  type?: string;
  activeUid?: string | null;
  targetUid?: string;
  isMasterToggleEnabled: boolean;
  isAlreadyShown: boolean;
}): { isWelcome: boolean; shouldShow: boolean; reason: string } {
  const { identifier, type, activeUid, targetUid, isMasterToggleEnabled, isAlreadyShown } = params;
  const isWelcome = identifier === WELCOME_NOTIFICATION_ID || type === 'welcome_notification';

  if (!isWelcome) {
    return { isWelcome: false, shouldShow: true, reason: 'not_welcome_notification' };
  }

  // Guard 1: Logged-in session must exist (and match target user if specified)
  if (!activeUid || (targetUid && activeUid !== targetUid)) {
    return { isWelcome: true, shouldShow: false, reason: 'no_active_logged_in_session' };
  }

  // Guard 2: Master Notifications toggle must be ON
  if (!isMasterToggleEnabled) {
    return { isWelcome: true, shouldShow: false, reason: 'master_toggle_disabled' };
  }

  // Guard 3: welcomeShown must be false
  if (isAlreadyShown) {
    return { isWelcome: true, shouldShow: false, reason: 'welcome_already_shown' };
  }

  return { isWelcome: true, shouldShow: true, reason: 'eligible_to_present' };
}

/**
 * Calculates remaining seconds for a pending notification when updating content on language/name change.
 */
export function calculateRemainingWelcomeDelay(scheduledAt: number, now: number = Date.now()): number {
  const elapsedSeconds = Math.floor((now - scheduledAt) / 1000);
  return Math.max(10, WELCOME_SCHEDULE_DELAY_SECONDS - elapsedSeconds);
}
