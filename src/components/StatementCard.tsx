import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Clipboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import Toast from 'react-native-toast-message';
import {
  StatementCalculationResult,
} from '@/lib/statementCalculator';

export interface StatementCardProps {
  data: StatementCalculationResult;
  width?: number;
  onCopyUpi?: () => void;
  isCaptureMode?: boolean;
}

function formatCurrencyWithDecimals(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : ''}₹${formatted}`;
}

function formatCurrencyCompact(amount: number): string {
  const abs = Math.abs(amount);
  const hasDecimals = abs % 1 !== 0;
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : ''}₹${formatted}`;
}

export const StatementCard: React.FC<StatementCardProps> = ({
  data,
  width = 390,
  onCopyUpi,
  isCaptureMode = false,
}) => {
  const {
    statementId,
    generatedTimestampStr,
    lender,
    borrower,
    directionTitle,
    principalAmount,
    entryDateStr,
    hasInterest,
    interestPercent,
    interestPeriodLabel,
    accruedInterest,
    daysElapsed = 0,
    totalWithInterest,
    hasPayments,
    totalPaymentsReceived,
    remainingDue,
    isSettled,
    statusText,
    shouldShowPaymentSection,
    upiId,
    upiUri,
  } = data;

  const handleCopyUpi = () => {
    if (onCopyUpi) {
      onCopyUpi();
      return;
    }
    if (upiId) {
      Clipboard.setString(upiId);
      Toast.show({
        type: 'success',
        text1: 'UPI ID Copied',
        text2: upiId,
        position: 'top',
      });
    }
  };

  const formattedRefNo = statementId?.startsWith('#')
    ? statementId
    : `#${statementId || 'HR218'}`;

  const finalPayableAmount = remainingDue > 0 ? remainingDue : totalWithInterest;

  // Build formula text for banner
  let formulaParts: string[] = [];
  if (principalAmount > 0) {
    formulaParts.push(`${formatCurrencyCompact(principalAmount)} principal`);
  }
  if (hasInterest && accruedInterest > 0) {
    formulaParts.push(`+ ${formatCurrencyCompact(accruedInterest)} interest`);
  }
  if (hasPayments && totalPaymentsReceived > 0) {
    formulaParts.push(`- ${formatCurrencyCompact(totalPaymentsReceived)} paid`);
  }
  const formulaText = formulaParts.length > 0 ? formulaParts.join(' ') : 'Settled & Verified';

  const showUpiSection = (shouldShowPaymentSection || (upiId && !isSettled)) && !isSettled;

  return (
    <View style={[styles.cardContainer, { width }]}>
      {/* ── 1. TOP HEADER ── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.logoTile}>
            <Text style={styles.logoGlyph}>₹</Text>
          </View>
          <View style={styles.brandTitleCol}>
            <View style={styles.brandNameRow}>
              <Text style={styles.brandNameRupeo}>Rupeo </Text>
              <Text style={styles.brandNameKhata}>Khata</Text>
            </View>
            <Text style={styles.brandSubtitle}>FINANCIAL STATEMENT</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.refLabel}>REFERENCE NO.</Text>
          <Text style={styles.refValue}>{formattedRefNo}</Text>
          <Text style={styles.refTimestamp}>{generatedTimestampStr}</Text>
        </View>
      </View>

      {/* Gold Accent Divider */}
      <View style={styles.goldDivider} />

      {/* ── 2. LENDER & BORROWER CARDS ROW ── */}
      <View style={styles.partiesRow}>
        <View style={styles.partyBox}>
          <Text style={styles.partyRoleLabel}>LENDER</Text>
          <Text style={styles.partyName} numberOfLines={1}>
            {lender?.name || 'You'}
          </Text>
          <Text style={styles.partyPhone} numberOfLines={1}>
            {lender?.phone || '-'}
          </Text>
        </View>

        <View style={styles.partyBox}>
          <Text style={styles.partyRoleLabel}>BORROWER</Text>
          <Text style={styles.partyName} numberOfLines={1}>
            {borrower?.name || 'Friend'}
          </Text>
          <Text style={styles.partyPhone} numberOfLines={1}>
            {borrower?.phone || '-'}
          </Text>
        </View>
      </View>

      {/* ── 3. TRANSACTION DETAILS ── */}
      <View style={styles.sectionHeaderWrap}>
        <Text style={styles.sectionTitle}>TRANSACTION DETAILS</Text>
        <View style={styles.sectionDarkDivider} />
      </View>

      <View style={styles.tableContainer}>
        {/* Row 1: Transaction type */}
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Transaction type</Text>
          <Text style={styles.tableValue}>{directionTitle || 'Money Lent'}</Text>
        </View>

        {/* Row 2: Transaction date */}
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Transaction date</Text>
          <Text style={styles.tableValue}>{entryDateStr}</Text>
        </View>

        {/* Row 3: Principal amount */}
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Principal amount</Text>
          <Text style={styles.tableValue}>{formatCurrencyWithDecimals(principalAmount)}</Text>
        </View>

        {/* Row 4: Interest rate (if interest applicable) */}
        {hasInterest && interestPercent !== undefined && interestPercent > 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Interest rate</Text>
            <Text style={styles.tableValue}>
              {`${interestPercent}% ${interestPeriodLabel || 'per month'}`}
            </Text>
          </View>
        )}

        {/* Row 5: Duration (if interest applicable) */}
        {hasInterest && (
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Duration</Text>
            <Text style={styles.tableValue}>{`${daysElapsed || 0} days`}</Text>
          </View>
        )}

        {/* Row 6: Interest accrued (if interest applicable) */}
        {hasInterest && accruedInterest > 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Interest accrued</Text>
            <Text style={styles.tableValue}>
              {formatCurrencyWithDecimals(accruedInterest)}
            </Text>
          </View>
        )}

        {/* Row 6B: Payments Received (if partial settlements exist) */}
        {hasPayments && totalPaymentsReceived > 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Payments received</Text>
            <Text style={[styles.tableValue, { color: '#16A34A' }]}>
              {`-${formatCurrencyWithDecimals(totalPaymentsReceived)}`}
            </Text>
          </View>
        )}

        {/* Row 7: Status */}
        <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.tableLabel}>Status</Text>
          <View
            style={[
              styles.statusPill,
              isSettled && styles.statusPillSettled,
            ]}
          >
            <Text
              style={[
                styles.statusPillText,
                isSettled && styles.statusPillTextSettled,
              ]}
            >
              {isSettled ? 'Settled' : statusText || 'Active'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── 4. TOTAL AMOUNT BANNER ── */}
      <View style={styles.totalBanner}>
        <View style={styles.totalBannerLeft}>
          <Text style={styles.totalBannerLabel}>TOTAL AMOUNT PAYABLE</Text>
          <Text style={styles.totalBannerSub} numberOfLines={1}>
            {formulaText}
          </Text>
        </View>
        <Text style={styles.totalBannerAmount}>
          {formatCurrencyCompact(finalPayableAmount)}
        </Text>
      </View>

      {/* ── 5. SCAN TO PAY / UPI CARD ── */}
      {showUpiSection && (
        <View style={styles.upiCard}>
          {/* Left: Dashed QR Code Box */}
          <View style={styles.qrDashedBox}>
            {upiUri ? (
              <QRCode
                value={upiUri}
                size={82}
                color="#0F172A"
                backgroundColor="#FFFFFF"
                quietZone={2}
              />
            ) : (
              <View style={styles.qrFallbackCol}>
                <Ionicons name="qr-code-outline" size={34} color="#64748B" />
                <Text style={styles.qrFallbackText}>UPI QR CODE</Text>
              </View>
            )}
          </View>

          {/* Right: Scan to pay details */}
          <View style={styles.upiDetailsCol}>
            <Text style={styles.upiScanLabel}>SCAN TO PAY</Text>
            <Text style={styles.upiAmountText}>
              {formatCurrencyCompact(finalPayableAmount)}
            </Text>

            {upiId ? (
              <TouchableOpacity
                style={styles.upiIdChip}
                onPress={handleCopyUpi}
                activeOpacity={0.7}
              >
                <Text style={styles.upiIdText} numberOfLines={1}>
                  {upiId}
                </Text>
                <Ionicons name="copy-outline" size={12} color="#64748B" />
              </TouchableOpacity>
            ) : null}

            <Text style={styles.upiAppNote}>Pay using any UPI app</Text>
          </View>
        </View>
      )}

      {/* ── 6. FOOTER ── */}
      <View style={styles.footerRow}>
        <Text style={styles.footerLeftText}>
          Computer-generated statement. No signature required.
        </Text>
        <Text style={styles.footerRightText}>
          Generated {generatedTimestampStr}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },

  /* 1. Header */
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F59E0B',
  },
  brandTitleCol: {},
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNameRupeo: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  brandNameKhata: {
    fontSize: 18,
    fontWeight: '900',
    color: '#D97706',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.2,
    marginTop: 2,
  },

  headerRight: {
    alignItems: 'flex-end',
  },
  refLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  refValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  refTimestamp: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 2,
  },

  goldDivider: {
    height: 1.5,
    backgroundColor: '#C5A059',
    marginTop: 18,
    marginBottom: 18,
    width: '100%',
  },

  /* 2. Parties Row */
  partiesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  partyBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  partyRoleLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  partyName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  partyPhone: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 3,
  },

  /* 3. Transaction Details */
  sectionHeaderWrap: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  sectionDarkDivider: {
    height: 1.5,
    backgroundColor: '#0F172A',
    width: '100%',
  },

  tableContainer: {
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  tableValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  statusPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 3.5,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16A34A',
  },
  statusPillSettled: {
    backgroundColor: '#F1F5F9',
  },
  statusPillTextSettled: {
    color: '#475569',
  },

  /* 4. Total Banner */
  totalBanner: {
    backgroundColor: '#0C1322',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 18,
  },
  totalBannerLeft: {
    flex: 1,
    marginRight: 12,
  },
  totalBannerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.0,
  },
  totalBannerSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 4,
  },
  totalBannerAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#F59E0B',
    letterSpacing: -0.5,
  },

  /* 5. UPI / Scan To Pay Card */
  upiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
  },
  qrDashedBox: {
    width: 96,
    height: 96,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  qrFallbackCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrFallbackText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 4,
    letterSpacing: 0.5,
  },

  upiDetailsCol: {
    flex: 1,
  },
  upiScanLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.0,
  },
  upiAmountText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  upiIdChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  upiIdText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  upiAppNote: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 6,
  },

  /* 6. Footer */
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  footerLeftText: {
    fontSize: 9,
    fontWeight: '500',
    color: '#94A3B8',
    flex: 1,
    marginRight: 8,
  },
  footerRightText: {
    fontSize: 9,
    fontWeight: '500',
    color: '#94A3B8',
  },
});
