import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import {
  getUserNotifications,
  subscribeToUserNotifications,
  markNotificationsAsRead,
  markNotificationAsRead,
  deleteNotification,
  deleteAllNotifications,
  createNotification,
  AppNotification,
} from '@/lib/database';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions } from '@/lib/notifications';
import { safeGoBack } from '@/lib/navigation';
import { useTranslation } from '@/lib/i18n';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';
import Skeleton from '@/components/Skeleton';

type FilterTab = 'all' | 'unread' | 'budget' | 'tip';

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      setError(null);
      const list = await getUserNotifications(user.uid);
      setNotifications(list);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Unable to load notifications. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const unsubscribe = subscribeToUserNotifications(
      user.uid,
      setNotifications,
      () => setError('Unable to sync notifications. Check your connection and try again.')
    );
    return unsubscribe;
  }, [user]);

  // Auto-mark notifications as read when screen is viewed
  useEffect(() => {
    if (!user?.uid || notifications.length === 0) return;

    const hasUnread = notifications.some(n => !n.isRead);
    if (!hasUnread) return;

    // Small delay (800ms) so user can visibly see what was newly received before unread dots/pill clear
    const timer = setTimeout(async () => {
      try {
        await markNotificationsAsRead(user.uid);
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      } catch (err) {
        console.warn('Error auto-marking notifications as read:', err);
      }
    }, 800);

    return () => {
      clearTimeout(timer);
      // If user navigates away before timer ends, mark as read immediately
      markNotificationsAsRead(user.uid).catch(() => {});
    };
  }, [user?.uid, notifications]);

  const refreshPermissionStatus = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionDenied(status !== 'granted');
    } catch {
      setPermissionDenied(true);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      refreshPermissionStatus();
      if (user?.uid) {
        // Auto mark read on screen focus
        const focusTimer = setTimeout(() => {
          markNotificationsAsRead(user.uid).catch(() => {});
        }, 1200);
        return () => clearTimeout(focusTimer);
      }
    }, [user?.uid])
  );

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermissions();
    setPermissionDenied(!granted);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    try {
      await markNotificationsAsRead(user.uid);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleItemPress = async (item: AppNotification) => {
    if (!user) return;
    if (!item.isRead && item.id) {
      try {
        await markNotificationAsRead(user.uid, item.id);
        setNotifications(prev =>
          prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n))
        );
      } catch (err) {
        console.error(err);
      }
    }

    if (item.type === 'budget') {
      router.push('/budget');
    }
  };

  const handleDeleteItem = async (notificationId: string) => {
    if (!user || !notificationId) return;
    try {
      await deleteNotification(user.uid, notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const executeClearAll = async () => {
    if (!user) return;
    try {
      await deleteAllNotifications(user.uid);
      setNotifications([]);
    } catch (err) {
      console.error('Error clearing notifications:', err);
    }
  };

  const handleClearAll = () => {
    if (notifications.length === 0) return;
    setClearConfirmVisible(true);
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'budget':
        return { name: 'pie-chart' as const, color: '#EF4444', bg: '#FEE2E2' };
      case 'tip':
        return { name: 'bulb' as const, color: '#F59E0B', bg: '#FEF3C7' };
      case 'reminder':
        return { name: 'alarm' as const, color: '#3B82F6', bg: '#DBEAFE' };
      default:
        return { name: 'notifications' as const, color: '#1C1C1E', bg: '#FEF9E7' };
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays} days ago`;
    } catch {
      return '';
    }
  };

  const filteredList = useMemo(() => {
    switch (activeTab) {
      case 'unread':
        return notifications.filter(n => !n.isRead);
      case 'budget':
        return notifications.filter(n => n.type === 'budget');
      case 'tip':
        return notifications.filter(n => n.type === 'tip');
      default:
        return notifications;
    }
  }, [notifications, activeTab]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />
        <View style={styles.topBar}>
          <View style={styles.backButton}><Skeleton width={24} height={24} borderRadius={12} /></View>
          <Skeleton width={140} height={20} />
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: '#FFFFFF', marginBottom: 12, borderRadius: 16 }}>
              <Skeleton width={48} height={48} borderRadius={24} style={{ marginRight: 16 }} />
              <View style={{ flex: 1 }}>
                <Skeleton width={180} height={16} style={{ marginBottom: 8 }} />
                <Skeleton width="100%" height={14} style={{ marginBottom: 12 }} />
                <Skeleton width={60} height={12} />
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => safeGoBack(router)}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle}>{t('notifications')}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <View style={styles.topActionsRow}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={handleMarkAllRead}
              activeOpacity={0.7}
              accessibilityLabel="Mark all as read"
            >
              <Ionicons name="checkmark-done" size={20} color="#1C1C1E" />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              style={[styles.actionIconButton, { backgroundColor: '#FEE2E2', marginLeft: 8 }]}
              onPress={handleClearAll}
              activeOpacity={0.7}
              accessibilityLabel="Clear all notifications"
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'all' && styles.tabChipActive]}
          onPress={() => setActiveTab('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabChipText, activeTab === 'all' && styles.tabChipTextActive]}>
            All ({notifications.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'unread' && styles.tabChipActive]}
          onPress={() => setActiveTab('unread')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabChipText, activeTab === 'unread' && styles.tabChipTextActive]}>
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'budget' && styles.tabChipActive]}
          onPress={() => setActiveTab('budget')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabChipText, activeTab === 'budget' && styles.tabChipTextActive]}>
            Budget Alerts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'tip' && styles.tabChipActive]}
          onPress={() => setActiveTab('tip')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabChipText, activeTab === 'tip' && styles.tabChipTextActive]}>
            Insights
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1C1C1E']}
            tintColor="#1C1C1E"
          />
        }
      >
        {permissionDenied && (
          <View style={styles.permissionBanner}>
            <Ionicons name="notifications-off-outline" size={20} color="#92400E" />
            <Text style={styles.permissionText}>Push notifications are disabled.</Text>
            <TouchableOpacity onPress={handleEnableNotifications} accessibilityLabel="Enable notifications">
              <Text style={styles.permissionAction}>Enable</Text>
            </TouchableOpacity>
          </View>
        )}
        {error ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="cloud-offline-outline" size={44} color="#EF4444" />
            </View>
            <Text style={styles.emptyTitle}>Could not load notifications</Text>
            <Text style={styles.emptySubtitle}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchNotifications} accessibilityLabel="Retry loading notifications">
              <Ionicons name="refresh" size={18} color="#1C1C1E" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="notifications-off-outline" size={44} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'unread'
                ? "You're all caught up! No unread notifications."
                : 'No notifications in this category yet.'}
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {filteredList.map((item, index) => {
              const iconInfo = getIconForType(item.type);
              const isLast = index === filteredList.length - 1;

              return (
                <TouchableOpacity
                  key={item.id || index}
                  style={[
                    styles.notificationItem,
                    !item.isRead && styles.notificationItemUnread,
                    !isLast && styles.borderBottom,
                  ]}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconCircle, { backgroundColor: iconInfo.bg }]}>
                    <Ionicons name={iconInfo.name} size={22} color={iconInfo.color} />
                  </View>

                  <View style={styles.contentWrap}>
                    <View style={styles.itemHeader}>
                      <Text style={[styles.itemTitle, !item.isRead && styles.itemTitleBold]}>
                        {item.title}
                      </Text>
                      {!item.isRead && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.itemMessage}>{item.message}</Text>
                    <Text style={styles.itemTime}>{formatTimestamp(item.createdAt)}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteItemBtn}
                    onPress={() => item.id && handleDeleteItem(item.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-outline" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* CUSTOM CLEAR ALL NOTIFICATIONS CONFIRMATION MODAL */}
      <ConfirmDialogModal
        visible={clearConfirmVisible}
        title="Clear All Notifications"
        message="Are you sure you want to remove all notifications from your notification center?"
        confirmText="Clear All"
        cancelText="Cancel"
        type="danger"
        icon="trash-outline"
        onConfirm={() => {
          executeClearAll();
          setClearConfirmVisible(false);
        }}
        onCancel={() => setClearConfirmVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  unreadBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFD740',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginVertical: 10,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabChipActive: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  tabChipTextActive: {
    color: '#FFD740',
    fontWeight: '900',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  loadingWrapper: {
    marginTop: 60,
    alignItems: 'center',
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    padding: 12,
    marginBottom: 12,
  },
  permissionText: {
    flex: 1,
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
  },
  permissionAction: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFD740',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 18,
  },
  retryButtonText: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '800',
  },
  listCard: {
    backgroundColor: '#ffffff',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#ffffff',
  },
  notificationItemUnread: {
    backgroundColor: '#FEFDF5',
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contentWrap: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
  },
  itemTitleBold: {
    fontWeight: '900',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFD740',
    marginLeft: 8,
  },
  itemMessage: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 6,
  },
  itemTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  deleteItemBtn: {
    padding: 6,
    marginLeft: 8,
  },
});
