import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
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
} from '@/lib/pendingInbox';
import {
  getSmsImportSettings,
  saveSmsImportSettings,
} from '@/lib/smsSettings';

// Reused shared components
import { TransactionDraftCard } from '@/features/import/components/TransactionDraftCard';
import { CategorySheet } from '@/features/import/components/CategorySheet';
import { EmptyState } from '@/features/import/components/EmptyState';
import {
  checkNeedsCategory,
  DraftItemLike,
} from '@/features/import/utils/importHelpers';

type FilterTab = 'all' | 'needs_category' | 'bills' | 'duplicates';

export default function PendingInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { user } = useAuth();
  const userId = user?.uid || 'local';

  // Alerts State
  const [alerts, setAlerts] = useState<PendingAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  // Auto-Add Setting state
  const [autoAddEnabled, setAutoAddEnabled] = useState(true);

  // Multi-Select Mode (activated on long-press)
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Category Sheet State
  const [categoryDraft, setCategoryDraft] = useState<DraftItemLike | null>(null);

  // Overrides map for inline edited drafts
  const [draftOverrides, setDraftOverrides] = useState<Record<string, Partial<DraftItemLike>>>({});

  // Load Alerts & Auto-Add Setting
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([
        getPendingAlerts(userId),
        getSmsImportSettings(userId),
      ]);
      setAlerts(list);
      setAutoAddEnabled(settings.autoAddEnabled);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Turn Auto-add on action
  const handleTurnOnAutoAdd = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await saveSmsImportSettings(userId, { autoAddEnabled: true });
      setAutoAddEnabled(true);
      Toast.show({
        type: 'success',
        text1: 'Auto-add is ON ✅',
        text2: 'New financial alerts from notifications will be tracked.',
      });
    } catch { }
  };

  // Convert PendingAlertItem to normalized DraftItemLike
  const normalizedAlerts: DraftItemLike[] = useMemo(() => {
    return alerts.map((item) => {
      const overrides = draftOverrides[item.id] || {};
      const parsed = item.alert;
      const timestamp = item.createdAt || parsed.timestamp || Date.now();

      return {
        id: item.id,
        amount: overrides.amount ?? parsed.amount ?? 0,
        type: overrides.type ?? parsed.type ?? 'expense',
        merchant: overrides.merchant ?? parsed.merchantNormalized ?? parsed.merchant ?? 'Payment',
        category: overrides.category ?? parsed.category ?? 'Others',
        bankName: parsed.sender || 'Bank Alert',
        accountLast4: parsed.accountLast4,
        date: timestamp,
        channel: parsed.channel,
        confidence: parsed.confidence,
        refNo: parsed.refNo,
        rawText: parsed.rawText,
        selected: selectedIds.has(item.id),
        isAlreadyAdded: false,
        isLowConfidence: parsed.confidence < 0.8,
        matchedBillTitle: item.suggestedBillId || item.candidateBills?.[0]?.title || null,
        candidateBills: item.candidateBills,
      };
    });
  }, [alerts, draftOverrides, selectedIds]);

  // Filter counts
  const filterCounts = useMemo(() => {
    let needsCat = 0;
    let bills = 0;
    let dupes = 0;

    for (const item of normalizedAlerts) {
      if (checkNeedsCategory(item.category)) needsCat++;
      if (item.matchedBillTitle || (item.candidateBills && item.candidateBills.length > 0)) bills++;
      if (item.isAlreadyAdded) dupes++;
    }

    return {
      all: normalizedAlerts.length,
      needs_category: needsCat,
      bills,
      duplicates: dupes,
    };
  }, [normalizedAlerts]);

  // Filtered list based on active tab
  const filteredAlerts = useMemo(() => {
    switch (activeFilter) {
      case 'needs_category':
        return normalizedAlerts.filter((item) => checkNeedsCategory(item.category));
      case 'bills':
        return normalizedAlerts.filter(
          (item) => item.matchedBillTitle || (item.candidateBills && item.candidateBills.length > 0)
        );
      case 'duplicates':
        return normalizedAlerts.filter((item) => item.isAlreadyAdded);
      case 'all':
      default:
        return normalizedAlerts;
    }
  }, [normalizedAlerts, activeFilter]);

  // Ready items eligible for "Add all ready (N)"
  const readyAlerts = useMemo(() => {
    return normalizedAlerts.filter(
      (item) => (item.confidence === undefined || item.confidence >= 0.8) && !checkNeedsCategory(item.category)
    );
  }, [normalizedAlerts]);

  // Group by day ("Today", "Yesterday", formatted date)
  const groupedByDay = useMemo(() => {
    const groups: Array<{ dayLabel: string; items: DraftItemLike[] }> = [];
    const map = new Map<string, DraftItemLike[]>();

    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    for (const item of filteredAlerts) {
      const d = new Date(item.date);
      let label = '';
      if (d.toDateString() === todayStr) {
        label = 'Today';
      } else if (d.toDateString() === yesterdayStr) {
        label = 'Yesterday';
      } else {
        label = d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }

      if (!map.has(label)) {
        map.set(label, []);
      }
      map.get(label)!.push(item);
    }

    for (const [dayLabel, items] of map.entries()) {
      groups.push({ dayLabel, items });
    }

    return groups;
  }, [filteredAlerts]);

  // Confirm Single Item Action
  const handleConfirmSingle = async (item: DraftItemLike) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    const overrides = draftOverrides[item.id];
    const successId = await confirmPendingAlert(userId, item.id, {
      amount: item.amount,
      category: item.category ?? undefined,
      merchant_name: item.merchant ?? undefined,
      type: item.type as any,
    });

    if (successId) {
      setAlerts((prev) => prev.filter((a) => a.id !== item.id));
      Toast.show({
        type: 'success',
        text1: 'Transaction Added ✅',
        text2: `Added ${item.merchant || 'Payment'} to transactions.`,
      });
    } else {
      Toast.show({
        type: 'error',
        text1: 'Failed to Add',
        text2: 'Could not record transaction. Please try again.',
      });
    }
  };

  // Dismiss / Ignore Single Item Action
  const handleIgnoreSingle = async (item: DraftItemLike) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    await dismissPendingAlert(userId, item.id);
    setAlerts((prev) => prev.filter((a) => a.id !== item.id));
    Toast.show({
      type: 'info',
      text1: 'Alert Ignored',
      text2: 'This payment alert was dismissed.',
    });
  };

  // Bulk Add All Ready (N)
  const handleAddAllReady = async () => {
    if (readyAlerts.length === 0) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    let addedCount = 0;
    for (const ready of readyAlerts) {
      const res = await confirmPendingAlert(userId, ready.id, {
        amount: ready.amount,
        category: ready.category ?? undefined,
        merchant_name: ready.merchant ?? undefined,
        type: ready.type as any,
      });
      if (res) addedCount++;
    }

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }

    setAlerts((prev) => prev.filter((a) => !readyAlerts.some((r) => r.id === a.id)));
    Toast.show({
      type: 'success',
      text1: 'Transactions Added ✅',
      text2: `Successfully added ${addedCount} ready transactions.`,
    });
  };

  // Toggle selection in multi-select mode
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Long-press handler to enter multi-select mode
  const handleLongPress = (item: DraftItemLike) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }
    setIsMultiSelect(true);
    setSelectedIds(new Set([item.id]));
  };

  // Multi-select bulk add
  const handleAddSelected = async () => {
    const toAdd = normalizedAlerts.filter((item) => selectedIds.has(item.id));
    if (toAdd.length === 0) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { }

    let count = 0;
    for (const item of toAdd) {
      const res = await confirmPendingAlert(userId, item.id, {
        amount: item.amount,
        category: item.category ?? undefined,
        merchant_name: item.merchant ?? undefined,
        type: item.type as any,
      });
      if (res) count++;
    }

    setIsMultiSelect(false);
    setSelectedIds(new Set());
    setAlerts((prev) => prev.filter((a) => !selectedIds.has(a.id)));

    Toast.show({
      type: 'success',
      text1: 'Transactions Added ✅',
      text2: `Added ${count} selected transactions.`,
    });
  };

  // Multi-select bulk ignore
  const handleIgnoreSelected = async () => {
    const toIgnore = normalizedAlerts.filter((item) => selectedIds.has(item.id));
    if (toIgnore.length === 0) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    for (const item of toIgnore) {
      await dismissPendingAlert(userId, item.id);
    }

    setIsMultiSelect(false);
    setSelectedIds(new Set());
    setAlerts((prev) => prev.filter((a) => !selectedIds.has(a.id)));

    Toast.show({
      type: 'info',
      text1: 'Alerts Ignored',
      text2: `Dismissed ${toIgnore.length} alerts.`,
    });
  };

  // Save inline edit overrides
  const handleSaveDraftEdit = (id: string, updated: Partial<DraftItemLike>) => {
    setDraftOverrides((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...updated,
      },
    }));
  };

  // Theme Colors
  const bgColor = isDark ? '#0F0F11' : '#F8F9FA';
  const cardBg = isDark ? '#18191D' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#272A30' : '#E8ECF2';
  const inputBg = isDark ? '#22252B' : '#F1F5F9';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgColor }]} edges={['top', 'left', 'right']}>
      {/* App Header */}
      <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Pending Alerts Inbox</Text>
          <Text style={[styles.headerSubtitle, { color: subtextColor }]}>
            {alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'} waiting for review
          </Text>
        </View>

        {isMultiSelect ? (
          <TouchableOpacity
            style={styles.cancelMultiBtn}
            onPress={() => {
              setIsMultiSelect(false);
              setSelectedIds(new Set());
            }}
          >
            <Text style={styles.cancelMultiText}>Done</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.importShortcutBtn, { backgroundColor: inputBg, borderColor }]}
            onPress={() => router.push('/sms-import')}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={14} color="#4F46E5" style={{ marginRight: 4 }} />
            <Text style={[styles.importShortcutText, { color: textColor }]}>Import</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Auto-Add OFF Warning Banner */}
      {!autoAddEnabled && (
        <View style={[styles.autoAddOffBanner, { backgroundColor: isDark ? '#311E08' : '#FEF3C7' }]}>
          <Ionicons name="warning" size={16} color="#D97706" style={{ marginRight: 8 }} />
          <Text style={[styles.autoAddOffText, { color: isDark ? '#FDE68A' : '#92400E' }]}>
            Auto-add is off. New payments aren't being tracked.
          </Text>
          <TouchableOpacity style={styles.turnOnBtn} onPress={handleTurnOnAutoAdd}>
            <Text style={styles.turnOnBtnText}>Turn on</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top Segmented Filter Tabs */}
      <View style={[styles.segmentedFilter, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity
            style={[
              styles.filterTab,
              activeFilter === 'all' && [styles.filterTabActive, { backgroundColor: isDark ? '#2E3135' : '#0F172A' }],
            ]}
            onPress={() => setActiveFilter('all')}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: activeFilter === 'all' ? '#FFFFFF' : subtextColor },
              ]}
            >
              All ({filterCounts.all})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterTab,
              activeFilter === 'needs_category' && [
                styles.filterTabActive,
                { backgroundColor: isDark ? '#2E3135' : '#0F172A' },
              ],
            ]}
            onPress={() => setActiveFilter('needs_category')}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: activeFilter === 'needs_category' ? '#FFFFFF' : subtextColor },
              ]}
            >
              Needs category ({filterCounts.needs_category})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterTab,
              activeFilter === 'bills' && [
                styles.filterTabActive,
                { backgroundColor: isDark ? '#2E3135' : '#0F172A' },
              ],
            ]}
            onPress={() => setActiveFilter('bills')}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: activeFilter === 'bills' ? '#FFFFFF' : subtextColor },
              ]}
            >
              Bills ({filterCounts.bills})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterTab,
              activeFilter === 'duplicates' && [
                styles.filterTabActive,
                { backgroundColor: isDark ? '#2E3135' : '#0F172A' },
              ],
            ]}
            onPress={() => setActiveFilter('duplicates')}
          >
            <Text
              style={[
                styles.filterTabText,
                { color: activeFilter === 'duplicates' ? '#FFFFFF' : subtextColor },
              ]}
            >
              Duplicates ({filterCounts.duplicates})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Bulk Action Bar at Top */}
      {readyAlerts.length > 0 && !isMultiSelect && (
        <View style={[styles.bulkActionBar, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bulkActionTitle, { color: textColor }]}>
              {readyAlerts.length} Ready to Add
            </Text>
            <Text style={[styles.bulkActionSubtitle, { color: subtextColor }]}>
              High confidence with category assigned
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addAllReadyBtn}
            onPress={handleAddAllReady}
            activeOpacity={0.85}
          >
            <Ionicons name="flash" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.addAllReadyText}>Add all ready ({readyAlerts.length})</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : filteredAlerts.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            type="inbox_empty"
            onImportMessages={() => router.push('/sms-import')}
          />
        </ScrollView>
      ) : (
        <ScrollView style={styles.alertsList} contentContainerStyle={styles.alertsListContent}>
          {groupedByDay.map(({ dayLabel, items }) => (
            <View key={dayLabel} style={styles.dayGroup}>
              {/* Sticky day header */}
              <View style={[styles.dayHeader, { backgroundColor: bgColor }]}>
                <Text style={[styles.dayHeaderText, { color: subtextColor }]}>{dayLabel}</Text>
                <Text style={[styles.dayHeaderCount, { color: subtextColor }]}>
                  {items.length} {items.length === 1 ? 'alert' : 'alerts'}
                </Text>
              </View>

              {/* Group items */}
              {items.map((item) => (
                <TransactionDraftCard
                  key={item.id}
                  item={item}
                  showCheckbox={isMultiSelect}
                  onToggleSelect={handleToggleSelect}
                  onOpenCategorySheet={setCategoryDraft}
                  onSaveEdit={handleSaveDraftEdit}
                  showQuickActions={!isMultiSelect}
                  onQuickAdd={handleConfirmSingle}
                  onQuickIgnore={handleIgnoreSingle}
                  onLongPress={handleLongPress}
                />
              ))}
            </View>
          ))}

          <View style={{ height: isMultiSelect ? 90 : 32 }} />
        </ScrollView>
      )}

      {/* Multi-Select Bottom Bar */}
      {isMultiSelect && (
        <View
          style={[
            styles.multiSelectBar,
            { backgroundColor: cardBg, borderTopColor: borderColor, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.multiSelectInfo}>
            <Text style={[styles.multiSelectCount, { color: textColor }]}>
              {selectedIds.size} Selected
            </Text>
          </View>

          <View style={styles.multiSelectButtons}>
            <TouchableOpacity
              style={[styles.multiIgnoreBtn, selectedIds.size === 0 && { opacity: 0.5 }]}
              onPress={handleIgnoreSelected}
              disabled={selectedIds.size === 0}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" style={{ marginRight: 4 }} />
              <Text style={styles.multiIgnoreText}>Ignore selected</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.multiAddBtn, selectedIds.size === 0 && { opacity: 0.5 }]}
              onPress={handleAddSelected}
              disabled={selectedIds.size === 0}
            >
              <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.multiAddText}>Add selected</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Category Bottom Sheet */}
      <CategorySheet
        visible={!!categoryDraft}
        onClose={() => setCategoryDraft(null)}
        currentCategory={categoryDraft?.category ?? undefined}
        merchantName={categoryDraft?.merchant}
        userId={user?.uid}
        onSelectCategory={(newCat, applyToAll) => {
          if (categoryDraft) {
            handleSaveDraftEdit(categoryDraft.id, { category: newCat });
            if (applyToAll && categoryDraft.merchant) {
              const targetNorm = categoryDraft.merchant.trim().toLowerCase();
              alerts.forEach((alertItem) => {
                const mName = alertItem.alert.merchantNormalized || alertItem.alert.merchant;
                if (
                  alertItem.id !== categoryDraft.id &&
                  mName &&
                  mName.trim().toLowerCase() === targetNorm
                ) {
                  handleSaveDraftEdit(alertItem.id, { category: newCat });
                }
              });
            }
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  importShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  importShortcutText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cancelMultiBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelMultiText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  autoAddOffBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  autoAddOffText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  turnOnBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  turnOnBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  segmentedFilter: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterTabActive: {
    // Background dynamic
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bulkActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  bulkActionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  bulkActionSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  addAllReadyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addAllReadyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertsList: {
    flex: 1,
  },
  alertsListContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  dayGroup: {
    marginBottom: 14,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  dayHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayHeaderCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  multiSelectBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  multiSelectInfo: {
    flex: 1,
  },
  multiSelectCount: {
    fontSize: 14,
    fontWeight: '800',
  },
  multiSelectButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  multiIgnoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 40,
  },
  multiIgnoreText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '700',
  },
  multiAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 40,
  },
  multiAddText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
