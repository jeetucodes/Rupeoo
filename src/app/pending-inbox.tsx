import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import {
  PendingAlertItem,
  getPendingAlerts,
  confirmPendingAlert,
  dismissPendingAlert,
  clearAllPendingAlerts,
} from '@/lib/pendingInbox';
import { defaultCategories } from '@/lib/database';

export default function PendingInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const userId = user?.uid || 'local';

  const [alerts, setAlerts] = useState<PendingAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<PendingAlertItem | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMerchant, setEditMerchant] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editType, setEditType] = useState<'expense' | 'income'>('expense');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getPendingAlerts(userId);
      setAlerts(list);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const [selectedBillMatches, setSelectedBillMatches] = useState<Record<string, string | null>>({});

  const handleConfirm = async (item: PendingAlertItem) => {
    setActionLoadingId(item.id);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    const chosenBillId =
      selectedBillMatches[item.id] !== undefined
        ? (selectedBillMatches[item.id] === 'none' ? null : selectedBillMatches[item.id])
        : (item.suggestedBillId || item.billId || null);

    const success = await confirmPendingAlert(userId, item.id, {
      billId: chosenBillId,
    });
    setActionLoadingId(null);

    if (success) {
      setAlerts(prev => prev.filter(a => a.id !== item.id));
      if (chosenBillId) {
        const matched = item.candidateBills?.find((b: any) => b.id === chosenBillId);
        Toast.show({
          type: 'success',
          text1: 'Bill Marked Paid ✅',
          text2: `${matched?.title || 'Bill'} marked as paid & transaction linked.`,
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Transaction Added',
          text2: `Added ₹${item.alert.amount} to transactions.`,
        });
      }
    } else {
      Toast.show({
        type: 'error',
        text1: 'Failed to Add',
        text2: 'Could not record transaction. Please try again.',
      });
    }
  };

  const handleDismiss = async (item: PendingAlertItem) => {
    setActionLoadingId(item.id);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    await dismissPendingAlert(userId, item.id);
    setActionLoadingId(null);
    setAlerts(prev => prev.filter(a => a.id !== item.id));

    Toast.show({
      type: 'info',
      text1: 'Alert Dismissed',
      text2: 'Item removed from inbox.',
    });
  };

  const openEditModal = (item: PendingAlertItem) => {
    setEditingItem(item);
    setEditAmount(String(item.alert.amount || ''));
    setEditMerchant(item.alert.merchantNormalized || item.alert.merchant || '');
    setEditCategory(item.alert.category || 'Others');
    setEditType(item.alert.type === 'income' ? 'income' : 'expense');
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    const numAmt = parseFloat(editAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Invalid amount',
        text2: 'Please enter a valid amount.',
      });
      return;
    }

    setActionLoadingId(editingItem.id);
    const success = await confirmPendingAlert(userId, editingItem.id, {
      amount: numAmt,
      merchant_name: editMerchant.trim() || undefined,
      category: editCategory,
      type: editType === 'income' ? 'income' : 'expense',
    });

    setActionLoadingId(null);
    setEditingItem(null);

    if (success) {
      setAlerts(prev => prev.filter(a => a.id !== editingItem.id));
      Toast.show({
        type: 'success',
        text1: 'Updated & Added',
        text2: `Added ₹${numAmt} to transactions.`,
      });
    }
  };

  const handleAddAll = async () => {
    if (alerts.length === 0) return;
    setLoading(true);

    let count = 0;
    for (const alertItem of alerts) {
      const ok = await confirmPendingAlert(userId, alertItem.id);
      if (ok) count++;
    }

    await loadAlerts();
    Toast.show({
      type: 'success',
      text1: 'All Alerts Added',
      text2: `Successfully added ${count} transactions.`,
    });
  };

  const handleClearAll = async () => {
    if (alerts.length === 0) return;
    await clearAllPendingAlerts(userId);
    setAlerts([]);
    Toast.show({
      type: 'info',
      text1: 'Inbox Cleared',
      text2: 'All pending alerts dismissed.',
    });
  };

  const renderItem = ({ item }: { item: PendingAlertItem }) => {
    const isIncome = item.alert.type === 'income';
    const isBusy = actionLoadingId === item.id;
    const confidencePct = Math.round(item.alert.confidence * 100);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.senderWrap}>
            <View style={[styles.senderDot, { backgroundColor: isIncome ? '#16A34A' : '#DC2626' }]} />
            <Text style={styles.senderText}>{item.alert.sender}</Text>
          </View>
          <View style={[
            styles.confBadge,
            { backgroundColor: item.alert.confidence >= 0.9 ? '#ECFDF5' : '#FEF3C7' }
          ]}>
            <Text style={[
              styles.confText,
              { color: item.alert.confidence >= 0.9 ? '#059669' : '#D97706' }
            ]}>
              {confidencePct}% Match
            </Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          <View style={styles.mainInfo}>
            <Text style={styles.merchantText} numberOfLines={1}>
              {item.alert.merchantNormalized || item.alert.merchant || 'Bank Transaction'}
            </Text>
            <Text style={styles.metaText}>
              {item.alert.category} • {item.alert.channel.toUpperCase()}
              {item.alert.accountLast4 ? ` • *${item.alert.accountLast4}` : ''}
            </Text>
          </View>

          <View style={styles.amountWrap}>
            <Text style={[styles.amountText, { color: isIncome ? '#16A34A' : '#0F172A' }]}>
              {isIncome ? '+' : '-'}₹{item.alert.amount?.toLocaleString('en-IN') || '0'}
            </Text>
          </View>
        </View>

        {/* Bill Matching Prompt */}
        {item.candidateBills && item.candidateBills.length > 0 && (
          <View style={styles.billMatchBox}>
            <View style={styles.billMatchHeader}>
              <Ionicons name="receipt-outline" size={15} color="#4F46E5" />
              <Text style={styles.billMatchTitle}>Match to Bill?</Text>
            </View>
            <View style={styles.billCandidatesList}>
              {item.candidateBills.map((b: any) => {
                const isSelected =
                  (selectedBillMatches[item.id] !== undefined
                    ? selectedBillMatches[item.id] === b.id
                    : (item.suggestedBillId === b.id || item.billId === b.id));
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.billCandidateCard, isSelected && styles.billCandidateCardActive]}
                    onPress={() => setSelectedBillMatches(prev => ({ ...prev, [item.id]: b.id }))}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.billRadio, isSelected && styles.billRadioActive]}>
                      {isSelected && <View style={styles.billRadioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billCandidateTitle} numberOfLines={1}>{b.title}</Text>
                      <Text style={styles.billCandidateMeta}>Due: {b.nextDueDate} • ₹{b.amount}</Text>
                    </View>
                    {b.id === item.suggestedBillId && (
                      <View style={styles.suggestedBadge}>
                        <Text style={styles.suggestedBadgeText}>Suggested</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.billCandidateCard,
                  selectedBillMatches[item.id] === 'none' && styles.billCandidateCardActive,
                ]}
                onPress={() => setSelectedBillMatches(prev => ({ ...prev, [item.id]: 'none' }))}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.billRadio,
                    selectedBillMatches[item.id] === 'none' && styles.billRadioActive,
                  ]}
                >
                  {selectedBillMatches[item.id] === 'none' && <View style={styles.billRadioInner} />}
                </View>
                <Text style={styles.notABillText}>Not a bill (Standard expense)</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={() => handleDismiss(item)}
            disabled={isBusy}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color="#64748B" />
            <Text style={styles.dismissBtnText}>Dismiss</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => openEditModal(item)}
            disabled={isBusy}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={16} color="#2563EB" />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => handleConfirm(item)}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.addBtnText}>Add</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Review Pending Alerts</Text>
          <Text style={styles.headerSubtitle}>
            {alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'} awaiting your confirmation
          </Text>
        </View>
      </View>

      {/* Top Bulk Action Bar */}
      {alerts.length > 0 && (
        <View style={styles.bulkBar}>
          <TouchableOpacity style={styles.bulkBtnAdd} onPress={handleAddAll} activeOpacity={0.8}>
            <Ionicons name="checkmark-done" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.bulkBtnAddText}>Confirm All ({alerts.length})</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.bulkBtnClear} onPress={handleClearAll} activeOpacity={0.8}>
            <Text style={styles.bulkBtnClearText}>Dismiss All</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading inbox alerts...</Text>
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="mail-open-outline" size={38} color="#6366F1" />
          </View>
          <Text style={styles.emptyTitle}>Inbox is Clean</Text>
          <Text style={styles.emptySubtitle}>
            No unconfirmed bank or UPI alerts waiting for review. Verified high-confidence alerts are auto-added directly to your dashboard.
          </Text>
          <TouchableOpacity
            style={styles.importShortcutBtn}
            onPress={() => router.push('/sms-import')}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubbles-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.importShortcutBtnText}>Missed something? Import from messages</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.listFooterFallbackBtn}
              onPress={() => router.push('/sms-import')}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubbles-outline" size={17} color="#4F46E5" style={{ marginRight: 6 }} />
              <Text style={styles.listFooterFallbackText}>Missed something? Import from messages</Text>
            </TouchableOpacity>
          }
        />
      )}

      {/* Edit Modal */}
      {editingItem && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingItem(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Transaction</Text>
                <TouchableOpacity onPress={() => setEditingItem(null)}>
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Type Switch */}
              <View style={styles.typeSwitchRow}>
                <TouchableOpacity
                  style={[styles.typePill, editType === 'expense' && styles.typePillActiveExpense]}
                  onPress={() => setEditType('expense')}
                >
                  <Text style={[styles.typePillText, editType === 'expense' && styles.typePillTextActive]}>
                    Expense
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typePill, editType === 'income' && styles.typePillActiveIncome]}
                  onPress={() => setEditType('income')}
                >
                  <Text style={[styles.typePillText, editType === 'income' && styles.typePillTextActive]}>
                    Income
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Amount */}
              <Text style={styles.inputLabel}>Amount (₹)</Text>
              <TextInput
                style={styles.input}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                placeholder="0.00"
              />

              {/* Merchant */}
              <Text style={styles.inputLabel}>Payee / Merchant</Text>
              <TextInput
                style={styles.input}
                value={editMerchant}
                onChangeText={setEditMerchant}
                placeholder="Merchant or recipient name"
              />

              {/* Category */}
              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {defaultCategories.map((cat) => {
                  const isSel = editCategory === cat.name;
                  return (
                    <TouchableOpacity
                      key={cat.name}
                      style={[styles.catChip, isSel && styles.catChipActive]}
                      onPress={() => setEditCategory(cat.name)}
                    >
                      <Text style={[styles.catChipText, isSel && styles.catChipTextActive]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleSaveEdit} activeOpacity={0.85}>
                <Text style={styles.modalConfirmBtnText}>Save & Add Transaction</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 6,
    marginRight: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  bulkBtnAdd: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 9,
    borderRadius: 10,
  },
  bulkBtnAddText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bulkBtnClear: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
  },
  bulkBtnClearText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  senderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  senderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  senderText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  confBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  confText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  mainInfo: {
    flex: 1,
    marginRight: 12,
  },
  merchantText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  amountWrap: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 17,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  dismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  dismissBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    gap: 4,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#16A34A',
  },
  addBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  importShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  importShortcutBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  typeSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  typePill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  typePillActiveExpense: {
    backgroundColor: '#FEE2E2',
  },
  typePillActiveIncome: {
    backgroundColor: '#DCFCE7',
  },
  typePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  typePillTextActive: {
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
  },
  catChipActive: {
    backgroundColor: '#4F46E5',
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  catChipTextActive: {
    color: '#FFFFFF',
  },
  modalConfirmBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  listFooterFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginVertical: 16,
  },
  listFooterFallbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  billMatchBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  billMatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  billMatchTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4F46E5',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  billCandidatesList: {
    gap: 6,
  },
  billCandidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  billCandidateCardActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  billRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billRadioActive: {
    borderColor: '#4F46E5',
  },
  billRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4F46E5',
  },
  billCandidateTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  billCandidateMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  suggestedBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  suggestedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338CA',
  },
  notABillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
});
