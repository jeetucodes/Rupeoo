import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import Skeleton from '@/components/Skeleton';
import { MigrationStatus } from '@/lib/backgroundMigrations';

interface AppShellSkeletonProps {
  startupTimeout?: boolean;
  migrationStatus?: MigrationStatus | null;
}

export default function AppShellSkeleton({ startupTimeout, migrationStatus }: AppShellSkeletonProps) {
  // If migration took >500ms, show the light "Updating your app..." screen
  if (migrationStatus?.needsProgressOverlay && migrationStatus.inProgress) {
    const progressPercent = Math.round((migrationStatus.progress || 0.1) * 100);
    return (
      <SafeAreaView style={styles.updatingContainer}>
        <View style={styles.updatingCard}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>₹</Text>
          </View>
          <Text style={styles.updatingTitle}>Updating your app...</Text>
          <Text style={styles.updatingSubtitle}>
            {migrationStatus.phase || 'Optimizing local database and sync status'}
          </Text>

          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressPercentText}>{progressPercent}%</Text>

          <ActivityIndicator size="small" color="#D97706" style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {startupTimeout && (
        <View style={styles.timeoutBanner}>
          <Text style={styles.timeoutBannerText}>
            Connecting to cloud... Loading offline copy
          </Text>
        </View>
      )}

      {/* Header Skeleton */}
      <View style={styles.header}>
        <View>
          <Skeleton width={110} height={20} borderRadius={6} style={{ marginBottom: 6 }} />
          <Skeleton width={160} height={28} borderRadius={8} />
        </View>
        <Skeleton width={44} height={44} borderRadius={22} />
      </View>

      {/* Main Balance Card Skeleton */}
      <View style={styles.balanceCard}>
        <Skeleton width={120} height={16} borderRadius={6} style={{ marginBottom: 10 }} />
        <Skeleton width={200} height={36} borderRadius={8} style={{ marginBottom: 20 }} />
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Skeleton width={70} height={14} borderRadius={4} style={{ marginBottom: 6 }} />
            <Skeleton width={100} height={20} borderRadius={6} />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton width={70} height={14} borderRadius={4} style={{ marginBottom: 6 }} />
            <Skeleton width={100} height={20} borderRadius={6} />
          </View>
        </View>
      </View>

      {/* Quick Action Buttons Skeleton */}
      <View style={styles.quickActions}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.actionItem}>
            <Skeleton width={52} height={52} borderRadius={26} style={{ marginBottom: 8 }} />
            <Skeleton width={48} height={12} borderRadius={4} />
          </View>
        ))}
      </View>

      {/* Recent Transactions List Skeleton */}
      <View style={styles.listSection}>
        <View style={styles.listHeader}>
          <Skeleton width={140} height={20} borderRadius={6} />
          <Skeleton width={60} height={16} borderRadius={4} />
        </View>

        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.txRow}>
            <Skeleton width={42} height={42} borderRadius={21} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Skeleton width={130} height={16} borderRadius={4} style={{ marginBottom: 6 }} />
              <Skeleton width={80} height={12} borderRadius={4} />
            </View>
            <Skeleton width={70} height={18} borderRadius={6} />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
  },
  timeoutBanner: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  timeoutBannerText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
  },
  actionItem: {
    alignItems: 'center',
  },
  listSection: {
    marginTop: 12,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  updatingContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  updatingCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 2,
    borderColor: '#FDE68A',
  },
  logoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#D97706',
  },
  updatingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
    textAlign: 'center',
  },
  updatingSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
    marginTop: 8,
  },
});
