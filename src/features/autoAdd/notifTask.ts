/**
 * Headless JS Task: RupeoNotificationTask
 *
 * Runs in the background (even when Rupeo is killed) whenever a matching
 * financial notification is captured by RupeoNotificationListener.
 *
 * Execution Pipeline:
 * 1. Filter on-device by allowlist & debit/credit pattern (drops OTP / promo).
 * 2. Deduplicate by exact hash(package + text + exact postTime).
 * 3. Cross-channel deduplicate (match amount + type within 2 minutes between SMS & UPI apps).
 * 4. Parse using existing high-accuracy parseAlert().
 * 5. Apply user settings (autoAddEnabled, reviewBeforeAdding, maskAccountNumbers, saveOriginalInNote).
 * 6. Save to local SQLite (expo-sqlite) + Rupeo local storage (insertTransaction).
 * 7. Show local notification with transaction details & Undo action.
 * 8. Always write diagnostic record to notif_log table (keep last 100). Never silently return.
 */

import { AppRegistry, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { safeJsonParse } from '@/lib/safeStorage';
import { parseAlert, ParsedAlert } from '@/lib/alertParser';
import { shouldProcessNotification, getFriendlySenderName, isUpiOrBankPackage } from './filter';
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
  insertNotifLog,
  updateTransactionInSQLite,
} from './sqliteStorage';
import {
  insertTransaction,
  updateTransaction,
  normalizeDate,
  getOfflineTransactions,
  recordMatchedBillPayment,
} from '@/lib/database';
import {
  isPackageAllowedForAlerts,
  isLikelyUnknownFinanceApp,
  recordDetectedFinanceApp,
} from '@/lib/financeApps';
import {
  matchIncomingEvent,
  registerUnmatchedTransaction,
  getSourceDisplayName,
  type MatcherEvent,
  type TransactionSourceRecord,
} from '@/lib/crossSourceMatcher';
import { matchBill, calculateAdvancedDueDate, BillMatchResult } from '@/features/bills/matchBill';
import { addPendingAlert } from '@/lib/pendingInbox';
import { getSmsImportSettings, formatTransactionNote, getAutoAddPausedUntil } from '@/lib/smsSettings';
import {
  isMasterNotificationsEnabled,
  sendAutoAddedTransactionNotification,
  sendPendingInboxNotification,
  triggerBudgetAlertIfNeeded,
  scheduleNext48h,
} from '@/features/notifications';
import { formatCurrency } from '@/utils/formatCurrency';
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

    // Set category for Auto-Add with Change Category & Undo actions
    await Notifications.setNotificationCategoryAsync('AUTO_ADD_TRANSACTION', [
      {
        identifier: 'CHANGE_CATEGORY_ACTION',
        buttonTitle: 'Change category',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: 'UNDO_ACTION',
        buttonTitle: 'Undo',
        options: {
          opensAppToForeground: false,
        },
      },
    ]);

    // Set category for Pending Inbox with Add, Set Category & Dismiss actions
    await Notifications.setNotificationCategoryAsync('RUPEO_PENDING_INBOX', [
      {
        identifier: 'ADD_INBOX_ACTION',
        buttonTitle: 'Add',
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: 'CHANGE_CATEGORY_ACTION',
        buttonTitle: 'Set category',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: 'DISMISS_INBOX_ACTION',
        buttonTitle: 'Dismiss',
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
 * Wrapped entirely in try/catch with diagnostic logging to notif_log on every branch.
 */
export async function handleNotificationTask(taskData: NotificationTaskPayload): Promise<void> {
  if (!taskData || !taskData.packageName) {
    insertNotifLog({
      timestamp: Date.now(),
      packageName: 'unknown',
      parsedStatus: 'dropped',
      reasonSkipped: 'filteredOut',
      summary: 'Empty or missing task payload',
      rawSnippet: '',
    });
    return;
  }

  const { packageName, title = '', text = '', combinedText = '', postTime = Date.now() } = taskData;
  const fullText = (combinedText || `${title} ${text}`).trim();

  try {
    // 1. Read Auto-Add settings & Pause state FIRST before parsing or saving anything
    const activeUserId = (await AsyncStorage.getItem('@rupeo_active_user_id')) || 'local';
    const settings = await getSmsImportSettings(activeUserId, true);

    const pausedUntil = await getAutoAddPausedUntil();
    const isCurrentlyPaused = pausedUntil > Date.now();

    if (!settings.autoAddEnabled || isCurrentlyPaused) {
      const reason = !settings.autoAddEnabled ? 'autoAddOff' : 'paused';
      const summary = !settings.autoAddEnabled
        ? 'Skipped: auto-add off'
        : 'Skipped: auto-add paused';
      log(`[HeadlessTask] ${summary}. Dropping notification from ${packageName}.`);
      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'dropped',
        reasonSkipped: reason,
        summary,
        rawSnippet: fullText,
      });
      return;
    }

    log(`[HeadlessTask] Received notification from: ${packageName}`);

    // 2. Managed Finance Apps Check (user-editable allowlist & unknown app detection)
    const isAllowed = await isPackageAllowedForAlerts(packageName);
    if (!isAllowed) {
      const friendlySender = getFriendlySenderName(packageName, title);
      const preParsed = parseAlert(fullText, {
        sender: friendlySender,
        timestamp: postTime,
      });
      if (
        !preParsed.isOtpOrPromo &&
        preParsed.amount &&
        preParsed.amount > 0 &&
        isLikelyUnknownFinanceApp(packageName, title || friendlySender, preParsed.confidence)
      ) {
        await recordDetectedFinanceApp(packageName, title || friendlySender, fullText);
        log(`[HeadlessTask] Unknown finance app detected with alert: ${packageName}. Recorded for user approval.`);
        insertNotifLog({
          timestamp: postTime,
          packageName,
          parsedStatus: 'dropped',
          reasonSkipped: 'filteredOut',
          summary: `Detected finance app: ${title || packageName} (pending approval in Settings)`,
          rawSnippet: fullText,
        });
        return;
      }

      log(`[HeadlessTask] Notification dropped: package not allowed (${packageName})`);
      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'dropped',
        reasonSkipped: 'filteredOut',
        summary: 'Skipped: package not in Finance Apps allowlist',
        rawSnippet: fullText,
      });
      return;
    }

    // Strict On-Device Filter Check (reject OTPs, promo, non-financial texts)
    if (!shouldProcessNotification(packageName, fullText)) {
      log(`[HeadlessTask] Notification dropped by on-device filter: ${packageName}`);
      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'dropped',
        reasonSkipped: 'filteredOut',
        summary: 'Skipped: non-financial or OTP/promo',
        rawSnippet: fullText,
      });
      return;
    }

    // 3. Layer 1 Deduplication: hash(package + text + exact postTime)
    const notifHash = computeNotifHash(packageName, fullText, postTime);
    const alreadyProcessed = await isNotifAlreadyProcessed(notifHash);
    if (alreadyProcessed) {
      log(`[HeadlessTask] Duplicate notification dropped (Layer 1 hash): ${notifHash}`);
      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'dropped',
        reasonSkipped: 'duplicate',
        summary: 'Skipped: duplicate event (exact hash)',
        rawSnippet: fullText,
      });
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
      const reasonText = parsed.isOtpOrPromo
        ? 'Dropped OTP or promo alert'
        : 'Could not read transaction amount';
      log(`[HeadlessTask] ${reasonText}: ${fullText}`);
      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'failed',
        reasonSkipped: 'parseFailed',
        summary: parsed.isOtpOrPromo ? 'Skipped: OTP/Promo' : 'Could not read',
        rawSnippet: fullText,
      });
      return;
    }

    // 5. Cross-Source Matcher: Match with existing unmatched transactions from other sources
    const isUpi = isUpiOrBankPackage(packageName);
    const matcherSource: 'app_notification' | 'upi_app' | 'sms' =
      packageName.includes('mms') || packageName.includes('messaging')
        ? 'sms'
        : (isUpi ? 'upi_app' : 'app_notification');

    const incomingMatcherEvent: MatcherEvent = {
      source: matcherSource,
      packageName,
      sender: friendlySender,
      amount: parsed.amount,
      type: parsed.type === 'income' ? 'credit' : 'debit',
      timestamp: postTime,
      merchant: parsed.merchantNormalized || parsed.merchant,
      accountLast4: parsed.accountLast4,
      refNo: parsed.refNo,
      balanceAfter: parsed.balance !== null ? parsed.balance : undefined,
      category: parsed.category,
    };

    const matchResult = await matchIncomingEvent(incomingMatcherEvent);
    if (
      matchResult.matched &&
      matchResult.action === 'enrich' &&
      matchResult.matchedTxId &&
      matchResult.enrichedFields
    ) {
      const targetTxId = matchResult.matchedTxId;
      const enriched = matchResult.enrichedFields;
      log(`[HeadlessTask] Cross-source match found! Enriching existing transaction: ${targetTxId}`);
      try {
        await updateTransaction(activeUserId, targetTxId, {
          ...enriched,
          is_manually_edited: 0,
        });
        updateTransactionInSQLite(targetTxId, {
          refNo: enriched.ref_no,
          accountLast4: enriched.accountLast4,
          merchant: enriched.merchant_name,
          category: enriched.category,
        });
      } catch (enrichErr) {
        warn('[HeadlessTask] Error enriching matched transaction:', enrichErr);
      }

      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'ok',
        reasonSkipped: 'saved',
        summary: `Enriched transaction (${formatCurrency(parsed.amount)}) with ${friendlySender}`,
        rawSnippet: fullText,
      });
      return;
    }

    const initialSourceRecord: TransactionSourceRecord = {
      source: matcherSource,
      name: getSourceDisplayName(incomingMatcherEvent),
      packageName,
      timestamp: postTime,
      refNo: parsed.refNo,
    };

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
      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'dropped',
        reasonSkipped: 'duplicate',
        summary: `Skipped: duplicate (matched across apps)`,
        rawSnippet: fullText,
      });
      return;
    }

    // 5.1 Local Database Deduplication: Only match if UPI ref numbers match exactly or sourceHash matches
    const dateStr = normalizeDate(new Date(postTime).toISOString());
    try {
      const existingOffline = await getOfflineTransactions(activeUserId);
      const isDbDup = existingOffline.some((t: any) => {
        if (!t || Math.abs(Number(t.amount) - parsed.amount!) > 0.01) return false;
        const txType = (t.type || 'debit').toLowerCase();
        const alertType = parsed.type === 'income' ? 'credit' : 'debit';
        if (txType !== alertType) return false;

        const incomingRef = (parsed.refNo || '').trim().toLowerCase();
        const txRef = (t.ref_no || t.utr || '').trim().toLowerCase();

        // 1. If both have UPI refs: must match to be a duplicate
        if (incomingRef && txRef) {
          return incomingRef === txRef;
        }

        // 2. If same notification event hash
        if (t.sourceHash && t.sourceHash === notifHash) {
          return true;
        }

        return false;
      });

      if (isDbDup) {
        log(`[HeadlessTask] Duplicate dropped: transaction already recorded in Rupeo database.`);
        insertNotifLog({
          timestamp: postTime,
          packageName,
          parsedStatus: 'dropped',
          reasonSkipped: 'duplicate',
          summary: `Skipped: duplicate (already recorded)`,
          rawSnippet: fullText,
        });
        return;
      }
    } catch (dbErr) {
      warn('[HeadlessTask] Error checking local db duplicate:', dbErr);
    }

    // 6. Bill Matching & Execution
    const isDebit = parsed.type === 'expense';
    const merchantDisplay = parsed.merchantNormalized || parsed.merchant || (parsed.type === 'income' ? 'Income' : 'Expense');
    const bankDisplay = getFriendlySenderName(packageName, title || parsed.sender);

    let billMatch: BillMatchResult = { matchType: 'none', candidates: [], suggestedBill: null, confidence: 0 };
    if (isDebit && parsed.amount && parsed.amount > 0) {
      let bills = getRecurringBillsFromSQLite();
      if (!bills || bills.length === 0) {
        try {
          const billsKey = `@rupeo_offline_bills_${activeUserId}`;
          const offlineRaw = await AsyncStorage.getItem(billsKey);
          if (offlineRaw) {
            bills = safeJsonParse(offlineRaw, [], billsKey, (v) => Array.isArray(v));
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

      // Advance next due date by bill's frequency/cycle
      const nextDueDate = calculateAdvancedDueDate(matchedBill, dateStr);

      const paymentRecord = {
        id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        transactionId: txId,
        amount: parsed.amount,
        date: dateStr,
        paidAt: Date.now(),
        paymentMode: 'UPI',
      };

      // Update bill in SQLite immediately
      markBillPaidInSQLite(billId, txId, parsed.amount, dateStr, nextDueDate, paymentRecord);

      // Async sync to cloud in background
      recordMatchedBillPayment(activeUserId, billId, txId, parsed.amount, dateStr, nextDueDate, paymentRecord).catch(() => {});

      const detectedMode = 'UPI';
      // Save transaction to local SQLite (expo-sqlite)
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
        channel: 'UPI',
        rawText: messageBody,
        originalMessage: messageBody,
        userNote: formattedNote,
        payment_mode: 'UPI',
        userId: activeUserId,
        status: 'auto_added',
        billId: matchedBill.id,
        created_at: Date.now(),
      });

      // Save to Rupeo main local database
      insertTransaction(activeUserId, {
        id: txId,
        amount: parsed.amount,
        type: 'debit',
        category: finalCategory,
        merchant_name: matchedBill.title,
        description: formattedNote,
        payment_mode: 'UPI',
        paymentMode: 'UPI',
        ref_no: parsed.refNo,
        utr: parsed.refNo,
        date: dateStr,
        source: 'notification_listener',
        sourceHash: notifHash,
        billId: matchedBill.id,
        importedAt: Date.now(),
        sources: [initialSourceRecord],
        accountLast4: parsed.accountLast4,
      }).then(() => {
        registerUnmatchedTransaction(txId, incomingMatcherEvent).catch(() => {});
      }).catch((err) => {
        warn('[HeadlessTask] Error inserting bill transaction into Rupeo database:', err);
      });

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

      // Log success to notif_log
      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'ok',
        reasonSkipped: 'saved',
        summary: `Saved · Bill Paid: ${matchedBill.title} (${formatCurrency(parsed.amount)})`,
        rawSnippet: fullText,
      });

      // Show local notification
      try {
        const masterNotifsEnabled = await isMasterNotificationsEnabled();
        if (masterNotifsEnabled) {
          await setupAutoAddNotificationChannel();
          const notifTitle = `${matchedBill.title} ${formatCurrency(parsed.amount)} marked as paid ✅`;
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
        }
      } catch (notifErr) {
        warn('[HeadlessTask] Failed to post bill notification:', notifErr);
      }
    } else if (shouldRouteToInboxForBill || mustReview) {
      // Route to Pending Alerts Inbox (when user configured manual review or ambiguous bill match)
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

      registerUnmatchedTransaction(pendingId, incomingMatcherEvent).catch(() => {});

      await recordRecentPayment(parsed.amount, parsed.type, postTime, packageName, pendingId, parsed.refNo, parsed.accountLast4);

      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'ok',
        reasonSkipped: 'saved',
        summary: `Saved to Inbox · ${formatCurrency(parsed.amount)} (${merchantDisplay})`,
        rawSnippet: fullText,
      });
      log(`[HeadlessTask] Alert saved to Pending Alerts Inbox: ${pendingId}`);

      // Post notification with Add & Set Category quick actions
      try {
        await sendPendingInboxNotification({
          pendingId,
          amount: parsed.amount,
          merchant: merchantDisplay,
          userId: activeUserId,
          category: billMatch.suggestedBill?.category || parsed.category,
        });
      } catch (notifErr) {
        warn('[HeadlessTask] Failed to post pending inbox notification:', notifErr);
      }
    } else {
      // Normal auto-add direct without bill match
      const messageBody = (text && text.trim().length > 0) ? text : parsed.rawText;
      const formattedNote = formatTransactionNote(bankDisplay, messageBody, {
        ...settings,
        saveOriginalInNote: settings.saveOriginalInNote !== false,
      });
      const txId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const directMode = 'UPI';
      // Save to local SQLite (single write)
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
        channel: 'UPI',
        rawText: messageBody,
        originalMessage: messageBody,
        userNote: formattedNote,
        payment_mode: 'UPI',
        userId: activeUserId,
        status: 'auto_added',
        created_at: Date.now(),
      });

      // Save to Rupeo main local database
      insertTransaction(activeUserId, {
        id: txId,
        amount: parsed.amount,
        type: parsed.type === 'income' ? 'credit' : 'debit',
        category: parsed.category,
        merchant_name: merchantDisplay,
        description: formattedNote,
        payment_mode: 'UPI',
        paymentMode: 'UPI',
        ref_no: parsed.refNo,
        utr: parsed.refNo,
        date: dateStr,
        source: 'notification_listener',
        sourceHash: notifHash,
        importedAt: Date.now(),
        sources: [initialSourceRecord],
        accountLast4: parsed.accountLast4,
      }).then(() => {
        registerUnmatchedTransaction(txId, incomingMatcherEvent).catch(() => {});
      }).catch((err) => {
        warn('[HeadlessTask] Error inserting transaction into Rupeo database:', err);
      });

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

      // Log success to notif_log
      insertNotifLog({
        timestamp: postTime,
        packageName,
        parsedStatus: 'ok',
        reasonSkipped: 'saved',
        summary: `Saved · Auto-added ${formatCurrency(parsed.amount)} (${merchantDisplay})`,
        rawSnippet: fullText,
      });

      // Show local notification with Undo action
      try {
        await sendAutoAddedTransactionNotification({
          transactionId: txId,
          amount: parsed.amount,
          merchant: merchantDisplay,
          userId: activeUserId,
          category: parsed.category,
        });

        if (parsed.type === 'expense') {
          triggerBudgetAlertIfNeeded(parsed.amount, activeUserId).catch(() => {});
        }

        scheduleNext48h(activeUserId).catch(() => {});
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
  } catch (fatalErr: any) {
    warn('[HeadlessTask] Fatal error in handleNotificationTask:', fatalErr);
    insertNotifLog({
      timestamp: postTime,
      packageName,
      parsedStatus: 'failed',
      reasonSkipped: 'parseFailed',
      summary: `Error: ${fatalErr?.message || 'unknown'}`,
      rawSnippet: fullText,
    });
  }
}

// Register Headless JS task for Android
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('RupeoNotificationTask', () => handleNotificationTask);
  log('[RupeoNotificationTask] Registered Headless JS task');
}
