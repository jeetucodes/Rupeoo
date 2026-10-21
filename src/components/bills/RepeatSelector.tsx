import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useTranslation } from '@/lib/i18n';

interface RepeatSelectorProps {
  billType?: 'monthly_date' | 'cycle_days';
  repeatType?: 'monthly_date' | 'cycle_days';
  onChangeBillType?: (type: 'monthly_date' | 'cycle_days') => void;
  onChangeRepeatType?: (type: 'monthly_date' | 'cycle_days') => void;
  dueDay: number;
  onChangeDueDay: (day: number) => void;
  isLastDayOfMonth?: boolean;
  onToggleLastDayOfMonth?: (isLast: boolean) => void;
  cycleDays: number;
  onChangeCycleDays: (days: number) => void;
  startDate: string;
  onOpenCalendarModal?: () => void;
  onPressPickStartDate?: () => void;
  nextDueDate?: string;
}

const RECHARGE_CYCLES = [
  { days: 28, label: '28 Days (1 Mo)' },
  { days: 56, label: '56 Days (2 Mo)' },
  { days: 84, label: '84 Days (3 Mo)' },
  { days: 365, label: '365 Days (1 Yr)' },
];

export function RepeatSelector({
  billType,
  repeatType,
  onChangeBillType,
  onChangeRepeatType,
  dueDay,
  onChangeDueDay,
  isLastDayOfMonth = false,
  onToggleLastDayOfMonth,
  cycleDays,
  onChangeCycleDays,
  startDate,
  onOpenCalendarModal,
  onPressPickStartDate,
  nextDueDate,
}: RepeatSelectorProps) {
  const { t } = useTranslation();
  const currentType = repeatType || billType || 'monthly_date';
  const handleTypeChange = onChangeRepeatType || onChangeBillType || (() => {});
  const handleCalendarOpen = onOpenCalendarModal || onPressPickStartDate || (() => {});
  const handleToggleLastDay = onToggleLastDayOfMonth || (() => {});

  const handleStepDay = (delta: number) => {
    if (isLastDayOfMonth) {
      handleToggleLastDay(false);
    }
    let next = dueDay + delta;
    if (next < 1) next = 31;
    if (next > 31) next = 1;
    onChangeDueDay(next);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('repeats') || 'Repeats'}</Text>

      {/* Compact Segmented Control */}
      <View style={styles.segmentWrap}>
        <TouchableOpacity
          style={[styles.segmentBtn, currentType === 'monthly_date' && styles.segmentBtnActive]}
          onPress={() => handleTypeChange('monthly_date')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('repeats_monthly') || 'Monthly on a day'}
        >
          <Ionicons
            name="calendar"
            size={14}
            color={currentType === 'monthly_date' ? '#FFFFFF' : '#475569'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.segmentText, currentType === 'monthly_date' && styles.segmentTextActive]}>
            {t('repeats_monthly') || 'Monthly on a day'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, currentType === 'cycle_days' && styles.segmentBtnActive]}
          onPress={() => handleTypeChange('cycle_days')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('repeats_cycle') || 'Every N days'}
        >
          <Ionicons
            name="repeat"
            size={14}
            color={currentType === 'cycle_days' ? '#FFFFFF' : '#475569'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.segmentText, currentType === 'cycle_days' && styles.segmentTextActive]}>
            {t('repeats_cycle') || 'Every N days'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mode 1: Monthly on a Day */}
      {currentType === 'monthly_date' ? (
        <View style={styles.monthlySection}>
          <View style={styles.stepperRow}>
            {/* Day Stepper */}
            <View style={styles.stepperBox}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => handleStepDay(-1)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Decrease day"
              >
                <Ionicons name="remove" size={18} color="#0F172A" />
              </TouchableOpacity>

              <View style={styles.dayValueWrap}>
                <Text style={styles.dayValue}>
                  {isLastDayOfMonth ? '31st' : `${dueDay}${getOrdinal(dueDay)}`}
                </Text>
                <Text style={styles.dayValueSub}>
                  {isLastDayOfMonth ? 'End of month' : 'of every month'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => handleStepDay(1)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Increase day"
              >
                <Ionicons name="add" size={18} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* "Last day of month" Toggle Pill */}
            <TouchableOpacity
              style={[styles.lastDayPill, isLastDayOfMonth && styles.lastDayPillActive]}
              onPress={() => {
                const nextState = !isLastDayOfMonth;
                handleToggleLastDay(nextState);
                if (nextState) {
                  onChangeDueDay(31);
                }
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('last_day_of_month') || 'Last day of month'}
            >
              <Ionicons
                name={isLastDayOfMonth ? 'checkmark-circle' : 'radio-button-off'}
                size={14}
                color={isLastDayOfMonth ? '#FFFFFF' : '#64748B'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.lastDayText, isLastDayOfMonth && styles.lastDayTextActive]}>
                {t('last_day_of_month') || 'Last day of month'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Mode 2: Every N Days (Cycle) */
        <View style={styles.cycleSection}>
          {/* Validity Chips */}
          <Text style={styles.subLabel}>{t('validity_pack') || 'Validity Pack'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cycleChipsRow}>
            {RECHARGE_CYCLES.map(c => {
              const isSelected = cycleDays === c.days;
              return (
                <TouchableOpacity
                  key={c.days}
                  style={[styles.cycleChip, isSelected && styles.cycleChipSelected]}
                  onPress={() => onChangeCycleDays(c.days)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={c.label}
                >
                  <Text style={[styles.cycleChipText, isSelected && styles.cycleChipTextSelected]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Start / Recharge Date Selector */}
          <View style={styles.startDateRow}>
            <Text style={styles.subLabel}>{t('start_date') || 'Pack Start Date'}</Text>
            <TouchableOpacity
              style={styles.datePickerBtn}
              onPress={handleCalendarOpen}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Select start date"
            >
              <ExpoImage
                source={{ uri: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Spiral%20Calendar.png' }}
                style={{ width: 17, height: 17, marginRight: 6 }}
                contentFit="contain"
              />
              <Text style={styles.datePickerText}>{startDate}</Text>
              <Ionicons name="chevron-forward" size={14} color="#64748B" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Single Live "Next due: <date>" preview line */}
      <View style={styles.previewLine}>
        <View style={styles.previewDot} />
        <Text style={styles.previewText}>
          Next due:{' '}
          <Text style={styles.previewDateBold}>{nextDueDate || 'Calculating...'}</Text>
        </Text>
      </View>
    </View>
  );
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  subLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    minHeight: 40,
  },
  segmentBtnActive: {
    backgroundColor: '#0F172A',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  monthlySection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  stepperBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayValueWrap: {
    alignItems: 'center',
  },
  dayValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  dayValueSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  lastDayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 48,
  },
  lastDayPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  lastDayText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  lastDayTextActive: {
    color: '#FFFFFF',
  },
  cycleSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  cycleChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  cycleChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 34,
    justifyContent: 'center',
  },
  cycleChipSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  cycleChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  cycleChipTextSelected: {
    color: '#FFFFFF',
  },
  startDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 34,
  },
  datePickerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewLine: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 8,
  },
  previewText: {
    fontSize: 12.5,
    color: '#15803D',
    fontWeight: '600',
  },
  previewDateBold: {
    fontWeight: '900',
    color: '#166534',
  },
});

export default RepeatSelector;
