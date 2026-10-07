import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { formatTime12Hour } from './dateUtils';

export interface TransactionReceiptPdfOptions {
  id: string;
  type: 'debit' | 'credit';
  amount: number | string;
  merchant?: string;
  category?: string;
  paymentMode?: string;
  date?: string;
  time?: string;
  description?: string;
  barcodeValue?: string;
  currency?: string;
  userName?: string;
}

export function generateTransactionReceiptHtml(options: TransactionReceiptPdfOptions): string {
  const {
    id,
    type,
    amount,
    merchant = 'Unknown Payee',
    category = 'General',
    paymentMode = 'UPI',
    date = '',
    time = '',
    description = '',
    barcodeValue = `RP-${id.slice(0, 8).toUpperCase()}`,
    currency = '₹',
    userName = 'Rupeo User',
  } = options;

  const numAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0');
  const formattedAmt = numAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const isCredit = type === 'credit';
  const statusLabel = isCredit ? 'FUNDS RECEIVED' : 'PAYMENT SUCCESSFUL';
  const statusColor = isCredit ? '#059669' : '#0F172A';
  const statusBg = isCredit ? '#ECFDF5' : '#F1F5F9';
  const statusBorder = isCredit ? '#A7F3D0' : '#CBD5E1';
  const headerGradient = isCredit
    ? 'linear-gradient(135deg, #064E3B 0%, #059669 50%, #10B981 100%)'
    : 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%)';

  const timeFormatted = time ? formatTime12Hour(time) : '';
  const now = new Date();
  const generatedTimestamp = `${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rupeo Transaction Bill - ${barcodeValue}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif;
      background: #F8FAFC;
      color: #0F172A;
      padding: 24px 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .receipt-container {
      width: 100%;
      max-width: 440px;
      background: #FFFFFF;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 12px 36px rgba(15, 23, 42, 0.08);
      border: 1px solid #E2E8F0;
      position: relative;
    }
    .receipt-header {
      background: ${headerGradient};
      color: #FFFFFF;
      padding: 24px 22px 28px;
      text-align: center;
      position: relative;
    }
    .brand-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .brand-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(8px);
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.6px;
    }
    .brand-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #FFD740;
    }
    .receipt-id-tag {
      font-size: 10px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.85);
      font-family: monospace;
      letter-spacing: 0.5px;
    }
    .status-badge-circle {
      width: 48px;
      height: 48px;
      border-radius: 24px;
      background: #FFFFFF;
      margin: 0 auto 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    }
    .status-text {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.95);
      margin-bottom: 6px;
    }
    .hero-amount {
      font-size: 38px;
      font-weight: 900;
      letter-spacing: -1px;
      line-height: 1.1;
      margin-bottom: 2px;
    }
    .hero-sub {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.8);
      font-weight: 600;
    }

    /* Sawtooth / Notch Divider */
    .divider-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      margin-top: -10px;
      margin-bottom: 12px;
      z-index: 2;
    }
    .notch-left, .notch-right {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #F8FAFC;
    }
    .notch-left { margin-left: -10px; }
    .notch-right { margin-right: -10px; }
    .dashed-line {
      flex: 1;
      border-top: 2px dashed #CBD5E1;
      margin: 0 4px;
    }

    /* Receipt Details Body */
    .receipt-body {
      padding: 4px 22px 22px;
    }
    .section-title {
      font-size: 10px;
      font-weight: 800;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 12px;
    }
    .detail-grid {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      padding: 14px 16px;
      margin-bottom: 14px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid #F1F5F9;
    }
    .detail-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .detail-row:first-child {
      padding-top: 0;
    }
    .detail-label {
      font-size: 11.5px;
      color: #64748B;
      font-weight: 600;
    }
    .detail-val {
      font-size: 12.5px;
      font-weight: 800;
      color: #0F172A;
      text-align: right;
    }
    .tag-badge {
      display: inline-block;
      padding: 2.5px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 800;
      background: #EEF2FF;
      color: #4F46E5;
    }
    .payment-mode-badge {
      display: inline-block;
      padding: 2.5px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 800;
      background: #ECFDF5;
      color: #059669;
    }

    /* Barcode & Security Block */
    .security-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .barcode-lines {
      display: flex;
      align-items: center;
      gap: 2.5px;
      height: 32px;
    }
    .barcode-bar {
      height: 100%;
      background: #0F172A;
      border-radius: 1px;
    }
    .barcode-text {
      font-family: monospace;
      font-size: 11px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: 1px;
      margin-top: 3px;
    }
    .verified-seal-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: #F0FDF4;
      border: 1px solid #BBF7D0;
      border-radius: 8px;
    }
    .seal-text-title {
      font-size: 10px;
      font-weight: 800;
      color: #15803D;
      letter-spacing: 0.3px;
    }
    .seal-text-sub {
      font-size: 8.5px;
      color: #166534;
      font-weight: 600;
    }

    /* Description Note */
    .note-box {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }
    .note-label {
      font-size: 9.5px;
      font-weight: 800;
      color: #B45309;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .note-text {
      font-size: 11.5px;
      color: #78350F;
      font-weight: 600;
      line-height: 1.4;
    }

    /* Footer */
    .receipt-footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 12px;
      text-align: center;
    }
    .footer-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #F1F5F9;
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 9.5px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 6px;
    }
    .footer-disclaimer {
      font-size: 8.5px;
      color: #94A3B8;
      line-height: 1.35;
    }

    @media print {
      body {
        background: #FFFFFF !important;
        padding: 0 !important;
      }
      .receipt-container {
        box-shadow: none !important;
        border: 1px solid #CBD5E1 !important;
        max-width: 100% !important;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <!-- Header -->
    <div class="receipt-header">
      <div class="brand-row">
        <div class="brand-pill">
          <span class="brand-dot"></span>
          <span>RUPEO OFFICIAL BILL</span>
        </div>
        <div class="receipt-id-tag">${barcodeValue}</div>
      </div>

      <div class="status-badge-circle">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="${isCredit ? '#059669' : '#0F172A'}"/>
          <path d="M7.5 12L10.5 15L16.5 9" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <div class="status-text">${statusLabel}</div>
      <div class="hero-amount">${isCredit ? '+' : '-'}${currency}${formattedAmt}</div>
      <div class="hero-sub">${isCredit ? 'Credited to your balance' : 'Paid from your wallet'}</div>
    </div>

    <!-- Notch divider -->
    <div class="divider-row">
      <div class="notch-left"></div>
      <div class="dashed-line"></div>
      <div class="notch-right"></div>
    </div>

    <!-- Body -->
    <div class="receipt-body">
      <div class="section-title">TRANSACTION SPECIFICATIONS</div>

      <div class="detail-grid">
        <div class="detail-row">
          <span class="detail-label">Paid To / Payee</span>
          <span class="detail-val" style="font-size: 13.5px; color: #0F172A;">${merchant}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Payment Mode</span>
          <span class="payment-mode-badge">${paymentMode}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Category</span>
          <span class="tag-badge">${category}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date & Time</span>
          <span class="detail-val">${date}${timeFormatted ? ` • ${timeFormatted}` : ''}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Transaction Ref</span>
          <span class="detail-val" style="font-family: monospace;">${barcodeValue}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-val" style="color: #059669; font-weight: 800;">✓ Verified & Recorded</span>
        </div>
      </div>

      ${description ? `
      <div class="note-box">
        <div class="note-label">REMARKS / NOTE</div>
        <div class="note-text">${description}</div>
      </div>
      ` : ''}

      <!-- Barcode & Verified Stamp -->
      <div class="security-card">
        <div>
          <div class="barcode-lines">
            <div class="barcode-bar" style="width: 3px;"></div>
            <div class="barcode-bar" style="width: 1.5px;"></div>
            <div class="barcode-bar" style="width: 4px;"></div>
            <div class="barcode-bar" style="width: 1px;"></div>
            <div class="barcode-bar" style="width: 3px;"></div>
            <div class="barcode-bar" style="width: 2px;"></div>
            <div class="barcode-bar" style="width: 4.5px;"></div>
            <div class="barcode-bar" style="width: 1.5px;"></div>
            <div class="barcode-bar" style="width: 3px;"></div>
            <div class="barcode-bar" style="width: 2px;"></div>
            <div class="barcode-bar" style="width: 4px;"></div>
            <div class="barcode-bar" style="width: 1px;"></div>
            <div class="barcode-bar" style="width: 3px;"></div>
            <div class="barcode-bar" style="width: 2px;"></div>
            <div class="barcode-bar" style="width: 3px;"></div>
          </div>
          <div class="barcode-text">${barcodeValue}</div>
        </div>

        <div class="verified-seal-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L4 5V11C4 16.5 7.4 21.6 12 23C16.6 21.6 20 16.5 20 11V5L12 2Z" fill="#16A34A"/>
            <path d="M9 12L11 14L15 10" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div>
            <div class="seal-text-title">RUPEO VERIFIED</div>
            <div class="seal-text-sub">Authentic Record</div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="receipt-footer">
        <div class="footer-pill">
          <span>🔒 100% Tamper-Proof Digital Ledger</span>
        </div>
        <div class="footer-disclaimer">
          Generated on ${generatedTimestamp} for ${userName}.<br/>
          Verify authenticity online: rupeoo.vercel.app/scanner
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate PDF file for transaction receipt (bill)
 */
export async function generateTransactionReceiptPdfOnly(
  options: TransactionReceiptPdfOptions
): Promise<{ success: boolean; uri?: string; filename?: string; error?: string }> {
  try {
    const html = generateTransactionReceiptHtml(options);
    const cleanId = (options.barcodeValue || options.id || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Rupeo_Bill_${cleanId}.pdf`;

    const result = await Print.printToFileAsync({
      html,
      base64: false,
    });

    if (result && result.uri) {
      let finalUri = result.uri;
      try {
        const targetUri = `${FileSystem.documentDirectory}${filename}`;
        const existing = await FileSystem.getInfoAsync(targetUri);
        if (existing.exists) {
          await FileSystem.deleteAsync(targetUri, { idempotent: true });
        }
        await FileSystem.copyAsync({
          from: result.uri,
          to: targetUri,
        });
        finalUri = targetUri;
      } catch (copyErr) {
        console.warn('Could not copy PDF file to targetUri, using result.uri fallback:', copyErr);
        finalUri = result.uri;
      }

      return { success: true, uri: finalUri, filename };
    }

    return { success: false, error: 'Failed to generate PDF bill file.' };
  } catch (err: any) {
    console.error('Transaction Receipt PDF Generation error:', err);
    return { success: false, error: err?.message || 'Failed to print PDF.' };
  }
}

/**
 * Generate and share / save Transaction Receipt as PDF
 */
export async function shareTransactionReceiptPdf(
  options: TransactionReceiptPdfOptions
): Promise<{ success: boolean; uri?: string; error?: string }> {
  const res = await generateTransactionReceiptPdfOnly(options);
  if (res.success && res.uri) {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(res.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Rupeo Transaction Bill (${options.currency || '₹'}${options.amount})`,
        UTI: 'com.adobe.pdf',
      });
    }
    return { success: true, uri: res.uri };
  }
  return { success: false, error: res.error || 'Failed to generate PDF.' };
}
