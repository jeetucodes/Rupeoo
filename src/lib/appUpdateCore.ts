// ---------------------------------------------------------------------------
// Pure Types & Constants for App Updates
// ---------------------------------------------------------------------------

export type UpdateMode = 'FORCE' | 'SOFT' | 'NONE';

export interface CheckUpdateParams {
  installedVersionCode: number;
  latestVersionCode?: number;
  minSupportedVersionCode?: number;
  lastPromptedAt?: number | null; // epoch ms
  cooldownHours?: number; // default 24
  now?: number; // epoch ms (for testing)
}

export interface AppUpdateState {
  mode: UpdateMode;
  installedVersionCode: number;
  latestVersionCode?: number;
  minSupportedVersionCode?: number;
  title?: string;
  message?: string;
}

export const PLAY_STORE_PACKAGE_NAME = 'com.innovatexlabs.paisewaise';
export const PLAY_STORE_MARKET_URL = `market://details?id=${PLAY_STORE_PACKAGE_NAME}`;
export const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE_NAME}`;
export const STORAGE_LAST_UPDATE_PROMPTED_KEY = '@rupeo_update_last_prompted';

// ---------------------------------------------------------------------------
// Pure Functions (Deterministic & Testable)
// ---------------------------------------------------------------------------

/**
 * Determines whether an update is FORCE, SOFT, or NONE.
 *
 * Rules:
 * 1. Missing or invalid installed version => NONE
 * 2. installed < minSupportedVersionCode => FORCE (critical update required, no cooldown)
 * 3. installed < latestVersionCode => SOFT (subject to cooldownHours)
 * 4. Otherwise => NONE
 */
export function determineUpdateMode(params: CheckUpdateParams): UpdateMode {
  const {
    installedVersionCode,
    latestVersionCode,
    minSupportedVersionCode,
    lastPromptedAt,
    cooldownHours = 24,
    now = Date.now(),
  } = params;

  if (!installedVersionCode || installedVersionCode <= 0) {
    return 'NONE';
  }

  // 1. Check FORCE update
  if (
    typeof minSupportedVersionCode === 'number' &&
    minSupportedVersionCode > 0 &&
    installedVersionCode < minSupportedVersionCode
  ) {
    return 'FORCE';
  }

  // 2. Check SOFT update
  if (
    typeof latestVersionCode === 'number' &&
    latestVersionCode > 0 &&
    installedVersionCode < latestVersionCode
  ) {
    // Check cooldown
    if (typeof lastPromptedAt === 'number' && lastPromptedAt > 0) {
      const hours = typeof cooldownHours === 'number' && cooldownHours > 0 ? cooldownHours : 24;
      const cooldownMs = hours * 60 * 60 * 1000;
      if (now - lastPromptedAt < cooldownMs) {
        return 'NONE'; // Inside cooldown window
      }
    }
    return 'SOFT';
  }

  return 'NONE';
}
