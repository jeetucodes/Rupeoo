import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTranslation } from '@/lib/i18n';
import { ALL_CURRENCIES, POPULAR_CURRENCIES, Currency } from '@/lib/currencies';

interface CurrencySelectorModalProps {
  visible: boolean;
  onClose: () => void;
  selectedCurrency: string;
  onSelect: (currencyCode: string) => void;
}

export function CurrencySelectorModal({
  visible,
  onClose,
  selectedCurrency,
  onSelect,
}: CurrencySelectorModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCurrencies = useMemo(() => {
    if (!searchQuery.trim()) return ALL_CURRENCIES;
    const lowerQuery = searchQuery.toLowerCase();
    return ALL_CURRENCIES.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.code.toLowerCase().includes(lowerQuery) ||
        c.symbol.toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery]);

  const renderCurrencyItem = ({ item }: { item: Currency }) => {
    const isActive = selectedCurrency === item.symbol || selectedCurrency === item.code;
    return (
      <TouchableOpacity
        style={[styles.currencyRow, isActive && styles.currencyRowActive]}
        onPress={() => {
          onSelect(item.symbol);
          onClose();
        }}
        activeOpacity={0.7}
      >
        <View style={styles.currencyIconWrap}>
          <Text style={styles.currencySymbol}>{item.symbol}</Text>
        </View>
        <View style={styles.currencyInfo}>
          <Text style={[styles.currencyCode, isActive && styles.currencyCodeActive]}>
            {item.code}
          </Text>
          <Text style={styles.currencyName} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        {isActive && <Ionicons name="checkmark-circle" size={20} color="#FFD740" />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={Platform.OS === 'ios' ? 20 : 100} style={StyleSheet.absoluteFill} tint="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('search_currency')}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={20} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('search_currency')}
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filteredCurrencies}
              keyExtractor={(item) => item.code}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                !searchQuery.trim() ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{t('popular_currencies')}</Text>
                    {POPULAR_CURRENCIES.map((item) => (
                      <React.Fragment key={`pop-${item.code}`}>
                        {renderCurrencyItem({ item })}
                      </React.Fragment>
                    ))}
                    <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t('all_currencies')}</Text>
                  </View>
                ) : null
              }
              renderItem={renderCurrencyItem}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    paddingTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: '#1C1C1E',
  },
  clearBtn: {
    padding: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
  },
  currencyRowActive: {
    borderColor: '#FFD740',
    backgroundColor: '#FEF9E7',
  },
  currencyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  currencyInfo: {
    flex: 1,
  },
  currencyCode: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  currencyCodeActive: {
    color: '#3A3314',
  },
  currencyName: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
});
