import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandProvider } from '@/lib/billProviders';
import { CustomBillProvider } from '@/lib/database';
import { useTranslation } from '@/lib/i18n';

interface ProviderSelectorProps {
  regionProviders?: BrandProvider[];
  providers?: BrandProvider[];
  savedCustomProviders?: CustomBillProvider[];
  customProviders?: CustomBillProvider[];
  selectedProviderId: string | null;
  onSelectProvider: (provider: BrandProvider | CustomBillProvider, isCustom?: boolean) => void;
  onOpenCustomModal?: () => void;
  onPressAddCustom?: () => void;
  onLongPressCustomProvider?: (provider: CustomBillProvider) => void;
  onDeleteCustomProvider?: (provider: CustomBillProvider) => void;
  currencyName?: string;
  currencySymbol?: string;
  onNavigateToSettings?: () => void;
  regionName?: string;
  regionFlag?: string;
  regionCode?: string;
  onOpenRegionModal?: () => void;
}

export function ProviderSelector({
  regionProviders,
  providers,
  savedCustomProviders,
  customProviders,
  selectedProviderId,
  onSelectProvider,
  onOpenCustomModal,
  onPressAddCustom,
  onLongPressCustomProvider,
  onDeleteCustomProvider,
  currencyName,
  currencySymbol,
  onNavigateToSettings,
}: ProviderSelectorProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>('all');

  const effectiveRegionProviders = regionProviders || providers || [];
  const effectiveCustomProviders = savedCustomProviders || customProviders || [];
  const handleOpenCustom = onOpenCustomModal || onPressAddCustom || (() => {});
  const handleDeleteCustom = onDeleteCustomProvider || onLongPressCustomProvider || (() => {});

  // Category filter chips
  const categoryChips = [
    { key: 'all', label: t('cat_all') || 'All' },
    { key: 'sim', label: t('cat_mobile') || 'Mobile recharge' },
    { key: 'wifi', label: t('cat_internet') || 'Internet' },
    { key: 'utility', label: t('cat_utilities') || 'Utilities' },
    { key: 'ott', label: t('cat_subscriptions') || 'Subscriptions' },
    { key: 'daily', label: t('cat_rent_emi') || 'Rent & EMI' },
    { key: 'other', label: t('cat_other') || 'Other' },
  ];

  // Filter regional providers
  const filteredRegional = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (effectiveRegionProviders || []).filter(p => {
      // Category match
      if (selectedCategoryKey !== 'all') {
        if (selectedCategoryKey === 'sim' && p.group !== 'sim') return false;
        if (selectedCategoryKey === 'wifi' && p.group !== 'wifi') return false;
        if (selectedCategoryKey === 'utility' && p.group !== 'utility') return false;
        if (selectedCategoryKey === 'ott' && p.group !== 'ott') return false;
        if (selectedCategoryKey === 'daily' && p.group !== 'daily' && p.category !== 'Rent' && p.category !== 'EMI') return false;
        if (selectedCategoryKey === 'other' && p.group !== 'other' && p.group !== 'daily') return false;
      }
      // Search match
      if (q) {
        return (
          p.name.toLowerCase().includes(q) ||
          p.badge.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [effectiveRegionProviders, search, selectedCategoryKey]);

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{t('what_are_you_paying_for') || 'What are you paying for?'}</Text>
      </View>

      {/* Read-only line above the grid: "Providers for <currency name> (<symbol>)" with "Change in Settings" link */}
      <View style={styles.regionInfoRow}>
        <Text style={styles.regionInfoText} numberOfLines={1}>
          {t('providers_for_currency')
            ? t('providers_for_currency').replace('{name}', currencyName || 'Indian Rupee').replace('{symbol}', currencySymbol || '₹')
            : `Providers for ${currencyName || 'Indian Rupee'} (${currencySymbol || '₹'})`}
        </Text>
        {onNavigateToSettings ? (
          <TouchableOpacity
            onPress={onNavigateToSettings}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="link"
            accessibilityLabel={t('change_in_settings') || 'Change in Settings'}
          >
            <Text style={styles.settingsLinkText}>{t('change_in_settings') || 'Change in Settings'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#64748B" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_provider_placeholder') || 'Search provider or service...'}
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Horizontally scrollable Category Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {categoryChips.map(c => {
          const isActive = selectedCategoryKey === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setSelectedCategoryKey(c.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${c.label}`}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* User's Saved Custom Providers (if any) */}
      {effectiveCustomProviders.length > 0 && selectedCategoryKey === 'all' && !search && (
        <View style={styles.customSection}>
          <Text style={styles.subHeading}>{t('your_saved_providers') || 'Your Saved Providers'}</Text>
          <View style={styles.grid}>
            {effectiveCustomProviders.map(cp => {
              const isSelected = selectedProviderId === `custom:${cp.id}` || selectedProviderId === cp.id || selectedProviderId === `custom:${cp.normalizedName}`;
              return (
                <TouchableOpacity
                  key={cp.id}
                  style={[
                    styles.providerTile,
                    isSelected && styles.providerTileSelected,
                    { borderColor: isSelected ? cp.color : '#E2E8F0' },
                  ]}
                  onPress={() => onSelectProvider(cp, true)}
                  onLongPress={() => handleDeleteCustom(cp)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${cp.name}, tap to select, long press to delete`}
                >
                  {/* Small visible delete 'x' button in corner */}
                  <TouchableOpacity
                    style={styles.deleteTileBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteCustom(cp);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${cp.name}`}
                  >
                    <Ionicons name="close-circle" size={17} color="#94A3B8" />
                  </TouchableOpacity>

                  <View style={[styles.iconCircle, { backgroundColor: cp.color }]}>
                    <Ionicons name={(cp.iconKey || 'receipt-outline') as any} size={18} color="#FFFFFF" />
                  </View>
                  <Text style={styles.tileBadge} numberOfLines={1}>{cp.name}</Text>
                  {isSelected && (
                    <View style={styles.tileCheckmark}>
                      <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Provider Grid */}
      <View style={styles.grid}>
        {filteredRegional.map(p => {
          const isSelected = selectedProviderId === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.providerTile,
                isSelected && styles.providerTileSelected,
                isSelected && { borderColor: p.color },
              ]}
              onPress={() => onSelectProvider(p, false)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}`}
            >
              <View style={[styles.iconCircle, { backgroundColor: p.color }]}>
                <Ionicons name={(p.icon || 'receipt-outline') as any} size={18} color="#FFFFFF" />
              </View>
              <Text style={styles.tileBadge} numberOfLines={1}>{p.badge || p.name}</Text>
              {isSelected && (
                <View style={styles.tileCheckmark}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* ALWAYS THE LAST TILE: + Custom */}
        <TouchableOpacity
          style={[styles.providerTile, styles.customTile]}
          onPress={handleOpenCustom}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('custom_provider') || '+ Custom'}
        >
          <View style={[styles.iconCircle, styles.customIconCircle]}>
            <Ionicons name="add" size={22} color="#4F46E5" />
          </View>
          <Text style={[styles.tileBadge, { color: '#4F46E5', fontWeight: '800' }]} numberOfLines={1}>
            {t('custom_provider') || '+ Custom'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  regionInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  regionInfoText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
    flex: 1,
    marginRight: 8,
  },
  settingsLinkText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#4F46E5',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
  chipsScroll: {
    flexDirection: 'row',
    paddingBottom: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#0F172A',
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  customSection: {
    marginBottom: 12,
  },
  subHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  providerTile: {
    width: '31%',
    minHeight: 78,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  providerTileSelected: {
    borderWidth: 2,
    backgroundColor: '#F8FAFC',
  },
  deleteTileBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  customTile: {
    borderColor: '#C7D2FE',
    borderStyle: 'dashed',
    backgroundColor: '#EEF2FF30',
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  customIconCircle: {
    backgroundColor: '#EEF2FF',
  },
  tileBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  tileCheckmark: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
});

export default ProviderSelector;
