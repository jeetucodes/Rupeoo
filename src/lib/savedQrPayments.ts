import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertTransaction } from './database';
import { getLocalDateString, formatTime12Hour } from './dateUtils';
import { triggerTransactionVibration } from './sound';

export interface SavedQrPart {
  id: string;
  partIndex: number;
  totalParts: number;
  amount: number;
  amountFormatted: string;
  upiUri: string;
  isPaid: boolean;
}

export interface SavedQrPaymentCard {
  id: string;
  userId?: string;
  totalAmount: number;
  totalAmountFormatted: string;
  upiId: string;
  payeeName?: string;
  note?: string;
  parts: SavedQrPart[];
  totalParts: number;
  status: 'pending' | 'paid';
  createdAt: string;
  paidAt?: string;
  transactionId?: string;
}

const getStorageKey = (userId?: string) => `@rupeo_saved_qr_cards_${userId || 'guest'}`;

/**
 * Fetch all saved QR payment cards
 */
export async function getSavedQrPayments(userId?: string): Promise<SavedQrPaymentCard[]> {
  try {
    const raw = await AsyncStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const list: SavedQrPaymentCard[] = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('Error fetching saved QR payments:', err);
    return [];
  }
}

/**
 * Save a new QR payment card
 */
export async function saveQrPayment(
  userId: string | undefined,
  cardData: Omit<SavedQrPaymentCard, 'id' | 'createdAt' | 'status'>
): Promise<SavedQrPaymentCard> {
  const existing = await getSavedQrPayments(userId);
  const newCard: SavedQrPaymentCard = {
    ...cardData,
    id: `qr_bill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const updated = [newCard, ...existing];
  await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
  return newCard;
}

/**
 * Delete a saved QR payment card
 */
export async function deleteSavedQrPayment(userId: string | undefined, id: string): Promise<void> {
  const existing = await getSavedQrPayments(userId);
  const updated = existing.filter((c) => c.id !== id);
  await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
}

/**
 * Mark a saved QR payment as paid and automatically record transaction in Rupeo
 */
export async function addSavedQrToTransactions(
  userId: string | undefined,
  cardId: string
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const existing = await getSavedQrPayments(userId);
    const target = existing.find((c) => c.id === cardId);
    if (!target) {
      return { success: false, error: 'Saved QR card not found' };
    }

    let txId: string | undefined = undefined;

    // If user is authenticated in Rupeo, record real transaction in Firestore
    if (userId) {
      const now = new Date();
      const timeStr = formatTime12Hour(now);
      const dateStr = getLocalDateString(now);

      const createdId = await insertTransaction(userId, {
        date: dateStr,
        time: timeStr,
        amount: Number(target.totalAmount) || 0,
        type: 'debit',
        merchant_name: target.payeeName?.trim() || target.upiId.trim(),
        description: target.note ? `Smart QR Pay: ${target.note.trim()} (${target.upiId})` : `Smart QR Pay to ${target.upiId}`,
        category: 'Bills',
        payment_mode: 'UPI',
        source: 'split_qr',
      });
      if (createdId) {
        txId = createdId;
      }
    }

    // Haptic vibration confirmation
    triggerTransactionVibration().catch(() => {});

    // Update local card status to paid
    const updatedCards = existing.map((c) => {
      if (c.id === cardId) {
        return {
          ...c,
          status: 'paid' as const,
          paidAt: new Date().toISOString(),
          transactionId: txId,
          parts: c.parts.map((p) => ({ ...p, isPaid: true })),
        };
      }
      return c;
    });

    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(updatedCards));
    return { success: true, txId };
  } catch (err: any) {
    console.error('Error adding saved QR to transactions:', err);
    return { success: false, error: err?.message || 'Failed to add payment to transactions' };
  }
}
