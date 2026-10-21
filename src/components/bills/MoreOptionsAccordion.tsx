import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';

interface MoreOptionsAccordionProps {
  notes: string;
  onChangeNotes: (text: string) => void;
  reminderDays: number;
  onChangeReminderDays: (days: number) => void;
}

const REMINDER_DAY_OPTIONS = [1, 2, 3, 5, 7];

export function MoreOptionsAccordion({
  notes,
  onChangeNotes,
  reminderDays,
  onChangeReminderDays,
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
          {/* Notes Field */}
          <Text style={styles.label}>{t('note') || 'Notes'}</Text>
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

          {/* Reminder Days Before */}
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
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  inputWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
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
