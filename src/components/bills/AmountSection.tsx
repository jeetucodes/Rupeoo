import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useTranslation } from '@/lib/i18n';

interface AmountSectionProps {
  amount: string;
  onChangeAmount: (text: string) => void;
  currencySymbol: string;
  quickAmounts?: string[];
  error?: string | null;
}

export function AmountSection({
  amount,
  onChangeAmount,
  currencySymbol,
  quickAmounts,
  error,
}: AmountSectionProps) {
  const { t } = useTranslation();

  const handleTextChange = (val: string) => {
    // Clean input: only digits and a single decimal point with up to 2 decimals
    let cleaned = val.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    if (cleaned.includes('.')) {
      const [intPart, decPart] = cleaned.split('.');
      cleaned = intPart + '.' + decPart.slice(0, 2);
    }
    onChangeAmount(cleaned);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('amount') || 'Amount'}</Text>

      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <Text style={styles.currencyPrefix}>{currencySymbol}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="0.00"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          value={amount}
          onChangeText={handleTextChange}
          accessibilityLabel="Bill amount"
        />
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      {/* Quick Amount Chips (only if provided for region/type) */}
      {quickAmounts && quickAmounts.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickAmountsRow}
        >
          {quickAmounts.map(amt => {
            const isSelected = amount === amt;
            return (
              <TouchableOpacity
                key={amt}
                style={[styles.amtChip, isSelected && styles.amtChipSelected]}
                onPress={() => onChangeAmount(amt)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Amount ${currencySymbol}${amt}`}
              >
                <Text style={[styles.amtChipText, isSelected && styles.amtChipTextSelected]}>
                  {currencySymbol}{amt}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 52,
  },
  inputRowError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 0,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
    marginTop: 4,
    marginLeft: 2,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 6,
  },
  amtChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 32,
    justifyContent: 'center',
  },
  amtChipSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  amtChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  amtChipTextSelected: {
    color: '#FFFFFF',
  },
});

export default AmountSection;
