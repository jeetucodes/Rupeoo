import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getAllTransactions, insertTransactionsBatch, normalizeDate } from './database';
import { getLocalDateString } from './dateUtils';

export interface BackupTransaction {
  date: string;
  amount: number;
  type?: 'debit' | 'credit';
  category?: string;
  merchant_name?: string;
  description?: string;
  utr?: string;
  ref_no?: string;
  payment_mode?: string;
  time?: string;
}

export interface GenerateBackupOptions {
  periodMode?: 'all' | 'month';
  monthStr?: string; // YYYY-MM
}

export async function generateBackupData(
  userId: string,
  options?: GenerateBackupOptions
): Promise<{
  count: number;
  jsonData: string;
  csvData: string;
}> {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // Force refresh to pull 100% of remote transactions from Firestore & reconcile with local cache
  let txs: any[] = [];
  try {
    txs = await getAllTransactions(userId, true);
  } catch (err) {
    console.warn('generateBackupData forceRefresh fallback to local:', err);
    txs = await getAllTransactions(userId, false);
  }

  if (!txs || txs.length === 0) {
    txs = await getAllTransactions(userId, false);
  }

  if (!txs || txs.length === 0) {
    return { count: 0, jsonData: '[]', csvData: '' };
  }

  // If user selected a specific month, filter to that month; otherwise keep 100% of all data across all time
  if (options?.periodMode === 'month' && options?.monthStr) {
    txs = txs.filter((t: any) => t.date && t.date.startsWith(options.monthStr!));
  }

  const sanitized: BackupTransaction[] = txs.map(t => ({
    date: t.date || getLocalDateString(),
    amount: Number(t.amount) || 0,
    type: (t.type || 'debit') as 'debit' | 'credit',
    category: t.category || 'Others',
    merchant_name: t.merchant_name || '',
    description: t.description || '',
    utr: t.utr || '',
    ref_no: t.ref_no || '',
    payment_mode: t.payment_mode || '',
    time: t.time || '',
  }));

  const jsonData = JSON.stringify(sanitized, null, 2);

  const headers = ['Date', 'Amount', 'Type', 'Category', 'Merchant', 'Description', 'UTR', 'RefNo', 'PaymentMode', 'Time'];
  const rows = sanitized.map(t => [
    `"${t.date}"`,
    t.amount,
    `"${t.type}"`,
    `"${(t.category || '').replace(/"/g, '""')}"`,
    `"${(t.merchant_name || '').replace(/"/g, '""')}"`,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    `"${(t.utr || '').replace(/"/g, '""')}"`,
    `"${(t.ref_no || '').replace(/"/g, '""')}"`,
    `"${(t.payment_mode || '').replace(/"/g, '""')}"`,
    `"${(t.time || '').replace(/"/g, '""')}"`,
  ].join(','));
  const csvData = [headers.join(','), ...rows].join('\n');

  return {
    count: sanitized.length,
    jsonData,
    csvData,
  };
}

export async function exportTransactions(
  userId: string,
  format: 'json' | 'csv' = 'json',
  options?: GenerateBackupOptions
): Promise<{ success: boolean; count: number; filename?: string; fileUri?: string; error?: string }> {
  try {
    const { count, jsonData, csvData } = await generateBackupData(userId, options);
    if (count === 0) {
      return { success: false, count: 0, error: 'No transactions to export.' };
    }

    const today = getLocalDateString();
    const periodTag = options?.periodMode === 'month' && options?.monthStr ? `_${options.monthStr}` : '_all';
    const filename = `rupeo_backup${periodTag}_${today}.${format}`;
    const content = format === 'json' ? jsonData : csvData;
    const mimeType = format === 'json' ? 'application/json' : 'text/csv';

    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return { success: true, count, filename };
    } else {
      // Android & iOS: Save backup to cache/documents directory and trigger native Share Sheet.
      // This prevents Android 11+ Scoped Storage / SAF (createSAFFileAsync) java.io.IOException when restricted directories like Downloads are selected.
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const fileUri = `${baseDir}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: `Save Rupeo Backup (${filename})`,
          UTI: format === 'json' ? 'public.json' : 'public.comma-separated-values-text',
        });
      }

      return { success: true, count, filename, fileUri };
    }
  } catch (error: any) {
    console.error('Export error:', error);
    return { success: false, count: 0, error: error.message || 'Failed to export' };
  }
}

export async function pickBackupFileContent(): Promise<{ rawText: string; filename: string }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    throw new Error('CANCELED');
  }

  const pickedFile = result.assets[0];
  let rawText = '';

  if (Platform.OS === 'web') {
    if (pickedFile.file) {
      rawText = await pickedFile.file.text();
    } else {
      const response = await fetch(pickedFile.uri);
      rawText = await response.text();
    }
  } else {
    rawText = await FileSystem.readAsStringAsync(pickedFile.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  return { rawText, filename: pickedFile.name };
}

export async function pickAndImportBackupFile(
  userId: string
): Promise<{ imported: number; skipped: number; filename: string }> {
  if (!userId) {
    throw new Error('User is not logged in.');
  }

  const { rawText, filename } = await pickBackupFileContent();
  const importStats = await importTransactionsFromText(userId, rawText);
  return {
    ...importStats,
    filename,
  };
}

export async function importTransactionsFromText(
  userId: string,
  rawText: string
): Promise<{ imported: number; skipped: number }> {
  if (!userId || !rawText.trim()) {
    return { imported: 0, skipped: 0 };
  }

  const trimmed = rawText.trim();
  let parsedList: any[] = [];

  // 1. Try parsing JSON (supports array of transactions or wrapped { transactions: [...] })
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      let items: any[] = [];
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (parsed && typeof parsed === 'object') {
        items = parsed.transactions || parsed.data || parsed.records || [parsed];
      }

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const amount = typeof item.amount === 'number'
          ? Math.abs(item.amount)
          : parseFloat(String(item.amount || '0').replace(/[^0-9.-]/g, ''));

        if (!isNaN(amount) && amount > 0) {
          const type = String(item.type || '').toLowerCase() === 'credit' ? 'credit' : 'debit';
          parsedList.push({
            date: item.date ? normalizeDate(String(item.date)) : getLocalDateString(),
            amount,
            type,
            category: item.category || 'Others',
            merchant_name: item.merchant_name || item.merchant || '',
            description: item.description || '',
            utr: item.utr || '',
            ref_no: item.ref_no || item.reference || '',
            payment_mode: item.payment_mode || 'UPI',
            time: item.time || '',
            source: 'import',
          });
        }
      }
    } catch {
      // Not valid JSON, continue to CSV parsing
    }
  }

  // 2. Try parsing CSV if JSON didn't yield records
  if (parsedList.length === 0) {
    const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      const headerLine = lines[0].toLowerCase();
      const hasHeader = headerLine.includes('date') || headerLine.includes('amount') || headerLine.includes('category');
      const startIndex = hasHeader ? 1 : 0;

      // Extract header column positions if header exists
      let colDate = 0;
      let colAmt = 1;
      let colType = 2;
      let colCat = 3;
      let colMerchant = 4;
      let colDesc = 5;
      let colUtr = 6;
      let colRef = 7;
      let colMode = 8;
      let colTime = 9;

      if (hasHeader) {
        const headerCols = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
        headerCols.forEach((col, idx) => {
          if (col.includes('date')) colDate = idx;
          else if (col.includes('amount')) colAmt = idx;
          else if (col.includes('type')) colType = idx;
          else if (col.includes('cat')) colCat = idx;
          else if (col.includes('merch')) colMerchant = idx;
          else if (col.includes('desc')) colDesc = idx;
          else if (col.includes('utr')) colUtr = idx;
          else if (col.includes('ref')) colRef = idx;
          else if (col.includes('mode')) colMode = idx;
          else if (col.includes('time')) colTime = idx;
        });
      }

      for (let i = startIndex; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        if (row.length >= 2) {
          const rawAmt = row[colAmt] || '';
          const cleanAmt = parseFloat(rawAmt.replace(/[^0-9.-]/g, '')) || 0;

          if (cleanAmt > 0) {
            const rawDate = row[colDate] || getLocalDateString();
            const rawType = (row[colType] || '').toLowerCase().trim();
            const type = rawType.includes('cr') ? 'credit' : 'debit';

            parsedList.push({
              date: normalizeDate(rawDate),
              amount: cleanAmt,
              type,
              category: row[colCat] || 'Others',
              merchant_name: row[colMerchant] || '',
              description: row[colDesc] || '',
              utr: row[colUtr] || '',
              ref_no: row[colRef] || '',
              payment_mode: row[colMode] || 'UPI',
              time: row[colTime] || '',
              source: 'import',
            });
          }
        }
      }
    }
  }

  if (parsedList.length === 0) {
    throw new Error('Could not find valid transactions in the provided file. Please ensure it is a Rupeo JSON or CSV backup.');
  }

  return await insertTransactionsBatch(userId, parsedList);
}

function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cell.trim());
      cell = '';
    } else {
      cell += c;
    }
  }
  result.push(cell.trim());
  return result;
}
