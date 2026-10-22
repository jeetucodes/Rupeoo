import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';

interface MoreOptionsAccordionProps {
  notes: string;
  onChangeNotes: (text: string) => void;
  reminderDays: number;
  onChangeReminderDays: (days: number) => void;
  autoConfirm?: boolean;
  onChangeAutoConfirm?: (val: boolean) => void;
  keywords?: string;
  onChangeKeywords?: (text: string) => void;
  amountTolerance?: string;
  onChangeAmountTolerance?: (text: string) => void;
}

const REMINDER_DAY_OPTIONS = [1, 2, 3, 5, 7];

export function MoreOptionsAccordion({
  notes,
  onChangeNotes,
  reminderDays,
  onChangeReminderDays,
  autoConfirm = true,
  onChangeAutoConfirm,
  keywords = '',
  onChangeKeywords,
  amountTolerance = '0',
  onChangeAmountTolerance,
}: MoreOptionsAccordionProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsOpen(!isOpen)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('more_options') || 'More options'}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="options-outline" size={17} color="#64748B" style={{ marginRight: 8 }} />
          <Text style={styles.headerTitle}>{t('more_options') || 'More options'}</Text>
        </View>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#64748B"
        />
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.body}>
          {/* 1. Auto-Confirm Payments Toggle */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="flash-outline" size={15} color="#4F46E5" />
                <Text style={styles.toggleTitle}>Auto-confirm payments</Text>
              </View>
              <Text style={styles.toggleSub}>
                Automatically mark paid when debit notification is detected
              </Text>
            </View>
            <Switch
              value={autoConfirm}
              onValueChange={onChangeAutoConfirm}
              trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
              thumbColor={Platform.OS === 'android' ? (autoConfirm ? '#FFFFFF' : '#F1F5F9') : undefined}
            />
          </View>

          {/* 2. Keywords Input */}
          <Text style={styles.label}>Matching Keywords (Optional)</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. jio, reliance, myjio"
              placeholderTextColor="#94A3B8"
              value={keywords}
              onChangeText={onChangeKeywords}
              maxLength={120}
              autoCapitalize="none"
            />
          </View>
          <Text style={styles.helperText}>
            Comma-separated keywords or aliases to match notification text
          </Text>

          {/* 3. Amount Tolerance Input */}
          <Text style={[styles.label, { marginTop: 10 }]}>Amount Tolerance (Optional)</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textInput}
              placeholder="0 (exact match)"
              placeholderTextColor="#94A3B8"
              value={amountTolerance}
              onChangeText={onChangeAmountTolerance}
              keyboardType="numeric"
              maxLength={6}
            />
          </View>
          <Text style={styles.helperText}>
            Allow ± ₹ difference when matching (default 0 for exact match)
          </Text>

          {/* 4. Notes Field */}
          <Text style={[styles.label, { marginTop: 12 }]}>{t('note') || 'Notes'}</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Account number, plan details..."
              placeholderTextColor="#94A3B8"
              value={notes}
              onChangeText={onChangeNotes}
              maxLength={150}
            />
          </View>

          {/* 5. Reminder Days Before */}
          <Text style={styles.label}>
            {t('remind_me') || 'Remind me'} ({reminderDays} {t('days_before') || 'days before'})
          </Text>
          <View style={styles.reminderChipsRow}>
            {REMINDER_DAY_OPTIONS.map(days => {
              const isSelected = reminderDays === days;
              return (
                <TouchableOpacity
                  key={days}
                  style={[styles.remindChip, isSelected && styles.remindChipSelected]}
                  onPress={() => onChangeReminderDays(days)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Remind ${days} days before`}
                >
                  <Text style={[styles.remindChipText, isSelected && styles.remindChipTextSelected]}>
                    {days} {days === 1 ? 'day' : 'days'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 46,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  toggleSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  helperText: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: -8,
    marginBottom: 10,
    marginLeft: 2,
  },
  inputWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  reminderChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  remindChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  remindChipSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  remindChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  remindChipTextSelected: {
    color: '#FFFFFF',
  },
});

export default MoreOptionsAccordion;
