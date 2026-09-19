import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import CategoryIcon from '@/components/CategoryIcon';
import Skeleton from '@/components/Skeleton';
import { useAuth } from '@/context/AuthContext';
import {
  getUserCategories,
  addCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  CategoryItem,
} from '@/lib/database';
import { safeGoBack } from '@/lib/navigation';
import { useTranslation } from '@/lib/i18n';
import { ConfirmDialogModal } from '@/components/confirm-dialog-modal';

const AVAILABLE_ICONS = [
  'rose',
  'nurse',
  'heart-gift',
  'heart-shopping',
  'eggs',
  'smoking',
  'eating',
  'alcohol',
  'medicine',
  'pet',
  'baby',
  'beauty',
  'electronics',
  'internet',
  'parking',
  'sports',
  'cinema',
  'books',
  'charity',
  'laundry',
  'ice-cream',
  'cupcake',
  'donut',
  'cookie',
  'candy',
  'cake',
  'lollipop',
  'chocolate',
  'pancakes',
  'popcorn',
  'strawberry',
  'watermelon',
  'banana',
  'apple',
  'fast-food',
  'airplane',
  'cart',
  'home',
  'receipt',
  'card',
  'film',
  'play-circle',
  'medkit',
  'school',
  'car',
  'gift',
  'fitness',
  'cafe',
  'game-controller',
  'briefcase',
  'bus',
  'bicycle',
  'shirt',
  'musical-notes',
];

const AVAILABLE_COLORS = [
  '#FF6B6B',
  '#4D96FF',
  '#9D4EDD',
  '#6BCB77',
  '#FF9F1C',
  '#E63946',
  '#FFD166',
  '#118AB2',
  '#06D6A0',
  '#073B4C',
  '#F72585',
  '#7209B7',
  '#3A0CA3',
  '#4361EE',
  '#4CC9F0',
];

export default function CategoriesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit Category Modal
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [catToDelete, setCatToDelete] = useState<CategoryItem | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('fast-food');
  const [selectedColor, setSelectedColor] = useState('#4D96FF');
  const [saving, setSaving] = useState(false);

  const fetchCategories = async () => {
    if (!user) return;
    try {
      const list = await getUserCategories(user.uid);
      setCategories(list);
    } catch (err) {
      console.error('Error fetching categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [user]);

  const openAddModal = () => {
    setEditingCategory(null);
    setCategoryName('');
    setSelectedIcon(AVAILABLE_ICONS[0]);
    setSelectedColor(AVAILABLE_COLORS[0]);
    setShowModal(true);
  };

  const openEditModal = (cat: CategoryItem) => {
    if (!cat.isCustom) return;
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setSelectedIcon(cat.icon);
    setSelectedColor(cat.color);
    setShowModal(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      Alert.alert(t('category'), 'Please enter a category name.');
      return;
    }

    if (!user) return;
    setSaving(true);
    try {
      if (editingCategory && editingCategory.id) {
        await updateCustomCategory(user.uid, editingCategory.id, {
          name: categoryName.trim(),
          icon: selectedIcon,
          color: selectedColor,
        });
      } else {
        await addCustomCategory(user.uid, {
          name: categoryName.trim(),
          icon: selectedIcon,
          color: selectedColor,
        });
      }
      await fetchCategories();
      setShowModal(false);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteCat = async (catId: string) => {
    if (!user || !catId) return;
    try {
      await deleteCustomCategory(user.uid, catId);
      await fetchCategories();
    } catch (err) {
      console.error(err);
      if (Platform.OS === 'web') {
        window.alert('Failed to delete category.');
      } else {
        Alert.alert('Error', 'Failed to delete category.');
      }
    }
  };

  const handleDeleteCategory = (cat: CategoryItem) => {
    if (!cat.isCustom || !cat.id) {
      if (Platform.OS === 'web') {
        window.alert('Default categories cannot be deleted.');
      } else {
        Alert.alert('Default Category', 'Default categories cannot be deleted.');
      }
      return;
    }
    setCatToDelete(cat);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />
        <View style={styles.topBar}>
          <View style={styles.backButton}><Skeleton width={24} height={24} borderRadius={12} /></View>
          <Skeleton width={140} height={20} />
          <View style={styles.addButton}><Skeleton width={24} height={24} borderRadius={12} /></View>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.listCard}>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                <Skeleton width={44} height={44} borderRadius={22} style={{ marginRight: 16 }} />
                <View style={{ flex: 1 }}>
                  <Skeleton width={120} height={16} />
                </View>
                <Skeleton width={24} height={24} borderRadius={12} />
              </View>
            ))}
          </View>
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
        <Text style={styles.headerTitle}>
          {t('manage_categories')}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddModal}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={24} color="#1C1C1E" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.listCard}>
          {categories.map((cat, idx) => {
            const isLast = idx === categories.length - 1;

            return (
              <View
                key={cat.id || cat.name}
                style={[styles.categoryRow, !isLast && styles.rowBorder]}
              >
                <View style={[styles.iconCircle, { backgroundColor: cat.color + '20', overflow: 'hidden' }]}>
                  <CategoryIcon categoryName={cat.name} iconName={cat.icon} size={22} color={cat.color} />
                </View>

                <View style={styles.nameWrap}>
                  <Text style={styles.categoryNameText}>{cat.name}</Text>
                  <View
                    style={[
                      styles.badge,
                      cat.isCustom ? styles.badgeCustom : styles.badgeDefault,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        cat.isCustom ? styles.badgeTextCustom : styles.badgeTextDefault,
                      ]}
                    >
                      {cat.isCustom ? t('custom_badge') : t('default_badge')}
                    </Text>
                  </View>
                </View>

                {cat.isCustom ? (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => openEditModal(cat)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil" size={18} color="#6B7280" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => handleDeleteCategory(cat)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Ionicons name="lock-closed" size={16} color="#D1D5DB" style={{ marginRight: 8 }} />
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Add / Edit Category Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCategory ? t('edit_category') : t('add_new_category')}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Category Name */}
              <Text style={styles.formLabel}>{t('category_name')}</Text>
              <TextInput
                style={[styles.nameInput, { color: '#1C1C1E' }]}
                placeholder="e.g. Subscriptions, Gym..."
                placeholderTextColor="#9CA3AF"
                value={categoryName}
                onChangeText={setCategoryName}
              />

              {/* Icon Selector */}
              <Text style={styles.formLabel}>{t('category_icon')}</Text>
              <View style={styles.iconsGrid}>
                {AVAILABLE_ICONS.map(icon => (
                  <TouchableOpacity
                    key={icon}
                    style={[
                      styles.iconOption,
                      selectedIcon === icon && styles.iconOptionActive,
                    ]}
                    onPress={() => setSelectedIcon(icon)}
                    activeOpacity={0.7}
                  >
                    <CategoryIcon
                      categoryName=""
                      iconName={icon}
                      size={28}
                      color={selectedIcon === icon ? '#1C1C1E' : '#6B7280'}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Color Selector */}
              <Text style={styles.formLabel}>{t('category_color')}</Text>
              <View style={styles.colorsGrid}>
                {AVAILABLE_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      selectedColor === color && styles.colorOptionActive,
                    ]}
                    onPress={() => setSelectedColor(color)}
                    activeOpacity={0.8}
                  >
                    {selectedColor === color && (
                      <Ionicons name="checkmark" size={16} color="#ffffff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSaveCategory}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#1C1C1E" />
                ) : (
                  <Text style={styles.saveBtnText}>{t('save')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CUSTOM DELETE CATEGORY CONFIRMATION MODAL */}
      <ConfirmDialogModal
        visible={!!catToDelete}
        title="Delete Category"
        message={`Are you sure you want to delete "${catToDelete?.name}"? All past transactions will remain safe.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={() => {
          if (catToDelete?.id) {
            executeDeleteCat(catToDelete.id);
            setCatToDelete(null);
          }
        }}
        onCancel={() => setCatToDelete(null)}
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFD740',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  listCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 2,
    overflow: 'hidden',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  nameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  categoryNameText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeDefault: {
    backgroundColor: '#F3F4F6',
  },
  badgeCustom: {
    backgroundColor: '#FEF9E7',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextDefault: {
    color: '#9CA3AF',
  },
  badgeTextCustom: {
    color: '#B45309',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '88%',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  formLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nameInput: {
    backgroundColor: '#F7F8FC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    height: 50,
    paddingHorizontal: 16,
    fontSize: 15.5,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  iconsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F7F8FC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  iconOptionActive: {
    backgroundColor: '#FFD740',
    borderColor: '#FFD740',
    transform: [{ scale: 1.1 }],
  },
  colorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  colorOption: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOptionActive: {
    borderWidth: 3,
    borderColor: '#1C1C1E',
    transform: [{ scale: 1.15 }],
  },
  saveBtn: {
    backgroundColor: '#FFD740',
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
    marginTop: 8,
    marginBottom: 16,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1C1C1E',
  },
});
