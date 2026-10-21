export interface DevicePerfCheckParams {
  platformOS: string;
  platformVersion?: number | string;
  totalMemory?: number | null;
  deviceYearClass?: number | null;
}

/**
 * Pure calculation function to determine whether a device is low-end.
 * Easily unit-testable in pure Node.js environments.
 */
export function computeIsLowEndDevice(params: DevicePerfCheckParams): boolean {
  if (params.platformOS !== 'android') {
    return false;
  }

  // 1. RAM < 3GB
  if (params.totalMemory !== null && params.totalMemory !== undefined && params.totalMemory > 0) {
    if (params.totalMemory < 3 * 1024 * 1024 * 1024) {
      return true;
    }
  }

  // 2. Android 9 (API 28) or older
  const apiLevel =
    typeof params.platformVersion === 'number'
      ? params.platformVersion
      : parseInt(String(params.platformVersion), 10);
  if (!isNaN(apiLevel) && apiLevel > 0 && apiLevel <= 28) {
    return true;
  }

  // 3. Year class 2018 or older
  if (
    params.deviceYearClass !== null &&
    params.deviceYearClass !== undefined &&
    params.deviceYearClass <= 2018
  ) {
    return true;
  }

  return false;
}
