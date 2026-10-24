import AsyncStorage from '@react-native-async-storage/async-storage';
import { warn, error as logError } from './logger.ts';
import { safeJsonParse } from './safeStorage.ts';

export const LAST_CRASH_STORAGE_KEY = '@rupeo_last_crash_report';

export interface CrashReport {
  timestamp: number;
  message: string;
  stack?: string;
  fatal: boolean;
  source: 'startup_watchdog' | 'global_handler' | 'root_error_boundary' | 'unknown';
}

/**
 * Sanitizes stack and error message to strictly strip any personal data (emails, phones, UPI IDs).
 */
function sanitizeErrorInfo(str: string): string {
  if (!str) return '';
  return str
    // Redact email addresses
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]')
    // Redact phone numbers (10 digits)
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{9}/g, '[REDACTED_PHONE]')
    // Redact UPI IDs
    .replace(/[a-zA-Z0-9_.-]+@[a-zA-Z0-9]+/g, '[REDACTED_VPA]');
}

/**
 * Persists the latest crash report (message + stack, zero personal data).
 */
export async function recordCrash(
  err: any,
  fatal: boolean = true,
  source: CrashReport['source'] = 'unknown'
): Promise<void> {
  try {
    const message = sanitizeErrorInfo(
      err?.message || (typeof err === 'string' ? err : 'Unknown error')
    );
    const stack = sanitizeErrorInfo(err?.stack || '');

    const report: CrashReport = {
      timestamp: Date.now(),
      message,
      stack,
      fatal,
      source,
    };

    await AsyncStorage.setItem(LAST_CRASH_STORAGE_KEY, JSON.stringify(report));
  } catch (storageErr) {
    warn('[CrashReporting] Failed to save crash report:', storageErr);
  }
}

/**
 * Reads the latest recorded crash report.
 */
export async function getLastCrash(): Promise<CrashReport | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CRASH_STORAGE_KEY);
    if (!raw) return null;
    return safeJsonParse<CrashReport | null>(raw, null, LAST_CRASH_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Clears the persisted crash report.
 */
export async function clearLastCrash(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_CRASH_STORAGE_KEY);
  } catch {}
}

let isGlobalHandlerInstalled = false;

/**
 * Installs global JS error handler to capture unhandled exceptions during startup.
 */
export function installGlobalErrorHandler(onFatalCrash?: (err: any) => void): void {
  if (isGlobalHandlerInstalled) return;
  isGlobalHandlerInstalled = true;

  try {
    // React Native's global ErrorUtils
    const globalObj = global as any;
    if (globalObj.ErrorUtils && typeof globalObj.ErrorUtils.getGlobalHandler === 'function') {
      const defaultHandler = globalObj.ErrorUtils.getGlobalHandler();
      globalObj.ErrorUtils.setGlobalHandler((err: any, isFatal?: boolean) => {
        logError('[GlobalErrorHandler] Uncaught exception:', err, 'fatal:', isFatal);
        recordCrash(err, !!isFatal, 'global_handler').catch(() => {});

        if (onFatalCrash && isFatal) {
          try {
            onFatalCrash(err);
          } catch {}
        }

        // Delegate to default handler if available
        if (defaultHandler) {
          defaultHandler(err, isFatal);
        }
      });
    }
  } catch (setupErr) {
    warn('[CrashReporting] Could not install global error handler:', setupErr);
  }
}
