import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export interface BrandLogoProps {
  id: string;
  color: string;
  size?: number;
  iconKey?: string;
  badge?: string;
}

export function BrandLogo({
  id,
  color,
  size = 32,
  iconKey,
  badge,
}: BrandLogoProps) {
  const s = size;
  const r = s * 0.35;

  if (iconKey) {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: color || '#2563EB', borderRadius: r, width: s, height: s }]}>
        <Ionicons name={iconKey as any} size={Math.round(s * 0.52)} color="#FFFFFF" />
      </View>
    );
  }

  if (id && id.startsWith('custom:')) {
    const chars = Array.from(badge || '★').slice(0, 2).join('');
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: color || '#2563EB', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: Math.round(s * 0.4), fontWeight: '800' }]}>{chars}</Text>
      </View>
    );
  }

  if (id === 'jio' || id === 'jiofiber') {
    return (
      <View style={[brandLogoStyles.base, {
        borderRadius: Math.round(s * 0.33),
        width: s,
        height: s,
        overflow: 'hidden',
        backgroundColor: '#0055FE',
      }]}>
        <LinearGradient
          colors={['#0047FF', '#002EAA']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={{
          width: Math.round(s * 0.76),
          height: Math.round(s * 0.76),
          borderRadius: Math.round(s * 0.38),
          backgroundColor: '#ED1B24',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: Math.round(s * 0.42), fontStyle: 'italic', fontWeight: '900', letterSpacing: -0.5 }]}>Jio</Text>
        </View>
      </View>
    );
  }

  if (id === 'airtel' || id === 'airtel_xstream' || id === 'airtel_dth') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#FFFFFF', borderRadius: s * 0.3, width: s, height: s, borderWidth: 1.5, borderColor: '#ED1C2425' }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#ED1C24', fontSize: s * 0.56, fontWeight: '900', fontStyle: 'italic' }]}>a</Text>
      </View>
    );
  }

  if (id === 'vi') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#E60000', borderRadius: r, width: s, height: s }]}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: s * 0.34, fontWeight: '900' }]}>Vi</Text>
          <View style={{ width: s * 0.08, height: s * 0.08, borderRadius: s * 0.04, backgroundColor: '#FFD700', marginLeft: 1 }} />
        </View>
      </View>
    );
  }

  if (id === 'bsnl') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#FFFFFF', borderRadius: s * 0.3, width: s, height: s, borderWidth: 1.5, borderColor: '#E2E8F0' }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#003580', fontSize: s * 0.26, fontWeight: '900', letterSpacing: -0.5 }]}>BSNL</Text>
      </View>
    );
  }

  if (id === 'netflix') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#000000', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#E50914', fontSize: s * 0.44, fontWeight: '900', fontStyle: 'italic' }]}>N</Text>
      </View>
    );
  }

  if (id === 'prime') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#00A8E1', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFFFFF', fontSize: s * 0.28, fontWeight: '900' }]}>prime</Text>
      </View>
    );
  }

  if (id === 'hotstar') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#0C1E3C', borderRadius: r, width: s, height: s }]}>
        <Text style={[brandLogoStyles.wordmark, { color: '#FFD700', fontSize: s * 0.4 }]}>★</Text>
      </View>
    );
  }

  if (id === 'spotify') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#1DB954', borderRadius: s / 2, width: s, height: s }]}>
        <Ionicons name="musical-notes" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'youtube') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#FF0000', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="play" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'electricity') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#F59E0B', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="flash" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'gas') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#F97316', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="flame" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'rent') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#10B981', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="home" size={s * 0.44} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'tiffin') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#F97316', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="restaurant" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'milk') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#0284C7', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="nutrition" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'maid') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#8B5CF6', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="person" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'emi') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#E11D48', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="card" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  if (id === 'gym') {
    return (
      <View style={[brandLogoStyles.base, { backgroundColor: '#10B981', borderRadius: r, width: s, height: s }]}>
        <Ionicons name="barbell" size={s * 0.4} color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={[brandLogoStyles.base, { backgroundColor: color || '#6366F1', borderRadius: r, width: s, height: s }]}>
      <Ionicons name="receipt-outline" size={s * 0.4} color="#FFFFFF" />
    </View>
  );
}

const brandLogoStyles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
