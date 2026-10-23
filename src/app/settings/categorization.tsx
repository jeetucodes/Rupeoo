import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/context/AuthContext';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';
import CategoryIcon from '@/components/CategoryIcon';
import { defaultCategories } from '@/lib/database';
import {
  getUserRules,
  saveUserRule,
  deleteUserRule,
  normalizeMerchant,
  CATEGORIZATION_SETTINGS_KEY,
} from '@/lib/categorizer';

interface RuleItem {
  merchant: string;
  category: string;
}

export default function CategorizationSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const uid = user?.uid || 'local';

  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [search, setSearch] = useState('');
  const [aiFallbackEnabled, setAiFallbackEnabled] = useState(false);

  // Add / Edit Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<string | null>(null);
  const [inputMerchant, setInputMerchant] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Food');

  // Delete Confirm Modal State
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<string | null>(null);

  // Load rules & settings
  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const userRulesMap = await getUserRules(uid);
      const items: RuleItem[] = Object.entries(userRulesMap).map(([merchant, category]) => ({
        merchant,
        category,
      }));
      items.sort((a, b) => a.merchant.localeCompare(b.merchant));
      setRules(items);

      const rawSettings = await AsyncStorage.getItem(CATEGORIZATION_SETTINGS_KEY);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        setAiFallbackEnabled(!!parsed.aiFallbackEnabled);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // AI Fallback Toggle
  const handleToggleAiFallback = async (val: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setAiFallbackEnabled(val);
    try {
      await AsyncStorage.setItem(
        CATEGORIZATION_SETTINGS_KEY,
        JSON.stringify({ aiFallbackEnabled: val })
      );
    } catch {}
  };

  // Filtered rules
  const filteredRules = useMemo(() => {
    if (!search.trim()) return rules;
    const q = search.trim().toLowerCase();
    return rules.filter(
      r => r.merchant.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)
    );
  }, [rules, search]);

  // Open Add Rule
  const handleOpenAdd = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setEditingMerchant(null);
    setInputMerchant('');
    setSelectedCategory('Food');
    setModalVisible(true);
  };

  // Open Edit Rule
  const handleOpenEdit = (rule: RuleItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setEditingMerchant(rule.merchant);
    setInputMerchant(rule.merchant);
    setSelectedCategory(rule.category);
    setModalVisible(true);
  };

  // Save Rule
  const handleSaveRule = async () => {
    const raw = inputMerchant.trim();
    if (!raw) {
      Toast.show({
        type: 'error',
        text1: 'Merchant Name Required',
        text2: 'Please enter a business or merchant name.',
      });
      return;
    }

    const norm = normalizeMerchant(raw);
    if (!norm) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Merchant Name',
        text2: 'Please enter alphanumeric merchant characters.',
      });
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    // If editing and name changed, delete old one
    if (editingMerchant && editingMerchant !== norm) {
      await deleteUserRule(editingMerchant, uid);
    }

    await saveUserRule(norm, selectedCategory, uid);
    setModalVisible(false);
    await loadRules();

    Toast.show({
      type: 'success',
      text1: 'Rule Saved',
      text2: `Always categorizing "${norm}" as ${selectedCategory}`,
    });
  };

  // Confirm Delete Rule
  const handleConfirmDelete = async () => {
    if (!deleteRuleTarget) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    await deleteUserRule(deleteRuleTarget, uid);
    setDeleteRuleTarget(null);
    await loadRules();

    Toast.show({
      type: 'success',
      text1: 'Rule Removed',
      text2: 'Merchant rule deleted.',
    });
  };

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
          <Text style={styles.headerTitle}>Categorization</Text>
          <Text style={styles.headerSubtitle}>
            Learned merchant rules &amp; smart classification
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleOpenAdd}
          style={styles.addRuleHeaderBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add merchant rule"
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addRuleHeaderText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* SECTION 1: AI FALLBACK & PRIVACY */}
        <SettingsSection title="AI Fallback (Optional)">
          <SettingsRow
            icon="sparkles"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
            label="AI Fallback Categorization"
            subtitle="Suggests categories for unknown merchants when no local rule matches"
            isSwitch
            switchValue={aiFallbackEnabled}
            onSwitchChange={handleToggleAiFallback}
          />

          {/* Privacy Card */}
          <View style={styles.privacyCard}>
            <View style={styles.privacyHeader}>
              <Ionicons name="shield-checkmark" size={16} color="#059669" style={{ marginRight: 6 }} />
              <Text style={styles.privacyTitle}>Strict Privacy Safeguard</Text>
            </View>
            <Text style={styles.privacyText}>
              Only the normalized merchant name (e.g. "Starbucks") is sent to classify unknown businesses. Amounts, account numbers, and message text are never sent off your device. Results are cached locally.
            </Text>
          </View>
        </SettingsSection>

        {/* SECTION 2: LEARNED MERCHANT RULES */}
        <SettingsSection title={`Learned Merchant Rules (${rules.length})`}>
          {/* Search Box */}
          {rules.length > 3 && (
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search merchant or category..."
                placeholderTextColor="#94A3B8"
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>
          ) : rules.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="pricetags-outline" size={36} color="#CBD5E1" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>No Merchant Rules Yet</Text>
              <Text style={styles.emptySubtitle}>
                Whenever you change a transaction's category, Rupeo remembers your preference and categorizes future alerts automatically.
              </Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={handleOpenAdd}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle" size={16} color="#4F46E5" style={{ marginRight: 4 }} />
                <Text style={styles.emptyAddBtnText}>Add First Rule</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.rulesList}>
              {filteredRules.map(rule => {
                const catMeta = defaultCategories.find(
                  c => c.name.toLowerCase() === rule.category.toLowerCase()
                );
                return (
                  <View key={rule.merchant} style={styles.ruleRow}>
                    <View style={styles.ruleInfo}>
                      <Text style={styles.ruleMerchant} numberOfLines={1}>
                        {rule.merchant}
                      </Text>
                      <View style={styles.categoryBadge}>
                        <CategoryIcon
                          categoryName={rule.category}
                          iconName={catMeta?.icon || 'tag'}
                          size={12}
                          color={catMeta?.color || '#4F46E5'}
                        />
                        <Text style={[styles.categoryBadgeText, { color: catMeta?.color || '#4F46E5' }]}>
                          {rule.category}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.ruleActions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleOpenEdit(rule)}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit rule for ${rule.merchant}`}
                      >
                        <Ionicons name="pencil" size={15} color="#64748B" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { marginLeft: 8 }]}
                        onPress={() => setDeleteRuleTarget(rule.merchant)}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete rule for ${rule.merchant}`}
                      >
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </SettingsSection>
      </ScrollView>

      {/* ADD / EDIT RULE MODAL */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingMerchant ? 'Edit Merchant Rule' : 'New Merchant Rule'}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Merchant / Business Name</Text>
            <TextInput
              style={styles.merchantTextInput}
              placeholder="e.g. Swiggy, Ramesh Kirana, Uber"
              placeholderTextColor="#94A3B8"
              value={inputMerchant}
              onChangeText={setInputMerchant}
              autoCapitalize="words"
              autoFocus={!editingMerchant}
            />

            <Text style={[styles.inputLabel, { marginTop: 14 }]}>Assigned Category</Text>
            <ScrollView
              style={{ maxHeight: 220 }}
              contentContainerStyle={styles.categoryGrid}
              showsVerticalScrollIndicator={false}
            >
              {defaultCategories
                .filter(c => c.type !== 'credit')
                .map(cat => {
                  const isSelected = cat.name.toLowerCase() === selectedCategory.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={cat.name}
                      style={[
                        styles.catOptionCard,
                        isSelected && styles.catOptionCardSelected,
                      ]}
                      onPress={() => setSelectedCategory(cat.name)}
                      activeOpacity={0.7}
                    >
                      <CategoryIcon
                        categoryName={cat.name}
                        iconName={cat.icon}
                        size={18}
                        color={isSelected ? '#4F46E5' : cat.color}
                      />
                      <Text
                        style={[
                          styles.catOptionText,
                          isSelected && styles.catOptionTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveRule}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>Save Rule</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmDialogModal
        visible={!!deleteRuleTarget}
        title="Delete Merchant Rule"
        message={`Are you sure you want to remove the automatic rule for "${deleteRuleTarget}"? Future transactions will use standard dictionary & history.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteRuleTarget(null)}
      />
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
    padding: 6,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  addRuleHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 2,
  },
  addRuleHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
  },
  privacyCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  privacyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  privacyText: {
    fontSize: 11.5,
    color: '#15803D',
    lineHeight: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    marginHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 14,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  rulesList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  ruleInfo: {
    flex: 1,
    marginRight: 12,
  },
  ruleMerchant: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  ruleActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  merchantTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 4,
  },
  catOptionCard: {
    width: '31%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  catOptionCardSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  catOptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 4,
    textAlign: 'center',
  },
  catOptionTextSelected: {
    color: '#4F46E5',
    fontWeight: '800',
  },
  saveBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
