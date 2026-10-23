import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  useColorScheme,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import CategoryIcon from '@/components/CategoryIcon';
import { defaultCategories } from '@/lib/database';
import { saveUserRule, getTopCategorySuggestions, normalizeMerchant } from '@/lib/categorizer';

interface CategorySheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectCategory: (categoryName: string, applyToAll?: boolean) => void;
  currentCategory?: string | null;
  merchantName?: string | null;
  suggestedCategories?: string[];
  userId?: string;
}

export function CategorySheet({
  visible,
  onClose,
  onSelectCategory,
  currentCategory,
  merchantName,
  suggestedCategories,
  userId,
}: CategorySheetProps) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [applyToAll, setApplyToAll] = useState(true);

  const cleanMerchant = useMemo(() => {
    return normalizeMerchant(merchantName) || merchantName || '';
  }, [merchantName]);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return defaultCategories;
    const q = search.trim().toLowerCase();
    return defaultCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [search]);

  // Compute top 5 suggestions tailored to merchant
  const topCategories = useMemo(() => {
    const list = getTopCategorySuggestions(
      currentCategory,
      suggestedCategories && suggestedCategories.length > 0
        ? suggestedCategories
        : defaultCategories.map(c => c.name)
    );
    return defaultCategories.filter((c) => list.includes(c.name));
  }, [currentCategory, suggestedCategories]);

  const handleSelect = async (name: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (cleanMerchant && applyToAll) {
      try {
        await saveUserRule(cleanMerchant, name, userId);
      } catch {}
    }

    onSelectCategory(name, applyToAll);
    onClose();
  };

  const bgColor = '#FFFFFF';
  const textColor = '#0F172A';
  const subtextColor = '#64748B';
  const borderColor = '#E2E8F0';
  const inputBg = '#F1F5F9';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: bgColor }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View>
              <Text style={[styles.title, { color: textColor }]}>Select Category</Text>
              <Text style={[styles.subtitle, { color: subtextColor }]}>
                Choose a category to organize this expense
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: inputBg }]}
              accessibilityRole="button"
              accessibilityLabel="Close category picker"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={subtextColor} />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor }]}>
            <Ionicons name="search" size={16} color={subtextColor} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search categories..."
              placeholderTextColor={subtextColor}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={subtextColor} />
              </TouchableOpacity>
            )}
          </View>

          {/* Apply to All Merchant Toggle */}
          {cleanMerchant ? (
            <TouchableOpacity
              style={styles.applyToAllRow}
              onPress={() => setApplyToAll(!applyToAll)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={applyToAll ? 'checkbox' : 'square-outline'}
                size={18}
                color={applyToAll ? '#4F46E5' : '#94A3B8'}
                style={{ marginRight: 8 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.applyToAllTitle}>
                  Always categorize "{cleanMerchant}" as selected
                </Text>
                <Text style={styles.applyToAllSub}>
                  Saves a learned rule and applies to future transactions
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* Top Suggestions (when not actively searching) */}
            {!search.trim() && !showAll && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: subtextColor }]}>Top Suggestions</Text>
                <View style={styles.grid}>
                  {topCategories.map((cat) => {
                    const isSelected = cat.name === currentCategory;
                    return (
                      <TouchableOpacity
                        key={cat.name}
                        style={[
                          styles.categoryCard,
                          {
                            backgroundColor: isSelected ? '#EEF2FF' : '#F8FAFC',
                            borderColor: isSelected ? '#6366F1' : borderColor,
                          },
                        ]}
                        onPress={() => handleSelect(cat.name)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={cat.name}
                      >
                        <CategoryIcon categoryName={cat.name} iconName={cat.icon} size={22} color={cat.color} />
                        <Text
                          style={[
                            styles.categoryName,
                            { color: isSelected ? '#6366F1' : textColor, fontWeight: isSelected ? '700' : '600' },
                          ]}
                          numberOfLines={1}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* More Button */}
                <TouchableOpacity
                  style={[styles.moreBtn, { borderColor }]}
                  onPress={() => setShowAll(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.moreBtnText, { color: textColor }]}>View All Categories</Text>
                  <Ionicons name="chevron-forward" size={14} color={subtextColor} />
                </TouchableOpacity>
              </View>
            )}

            {/* Full / Filtered Categories */}
            {(showAll || search.trim().length > 0) && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                    {search.trim() ? `Search Results (${filteredCategories.length})` : 'All Categories'}
                  </Text>
                  {showAll && !search.trim() && (
                    <TouchableOpacity onPress={() => setShowAll(false)}>
                      <Text style={{ fontSize: 12, color: '#6366F1', fontWeight: '700' }}>Show Suggestions</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.grid}>
                  {filteredCategories.map((cat) => {
                    const isSelected = cat.name === currentCategory;
                    return (
                      <TouchableOpacity
                        key={cat.name}
                        style={[
                          styles.categoryCard,
                          {
                            backgroundColor: isSelected ? '#EEF2FF' : '#F8FAFC',
                            borderColor: isSelected ? '#6366F1' : borderColor,
                          },
                        ]}
                        onPress={() => handleSelect(cat.name)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={cat.name}
                      >
                        <CategoryIcon categoryName={cat.name} iconName={cat.icon} size={22} color={cat.color} />
                        <Text
                          style={[
                            styles.categoryName,
                            { color: isSelected ? '#6366F1' : textColor, fontWeight: isSelected ? '700' : '600' },
                          ]}
                          numberOfLines={1}
                        >
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={{ height: 32 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  scrollArea: {
    marginTop: 8,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryCard: {
    width: '31%',
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1,
  },
  categoryName: {
    fontSize: 11.5,
    marginTop: 6,
    textAlign: 'center',
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    gap: 6,
  },
  moreBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  applyToAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  applyToAllTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#312E81',
  },
  applyToAllSub: {
    fontSize: 10.5,
    color: '#6366F1',
    marginTop: 1,
  },
});
