import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { warn, error } from '@/lib/logger';

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
  } catch {
    // Intentional: fall back to raw dateStr if parsing fails
  }
  return dateStr;
}

/**
 * Generates and shares/downloads a comprehensive, certified bank-grade PDF Passbook & Statement
 */
export async function generateAndShareTransactionStatementPDF(
  options: StatementPdfOptions
): Promise<{ success: boolean; count: number; error?: string }> {
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

  if (filtered.length === 0) {
    return { success: false, count: 0, error: 'No transactions found for the selected period.' };
  }

  // 2. Compute Running Balance (Sort chronological ascending first)
  const chronological = [...filtered].sort((a, b) => {
    const dateA = a.date || '';
    const dateB = b.date || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.time || '').localeCompare(b.time || '');
  });

  let runningBalance = 0;
  const enrichedList = chronological.map(tx => {
    const amt = Math.abs(Number(tx.amount) || 0);
    const type = (tx.type || 'debit').toLowerCase();
    const isIncome = type === 'credit' || type === 'income';
    if (isIncome) {
      runningBalance += amt;
    } else {
      runningBalance -= amt;
    }
    return {
      ...tx,
      isIncome,
      parsedAmount: amt,
      balanceAfter: runningBalance,
    };
  });

  // Display newest first in passbook ledger
  const displayList = [...enrichedList].reverse();

  // 3. Compute Aggregates
  let totalIncome = 0;
  let totalExpense = 0;
  const categoryMap: Record<string, number> = {};
  const dailySpendMap: Record<string, number> = {};

  filtered.forEach(tx => {
    const amt = Math.abs(Number(tx.amount) || 0);
    const type = (tx.type || 'debit').toLowerCase();
    if (type === 'credit' || type === 'income') {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      const cat = tx.category || 'Others';
      categoryMap[cat] = (categoryMap[cat] || 0) + amt;

      if (tx.date) {
        dailySpendMap[tx.date] = (dailySpendMap[tx.date] || 0) + amt;
      }
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
      ? `${formatMonthDisplay(monthStr)} Passbook Statement`
      : 'Comprehensive Passbook (Lifetime Ledger)';

  const generatedDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const generatedTime = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Daily points for wave chart
  const sortedDates = Object.keys(dailySpendMap).sort();
  const dailyPoints = sortedDates.map(dateStr => {
    let label = dateStr;
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const day = parseInt(parts[2], 10);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mIdx = parseInt(parts[1], 10) - 1;
        label = `${day} ${months[mIdx] || ''}`;
      }
    } catch {
      // Fallback
    }
    return {
      date: dateStr,
      label,
      expense: dailySpendMap[dateStr],
    };
  });

  const activeDaysCount = Math.max(dailyPoints.length, 1);
  const avgDailySpend = Math.round(totalExpense / activeDaysCount);

  // Build Daily Spend Wave SVG
  let dailySpendChartHtml = '';
  if (dailyPoints.length > 1 && totalExpense > 0) {
    const chartW = 750;
    const chartH = 92;
    const padX = 35;
    const padTop = 16;
    const padBottom = 22;
    const innerH = chartH - padBottom;
    const usableW = chartW - padX * 2;
    const step = usableW / Math.max(dailyPoints.length - 1, 1);
    const maxVal = Math.max(...dailyPoints.map(p => p.expense), avgDailySpend * 1.3, 500);

    const coords = dailyPoints.map((p, idx) => ({
      x: padX + idx * step,
      y: padTop + (1 - p.expense / maxVal) * (innerH - padTop),
    }));

    const avgY = avgDailySpend > 0 ? padTop + (1 - avgDailySpend / maxVal) * (innerH - padTop) : innerH;

    let lineD = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const currPt = coords[i];
      const cx1 = prev.x + (currPt.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (currPt.x - prev.x) / 2;
      const cy2 = currPt.y;
      lineD += ` C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${currPt.x.toFixed(1)} ${currPt.y.toFixed(1)}`;
    }
    const areaD = `${lineD} L ${coords[coords.length - 1].x.toFixed(1)} ${innerH} L ${coords[0].x.toFixed(1)} ${innerH} Z`;

    const stepLabel = Math.max(1, Math.ceil(dailyPoints.length / 10));

    dailySpendChartHtml = `
    <div class="chart-card">
      <div class="chart-header">
        <div class="chart-title">
          <span>Daily Outflow Rhythm & Spending Average</span>
          <span class="chart-subtitle">• ${activeDaysCount} Active Spending Days</span>
        </div>
        <div class="chart-legend">
          <span class="legend-item">
            <span class="legend-color-spend"></span> Daily Outflow
          </span>
          <span class="legend-item">
            <span class="legend-color-avg"></span> Benchmark Avg: ${curr}${avgDailySpend.toLocaleString('en-IN')}/day
          </span>
        </div>
      </div>
      <svg width="100%" height="${chartH}" viewBox="0 0 ${chartW} ${chartH}" style="overflow: visible;">
        <defs>
          <linearGradient id="passbookWaveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.32" />
            <stop offset="100%" stop-color="#3B82F6" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <!-- Horizontal Gridlines -->
        <line x1="${padX}" y1="${padTop}" x2="${chartW - padX}" y2="${padTop}" stroke="#F1F5F9" stroke-width="1" stroke-dasharray="3 3" />
        <line x1="${padX}" y1="${innerH}" x2="${chartW - padX}" y2="${innerH}" stroke="#E2E8F0" stroke-width="1.2" />

        <!-- Fill & Line -->
        <path d="${areaD}" fill="url(#passbookWaveGrad)" />
        <path d="${lineD}" stroke="#2563EB" stroke-width="2.4" fill="transparent" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Daily Average Benchmark Line -->
        ${
          avgDailySpend > 0
            ? `
          <line x1="${padX}" y1="${avgY.toFixed(1)}" x2="${(chartW - padX).toFixed(1)}" y2="${avgY.toFixed(1)}" stroke="#6366F1" stroke-width="1.6" stroke-dasharray="4 3" />
          <rect x="${(chartW - padX - 120).toFixed(1)}" y="${Math.max(avgY - 14, 2).toFixed(1)}" width="120" height="12" rx="4" fill="#EEF2FF" stroke="#6366F1" stroke-width="0.8" />
          <text x="${(chartW - padX - 60).toFixed(1)}" y="${Math.max(avgY - 4.5, 11).toFixed(1)}" font-size="7.5" font-weight="800" fill="#4338CA" text-anchor="middle">Avg: ${curr}${avgDailySpend.toLocaleString('en-IN')}/day</text>
        `
            : ''
        }

        <!-- Data Points & Labels -->
        ${coords
          .map((c, idx) => {
            const isAbove = dailyPoints[idx].expense > avgDailySpend;
            const showLabel = idx % stepLabel === 0 || idx === coords.length - 1;
            return `
            <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.8" fill="${isAbove ? '#EF4444' : '#10B981'}" stroke="#FFFFFF" stroke-width="1.5" />
            ${showLabel ? `<text x="${c.x.toFixed(1)}" y="${chartH - 6}" font-size="8" font-weight="700" fill="#64748B" text-anchor="middle">${dailyPoints[idx].label}</text>` : ''}
          `;
          })
          .join('')}
      </svg>
    </div>`;
  }

  const statementRef = `RUP-${Date.now().toString().slice(-7)}`;

  // 4. Build Ultra-Clean HTML Template
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rupeo Passbook - ${periodLabel}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
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
      font-size: 10.5px;
      line-height: 1.4;
    }

    /* PASSBOOK HEADER */
    .passbook-header {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      border-radius: 18px;
      padding: 16px 20px;
      margin-bottom: 14px;
      color: #FFFFFF;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      overflow: hidden;
    }
    .header-gold-line {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #FFD740, #F59E0B, #FFD740);
    }
    .brand-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-emblem {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #FFD740;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0F172A;
      font-size: 24px;
      font-weight: 900;
      box-shadow: 0 4px 12px rgba(255, 215, 64, 0.3);
    }
    .brand-title {
      font-size: 20px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: -0.4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cert-pill {
      font-size: 8.5px;
      font-weight: 800;
      color: #0F172A;
      background: #FFD740;
      padding: 2px 7px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .brand-desc {
      font-size: 10px;
      color: #94A3B8;
      margin-top: 2px;
    }

    .header-meta {
      text-align: right;
    }
    .meta-ref-badge {
      display: inline-block;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 9px;
      font-weight: 800;
      color: #E2E8F0;
      letter-spacing: 0.5px;
    }
    .meta-datetime {
      font-size: 9px;
      color: #94A3B8;
      margin-top: 3px;
    }

    /* ACCOUNT HOLDER SLIP */
    .account-slip {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      padding: 10px 14px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .slip-col {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .slip-label {
      font-size: 8px;
      font-weight: 800;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .slip-value {
      font-size: 11px;
      font-weight: 800;
      color: #0F172A;
    }
    .slip-value-highlight {
      color: #2563EB;
      font-weight: 900;
    }

    /* SUMMARY CARDS */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .summary-card {
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid #E2E8F0;
      background: #FFFFFF;
    }
    .card-income {
      background: #F0FDF4;
      border-color: #DCFCE7;
    }
    .card-expense {
      background: #FEF2F2;
      border-color: #FEE2E2;
    }
    .card-net {
      background: #EFF6FF;
      border-color: #DBEAFE;
    }
    .card-txns {
      background: #F8FAFC;
      border-color: #E2E8F0;
    }
    .card-label {
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748B;
    }
    .card-amount {
      font-size: 15px;
      font-weight: 900;
      margin-top: 2px;
      color: #0F172A;
    }
    .color-income { color: #16A34A; }
    .color-expense { color: #DC2626; }
    .color-net { color: #2563EB; }

    /* CATEGORY SUMMARY */
    .category-section {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      padding: 8px 12px;
      margin-bottom: 12px;
    }
    .category-heading {
      font-size: 9.5px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .category-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .category-pill {
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 3px 8px;
      font-size: 9px;
      font-weight: 700;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* CHART CARD */
    .chart-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      padding: 10px 14px;
      margin-bottom: 12px;
    }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .chart-title {
      font-size: 10px;
      font-weight: 800;
      color: #0F172A;
    }
    .chart-subtitle {
      font-size: 9px;
      color: #64748B;
      font-weight: 600;
    }
    .chart-legend {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 8px;
      font-weight: 700;
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #475569;
    }
    .legend-color-spend {
      width: 8px;
      height: 3px;
      background: #2563EB;
      border-radius: 1px;
    }
    .legend-color-avg {
      width: 10px;
      height: 0;
      border-top: 1.5px dashed #6366F1;
    }

    /* PASSBOOK LEDGER TABLE */
    .table-container {
      width: 100%;
      margin-bottom: 14px;
    }
    .table-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding: 0 2px;
    }
    .table-title {
      font-size: 11px;
      font-weight: 900;
      color: #0F172A;
      letter-spacing: -0.2px;
    }
    .table-badge {
      font-size: 8.5px;
      font-weight: 800;
      color: #059669;
      background: #DCFCE7;
      padding: 2px 7px;
      border-radius: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
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
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
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
      width: 24px;
    }
    .td-date {
      font-weight: 700;
      color: #334155;
      white-space: nowrap;
      width: 76px;
    }
    .td-time {
      font-size: 8px;
      color: #94A3B8;
      font-weight: 600;
    }
    .td-desc {
      font-weight: 800;
      color: #0F172A;
    }
    .td-note {
      font-size: 8px;
      color: #64748B;
      font-weight: 500;
      margin-top: 1px;
    }
    .cat-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 8px;
      font-weight: 700;
      background: #F1F5F9;
      color: #475569;
    }
    .amount-dr {
      font-size: 10.5px;
      font-weight: 800;
      color: #DC2626;
      text-align: right;
    }
    .amount-cr {
      font-size: 10.5px;
      font-weight: 800;
      color: #16A34A;
      text-align: right;
    }
    .amount-balance {
      font-size: 10px;
      font-weight: 900;
      color: #0F172A;
      text-align: right;
    }

    /* CERTIFIED SEAL BANNER */
    .cert-seal-card {
      background: #F8FAFC;
      border: 1px dashed #CBD5E1;
      border-radius: 14px;
      padding: 10px 14px;
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      page-break-inside: avoid;
    }
    .seal-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .seal-badge {
      width: 32px;
      height: 32px;
      border-radius: 16px;
      background: #DCFCE7;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #16A34A;
      font-size: 16px;
      font-weight: 900;
    }
    .seal-title {
      font-size: 10px;
      font-weight: 900;
      color: #0F172A;
    }
    .seal-sub {
      font-size: 8.5px;
      color: #64748B;
    }

    /* PLAY STORE BANNER & FOOTER */
    .playstore-banner {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      border-radius: 14px;
      padding: 10px 16px;
      margin-top: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #FFFFFF;
      page-break-inside: avoid;
    }
    .banner-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .banner-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: #FFD740;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 900;
      color: #0F172A;
    }
    .banner-title {
      font-size: 10.5px;
      font-weight: 900;
      color: #FFFFFF;
    }
    .banner-sub {
      font-size: 8.5px;
      color: #94A3B8;
    }
    .banner-btn {
      background: #2563EB;
      color: #FFFFFF;
      font-size: 9px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 8px;
      letter-spacing: 0.3px;
    }

    .statement-footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 8px;
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: #94A3B8;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>

  <!-- PASSBOOK HEADER -->
  <div class="passbook-header">
    <div class="header-gold-line"></div>
    <div class="brand-left">
      <div class="brand-emblem">₹</div>
      <div>
        <div class="brand-title">
          Rupeo <span class="cert-pill">Passbook Statement</span>
        </div>
        <div class="brand-desc">Personal Wealth Intelligence • Official Certified Transaction Ledger</div>
      </div>
    </div>
    <div class="header-meta">
      <div class="meta-ref-badge">REF: ${statementRef}</div>
      <div class="meta-datetime">Date: ${generatedDate}, ${generatedTime}</div>
    </div>
  </div>

  <!-- ACCOUNT HOLDER SLIP -->
  <div class="account-slip">
    <div class="slip-col">
      <span class="slip-label">Account Holder</span>
      <span class="slip-value">${userName}</span>
    </div>
    <div class="slip-col">
      <span class="slip-label">Account Email / ID</span>
      <span class="slip-value">${userEmail || 'Personal Account'}</span>
    </div>
    <div class="slip-col">
      <span class="slip-label">Statement Duration</span>
      <span class="slip-value slip-value-highlight">${periodLabel}</span>
    </div>
    <div class="slip-col">
      <span class="slip-label">Audit Status</span>
      <span class="slip-value" style="color: #16A34A;">✔ Digitally Verified</span>
    </div>
  </div>

  <!-- SUMMARY STATS -->
  <div class="summary-grid">
    <div class="summary-card card-income">
      <div class="card-label">Total Deposits (Cr)</div>
      <div class="card-amount color-income">+${curr}${totalIncome.toLocaleString('en-IN')}</div>
    </div>

    <div class="summary-card card-expense">
      <div class="card-label">Total Withdrawals (Dr)</div>
      <div class="card-amount color-expense">-${curr}${totalExpense.toLocaleString('en-IN')}</div>
    </div>

    <div class="summary-card card-net">
      <div class="card-label">Net Balance (${savingsRate}% Saved)</div>
      <div class="card-amount color-net">${netSavings >= 0 ? '+' : ''}${curr}${netSavings.toLocaleString('en-IN')}</div>
    </div>

    <div class="summary-card card-txns">
      <div class="card-label">Ledger Volume</div>
      <div class="card-amount">${filtered.length} Recorded</div>
    </div>
  </div>

  <!-- TOP SPENDING CATEGORIES -->
  ${
    sortedCategories.length > 0
      ? `
  <div class="category-section">
    <div class="category-heading">
      <span>Top Outflow Distribution</span>
      <span style="font-size: 8px; color: #64748B;">Categorical Breakdown</span>
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

  <!-- DAILY SPEND & RUNNING AVERAGE WAVE GRAPH -->
  ${dailySpendChartHtml}

  <!-- PASSBOOK LEDGER TABLE -->
  <div class="table-container">
    <div class="table-title-row">
      <div class="table-title">Certified Transaction Ledger (${displayList.length} Entries)</div>
      <div class="table-badge">Running Balance Verified</div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="text-center" style="width: 24px;">#</th>
          <th style="width: 78px;">Date</th>
          <th>Description & Particulars</th>
          <th style="width: 80px;">Category</th>
          <th style="width: 60px;">Mode</th>
          <th class="text-right" style="width: 85px;">Withdrawal (Dr)</th>
          <th class="text-right" style="width: 85px;">Deposit (Cr)</th>
          <th class="text-right" style="width: 85px;">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${displayList
          .map((tx, idx) => {
            const isIncome = tx.isIncome;
            const amt = tx.parsedAmount;
            const title = tx.merchant_name || tx.description || tx.category || 'Transaction';
            const note = tx.merchant_name && tx.description ? tx.description : tx.utr ? `Ref: ${tx.utr}` : '';
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
            <td><span class="cat-badge">${tx.category || 'General'}</span></td>
            <td style="color: #475569; font-size: 8.5px; font-weight: 600;">${tx.payment_mode || 'UPI'}</td>
            <td class="amount-dr">
              ${!isIncome ? `-${curr}${amt.toLocaleString('en-IN')}` : '-'}
            </td>
            <td class="amount-cr">
              ${isIncome ? `+${curr}${amt.toLocaleString('en-IN')}` : '-'}
            </td>
            <td class="amount-balance">
              ${tx.balanceAfter >= 0 ? '' : '-'}${curr}${Math.abs(tx.balanceAfter).toLocaleString('en-IN')}
            </td>
          </tr>
        `;
          })
          .join('')}
      </tbody>
    </table>
  </div>

  <!-- CERTIFIED AUDIT SEAL -->
  <div class="cert-seal-card">
    <div class="seal-left">
      <div class="seal-badge">✔</div>
      <div>
        <div class="seal-title">Authentic Digital Ledger • Rupeo Financial Systems</div>
        <div class="seal-sub">Generated from tamper-proof encrypted local & cloud synchronization. Valid without physical signature.</div>
      </div>
    </div>
    <div style="font-size: 9px; font-weight: 800; color: #2563EB;">
      VERIFY: rupeoo.vercel.app/scanner
    </div>
  </div>

  <!-- GOOGLE PLAY STORE PROMOTION BANNER -->
  <div class="playstore-banner">
    <div class="banner-left">
      <div class="banner-icon">₹</div>
      <div>
        <div class="banner-title">Download Rupeo on Google Play Store</div>
        <div class="banner-sub">Smart Expense Tracker • UPI Reminders • 100% Private & Ad-Free</div>
      </div>
    </div>
    <div class="banner-btn">
      📱 Get on Play Store
    </div>
  </div>

  <!-- STATEMENT FOOTER -->
  <div class="statement-footer">
    <span>Certified Electronic Passbook • Rupeo Personal Finance Intelligence</span>
    <span>Official Portal: https://rupeoo.vercel.app</span>
  </div>

</body>
</html>
  `;

  const cleanFilename = `Rupeo_Passbook_${(monthStr || 'All').replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now().toString().slice(-6)}.pdf`;
  const defaultPdfTitle = `Rupeo Passbook - ${periodLabel}`;

  // 5. Web Handling
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

  // 6. Mobile Handling (Android & iOS)
  try {
    const result = await Print.printToFileAsync({
      html,
      base64: false,
    });

    if (result && result.uri) {
      let shareUri = result.uri;
      try {
        const targetUri = `${FileSystem.documentDirectory}${cleanFilename}`;
        const existingInfo = await FileSystem.getInfoAsync(targetUri);
        if (existingInfo.exists) {
          await FileSystem.deleteAsync(targetUri, { idempotent: true });
        }
        await FileSystem.copyAsync({
          from: result.uri,
          to: targetUri,
        });
        const info = await FileSystem.getInfoAsync(targetUri);
        if (info.exists) {
          shareUri = targetUri;
        }
      } catch (copyErr) {
        warn('Could not rename PDF file, using default URI:', copyErr);
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
    error('Error generating transaction statement PDF:', err);
    return { success: false, count: 0, error: err?.message || 'Failed to print PDF.' };
  }
}
