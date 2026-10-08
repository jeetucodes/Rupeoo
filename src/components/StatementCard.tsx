import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Clipboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Toast from 'react-native-toast-message';
import {
  StatementCalculationResult,
  formatIndianCurrency,
} from '@/lib/statementCalculator';

export interface StatementCardProps {
  data: StatementCalculationResult;
  width?: number;
  onCopyUpi?: () => void;
  isCaptureMode?: boolean;
}

export const StatementCard: React.FC<StatementCardProps> = ({
  data,
  width = 390,
  onCopyUpi,
  isCaptureMode = false,
}) => {
  const {
    statementId,
    generatedDateStr,
    generatedTimestampStr,
    lender,
    borrower,
    directionTitle,
    principalAmount,
    entryDateStr,
    hasInterest,
    interestPercent,
    interestPeriodLabel,
    interestStartDateStr,
    accruedInterest,
    hasPayments,
    paymentsReceived,
    totalPaymentsReceived,
    remainingDue,
    isSettled,
    settledDateStr,
    overpaidAmount,
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

  return (
    <View style={[styles.cardContainer, { width }]}>
      {/* Subtle Warm Yellow Watermark in top right */}
      <View style={styles.watermarkContainer} pointerEvents="none">
        <Text style={styles.watermarkText}>₹</Text>
      </View>

      {/* 1. HEADER */}
      <View style={styles.headerRow}>
        <View style={styles.brandLeft}>
          <View style={styles.logoTile}>
            <Text style={styles.logoGlyph}>₹</Text>
          </View>
          <View style={styles.brandTitleCol}>
            <View style={styles.brandNameRow}>
              <Text style={styles.brandNameRupeo}>Rupeo </Text>
              <Text style={styles.brandNameKhata}>Khata</Text>
            </View>
            <Text style={styles.brandSubtitle}>OFFICIAL FINANCIAL STATEMENT</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.idChip}>
            <Text style={styles.idChipText}>{statementId}</Text>
          </View>
          <Text style={styles.dateText}>{generatedDateStr}</Text>
        </View>
      </View>

      {/* 2. LENDER & BORROWER CARDS SIDE-BY-SIDE */}
      <View style={styles.partiesRow}>
        {/* LENDER */}
        <View style={styles.partyCard}>
          <Text style={styles.partyRoleLabel}>LENDER</Text>
          <View style={styles.partyInfoRow}>
            <View style={[styles.partyAvatar, styles.lenderAvatar]}>
              <Text style={styles.partyAvatarText}>{lender.initials}</Text>
            </View>
            <View style={styles.partyTextCol}>
              <Text style={styles.partyName} numberOfLines={1}>
                {lender.name}
              </Text>
              {lender.phone ? (
                <View style={styles.partyPhoneRow}>
                  <Ionicons name="flash" size={10} color="#EAB308" style={{ marginRight: 2 }} />
                  <Text style={styles.partyPhone} numberOfLines={1}>
                    {lender.phone}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* BORROWER */}
        <View style={styles.partyCard}>
          <Text style={styles.partyRoleLabel}>BORROWER</Text>
          <View style={styles.partyInfoRow}>
            <View style={[styles.partyAvatar, styles.borrowerAvatar]}>
              <Text style={styles.partyAvatarText}>{borrower.initials}</Text>
            </View>
            <View style={styles.partyTextCol}>
              <Text style={styles.partyName} numberOfLines={1}>
                {borrower.name}
              </Text>
              {borrower.phone ? (
                <Text style={styles.partyPhone} numberOfLines={1}>
                  {borrower.phone}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {/* 3. PRINCIPAL AMOUNT CARD */}
      <View style={styles.principalCard}>
        <View style={styles.principalLeft}>
          <View style={styles.coinIconBox}>
            <Ionicons name="server" size={18} color="#D97706" />
          </View>
          <View style={styles.principalTextCol}>
            <Text style={styles.sectionLabelSmall}>PRINCIPAL AMOUNT</Text>
            <Text style={styles.principalTitle}>{directionTitle}</Text>
            <Text style={styles.entryDateSub}>Date: {entryDateStr}</Text>
          </View>
        </View>

        <View style={styles.principalDivider} />

        <View style={styles.principalRight}>
          <Text style={styles.principalAmountText}>
            {formatIndianCurrency(principalAmount)}
          </Text>
        </View>
      </View>

      {/* 4. INTEREST CARD (CONDITIONAL) */}
      {hasInterest && accruedInterest > 0 && (
        <View style={styles.interestCard}>
          <View style={styles.interestLeft}>
            <View style={styles.percentIconBox}>
              <Ionicons name="pie-chart" size={17} color="#16A34A" />
            </View>
            <View style={styles.interestTextCol}>
              <Text style={styles.interestLabelSmall}>INTEREST</Text>
              <Text style={styles.interestTitle} numberOfLines={1}>
                Accrued Interest ({interestPercent}%{interestPeriodLabel || '/mo'})
              </Text>
              <Text style={styles.interestDateSub}>
                Active since {interestStartDateStr}
              </Text>
            </View>
          </View>

          <View style={styles.interestRight}>
            <Text style={styles.interestAmountText}>
              +{formatIndianCurrency(accruedInterest)}
            </Text>
          </View>
        </View>
      )}

      {/* 5. PAYMENTS RECEIVED CARD (CONDITIONAL) */}
      {hasPayments && (
        <View style={styles.paymentsCard}>
          <View style={styles.paymentsHeaderRow}>
            <Text style={styles.paymentsLabelSmall}>PAYMENTS RECEIVED</Text>
            <Text style={styles.paymentsTotalText}>
              -{formatIndianCurrency(totalPaymentsReceived)}
            </Text>
          </View>

          <View style={styles.paymentsList}>
            {paymentsReceived.slice(0, 3).map((p) => (
              <View key={p.id} style={styles.paymentRowItem}>
                <View style={styles.paymentRowLeft}>
                  <Text style={styles.paymentDateText}>{p.date}</Text>
                  {p.paymentMode ? (
                    <View style={styles.paymentModeChip}>
                      <Text style={styles.paymentModeText}>{p.paymentMode}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.paymentAmountText}>
                  -{formatIndianCurrency(p.amount)}
                </Text>
              </View>
            ))}
            {paymentsReceived.length > 3 && (
              <Text style={styles.morePaymentsText}>
                +{paymentsReceived.length - 3} more payments recorded
              </Text>
            )}
          </View>
        </View>
      )}

      {/* 6. DARK SUMMARY CARD OR SETTLED BADGE */}
      {!isSettled ? (
        <View style={styles.darkSummaryCard}>
          <View style={styles.darkSummaryLeft}>
            <View style={styles.walletIconBox}>
              <Ionicons name="wallet" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.darkSummaryTextCol}>
              <Text style={styles.darkSummaryLabel}>NET REMAINING BALANCE DUE</Text>
              <Text style={styles.darkSummaryStatus}>{statusText}</Text>
            </View>
          </View>

          <View style={styles.darkSummaryRight}>
            <Text style={styles.darkSummaryAmountText}>
              {formatIndianCurrency(remainingDue)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.settledCard}>
          <View style={styles.settledLeft}>
            <View style={styles.settledIconBox}>
              <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
            </View>
            <View style={styles.settledTextCol}>
              <Text style={styles.settledTitle}>SETTLED IN FULL</Text>
              <Text style={styles.settledSub}>
                {settledDateStr ? `All dues cleared on ${settledDateStr}` : 'All dues cleared'}
              </Text>
              {overpaidAmount > 0 && (
                <Text style={styles.overpaidText}>
                  Overpaid by {formatIndianCurrency(overpaidAmount)}
                </Text>
              )}
            </View>
          </View>
          <Text style={styles.settledAmountText}>₹0</Text>
        </View>
      )}

      {/* 7. PAYMENT SECTION & SCANNABLE QR (CONDITIONAL) */}
      {shouldShowPaymentSection && upiId && upiUri && (
        <View style={styles.paymentSectionContainer}>
          {/* UPI ID Pill Row */}
          <View style={styles.upiPillCard}>
            <View style={styles.upiPillLeft}>
              <View style={styles.flagIconBox}>
                <Ionicons name="card-outline" size={16} color="#0F172A" />
              </View>
              <View style={styles.upiPillTextCol}>
                <Text style={styles.upiPillLabel}>UPI ID</Text>
                <Text style={styles.upiPillValue} numberOfLines={1}>
                  {upiId}
                </Text>
              </View>
              {!isCaptureMode ? (
                <TouchableOpacity
                  onPress={handleCopyUpi}
                  activeOpacity={0.7}
                  style={styles.copyBtn}
                >
                  <Ionicons name="copy-outline" size={14} color="#64748B" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.upiPillDivider} />

            <View style={styles.upiPillRight}>
              <Text style={styles.acceptedOnLabel}>Accepted on</Text>
              <Text style={styles.acceptedAppsText}>GPay • PhonePe • Paytm</Text>
            </View>
          </View>

          {/* Scannable UPI QR Box */}
          <View style={styles.qrCardBox}>
            <View style={styles.qrInnerFrame}>
              <QRCode
                value={upiUri}
                size={144}
                color="#0F172A"
                backgroundColor="#FFFFFF"
                quietZone={6}
                ecl="H"
                logo={require('../../assets/images/rupeo-qr-emblem.png')}
                logoSize={32}
                logoBackgroundColor="#FFFFFF"
                logoMargin={2}
                logoBorderRadius={6}
              />
            </View>

            <Text style={styles.qrScanInstruction}>
              Scan to pay {formatIndianCurrency(remainingDue)}
            </Text>
            <Text style={styles.qrUpiSubtext}>{upiId}</Text>
          </View>

          {/* Pay With Row */}
          <View style={styles.payWithRow}>
            <Text style={styles.payWithLabel}>Scan with any UPI app</Text>
            <View style={styles.brandLogosRow}>
              <Image
                source={require('../../assets/payment-logos/gpay.png')}
                style={styles.paymentLogoImg}
              />
              <Image
                source={require('../../assets/payment-logos/phonepe.png')}
                style={styles.paymentLogoImg}
              />
              <Image
                source={require('../../assets/payment-logos/paytm.png')}
                style={styles.paymentLogoImg}
              />
            </View>
          </View>
        </View>
      )}

      {/* 8. NEUTRAL TRUST STRIP */}
      <View style={styles.trustStripCard}>
        <Ionicons name="shield-checkmark" size={16} color="#0284C7" style={{ marginRight: 8 }} />
        <View style={styles.trustStripTextCol}>
          <Text style={styles.trustStripTitle}>
            RUPEO KHATA • FINANCIAL RECORD
          </Text>
          <Text style={styles.trustStripSub}>
            Generated by Rupeo Khata on {generatedTimestampStr}
          </Text>
        </View>
      </View>

      {/* 9. FOOTER */}
      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          <View style={styles.footerLogoTile}>
            <Text style={styles.footerLogoGlyph}>₹</Text>
          </View>
          <View>
            <Text style={styles.footerBrandTitle}>Rupeo Khata</Text>
            <Text style={styles.footerBrandSub}>Your Personal Finance Record</Text>
          </View>
        </View>
        <View style={styles.footerRight}>
          <Text style={styles.footerDisclaimer}>
            This is a system generated statement and does not require a signature.
          </Text>
        </View>
      </View>

      {/* 10. BOTTOM SOFT AMBER/YELLOW WAVE */}
      <View style={styles.bottomWaveSvgContainer} pointerEvents="none">
        <Svg width={width} height={38} viewBox="0 0 390 38" fill="none">
          <Path
            d="M0 18C80 34 180 4 280 26C330 37 360 28 390 20V38H0V18Z"
            fill="url(#cardBotWave)"
            opacity={0.65}
          />
          <Defs>
            <SvgLinearGradient id="cardBotWave" x1="0" y1="10" x2="390" y2="38" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#FEF08A" />
              <Stop offset="0.5" stopColor="#FDE047" />
              <Stop offset="1" stopColor="#FBBF24" />
            </SvgLinearGradient>
          </Defs>
        </Svg>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  watermarkContainer: {
    position: 'absolute',
    top: 6,
    right: 22,
    zIndex: 0,
  },
  watermarkText: {
    fontSize: 98,
    fontWeight: '900',
    color: 'rgba(245, 158, 11, 0.09)',
    lineHeight: 110,
  },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    zIndex: 1,
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoTile: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  logoGlyph: {
    color: '#FFD740',
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 28,
  },
  brandTitleCol: {
    justifyContent: 'center',
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNameRupeo: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  brandNameKhata: {
    fontSize: 22,
    fontWeight: '900',
    color: '#D97706',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1.1,
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  idChip: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 14,
    marginBottom: 4,
  },
  idChipText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  dateText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },

  /* Parties Row */
  partiesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    zIndex: 1,
  },
  partyCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  partyRoleLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  partyInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  partyAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lenderAvatar: {
    backgroundColor: '#0F172A',
  },
  borrowerAvatar: {
    backgroundColor: '#38BDF8',
  },
  partyAvatarText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  partyTextCol: {
    flex: 1,
    minWidth: 0,
  },
  partyName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  partyPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  partyPhone: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },

  /* Principal Card */
  principalCard: {
    backgroundColor: '#FFFDF0',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    zIndex: 1,
  },
  principalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  coinIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  principalTextCol: {
    flex: 1,
  },
  sectionLabelSmall: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  principalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  entryDateSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  principalDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 12,
  },
  principalRight: {
    alignItems: 'flex-end',
  },
  principalAmountText: {
    fontSize: 25,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },

  /* Interest Card */
  interestCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    zIndex: 1,
  },
  interestLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  percentIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  interestTextCol: {
    flex: 1,
  },
  interestLabelSmall: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.6,
  },
  interestTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  interestDateSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  interestRight: {
    alignItems: 'flex-end',
  },
  interestAmountText: {
    fontSize: 23,
    fontWeight: '900',
    color: '#16A34A',
    letterSpacing: -0.5,
  },

  /* Payments Received Card */
  paymentsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
    zIndex: 1,
  },
  paymentsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  paymentsLabelSmall: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  paymentsTotalText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  paymentsList: {
    gap: 4,
  },
  paymentRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F1F5F9',
  },
  paymentRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  paymentModeChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  paymentModeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2563EB',
  },
  paymentAmountText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  morePaymentsText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },

  /* Dark Summary Card */
  darkSummaryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    zIndex: 1,
  },
  darkSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  walletIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkSummaryTextCol: {
    flex: 1,
  },
  darkSummaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  darkSummaryStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  darkSummaryRight: {
    alignItems: 'flex-end',
  },
  darkSummaryAmountText: {
    fontSize: 27,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: -0.5,
  },

  /* Settled Card */
  settledCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    zIndex: 1,
  },
  settledLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  settledIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settledTextCol: {
    flex: 1,
  },
  settledTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#15803D',
    letterSpacing: 0.6,
  },
  settledSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#166534',
    marginTop: 1,
  },
  overpaidText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 2,
  },
  settledAmountText: {
    fontSize: 25,
    fontWeight: '900',
    color: '#16A34A',
  },

  /* Payment Section Container */
  paymentSectionContainer: {
    marginBottom: 14,
    zIndex: 1,
  },
  upiPillCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  upiPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1.1,
    minWidth: 0,
  },
  flagIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiPillTextCol: {
    flex: 1,
    minWidth: 0,
  },
  upiPillLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  upiPillValue: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  copyBtn: {
    padding: 4,
  },
  upiPillDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },
  upiPillRight: {
    flex: 0.9,
    alignItems: 'flex-end',
  },
  acceptedOnLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
  },
  acceptedAppsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
    marginTop: 1,
  },

  /* QR Box */
  qrCardBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  qrInnerFrame: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  qrScanInstruction: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  qrUpiSubtext: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },

  /* Pay With Row */
  payWithRow: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  payWithLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  brandLogosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  paymentLogoImg: {
    width: 58,
    height: 22,
    resizeMode: 'contain',
  },

  /* Neutral Trust Strip */
  trustStripCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    zIndex: 1,
  },
  trustStripTextCol: {
    flex: 1,
  },
  trustStripTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.5,
  },
  trustStripSub: {
    fontSize: 9,
    fontWeight: '600',
    color: '#475569',
    marginTop: 1,
  },

  /* Footer */
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    zIndex: 1,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerLogoTile: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLogoGlyph: {
    color: '#FFD740',
    fontSize: 13,
    fontWeight: '900',
  },
  footerBrandTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  footerBrandSub: {
    fontSize: 8.5,
    color: '#64748B',
  },
  footerRight: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  footerDisclaimer: {
    fontSize: 8,
    color: '#94A3B8',
    textAlign: 'right',
    lineHeight: 11,
  },

  /* Bottom Wave */
  bottomWaveSvgContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    zIndex: 0,
  },
});
