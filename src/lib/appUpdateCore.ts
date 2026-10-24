// ---------------------------------------------------------------------------
// Pure Types & Constants for App Updates
// ---------------------------------------------------------------------------

export type UpdateMode = 'FORCE' | 'SOFT' | 'NONE';

export interface CheckUpdateParams {
  installedVersionCode: number;
  installedVersion?: string;
  latestVersionCode?: number;
  latestVersion?: string;
  minSupportedVersionCode?: number;
  minSupportedVersion?: string;
  updatePromptEnabled?: boolean;
  forceUpdate?: boolean;
  lastPromptedAt?: number | null; // epoch ms
  cooldownHours?: number; // default 24
  now?: number; // epoch ms (for testing)
  adminUpdatedAt?: number | null; // epoch ms when admin updated/broadcasted config
}

export interface AppUpdateState {
  mode: UpdateMode;
  installedVersionCode: number;
  installedVersion?: string;
  latestVersionCode?: number;
  latestVersion?: string;
  minSupportedVersionCode?: number;
  minSupportedVersion?: string;
  forceUpdate?: boolean;
  title?: string;
  message?: string;
  updateUrl?: string;
}

export const PLAY_STORE_PACKAGE_NAME = 'com.innovatexlabs.paisewaise';
export const PLAY_STORE_MARKET_URL = `market://details?id=${PLAY_STORE_PACKAGE_NAME}`;
export const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE_NAME}`;
export const STORAGE_LAST_UPDATE_PROMPTED_KEY = '@rupeo_update_last_prompted';

// ---------------------------------------------------------------------------
// Semantic Versioning Helper
// ---------------------------------------------------------------------------

/**
 * Compares two semantic version strings (e.g. "2.2.0" vs "2.2.1").
 * Returns:
 *   1 if a > b (a is newer)
 *  -1 if a < b (b is newer)
 *   0 if equal
 */
export function compareSemver(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  const parseParts = (v: string) =>
    v.replace(/^[^\d]*/, '').split(/[-+.]/).map(n => parseInt(n, 10) || 0);

  const partsA = parseParts(a);
  const partsB = parseParts(b);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Pure Functions (Deterministic & Testable)
// ---------------------------------------------------------------------------

/**
 * Determines whether an update is FORCE, SOFT, or NONE.
 *
 * Rules:
 * 1. updatePromptEnabled === false => NONE (Master switch turned OFF by admin)
 * 2. If no newer version by code or semver => NONE
 * 3. If forceUpdate === true OR installed < minSupported => FORCE (no cooldown)
 * 4. Otherwise => SOFT (subject to cooldownHours)
 */
export function determineUpdateMode(params: CheckUpdateParams): UpdateMode {
  const {
    installedVersionCode,
    installedVersion,
    latestVersionCode,
    latestVersion,
    minSupportedVersionCode,
    minSupportedVersion,
    updatePromptEnabled = true,
    forceUpdate = false,
    lastPromptedAt,
    cooldownHours = 0,
    now = Date.now(),
    adminUpdatedAt,
  } = params;

  // 1. Master toggle: If admin disabled update prompts => NONE
  if (updatePromptEnabled === false) {
    return 'NONE';
  }

  // 2. Determine if a new version is available
  let isNewerAvailable = false;

  // Check by versionCode
  if (
    typeof latestVersionCode === 'number' &&
    latestVersionCode > 0 &&
    typeof installedVersionCode === 'number' &&
    installedVersionCode > 0
  ) {
    if (installedVersionCode < latestVersionCode) {
      isNewerAvailable = true;
    }
  }

  // Check by semantic version string
  if (latestVersion && installedVersion) {
    if (compareSemver(installedVersion, latestVersion) < 0) {
      isNewerAvailable = true;
    }
  }

  // If installed version is already up to date and neither check found a newer version => NONE
  if (!isNewerAvailable) {
    return 'NONE';
  }

  // 3. Determine if update is FORCE (Mandatory)
  const isForceByAdmin = forceUpdate === true;
  const isForceByCode =
    typeof minSupportedVersionCode === 'number' &&
    minSupportedVersionCode > 0 &&
    typeof installedVersionCode === 'number' &&
    installedVersionCode > 0 &&
    installedVersionCode < minSupportedVersionCode;
  const isForceBySemver = Boolean(
    minSupportedVersion &&
    installedVersion &&
    compareSemver(installedVersion, minSupportedVersion) < 0
  );

  if (isForceByAdmin || isForceByCode || isForceBySemver) {
    return 'FORCE';
  }

  // 4. SOFT update (Check cooldown)
  if (typeof lastPromptedAt === 'number' && lastPromptedAt > 0) {
    const hours = typeof cooldownHours === 'number' && cooldownHours >= 0 ? cooldownHours : 0;
    if (hours > 0) {
      // If admin explicitly updated or broadcasted config AFTER user tapped Later, cooldown is bypassed!
      const isNewAdminBroadcast =
        typeof adminUpdatedAt === 'number' &&
        adminUpdatedAt > 0 &&
        adminUpdatedAt > lastPromptedAt;

      if (!isNewAdminBroadcast) {
        const cooldownMs = hours * 60 * 60 * 1000;
        if (now - lastPromptedAt < cooldownMs) {
          return 'NONE'; // Inside cooldown window
        }
      }
    }
  }

  return 'SOFT';
}
