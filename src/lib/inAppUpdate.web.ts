import { APP_VERSION } from '@/constants/version';

export interface InAppUpdateCheckResult {
  checked: boolean;
  updateAvailable: boolean;
  storeVersion?: string;
  error?: string;
}

/**
 * Web no-op implementation: Google Play in-app updates are Android only.
 */
export async function checkForInAppUpdate(_force = false): Promise<InAppUpdateCheckResult> {
  return {
    checked: true,
    updateAvailable: false,
    storeVersion: APP_VERSION,
  };
}

/**
 * Web no-op startup hook.
 */
export function startBackgroundUpdateCheck(): void {
  // No-op on Web
}
