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

interface CategorySheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectCategory: (categoryName: string) => void;
  currentCategory?: string | null;
}

const TOP_SUGGESTIONS = [
  'Food',
  'Groceries',
  'Dining',
  'Shopping',
  'Travel',
  'Fuel',
  'Bills',
  'Utilities',
  'Health',
  'Entertainment',
  'Salary',
  'Income',
];

export function CategorySheet({
  visible,
  onClose,
  onSelectCategory,
  currentCategory,
}: CategorySheetProps) {
  const isDark = useColorScheme() === 'dark';
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return defaultCategories;
    const q = search.trim().toLowerCase();
    return defaultCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [search]);

  const topCategories = useMemo(() => {
    return defaultCategories.filter((c) => TOP_SUGGESTIONS.includes(c.name));
  }, []);

  const handleSelect = (name: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    onSelectCategory(name);
    onClose();
  };

  const bgColor = isDark ? '#18191D' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#272A30' : '#E2E8F0';
  const inputBg = isDark ? '#22252B' : '#F1F5F9';

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
                            backgroundColor: isSelected
                              ? isDark
                                ? '#312E81'
                                : '#EEF2FF'
                              : isDark
                              ? '#22252B'
                              : '#F8FAFC',
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
                            backgroundColor: isSelected
                              ? isDark
                                ? '#312E81'
                                : '#EEF2FF'
                              : isDark
                              ? '#22252B'
                              : '#F8FAFC',
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
});
