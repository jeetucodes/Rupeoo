import { Platform } from 'react-native';
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
  receiptImage?: string | null;
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
  } catch {}
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

export function generateTransactionReceiptHtml(
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
    barcodeValue,
    currency = '₹',
  } = options;

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
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
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
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
      border: 1px solid #E2E8F0;
      position: relative;
      padding: 28px 24px 22px;
    }

    /* Ambient Soft Yellow Curved Waves */
    .top-wave {
      position: absolute;
      top: 0;
      right: 0;
      pointer-events: none;
      z-index: 0;
    }
    .bottom-wave {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      pointer-events: none;
      z-index: 0;
      width: 100%;
    }

    .card-content {
      position: relative;
      z-index: 1;
    }

    /* Header */
    .receipt-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo-emblem {
      width: 44px;
      height: 44px;
      background: #0F172A;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFD740;
      font-size: 26px;
      font-weight: 900;
      line-height: 1;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
    }
    .brand-title-group {
      display: flex;
      flex-direction: column;
    }
    .brand-name {
      font-size: 26px;
      font-weight: 900;
      color: #0F172A;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }
    .brand-tagline {
      font-size: 9.5px;
      font-weight: 700;
      color: #64748B;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ECFDF5;
      border: 1px solid #A7F3D0;
      border-radius: 20px;
      padding: 6px 14px;
    }
    .status-badge-text {
      font-size: 11.5px;
      font-weight: 700;
      color: #15803D;
    }

    /* Hero Amount Card */
    .hero-card {
      background: #FFFDF0;
      border: 1px solid #FEF3C7;
      border-radius: 20px;
      padding: 20px 22px;
      position: relative;
      overflow: hidden;
      margin-bottom: 18px;
    }
    .hero-watermark {
      position: absolute;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 92px;
      font-weight: 900;
      color: rgba(245, 158, 11, 0.18);
      pointer-events: none;
      line-height: 1;
      user-select: none;
    }
    .hero-amount-label {
      font-size: 13px;
      font-weight: 600;
      color: #64748B;
      margin-bottom: 4px;
    }
    .hero-amount-val {
      font-size: 40px;
      font-weight: 900;
      color: #0F172A;
      letter-spacing: -1px;
      line-height: 1.1;
      margin-bottom: 4px;
    }
    .hero-merchant {
      font-size: 18px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 12px;
    }
    .category-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #FEF3C7;
      border-radius: 12px;
      padding: 5px 14px;
      font-size: 13px;
      font-weight: 700;
      color: #D97706;
    }

    /* 2x3 Specification Details Grid */
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 14px;
      margin-bottom: 16px;
    }
    .grid-item {
      background: #FFFFFF;
      border: 1px solid #F1F5F9;
      border-radius: 14px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .grid-icon-box {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .icon-grey {
      background: #F1F5F9;
    }
    .icon-amber {
      background: #FEF3C7;
    }
    .grid-text {
      flex: 1;
      min-width: 0;
    }
    .grid-label {
      font-size: 10.5px;
      font-weight: 600;
      color: #64748B;
      margin-bottom: 2px;
    }
    .grid-val {
      font-size: 13px;
      font-weight: 800;
      color: #0F172A;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .id-val {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Mono', Menlo, Consolas, monospace;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: -0.2px;
    }
    .flag-badge {
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }
    .copy-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      color: #64748B;
    }

    /* Attached Receipt Image Card (Conditionally shown only if user attached an image) */
    .receipt-image-card {
      background: #FFFFFF;
      border: 1px solid #F1F5F9;
      border-radius: 14px;
      padding: 12px 14px;
      margin-bottom: 16px;
    }
    .image-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .image-card-title {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .attached-bill-img {
      width: 100%;
      max-height: 280px;
      object-fit: contain;
      border-radius: 10px;
      border: 1px solid #E2E8F0;
      background: #F8FAFC;
      display: block;
    }

    /* Barcode Section */
    .barcode-card {
      padding: 12px 16px 8px;
      text-align: center;
      margin-bottom: 8px;
      background: #FFFFFF;
      border-radius: 12px;
      border: 1px solid #E2E8F0;
    }
    .barcode-svg-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 6px;
      background: #FFFFFF;
    }
    .barcode-subtext {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Mono', Menlo, Consolas, 'Courier New', monospace;
      font-size: 11px;
      font-weight: 800;
      color: #0F172A;
      letter-spacing: 2px;
      margin-top: 4px;
    }
    .barcode-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      font-size: 8.5px;
      font-weight: 800;
      color: #64748B;
      letter-spacing: 1px;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .barcode-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #10B981;
      display: inline-block;
    }

    /* Dashed Separator */
    .dashed-divider {
      border-top: 1.5px dashed #CBD5E1;
      margin: 14px 0 16px;
    }

    /* Footer */
    .bill-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 2px;
    }
    .footer-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .footer-logo {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: #0F172A;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFD740;
      font-size: 15px;
      font-weight: 900;
      line-height: 1;
    }
    .footer-title {
      font-size: 12.5px;
      font-weight: 800;
      color: #0F172A;
      line-height: 1.1;
    }
    .footer-sub {
      font-size: 9.5px;
      color: #64748B;
      margin-top: 1px;
    }
    .footer-right {
      text-align: right;
    }
    .footer-date-label {
      font-size: 9px;
      color: #64748B;
      margin-bottom: 1px;
    }
    .footer-date-val {
      font-size: 10px;
      font-weight: 700;
      color: #0F172A;
    }

    @page {
      size: auto;
      margin: 0mm;
    }
    @media print {
      html, body {
        background: #FFFFFF !important;
        margin: 0 !important;
        padding: 24px 0 !important;
        display: flex !important;
        justify-content: center !important;
        align-items: flex-start !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .receipt-container {
        box-shadow: none !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 24px !important;
        width: 100% !important;
        max-width: 440px !important;
        margin: 0 auto !important;
        padding: 28px 24px 22px !important;
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
    <!-- Top-Right Ambient Yellow Wave -->
    <div class="top-wave">
      <svg width="190" height="130" viewBox="0 0 190 130" fill="none">
        <path d="M0 0C65 45 130 20 190 85V0H0Z" fill="url(#topWave1)" opacity="0.4" />
        <path d="M45 0C95 52 145 12 190 55V0H45Z" fill="url(#topWave2)" opacity="0.5" />
        <defs>
          <linearGradient id="topWave1" x1="0" y1="0" x2="190" y2="85" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FEF08A" />
            <stop offset="1" stop-color="#FDE047" />
          </linearGradient>
          <linearGradient id="topWave2" x1="45" y1="0" x2="190" y2="55" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FFFBEB" />
            <stop offset="1" stop-color="#FCD34D" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    <!-- Bottom Ambient Yellow Wave -->
    <div class="bottom-wave">
      <svg width="440" height="50" viewBox="0 0 440 50" fill="none">
        <path d="M0 24C95 44 210 6 320 34C375 48 405 38 440 28V50H0V24Z" fill="url(#botWave)" opacity="0.65" />
        <defs>
          <linearGradient id="botWave" x1="0" y1="20" x2="440" y2="50" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FEF08A" />
            <stop offset="0.5" stop-color="#FDE047" />
            <stop offset="1" stop-color="#FBBF24" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    <div class="card-content">
      <!-- HEADER -->
      <div class="receipt-header">
        <div class="brand-left">
          <div class="brand-logo-emblem">₹</div>
          <div class="brand-title-group">
            <span class="brand-name">Rupeo</span>
            <span class="brand-tagline">TRANSACTION RECEIPT</span>
          </div>
        </div>

        <div class="status-badge">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" fill="#16A34A" />
            <path d="M6 10L8.8 12.8L14 7.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="status-badge-text">${statusLabel}</span>
        </div>
      </div>

      <!-- HERO AMOUNT CARD -->
      <div class="hero-card">
        <div class="hero-watermark">₹</div>
        <div class="hero-amount-label">${amountLabel}</div>
        <div class="hero-amount-val">${currency}${formattedAmt}</div>
        <div class="hero-merchant">${merchant}</div>
        <div class="category-pill">
          <span>${catIcon}</span>
          <span>${category}</span>
        </div>
      </div>

      <!-- SPECIFICATION GRID (2x3) -->
      <div class="details-grid">
        <!-- Date -->
        <div class="grid-item">
          <div class="grid-icon-box icon-grey">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div class="grid-text">
            <div class="grid-label">Date</div>
            <div class="grid-val">${formattedDate}</div>
          </div>
        </div>

        <!-- Time -->
        <div class="grid-item">
          <div class="grid-icon-box icon-amber">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div class="grid-text">
            <div class="grid-label">Time</div>
            <div class="grid-val">${formattedTime}</div>
          </div>
        </div>

        <!-- Merchant -->
        <div class="grid-item">
          <div class="grid-icon-box icon-grey">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div class="grid-text">
            <div class="grid-label">Merchant</div>
            <div class="grid-val">${merchant}</div>
          </div>
        </div>

        <!-- Category -->
        <div class="grid-item">
          <div class="grid-icon-box icon-amber">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>
          <div class="grid-text">
            <div class="grid-label">Category</div>
            <div class="grid-val">${category}</div>
          </div>
        </div>

        <!-- Payment Method -->
        <div class="grid-item">
          <div class="grid-icon-box icon-grey">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div class="grid-text">
            <div class="grid-label">Payment Method</div>
            <div class="grid-val">${paymentMode}</div>
          </div>
          <div class="flag-badge">
            <svg width="20" height="14" viewBox="0 0 30 20" style="border-radius: 2px; overflow: hidden; border: 0.5px solid #E2E8F0;">
              <rect width="30" height="6.66" fill="#FF9933" />
              <rect y="6.66" width="30" height="6.66" fill="#FFFFFF" />
              <rect y="13.33" width="30" height="6.66" fill="#138808" />
              <circle cx="15" cy="10" r="2.2" fill="#000080" />
            </svg>
          </div>
        </div>

        <!-- Transaction ID -->
        <div class="grid-item">
          <div class="grid-icon-box icon-amber">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div class="grid-text">
            <div class="grid-label">Transaction ID</div>
            <div class="grid-val id-val">${txRefId}</div>
          </div>
          <div class="copy-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </div>
        </div>
      </div>

      <!-- RECEIPT / BILL IMAGE (Shown only if user added an image, otherwise omitted completely) -->
      ${
        resolvedImageSrc
          ? `
      <div class="receipt-image-card">
        <div class="image-card-header">
          <div class="grid-icon-box icon-amber" style="width: 26px; height: 26px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <span class="image-card-title">Bill / Receipt Attachment</span>
        </div>
        <img src="${resolvedImageSrc}" alt="Attached Receipt" class="attached-bill-img" />
      </div>
      `
          : ''
      }

      <!-- SCANNABLE ISO/IEC 16388 CODE 39 BARCODE -->
      <div class="barcode-card">
        <div class="barcode-svg-wrap">
          ${barcodeInfo.svg}
        </div>
        <div class="barcode-subtext">${barcodeInfo.text}</div>
        <div class="barcode-badge">
          <span class="barcode-dot"></span>
          <span>RUPEO · CODE 39 SCANNABLE RECORD</span>
        </div>
      </div>

      <!-- DASHED SEPARATOR -->
      <div class="dashed-divider"></div>

      <!-- FOOTER -->
      <div class="bill-footer">
        <div class="footer-left">
          <div class="footer-logo">₹</div>
          <div>
            <div class="footer-title">Rupeo</div>
            <div class="footer-sub">Your Personal Expense Tracker</div>
          </div>
        </div>
        <div class="footer-right">
          <div class="footer-date-label">Generated on</div>
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
          console.warn('Could not read receipt image file as base64:', e);
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
            console.warn('Iframe print error:', printErr);
          } finally {
            setTimeout(() => {
              document.title = originalTitle;
              try {
                if (document.body.contains(iframe)) {
                  document.body.removeChild(iframe);
                }
              } catch {}
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
      console.warn('Sharing.shareAsync failed:', shareErr);
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
      console.warn('SAF save failed, fallback to system share:', safErr);
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
      console.warn('Download fallback sharing failed:', shareErr);
      return { success: false, error: shareErr?.message || 'Failed to save PDF.' };
    }
  }

  return res;
}
