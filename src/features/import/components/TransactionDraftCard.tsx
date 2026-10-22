import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import CategoryIcon from '@/components/CategoryIcon';
import { defaultCategories } from '@/lib/database';
import { formatCurrency } from '@/utils/formatCurrency';
import { maskAccountNumbersInText } from '@/lib/smsSettings';
import {
  buildCardSubtitle,
  checkNeedsCategory,
  DraftItemLike,
} from '../utils/importHelpers';
import { StatusChip } from './StatusChip';

interface TransactionDraftCardProps {
  item: DraftItemLike;
  showCheckbox?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpenCategorySheet?: (item: DraftItemLike) => void;
  onSaveEdit?: (id: string, updated: Partial<DraftItemLike>) => void;
  onRemove?: (item: DraftItemLike) => void;
  // Part C Pending Alerts Inbox quick actions
  showQuickActions?: boolean;
  onQuickAdd?: (item: DraftItemLike) => void;
  onQuickIgnore?: (item: DraftItemLike) => void;
  onLongPress?: (item: DraftItemLike) => void;
}

export function TransactionDraftCard({
  item,
  showCheckbox = true,
  onToggleSelect,
  onOpenCategorySheet,
  onSaveEdit,
  onRemove,
  showQuickActions = false,
  onQuickAdd,
  onQuickIgnore,
  onLongPress,
}: TransactionDraftCardProps) {
  const isDark = useColorScheme() === 'dark';
  const [isExpanded, setIsExpanded] = useState(false);

  // Editable local state when expanded
  const [editMerchant, setEditMerchant] = useState(item.merchant || '');
  const [editAmount, setEditAmount] = useState(String(item.amount));
  const [editType, setEditType] = useState<'expense' | 'income'>(
    item.type === 'income' || item.type === 'credit' ? 'income' : 'expense'
  );
  const [editCategory, setEditCategory] = useState(item.category || 'Others');

  const isCredit = item.type === 'income' || item.type === 'credit';
  const isDuplicate = !!item.isAlreadyAdded;
  const isLowConfidence = !!item.isLowConfidence || (item.confidence !== undefined && item.confidence < 0.8);
  const needsCategory = checkNeedsCategory(item.category);

  // Subtitle: "Kotak ••0741 · UPI"
  const subtitle = buildCardSubtitle(item.bankName, item.accountLast4, item.channel, item.rawText);

  // Category Icon & Color
  const catMeta = defaultCategories.find((c) => c.name.toLowerCase() === (item.category || '').toLowerCase());
  const iconName = catMeta ? catMeta.icon : 'wallet';
  const iconColor = catMeta ? catMeta.color : '#8D99AE';
  const iconBg = catMeta ? catMeta.color + '18' : isDark ? '#272A30' : '#E2E8F0';

  // Formatted Date & Time + UPI Ref
  const dateObj = new Date(item.date || Date.now());
  const dateFormatted = dateObj.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFormatted = dateObj.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const refSnippet = item.refNo ? ` · Ref ••${item.refNo.slice(-4)}` : '';
  const dateLine = `${dateFormatted}, ${timeFormatted}${refSnippet}`;

  // Theme Colors
  const bgColor = isDark ? '#18191D' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#272A30' : '#E2E8F0';
  const inputBg = isDark ? '#22252B' : '#F1F5F9';
  const amountColor = isCredit ? '#16A34A' : '#EF4444';

  const handleToggle = () => {
    if (isDuplicate) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
    onToggleSelect?.(item.id);
  };

  const handleSaveInlineEdit = () => {
    const num = parseFloat(editAmount.replace(/,/g, ''));
    if (isNaN(num) || num <= 0) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }

    onSaveEdit?.(item.id, {
      merchant: editMerchant.trim() || item.merchant,
      amount: num,
      type: editType,
      category: editCategory,
    });
    setIsExpanded(false);
  };

  // Masked original text
  const maskedOriginal = item.rawText ? maskAccountNumbersInText(item.rawText) : null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: bgColor, borderColor },
        isDuplicate && styles.duplicateCard,
      ]}
    >
      {/* Main Row */}
      <View style={styles.cardHeader}>
        {/* Left: Checkbox */}
        {showCheckbox && (
          <TouchableOpacity
            style={[styles.checkboxTouchTarget, isDuplicate && { opacity: 0.35 }]}
            onPress={handleToggle}
            disabled={isDuplicate}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!item.selected, disabled: isDuplicate }}
            accessibilityLabel={`Select transaction ${item.merchant || 'Payment'}`}
          >
            {isDuplicate ? (
              <Ionicons name="close-circle-outline" size={22} color={subtextColor} />
            ) : item.selected ? (
              <Ionicons name="checkbox" size={22} color="#4F46E5" />
            ) : (
              <Ionicons name="square-outline" size={22} color={subtextColor} />
            )}
          </TouchableOpacity>
        )}

        {/* Center: Tap to Expand / Collapse */}
        <TouchableOpacity
          style={styles.cardHeaderBody}
          onPress={() => setIsExpanded(!isExpanded)}
          onLongPress={() => onLongPress?.(item)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${item.merchant || 'Payment'}, ${subtitle}, ${formatCurrency(item.amount)}`}
        >
          {/* Category Icon Circle */}
          <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
            <CategoryIcon categoryName={item.category || 'Others'} iconName={iconName} size={20} color={iconColor} />
          </View>

          {/* Center: Payee & Subtitle & Date */}
          <View style={styles.centerInfo}>
            {/* Payee / Title */}
            <Text
              style={[styles.title, { color: textColor }, isDuplicate && styles.duplicateText]}
              numberOfLines={1}
            >
              {item.merchant || (isCredit ? 'Income' : 'Payment')}
            </Text>

            {/* Subtitle Line: "Kotak ••0741 · UPI" */}
            <Text style={[styles.subtitle, { color: subtextColor }]} numberOfLines={1}>
              {subtitle}
            </Text>

            {/* Third Line: Formatted Date/Time + UPI Ref */}
            <Text style={[styles.dateLine, { color: subtextColor }]} numberOfLines={1}>
              {dateLine}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Right: Amount & Category Chip */}
        <View style={styles.rightAmountCol}>
          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.amountText,
                { color: isDuplicate ? subtextColor : amountColor },
                isDuplicate && styles.duplicateText,
              ]}
              numberOfLines={1}
            >
              {formatCurrency(item.amount, { showPlus: isCredit })}
            </Text>
          </TouchableOpacity>

          {/* Small Tappable Category Chip */}
          <TouchableOpacity
            style={[styles.categoryChip, { backgroundColor: inputBg, borderColor }]}
            onPress={() => onOpenCategorySheet?.(item)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Change category from ${item.category || 'Others'}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text
              style={[
                styles.categoryChipText,
                { color: needsCategory ? '#D97706' : subtextColor },
              ]}
              numberOfLines={1}
            >
              {item.category || 'Others'}
            </Text>
            <Ionicons name="chevron-down" size={10} color={subtextColor} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Status Chips Row */}
      <View style={styles.chipsRow}>
        {isDuplicate && <StatusChip type="already_added" />}

        {!isDuplicate && needsCategory && (
          <StatusChip
            type="needs_category"
            onPress={() => onOpenCategorySheet?.(item)}
          />
        )}

        {!isDuplicate && isLowConfidence && !needsCategory && (
          <StatusChip
            type="low_confidence"
            onPress={() => setIsExpanded(true)}
          />
        )}

        {!isDuplicate && (item.matchedBillTitle || (item.candidateBills && item.candidateBills.length > 0)) && (
          <StatusChip
            type="bill_match"
            label={`Matches bill: ${item.matchedBillTitle || item.candidateBills?.[0]?.title || 'Recurring Bill'}`}
          />
        )}

        {/* Dismiss / Remove Button on Draft */}
        {onRemove && !isDuplicate && (
          <TouchableOpacity
            style={styles.deleteDraftBtn}
            onPress={() => onRemove(item)}
            accessibilityRole="button"
            accessibilityLabel="Remove draft"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Actions Row for Pending Alerts Inbox */}
      {showQuickActions && !isDuplicate && (
        <View style={[styles.quickActionsBar, { borderTopColor: borderColor }]}>
          <TouchableOpacity
            style={[styles.quickActionBtn, styles.quickAddBtn]}
            onPress={() => onQuickAdd?.(item)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add transaction"
          >
            <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.quickAddText}>Add</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionBtn, styles.quickEditBtn, { backgroundColor: inputBg }]}
            onPress={() => setIsExpanded(!isExpanded)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Edit transaction"
          >
            <Ionicons name="pencil" size={14} color={textColor} style={{ marginRight: 4 }} />
            <Text style={[styles.quickEditText, { color: textColor }]}>
              {isExpanded ? 'Close' : 'Edit'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickActionBtn, styles.quickIgnoreBtn, { backgroundColor: inputBg }]}
            onPress={() => onQuickIgnore?.(item)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Ignore alert"
          >
            <Ionicons name="close" size={14} color="#EF4444" style={{ marginRight: 4 }} />
            <Text style={styles.quickIgnoreText}>Ignore</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Inline Expanded Edit Section */}
      {isExpanded && (
        <View style={[styles.expandedSection, { borderTopColor: borderColor }]}>
          <Text style={[styles.editSectionTitle, { color: subtextColor }]}>Edit Draft</Text>

          {/* Amount and Type Row */}
          <View style={styles.editRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.inputLabel, { color: subtextColor }]}>Amount (₹)</Text>
              <TextInput
                style={[styles.editInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
              />
            </View>

            {/* Type Toggle */}
            <View style={{ flex: 1 }}>
              <Text style={[styles.inputLabel, { color: subtextColor }]}>Type</Text>
              <View style={[styles.typeToggleWrap, { backgroundColor: inputBg, borderColor }]}>
                <TouchableOpacity
                  style={[
                    styles.typeBtn,
                    editType === 'expense' && styles.typeBtnActiveExpense,
                  ]}
                  onPress={() => setEditType('expense')}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      editType === 'expense' ? { color: '#FFFFFF' } : { color: subtextColor },
                    ]}
                  >
                    Expense
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeBtn,
                    editType === 'income' && styles.typeBtnActiveIncome,
                  ]}
                  onPress={() => setEditType('income')}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      editType === 'income' ? { color: '#FFFFFF' } : { color: subtextColor },
                    ]}
                  >
                    Income
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Payee / Merchant Input */}
          <View style={{ marginBottom: 10 }}>
            <Text style={[styles.inputLabel, { color: subtextColor }]}>Payee / Merchant</Text>
            <TextInput
              style={[styles.editInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
              value={editMerchant}
              onChangeText={setEditMerchant}
              placeholder="e.g. Swiggy, Netflix, Shubham Rai"
              placeholderTextColor={subtextColor}
            />
          </View>

          {/* Category Selector */}
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.inputLabel, { color: subtextColor }]}>Category</Text>
            <TouchableOpacity
              style={[styles.editCategoryBtn, { backgroundColor: inputBg, borderColor }]}
              onPress={() => onOpenCategorySheet?.(item)}
            >
              <Text style={[styles.editCategoryBtnText, { color: textColor }]}>
                {item.category || 'Select category'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={subtextColor} />
            </TouchableOpacity>
          </View>

          {/* Original Message snippet (masked) */}
          {maskedOriginal && (
            <View style={[styles.originalMsgBox, { backgroundColor: inputBg, borderColor }]}>
              <Text style={[styles.originalMsgTitle, { color: subtextColor }]}>Original Alert (Masked)</Text>
              <Text style={[styles.originalMsgBody, { color: textColor }]}>{maskedOriginal}</Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.expandedActionsRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor }]}
              onPress={() => setIsExpanded(false)}
            >
              <Text style={[styles.cancelBtnText, { color: subtextColor }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveDraftBtn}
              onPress={handleSaveInlineEdit}
            >
              <Text style={styles.saveDraftBtnText}>Save to Draft</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  duplicateCard: {
    opacity: 0.65,
    backgroundColor: '#F8FAFC',
  },
  duplicateText: {
    textDecorationLine: 'line-through',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  checkboxTouchTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  centerInfo: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  dateLine: {
    fontSize: 11,
    marginTop: 2,
  },
  rightAmountCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    maxWidth: 110,
  },
  categoryChipText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 46, // Aligns with title
    marginTop: 4,
  },
  deleteDraftBtn: {
    padding: 6,
    marginLeft: 'auto',
  },
  quickActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    minHeight: 38,
  },
  quickAddBtn: {
    backgroundColor: '#16A34A',
  },
  quickAddText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  quickEditBtn: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickEditText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  quickIgnoreBtn: {
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  quickIgnoreText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '700',
  },
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  editSectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  editRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
  },
  typeToggleWrap: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 2,
    height: 38,
  },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  typeBtnActiveExpense: {
    backgroundColor: '#EF4444',
  },
  typeBtnActiveIncome: {
    backgroundColor: '#16A34A',
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  editCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  editCategoryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  originalMsgBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  originalMsgTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  originalMsgBody: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
  expandedActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  saveDraftBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  saveDraftBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
