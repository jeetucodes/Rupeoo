import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface VipAvatarProps {
  photoURL?: string | null;
  name?: string | null;
  email?: string | null;
  isPremium?: boolean;
  size?: number;
  showCrown?: boolean;
  showBadge?: boolean;
  badgeType?: 'vip' | 'edit' | 'online';
}

/**
 * Standard Clean Profile Avatar Component
 * (No VIP crowns or paywall auras - normal clean avatar)
 */
export function VipAvatar({
  photoURL,
  name,
  email,
  size = 48,
  showBadge = true,
  badgeType,
}: VipAvatarProps) {
  const initial = (name || email || 'U').charAt(0).toUpperCase();
  const badgeSize = Math.max(14, size * 0.32);

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <View
        style={[
          styles.standardRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {photoURL ? (
          <Image
            source={{ uri: photoURL }}
            style={styles.fullImg}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <View style={styles.standardInitialBox}>
            <Text style={[styles.initialTextStandard, { fontSize: size * 0.42 }]}>
              {initial}
            </Text>
          </View>
        )}
      </View>

      {/* OPTIONAL BADGE AT BOTTOM-RIGHT (EDIT / ONLINE) */}
      {showBadge && (
        <>
          {badgeType === 'edit' ? (
            <View
              style={[
                styles.editBadge,
                {
                  width: badgeSize,
                  height: badgeSize,
                  borderRadius: badgeSize / 2,
                  bottom: 0,
                  right: 0,
                },
              ]}
            >
              <Ionicons name="pencil" size={badgeSize * 0.55} color="#FFFFFF" />
            </View>
          ) : badgeType === 'online' ? (
            <View
              style={[
                styles.onlineBadge,
                {
                  width: Math.max(9, badgeSize * 0.7),
                  height: Math.max(9, badgeSize * 0.7),
                  borderRadius: Math.max(9, badgeSize * 0.7) / 2,
                  bottom: 1,
                  right: 1,
                },
              ]}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  standardRing: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImg: {
    width: '100%',
    height: '100%',
  },
  standardInitialBox: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialTextStandard: {
    fontWeight: '800',
    color: '#4338CA',
  },
  editBadge: {
    position: 'absolute',
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  onlineBadge: {
    position: 'absolute',
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 5,
  },
});
