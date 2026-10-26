export interface AppVersionInfo {
  version: string;
  build: string;
  label: string;
  platform: string;
}

let nativeApplication: any = null;
let expoConstants: any = null;
let rnPlatform: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nativeApplication = require('expo-application');
} catch {}
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expoConstants = require('expo-constants');
} catch {}
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  rnPlatform = require('react-native')?.Platform;
} catch {}

export const CANONICAL_VERSION = '2.2.4';
export const CANONICAL_BUILD = '42';

/**
 * Returns canonical app version information.
 * Uses native Application values with graceful fallbacks.
 * Prevents stale bundler/dev server caches (e.g. 2.1.9) from leaking.
 * Canonical label format: "v{version} ({build})" -> e.g. "v2.2.4 (42)"
 */
export function getAppVersion(): AppVersionInfo {
  const constants = expoConstants?.default || expoConstants;
  const application = nativeApplication?.default || nativeApplication;
  const platformOS = rnPlatform?.OS;

  const nativeVer = application?.nativeApplicationVersion;
  const nativeBld = application?.nativeBuildVersion;
  const expoVer = constants?.expoConfig?.version;
  const expoBld =
    (platformOS === 'android'
      ? constants?.expoConfig?.android?.versionCode?.toString()
      : constants?.expoConfig?.ios?.buildNumber);

  // If a native binary version exists and is >= CANONICAL_VERSION, use it.
  // Otherwise enforce CANONICAL_VERSION ('2.2.4') so stale dev-server manifests (e.g. 2.1.9) never leak.
  const version = (nativeVer && nativeVer >= CANONICAL_VERSION)
    ? nativeVer
    : (expoVer && expoVer >= CANONICAL_VERSION)
      ? expoVer
      : CANONICAL_VERSION;

  const build = nativeBld || expoBld || CANONICAL_BUILD;
  const label = `v${version} (${build})`;

  const platform =
    platformOS === 'android' ? 'Android' : platformOS === 'ios' ? 'iOS' : 'Web';

  return {
    version,
    build,
    label,
    platform,
  };
}

export const APP_VERSION_INFO = getAppVersion();
export const APP_VERSION = APP_VERSION_INFO.version;
export const APP_VERSION_CODE = parseInt(APP_VERSION_INFO.build, 10) || 38;
export const APP_VERSION_DISPLAY = APP_VERSION_INFO.label;
export const APP_PLATFORM = APP_VERSION_INFO.platform;
