import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { submitSupportMessage, subscribeUserSupportMessages, SupportMessage } from '@/lib/database';
import { useAuth } from '@/context/AuthContext';

interface HelpSupportModalProps {
  visible: boolean;
  onClose: () => void;
  source?: 'maintenance' | 'settings';
  initialTopic?: string;
}

const SETTINGS_TOPICS = [
  'General Inquiry',
  'Account & Data',
  'Pro & Billing',
  'Bug Report',
  'Feature Idea',
];

const MAINTENANCE_TOPICS = [
  'Upgrade Status',
  'Account Access',
  'Data & Balance',
  'Urgent Inquiry',
];

export function HelpSupportModal({
  visible,
  onClose,
  source = 'settings',
  initialTopic,
}: HelpSupportModalProps) {
  const { user } = useAuth();
  const topics = source === 'maintenance' ? MAINTENANCE_TOPICS : SETTINGS_TOPICS;

  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [selectedTopic, setSelectedTopic] = useState(initialTopic || topics[0]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recentSubmittedId, setRecentSubmittedId] = useState<string | null>(null);

  const [myTickets, setMyTickets] = useState<SupportMessage[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  // Prefill user data
  useEffect(() => {
    if (visible) {
      if (user?.displayName && !name) setName(user.displayName);
      if (user?.email && !email) setEmail(user.email);
      if (initialTopic) setSelectedTopic(initialTopic);
    }
  }, [visible, user]);

  // Subscribe to real-time user tickets from Firestore
  useEffect(() => {
    if (!visible || !user?.uid) {
      setMyTickets([]);
      setLoadingTickets(false);
      return;
    }

    setLoadingTickets(true);
    const unsubscribe = subscribeUserSupportMessages(user.uid, (tickets) => {
      setMyTickets(tickets);
      setLoadingTickets(false);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [visible, user?.uid]);

  const repliedTicketsCount = myTickets.filter((t) => !!t.adminReply).length;

  const handleSubmit = async () => {
    const trimmedMessage = message.trim();
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    if (!trimmedName) {
      Alert.alert('Required Field', 'Please enter your name.');
      return;
    }

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      Alert.alert('Required Field', 'Please enter a valid email address so we can reply.');
      return;
    }

    if (!trimmedMessage || trimmedMessage.length < 10) {
      Alert.alert('Message Too Short', 'Please write a brief description (at least 10 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const ticketId = await submitSupportMessage({
        name: trimmedName,
        email: trimmedEmail,
        phone: phone.trim() || undefined,
        topic: selectedTopic,
        message: trimmedMessage,
        source,
        userId: user?.uid,
      });

      setRecentSubmittedId(ticketId);
      setMessage('');
      setActiveTab('history');

      Toast.show({
        type: 'success',
        text1: 'Ticket Raised Successfully! 🎫',
        text2: 'Track updates & admin replies in the My Tickets tab.',
      });
    } catch (err: any) {
      console.error('Support message submission failed:', err);
      Alert.alert('Submission Error', err?.message || 'Could not send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setRecentSubmittedId(null);
    onClose();
  };

  const formatTicketDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleResetAndClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={handleResetAndClose}
        />

        <View style={styles.modalCard}>
          {/* Top Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Ionicons
                  name={source === 'maintenance' ? 'construct' : 'headset'}
                  size={20}
                  color="#FFD740"
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.modalTitle}>
                    {source === 'maintenance' ? 'Upgrade Support' : 'Rupeo Support'}
                  </Text>
                  <View style={styles.brandBadge}>
                    <Text style={styles.brandBadgeText}>24/7 HELPDESK</Text>
                  </View>
                </View>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {source === 'maintenance'
                    ? 'Assistance during maintenance upgrade'
                    : 'Track your tickets and direct admin replies'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleResetAndClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close Support Modal"
            >
              <Ionicons name="close" size={20} color="#0F172A" />
            </TouchableOpacity>
          </View>

          {/* Rupeo Themed Segmented Tabs (Raise Ticket vs My Tickets) */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'create' && styles.tabButtonActive]}
              onPress={() => setActiveTab('create')}
              activeOpacity={0.75}
            >
              <Ionicons
                name="add-circle"
                size={16}
                color={activeTab === 'create' ? '#FFD740' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>
                Raise Ticket
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
              onPress={() => setActiveTab('history')}
              activeOpacity={0.75}
            >
              <Ionicons
                name="chatbubbles"
                size={16}
                color={activeTab === 'history' ? '#FFD740' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
                My Tickets
              </Text>
              {myTickets.length > 0 && (
                <View
                  style={[
                    styles.tabBadge,
                    activeTab === 'history'
                      ? styles.tabBadgeOnActive
                      : repliedTicketsCount > 0
                      ? styles.tabBadgeReplied
                      : styles.tabBadgeDefault,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      activeTab === 'history'
                        ? styles.tabBadgeTextOnActive
                        : repliedTicketsCount > 0
                        ? styles.tabBadgeTextReplied
                        : styles.tabBadgeTextDefault,
                    ]}
                  >
                    {repliedTicketsCount > 0 ? `💬 ${repliedTicketsCount}` : myTickets.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Tab 1: Raise Ticket Form */}
          {activeTab === 'create' ? (
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={{ paddingBottom: 28 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Topic Selector */}
              <Text style={styles.fieldLabel}>CATEGORY / TOPIC</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.topicsRow}
                contentContainerStyle={{ gap: 8, paddingRight: 16 }}
              >
                {topics.map((t) => {
                  const isSelected = selectedTopic === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.topicChip, isSelected && styles.topicChipSelected]}
                      onPress={() => setSelectedTopic(t)}
                      activeOpacity={0.7}
                    >
                      {isSelected && (
                        <View style={styles.topicDot} />
                      )}
                      <Text style={[styles.topicText, isSelected && styles.topicTextSelected]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Name */}
              <Text style={styles.fieldLabel}>YOUR NAME *</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInputWithIcon}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Rahul Sharma"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Email */}
              <Text style={styles.fieldLabel}>EMAIL ADDRESS *</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInputWithIcon}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="e.g. rahul@gmail.com"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Phone / WhatsApp */}
              <Text style={styles.fieldLabel}>PHONE / WHATSAPP (OPTIONAL)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="call-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInputWithIcon}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. +91 00000 00000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                />
              </View>

              {/* Message */}
              <Text style={styles.fieldLabel}>HOW CAN WE HELP? *</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Describe your issue, question, or feature request in detail..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* Rupeo Themed Submit Button */}
              <TouchableOpacity
                style={[styles.submitBtnWrapper, submitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#0F172A', '#1E293B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitBtnGradient}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFD740" size="small" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={18} color="#FFD740" style={{ marginRight: 8 }} />
                      <Text style={styles.submitBtnText}>Submit Support Ticket</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* Tab 2: My Tickets / History View */
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={{ paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {recentSubmittedId && (
                <View style={styles.bannerAlert}>
                  <View style={styles.bannerAlertIcon}>
                    <Ionicons name="checkmark" size={16} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannerAlertTitle}>Ticket Raised Successfully!</Text>
                    <Text style={styles.bannerAlertSubtitle}>
                      Your inquiry has been logged. Admin will review and respond directly here.
                    </Text>
                  </View>
                </View>
              )}

              {loadingTickets ? (
                <View style={styles.emptyStateContainer}>
                  <ActivityIndicator color="#0F172A" size="large" />
                  <Text style={styles.emptyStateSubtext}>Syncing your tickets…</Text>
                </View>
              ) : myTickets.length === 0 ? (
                <View style={styles.emptyStateContainer}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="chatbox-ellipses-outline" size={38} color="#0F172A" />
                  </View>
                  <Text style={styles.emptyStateTitle}>No Tickets Yet</Text>
                  <Text style={styles.emptyStateSubtext}>
                    You have not submitted any inquiries. If you ever need help or find an issue, raise a ticket here!
                  </Text>
                  <TouchableOpacity
                    style={styles.raiseFirstBtn}
                    onPress={() => setActiveTab('create')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add" size={18} color="#0F172A" style={{ marginRight: 6 }} />
                    <Text style={styles.raiseFirstBtnText}>Raise a Ticket</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 14 }}>
                  {myTickets.map((t) => {
                    const hasReply = !!t.adminReply;
                    const isResolved = t.status === 'resolved';

                    return (
                      <View key={t.id || Math.random().toString()} style={styles.ticketCard}>
                        {/* Ticket Card Header */}
                        <View style={styles.ticketCardHeader}>
                          <View style={styles.ticketIdBadge}>
                            <Ionicons name="pricetag" size={11} color="#FFD740" style={{ marginRight: 4 }} />
                            <Text style={styles.ticketIdText}>
                              #TICK-{t.id ? t.id.slice(0, 6).toUpperCase() : 'NEW'}
                            </Text>
                          </View>

                          <Text style={styles.ticketTimeText}>
                            {formatTicketDate(t.createdAt)}
                          </Text>

                          <View
                            style={[
                              styles.statusPill,
                              hasReply
                                ? styles.statusPillReplied
                                : isResolved
                                ? styles.statusPillResolved
                                : styles.statusPillPending,
                            ]}
                          >
                            <Ionicons
                              name={
                                hasReply
                                  ? 'checkmark-done-circle'
                                  : isResolved
                                  ? 'checkmark-circle'
                                  : 'time'
                              }
                              size={12}
                              color={
                                hasReply
                                  ? '#047857'
                                  : isResolved
                                  ? '#1D4ED8'
                                  : '#B45309'
                              }
                              style={{ marginRight: 4 }}
                            />
                            <Text
                              style={[
                                styles.statusPillText,
                                hasReply
                                  ? styles.statusPillTextReplied
                                  : isResolved
                                  ? styles.statusPillTextResolved
                                  : styles.statusPillTextPending,
                              ]}
                            >
                              {hasReply
                                ? 'Admin Replied'
                                : isResolved
                                ? 'Resolved'
                                : 'In Review'}
                            </Text>
                          </View>
                        </View>

                        {/* Topic Tag */}
                        {!!t.topic && (
                          <View style={styles.topicRow}>
                            <View style={styles.topicTag}>
                              <Text style={styles.topicTagText}>{t.topic}</Text>
                            </View>
                          </View>
                        )}

                        {/* User Sent Message ("ye msg kr chuke ho") */}
                        <View style={styles.userMessageBox}>
                          <View style={styles.messageLabelRow}>
                            <View style={styles.userAvatarMini}>
                              <Text style={styles.userAvatarMiniText}>
                                {(t.name || user?.displayName || 'U')[0].toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.messageLabelText}>You wrote:</Text>
                          </View>
                          <Text style={styles.userMessageContent}>{t.message}</Text>
                        </View>

                        {/* Admin Reply Section ("jab admin repy de to waha aaye user ke pass") */}
                        {hasReply ? (
                          <View style={styles.adminReplyBox}>
                            <View style={styles.adminReplyHeader}>
                              <View style={styles.adminReplyHeaderLeft}>
                                <View style={styles.adminAvatarCircle}>
                                  <Ionicons name="shield-checkmark" size={13} color="#0F172A" />
                                </View>
                                <Text style={styles.adminReplyTitle}>Rupeo Support Team</Text>
                                <View style={styles.officialBadge}>
                                  <Text style={styles.officialBadgeText}>OFFICIAL</Text>
                                </View>
                              </View>
                              {t.repliedAt && (
                                <Text style={styles.adminReplyTime}>
                                  {formatTicketDate(t.repliedAt)}
                                </Text>
                              )}
                            </View>
                            <Text style={styles.adminReplyContent}>{t.adminReply}</Text>
                          </View>
                        ) : (
                          <View style={styles.waitingReplyBox}>
                            <Ionicons name="hourglass-outline" size={15} color="#D97706" style={{ marginRight: 8 }} />
                            <Text style={styles.waitingReplyText}>
                              Our support team is reviewing your inquiry. When admin responds, the message will appear right here.
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={styles.raiseAnotherBtn}
                    onPress={() => setActiveTab('create')}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add-circle" size={18} color="#0F172A" style={{ marginRight: 6 }} />
                    <Text style={styles.raiseAnotherBtnText}>Raise Another Ticket</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  dragHandle: {
    width: 42,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  brandBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  brandBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 3.5,
    marginTop: 14,
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 11,
  },
  tabButtonActive: {
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tabBadge: {
    marginLeft: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabBadgeDefault: {
    backgroundColor: '#CBD5E1',
  },
  tabBadgeReplied: {
    backgroundColor: '#DCFCE7',
  },
  tabBadgeOnActive: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  tabBadgeTextDefault: {
    color: '#475569',
  },
  tabBadgeTextReplied: {
    color: '#15803D',
  },
  tabBadgeTextOnActive: {
    color: '#FFD740',
  },
  bodyScroll: {
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 12,
  },
  topicsRow: {
    marginBottom: 4,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topicChipSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  topicDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFD740',
    marginRight: 6,
  },
  topicText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  topicTextSelected: {
    color: '#FFD740',
    fontWeight: '700',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInputWithIcon: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  textArea: {
    height: 105,
    paddingTop: 12,
  },
  submitBtnWrapper: {
    marginTop: 20,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  bannerAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 16,
    padding: 13,
    marginBottom: 14,
  },
  bannerAlertIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  bannerAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  bannerAlertSubtitle: {
    fontSize: 12,
    color: '#166534',
    marginTop: 2,
    lineHeight: 17,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 44,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#FFD740',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  raiseFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD740',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  raiseFirstBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  ticketIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
  },
  ticketIdText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    fontWeight: '800',
    color: '#FFD740',
  },
  ticketTimeText: {
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 8,
    marginRight: 'auto',
    fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusPillPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusPillReplied: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusPillResolved: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusPillTextPending: {
    color: '#B45309',
  },
  statusPillTextReplied: {
    color: '#047857',
  },
  statusPillTextResolved: {
    color: '#1D4ED8',
  },
  topicRow: {
    marginBottom: 10,
  },
  topicTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topicTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  userMessageBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  messageLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  userAvatarMini: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarMiniText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
  },
  messageLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userMessageContent: {
    fontSize: 13,
    color: '#0F172A',
    lineHeight: 20,
    fontWeight: '500',
  },
  adminReplyBox: {
    marginTop: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  adminReplyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  adminReplyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adminAvatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFD740',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminReplyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  officialBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  officialBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.4,
  },
  adminReplyTime: {
    fontSize: 10,
    color: '#15803D',
    fontWeight: '600',
  },
  adminReplyContent: {
    fontSize: 13,
    color: '#14532D',
    lineHeight: 20,
    fontWeight: '600',
  },
  waitingReplyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  waitingReplyText: {
    flex: 1,
    fontSize: 11.5,
    color: '#92400E',
    lineHeight: 17,
    fontWeight: '500',
  },
  raiseAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  raiseAnotherBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
});
