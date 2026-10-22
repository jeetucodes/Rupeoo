import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { APP_VERSION, APP_VERSION_CODE } from '@/constants/version';
import { PLAY_STORE_MARKET_URL } from '@/lib/appUpdateCore';

interface AdminUpdateModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AdminUpdateModal({ visible, onClose }: AdminUpdateModalProps) {
  const { appConfig, refreshConfig } = useAuth();

  const [enabled, setEnabled] = useState(true);
  const [versionName, setVersionName] = useState('2.1.11');
  const [versionCode, setVersionCode] = useState('38');
  const [force, setForce] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync with current appConfig when modal opens
  useEffect(() => {
    if (visible && appConfig) {
      setEnabled(appConfig.updatePromptEnabled !== false);
      setVersionName(appConfig.latestVersion || '2.1.11');
      setVersionCode(String(appConfig.latestVersionCode || 38));
      setForce(Boolean(appConfig.forceUpdate));
      setTitle(appConfig.updateTitle || 'New Version Available! 🚀');
      setMessage(
        appConfig.updateMessage ||
          'A new version of Rupeo is live on Google Play Store. Update now for new features and improvements!'
      );
    }
  }, [visible, appConfig]);

  if (!visible) return null;

  const handleSave = async (overrideEnabled?: boolean) => {
    if (!db) {
      Toast.show({ type: 'error', text1: 'Database Error', text2: 'Firestore not connected' });
      return;
    }

    const finalEnabled = overrideEnabled !== undefined ? overrideEnabled : enabled;
    const finalCode = parseInt(versionCode, 10) || 38;
    const finalVersion = versionName.trim() || '2.1.11';

    setIsSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await setDoc(
        doc(db, 'app_config', 'global'),
        {
          updatePromptEnabled: finalEnabled,
          latestVersion: finalVersion,
          latestVersionCode: finalCode,
          forceUpdate: force,
          updateTitle: title.trim() || 'New Version Available! 🚀',
          updateMessage:
            message.trim() ||
            'A new version of Rupeo is live on Google Play Store. Update now for new features and improvements!',
          updateUrl: PLAY_STORE_MARKET_URL,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await refreshConfig();
      setIsSaving(false);
      onClose();

      Toast.show({
        type: 'success',
        text1: finalEnabled ? 'Update Broadcasted Live! 🚀' : 'Update Prompt Turned OFF 🛑',
        text2: finalEnabled
          ? `Users below v${finalVersion} (code ${finalCode}) will get popup.`
          : 'Update popup disabled for all users.',
        visibilityTime: 4000,
      });
    } catch (err: any) {
      setIsSaving(false);
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: err?.message || 'Check Firestore admin rules',
      });
    }
  };

  const isCurrentActive =
    appConfig.updatePromptEnabled !== false &&
    ((appConfig.latestVersionCode && appConfig.latestVersionCode > APP_VERSION_CODE) ||
      (appConfig.latestVersion && appConfig.latestVersion !== APP_VERSION));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header Handle */}
          <View style={styles.handle} />

          {/* Title Row */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Admin: Remote App Updates</Text>
              <Text style={styles.headerSubtitle}>
                Current Installed: v{APP_VERSION} (Build {APP_VERSION_CODE})
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Status Badge */}
          <View
            style={[
              styles.statusBanner,
              isCurrentActive ? styles.statusBannerActive : styles.statusBannerInactive,
            ]}
          >
            <Ionicons
              name={isCurrentActive ? 'radio-button-on' : 'radio-button-off'}
              size={16}
              color={isCurrentActive ? '#16A34A' : '#64748B'}
            />
            <Text
              style={[
                styles.statusText,
                { color: isCurrentActive ? '#16A34A' : '#64748B' },
              ]}
            >
              {isCurrentActive
                ? `BROADCASTING: v${appConfig.latestVersion || versionName} (Build ${appConfig.latestVersionCode || versionCode}) • ${appConfig.forceUpdate ? 'FORCE' : 'OPTIONAL'}`
                : 'UPDATE POPUP: INACTIVE / OFF'}
            </Text>
          </View>

          <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
            {/* Master Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleLabel}>Enable Update Popup</Text>
                <Text style={styles.toggleDesc}>
                  When ON, users on older versions see the update popup
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: '#CBD5E1', true: '#818CF8' }}
                thumbColor={enabled ? '#4F46E5' : '#F8FAFC'}
              />
            </View>

            {/* Version Name & Code Inputs */}
            <View style={styles.inputGroupRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>New Version Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={versionName}
                  onChangeText={setVersionName}
                  placeholder="e.g. 2.1.11"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>New Version Code</Text>
                <TextInput
                  style={styles.textInput}
                  value={versionCode}
                  onChangeText={setVersionCode}
                  placeholder="e.g. 38"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Force Update Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleLabel}>Mandatory / Force Update</Text>
                <Text style={styles.toggleDesc}>
                  Prevents closing the popup until user updates app from Play Store
                </Text>
              </View>
              <Switch
                value={force}
                onValueChange={setForce}
                trackColor={{ false: '#CBD5E1', true: '#FCA5A5' }}
                thumbColor={force ? '#DC2626' : '#F8FAFC'}
              />
            </View>

            {/* Custom Title */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Popup Title</Text>
              <TextInput
                style={styles.textInput}
                value={title}
                onChangeText={setTitle}
                placeholder="New Version Available! 🚀"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Custom Message */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Popup Message</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={3}
                placeholder="Describe what's new in this release..."
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.publishBtn}
                onPress={() => handleSave(true)}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.publishBtnText}>Publish & Broadcast Live</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.turnOffBtn}
                onPress={() => handleSave(false)}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                <Ionicons name="power" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                <Text style={styles.turnOffBtnText}>Turn OFF Popup for All</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '88%',
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
  },
  statusBannerActive: {
    backgroundColor: '#DCFCE7',
  },
  statusBannerInactive: {
    backgroundColor: '#F1F5F9',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
    letterSpacing: 0.2,
  },
  contentScroll: {
    flexGrow: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  toggleTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  toggleDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  inputGroupRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  textArea: {
    minHeight: 65,
    textAlignVertical: 'top',
  },
  btnRow: {
    marginTop: 12,
    marginBottom: 8,
  },
  publishBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  publishBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  turnOffBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnOffBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
});
