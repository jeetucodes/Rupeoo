import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export interface StatementPdfOptions {
  userName?: string;
  userEmail?: string;
  periodMode: 'all' | 'month';
  monthStr?: string; // YYYY-MM
  typeFilter?: 'all' | 'debit' | 'credit';
  curr?: string;
  transactions: any[];
}

/**
 * Formats a YYYY-MM string (e.g. '2026-09') into a human-readable title (e.g. 'September 2026')
 */
export function formatMonthDisplay(monthStr: string): string {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return monthStr;
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) into 'DD MMM YYYY'
 */
function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
  } catch {}
  return dateStr;
}

/**
 * Generates and shares/downloads a comprehensive, professional PDF Transaction Statement
 */
export async function generateAndShareTransactionStatementPDF(options: StatementPdfOptions): Promise<{ success: boolean; count: number; error?: string }> {
  const {
    userName = 'Rupeo User',
    userEmail = '',
    periodMode,
    monthStr = '',
    typeFilter = 'all',
    curr = '₹',
    transactions = [],
  } = options;

  // 1. Filter Transactions by Period & Type
  let filtered = [...transactions];

  if (periodMode === 'month' && monthStr) {
    filtered = filtered.filter(tx => tx.date && tx.date.startsWith(monthStr));
  }

  if (typeFilter !== 'all') {
    filtered = filtered.filter(tx => (tx.type || 'debit').toLowerCase() === typeFilter);
  }

  // Sort chronological descending (newest first)
  filtered.sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return (b.time || '').localeCompare(a.time || '');
  });

  if (filtered.length === 0) {
    return { success: false, count: 0, error: 'No transactions found for the selected period.' };
  }

  // 2. Compute Aggregates
  let totalIncome = 0;
  let totalExpense = 0;
  const categoryMap: Record<string, number> = {};

  filtered.forEach(tx => {
    const amt = Math.abs(Number(tx.amount) || 0);
    const type = (tx.type || 'debit').toLowerCase();
    if (type === 'credit' || type === 'income') {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      const cat = tx.category || 'Others';
      categoryMap[cat] = (categoryMap[cat] || 0) + amt;
    }
  });

  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netSavings / totalIncome) * 100)) : 0;

  // Top categories
  const sortedCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, amount]) => ({
      name,
      amount,
      percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    }));

  // Period title
  const periodLabel =
    periodMode === 'month' && monthStr
      ? `${formatMonthDisplay(monthStr)} Statement`
      : 'Lifetime Passbook (All Transactions)';

  const generatedDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const generatedTime = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const statementRef = `RUP-${Date.now().toString().slice(-6)}`;

  // 3. Build HTML Template
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rupeo Statement - ${periodLabel}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #0F172A;
      background: #FFFFFF;
      font-size: 11px;
      line-height: 1.4;
    }

    /* HEADER */
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0F172A;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .brand-col {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-emblem {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1.5px solid #FFD740;
    }
    .brand-emblem-text {
      color: #FFD740;
      font-size: 24px;
      font-weight: 900;
      font-family: sans-serif;
    }
    .brand-title-wrap {
      display: flex;
      flex-direction: column;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 900;
      color: #0F172A;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-tag {
      font-size: 9px;
      font-weight: 800;
      color: #1E40AF;
      background: #DBEAFE;
      padding: 2px 7px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .brand-sub {
      font-size: 10.5px;
      color: #64748B;
      font-weight: 600;
      margin-top: 1px;
    }

    .meta-col {
      text-align: right;
    }
    .meta-title {
      font-size: 13px;
      font-weight: 900;
      color: #0F172A;
    }
    .meta-ref {
      font-size: 9.5px;
      color: #64748B;
      font-weight: 700;
      margin-top: 1px;
    }
    .meta-user {
      font-size: 10.5px;
      font-weight: 800;
      color: #1E293B;
      margin-top: 3px;
    }
    .meta-date {
      font-size: 9px;
      color: #64748B;
      margin-top: 1px;
    }

    /* SUMMARY CARDS */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    .summary-card {
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid #E2E8F0;
      background: #FFFFFF;
    }
    .card-income {
      background: #F0FDF4;
      border-color: #BBF7D0;
    }
    .card-expense {
      background: #FEF2F2;
      border-color: #FECACA;
    }
    .card-net {
      background: #EFF6FF;
      border-color: #BFDBFE;
    }
    .card-txns {
      background: #F8FAFC;
      border-color: #E2E8F0;
    }
    .card-label {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748B;
    }
    .card-amount {
      font-size: 16px;
      font-weight: 900;
      margin-top: 3px;
      color: #0F172A;
    }
    .color-income { color: #16A34A; }
    .color-expense { color: #DC2626; }
    .color-net { color: #2563EB; }

    /* CATEGORY SUMMARY PILLS */
    .category-section {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 9px 12px;
      margin-bottom: 14px;
    }
    .category-heading {
      font-size: 10.5px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .category-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .category-pill {
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 9.5px;
      font-weight: 700;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* TRANSACTION TABLE */
    .table-container {
      width: 100%;
      margin-bottom: 16px;
    }
    .table-title {
      font-size: 12px;
      font-weight: 900;
      color: #0F172A;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      page-break-inside: auto;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    th {
      background: #0F172A;
      color: #FFFFFF;
      text-align: left;
      padding: 7px 8px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    th.text-right { text-align: right; }
    th.text-center { text-align: center; }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #E2E8F0;
      color: #1E293B;
      vertical-align: middle;
    }
    tr:nth-child(even) td {
      background: #F8FAFC;
    }
    .td-num {
      color: #94A3B8;
      font-weight: 700;
      text-align: center;
      width: 26px;
    }
    .td-date {
      font-weight: 700;
      color: #334155;
      white-space: nowrap;
      width: 82px;
    }
    .td-time {
      font-size: 8.5px;
      color: #94A3B8;
      font-weight: 600;
    }
    .td-desc {
      font-weight: 800;
      color: #0F172A;
    }
    .td-note {
      font-size: 8.5px;
      color: #64748B;
      font-weight: 500;
      margin-top: 1px;
    }
    .cat-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 8.5px;
      font-weight: 700;
      background: #F1F5F9;
      color: #475569;
      border: 1px solid #E2E8F0;
    }
    .type-pill {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .type-pill-income {
      background: #DCFCE7;
      color: #16A34A;
    }
    .type-pill-expense {
      background: #FEE2E2;
      color: #DC2626;
    }
    .amount-income {
      font-size: 11px;
      font-weight: 900;
      color: #16A34A;
      text-align: right;
    }
    .amount-expense {
      font-size: 11px;
      font-weight: 900;
      color: #DC2626;
      text-align: right;
    }

    /* PLAY STORE BANNER & FOOTER */
    .playstore-banner {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      border-radius: 12px;
      padding: 12px 16px;
      margin-top: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #FFFFFF;
      border: 1px solid #334155;
      page-break-inside: avoid;
    }
    .banner-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .banner-icon {
      width: 36px;
      height: 36px;
      border-radius: 9px;
      background: #FFD740;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .banner-icon span {
      font-size: 20px;
      font-weight: 900;
      color: #0F172A;
    }
    .banner-title {
      font-size: 12px;
      font-weight: 900;
      color: #FFFFFF;
    }
    .banner-sub {
      font-size: 9.5px;
      color: #94A3B8;
      margin-top: 1px;
    }
    .banner-badge {
      background: #2563EB;
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 800;
      padding: 5px 12px;
      border-radius: 7px;
      display: inline-block;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      white-space: nowrap;
    }

    .statement-footer {
      border-top: 1px solid #CBD5E1;
      padding-top: 8px;
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      font-size: 8.5px;
      color: #64748B;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header-container">
    <div class="brand-col">
      <div class="brand-emblem">
        <span class="brand-emblem-text">₹</span>
      </div>
      <div class="brand-title-wrap">
        <div class="brand-title">
          Rupeo <span class="brand-tag">Certified Statement</span>
        </div>
        <div class="brand-sub">Smart Expense Tracker • Personal Wealth Intelligence</div>
      </div>
    </div>

    <div class="meta-col">
      <div class="meta-title">${periodLabel}</div>
      <div class="meta-ref">Ref: ${statementRef}</div>
      <div class="meta-user">Account: ${userName} ${userEmail ? `(${userEmail})` : ''}</div>
      <div class="meta-date">Generated: ${generatedDate}, ${generatedTime}</div>
    </div>
  </div>

  <!-- SUMMARY CARDS -->
  <div class="summary-grid">
    <div class="summary-card card-income">
      <div class="card-label">Total Received</div>
      <div class="card-amount color-income">+${curr}${totalIncome.toLocaleString('en-IN')}</div>
    </div>

    <div class="summary-card card-expense">
      <div class="card-label">Total Spent</div>
      <div class="card-amount color-expense">-${curr}${totalExpense.toLocaleString('en-IN')}</div>
    </div>

    <div class="summary-card card-net">
      <div class="card-label">Net Balance (${savingsRate}% Saved)</div>
      <div class="card-amount color-net">${netSavings >= 0 ? '+' : ''}${curr}${netSavings.toLocaleString('en-IN')}</div>
    </div>

    <div class="summary-card card-txns">
      <div class="card-label">Total Transactions</div>
      <div class="card-amount">${filtered.length} Entries</div>
    </div>
  </div>

  <!-- TOP SPENDING CATEGORIES -->
  ${
    sortedCategories.length > 0
      ? `
  <div class="category-section">
    <div class="category-heading">
      <span>Top Spending Categories</span>
      <span style="font-size: 9px; color: #64748B; font-weight: 700;">Account Outflow Breakdown</span>
    </div>
    <div class="category-pills">
      ${sortedCategories
        .map(
          c => `
        <div class="category-pill">
          <span>${c.name}:</span>
          <span style="color: #0F172A; font-weight: 800;">${curr}${c.amount.toLocaleString('en-IN')}</span>
          <span style="color: #64748B; font-size: 8px;">(${c.percentage}%)</span>
        </div>`
        )
        .join('')}
    </div>
  </div>`
      : ''
  }

  <!-- ITEMISED LEDGER TABLE -->
  <div class="table-container">
    <div class="table-title">
      <span>Itemized Transactions Ledger (${filtered.length} Total)</span>
      <span style="font-size: 9px; color: #64748B; font-weight: 700;">All records verified</span>
    </div>

    <table>
      <thead>
        <tr>
          <th class="text-center" style="width: 26px;">#</th>
          <th style="width: 86px;">Date</th>
          <th>Description / Payee</th>
          <th>Category</th>
          <th>Mode</th>
          <th class="text-center" style="width: 60px;">Type</th>
          <th class="text-right" style="width: 90px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${filtered
          .map((tx, idx) => {
            const isIncome = (tx.type || 'debit').toLowerCase() === 'credit' || (tx.type || 'debit').toLowerCase() === 'income';
            const amt = Math.abs(Number(tx.amount) || 0);
            const title = tx.merchant_name || tx.description || tx.category || 'Transaction';
            const note = tx.merchant_name && tx.description ? tx.description : tx.utr ? `Ref/UTR: ${tx.utr}` : '';
            return `
          <tr>
            <td class="td-num">${idx + 1}</td>
            <td class="td-date">
              <div>${formatDateDisplay(tx.date)}</div>
              ${tx.time ? `<div class="td-time">${tx.time}</div>` : ''}
            </td>
            <td>
              <div class="td-desc">${title}</div>
              ${note ? `<div class="td-note">${note}</div>` : ''}
            </td>
            <td><span class="cat-badge">${tx.category || 'Others'}</span></td>
            <td style="color: #475569; font-size: 9px; font-weight: 600;">${tx.payment_mode || 'Cash'}</td>
            <td class="text-center">
              <span class="type-pill ${isIncome ? 'type-pill-income' : 'type-pill-expense'}">
                ${isIncome ? 'Credit' : 'Debit'}
              </span>
            </td>
            <td class="${isIncome ? 'amount-income' : 'amount-expense'}">
              ${isIncome ? '+' : '-'}${curr}${amt.toLocaleString('en-IN')}
            </td>
          </tr>
        `;
          })
          .join('')}
      </tbody>
    </table>
  </div>

  <!-- GOOGLE PLAY STORE PROMOTION BANNER -->
  <div class="playstore-banner">
    <div class="banner-left">
      <div class="banner-icon">
        <span>₹</span>
      </div>
      <div>
        <div class="banner-title">Download Rupeo on Google Play Store</div>
        <div class="banner-sub">Split UPI Payments • Track Daily Budgets • 100% Private & Ad-Free</div>
      </div>
    </div>
    <div>
      <div class="banner-badge">
        📱 Get It on Play Store
      </div>
    </div>
  </div>

  <!-- STATEMENT FOOTER -->
  <div class="statement-footer">
    <span>Certified Electronic Statement • Generated by Rupeo App (No signature required)</span>
    <span>Official Website: https://rupeoo.vercel.app • Play Store: Rupeo App</span>
  </div>

</body>
</html>
  `;

  const cleanFilename = `Rupeo_Statement_${(monthStr || 'All').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const defaultPdfTitle = `Rupeo Statement - ${periodLabel}`;

  // 4. Web Handling
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      const originalTitle = document.title;
      document.title = defaultPdfTitle;

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.title = defaultPdfTitle;
        iframeDoc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.title = originalTitle;
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 3000);
        }, 500);

        return { success: true, count: filtered.length };
      }
    }
    return { success: true, count: filtered.length };
  }

  // 5. Mobile Handling (Android & iOS)
  try {
    const result = await Print.printToFileAsync({
      html,
      base64: false,
    });

    if (result && result.uri) {
      let shareUri = result.uri;
      try {
        const targetUri = `${FileSystem.documentDirectory}${cleanFilename}`;
        await FileSystem.copyAsync({
          from: result.uri,
          to: targetUri,
        });
        const info = await FileSystem.getInfoAsync(targetUri);
        if (info.exists) {
          shareUri = targetUri;
        }
      } catch (copyErr) {
        console.warn('Could not rename PDF file, using default URI:', copyErr);
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUri, {
          mimeType: 'application/pdf',
          dialogTitle: defaultPdfTitle,
          UTI: 'com.adobe.pdf',
        });
      }

      return { success: true, count: filtered.length };
    }

    return { success: false, count: 0, error: 'Failed to generate PDF file.' };
  } catch (err: any) {
    console.error('Error generating transaction statement PDF:', err);
    return { success: false, count: 0, error: err?.message || 'Failed to print PDF.' };
  }
}
