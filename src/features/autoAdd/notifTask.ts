/**
 * Headless JS Task: RupeoNotificationTask
 *
 * Runs in the background (even when Rupeo is killed) whenever a matching
 * financial notification is captured by RupeoNotificationListener.
 *
 * Execution Pipeline:
 * 1. Filter on-device by allowlist & debit/credit pattern (drops OTP / promo).
 * 2. Deduplicate by hash(package + text + postTime rounded to minute).
 * 3. Cross-channel deduplicate (match amount + type within 2 minutes between SMS & UPI apps).
 * 4. Parse using existing high-accuracy parseAlert().
 * 5. Apply user settings (autoAddEnabled, reviewBeforeAdding, maskAccountNumbers, saveOriginalInNote).
 * 6. Save to local SQLite (expo-sqlite) + Rupeo local storage (insertTransaction).
 * 7. Show local notification with transaction details & Undo action.
 */

import { AppRegistry, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { parseAlert, ParsedAlert } from '@/lib/alertParser';
import { shouldProcessNotification, isPackageAllowed } from './filter';
import {
  computeNotifHash,
  isNotifAlreadyProcessed,
  markNotifProcessed,
  checkCrossChannelDuplicate,
  recordRecentPayment,
} from './dedupe';
import {
  saveTransactionToSQLite,
  savePendingAlertToSQLite,
  setSQLiteSetting,
} from './sqliteStorage';
import { insertTransaction, normalizeDate } from '@/lib/database';
import { addPendingAlert } from '@/lib/pendingInbox';
import { getSmsImportSettings, formatTransactionNote, getAutoAddPausedUntil } from '@/lib/smsSettings';
import { isMasterNotificationsEnabled } from '@/lib/notifications';
import { log, warn } from '@/lib/logger';

export interface NotificationTaskPayload {
  packageName: string;
  title?: string;
  text?: string;
  combinedText?: string;
  postTime?: number;
}

export const LAST_PROCESSED_TIMESTAMP_KEY = '@rupeo_notif_last_processed_timestamp';
export const NOTIFICATION_CHANNEL_ID = 'rupeo_auto_add_alerts';

/**
 * Configure Android notification channel for auto-add alerts.
 */
export async function setupAutoAddNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: 'Auto-Added Transactions',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFD740',
      sound: 'default',
    });

    // Set category with Undo action
    await Notifications.setNotificationCategoryAsync('AUTO_ADD_TRANSACTION', [
      {
        identifier: 'UNDO_ACTION',
        buttonTitle: 'Undo',
        options: {
          opensAppToForeground: false,
        },
      },
    ]);
  } catch (err) {
    warn('Error setting up auto-add notification channel:', err);
  }
}

/**
 * Main headless task executor.
 *
 * CRITICAL RULE: If Auto-Add is OFF or Paused:
 * Return immediately. Do NOT parse, do NOT save to transactions, do NOT add to Pending Alerts Inbox,
 * do NOT show a notification, and do NOT store the notification content anywhere.
 */
export async function handleNotificationTask(taskData: NotificationTaskPayload): Promise<void> {
  if (!taskData || !taskData.packageName) return;

  const { packageName, title = '', text = '', combinedText = '', postTime = Date.now() } = taskData;
  const fullText = (combinedText || `${title} ${text}`).trim();

  // 1. Read Auto-Add settings & Pause state FIRST before parsing or saving anything
  const activeUserId = (await AsyncStorage.getItem('@rupeo_active_user_id')) || 'local';
  const settings = await getSmsImportSettings(activeUserId, true);

  const pausedUntil = await getAutoAddPausedUntil();
  const isCurrentlyPaused = pausedUntil > Date.now();

  if (!settings.autoAddEnabled || isCurrentlyPaused) {
    log(`[HeadlessTask] Auto-add is ${!settings.autoAddEnabled ? 'OFF' : 'PAUSED'}. Dropping notification immediately with no storage.`);
    return;
  }

  log(`[HeadlessTask] Received notification from: ${packageName}`);

  // 2. Strict On-Device Filter Check (package allowlist + financial keywords)
  if (!shouldProcessNotification(packageName, fullText)) {
    log(`[HeadlessTask] Notification dropped by on-device filter: ${packageName}`);
    return;
  }

  // 3. Layer 1 Deduplication: hash(package + text + postTime rounded to minute)
  const notifHash = computeNotifHash(packageName, fullText, postTime);
  const alreadyProcessed = await isNotifAlreadyProcessed(notifHash);
  if (alreadyProcessed) {
    log(`[HeadlessTask] Duplicate notification dropped (Layer 1 hash): ${notifHash}`);
    return;
  }
  await markNotifProcessed(notifHash);

  // 4. Parse with existing high-accuracy parseAlert
  const parsed: ParsedAlert = parseAlert(fullText, {
    sender: packageName,
    timestamp: postTime,
  });

  if (parsed.amount === null || parsed.amount <= 0 || parsed.isOtpOrPromo) {
    log(`[HeadlessTask] Parse failed or is promo: ${fullText}`);
    return;
  }

  // 5. Layer 2 Deduplication: Cross-channel matching within 2 minutes
  const crossDedupe = await checkCrossChannelDuplicate(
    parsed.amount,
    parsed.type,
    postTime,
    packageName
  );

  if (crossDedupe.isDuplicate) {
    log(`[HeadlessTask] Cross-channel duplicate dropped (within 2 min of same payment event). Existing ID: ${crossDedupe.existingTxId}`);
    return;
  }

  // 6. Action: Auto-Add directly (if Review is OFF & confidence >= 90%) vs Pending Alerts Inbox
  const shouldAutoAddDirectly = !settings.reviewBeforeAdding && parsed.confidence >= 0.9;

  const dateStr = normalizeDate(new Date(postTime).toISOString());
  const merchantDisplay = parsed.merchantNormalized || parsed.merchant || (parsed.type === 'income' ? 'Income' : 'Expense');
  const bankDisplay = parsed.sender || 'Bank Alert';
  const last4Display = parsed.accountLast4 ? `••${parsed.accountLast4}` : '';

  if (shouldAutoAddDirectly) {
    const formattedNote = formatTransactionNote(bankDisplay, parsed.rawText, settings);
    const txId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 6.1 Save to local SQLite (expo-sqlite)
    saveTransactionToSQLite({
      id: txId,
      amount: parsed.amount,
      type: parsed.type === 'income' ? 'credit' : 'debit',
      merchant: merchantDisplay,
      category: parsed.category,
      bankName: bankDisplay,
      accountLast4: parsed.accountLast4,
      refNo: parsed.refNo,
      timestamp: postTime,
      channel: parsed.channel,
      rawText: parsed.rawText,
      status: 'auto_added',
      created_at: Date.now(),
    });

    // 6.2 Save to Rupeo main local database & trigger widgets/sync
    try {
      await insertTransaction(activeUserId, {
        id: txId,
        amount: parsed.amount,
        type: parsed.type === 'income' ? 'credit' : 'debit',
        category: parsed.category,
        merchant_name: merchantDisplay,
        description: formattedNote,
        payment_mode: parsed.channel === 'card' ? 'Card' : parsed.channel === 'ATM' ? 'Cash' : 'UPI',
        ref_no: parsed.refNo,
        utr: parsed.refNo,
        date: dateStr,
        source: 'notification_listener',
        sourceHash: notifHash,
        importedAt: Date.now(),
      });
    } catch (err) {
      warn('[HeadlessTask] Error inserting transaction into Rupeo database:', err);
    }

    // 6.3 Record for cross-channel deduplication
    await recordRecentPayment(parsed.amount, parsed.type, postTime, packageName, txId);

    // 6.4 Show local notification with Undo action ONLY IF master notifications toggle is ON
    try {
      const masterNotifsEnabled = await isMasterNotificationsEnabled();
      if (masterNotifsEnabled) {
        const verb = parsed.type === 'income' ? 'credited' : 'debited';
        const acctSnippet = last4Display ? ` (${last4Display})` : '';
        const notifBody = `₹${parsed.amount} ${verb} at ${merchantDisplay}${acctSnippet}`;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Transaction Detected',
            body: notifBody,
            sound: 'default',
            categoryIdentifier: 'AUTO_ADD_TRANSACTION',
            data: {
              transactionId: txId,
              type: 'AUTO_ADD_TRANSACTION',
              amount: parsed.amount,
              userId: activeUserId,
            },
          },
          trigger: null, // Send immediately
        });
        log(`[HeadlessTask] Scheduled local notification: ${notifBody}`);
      } else {
        log(`[HeadlessTask] Master notifications disabled. Transaction auto-added silently.`);
      }
    } catch (notifErr) {
      warn('[HeadlessTask] Failed to post local notification:', notifErr);
    }
  } else {
    // Send to Pending Alerts Inbox
    const pendingId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payKey = `${parsed.amount}_${parsed.type}_${notifHash}`;

    // Save to SQLite pending alerts table
    savePendingAlertToSQLite({
      id: pendingId,
      payKey,
      amount: parsed.amount,
      type: parsed.type,
      merchant: merchantDisplay,
      category: parsed.category,
      bankName: bankDisplay,
      accountLast4: parsed.accountLast4,
      refNo: parsed.refNo,
      timestamp: postTime,
      channel: parsed.channel,
      confidence: parsed.confidence,
      rawText: parsed.rawText,
    });

    // Save to Rupeo pending alerts inbox
    await addPendingAlert(activeUserId, {
      id: pendingId,
      payKey,
      msgHash: notifHash,
      alert: parsed,
      createdAt: Date.now(),
    });

    // Record for dedupe so duplicate notifications within 2 mins don't spam the inbox
    await recordRecentPayment(parsed.amount, parsed.type, postTime, packageName);
    log(`[HeadlessTask] Alert saved to Pending Alerts Inbox: ${pendingId}`);
  }

  // 7. Store last-processed timestamp for catch-up tracking
  try {
    await AsyncStorage.setItem(LAST_PROCESSED_TIMESTAMP_KEY, String(postTime));
    setSQLiteSetting('last_processed_timestamp', String(postTime));
  } catch (err) {
    warn('[HeadlessTask] Error saving last processed timestamp:', err);
  }
}

// Register Headless JS task for Android
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('RupeoNotificationTask', () => handleNotificationTask);
  log('[RupeoNotificationTask] Registered Headless JS task');
}
