import { Platform, NativeModules, PermissionsAndroid } from 'react-native';
import { warn } from './logger';

export interface RawSmsMessage {
  _id?: string;
  address: string;
  body: string;
  date: number;
  date_sent?: number;
}

export interface ReadSmsOptions {
  minDate?: number;
  maxDate?: number;
  limit?: number;
  offset?: number;
}

/**
 * Checks if native SMS reading is supported in the current runtime.
 * Safely feature-detects native modules so Expo Go, iOS, and Web never crash.
 */
export function isInboxImportSupported(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    const hasRupeoSms = Boolean(NativeModules.RupeoSms && typeof NativeModules.RupeoSms.readSms === 'function');
    const hasSmsAndroid = Boolean(NativeModules.SmsAndroid && typeof NativeModules.SmsAndroid.list === 'function');
    return hasRupeoSms || hasSmsAndroid;
  } catch {
    return false;
  }
}

/**
 * Checks if READ_SMS Android runtime permission is currently granted.
 */
export async function checkSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  } catch (err) {
    warn('checkSmsPermission error:', err);
    return false;
  }
}

/**
 * Requests READ_SMS permission from the user.
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
      title: 'Rupeo SMS Import Permission',
      message: 'Rupeo analyzes your bank and payment SMS alerts locally on your device to import your past transactions without typing.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    warn('requestSmsPermission error:', err);
    return false;
  }
}

/**
 * Reads SMS messages in batches from native ContentResolver with date filtering.
 */
export async function readSmsInbox(options: ReadSmsOptions = {}): Promise<RawSmsMessage[]> {
  if (!isInboxImportSupported()) {
    return [];
  }

  const { minDate = 0, maxDate = Date.now(), limit = 200, offset = 0 } = options;

  try {
    // 1. Check custom RupeoSmsModule (direct sideload flavor)
    if (NativeModules.RupeoSms?.readSms) {
      const messages: RawSmsMessage[] = await NativeModules.RupeoSms.readSms(
        minDate,
        maxDate,
        limit,
        offset
      );
      return messages || [];
    }

    // 2. Check third-party react-native-get-sms-android (if present)
    if (NativeModules.SmsAndroid?.list) {
      return new Promise<RawSmsMessage[]>((resolve) => {
        const filter = {
          box: 'inbox',
          minDate,
          maxDate,
          maxCount: limit,
          indexFrom: offset,
        };

        NativeModules.SmsAndroid.list(
          JSON.stringify(filter),
          (fail: any) => {
            warn('SmsAndroid.list failed:', fail);
            resolve([]);
          },
          (count: number, smsList: string) => {
            try {
              const list: any[] = JSON.parse(smsList);
              const mapped: RawSmsMessage[] = list.map((item) => ({
                _id: String(item._id || item.id || ''),
                address: String(item.address || ''),
                body: String(item.body || ''),
                date: Number(item.date || Date.now()),
                date_sent: Number(item.date_sent || 0),
              }));
              resolve(mapped);
            } catch (err) {
              warn('Error parsing smsList JSON:', err);
              resolve([]);
            }
          }
        );
      });
    }
  } catch (err) {
    warn('readSmsInbox native exception:', err);
  }

  return [];
}

/**
 * Splits a multi-message pasted text string into distinct messages.
 * Supports splitting on blank lines, double line breaks, or Indian DLT headers.
 */
export function splitMultiMessagePaste(rawText: string): Array<{ sender: string; body: string; timestamp: number }> {
  if (!rawText || !rawText.trim()) return [];

  const text = rawText.trim();

  // Strategy 1: Check if pasted text contains explicit multiple DLT headers
  // e.g. "AD-HDFCBK: Dear customer... VM-ICICIB: Dear..."
  const headerSplitPattern = /(?=(?:[A-Za-z]{2}-[A-Za-z0-9]{3,8}(?:-[A-Za-z])?[:\s\n]))/g;
  const headerChunks = text.split(headerSplitPattern).map((c) => c.trim()).filter(Boolean);

  if (headerChunks.length > 1) {
    return headerChunks.map((chunk) => {
      const headerMatch = chunk.match(/^([A-Za-z]{2}-[A-Za-z0-9]{3,8}(?:-[A-Za-z])?)[:\s\n]+/);
      if (headerMatch) {
        const sender = headerMatch[1];
        const body = chunk.substring(headerMatch[0].length).trim();
        return { sender, body, timestamp: Date.now() };
      }
      return { sender: '', body: chunk, timestamp: Date.now() };
    });
  }

  // Strategy 2: Split by blank lines or multiple newlines
  const blankLineChunks = text.split(/\r?\n\s*\r?\n+/).map((c) => c.trim()).filter(Boolean);
  if (blankLineChunks.length > 1) {
    return blankLineChunks.map((chunk) => {
      const headerMatch = chunk.match(/^([A-Za-z0-9-]{3,12})[:\s\n]+/);
      if (headerMatch && /^[A-Z0-9-]+$/i.test(headerMatch[1])) {
        return {
          sender: headerMatch[1],
          body: chunk.substring(headerMatch[0].length).trim(),
          timestamp: Date.now(),
        };
      }
      return { sender: '', body: chunk, timestamp: Date.now() };
    });
  }

  // Single message
  return [{ sender: '', body: text, timestamp: Date.now() }];
}
