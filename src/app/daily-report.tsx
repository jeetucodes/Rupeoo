import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  computeDaySpendingStats,
  getLocalDayBoundaries,
} from '@/features/notifications/stats';
import { getNotificationSettings } from '@/features/notifications/settings';
import { DaySpendingStats } from '@/features/notifications/types';
import { getOfflineTransactions } from '@/lib/offlineSync';
import CategoryIcon from '@/components/CategoryIcon';

interface DayTransaction {
  id: string;
  amount: number;
  type: string;
  category: string;
  merchant: string;
  time?: string;
  paymentMode?: string;
}

export default function DailyReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('Friend');
  const [dailyBudget, setDailyBudget] = useState<number>(0);
  const [stats, setStats] = useState<DaySpendingStats>({
    spent: 0,
    count: 0,
    topCategory: 'General',
    topAmount: 0,
    biggest: 0,
    lastTransactionTime: null,
    budgetLeft: 0,
    budgetOver: 0,
  });
  const [transactions, setTransactions] = useState<DayTransaction[]>([]);

  const loadDailyReport = useCallback(async () => {
    try {
      const fallbackName = user?.displayName
        ? user.displayName.trim().split(' ')[0]
        : 'Friend';
      const settings = await getNotificationSettings(fallbackName);
      setUserName(settings.userName || fallbackName);
      setDailyBudget(settings.dailyBudget || 0);

      const computed = await computeDaySpendingStats(settings.dailyBudget, user?.uid);
      setStats(computed);

      // Fetch today's transactions list
      const { startMs, endMs, dateStr } = getLocalDayBoundaries();
      const offline = await getOfflineTransactions(user?.uid || 'local');
      const todayList: DayTransaction[] = [];

      for (const t of offline) {
        if (!t || !t.id) continue;
        let ts = 0;
        if (typeof t.timestamp === 'number') {
          ts = t.timestamp;
        } else if (t.date) {
          const parsed = new Date(t.date).getTime();
          if (!isNaN(parsed)) ts = parsed;
        }

        const isToday = (ts >= startMs && ts <= endMs) || (t.date && t.date.startsWith(dateStr));
        if (isToday) {
          todayList.push({
            id: t.id,
            amount: Number(t.amount) || 0,
            type: (t.type || 'expense').toLowerCase(),
            category: t.category || 'General',
            merchant: t.merchant_name || t.merchant || t.title || 'Expense',
            time: t.time || '',
            paymentMode: t.payment_mode || 'UPI',
          });
        }
      }

      setTransactions(todayList);
    } catch {
      // Keep defaults
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.displayName, user?.uid]);

  useEffect(() => {
    loadDailyReport();
  }, [loadDailyReport]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDailyReport();
  };

  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const percentSpent = dailyBudget > 0
    ? Math.min(Math.round((stats.spent / dailyBudget) * 100), 100)
    : 0;
  const isOverBudget = dailyBudget > 0 && stats.spent > dailyBudget;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Daily Report</Text>
          <Text style={styles.headerSubtitle}>{todayFormatted}</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/settings/notifications')}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={20} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingText}>Generating your daily report...</Text>
          </View>
        ) : (
          <>
            {/* Friendly Hero Summary Card */}
            <View style={styles.heroCard}>
              <View style={styles.heroHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroGreeting}>Hey {userName}! 👋</Text>
                  <Text style={styles.heroSubtitle}>Here is how your money moved today</Text>
                </View>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>{stats.count} {stats.count === 1 ? 'payment' : 'payments'}</Text>
                </View>
              </View>

              <View style={styles.spentAmountRow}>
                <Text style={styles.spentLabel}>Today's Total Spent</Text>
                <Text style={styles.spentAmount}>{formatCurrency(stats.spent)}</Text>
              </View>

              {dailyBudget > 0 ? (
                <View style={styles.budgetProgressSection}>
                  <View style={styles.budgetMetaRow}>
                    <Text style={styles.budgetMetaLabel}>
                      Budget: {formatCurrency(dailyBudget)}
                    </Text>
                    <Text
                      style={[
                        styles.budgetMetaStatus,
                        { color: isOverBudget ? '#EF4444' : '#10B981' },
                      ]}
                    >
                      {isOverBudget
                        ? `${formatCurrency(stats.budgetOver)} over budget`
                        : `${formatCurrency(stats.budgetLeft)} remaining`}
                    </Text>
                  </View>

                  <View style={styles.trackBar}>
                    <View
                      style={[
                        styles.fillBar,
                        {
                          width: `${percentSpent}%`,
                          backgroundColor: isOverBudget ? '#EF4444' : percentSpent >= 80 ? '#F59E0B' : '#10B981',
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.setBudgetPrompt}
                  onPress={() => router.push('/settings/notifications')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="sparkles" size={16} color="#4F46E5" style={{ marginRight: 6 }} />
                  <Text style={styles.setBudgetText}>Set a daily budget to get 80% &amp; over-budget alerts</Text>
                  <Ionicons name="chevron-forward" size={14} color="#4F46E5" />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Metrics Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="pie-chart-outline" size={18} color="#4F46E5" />
                </View>
                <Text style={styles.statCardLabel}>Top Category</Text>
                <Text style={styles.statCardValue} numberOfLines={1}>{stats.topCategory}</Text>
                <Text style={styles.statCardSub}>{formatCurrency(stats.topAmount)}</Text>
              </View>

              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="trending-up-outline" size={18} color="#D97706" />
                </View>
                <Text style={styles.statCardLabel}>Biggest Payment</Text>
                <Text style={styles.statCardValue} numberOfLines={1}>{formatCurrency(stats.biggest)}</Text>
                <Text style={styles.statCardSub}>Single highest</Text>
              </View>
            </View>

            {/* Today's Transactions Feed */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>TODAY'S TRANSACTIONS</Text>
              <Text style={styles.sectionCount}>{transactions.length}</Text>
            </View>

            {transactions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🎉</Text>
                <Text style={styles.emptyTitle}>Zero spend today, {userName}!</Text>
                <Text style={styles.emptySubtitle}>
                  You haven't logged any payments today. Keep up the disciplined spending!
                </Text>
              </View>
            ) : (
              <View style={styles.transactionsCard}>
                {transactions.map((tx, idx) => {
                  const isDebit = tx.type === 'debit' || tx.type === 'expense';
                  const isLast = idx === transactions.length - 1;
                  return (
                    <TouchableOpacity
                      key={tx.id}
                      style={[styles.txRow, !isLast && styles.txBorder]}
                      onPress={() => router.push(`/transaction/${tx.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.txIconWrap}>
                        <CategoryIcon categoryName={tx.category} size={20} />
                      </View>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.txTitle} numberOfLines={1}>{tx.merchant}</Text>
                        <Text style={styles.txSub}>
                          {tx.category} • {tx.paymentMode} {tx.time ? `• ${tx.time}` : ''}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.txAmount,
                          { color: isDebit ? '#0F172A' : '#10B981' },
                        ]}
                      >
                        {isDebit ? '-' : '+'}{formatCurrency(tx.amount)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Add Expense Action Button */}
            <TouchableOpacity
              style={styles.addExpenseButton}
              onPress={() => router.push('/add')}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.addExpenseText}>Add Expense</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingWrap: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 14,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroGreeting: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  heroBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  spentAmountRow: {
    marginBottom: 16,
  },
  spentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  spentAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  budgetProgressSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
  },
  budgetMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetMetaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  budgetMetaStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  trackBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  fillBar: {
    height: '100%',
    borderRadius: 4,
  },
  setBudgetPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 12,
  },
  setBudgetText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
    lineHeight: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statCardLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  statCardValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 1,
  },
  statCardSub: {
    fontSize: 11,
    color: '#94A3B8',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  transactionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  txBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  txIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  txSub: {
    fontSize: 11,
    color: '#64748B',
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  addExpenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
  },
  addExpenseText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
