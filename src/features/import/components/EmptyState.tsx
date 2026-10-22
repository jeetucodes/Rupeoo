import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ImportEmptyStateProps {
  type: 'import_entry';
  onPasteClipboard: () => void;
  clipboardBannerVisible: boolean;
  onImportClipboardBanner: () => void;
  onDismissClipboardBanner: () => void;
  pastedText: string;
  onChangePastedText: (text: string) => void;
  onSubmitPastedText: () => void;
  isAnalyzing: boolean;
}

interface InboxEmptyStateProps {
  type: 'inbox_empty';
  onImportMessages: () => void;
}

type EmptyStateProps = ImportEmptyStateProps | InboxEmptyStateProps;

export function EmptyState(props: EmptyStateProps) {
  const isDark = useColorScheme() === 'dark';

  const textColor = isDark ? '#FFFFFF' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#272A30' : '#E2E8F0';
  const cardBg = isDark ? '#18191D' : '#FFFFFF';
  const inputBg = isDark ? '#22252B' : '#F8FAFC';
  const bannerBg = isDark ? '#1E293B' : '#EEF2FF';
  const bannerBorder = isDark ? '#3730A3' : '#C7D2FE';

  if (props.type === 'inbox_empty') {
    return (
      <View style={styles.inboxContainer}>
        <View style={[styles.illustrationCircle, { backgroundColor: isDark ? '#1E293B' : '#EEF2FF' }]}>
          <Ionicons name="checkmark-done-circle" size={48} color="#4F46E5" />
        </View>
        <Text style={[styles.inboxTitle, { color: textColor }]}>You're all caught up</Text>
        <Text style={[styles.inboxSubtitle, { color: subtextColor }]}>
          No pending payment alerts to review. New transactions detected from notifications will appear here.
        </Text>
        <TouchableOpacity
          style={styles.inboxActionBtn}
          onPress={() => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch { }
            props.onImportMessages();
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="document-text-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.inboxActionBtnText}>Import from messages</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Import Entry State
  return (
    <View style={styles.importContainer}>
      {/* Auto-detected clipboard banner */}
      {props.clipboardBannerVisible && (
        <View style={[styles.clipboardBanner, { backgroundColor: bannerBg, borderColor: bannerBorder }]}>
          <View style={styles.bannerIconWrap}>
            <Ionicons name="clipboard" size={20} color="#4F46E5" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: textColor }]}>Payment message detected</Text>
            <Text style={[styles.bannerSubtitle, { color: subtextColor }]}>
              We found a payment message in your clipboard. Import it?
            </Text>
            <View style={styles.bannerActions}>
              <TouchableOpacity
                style={styles.bannerImportBtn}
                onPress={props.onImportClipboardBanner}
                activeOpacity={0.8}
              >
                <Text style={styles.bannerImportText}>Import</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bannerIgnoreBtn}
                onPress={props.onDismissClipboardBanner}
                activeOpacity={0.7}
              >
                <Text style={[styles.bannerIgnoreText, { color: subtextColor }]}>Ignore</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Main Illustration & Header */}
      <View style={styles.heroSection}>
        <View style={[styles.heroIconCircle, { backgroundColor: isDark ? '#1E293B' : '#EEF2FF' }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={36} color="#4F46E5" />
        </View>
        <Text style={[styles.heroTitle, { color: textColor }]}>Add payments from messages</Text>
        <Text style={[styles.heroSubtitle, { color: subtextColor }]}>
          Paste a bank or UPI message and Rupeo will read it on your device.
        </Text>
      </View>

      {/* Big Paste from Clipboard Button */}
      <TouchableOpacity
        style={styles.primaryClipboardBtn}
        onPress={() => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch { }
          props.onPasteClipboard();
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Paste from clipboard"
      >
        <Ionicons name="clipboard-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.primaryClipboardBtnText}>Paste from clipboard</Text>
      </TouchableOpacity>

      {/* Multiline Paste Input Box */}
      <View style={[styles.pasteBoxContainer, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.pasteBoxHeader}>
          <Text style={[styles.pasteBoxLabel, { color: subtextColor }]}>Or paste messages here</Text>
          <Text style={[styles.pasteBoxHint, { color: subtextColor }]}>Supports multiple messages</Text>
        </View>
        <TextInput
          style={[styles.multilineInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
          placeholder="e.g. Sent Rs.15.00 from Kotak Bank A/c X0741 to SHUBHAM RAI on 22-10-26. UPI Ref 666123542887..."
          placeholderTextColor={subtextColor}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          value={props.pastedText}
          onChangeText={props.onChangePastedText}
        />
        {props.pastedText.trim().length > 0 && (
          <TouchableOpacity
            style={[styles.analyzeBtn, props.isAnalyzing && { opacity: 0.6 }]}
            onPress={props.onSubmitPastedText}
            disabled={props.isAnalyzing}
            activeOpacity={0.8}
          >
            {props.isAnalyzing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.analyzeBtnText}>Read Messages</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Share to Rupeo Tip Card */}
      <View style={[styles.tipCard, { backgroundColor: inputBg, borderColor }]}>
        <Ionicons name="share-social-outline" size={18} color="#6366F1" style={{ marginRight: 10, marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.tipTitle, { color: textColor }]}>Share to Rupeo</Text>
          <Text style={[styles.tipBody, { color: subtextColor }]}>
            You can also share any bank SMS or payment alert directly from your SMS app to Rupeo!
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  importContainer: {
    padding: 18,
  },
  inboxContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 40,
  },
  illustrationCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  inboxTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  inboxSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  inboxActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    minHeight: 44,
  },
  inboxActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  clipboardBanner: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerIconWrap: {
    marginRight: 12,
    marginTop: 2,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  bannerSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  bannerImportBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 32,
    justifyContent: 'center',
  },
  bannerImportText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bannerIgnoreBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  bannerIgnoreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  heroSection: {
    alignItems: 'center',
    textAlign: 'center',
    marginVertical: 16,
  },
  heroIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 20,
  },
  primaryClipboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 18,
    minHeight: 50,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  primaryClipboardBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pasteBoxContainer: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  pasteBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pasteBoxLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pasteBoxHint: {
    fontSize: 11,
  },
  multilineInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    minHeight: 90,
    lineHeight: 18,
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 10,
    minHeight: 44,
  },
  analyzeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tipCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  tipTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  tipBody: {
    fontSize: 11.5,
    lineHeight: 16,
  },
});
