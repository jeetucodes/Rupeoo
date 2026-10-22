import { Platform } from 'react-native';

export const APP_VERSION = '2.1.10';
export const APP_VERSION_CODE = 37;
export const APP_VERSION_DISPLAY = `v${APP_VERSION}`;
export const APP_PLATFORM =
  Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : 'Web';
