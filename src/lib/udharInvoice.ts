import { Platform, Linking, NativeModules } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { FriendSummary, UdharEntry, getDynamicEntryAmount } from './udharStorage';

export interface GroupedEntryInvoiceData {
  parent: UdharEntry;
  children: UdharEntry[];
  settlementChildren: UdharEntry[];
  interestChildren: UdharEntry[];
  totalInterest: number;
  effectiveAmount: number;
  totalSettled: number;
  remaining: number;
  isFullySettled: boolean;
  isPartiallySettled: boolean;
}

export interface UdharInvoiceOptions {
  mode: 'single' | 'all';
  friend: FriendSummary;
  userName?: string;
  userPhone?: string;
  upiId?: string;
  curr?: string;
  singleGroup?: GroupedEntryInvoiceData;
  allGroups?: GroupedEntryInvoiceData[];
  netBalance?: number;
}

/**
 * Format currency amount with commas
 */
function formatAmt(val: number, curr: string = '₹'): string {
  const rounded = Math.round((val + Number.EPSILON) * 100) / 100;
  return `${curr}${rounded.toLocaleString('en-IN', { minimumFractionDigits: rounded % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format date display
 */
function formatDate(dateStr?: string): string {
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
  } catch { }
  return dateStr;
}

/**
 * Helper to get clean initials from a person or company name
 */
export function getInitials(name: string): string {
  if (!name) return 'R';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Generate formatted WhatsApp breakdown text with executive fintech styling
 */
export function generateUdharInvoiceWhatsAppText(options: UdharInvoiceOptions): string {
  const {
    mode,
    friend,
    userName = 'Rupeo User',
    upiId = '',
    curr = '₹',
    singleGroup,
    allGroups = [],
    netBalance = 0,
  } = options;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const invNo = `RUP-INV-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  if (mode === 'single' && singleGroup) {
    const { parent, settlementChildren, interestChildren, totalInterest, totalSettled, remaining, isFullySettled, isPartiallySettled } = singleGroup;
    const isGave = parent.type === 'gave';
    const mainAction = isGave ? 'Money Lent (उधार दिया)' : 'Money Borrowed (उधार लिया)';
    const statusIcon = isFullySettled ? '✅' : isPartiallySettled ? '⏳' : '📌';
    const statusLabel = isFullySettled ? 'FULLY SETTLED (चुकता)' : isPartiallySettled ? 'PARTIALLY SETTLED' : 'ACTIVE LOAN';

    let interestLines = '';
    if (interestChildren.length > 0 && totalInterest > 0) {
      interestLines = interestChildren.map((ic) => {
        const rateStr = ic.interestPercent ? `${ic.interestPercent}%${ic.interestPeriod === 'monthly' ? '/mo' : ic.interestPeriod === 'yearly' ? '/yr' : ''}` : '';
        const dynAmt = getDynamicEntryAmount(ic);
        const startStr = ic.interestStartDate ? ` from ${formatDate(ic.interestStartDate)}` : '';
        return `  • Interest (${rateStr}${startStr}): *+${formatAmt(dynAmt, curr)}*`;
      }).join('\n');
    }

    let settlementLines = '';
    if (settlementChildren.length > 0) {
      settlementLines = settlementChildren.map((sc) => {
        const modeStr = sc.paymentMode ? ` [${sc.paymentMode}]` : '';
        return `  • ${formatDate(sc.date)}${modeStr}: *-${formatAmt(sc.amount, curr)}*`;
      }).join('\n');
    }

    return [
      `🏛️ *RUPEO DIGITAL KHATA — OFFICIAL INVOICE*`,
      `📄 *Ref No:* \`#${invNo}\``,
      `📅 *Date:* ${dateStr} at ${timeStr}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *PARTY (DEBTOR):* ${friend.name}${friend.phone ? ` (${friend.phone})` : ''}`,
      `💼 *ISSUED BY (CREDITOR):* ${userName}`,
      upiId ? `💳 *Lender UPI:* \`${upiId}\`` : '',
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📌 *LOAN PARTICULARS:*`,
      `• *Category:* ${mainAction}`,
      `• *Issue Date:* ${formatDate(parent.date)}`,
      `• *Principal Loan Amount:* *${formatAmt(parent.amount, curr)}*`,
      parent.note ? `• *Purpose / Note:* ${parent.note}` : '',
      interestLines ? `\n📈 *ACCRUED INTEREST:*\n${interestLines}\n• *Total Interest:* *+${formatAmt(totalInterest, curr)}*` : '',
      `• *Gross Obligation (P + I):* *${formatAmt(parent.amount + totalInterest, curr)}*`,
      settlementLines ? `\n💳 *PAYMENTS & SETTLEMENTS:*\n${settlementLines}\n• *Total Paid:* *-${formatAmt(totalSettled, curr)}*` : '',
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `💰 *NET BALANCE DUE:* *${formatAmt(remaining, curr)}*`,
      `${statusIcon} *STATUS:* *${statusLabel}*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      upiId && remaining > 0 ? [
        `📲 *INSTANT UPI REPAYMENT:*`,
        `👉 Send directly to UPI ID: \`${upiId}\``,
        `⚡ Accepted on Google Pay, PhonePe, Paytm, BHIM, CRED`,
      ].join('\n') : '',
      `🔒 _Authentic digital ledger entry recorded via Rupeo Smart Khata._`,
    ].filter(Boolean).join('\n');
  }

  // ALL TRANSACTIONS STATEMENT
  let totalGiven = 0;
  let totalGot = 0;
  let totalInterestAll = 0;
  let totalSettledAll = 0;

  allGroups.forEach((g) => {
    if (g.parent.type === 'gave') totalGiven += g.parent.amount;
    else totalGot += g.parent.amount;
    totalInterestAll += g.totalInterest;
    totalSettledAll += g.totalSettled;
  });

  const entrySummaries = allGroups.slice(0, 6).map((g, idx) => {
    const isGave = g.parent.type === 'gave';
    const status = g.isFullySettled ? '✓ Cleared' : g.remaining > 0 ? `₹${g.remaining} left` : 'Active';
    return `  ${idx + 1}. ${formatDate(g.parent.date)} — ${isGave ? 'Gave' : 'Took'} *${formatAmt(g.parent.amount, curr)}* (${status})`;
  }).join('\n');

  return [
    `📑 *RUPEO DIGITAL KHATA — COMPLETE STATEMENT*`,
    `📄 *Statement Ref:* \`#${invNo}\``,
    `📅 *Generated:* ${dateStr} at ${timeStr}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 *Party:* ${friend.name}${friend.phone ? ` (${friend.phone})` : ''}`,
    `💼 *Account Holder:* ${userName}`,
    upiId ? `💳 *Verified UPI:* \`${upiId}\`` : '',
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📊 *ACCOUNT RECONCILIATION SUMMARY:*`,
    `• *Total Money Lent (दिया):* ${formatAmt(totalGiven, curr)}`,
    `• *Total Money Borrowed (लिया):* ${formatAmt(totalGot, curr)}`,
    totalInterestAll > 0 ? `• *Total Interest Accrued:* +${formatAmt(totalInterestAll, curr)}` : '',
    totalSettledAll > 0 ? `• *Total Repayments Settled:* -${formatAmt(totalSettledAll, curr)}` : '',
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    netBalance > 0
      ? `🟢 *YOU WILL GET (लेना बाकी):* *${formatAmt(netBalance, curr)}*`
      : netBalance < 0
        ? `🔴 *YOU WILL PAY (देना बाकी):* *${formatAmt(Math.abs(netBalance), curr)}*`
        : `✅ *ACCOUNT FULLY BALANCED (हिसाब बराबर):* *${curr}0*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    allGroups.length > 0 ? `📋 *RECENT TRANSACTIONS:*\n${entrySummaries}` : '',
    allGroups.length > 6 ? `  _(+${allGroups.length - 6} additional entries on file)_` : '',
    upiId && netBalance > 0 ? [
      `\n📲 *INSTANT UPI REPAYMENT:*`,
      `👉 Send to: \`${upiId}\``,
      `⚡ Google Pay • PhonePe • Paytm • BHIM • CRED`,
    ].join('\n') : '',
    `\n🔒 _Authentic digital ledger entry recorded via Rupeo Smart Khata._`,
  ].filter(Boolean).join('\n');
}

/**
 * Generate High-Resolution HTML for PDF Invoice & Web Printing
 */
/**
 * Generate High-Resolution Single-Page HTML for PDF Invoice & Web Printing
 */
export function generateUdharInvoiceHtml(options: UdharInvoiceOptions): string {
  const {
    mode,
    friend,
    userName = 'Rupeo User',
    userPhone = '',
    upiId = '',
    curr = '₹',
    singleGroup,
    allGroups = [],
    netBalance = 0,
  } = options;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const invNo = `RUP-INV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const qrUrl = upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=2&data=${encodeURIComponent(
        `upi://pay?pa=${upiId}&pn=${encodeURIComponent(userName)}&cu=INR`
      )}`
    : '';

  const isSingle = mode === 'single' && !!singleGroup;
  const userInitials = getInitials(userName);
  const friendInitials = getInitials(friend.name);

  let bodyHtml = '';

  if (isSingle && singleGroup) {
    const { parent, settlementChildren, interestChildren, totalInterest, totalSettled, remaining, isFullySettled, isPartiallySettled } = singleGroup;
    const isGave = parent.type === 'gave';
    const grossPayable = parent.amount + totalInterest;

    const statusBadge = isFullySettled
      ? { text: '✓ 100% FULLY SETTLED', color: '#047857', bg: '#D1FAE5', border: '#A7F3D0' }
      : isPartiallySettled
      ? { text: '⏳ PARTIALLY SETTLED', color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' }
      : { text: '📌 ACTIVE LOAN', color: '#312E81', bg: '#EEF2FF', border: '#C7D2FE' };

    bodyHtml = `
      <!-- Hero Balance Bar -->
      <div class="hero-bar ${isFullySettled ? 'hero-settled' : ''}">
        <div>
          <div class="hero-eyebrow">REMAINING OUTSTANDING BALANCE</div>
          <div class="hero-amount">${formatAmt(remaining, curr)}</div>
          <div class="hero-metrics">
            <span class="metric-pill">Principal: <strong>${formatAmt(parent.amount, curr)}</strong></span>
            ${totalInterest > 0 ? `<span class="metric-pill metric-interest">Interest: <strong>+${formatAmt(totalInterest, curr)}</strong></span>` : ''}
            ${totalSettled > 0 ? `<span class="metric-pill metric-settled">Settled: <strong>-${formatAmt(totalSettled, curr)}</strong></span>` : ''}
          </div>
        </div>

        <div style="text-align: right;">
          <div class="status-badge" style="background:${statusBadge.bg}; color:${statusBadge.color}; border:1px solid ${statusBadge.border};">
            ${statusBadge.text}
          </div>
          <div class="hero-meta-detail">
            Type: <strong>${isGave ? 'Money Lent (Given)' : 'Money Borrowed (Taken)'}</strong> • ${formatDate(parent.date)}
          </div>
        </div>
      </div>

      <!-- Itemized Ledger Table -->
      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 52%;">PARTICULARS / DESCRIPTION</th>
              <th style="width: 26%;">DATE & RATE</th>
              <th style="width: 22%; text-align: right;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            <!-- Principal Row -->
            <tr class="row-principal">
              <td>
                <div class="item-title">
                  <span class="type-pill pill-principal">PRINCIPAL</span>
                  ${isGave ? 'Money Lent (उधार दिया)' : 'Money Borrowed (उधार लिया)'}
                </div>
                <div class="item-sub">${parent.note ? `Note: ${parent.note}` : 'Base loan principal disbursed'}</div>
              </td>
              <td>
                <div class="cell-date">${formatDate(parent.date)}</div>
              </td>
              <td class="cell-amount cell-principal">${formatAmt(parent.amount, curr)}</td>
            </tr>

            <!-- Interest Accruals -->
            ${interestChildren.slice(0, 3).map((ic) => {
              const dynAmt = getDynamicEntryAmount(ic);
              const rateDesc = ic.interestPercent
                ? `${ic.interestPercent}% ${ic.interestPeriod === 'monthly' ? '/mo' : ic.interestPeriod === 'yearly' ? '/yr' : 'flat'}`
                : 'Interest';
              return `
                <tr class="row-interest">
                  <td>
                    <div class="item-title">
                      <span class="type-pill pill-interest">INTEREST</span>
                      Accrued Interest (ब्याज)
                    </div>
                    <div class="item-sub">${ic.note || 'Dynamic interest computed on base principal'}</div>
                  </td>
                  <td>
                    <div class="cell-date">${rateDesc}</div>
                  </td>
                  <td class="cell-amount cell-interest">+${formatAmt(dynAmt, curr)}</td>
                </tr>
              `;
            }).join('')}

            <!-- Subtotal: Gross Obligation -->
            <tr class="row-subtotal">
              <td colspan="2" class="cell-subtotal-label">GROSS TOTAL OBLIGATION (Principal + Interest):</td>
              <td class="cell-subtotal-val">${formatAmt(grossPayable, curr)}</td>
            </tr>

            <!-- Settlements / Repayments -->
            ${settlementChildren.slice(0, 3).map((sc) => `
              <tr class="row-settlement">
                <td>
                  <div class="item-title">
                    <span class="type-pill pill-settlement">PAYMENT</span>
                    Payment Received (${sc.paymentMode || 'Cash / UPI'})
                  </div>
                  <div class="item-sub">${sc.note || 'Repayment received towards loan'}</div>
                </td>
                <td>
                  <div class="cell-date">${formatDate(sc.date)}</div>
                </td>
                <td class="cell-amount cell-settlement">-${formatAmt(sc.amount, curr)}</td>
              </tr>
            `).join('')}

            ${settlementChildren.length > 3 ? `
              <tr class="row-settlement">
                <td colspan="2" class="cell-sub">+ ${settlementChildren.length - 3} more payments summarized in total</td>
                <td></td>
              </tr>
            ` : ''}

            ${settlementChildren.length > 0 ? `
              <tr class="row-settlement-subtotal">
                <td colspan="2" class="cell-settlement-subtotal-label">Total Repayments Deducted:</td>
                <td class="cell-settlement-subtotal-val">-${formatAmt(totalSettled, curr)}</td>
              </tr>
            ` : `
              <tr>
                <td colspan="3" class="cell-empty">No repayments recorded yet towards this loan.</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>

      <!-- Single-Row Dual Box: UPI Settle on Left + Reconciliation on Right -->
      <div class="bottom-dual-grid">
        ${upiId ? `
          <div class="upi-box-compact">
            <div style="flex: 1;">
              <div class="upi-box-tag">⚡ INSTANT REPAYMENT VIA UPI</div>
              <div class="upi-box-vpa">${upiId}</div>
              <div class="upi-box-sub">Scan QR or send to UPI ID above.</div>
              <div class="upi-box-apps">GPay • PhonePe • Paytm • BHIM • CRED</div>
            </div>
            ${qrUrl ? `<img src="${qrUrl}" width="62" height="62" class="upi-qr-compact" alt="QR" />` : ''}
          </div>
        ` : `
          <div class="notes-box-compact">
            <div class="notes-header">Terms & Khata Record Notes</div>
            <div class="notes-body">This statement is a computer-verified ledger account managed mutually between the parties on Rupeo Khata. Legally compliant under IT Act 2000.</div>
          </div>
        `}

        <div class="recon-box-compact">
          <div class="recon-row">
            <span>Base Principal Amount:</span>
            <span class="recon-val">${formatAmt(parent.amount, curr)}</span>
          </div>
          ${totalInterest > 0 ? `
            <div class="recon-row recon-interest-row">
              <span>Total Accrued Interest:</span>
              <span class="recon-val">+${formatAmt(totalInterest, curr)}</span>
            </div>
          ` : ''}
          ${totalSettled > 0 ? `
            <div class="recon-row recon-settled-row">
              <span>Less: Total Repaid:</span>
              <span class="recon-val">-${formatAmt(totalSettled, curr)}</span>
            </div>
          ` : ''}
          <div class="recon-divider"></div>
          <div class="recon-net-row">
            <span>NET BALANCE DUE:</span>
            <span class="recon-net-val ${isFullySettled ? 'net-settled' : ''}">${formatAmt(remaining, curr)}</span>
          </div>
        </div>
      </div>
    `;
  } else {
    // ALL TRANSACTIONS STATEMENT
    let totalGiven = 0;
    let totalGot = 0;
    let totalInterestAll = 0;
    let totalSettledAll = 0;

    allGroups.forEach((g) => {
      if (g.parent.type === 'gave') totalGiven += g.parent.amount;
      else totalGot += g.parent.amount;
      totalInterestAll += g.totalInterest;
      totalSettledAll += g.totalSettled;
    });

    const isPositive = netBalance > 0;
    const balanceColor = isPositive ? '#059669' : netBalance < 0 ? '#DC2626' : '#475569';
    const balanceBg = isPositive ? '#ECFDF5' : netBalance < 0 ? '#FEF2F2' : '#F1F5F9';
    const balanceBorder = isPositive ? '#A7F3D0' : netBalance < 0 ? '#FECACA' : '#E2E8F0';
    const balanceLabel = isPositive
      ? 'YOU WILL RECEIVE (लेना बाकी)'
      : netBalance < 0
      ? 'YOU WILL PAY (देना बाकी)'
      : 'ALL CLEARED & BALANCED';

    bodyHtml = `
      <!-- 4-Stat Strip -->
      <div class="statement-grid-compact">
        <div class="stat-card-compact">
          <div class="stat-lbl">LENT (दिया)</div>
          <div class="stat-val" style="color: #059669;">${formatAmt(totalGiven, curr)}</div>
        </div>
        <div class="stat-card-compact">
          <div class="stat-lbl">BORROWED (लिया)</div>
          <div class="stat-val" style="color: #DC2626;">${formatAmt(totalGot, curr)}</div>
        </div>
        <div class="stat-card-compact">
          <div class="stat-lbl">INTEREST</div>
          <div class="stat-val" style="color: #D97706;">+${formatAmt(totalInterestAll, curr)}</div>
        </div>
        <div class="stat-card-compact">
          <div class="stat-lbl">SETTLED</div>
          <div class="stat-val" style="color: #2563EB;">-${formatAmt(totalSettledAll, curr)}</div>
        </div>
      </div>

      <!-- Net Balance Hero Bar -->
      <div class="hero-bar" style="background:${balanceBg}; border:1px solid ${balanceBorder};">
        <div>
          <div class="hero-eyebrow" style="color: ${balanceColor};">NET LEDGER BALANCE</div>
          <div class="hero-amount" style="color: ${balanceColor};">${formatAmt(Math.abs(netBalance), curr)}</div>
        </div>
        <div style="text-align: right;">
          <div class="status-badge" style="background:#FFFFFF; color:${balanceColor}; border:1px solid ${balanceBorder};">
            ${balanceLabel}
          </div>
          <div class="hero-meta-detail">Total ${allGroups.length} ledger records</div>
        </div>
      </div>

      <!-- Ledger Table (Top entries to strictly fit single page) -->
      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 15%;">DATE</th>
              <th style="width: 12%;">TYPE</th>
              <th style="width: 33%;">DESCRIPTION</th>
              <th style="width: 20%; text-align: right;">PRINCIPAL</th>
              <th style="width: 20%; text-align: right;">OUTSTANDING</th>
            </tr>
          </thead>
          <tbody>
            ${allGroups.slice(0, 7).map((g) => {
              const isGave = g.parent.type === 'gave';
              return `
                <tr>
                  <td><div class="cell-date">${formatDate(g.parent.date)}</div></td>
                  <td><span class="type-pill ${isGave ? 'pill-gave' : 'pill-took'}">${isGave ? 'GAVE' : 'TOOK'}</span></td>
                  <td><div class="item-title" style="font-size:11px;">${g.parent.note || (isGave ? 'Money Lent' : 'Money Borrowed')}</div></td>
                  <td class="cell-amount cell-principal" style="text-align: right;">${formatAmt(g.parent.amount, curr)}</td>
                  <td style="text-align: right;" class="cell-amount">
                    ${g.isFullySettled ? '<span class="status-pill-small">✓ CLEARED</span>' : formatAmt(g.remaining, curr)}
                  </td>
                </tr>
              `;
            }).join('')}
            ${allGroups.length > 7 ? `
              <tr>
                <td colspan="5" class="cell-sub" style="text-align:center; padding: 4px;">
                  + ${allGroups.length - 7} earlier records summarized in net balance above
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>

      <!-- Bottom Dual Box -->
      <div class="bottom-dual-grid">
        ${upiId && netBalance > 0 ? `
          <div class="upi-box-compact">
            <div style="flex: 1;">
              <div class="upi-box-tag">⚡ INSTANT REPAYMENT VIA UPI</div>
              <div class="upi-box-vpa">${upiId}</div>
              <div class="upi-box-sub">Pay securely using any UPI app.</div>
              <div class="upi-box-apps">GPay • PhonePe • Paytm • BHIM • CRED</div>
            </div>
            ${qrUrl ? `<img src="${qrUrl}" width="62" height="62" class="upi-qr-compact" alt="QR" />` : ''}
          </div>
        ` : `
          <div class="notes-box-compact">
            <div class="notes-header">Statement Reconciliation Note</div>
            <div class="notes-body">This statement is a full ledger summary of all mutual transactions with ${friend.name} recorded on Rupeo Khata.</div>
          </div>
        `}

        <div class="recon-box-compact">
          <div class="recon-row"><span>Total Money Lent:</span><span class="recon-val">${formatAmt(totalGiven, curr)}</span></div>
          <div class="recon-row"><span>Total Borrowed:</span><span class="recon-val">${formatAmt(totalGot, curr)}</span></div>
          ${totalInterestAll > 0 ? `<div class="recon-row recon-interest-row"><span>Interest Accrued:</span><span class="recon-val">+${formatAmt(totalInterestAll, curr)}</span></div>` : ''}
          ${totalSettledAll > 0 ? `<div class="recon-row recon-settled-row"><span>Repayments Settled:</span><span class="recon-val">-${formatAmt(totalSettledAll, curr)}</span></div>` : ''}
          <div class="recon-divider"></div>
          <div class="recon-net-row">
            <span>NET BALANCE:</span>
            <span class="recon-net-val">${formatAmt(Math.abs(netBalance), curr)}</span>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Rupeo Invoice - ${friend.name} - ${invNo}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 6mm 8mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          margin: 0;
          padding: 0;
          background: #F8FAFC;
          color: #0F172A;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.35;
          font-size: 11px;
          -webkit-font-smoothing: antialiased;
        }

        /* Top Action Bar for Live Browser Preview */
        .no-print {
          position: sticky;
          top: 0;
          z-index: 999;
          background: #0B1120;
          color: #FFFFFF;
          padding: 8px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .print-btn {
          background: #0284C7;
          color: #FFFFFF;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        /* Single Page A4 Root Container */
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          background: #FFFFFF;
          border-radius: 12px;
          padding: 14px 18px;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
          border: 1px solid #E2E8F0;
          page-break-inside: avoid;
        }

        /* Compact Brand Banner */
        .brand-banner {
          background: linear-gradient(135deg, #0B1120 0%, #0F172A 60%, #1E1B4B 100%);
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #FFFFFF;
          margin-bottom: 8px;
        }
        .brand-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .brand-logo-mark {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: linear-gradient(135deg, #0284C7, #38BDF8);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 900;
          color: #FFFFFF;
          box-shadow: 0 2px 8px rgba(56, 189, 248, 0.4);
        }
        .brand-app-name {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: -0.3px;
        }
        .brand-tagline {
          font-size: 8px;
          font-weight: 700;
          color: #94A3B8;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        .invoice-id-badge {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 2px 8px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 800;
          color: #38BDF8;
          font-family: monospace;
        }
        .invoice-datetime {
          font-size: 9.5px;
          color: #CBD5E1;
          margin-top: 2px;
        }

        /* Parties Grid */
        .parties-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 8px;
        }
        .party-card {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 8px 12px;
        }
        .party-role-tag {
          font-size: 8px;
          font-weight: 800;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .party-user-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .party-avatar {
          width: 28px;
          height: 28px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          color: #FFFFFF;
          flex-shrink: 0;
        }
        .avatar-issuer { background: #0F172A; }
        .avatar-recipient { background: #0284C7; }
        .party-name {
          font-size: 12.5px;
          font-weight: 800;
          color: #0F172A;
          line-height: 1.2;
        }
        .party-detail {
          font-size: 10px;
          color: #64748B;
          margin-top: 1px;
        }

        /* Hero Bar */
        .hero-bar {
          background: linear-gradient(135deg, #F8FAFC 0%, #EEF2F6 100%);
          border: 1px solid #CBD5E1;
          border-radius: 8px;
          padding: 8px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .hero-settled {
          background: linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%);
          border-color: #86EFAC;
        }
        .hero-eyebrow {
          font-size: 8.5px;
          font-weight: 800;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .hero-amount {
          font-size: 22px;
          font-weight: 900;
          color: #0F172A;
          letter-spacing: -0.5px;
          line-height: 1.1;
          margin: 2px 0;
        }
        .hero-metrics {
          display: flex;
          gap: 6px;
        }
        .metric-pill {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          padding: 1.5px 6px;
          border-radius: 4px;
          font-size: 9.5px;
          color: #475569;
        }
        .metric-interest { background: #FFFBEB; border-color: #FDE68A; color: #B45309; }
        .metric-settled { background: #F0FDF4; border-color: #BBF7D0; color: #15803D; }
        .status-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.4px;
        }
        .hero-meta-detail {
          font-size: 9.5px;
          color: #64748B;
          margin-top: 3px;
        }

        /* Statement 4-Stat Strip */
        .statement-grid-compact {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 8px;
        }
        .stat-card-compact {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 6px;
          padding: 6px 8px;
          text-align: center;
        }
        .stat-lbl {
          font-size: 7.5px;
          font-weight: 800;
          color: #64748B;
          text-transform: uppercase;
        }
        .stat-val {
          font-size: 13px;
          font-weight: 800;
          margin-top: 2px;
        }

        /* Table */
        .table-card {
          border-radius: 8px;
          border: 1px solid #E2E8F0;
          overflow: hidden;
          margin-bottom: 8px;
          background: #FFFFFF;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10.5px;
        }
        .data-table thead tr {
          background: #F8FAFC;
          border-bottom: 1.5px solid #E2E8F0;
        }
        .data-table th {
          padding: 5px 8px;
          text-align: left;
          font-weight: 800;
          color: #475569;
          font-size: 8.5px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .data-table td {
          padding: 5px 8px;
          vertical-align: middle;
        }
        .row-principal { background: #FFFFFF; border-bottom: 1px solid #F1F5F9; }
        .row-interest { background: #FFFBEB; border-bottom: 1px solid #FEF3C7; }
        .row-settlement { background: #F0FDF4; border-bottom: 1px solid #DCFCE7; }
        .row-subtotal { background: #F8FAFC; border-top: 1.5px solid #E2E8F0; border-bottom: 1.5px solid #E2E8F0; }
        .row-settlement-subtotal { background: #DCFCE7; border-top: 1px solid #BBF7D0; }
        .item-title { font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 4px; }
        .item-sub { font-size: 9px; color: #64748B; margin-top: 1px; }
        .cell-date { font-weight: 600; color: #334155; }
        .cell-amount { font-weight: 800; font-size: 11px; }
        .cell-principal { color: #0F172A; }
        .cell-interest { color: #D97706; }
        .cell-settlement { color: #059669; }
        .cell-subtotal-label { text-align: right; font-weight: 800; color: #334155; font-size: 9.5px; }
        .cell-subtotal-val { text-align: right; font-weight: 800; color: #0F172A; font-size: 11.5px; }
        .cell-settlement-subtotal-label { text-align: right; font-weight: 800; color: #166534; font-size: 9.5px; }
        .cell-settlement-subtotal-val { text-align: right; font-weight: 800; color: #15803D; font-size: 11.5px; }
        .cell-empty { text-align: center; color: #94A3B8; font-style: italic; padding: 10px !important; }
        .type-pill {
          font-size: 7.5px;
          font-weight: 800;
          padding: 1px 4px;
          border-radius: 3px;
          text-transform: uppercase;
        }
        .pill-principal { background: #E2E8F0; color: #334155; }
        .pill-interest { background: #FEF3C7; color: #B45309; }
        .pill-settlement { background: #DCFCE7; color: #15803D; }
        .pill-gave { background: #DCFCE7; color: #15803D; }
        .pill-took { background: #FEE2E2; color: #DC2626; }
        .status-pill-small { font-size: 8.5px; font-weight: 800; color: #059669; background: #ECFDF5; padding: 1px 5px; border-radius: 8px; }

        /* Bottom Dual Box: UPI Settle on Left + Reconciliation on Right */
        .bottom-dual-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 8px;
          margin-bottom: 8px;
        }
        .upi-box-compact {
          background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
          border: 1px solid #86EFAC;
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .upi-box-tag { font-size: 8px; font-weight: 800; color: #047857; letter-spacing: 0.4px; }
        .upi-box-vpa { font-family: monospace; font-size: 11px; font-weight: 800; color: #0F172A; margin: 2px 0; }
        .upi-box-sub { font-size: 8.5px; color: #047857; }
        .upi-box-apps { font-size: 8px; font-weight: 700; color: #065F46; margin-top: 2px; }
        .upi-qr-compact { border-radius: 6px; border: 1.5px solid #6EE7B7; background: #FFFFFF; flex-shrink: 0; }
        
        .notes-box-compact {
          background: #F8FAFC;
          border: 1px dashed #CBD5E1;
          border-radius: 8px;
          padding: 8px 10px;
        }
        .notes-header { font-size: 9px; font-weight: 800; color: #2563EB; text-transform: uppercase; margin-bottom: 2px; }
        .notes-body { font-size: 8.5px; color: #64748B; line-height: 1.35; }

        .recon-box-compact {
          background: #0B1120;
          border-radius: 8px;
          padding: 8px 12px;
          color: #FFFFFF;
        }
        .recon-row { display: flex; justify-content: space-between; font-size: 9.5px; color: #94A3B8; margin-bottom: 3px; }
        .recon-interest-row { color: #FBBF24; }
        .recon-settled-row { color: #4ADE80; }
        .recon-val { font-weight: 700; color: #FFFFFF; }
        .recon-divider { height: 1px; background: rgba(255,255,255,0.15); margin: 5px 0; }
        .recon-net-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 10px; font-weight: 800; color: #CBD5E1; }
        .recon-net-val { font-size: 15px; font-weight: 900; color: #38BDF8; }
        .net-settled { color: #4ADE80 !important; }

        /* Signatures & Vector SVG Seal */
        .signatures-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          align-items: center;
          margin-bottom: 6px;
        }
        .sig-box {
          border-top: 1px dashed #94A3B8;
          padding-top: 4px;
          text-align: center;
        }
        .sig-title { font-size: 8px; font-weight: 700; color: #64748B; letter-spacing: 0.4px; }
        .sig-party { font-size: 11px; font-weight: 800; color: #0F172A; margin-top: 1px; }
        .sig-sub { font-size: 8px; color: #94A3B8; }
        .security-seal-center {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        /* Footer */
        .official-footer {
          border-top: 1px solid #E2E8F0;
          padding-top: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 8px;
          color: #94A3B8;
        }

        /* Print Media Strict Safeguards for Single Page */
        @media print {
          html, body {
            width: 100% !important;
            height: 100% !important;
            max-height: 297mm !important;
            overflow: hidden !important;
            background: #FFFFFF !important;
          }
          .no-print {
            display: none !important;
          }
          .invoice-container {
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
          }
          .brand-banner {
            box-shadow: none !important;
          }
          tr {
            page-break-inside: avoid !important;
          }
        }
      </style>
    </head>
    <body>
      <!-- Top Action Bar for Live Browser Preview -->
      <div class="no-print">
        <span style="font-weight: 800; font-size: 13px;">Rupeo Digital Khata Invoice #${invNo}</span>
        <button onclick="window.print()" class="print-btn" type="button">Print / Save as PDF</button>
      </div>

      <!-- Main Invoice Single-Page Container -->
      <div class="invoice-container">
        <!-- Compact Brand Banner -->
        <div class="brand-banner">
          <div class="brand-left">
            <div class="brand-logo-mark">₹</div>
            <div>
              <div class="brand-app-name">RUPEO KHATA</div>
              <div class="brand-tagline">OFFICIAL FINANCIAL STATEMENT & LEDGER</div>
            </div>
          </div>

          <div style="text-align: right;">
            <div><span class="invoice-id-badge">#${invNo}</span></div>
            <div class="invoice-datetime">Date: <strong>${dateStr}</strong> • ${timeStr}</div>
          </div>
        </div>

        <!-- Compact Parties Grid -->
        <div class="parties-grid">
          <div class="party-card">
            <div class="party-role-tag">ISSUED BY / CREDITOR</div>
            <div class="party-user-row">
              <div class="party-avatar avatar-issuer">${userInitials}</div>
              <div style="flex: 1;">
                <div class="party-name">${userName}</div>
                ${userPhone ? `<div class="party-detail">Phone: ${userPhone}</div>` : ''}
                ${upiId ? `<div class="party-detail" style="color:#047857; font-weight:700;">UPI: ${upiId}</div>` : ''}
              </div>
            </div>
          </div>

          <div class="party-card">
            <div class="party-role-tag">BILLED TO / DEBTOR (PARTY)</div>
            <div class="party-user-row">
              <div class="party-avatar avatar-recipient">${friendInitials}</div>
              <div style="flex: 1;">
                <div class="party-name">${friend.name}</div>
                ${friend.phone ? `<div class="party-detail">Phone: ${friend.phone}</div>` : '<div class="party-detail" style="color: #94A3B8;">Phone not specified</div>'}
              </div>
            </div>
          </div>
        </div>

        <!-- Main Body -->
        ${bodyHtml}

        <!-- Compact Signatures & Verified Vector Seal -->
        <div class="signatures-grid">
          <div class="sig-box">
            <div class="sig-title">ISSUED & VERIFIED BY</div>
            <div class="sig-party">${userName}</div>
            <div class="sig-sub">Authorized Creditor</div>
          </div>

          <div class="security-seal-center">
            <svg width="68" height="68" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="47" stroke="#0284C7" stroke-width="1.8" stroke-dasharray="3.5 3"/>
              <circle cx="50" cy="50" r="43" stroke="#0284C7" stroke-width="1"/>
              <circle cx="50" cy="50" r="39.5" fill="#F0F9FF"/>
              <path d="M50 20L59 24.5V36C59 42.5 55 48 50 50C45 48 41 42.5 41 36V24.5L50 20Z" fill="#0284C7"/>
              <path d="M46.5 35L49 37.5L54 32.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <text x="50" y="61" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="6.8" font-weight="900" fill="#0369A1" text-anchor="middle" letter-spacing="0.6">RUPEO KHATA</text>
              <text x="50" y="69" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="5.4" font-weight="800" fill="#0284C7" text-anchor="middle" letter-spacing="0.4">VERIFIED LEDGER</text>
              <text x="50" y="76" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="4.8" font-weight="700" fill="#64748B" text-anchor="middle" letter-spacing="0.6">TAMPER-PROOF</text>
            </svg>
          </div>

          <div class="sig-box">
            <div class="sig-title">ACKNOWLEDGED BY DEBTOR</div>
            <div class="sig-party">${friend.name}</div>
            <div class="sig-sub">Debtor / Recipient</div>
          </div>
        </div>

        <!-- Official Compliance Footer -->
        <div class="official-footer">
          <div>Authentic computer-generated digital khata record • Rupeo Smart Khata • IT Act Compliant</div>
          <div>Page 1 of 1</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate PDF Invoice (returns file URI without opening share dialog)
 */
export async function generateInvoicePDFOnly(options: UdharInvoiceOptions): Promise<{ success: boolean; uri?: string; filename?: string; error?: string }> {
  try {
    const html = generateUdharInvoiceHtml(options);
    const rawName = (options.friend?.name || 'Customer').trim();
    const cleanFriendName = rawName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20) || 'Customer';
    const filename = `Rupeo_Invoice_${cleanFriendName}_${Date.now().toString().slice(-6)}.pdf`;

    if (Platform.OS === 'web') {
      if (typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        return { success: true, uri: url, filename };
      }
    }

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

    return { success: false, error: 'Failed to generate PDF invoice file.' };
  } catch (err: any) {
    console.error('Invoice PDF Generation error:', err);
    return { success: false, error: err?.message || 'Failed to print PDF.' };
  }
}

/**
 * Generate and Share PDF Invoice
 */
export async function generateAndShareInvoicePDF(options: UdharInvoiceOptions): Promise<{ success: boolean; uri?: string; error?: string }> {
  const res = await generateInvoicePDFOnly(options);
  if (res.success && res.uri) {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(res.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Rupeo Invoice - ${options.friend.name}`,
        UTI: 'com.adobe.pdf',
      });
    }
    return { success: true, uri: res.uri };
  }
  return { success: false, error: res.error || 'Failed to generate PDF.' };
}

/**
 * Share direct to WhatsApp (with pre-filled phone number if available)
 */
export async function shareInvoiceDirectToWhatsApp(
  options: UdharInvoiceOptions,
  imageUri?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const text = generateUdharInvoiceWhatsAppText(options);
    const cleanPhone = options.friend.phone ? options.friend.phone.replace(/[^0-9]/g, '') : '';
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    // 1. If an image URI is provided, use native RupeoShare on Android
    if (imageUri && Platform.OS === 'android') {
      if (NativeModules.RupeoShare?.shareToWhatsApp) {
        try {
          await NativeModules.RupeoShare.shareToWhatsApp(imageUri, text, formattedPhone || undefined);
          return { success: true };
        } catch (waErr) {
          console.warn('Native shareToWhatsApp failed, fallback to shareImageAndText:', waErr);
        }
      }

      if (NativeModules.RupeoShare?.shareImageAndText) {
        try {
          await NativeModules.RupeoShare.shareImageAndText(
            imageUri,
            text,
            `Rupeo Invoice - ${options.friend.name}`
          );
          return { success: true };
        } catch (nativeErr) {
          console.warn('Native shareImageAndText failed:', nativeErr);
        }
      }
    }

    // 2. WhatsApp URL scheme
    const waUrl = formattedPhone
      ? `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`
      : `whatsapp://send?text=${encodeURIComponent(text)}`;

    const canOpen = await Linking.canOpenURL(waUrl);
    if (canOpen) {
      await Linking.openURL(waUrl);
      return { success: true };
    }

    // 3. Fallback to web WhatsApp or generic share
    const webWa = formattedPhone
      ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    const canOpenWeb = await Linking.canOpenURL(webWa);
    if (canOpenWeb) {
      await Linking.openURL(webWa);
      return { success: true };
    }

    return { success: false, error: 'WhatsApp is not installed on this device.' };
  } catch (err: any) {
    console.error('WhatsApp share error:', err);
    return { success: false, error: err?.message || 'Could not open WhatsApp.' };
  }
}
