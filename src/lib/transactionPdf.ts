import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { formatTime12Hour } from './dateUtils';
import type { ReceiptTheme } from './receiptTheme';
import { getDisplayTransactionNote } from './smsSettings';
import { warn, error } from '@/lib/logger';

export type { ReceiptTheme };

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
  receiptImage?: string | null;
  theme?: ReceiptTheme;
}

function formatDisplayDate(rawDate?: string): string {
  if (!rawDate) {
    const now = new Date();
    return now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (/^\d{2}\s[A-Za-z]{3}\s\d{4}$/.test(rawDate)) {
    return rawDate;
  }
  try {
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {
    // Intentional: fall back to rawDate string if parsing fails
  }
  return rawDate;
}

function formatDisplayTime(rawTime?: string): string {
  if (!rawTime) {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return formatTime12Hour(rawTime);
}

function formatTxId(id?: string, barcodeVal?: string): string {
  if (barcodeVal && barcodeVal.trim().length > 0) {
    return barcodeVal.trim();
  }
  const raw = (id || 'TXN').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const code = raw.slice(0, 8).padEnd(6, '0');
  return `RP-${code}`;
}

// Standard ISO/IEC 16388 Code 39 Character Set Table
// Each character: 9 elements (5 bars at indices 0,2,4,6,8 and 4 spaces at indices 1,3,5,7)
// '0' = narrow (1 module), '1' = wide (2.5 modules)
const CODE39_ENCODINGS: Record<string, string> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  'A': '100001001',
  'B': '001001001',
  'C': '101001000',
  'D': '000011001',
  'E': '100011000',
  'F': '001011000',
  'G': '000001101',
  'H': '100001100',
  'I': '001001100',
  'J': '000011100',
  'K': '100000011',
  'L': '001000011',
  'M': '101000010',
  'N': '000010011',
  'O': '100010010',
  'P': '001010010',
  'Q': '000000111',
  'R': '100000110',
  'S': '001000110',
  'T': '000010110',
  'U': '110000001',
  'V': '011000001',
  'W': '111000000',
  'X': '010010001',
  'Y': '110010000',
  'Z': '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  '$': '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
  '*': '010010100',
};

export function generateCode39Svg(
  value: string,
  width = 280,
  height = 48
): { svg: string; text: string } {
  const sanitized = (value || 'TXN001')
    .toUpperCase()
    .replace(/[^0-9A-Z\-]/g, '')
    .slice(0, 16);

  const payload = sanitized.length > 0 ? sanitized : 'TXN001';
  const fullText = `*${payload}*`;

  const charCount = fullText.length;
  // Standard Code 39 proportions:
  // Each character has 9 elements: 3 wide (ratio 2.5) + 6 narrow (ratio 1) = 13.5 modules
  // Inter-character gap = 1 module
  // Quiet zones = 10 modules on left and 10 modules on right
  const totalModules = (charCount - 1) * 14.5 + 13.5 + 20;
  const unit = width / totalModules;
  const narrowWidth = unit;
  const wideWidth = unit * 2.5;
  const quietZone = unit * 10;

  let rects = '';
  let curX = quietZone;

  for (let c = 0; c < charCount; c++) {
    const char = fullText[c];
    const pattern = CODE39_ENCODINGS[char] || CODE39_ENCODINGS['-'];

    for (let e = 0; e < 9; e++) {
      const isBar = e % 2 === 0;
      const isWide = pattern[e] === '1';
      const w = isWide ? wideWidth : narrowWidth;

      if (isBar) {
        rects += `<rect x="${curX.toFixed(2)}" y="2" width="${w.toFixed(2)}" height="${height - 4}" fill="#000000" />\n`;
      }
      curX += w;
    }

    if (c < charCount - 1) {
      curX += narrowWidth;
    }
  }

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff;display:block;margin:0 auto;shape-rendering:crispEdges;">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" />
    ${rects}
  </svg>`;

  return { svg, text: `* ${payload} *` };
}

function getCategoryIcon(catName?: string): string {
  const c = (catName || '').toLowerCase();
  if (c.includes('food') || c.includes('dine') || c.includes('restaurant') || c.includes('samosa') || c.includes('chai') || c.includes('cafe')) return '🍴';
  if (c.includes('grocer') || c.includes('market') || c.includes('kirana')) return '🛒';
  if (c.includes('shop') || c.includes('cloth') || c.includes('amazon')) return '🛍️';
  if (c.includes('travel') || c.includes('auto') || c.includes('cab') || c.includes('fuel') || c.includes('petrol')) return '✈️';
  if (c.includes('bill') || c.includes('recharge') || c.includes('electric') || c.includes('rent')) return '⚡';
  if (c.includes('health') || c.includes('med') || c.includes('doctor')) return '💊';
  if (c.includes('salary') || c.includes('invest') || c.includes('income')) return '💰';
  if (c.includes('entertain') || c.includes('movie')) return '🎬';
  return '🏷️';
}

export function getPaymentMethodLogoHtml(mode?: string, isDark = false): string {
  const m = (mode || '').toLowerCase().trim();

  if (m.includes('upi')) {
    return `
      <div class="pm-logo-pill upi-pill">
        <svg width="18" height="13" viewBox="0 0 28 20" fill="none" style="display:inline-block;vertical-align:middle;">
          <path d="M7 18L19 2L23 10L11 18H7Z" fill="#0F753A"/>
          <path d="M11 18L23 10L19 2L7 18H11Z" fill="#F47920"/>
          <path d="M3 18L15 2L19 10L7 18H3Z" fill="#0F753A"/>
        </svg>
        <span class="pm-pill-text upi-text">UPI</span>
      </div>
    `;
  }

  if (m.includes('cash')) {
    return `
      <div class="pm-logo-pill cash-pill">
        <svg width="17" height="13" viewBox="0 0 24 18" fill="none" style="display:inline-block;vertical-align:middle;">
          <rect x="1" y="2" width="22" height="14" rx="3" stroke="#16A34A" stroke-width="1.8" fill="${isDark ? '#064E3B' : '#DCFCE7'}"/>
          <circle cx="12" cy="9" r="3.2" fill="#16A34A"/>
          <path d="M12 7.2v3.6M10.8 8.1h2.4M10.8 9.2h2.4" stroke="#FFFFFF" stroke-width="0.8"/>
        </svg>
        <span class="pm-pill-text cash-text">CASH</span>
      </div>
    `;
  }

  if (m.includes('bank')) {
    return `
      <div class="pm-logo-pill bank-pill">
        <svg width="15" height="13" viewBox="0 0 24 22" fill="none" style="display:inline-block;vertical-align:middle;">
          <path d="M12 2L2 7H22L12 2Z" fill="#2563EB"/>
          <rect x="4" y="9" width="2.5" height="8" rx="0.5" fill="#2563EB"/>
          <rect x="8.75" y="9" width="2.5" height="8" rx="0.5" fill="#2563EB"/>
          <rect x="13.5" y="9" width="2.5" height="8" rx="0.5" fill="#2563EB"/>
          <rect x="18" y="9" width="2.5" height="8" rx="0.5" fill="#2563EB"/>
          <rect x="2" y="18" width="20" height="2.5" rx="0.5" fill="#2563EB"/>
        </svg>
        <span class="pm-pill-text bank-text">BANK</span>
      </div>
    `;
  }

  if (m.includes('card')) {
    return `
      <div class="pm-logo-pill card-pill">
        <svg width="18" height="13" viewBox="0 0 26 18" fill="none" style="display:inline-block;vertical-align:middle;">
          <rect x="1" y="1" width="24" height="16" rx="3" stroke="${isDark ? '#475569' : '#CBD5E1'}" stroke-width="1" fill="${isDark ? '#1E293B' : '#0F172A'}"/>
          <circle cx="10" cy="9" r="4.2" fill="#DC2626" opacity="0.9"/>
          <circle cx="16" cy="9" r="4.2" fill="#F59E0B" opacity="0.9"/>
        </svg>
        <span class="pm-pill-text card-text">CARD</span>
      </div>
    `;
  }

  return `
    <div class="pm-logo-pill other-pill">
      <svg width="15" height="13" viewBox="0 0 24 20" fill="none" stroke="#7C3AED" stroke-width="1.8" style="display:inline-block;vertical-align:middle;">
        <rect x="2" y="4" width="20" height="14" rx="2" fill="${isDark ? '#3B0764' : '#F3E8FF'}"/>
        <path d="M16 11h4v3h-4a1.5 1.5 0 0 1 0-3z" fill="#7C3AED"/>
      </svg>
      <span class="pm-pill-text other-text">OTHER</span>
    </div>
  `;
}

function generateGradientSlipHtml(
  options: TransactionReceiptPdfOptions,
  resolvedImageSrc?: string | null
): string {
  const {
    id,
    type,
    amount,
    merchant: rawMerchant,
    category = 'Food',
    paymentMode = 'UPI',
    date = '',
    time = '',
    description = '',
    barcodeValue,
    currency = '₹',
  } = options;

  const numAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0');
  const formattedAmt = numAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isCredit = type === 'credit';
  const merchant = (rawMerchant || '').trim() || (isCredit ? 'Sender' : category || 'Payment');
  const formattedDate = formatDisplayDate(date);
  const formattedTime = formatDisplayTime(time);
  const txRefId = formatTxId(id, barcodeValue);
  const catIcon = getCategoryIcon(category);
  const barcodeValueToUse = barcodeValue || txRefId;
  const barcodeInfo = generateCode39Svg(barcodeValueToUse, 280, 48);
  const paymentBadgeHtml = getPaymentMethodLogoHtml(paymentMode, false);

  const topGradient = isCredit
    ? 'linear-gradient(135deg, #022C22 0%, #064E3B 40%, #047857 75%, #059669 100%)'
    : 'linear-gradient(135deg, #0A0F1D 0%, #111827 40%, #1E293B 75%, #334155 100%)';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rupeo Receipt - ${txRefId}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #F1F5F9;
      color: #0F172A;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      height: auto;
      min-height: 0;
    }
    body {
      padding: 16px 12px;
      display: block;
    }
    .slip-container {
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
      background: #FFFFFF;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
      border: 1px solid #E2E8F0;
      position: relative;
      page-break-before: avoid;
      break-before: avoid;
    }
    .slip-top {
      background: ${topGradient};
      padding: 32px 20px 26px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .slip-watermark {
      position: absolute;
      top: 14px;
      right: 20px;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 2.5px;
      color: rgba(255, 255, 255, 0.22);
      text-transform: uppercase;
      user-select: none;
    }
    .slip-blob-1 {
      position: absolute;
      width: 140px;
      height: 140px;
      border-radius: 50%;
      right: -30px;
      top: -30px;
      background: ${isCredit ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'};
      pointer-events: none;
    }
    .slip-blob-2 {
      position: absolute;
      width: 110px;
      height: 110px;
      border-radius: 50%;
      left: -25px;
      bottom: -25px;
      background: ${isCredit ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 215, 64, 0.18)'};
      pointer-events: none;
    }
    .slip-arrow-circle {
      width: 58px;
      height: 58px;
      border-radius: 29px;
      background: ${isCredit ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.22)'};
      border: 2px solid ${isCredit ? '#34D399' : 'rgba(255, 255, 255, 0.45)'};
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 1;
    }
    .slip-amount {
      font-size: 42px;
      font-weight: 900;
      color: ${isCredit ? '#6EE7B7' : '#FFFFFF'};
      letter-spacing: -1px;
      line-height: 1.1;
      margin-bottom: 6px;
      position: relative;
      z-index: 1;
    }
    .slip-merchant {
      font-size: 18px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.95);
      margin-bottom: 12px;
      position: relative;
      z-index: 1;
    }
    .slip-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(16, 185, 129, 0.4);
      border-radius: 20px;
      padding: 5px 14px;
      position: relative;
      z-index: 1;
    }
    .slip-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${isCredit ? '#34D399' : '#10B981'};
    }
    .slip-status-text {
      font-size: 11.5px;
      font-weight: 800;
      color: #10B981;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    .notch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      margin-top: -10px;
      margin-bottom: 10px;
      z-index: 2;
      background: #FFFFFF;
    }
    .notch-left, .notch-right {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #F1F5F9;
    }
    .notch-left { margin-left: -10px; }
    .notch-right { margin-right: -10px; }
    .notch-dash {
      flex: 1;
      border-top: 1.5px dashed #CBD5E1;
      margin: 0 6px;
    }
    .slip-body {
      padding: 10px 24px 22px;
      background: #FFFFFF;
    }
    .slip-ref-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid #F1F5F9;
      margin-bottom: 14px;
    }
    .slip-ref-code {
      font-size: 11px;
      font-weight: 800;
      color: #94A3B8;
      letter-spacing: 1.2px;
      font-family: monospace;
    }
    .slip-ref-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #ECFDF5;
      border: 1px solid #A7F3D0;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 900;
      color: #059669;
    }
    .slip-summary-grid {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
    }
    .slip-summary-item {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
    }
    .slip-summary-icon {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 17px;
    }
    .slip-summary-label {
      font-size: 9px;
      font-weight: 800;
      color: #94A3B8;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .slip-summary-value {
      font-size: 12px;
      font-weight: 800;
      color: #1E293B;
    }
    .slip-spec-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #F1F5F9;
    }
    .slip-spec-label {
      font-size: 12px;
      font-weight: 800;
      color: #64748B;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .slip-spec-value {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 800;
      color: #0F172A;
    }
    .slip-no-photo-card {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      background: #F8FAFC;
      border: 1px dashed #CBD5E1;
    }
    .slip-no-photo-title {
      font-size: 12px;
      font-weight: 800;
      color: #334155;
      margin-bottom: 2px;
    }
    .slip-no-photo-sub {
      font-size: 10px;
      color: #94A3B8;
    }
    .slip-photo-wrap {
      margin-top: 14px;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid #E2E8F0;
      max-height: 260px;
      text-align: center;
      background: #F8FAFC;
    }
    .slip-photo {
      max-width: 100%;
      max-height: 260px;
      display: block;
      margin: 0 auto;
    }
    .slip-cert-card {
      margin-top: 18px;
      padding: 12px 14px;
      border-radius: 12px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      text-align: left;
    }
    .slip-cert-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .slip-cert-shield {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: #ECFDF5;
      border: 1px solid #A7F3D0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .slip-cert-title-wrap {
      flex: 1;
    }
    .slip-cert-title {
      font-size: 11px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: 0.3px;
    }
    .slip-cert-sub {
      font-size: 9px;
      font-weight: 600;
      color: #64748B;
      margin-top: 1px;
    }
    .slip-cert-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #ECFDF5;
      border: 1px solid #A7F3D0;
      border-radius: 8px;
      padding: 3px 7px;
      font-size: 9px;
      font-weight: 800;
      color: #059669;
      letter-spacing: 0.5px;
    }
    .slip-cert-divider {
      height: 1px;
      background: #E2E8F0;
      margin: 9px 0 8px;
    }
    .slip-cert-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .slip-cert-meta-label {
      font-size: 9px;
      font-weight: 800;
      color: #94A3B8;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }
    .slip-cert-meta-value {
      font-size: 10px;
      font-weight: 800;
      color: #0F172A;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      letter-spacing: 0.8px;
    }
    .slip-footer {
      background: #FAFBFC;
      border-top: 1px solid #F1F5F9;
      padding: 18px 24px 20px;
      text-align: center;
    }
    .slip-footer-brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .slip-footer-logo {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: #FFD740;
      color: #0F172A;
      font-size: 14px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .slip-footer-name {
      font-size: 16px;
      font-weight: 900;
      color: #0F172A;
      letter-spacing: -0.3px;
    }
    .slip-footer-verified {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #ECFDF5;
      border: 1px solid #A7F3D0;
      border-radius: 12px;
      padding: 2.5px 8px;
      font-size: 9.5px;
      font-weight: 800;
      color: #059669;
    }
    .slip-footer-tagline {
      font-size: 10px;
      font-weight: 700;
      color: #64748B;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .slip-footer-seal {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      font-size: 9.5px;
      font-weight: 800;
      color: #059669;
      background: #ECFDF5;
      border: 1px solid #A7F3D0;
      border-radius: 14px;
      padding: 4px 12px;
      letter-spacing: 0.4px;
    }
    .pm-logo-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2.5px 7px;
      border-radius: 6px;
      font-size: 10.5px;
      font-weight: 800;
    }
    .upi-pill { background: #ECFDF5; border: 1px solid #A7F3D0; }
    .upi-text { color: #0F753A; font-weight: 900; }
    .cash-pill { background: #F0FDF4; border: 1px solid #BBF7D0; }
    .cash-text { color: #16A34A; font-weight: 900; }
    .bank-pill { background: #EFF6FF; border: 1px solid #BFDBFE; }
    .bank-text { color: #2563EB; font-weight: 900; }
    .card-pill { background: #FEF3C7; border: 1px solid #FDE68A; }
    .card-text { color: #B45309; font-weight: 900; }
    .other-pill { background: #F5F3FF; border: 1px solid #DDD6FE; }
    .other-text { color: #7C3AED; font-weight: 900; }

    @page {
      size: auto;
      margin: 0mm;
    }
    @media print {
      html, body {
        background: #FFFFFF !important;
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
        height: auto !important;
        min-height: 0 !important;
      }
      .slip-container {
        margin: 0 auto !important;
        box-shadow: none !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <div class="slip-container">
    <div class="slip-top">
      <div class="slip-blob-1"></div>
      <div class="slip-blob-2"></div>
      <div class="slip-watermark">RUPEO</div>

      <div class="slip-arrow-circle">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${isCredit
      ? '<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline>'
      : '<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>'
    }
        </svg>
      </div>

      <div class="slip-amount">${isCredit ? '+' : '−'}${currency}${formattedAmt}</div>
      <div class="slip-merchant">${merchant}</div>

      <div class="slip-status-pill">
        <div class="slip-status-dot"></div>
        <span class="slip-status-text">TRANSACTION SUCCESSFUL</span>
      </div>
    </div>

    <div class="notch-row">
      <div class="notch-left"></div>
      <div class="notch-dash"></div>
      <div class="notch-right"></div>
    </div>

    <div class="slip-body">
      <div class="slip-ref-row">
        <div class="slip-ref-code">RUPEO TXN · ${barcodeValueToUse}</div>
        <div class="slip-ref-badge">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          VERIFIED
        </div>
      </div>

      <div class="slip-summary-grid">
        <div class="slip-summary-item">
          <div class="slip-summary-icon" style="background:#EFF6FF;">📅</div>
          <div>
            <div class="slip-summary-label">DATE</div>
            <div class="slip-summary-value">${formattedDate}</div>
          </div>
        </div>
        <div class="slip-summary-item">
          <div class="slip-summary-icon" style="background:#ECFDF5;">☀️</div>
          <div>
            <div class="slip-summary-label">TIME</div>
            <div class="slip-summary-value">${formattedTime}</div>
          </div>
        </div>
      </div>

      <div class="slip-spec-row">
        <div class="slip-spec-label">CATEGORY</div>
        <div class="slip-spec-value">
          <span>${catIcon}</span>
          <span>${category}</span>
        </div>
      </div>

      <div class="slip-spec-row">
        <div class="slip-spec-label">PAYMENT MODE</div>
        <div class="slip-spec-value">
          ${paymentBadgeHtml}
          <span>${paymentMode}</span>
        </div>
      </div>

      ${(() => {
        const noteToShow = getDisplayTransactionNote(description);
        if (!noteToShow) return '';
        const isOriginalMsg = noteToShow.startsWith('Original Message:');
        const messageBody = isOriginalMsg
          ? noteToShow.replace(/^Original Message:\s*/i, '').trim()
          : noteToShow;

        return `
        <div class="slip-spec-row" style="align-items:flex-start;${isOriginalMsg ? 'flex-direction:column;padding:12px 0;' : ''}">
          <div style="display:flex;align-items:center;gap:8px;${isOriginalMsg ? 'margin-bottom:6px;width:100%;' : ''}">
            <div class="slip-spec-label">NOTE</div>
            ${isOriginalMsg ? `
              <div style="font-size:10px;font-weight:800;color:#2563EB;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:4px;padding:2px 6px;letter-spacing:0.3px;">
                Original Message
              </div>
            ` : ''}
          </div>
          <div class="slip-spec-value" style="font-weight:600;color:#475569;${isOriginalMsg ? 'width:100%;text-align:left;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:8px 10px;box-sizing:border-box;' : 'max-width:65%;text-align:left;margin-left:auto;'}">
            <div style="font-size:12.5px;line-height:1.45;color:#334155;text-align:left;">
              ${isOriginalMsg ? messageBody : noteToShow}
            </div>
          </div>
        </div>
        `;
      })()}

      ${resolvedImageSrc
      ? `
      <div class="slip-photo-wrap">
        <img class="slip-photo" src="${resolvedImageSrc}" alt="Receipt Photo" />
      </div>
      `
      : ''
    }
    </div>

    <div class="slip-footer">
      <div class="slip-footer-brand">
        <div class="slip-footer-logo">₹</div>
        <div class="slip-footer-name">Rupeo</div>
        <div class="slip-footer-verified">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          VERIFIED RECEIPT
        </div>
      </div>
      <div class="slip-footer-tagline">Tracked with Rupeo • Smart Expense Tracker</div>
    </div>
  </div>
</body>
</html>
  `;
}

export function generateTransactionReceiptHtml(
  options: TransactionReceiptPdfOptions,
  resolvedImageSrc?: string | null
): string {
  if (options.theme === 'gradient_slip') {
    return generateGradientSlipHtml(options, resolvedImageSrc);
  }

  const {
    id,
    type,
    amount,
    merchant: rawMerchant,
    category = 'Food',
    paymentMode = 'UPI',
    date = '',
    time = '',
    description = '',
    barcodeValue,
    currency = '₹',
    theme = 'classic_amber',
  } = options;

  const isDark = theme === 'midnight_obsidian';

  const numAmount = typeof amount === 'number' ? amount : parseFloat(amount || '0');
  const formattedAmt = numAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isCredit = type === 'credit';
  const amountLabel = isCredit ? 'Amount Received' : 'Amount Paid';
  const statusLabel = isCredit ? 'Funds Received' : 'Transaction Successful';
  const merchant = (rawMerchant || '').trim() || (isCredit ? 'Sender' : category || 'Payment');
  const formattedDate = formatDisplayDate(date);
  const formattedTime = formatDisplayTime(time);
  const txRefId = formatTxId(id, barcodeValue);
  const catIcon = getCategoryIcon(category);
  const barcodeValueToUse = barcodeValue || txRefId;
  const barcodeInfo = generateCode39Svg(barcodeValueToUse, 280, 48);

  const now = new Date();
  const generatedTimestamp = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rupeo Receipt - ${txRefId}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: ${isDark ? '#030712' : '#F1F5F9'};
      color: ${isDark ? '#F8FAFC' : '#0F172A'};
      -webkit-font-smoothing: antialiased;
      height: auto;
      min-height: 0;
    }
    body {
      padding: 16px 12px;
      display: block;
    }
    .receipt-container {
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
      background: ${isDark ? '#090D16' : '#FFFFFF'};
      border-radius: 20px;
      overflow: hidden;
      box-shadow: ${isDark ? '0 14px 40px rgba(0, 0, 0, 0.75)' : '0 10px 32px rgba(15, 23, 42, 0.07)'};
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0'};
      position: relative;
      page-break-before: avoid;
      break-before: avoid;
    }

    /* Top Security / Audit Strip */
    .security-strip {
      background: ${isDark ? '#050811' : '#F8FAFC'};
      border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'};
      padding: 9px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .security-strip-left {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 800;
      color: ${isDark ? '#94A3B8' : '#0F172A'};
      letter-spacing: 0.7px;
    }
    .security-strip-right {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 900;
      color: ${isDark ? '#34D399' : '#16A34A'};
      letter-spacing: 0.6px;
    }
    .security-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${isDark ? '#34D399' : '#16A34A'};
    }

    .card-content {
      padding: 20px 22px 22px;
    }

    /* Brand Header */
    .receipt-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo-emblem {
      width: 40px;
      height: 40px;
      background: #0F172A;
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.18)' : 'transparent'};
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFD740;
      font-size: 22px;
      font-weight: 900;
      line-height: 1;
    }
    .brand-title-group {
      display: flex;
      flex-direction: column;
    }
    .brand-name {
      font-size: 20px;
      font-weight: 900;
      color: ${isDark ? '#FFFFFF' : '#0F172A'};
      letter-spacing: -0.4px;
      line-height: 1.1;
    }
    .brand-tagline {
      font-size: 9px;
      font-weight: 700;
      color: ${isDark ? '#94A3B8' : '#64748B'};
      letter-spacing: 1.1px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: ${isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5'};
      border: 1px solid ${isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0'};
      border-radius: 20px;
      padding: 5px 12px;
    }
    .status-badge-text {
      font-size: 11px;
      font-weight: 800;
      color: ${isDark ? '#34D399' : '#15803D'};
    }

    /* Hero Amount Card */
    .hero-card {
      background: ${isDark ? '#0D1526' : '#F8FAFC'};
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'};
      border-radius: 16px;
      padding: 16px 18px;
      position: relative;
      overflow: hidden;
      margin-bottom: 14px;
    }
    .hero-accent-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: ${isDark ? '#F59E0B' : (isCredit ? '#10B981' : '#EF4444')};
    }
    .hero-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .hero-amount-label {
      font-size: 10px;
      font-weight: 800;
      color: ${isDark ? '#94A3B8' : '#64748B'};
      letter-spacing: 0.8px;
    }
    .hero-type-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2.5px 7px;
      border-radius: 6px;
      font-size: 9.5px;
      font-weight: 800;
      background: ${isCredit ? '#ECFDF5' : '#FEF2F2'};
      color: ${isCredit ? '#10B981' : '#EF4444'};
    }
    .hero-amount-val {
      font-size: 36px;
      font-weight: 900;
      color: ${isDark ? '#FFFFFF' : '#0F172A'};
      letter-spacing: -0.8px;
      line-height: 1.1;
      margin-bottom: 4px;
    }
    .hero-merchant {
      font-size: 15px;
      font-weight: 800;
      color: ${isDark ? '#E2E8F0' : '#1E293B'};
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hero-badges-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .category-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: ${isDark ? 'rgba(56, 189, 248, 0.1)' : '#FFFFFF'};
      border: 1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : '#E2E8F0'};
      border-radius: 8px;
      padding: 4px 10px;
      font-size: 11.5px;
      font-weight: 700;
      color: ${isDark ? '#38BDF8' : '#D97706'};
    }

    /* Financial Ledger Table */
    .ledger-box {
      background: ${isDark ? '#0D1526' : '#FFFFFF'};
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'};
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 14px;
    }
    .ledger-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9'};
    }
    .ledger-row:last-child {
      border-bottom: none;
    }
    .ledger-label {
      font-size: 9.5px;
      font-weight: 800;
      color: #64748B;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }
    .ledger-val {
      font-size: 12px;
      font-weight: 700;
      color: ${isDark ? '#F8FAFC' : '#0F172A'};
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ledger-txid {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Mono', Menlo, Consolas, monospace;
      font-size: 11px;
      font-weight: 800;
      color: ${isDark ? '#38BDF8' : '#0F172A'};
      letter-spacing: 0.3px;
    }

    /* Attached Receipt Image Card */
    .receipt-image-card {
      background: ${isDark ? '#0D1526' : '#FFFFFF'};
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'};
      border-radius: 14px;
      padding: 12px 14px;
      margin-bottom: 14px;
    }
    .image-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 10.5px;
      font-weight: 800;
      color: #D97706;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .attached-bill-img {
      width: 100%;
      max-height: 260px;
      object-fit: contain;
      border-radius: 10px;
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0'};
      background: ${isDark ? '#050811' : '#F8FAFC'};
      display: block;
    }

    /* Certificate Card */
    .cert-card {
      padding: 12px 14px;
      margin-bottom: 12px;
      background: ${isDark ? '#0D1526' : '#FFFFFF'};
      border-radius: 12px;
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0'};
    }
    .cert-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .cert-shield-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 800;
      color: #059669;
      background: #ECFDF5;
      border: 1px solid #A7F3D0;
      border-radius: 6px;
      padding: 3px 8px;
      letter-spacing: 0.5px;
    }
    .cert-title-sub {
      font-size: 8.5px;
      color: #64748B;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .cert-hash-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${isDark ? '#050811' : '#F8FAFC'};
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'};
      border-radius: 8px;
      padding: 6px 10px;
    }
    .cert-hash-label {
      font-size: 9px;
      font-weight: 800;
      color: #94A3B8;
      letter-spacing: 0.6px;
    }
    .cert-hash-val {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Mono', Menlo, Consolas, monospace;
      font-size: 10px;
      font-weight: 800;
      color: ${isDark ? '#38BDF8' : '#0F172A'};
      letter-spacing: 0.8px;
    }

    /* Dashed Separator */
    .dashed-divider {
      border-top: 1.5px dashed ${isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1'};
      margin: 12px 0 14px;
    }

    /* Footer */
    .bill-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .footer-left {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .footer-logo {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: #0F172A;
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'transparent'};
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFD740;
      font-size: 13px;
      font-weight: 900;
      line-height: 1;
    }
    .footer-title {
      font-size: 12px;
      font-weight: 800;
      color: ${isDark ? '#FFFFFF' : '#0F172A'};
      line-height: 1.1;
    }
    .footer-sub {
      font-size: 9px;
      color: #64748B;
      margin-top: 1px;
    }
    .footer-right {
      text-align: right;
    }
    .footer-date-label {
      font-size: 8.5px;
      color: #64748B;
      margin-bottom: 1px;
    }
    .footer-date-val {
      font-size: 9.5px;
      font-weight: 700;
      color: ${isDark ? '#FFFFFF' : '#0F172A'};
    }
    .bill-trust-seal {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      font-size: 8.5px;
      font-weight: 800;
      color: #059669;
      background: #ECFDF5;
      border: 1px solid #A7F3D0;
      border-radius: 12px;
      padding: 4px 12px;
      margin: 0 auto;
      width: fit-content;
      letter-spacing: 0.4px;
    }

    @page {
      size: auto;
      margin: 0mm;
    }
    @media print {
      html, body {
        background: ${isDark ? '#030712' : '#FFFFFF'} !important;
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
        height: auto !important;
        min-height: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .receipt-container {
        box-shadow: none !important;
        border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0'} !important;
        border-radius: 20px !important;
        width: 100% !important;
        max-width: 440px !important;
        margin: 0 auto !important;
        page-break-before: avoid !important;
        break-before: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <!-- TOP SECURITY AUDIT STRIP -->
    <div class="security-strip">
      <div class="security-strip-left">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${isDark ? '#38BDF8' : '#0F172A'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>
        <span>${isDark ? 'RUPEO OBSIDIAN • DIGITAL PAYMENT ADVICE' : 'RUPEO PAYMENTS • TRANSACTION ADVICE'}</span>
      </div>
      <div class="security-strip-right">
        <div class="security-dot"></div>
        <span>SETTLED</span>
      </div>
    </div>

    <div class="card-content">
      <!-- BRAND HEADER -->
      <div class="receipt-header">
        <div class="brand-left">
          <div class="brand-logo-emblem">₹</div>
          <div class="brand-title-group">
            <span class="brand-name">Rupeo</span>
            <span class="brand-tagline">${isDark ? 'OBSIDIAN DIGITAL VOUCHER' : 'OFFICIAL TRANSACTION ADVICE'}</span>
          </div>
        </div>

        <div class="status-badge">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" fill="${isDark ? '#34D399' : '#16A34A'}" />
            <path d="M6 10L8.8 12.8L14 7.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="status-badge-text">${isCredit ? 'FUNDS RECEIVED' : 'PAYMENT SUCCESSFUL'}</span>
        </div>
      </div>

      <!-- HERO AMOUNT CARD -->
      <div class="hero-card">
        <div class="hero-accent-bar"></div>
        <div class="hero-top-row">
          <div class="hero-amount-label">${isCredit ? 'TOTAL AMOUNT RECEIVED' : 'TOTAL AMOUNT PAID'}</div>
          <div class="hero-type-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              ${isCredit ? '<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline>' : '<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>'}
            </svg>
            <span>${isCredit ? 'CREDIT' : 'DEBIT'}</span>
          </div>
        </div>

        <div class="hero-amount-val">${currency}${formattedAmt}</div>

        <div class="hero-merchant">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${isDark ? '#94A3B8' : '#64748B'}" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>${isCredit ? 'From: ' : 'Paid to: '}${merchant}</span>
        </div>

        <div class="hero-badges-row">
          <div class="category-pill">
            <span>${catIcon}</span>
            <span>${category}</span>
          </div>
          ${getPaymentMethodLogoHtml(paymentMode, isDark)}
        </div>
      </div>

      <!-- STRUCTURED FINANCIAL LEDGER BREAKDOWN -->
      <div class="ledger-box">
        <div class="ledger-row">
          <span class="ledger-label">REFERENCE NO.</span>
          <span class="ledger-val ledger-txid">${txRefId}</span>
        </div>
        <div class="ledger-row">
          <span class="ledger-label">DATE & TIME</span>
          <span class="ledger-val">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            ${formattedDate} • ${formattedTime}
          </span>
        </div>
        <div class="ledger-row">
          <span class="ledger-label">PAYMENT CHANNEL</span>
          <span class="ledger-val">
            ${paymentMode}
            ${getPaymentMethodLogoHtml(paymentMode, isDark)}
          </span>
        </div>
        <div class="ledger-row">
          <span class="ledger-label">CATEGORY</span>
          <span class="ledger-val">${catIcon} ${category}</span>
        </div>
        <div class="ledger-row">
          <span class="ledger-label">TYPE</span>
          <span class="ledger-val" style="color:${isCredit ? '#10B981' : '#EF4444'};font-weight:800;">
            ${isCredit ? 'Credit (Income)' : 'Debit (Expense)'}
          </span>
        </div>
        ${(() => {
          const noteToShow = getDisplayTransactionNote(description);
          if (!noteToShow) return '';
          const isOriginalMsg = noteToShow.startsWith('Original Message:');
          const messageBody = isOriginalMsg
            ? noteToShow.replace(/^Original Message:\s*/i, '').trim()
            : noteToShow;

          return `
          <div class="ledger-row" style="align-items:flex-start;">
            <span class="ledger-label">${isOriginalMsg ? 'ORIGINAL MSG' : 'REMARKS'}</span>
            <span class="ledger-val" style="color:#64748B;font-weight:600;max-width:65%;text-align:left;line-height:1.4;">
              ${messageBody}
            </span>
          </div>
          `;
        })()}
      </div>

      <!-- ATTACHED RECEIPT IMAGE (if present) -->
      ${resolvedImageSrc ? `
      <div class="receipt-image-card">
        <div class="image-card-header">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>Document Proof Attachment</span>
        </div>
        <img src="${resolvedImageSrc}" alt="Attached Receipt" class="attached-bill-img" />
      </div>
      ` : ''}

      <!-- DASHED SEPARATOR -->
      <div class="dashed-divider"></div>

      <!-- RECEIPT FOOTER -->
      <div class="bill-footer">
        <div class="footer-left">
          <div class="footer-logo">₹</div>
          <div>
            <div class="footer-title">Rupeo Financial</div>
            <div class="footer-sub">${isDark ? 'Digital Ledger Voucher • SHA-256' : 'Computer Generated Payment Advice'}</div>
          </div>
        </div>
        <div class="footer-right">
          <div class="footer-date-label">Issued on</div>
          <div class="footer-date-val">${generatedTimestamp}</div>
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
    let resolvedImageSrc: string | null = null;
    if (options.receiptImage) {
      if (options.receiptImage.startsWith('data:image/')) {
        resolvedImageSrc = options.receiptImage;
      } else if (
        options.receiptImage.startsWith('file://') ||
        options.receiptImage.startsWith('content://') ||
        options.receiptImage.startsWith('/')
      ) {
        try {
          const b64 = await FileSystem.readAsStringAsync(options.receiptImage, {
            encoding: FileSystem.EncodingType.Base64,
          });
          resolvedImageSrc = `data:image/jpeg;base64,${b64}`;
        } catch (e) {
          warn('Could not read receipt image file as base64:', e);
          resolvedImageSrc = null;
        }
      } else {
        resolvedImageSrc = options.receiptImage;
      }
    }

    const html = generateTransactionReceiptHtml(options, resolvedImageSrc);
    const cleanId = (options.barcodeValue || options.id || 'receipt').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Rupeo_Bill_${cleanId}.pdf`;

    // On web, expo-print's printToFileAsync triggers window.print() on the parent document,
    // which prints the whole web page with buttons, headers, and navigation!
    // Instead, we print via a dedicated isolated iframe containing only the generated receipt HTML.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const originalTitle = document.title;
        document.title = filename;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.setAttribute('title', 'Rupeo Receipt Print Frame');
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.title = filename;
          doc.close();
        }

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (printErr) {
            warn('Iframe print error:', printErr);
          } finally {
            setTimeout(() => {
              document.title = originalTitle;
              try {
                if (document.body.contains(iframe)) {
                  document.body.removeChild(iframe);
                }
              } catch {
                // Iframe may have already been unmounted or removed
              }
            }, 3000);
          }
        }, 350);

        return { success: true, filename };
      }
    }

    const result = await Print.printToFileAsync({
      html,
      base64: false,
    });

    if (result && result.uri) {
      let finalUri = result.uri;
      try {
        const targetDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        const targetUri = `${targetDir}${filename}`;
        const existing = await FileSystem.getInfoAsync(targetUri);
        if (existing.exists) {
          await FileSystem.deleteAsync(targetUri, { idempotent: true });
        }
        await FileSystem.copyAsync({
          from: result.uri,
          to: targetUri,
        });
        const verify = await FileSystem.getInfoAsync(targetUri);
        if (verify.exists) {
          finalUri = targetUri;
        }
      } catch (copyErr) {
        warn('Could not copy PDF file to targetUri, using result.uri fallback:', copyErr);
        finalUri = result.uri;
      }

      return { success: true, uri: finalUri, filename };
    }

    return { success: false, error: 'Failed to generate PDF bill file.' };
  } catch (err: any) {
    error('Transaction Receipt PDF Generation error:', err);
    return { success: false, error: err?.message || 'Failed to print PDF.' };
  }
}

/**
 * Generate and share Transaction Receipt as PDF
 */
export async function shareTransactionReceiptPdf(
  options: TransactionReceiptPdfOptions
): Promise<{ success: boolean; uri?: string; filename?: string; error?: string }> {
  const res = await generateTransactionReceiptPdfOnly(options);
  if (Platform.OS === 'web') {
    return res;
  }
  if (res.success && res.uri) {
    try {
      const isAvail = await Sharing.isAvailableAsync();
      if (isAvail) {
        await Sharing.shareAsync(res.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Rupeo Bill - ${options.merchant || 'Transaction'} (${options.currency || '₹'}${options.amount})`,
          UTI: 'com.adobe.pdf',
        });
        return { success: true, uri: res.uri, filename: res.filename };
      }
    } catch (shareErr: any) {
      warn('Sharing.shareAsync failed:', shareErr);
      return { success: false, error: shareErr?.message || 'Failed to open share dialog.' };
    }
    return { success: true, uri: res.uri, filename: res.filename };
  }
  return { success: false, error: res.error || 'Failed to generate PDF.' };
}

/**
 * Download / Save Transaction Receipt PDF to device files
 */
export async function downloadTransactionReceiptPdf(
  options: TransactionReceiptPdfOptions
): Promise<{ success: boolean; uri?: string; filename?: string; error?: string }> {
  const res = await generateTransactionReceiptPdfOnly(options);
  if (!res.success || !res.uri) {
    return res;
  }

  if (Platform.OS === 'android') {
    try {
      if (FileSystem.StorageAccessFramework) {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const fileString = await FileSystem.readAsStringAsync(res.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const createdUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            res.filename || `Rupeo_Bill_${Date.now()}.pdf`,
            'application/pdf'
          );
          await FileSystem.writeAsStringAsync(createdUri, fileString, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return { success: true, uri: createdUri, filename: res.filename };
        }
      }
    } catch (safErr) {
      warn('SAF save failed, fallback to system share:', safErr);
    }
  }

  // Fallback to Sharing.shareAsync (user can save to Drive, Downloads, Files)
  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(res.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Save Rupeo Bill (${options.currency || '₹'}${options.amount})`,
        UTI: 'com.adobe.pdf',
      });
      return { success: true, uri: res.uri, filename: res.filename };
    } catch (shareErr: any) {
      warn('Download fallback sharing failed:', shareErr);
      return { success: false, error: shareErr?.message || 'Failed to save PDF.' };
    }
  }

  return res;
}
