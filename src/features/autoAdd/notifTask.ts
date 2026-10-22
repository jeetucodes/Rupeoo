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
import { shouldProcessNotification, isPackageAllowed, getFriendlySenderName } from './filter';
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
  getRecurringBillsFromSQLite,
  markBillPaidInSQLite,
} from './sqliteStorage';
import { insertTransaction, normalizeDate, getOfflineTransactions, recordMatchedBillPayment } from '@/lib/database';
import { matchBill, calculateAdvancedDueDate, BillMatchResult } from '@/features/bills/matchBill';
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
  const friendlySender = getFriendlySenderName(packageName, title);
  const parsed: ParsedAlert = parseAlert(fullText, {
    sender: friendlySender,
    timestamp: postTime,
  });

  if (parsed.amount === null || parsed.amount <= 0 || parsed.isOtpOrPromo) {
    log(`[HeadlessTask] Parse failed or is promo: ${fullText}`);
    return;
  }

  // 5. Layer 2 Deduplication: Cross-channel matching (Bank app + SMS)
  const crossDedupe = await checkCrossChannelDuplicate(
    parsed.amount,
    parsed.type,
    postTime,
    packageName,
    parsed.refNo,
    parsed.accountLast4
  );

  if (crossDedupe.isDuplicate) {
    log(`[HeadlessTask] Cross-channel duplicate dropped (matched same payment event across apps). Existing ID: ${crossDedupe.existingTxId}`);
    return;
  }

  // 5.1 Local Database Deduplication: Check if already recorded in Rupeo
  const dateStr = normalizeDate(new Date(postTime).toISOString());
  try {
    const existingOffline = await getOfflineTransactions(activeUserId);
    const isDbDup = existingOffline.some((t: any) => {
      if (!t || Math.abs(Number(t.amount) - parsed.amount!) > 0.01) return false;
      const txType = (t.type || 'debit').toLowerCase();
      const alertType = parsed.type === 'income' ? 'credit' : 'debit';
      if (txType !== alertType) return false;

      // Match refNo/utr across transactions
      if (parsed.refNo && (t.ref_no === parsed.refNo || t.utr === parsed.refNo)) {
        return true;
      }

      // Match same date & within 6 minutes
      if (t.date === dateStr) {
        const tCreated = t.created_at ? Number(t.created_at) : 0;
        if (tCreated > 0 && Math.abs(tCreated - postTime) <= 6 * 60 * 1000) {
          return true;
        }
      }
      return false;
    });

    if (isDbDup) {
      log(`[HeadlessTask] Duplicate dropped: transaction already recorded in Rupeo database.`);
      return;
    }
  } catch (dbErr) {
    warn('[HeadlessTask] Error checking local db duplicate:', dbErr);
  }

  // 6. Bill Matching & Execution
  // RULES:
  // - Run matching AFTER parsed, ONLY if Auto-Add is ON.
  // - Only debit transactions are matched. Credits never match.
  // - If Review before adding is ON: always go to Pending Inbox with the suggested bill pre-selected.
  // - Exactly 1 candidate + merchant/keyword matches + autoConfirm ON => Auto-mark Paid, link IDs, local notification with Undo.
  // - Exactly 1 candidate but merchant does NOT match, or multiple candidates => Pending Alerts Inbox with "Match to bill?" prompt.
  const isDebit = parsed.type === 'expense';
  const merchantDisplay = parsed.merchantNormalized || parsed.merchant || (parsed.type === 'income' ? 'Income' : 'Expense');
  const bankDisplay = getFriendlySenderName(packageName, title || parsed.sender);
  const last4Display = parsed.accountLast4 ? `••${parsed.accountLast4}` : '';

  let billMatch: BillMatchResult = { matchType: 'none', candidates: [], suggestedBill: null, confidence: 0 };
  if (isDebit && parsed.amount && parsed.amount > 0) {
    let bills = getRecurringBillsFromSQLite();
    if (!bills || bills.length === 0) {
      try {
        const offlineRaw = await AsyncStorage.getItem(`@rupeo_offline_bills_${activeUserId}`);
        if (offlineRaw) {
          bills = JSON.parse(offlineRaw);
        }
      } catch {}
    }

    billMatch = matchBill(
      {
        amount: parsed.amount,
        type: 'debit',
        merchant: merchantDisplay,
        rawText: fullText,
        note: text,
        date: dateStr,
      },
      bills,
      postTime
    );
    log(`[HeadlessTask] Bill matching result: ${billMatch.matchType} (reason: ${billMatch.reason || 'none'}, candidates: ${billMatch.candidates.length})`);
  }

  const mustReview = settings.reviewBeforeAdding;
  const shouldAutoConfirmBill = !mustReview && billMatch.matchType === 'auto' && Boolean(billMatch.suggestedBill?.id);
  const shouldRouteToInboxForBill = billMatch.matchType === 'inbox' || (mustReview && billMatch.candidates.length > 0);

  if (shouldAutoConfirmBill) {
    // Exact 1 candidate + keyword match => Auto-confirm payment!
    const matchedBill = billMatch.suggestedBill!;
    const billId = matchedBill.id!;
    const txId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const finalCategory = matchedBill.category || parsed.category || 'Bills';
    const messageBody = (text && text.trim().length > 0) ? text : parsed.rawText;
    const formattedNote = formatTransactionNote(bankDisplay, messageBody, {
      ...settings,
      saveOriginalInNote: settings.saveOriginalInNote !== false,
    });

    // 6.1 Advance next due date by bill's frequency/cycle
    const nextDueDate = calculateAdvancedDueDate(matchedBill, dateStr);

    // 6.2 Prepare payment record for bill's payment history
    const paymentRecord = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      transactionId: txId,
      amount: parsed.amount,
      date: dateStr,
      paidAt: Date.now(),
      paymentMode: parsed.channel === 'card' ? 'Card' : parsed.channel === 'ATM' ? 'Cash' : 'UPI',
    };

    // 6.3 Update bill in SQLite immediately (offline background safe)
    markBillPaidInSQLite(billId, txId, parsed.amount, dateStr, nextDueDate, paymentRecord);

    // 6.4 Update bill in Rupeo Firestore / async local storage
    recordMatchedBillPayment(activeUserId, billId, txId, parsed.amount, dateStr, nextDueDate, paymentRecord).catch(() => {});

    // 6.5 Save transaction to local SQLite (expo-sqlite)
    saveTransactionToSQLite({
      id: txId,
      amount: parsed.amount,
      type: 'debit',
      merchant: matchedBill.title,
      category: finalCategory,
      bankName: bankDisplay,
      accountLast4: parsed.accountLast4,
      refNo: parsed.refNo,
      timestamp: postTime,
      channel: parsed.channel,
      rawText: messageBody,
      status: 'auto_added',
      billId: matchedBill.id,
      created_at: Date.now(),
    });

    // 6.6 Save to Rupeo main local database & trigger widgets/sync
    try {
      await insertTransaction(activeUserId, {
        id: txId,
        amount: parsed.amount,
        type: 'debit',
        category: finalCategory,
        merchant_name: matchedBill.title,
        description: formattedNote,
        payment_mode: parsed.channel === 'card' ? 'Card' : parsed.channel === 'ATM' ? 'Cash' : 'UPI',
        ref_no: parsed.refNo,
        utr: parsed.refNo,
        date: dateStr,
        source: 'notification_listener',
        sourceHash: notifHash,
        billId: matchedBill.id,
        importedAt: Date.now(),
      });
    } catch (err) {
      warn('[HeadlessTask] Error inserting bill transaction into Rupeo database:', err);
    }

    // 6.7 Record for cross-channel deduplication
    await recordRecentPayment(
      parsed.amount,
      parsed.type,
      postTime,
      packageName,
      txId,
      parsed.refNo,
      parsed.accountLast4
    );

    // 6.8 Show local notification: "<Bill Title> ₹<Amount> marked as paid" with Undo action
    try {
      const masterNotifsEnabled = await isMasterNotificationsEnabled();
      if (masterNotifsEnabled) {
        await setupAutoAddNotificationChannel();
        const notifTitle = `${matchedBill.title} ₹${parsed.amount} marked as paid ✅`;
        const notifBody = `Next due on ${nextDueDate} • Auto-matched from notification`;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: notifTitle,
            body: notifBody,
            sound: 'default',
            categoryIdentifier: 'AUTO_ADD_TRANSACTION',
            data: {
              transactionId: txId,
              billId: billId,
              type: 'AUTO_ADD_TRANSACTION',
              amount: parsed.amount,
              userId: activeUserId,
              prevDueDate: matchedBill.nextDueDate,
              isBillMatch: true,
            },
          },
          trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
        });
        log(`[HeadlessTask] Scheduled local bill notification: ${notifTitle}`);
      } else {
        log(`[HeadlessTask] Master notifications disabled. Bill auto-confirmed silently.`);
      }
    } catch (notifErr) {
      warn('[HeadlessTask] Failed to post bill notification:', notifErr);
    }
  } else if (shouldRouteToInboxForBill || mustReview) {
    // Route to Pending Alerts Inbox with suggestedBillId & candidateBills
    const pendingId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payKey = `${parsed.amount}_${parsed.type}_${notifHash}`;
    const suggestedId = billMatch.suggestedBill?.id || null;

    savePendingAlertToSQLite({
      id: pendingId,
      payKey,
      amount: parsed.amount,
      type: parsed.type,
      merchant: merchantDisplay,
      category: billMatch.suggestedBill?.category || parsed.category,
      bankName: bankDisplay,
      accountLast4: parsed.accountLast4,
      refNo: parsed.refNo,
      timestamp: postTime,
      channel: parsed.channel,
      confidence: billMatch.confidence > 0 ? billMatch.confidence / 100 : parsed.confidence,
      rawText: parsed.rawText,
      billId: suggestedId,
      candidateBills: billMatch.candidates,
      suggestedBillId: suggestedId || undefined,
    });

    await addPendingAlert(activeUserId, {
      id: pendingId,
      payKey,
      msgHash: notifHash,
      alert: parsed,
      candidateBills: billMatch.candidates,
      suggestedBillId: suggestedId || undefined,
      billId: suggestedId || undefined,
      createdAt: Date.now(),
    });

    await recordRecentPayment(parsed.amount, parsed.type, postTime, packageName);
    log(`[HeadlessTask] Alert saved to Pending Alerts Inbox with bill candidates: ${pendingId}`);
  } else {
    // Normal auto-add direct without bill match
    const messageBody = (text && text.trim().length > 0) ? text : parsed.rawText;
    const formattedNote = formatTransactionNote(bankDisplay, messageBody, {
      ...settings,
      saveOriginalInNote: settings.saveOriginalInNote !== false,
    });
    const txId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Save to local SQLite (expo-sqlite)
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
      rawText: messageBody,
      status: 'auto_added',
      created_at: Date.now(),
    });

    // Save to Rupeo main local database & trigger widgets/sync
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

    // Record for cross-channel deduplication
    await recordRecentPayment(
      parsed.amount,
      parsed.type,
      postTime,
      packageName,
      txId,
      parsed.refNo,
      parsed.accountLast4
    );

    // Show local notification with Undo action
    try {
      const masterNotifsEnabled = await isMasterNotificationsEnabled();
      if (masterNotifsEnabled) {
        await setupAutoAddNotificationChannel();
        const verb = parsed.type === 'income' ? 'credited' : 'debited';
        const acctSnippet = last4Display ? ` (${last4Display})` : '';
        const notifTitle = 'Transaction Added ✅';
        const notifBody = `₹${parsed.amount} ${verb} at ${merchantDisplay}${acctSnippet} • Added to Rupeo`;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: notifTitle,
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
          trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
        });
        log(`[HeadlessTask] Scheduled local notification: ${notifTitle} - ${notifBody}`);
      } else {
        log(`[HeadlessTask] Master notifications disabled. Transaction auto-added silently.`);
      }
    } catch (notifErr) {
      warn('[HeadlessTask] Failed to post local notification:', notifErr);
    }
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
