import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SavedQrPaymentCard } from '@/lib/savedQrPayments';

interface SavedQrCardItemProps {
  card: SavedQrPaymentCard;
  onViewQrs: (card: SavedQrPaymentCard) => void;
  onMarkPaid: (card: SavedQrPaymentCard) => void;
  onDelete: (cardId: string) => void;
  isProcessing?: boolean;
}

export const SavedQrCardItem: React.FC<SavedQrCardItemProps> = ({
  card,
  onViewQrs,
  onMarkPaid,
  onDelete,
  isProcessing,
}) => {
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const isPaid = card.status === 'paid';
  const createdDate = new Date(card.createdAt);
  const formattedDate = createdDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleDeletePrompt = () => {
    setIsDeleteModalVisible(true);
  };

  const displayName = card.payeeName?.trim() || card.upiId;
  const avatarLetter = (displayName[0] || '₹').toUpperCase();

  return (
    <View style={[styles.card, isPaid && styles.cardPaid]}>
      {/* Top Accent Line */}
      <View style={[styles.cardAccentBar, isPaid ? styles.cardAccentBarPaid : styles.cardAccentBarPending]} />

      {/* Header Row: Payee info + Status Badge */}
      <View style={styles.headerRow}>
        <View style={styles.payeeInfo}>
          {/* Avatar initial badge */}
          <View style={[styles.avatarCircle, isPaid && styles.avatarCirclePaid]}>
            <Text style={[styles.avatarText, isPaid && styles.avatarTextPaid]}>{avatarLetter}</Text>
          </View>

          <View style={styles.payeeTextColumn}>
            <Text style={styles.payeeTitle} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.upiPill}>
              <Ionicons name="at" size={11} color="#64748B" />
              <Text style={styles.upiPillText} numberOfLines={1}>
                {card.upiId}
              </Text>
            </View>
          </View>
        </View>

        {/* Status Badge */}
        <View style={[styles.statusBadge, isPaid ? styles.statusBadgePaid : styles.statusBadgePending]}>
          <View style={[styles.statusDot, isPaid ? styles.statusDotPaid : styles.statusDotPending]} />
          <Text style={[styles.statusText, isPaid ? styles.statusTextPaid : styles.statusTextPending]}>
            {isPaid ? 'PAID & RECORDED' : 'PENDING'}
          </Text>
        </View>
      </View>

      {/* Amount Hero Section */}
      <View style={styles.amountHeroContainer}>
        <View style={styles.amountLeft}>
          <Text style={styles.amountLabel}>BILL AMOUNT</Text>
          <View style={styles.amountValueRow}>
            <Text style={styles.currencySymbol}>₹</Text>
            <Text style={styles.amountValue}>{card.totalAmountFormatted}</Text>
            <View style={styles.inrTag}>
              <Text style={styles.inrTagText}>INR</Text>
            </View>
          </View>
        </View>

        <View style={styles.partsBadge}>
          <Ionicons name="git-network-outline" size={13} color="#2563EB" style={{ marginRight: 4 }} />
          <Text style={styles.partsBadgeText}>
            {card.totalParts} {card.totalParts === 1 ? 'QR Pass' : 'Split Passes'}
          </Text>
        </View>
      </View>

      {/* Mini Split Parts Breakdown Pills (if multiple parts) */}
      {card.totalParts > 1 && card.parts && card.parts.length > 0 && (
        <View style={styles.partsBreakdownContainer}>
          <Text style={styles.partsBreakdownLabel}>SPLIT BREAKDOWN:</Text>
          <View style={styles.partsPillsRow}>
            {card.parts.map((p, idx) => (
              <View key={p.id || idx} style={[styles.partPill, p.isPaid && styles.partPillPaid]}>
                <View style={[styles.partPillDot, p.isPaid && styles.partPillDotPaid]} />
                <Text style={[styles.partPillText, p.isPaid && styles.partPillTextPaid]}>
                  Part {p.partIndex}: ₹{p.amountFormatted}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Note (if present) */}
      {card.note ? (
        <View style={styles.noteBox}>
          <Ionicons name="document-text-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
          <Text style={styles.noteText} numberOfLines={2}>
            "{card.note}"
          </Text>
        </View>
      ) : null}

      {/* Timestamp row */}
      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={12} color="#94A3B8" style={{ marginRight: 4 }} />
        <Text style={styles.dateText}>Created {formattedDate}</Text>
        {isPaid && card.paidAt && (
          <Text style={styles.paidAtText}>
            · Paid {new Date(card.paidAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      {/* Action Buttons Row */}
      <View style={styles.actionsRow}>
        {/* View QRs Button */}
        <TouchableOpacity
          style={styles.viewQrBtn}
          onPress={() => onViewQrs(card)}
          activeOpacity={0.8}
        >
          <Ionicons name="qr-code-outline" size={15} color="#2563EB" style={{ marginRight: 6 }} />
          <Text style={styles.viewQrBtnText}>View QRs</Text>
        </TouchableOpacity>

        {/* Mark as Paid / Already Recorded button */}
        {!isPaid ? (
          <TouchableOpacity
            style={[styles.markPaidBtn, isProcessing && styles.markPaidBtnDisabled]}
            onPress={() => onMarkPaid(card)}
            disabled={isProcessing}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.markPaidBtnText}>
              {isProcessing ? 'Recording...' : 'Paid · Add to Rupeo'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.alreadyPaidPill}>
            <Ionicons name="shield-checkmark" size={15} color="#15803D" style={{ marginRight: 6 }} />
            <Text style={styles.alreadyPaidText}>Recorded in Rupeo</Text>
          </View>
        )}

        {/* Delete button: Clear red styling, accessible touch target */}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDeletePrompt}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.75}
        >
          <Ionicons name="trash-outline" size={17} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* Custom In-App Delete Confirmation Modal with Cancel & Confirm */}
      <Modal
        visible={isDeleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDeleteModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* Red Warning Icon */}
            <View style={styles.modalIconCircle}>
              <Ionicons name="trash" size={26} color="#EF4444" />
            </View>

            {/* Modal Title */}
            <Text style={styles.modalTitle}>Delete Payment Card?</Text>

            {/* Modal Description */}
            <Text style={styles.modalDescription}>
              Are you sure you want to delete the saved card for{' '}
              <Text style={{ fontWeight: '800', color: '#0F172A' }}>{displayName}</Text> (₹{card.totalAmountFormatted})?
            </Text>

            {/* Buttons: Cancel & Confirm */}
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsDeleteModalVisible(false)}
                activeOpacity={0.75}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => {
                  setIsDeleteModalVisible(false);
                  onDelete(card.id);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  cardPaid: {
    borderColor: '#BBF7D0',
    backgroundColor: '#FAFDFB',
  },
  cardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3.5,
  },
  cardAccentBarPending: {
    backgroundColor: '#3B82F6',
  },
  cardAccentBarPaid: {
    backgroundColor: '#10B981',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 2,
  },
  payeeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.2,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCirclePaid: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2563EB',
  },
  avatarTextPaid: {
    color: '#059669',
  },
  payeeTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  payeeTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  upiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
    alignSelf: 'flex-start',
    gap: 2,
    maxWidth: '100%',
  },
  upiPillText: {
    fontSize: 10.5,
    color: '#475569',
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgePending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusBadgePaid: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotPending: {
    backgroundColor: '#D97706',
  },
  statusDotPaid: {
    backgroundColor: '#16A34A',
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusTextPending: {
    color: '#B45309',
  },
  statusTextPaid: {
    color: '#15803D',
  },
  amountHeroContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  amountLeft: {
    gap: 2,
  },
  amountLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  amountValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  amountValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  inrTag: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginLeft: 4,
  },
  inrTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
  },
  partsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  partsBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  partsBreakdownContainer: {
    marginBottom: 10,
  },
  partsBreakdownLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  partsPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  partPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  partPillPaid: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  partPillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#94A3B8',
    marginRight: 5,
  },
  partPillDotPaid: {
    backgroundColor: '#16A34A',
  },
  partPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  partPillTextPaid: {
    color: '#15803D',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  noteText: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 2,
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  paidAtText: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  viewQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#BFDBFE',
  },
  viewQrBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  markPaidBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 3,
  },
  markPaidBtnDisabled: {
    opacity: 0.6,
  },
  markPaidBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  alreadyPaidPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCFCE7',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  alreadyPaidText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.2,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
