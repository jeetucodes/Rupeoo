import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { openPlayStorePageDirectly, saveAppReview, setUserReviewPrompted, clearReviewPending } from '@/lib/review';
import { useAuth } from '@/context/AuthContext';

interface GooglePlayReviewModalProps {
  visible: boolean;
  userId: string;
  isExistingUser?: boolean;
  onClose: () => void;
}

const QUICK_TAGS = [
  '⚡ Super Fast',
  '💰 Easy Expense Tracker',
  '🎨 Clean UI',
  '🔒 Safe & Private',
  '🔔 Useful Reminders',
  '📊 Accurate Reports',
];

const RATING_DESCRIPTIONS: Record<number, { title: string; subtitle: string }> = {
  5: { title: 'Excellent! Loved it! 🤩', subtitle: 'Rupeo pasand aaya aapko!' },
  4: { title: 'Very Good! 😊', subtitle: 'Great experience so far.' },
  3: { title: 'Good 🙂', subtitle: 'App thik chal rahi hai.' },
  2: { title: 'Fair 😐', subtitle: 'Could be improved.' },
  1: { title: 'Needs Improvement 😞', subtitle: 'Hume batayein kya thik karein.' },
};

export function GooglePlayReviewModal({
  visible,
  userId,
  isExistingUser = false,
  onClose,
}: GooglePlayReviewModalProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>(['⚡ Super Fast', '💰 Easy Expense Tracker']);
  const [feedback, setFeedback] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      if (userId) {
        await setUserReviewPrompted(userId);
        await clearReviewPending(userId);
        saveAppReview(userId, {
          rating,
          feedback: feedback.trim() || undefined,
          tags: selectedTags,
          userName: user?.displayName || undefined,
          userEmail: user?.email || undefined,
        }).catch(() => {});
      }

      // Close modal and immediately open Google Play Store so the review goes to Play Store!
      onClose();
      await openPlayStorePageDirectly();
    } catch (err) {
      console.warn('Failed to submit review:', err);
      onClose();
      await openPlayStorePageDirectly();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (userId) {
      await setUserReviewPrompted(userId);
      await clearReviewPending(userId);
    }
    onClose();
  };

  const currentDesc = RATING_DESCRIPTIONS[rating] || RATING_DESCRIPTIONS[5];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {/* Close Button Top Right */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color="#64748B" />
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
            {/* Header Icon */}
            <View style={styles.iconCircle}>
              <LinearGradient
                colors={['#FEF3C7', '#FDE68A']}
                style={styles.iconGradient}
              >
                <Ionicons name="star" size={32} color="#D97706" />
              </LinearGradient>
            </View>

            {/* Title */}
            <Text style={styles.title}>Rate Rupeo on Play Store</Text>
            <Text style={styles.tagline}>
              {isExistingUser ? 'Loving your Rupeo journey? 💖' : 'First transaction added! 🎉'}
            </Text>

            {/* 5 Big Interactive Stars */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRating(star)}
                  activeOpacity={0.7}
                  style={styles.starBtn}
                >
                  <Ionicons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={38}
                    color={star <= rating ? '#F59E0B' : '#CBD5E1'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Dynamic Rating Label */}
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingBadgeTitle}>{currentDesc.title}</Text>
              <Text style={styles.ratingBadgeSub}>{currentDesc.subtitle}</Text>
            </View>

            {/* Quick Tags Selection */}
            <Text style={styles.sectionLabel}>What did you like most?</Text>
            <View style={styles.tagsGrid}>
              {QUICK_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={[
                      styles.tagChip,
                      isSelected && styles.tagChipSelected,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tagChipText,
                        isSelected && styles.tagChipTextSelected,
                      ]}
                    >
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Optional Feedback Text Area */}
            <Text style={styles.sectionLabel}>Feedback / Suggestions (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Apna experience ya koi suggestion likhein..."
              placeholderTextColor="#94A3B8"
              value={feedback}
              onChangeText={setFeedback}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Submit & Open Play Store Button */}
            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#2563EB', '#1D4ED8']}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="logo-google-playstore" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.submitBtnText}>Submit & Review on Play Store ⭐</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Dismiss Button */}
            <TouchableOpacity
              style={styles.laterBtn}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={styles.laterBtnText}>Maybe Later</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  iconCircle: {
    marginBottom: 10,
  },
  iconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FEF08A',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 14,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  starBtn: {
    padding: 3,
  },
  ratingBadge: {
    backgroundColor: '#FEF9E7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    marginBottom: 16,
  },
  ratingBadgeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
  },
  ratingBadgeSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#92400E',
    marginTop: 1,
  },
  sectionLabel: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
    width: '100%',
  },
  tagChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tagChipSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tagChipTextSelected: {
    color: '#2563EB',
    fontWeight: '700',
  },
  textInput: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    marginBottom: 16,
  },
  submitBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
    shadowColor: '#2563EB',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  laterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  laterBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
});
