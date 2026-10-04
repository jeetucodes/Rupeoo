import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export interface PDFReportData {
  userName?: string;
  userEmail?: string;
  periodTitle: string;
  curr: string;
  metrics: {
    income: number;
    expense: number;
    net: number;
    savingsRate: number;
    count: number;
    dailyAvg: number;
    avgTxn: number;
  };
  prevPeriodMetrics: {
    prevExpense: number;
    diff: number;
    diffPct: number;
    isHigher: boolean;
    hasPrevData: boolean;
    projectedSpend: number;
  };
  financialHealth: {
    score: number;
    rating: string;
    color: string;
    insights: string[];
  };
  rule503020: {
    needsAmt: number;
    wantsAmt: number;
    savingsAmt: number;
    needsPct: number;
    wantsPct: number;
    savingsPct: number;
  };
  weekendVsWeekday: {
    weekdayTotal: number;
    weekendTotal: number;
    weekdayPct: number;
    weekendPct: number;
    weekdayCount: number;
    weekendCount: number;
  };
  dayOfWeekSpend?: {
    day: string;
    amount: number;
    percentOfMax: number;
  }[];
  categoryBreakdown: {
    name: string;
    amount: number;
    percentage: number;
    color: string;
    count: number;
  }[];
  paymentModesSplit: {
    mode: string;
    amount: number;
    percentage: number;
  }[];
  topExpenses: {
    date: string;
    title?: string;
    category: string;
    amount: number;
  }[];
  dailyTrendPoints?: {
    label: string;
    expense: number;
    income: number;
  }[];
  monthlyTrends?: {
    label: string;
    income: number;
    expense: number;
  }[];
  transactions: {
    date: string;
    title?: string;
    category: string;
    type: string;
    amount: number;
    payment_mode?: string;
  }[];
}

function buildSmoothSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function renderSpendingWaveSvg(
  points: { label: string; expense: number; income: number }[] = [],
  curr: string,
  dailyAvg?: number
): string {
  if (!points || points.length === 0) {
    return `<div style="text-align: center; color: #94A3B8; font-size: 10px; padding: 20px;">No daily trend data available</div>`;
  }

  const width = 680;
  const height = 95;
  const paddingX = 35;
  const paddingTop = 15;
  const paddingBottom = 22;
  const chartHeight = height - paddingBottom;
  const usableWidth = width - paddingX * 2;
  const step = usableWidth / Math.max(points.length - 1, 1);

  const totalExp = points.reduce((sum, p) => sum + p.expense, 0);
  const avgVal = dailyAvg !== undefined && dailyAvg > 0 ? dailyAvg : Math.round(totalExp / Math.max(points.length, 1));
  const maxVal = Math.max(...points.map(p => p.expense), avgVal * 1.25, 500);

  const coords = points.map((p, idx) => ({
    x: paddingX + idx * step,
    y: paddingTop + (1 - p.expense / maxVal) * (chartHeight - paddingTop),
  }));

  const avgY = avgVal > 0 ? paddingTop + (1 - avgVal / maxVal) * (chartHeight - paddingTop) : chartHeight;

  const smoothLineD = buildSmoothSvgPath(coords);
  const smoothAreaD = `${smoothLineD} L ${coords[coords.length - 1].x.toFixed(1)} ${chartHeight} L ${coords[0].x.toFixed(1)} ${chartHeight} Z`;

  let maxIdx = 0;
  points.forEach((p, idx) => {
    if (p.expense > points[maxIdx].expense) maxIdx = idx;
  });
  const peakCoord = coords[maxIdx];
  const peakPoint = points[maxIdx];

  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
      <defs>
        <linearGradient id="waveAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFD740" stop-opacity="0.45" />
          <stop offset="70%" stop-color="#FFD740" stop-opacity="0.1" />
          <stop offset="100%" stop-color="#FFD740" stop-opacity="0.0" />
        </linearGradient>
        <linearGradient id="waveLineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#F59E0B" />
          <stop offset="50%" stop-color="#D97706" />
          <stop offset="100%" stop-color="#B45309" />
        </linearGradient>
      </defs>

      <!-- Guidelines -->
      <line x1="${paddingX}" y1="${paddingTop}" x2="${width - paddingX}" y2="${paddingTop}" stroke="#F1F5F9" stroke-width="1" stroke-dasharray="3 3" />
      <line x1="${paddingX}" y1="${(paddingTop + chartHeight) / 2}" x2="${width - paddingX}" y2="${(paddingTop + chartHeight) / 2}" stroke="#F1F5F9" stroke-width="1" stroke-dasharray="3 3" />
      <line x1="${paddingX}" y1="${chartHeight}" x2="${width - paddingX}" y2="${chartHeight}" stroke="#E2E8F0" stroke-width="1" />

      <!-- Area & Line -->
      <path d="${smoothAreaD}" fill="url(#waveAreaGrad)" />
      <path d="${smoothLineD}" stroke="url(#waveLineGrad)" stroke-width="2.5" fill="transparent" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Daily Average Benchmark Line & Tag -->
      ${
        avgVal > 0
          ? `
        <line x1="${paddingX}" y1="${avgY.toFixed(1)}" x2="${(width - paddingX).toFixed(1)}" y2="${avgY.toFixed(1)}" stroke="#6366F1" stroke-width="1.8" stroke-dasharray="4 3" />
        <rect x="${(width - paddingX - 112).toFixed(1)}" y="${Math.max(avgY - 14, 2).toFixed(1)}" width="112" height="12" rx="3" fill="#EEF2FF" stroke="#6366F1" stroke-width="0.8" />
        <text x="${(width - paddingX - 56).toFixed(1)}" y="${Math.max(avgY - 4.5, 11).toFixed(1)}" font-size="7.5" font-weight="800" fill="#4338CA" text-anchor="middle">Daily Avg: ${curr}${avgVal.toLocaleString('en-IN')}</text>
      `
          : ''
      }

      <!-- Points -->
      ${coords
        .map(
          (c, idx) => {
            const isAbove = points[idx].expense > avgVal;
            const isZero = points[idx].expense === 0;
            const dotFill = isAbove ? '#F59E0B' : isZero ? '#E2E8F0' : '#10B981';
            return `
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="${dotFill}" stroke="#FFFFFF" stroke-width="1.5" />
        <text x="${c.x.toFixed(1)}" y="${height - 6}" font-size="8.5" font-weight="700" fill="#64748B" text-anchor="middle">${points[idx].label.split(' ')[0]}</text>
      `;
          }
        )
        .join('')}

      <!-- Peak Pill -->
      ${
        peakPoint && peakPoint.expense > 0
          ? `
        <rect x="${(peakCoord.x - 36).toFixed(1)}" y="${(peakCoord.y - 14).toFixed(1)}" width="72" height="11" rx="3" fill="#FEF3C7" stroke="#F59E0B" stroke-width="0.8" />
        <text x="${peakCoord.x.toFixed(1)}" y="${(peakCoord.y - 5.5).toFixed(1)}" font-size="7.5" font-weight="800" fill="#92400E" text-anchor="middle">Peak: ${curr}${peakPoint.expense.toLocaleString('en-IN')}</text>
      `
          : ''
      }
    </svg>
  `;
}

function renderCashFlowTrendsSvg(
  trends: { label: string; income: number; expense: number }[] = [],
  curr: string
): string {
  if (!trends || trends.length === 0) {
    return `<div style="text-align: center; color: #94A3B8; font-size: 10px; padding: 20px;">No cash flow trend data available</div>`;
  }

  const width = 680;
  const height = 100;
  const paddingX = 20;
  const paddingTop = 14;
  const paddingBottom = 22;
  const chartHeight = height - paddingBottom;
  const usableWidth = width - paddingX * 2;
  const gap = usableWidth / Math.max(trends.length, 1);
  const barWidth = Math.min(Math.max(gap * 0.3, 14), 22);
  const maxVal = Math.max(...trends.map(t => Math.max(t.income, t.expense)), 1000);

  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
      <defs>
        <linearGradient id="pdfIncomeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10B981" />
          <stop offset="100%" stop-color="#059669" />
        </linearGradient>
        <linearGradient id="pdfExpenseGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#EF4444" />
          <stop offset="100%" stop-color="#DC2626" />
        </linearGradient>
      </defs>

      <!-- Guidelines -->
      <line x1="${paddingX}" y1="${paddingTop}" x2="${width - paddingX}" y2="${paddingTop}" stroke="#F1F5F9" stroke-width="1" stroke-dasharray="3 3" />
      <line x1="${paddingX}" y1="${(paddingTop + chartHeight) / 2}" x2="${width - paddingX}" y2="${(paddingTop + chartHeight) / 2}" stroke="#F1F5F9" stroke-width="1" stroke-dasharray="3 3" />
      <line x1="${paddingX}" y1="${chartHeight}" x2="${width - paddingX}" y2="${chartHeight}" stroke="#E2E8F0" stroke-width="1" />

      <!-- Comparative Bars -->
      ${trends
        .map((t, idx) => {
          const xCenter = paddingX + idx * gap + gap / 2;
          const incH = (t.income / maxVal) * (chartHeight - paddingTop);
          const expH = (t.expense / maxVal) * (chartHeight - paddingTop);
          const xInc = xCenter - barWidth - 1.5;
          const xExp = xCenter + 1.5;
          const yInc = chartHeight - incH;
          const yExp = chartHeight - expH;

          return `
          <g>
            <!-- Income Bar -->
            <rect x="${xInc.toFixed(1)}" y="${yInc.toFixed(1)}" width="${barWidth}" height="${Math.max(incH, 2).toFixed(1)}" rx="3" fill="url(#pdfIncomeGrad)" />
            ${t.income > 0 ? `<text x="${(xInc + barWidth / 2).toFixed(1)}" y="${(yInc - 3).toFixed(1)}" font-size="7" font-weight="800" fill="#16A34A" text-anchor="middle">+${curr}${t.income >= 1000 ? Math.round(t.income / 1000) + 'k' : t.income}</text>` : ''}

            <!-- Expense Bar -->
            <rect x="${xExp.toFixed(1)}" y="${yExp.toFixed(1)}" width="${barWidth}" height="${Math.max(expH, 2).toFixed(1)}" rx="3" fill="url(#pdfExpenseGrad)" />
            ${t.expense > 0 ? `<text x="${(xExp + barWidth / 2).toFixed(1)}" y="${(yExp - 3).toFixed(1)}" font-size="7" font-weight="800" fill="#DC2626" text-anchor="middle">-${curr}${t.expense >= 1000 ? Math.round(t.expense / 1000) + 'k' : t.expense}</text>` : ''}

            <!-- Month Label -->
            <text x="${xCenter.toFixed(1)}" y="${height - 6}" font-size="9" font-weight="700" fill="#475569" text-anchor="middle">${t.label}</text>
          </g>
        `;
        })
        .join('')}
    </svg>
  `;
}

function renderExpenseBreakdownHtml(
  categories: { name: string; amount: number; percentage: number; color: string; count: number }[] = [],
  curr: string,
  totalExpense: number
): string {
  if (!categories || categories.length === 0) {
    return `<div style="text-align: center; color: #94A3B8; font-size: 10px; padding: 15px;">No category expenses recorded</div>`;
  }

  const topCats = categories.slice(0, 6);
  const size = 118;
  const strokeWidth = 17;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;

  const circles = categories
    .filter(c => c.percentage > 0)
    .map(cat => {
      const strokeLength = (circumference * cat.percentage) / 100;
      const currentOffset = accumulatedOffset;
      accumulatedOffset += strokeLength;

      return `
        <circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          stroke="${cat.color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${Math.max(strokeLength, 0.5).toFixed(2)} ${circumference.toFixed(2)}"
          stroke-dashoffset="${(-currentOffset).toFixed(2)}"
          fill="transparent"
        />
      `;
    })
    .join('');

  return `
    <!-- Top Segmented Proportional Color Bar -->
    <div class="bar-track" style="height: 6px; border-radius: 3px; margin: 3px 0 8px 0;">
      ${categories.map(c => `<div class="bar-segment" style="width: ${Math.max(c.percentage, 1.2)}%; background: ${c.color};" title="${c.name}"></div>`).join('')}
    </div>

    <!-- Donut Chart & Category Breakdown Row -->
    <div style="display: flex; align-items: center; gap: 12px;">
      <!-- Circular Donut SVG with Slices & Center Metric -->
      <div style="flex-shrink: 0; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; background: #FFFFFF; border-radius: 10px; border: 1px solid #F1F5F9; padding: 2px;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <g transform="rotate(-90 ${size / 2} ${size / 2})">
            ${circles}
          </g>
          <!-- Center Text -->
          <text x="${size / 2}" y="${size / 2 - 11}" font-size="7" font-weight="800" fill="#64748B" text-anchor="middle" letter-spacing="0.4">TOTAL SPENT</text>
          <text x="${size / 2}" y="${size / 2 + 4}" font-size="11.5" font-weight="900" fill="#0F172A" text-anchor="middle">${curr}${totalExpense.toLocaleString('en-IN')}</text>
          <text x="${size / 2}" y="${size / 2 + 15}" font-size="6.5" font-weight="700" fill="#94A3B8" text-anchor="middle">${categories.length} Categories</text>
        </svg>
      </div>

      <!-- Categories 2-Column Grid (Top 6) -->
      <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
        ${topCats
          .map(
            c => `
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 4px 7px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
              <div style="display: flex; align-items: center; gap: 4px; overflow: hidden;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 3px; background: ${c.color}; flex-shrink: 0;"></span>
                <span style="font-weight: 800; font-size: 9px; color: #0F172A; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 80px;">${c.name}</span>
              </div>
              <span style="font-weight: 900; font-size: 9.5px; color: #0F172A; flex-shrink: 0; margin-left: 3px;">${curr}${c.amount.toLocaleString('en-IN')}</span>
            </div>
            <!-- Mini Progress bar -->
            <div style="height: 3px; background: #E2E8F0; border-radius: 1.5px; overflow: hidden; margin: 1px 0;">
              <div style="width: ${Math.min(c.percentage, 100)}%; height: 100%; background: ${c.color}; border-radius: 1.5px;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 7.5px; color: #64748B;">
              <span>${c.percentage}% share</span>
              <span>${c.count} txns</span>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

export async function generateAndShareFinancialReportPDF(data: PDFReportData): Promise<void> {
  const {
    userName = 'Rupeo User',
    userEmail = '',
    periodTitle,
    curr,
    metrics,
    prevPeriodMetrics,
    financialHealth,
    rule503020,
    weekendVsWeekday,
    dayOfWeekSpend = [],
    categoryBreakdown = [],
    paymentModesSplit = [],
    topExpenses = [],
    transactions = [],
    dailyTrendPoints = [],
    monthlyTrends = [],
  } = data;

  const generatedDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const generatedTime = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rupeo Financial Report - ${periodTitle}</title>
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
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #0F172A;
      background: #FFFFFF;
      font-size: 11.5px;
      line-height: 1.4;
    }

    /* Suppress any injected extension badges or watermarks */
    div[class*="adobe"], div[id*="adobe"],
    div[class*="acrobat"], div[id*="acrobat"],
    div[style*="z-index: 2147483647"],
    div[style*="z-index: 999999"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }

    /* SEPARATE PAGES - STRICT A4 BREAKS */
    .page {
      width: 100%;
      min-height: 270mm;
      max-height: 270mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-before: always;
      break-before: page;
      page-break-inside: avoid;
      break-inside: avoid;
      padding: 4mm 0 2mm 0;
      overflow: hidden;
    }
    .page:first-of-type {
      page-break-before: avoid;
      break-before: avoid;
    }

    /* HEADER */
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 10px;
      border-bottom: 2px solid #E2E8F0;
      margin-bottom: 12px;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 900;
      color: #0F172A;
      letter-spacing: -0.4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-badge {
      font-size: 9px;
      font-weight: 800;
      color: #B45309;
      background: #FEF3C7;
      padding: 2px 7px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .report-subtitle {
      font-size: 10.5px;
      color: #64748B;
      margin-top: 2px;
    }
    .meta-box {
      text-align: right;
      font-size: 10px;
      color: #64748B;
    }
    .meta-period {
      font-size: 12.5px;
      font-weight: 800;
      color: #0F172A;
    }

    /* CARDS & GRIDS */
    .hero-card {
      background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%);
      border: 1px solid #C7D2FE;
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    .hero-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hero-label {
      font-size: 9.5px;
      font-weight: 800;
      color: #4338CA;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .hero-badge {
      background: #4338CA;
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 10px;
    }
    .hero-amount {
      font-size: 26px;
      font-weight: 900;
      color: #1E1B4B;
      margin-top: 3px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 10px;
    }
    .stat-pill {
      background: #FFFFFF;
      border-radius: 8px;
      padding: 8px 10px;
      border: 1px solid #E2E8F0;
    }
    .stat-label {
      font-size: 9px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
    }
    .stat-value {
      font-size: 15px;
      font-weight: 800;
      color: #0F172A;
      margin-top: 2px;
    }
    .val-income { color: #16A34A; }
    .val-expense { color: #DC2626; }

    /* SECTION CARD */
    .section-box {
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 11px;
      background: #FFFFFF;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 2px;
    }
    .section-desc {
      font-size: 10px;
      color: #64748B;
      margin-bottom: 8px;
    }

    /* VELOCITY / PACE */
    .velocity-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      background: #F8FAFC;
      border-radius: 8px;
      padding: 9px 12px;
    }

    /* 50 / 30 / 20 PROGRESS */
    .bar-track {
      display: flex;
      height: 10px;
      border-radius: 5px;
      overflow: hidden;
      background: #F1F5F9;
      margin: 8px 0;
      gap: 2px;
    }
    .bar-segment {
      height: 100%;
      border-radius: 3px;
    }
    .rule-cols {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .rule-col {
      background: #F8FAFC;
      border-radius: 6px;
      padding: 7px 9px;
      border-left: 3px solid #CBD5E1;
    }

    /* TABLES */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    th {
      background: #F8FAFC;
      text-align: left;
      padding: 7px 8px;
      font-size: 9.5px;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      border-bottom: 1.5px solid #E2E8F0;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #F1F5F9;
      color: #1E293B;
    }
    tr:nth-child(even) td {
      background: #FAFAFA;
    }
    .text-right { text-align: right; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
    }
    .badge-expense { background: #FEE2E2; color: #DC2626; }
    .badge-income { background: #DCFCE7; color: #16A34A; }

    /* FOOTER */
    .page-footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94A3B8;
      margin-top: auto;
    }
  </style>
</head>
<body>

  <!-- ==================== PAGE 1: EXECUTIVE DASHBOARD & CASH FLOW ==================== -->
  <div class="page">
    <div>
      <div class="header-bar">
        <div>
          <div class="brand-title">
            Rupeo <span class="brand-badge">Financial Intelligence</span>
          </div>
          <div class="report-subtitle">Official Statement & Cash Flow Overview</div>
          <div style="font-size: 10px; color: #475569; margin-top: 3px;">
            Account: <strong>${userName}</strong> ${userEmail ? `(${userEmail})` : ''}
          </div>
        </div>
        <div class="meta-box">
          <div class="meta-period">${periodTitle}</div>
          <div>Date: ${generatedDate} ${generatedTime}</div>
          <div style="color: #0F172A; font-weight: 700; margin-top: 1px;">PAGE 1 OF 3 • CONFIDENTIAL</div>
        </div>
      </div>

      <!-- HERO NET SAVINGS CARD -->
      <div class="hero-card">
        <div class="hero-row">
          <span class="hero-label">✦ Net Savings for Period</span>
          <span class="hero-badge">${metrics.savingsRate}% Saved</span>
        </div>
        <div class="hero-amount">
          ${metrics.net >= 0 ? '+' : ''}${curr}${metrics.net.toLocaleString('en-IN')}
        </div>
        <div class="grid-3">
          <div class="stat-pill">
            <div class="stat-label">Total Income</div>
            <div class="stat-value val-income">+${curr}${metrics.income.toLocaleString('en-IN')}</div>
          </div>
          <div class="stat-pill">
            <div class="stat-label">Total Expense</div>
            <div class="stat-value val-expense">-${curr}${metrics.expense.toLocaleString('en-IN')}</div>
          </div>
          <div class="stat-pill">
            <div class="stat-label">Daily Average Spend</div>
            <div class="stat-value">${curr}${metrics.dailyAvg.toLocaleString('en-IN')}/day</div>
          </div>
        </div>
      </div>

      <!-- CASH FLOW TRENDS: INCOME VS EXPENSE COMPARISON -->
      <div class="section-box" style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <div>
            <div class="section-title">Cash Flow Trends • Income vs Expense Comparison</div>
            <div class="section-desc" style="margin-bottom: 0;">Comparative trajectory of inflows versus outflows</div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; font-size: 10px; font-weight: 800;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 4px; background: #10B981;"></span>
              <span style="color: #10B981;">Income</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 4px; background: #EF4444;"></span>
              <span style="color: #EF4444;">Expense</span>
            </div>
          </div>
        </div>
        ${renderCashFlowTrendsSvg(monthlyTrends, curr)}
      </div>

      <!-- VELOCITY & FINANCIAL VITALITY 2-COLUMN GRID -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <!-- SPENDING VELOCITY & PACE -->
        <div class="section-box" style="margin-bottom: 0;">
          <div class="section-title">Spending Velocity & Pace</div>
          <div class="section-desc" style="margin-bottom: 6px;">Comparison against prior run-rate</div>
          <div style="background: #F8FAFC; border-radius: 8px; padding: 8px 10px;">
            <div class="stat-label">Projected Month-End Spend</div>
            <div style="font-size: 15px; font-weight: 900; color: #0F172A; margin-top: 2px;">
              ${curr}${prevPeriodMetrics.projectedSpend.toLocaleString('en-IN')}
            </div>
            <div style="font-size: 9px; color: #64748B; margin-top: 1px;">
              At ${curr}${metrics.dailyAvg.toLocaleString('en-IN')}/day current pace
            </div>

            <div style="border-top: 1px solid #E2E8F0; margin: 6px 0; padding-top: 6px;">
              <div class="stat-label">Prior Period Expense</div>
              <div style="font-size: 13px; font-weight: 800; color: #0F172A; margin-top: 1px;">
                ${curr}${prevPeriodMetrics.prevExpense.toLocaleString('en-IN')}
              </div>
              <div style="font-size: 9px; color: ${prevPeriodMetrics.isHigher ? '#DC2626' : '#16A34A'}; font-weight: 700; margin-top: 1px;">
                ${prevPeriodMetrics.hasPrevData
                  ? `${prevPeriodMetrics.diffPct}% ${prevPeriodMetrics.isHigher ? 'more' : 'less'} spending`
                  : 'Initial recorded period'}
              </div>
            </div>
          </div>
        </div>

        <!-- FINANCIAL VITALITY & AI INSIGHTS -->
        <div class="section-box" style="border-left: 4px solid ${financialHealth.color}; margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div class="section-title" style="margin-bottom: 0;">Financial Vitality Rating</div>
            <span style="background: ${financialHealth.color}15; color: ${financialHealth.color}; font-weight: 800; padding: 2px 8px; border-radius: 8px; font-size: 10px;">
              ${financialHealth.score}/100 • ${financialHealth.rating}
            </span>
          </div>
          <div style="margin-top: 6px;">
            ${financialHealth.insights
              .slice(0, 3)
              .map(
                ins => `
              <div style="display: flex; align-items: flex-start; gap: 5px; margin-bottom: 5px; font-size: 10px; color: #334155;">
                <span style="color: ${financialHealth.color}; font-size: 11px;">✔</span>
                <span>${ins}</span>
              </div>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="page-footer">
      <span>Rupeo Financial Reports • Page 1 of 3</span>
      <span>Automated Wealth Intelligence • https://rupeoo.vercel.app/download</span>
    </div>
  </div>

  <!-- ==================== PAGE 2: SPENDING WAVE & EXPENSE BREAKDOWN ==================== -->
  <div class="page">
    <div>
      <div class="header-bar">
        <div>
          <div class="brand-title">Rupeo <span class="brand-badge">Spending Dynamics</span></div>
          <div class="report-subtitle">Spending Wave Trajectory & Categorical Expense Breakdown</div>
        </div>
        <div class="meta-box">
          <div class="meta-period">${periodTitle}</div>
          <div style="color: #0F172A; font-weight: 700;">PAGE 2 OF 3</div>
        </div>
      </div>

      <!-- SPENDING WAVE (DAILY OUTFLOW TRAJECTORY & DAILY AVERAGE BENCHMARK) -->
      <div class="section-box" style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <div>
            <div class="section-title">Spending Wave • Daily Outflow & Daily Average</div>
            <div class="section-desc" style="margin-bottom: 0;">Daily cadence of expenditures compared against your daily average run-rate</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-flex; align-items: center; gap: 3px; font-size: 8px; font-weight: 700; color: #D97706; background: #FFFBEB; padding: 2px 6px; border-radius: 4px; border: 1px solid #FDE68A;">
              <span style="width: 7px; height: 3px; background: #F59E0B; border-radius: 1px;"></span> Daily Spend
            </span>
            <span style="display: inline-flex; align-items: center; gap: 3px; font-size: 8px; font-weight: 800; color: #4338CA; background: #EEF2FF; padding: 2px 6px; border-radius: 4px; border: 1px solid #C7D2FE;">
              <span style="width: 8px; height: 0; border-top: 1.5px dashed #6366F1;"></span> Daily Avg (${curr}${metrics.dailyAvg.toLocaleString('en-IN')})
            </span>
          </div>
        </div>
        ${renderSpendingWaveSvg(dailyTrendPoints, curr, metrics.dailyAvg)}
      </div>

      <!-- EXPENSE BREAKDOWN (CATEGORY DISTRIBUTION & DONUT SLICES) -->
      <div class="section-box" style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <div>
            <div class="section-title">Expense Breakdown</div>
            <div class="section-desc" style="margin-bottom: 0;">Tap on any slice to inspect category share • Categorical Distribution</div>
          </div>
          <div>
            <span style="background: #EEF2FF; border: 1px solid #C7D2FE; color: #4338CA; font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 6px;">
              ✦ Category Share
            </span>
          </div>
        </div>
        ${renderExpenseBreakdownHtml(categoryBreakdown, curr, metrics.expense)}
      </div>

      <!-- 50 / 30 / 20 BUDGET RULE COMPLIANCE -->
      <div class="section-box" style="margin-bottom: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div class="section-title">50 / 30 / 20 Budget Rule Compliance</div>
            <div class="section-desc">Needs (Target 50%) • Wants (Target 30%) • Savings (Target 20%)</div>
          </div>
          <span style="font-size: 10px; font-weight: 800; background: #F1F5F9; padding: 2px 7px; border-radius: 6px;">
            ${rule503020.needsPct <= 55 && rule503020.savingsPct >= 15 ? 'Balanced 🎯' : 'Review Recommended ⚠️'}
          </span>
        </div>

        <div class="bar-track">
          <div class="bar-segment" style="width: ${Math.max(rule503020.needsPct, 2)}%; background: #3B82F6;"></div>
          <div class="bar-segment" style="width: ${Math.max(rule503020.wantsPct, 2)}%; background: #F59E0B;"></div>
          <div class="bar-segment" style="width: ${Math.max(rule503020.savingsPct, 2)}%; background: #10B981;"></div>
        </div>

        <div class="rule-cols">
          <div class="rule-col" style="border-left-color: #3B82F6;">
            <div class="stat-label" style="color: #2563EB;">Needs (50% Goal)</div>
            <div style="font-size: 13.5px; font-weight: 800; color: #0F172A; margin-top: 2px;">
              ${curr}${rule503020.needsAmt.toLocaleString('en-IN')}
            </div>
            <div style="font-size: 9.5px; color: #64748B;">${rule503020.needsPct}% of budget</div>
          </div>

          <div class="rule-col" style="border-left-color: #F59E0B;">
            <div class="stat-label" style="color: #D97706;">Wants (30% Goal)</div>
            <div style="font-size: 13.5px; font-weight: 800; color: #0F172A; margin-top: 2px;">
              ${curr}${rule503020.wantsAmt.toLocaleString('en-IN')}
            </div>
            <div style="font-size: 9.5px; color: #64748B;">${rule503020.wantsPct}% of budget</div>
          </div>

          <div class="rule-col" style="border-left-color: #10B981;">
            <div class="stat-label" style="color: #059669;">Savings (20% Goal)</div>
            <div style="font-size: 13.5px; font-weight: 800; color: #0F172A; margin-top: 2px;">
              ${curr}${rule503020.savingsAmt.toLocaleString('en-IN')}
            </div>
            <div style="font-size: 9.5px; color: #64748B;">${rule503020.savingsPct}% saved rate</div>
          </div>
        </div>
      </div>
    </div>

    <div class="page-footer">
      <span>Rupeo Financial Reports • Page 2 of 3</span>
      <span>Automated Wealth Intelligence • https://rupeoo.vercel.app/download</span>
    </div>
  </div>

  <!-- ==================== PAGE 3: BEHAVIORAL AUDIT & CERTIFIED LEDGER ==================== -->
  <div class="page">
    <div>
      <div class="header-bar">
        <div>
          <div class="brand-title">Rupeo <span class="brand-badge">Financial Ledger</span></div>
          <div class="report-subtitle">Behavioral Rhythms & Itemized Audit Trail</div>
        </div>
        <div class="meta-box">
          <div class="meta-period">${periodTitle}</div>
          <div style="color: #0F172A; font-weight: 700;">PAGE 3 OF 3</div>
        </div>
      </div>

      <!-- WEEKEND VS WEEKDAY & PAYMENT MODES (2 COLUMNS) -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
        <div class="section-box" style="margin-bottom: 0;">
          <div class="section-title">Weekend vs Weekday Flow</div>
          <div class="section-desc">Spending cadence through the week</div>
          <div style="margin-top: 4px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="font-weight: 700; color: #1E293B;">Weekdays (Mon-Fri)</span>
              <span style="font-weight: 800;">${curr}${weekendVsWeekday.weekdayTotal.toLocaleString('en-IN')} (${weekendVsWeekday.weekdayPct}%)</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
              <span style="font-weight: 700; color: #1E293B;">Weekends (Sat-Sun)</span>
              <span style="font-weight: 800; color: #D97706;">${curr}${weekendVsWeekday.weekendTotal.toLocaleString('en-IN')} (${weekendVsWeekday.weekendPct}%)</span>
            </div>
            <div style="font-size: 9px; color: #64748B; background: #F8FAFC; padding: 4px 6px; border-radius: 6px;">
              ${weekendVsWeekday.weekendPct >= 50 ? 'Weekend Intensive: Majority of spending occurs on weekends.' : 'Weekday Intensive: Workday expenses drive your financial outflow.'}
            </div>
          </div>
        </div>

        <div class="section-box" style="margin-bottom: 0;">
          <div class="section-title">Payment Methods</div>
          <div class="section-desc">Distribution of payment modes used</div>
          <div style="margin-top: 4px;">
            ${paymentModesSplit
              .slice(0, 4)
              .map(
                pm => `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 10px;">
                <span style="font-weight: 700; color: #334155;">${pm.mode}</span>
                <span style="font-weight: 800; color: #0F172A;">${curr}${pm.amount.toLocaleString('en-IN')} <span style="color: #64748B; font-size: 9px;">(${pm.percentage}%)</span></span>
              </div>`
              )
              .join('')}
          </div>
        </div>
      </div>

      <!-- DAY-OF-WEEK SPENDING BARS -->
      ${
        dayOfWeekSpend.length > 0
          ? `
      <div class="section-box" style="margin-bottom: 10px;">
        <div class="section-title">Day-of-Week Spending Rhythm</div>
        <div class="section-desc">Concentration of spending across each day of the week</div>
        <div style="display: flex; align-items: flex-end; justify-content: space-between; height: 46px; padding: 0 10px; margin-top: 2px;">
          ${dayOfWeekSpend
            .map(
              d => `
            <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
              <div style="font-size: 8px; color: #64748B; margin-bottom: 1px;">${d.amount > 0 ? curr + d.amount : ''}</div>
              <div style="width: 22px; height: 26px; background: #F1F5F9; border-radius: 4px; display: flex; align-items: flex-end; overflow: hidden;">
                <div style="width: 100%; height: ${Math.max(d.percentOfMax, 8)}%; background: ${d.percentOfMax >= 80 ? '#F59E0B' : '#0F172A'}; border-radius: 4px;"></div>
              </div>
              <div style="font-size: 9px; font-weight: 700; color: #475569; margin-top: 2px;">${d.day}</div>
            </div>`
            )
            .join('')}
        </div>
      </div>`
          : ''
      }

      <!-- TOP LARGEST EXPENSES -->
      <div class="section-box" style="margin-bottom: 10px;">
        <div class="section-title">Top Largest Expenses</div>
        <div class="section-desc">Significant individual outflows during this period</div>
        <table>
          <thead>
            <tr>
              <th style="width: 25px;">#</th>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${topExpenses
              .slice(0, 3)
              .map(
                (tx, idx) => `
              <tr>
                <td style="font-weight: 800; color: #94A3B8;">${idx + 1}</td>
                <td>${tx.date}</td>
                <td style="font-weight: 700;">${tx.title || tx.category}</td>
                <td><span class="badge badge-expense">${tx.category}</span></td>
                <td class="text-right" style="font-weight: 800; color: #DC2626;">-${curr}${Math.abs(tx.amount).toLocaleString('en-IN')}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- ITEMIZED TRANSACTIONS LOG -->
      <div class="section-box" style="padding: 10px; margin-bottom: 0;">
        <div class="section-title" style="padding: 2px 4px;">Itemized Transactions Log (${transactions.length} Total)</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Mode</th>
              <th>Type</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${transactions
              .slice(0, 10)
              .map(
                tx => `
              <tr>
                <td>${tx.date}</td>
                <td style="font-weight: 700;">${tx.title || tx.category}</td>
                <td>${tx.category}</td>
                <td style="color: #64748B;">${tx.payment_mode || 'UPI'}</td>
                <td><span class="badge ${tx.type === 'income' ? 'badge-income' : 'badge-expense'}">${tx.type}</span></td>
                <td class="text-right" style="font-weight: 800; color: ${tx.type === 'income' ? '#16A34A' : '#DC2626'};">
                  ${tx.type === 'income' ? '+' : '-'}${curr}${Math.abs(tx.amount).toLocaleString('en-IN')}
                </td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
        ${transactions.length > 10 ? `<div style="text-align: center; color: #64748B; font-size: 9px; margin-top: 4px;">(Showing 10 itemized transactions. For full raw audit list, export CSV).</div>` : ''}
      </div>
    </div>

    <div class="page-footer">
      <span>Rupeo Financial Reports • Page 3 of 3</span>
      <span>Generated by Rupeo Financial Intelligence • Certified Official Ledger</span>
    </div>
  </div>

</body>
</html>
`;

  const defaultPdfTitle = `Rupeo Report ${periodTitle}`;
  const cleanFilename = `Rupeo_Report_${periodTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now().toString().slice(-6)}.pdf`;

  // Handle Web environment (Print ONLY the report HTML via hidden iframe, avoiding screen/modal capture)
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      const originalTitle = document.title;
      document.title = defaultPdfTitle; // Browser default "Save as PDF" filename!

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
            document.title = originalTitle; // Restore original window title
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 3000);
        }, 500);
        return;
      }
    }
    return;
  }

  // Handle Mobile (Android & iOS)
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
    } catch (err) {
      console.warn('Could not rename PDF file, using default URI', err);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: defaultPdfTitle,
        UTI: 'com.adobe.pdf',
      });
    }
  }
}
