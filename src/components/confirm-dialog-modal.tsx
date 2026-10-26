import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ConfirmDialogModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  secondaryText?: string;
  onSecondary?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialogModal({
  visible,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  secondaryText,
  onSecondary,
  type = 'danger',
  icon,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogModalProps) {
  const isDanger = type === 'danger';
  const iconName: keyof typeof Ionicons.glyphMap = icon || (isDanger ? 'trash-outline' : type === 'warning' ? 'alert-circle-outline' : 'information-circle-outline');
  const iconColor = isDanger ? '#EF4444' : type === 'warning' ? '#F59E0B' : '#2563EB';
  const iconBg = isDanger ? '#FEE2E2' : type === 'warning' ? '#FEF3C7' : '#EFF6FF';
  const confirmTextColor = isDanger ? '#FFFFFF' : '#0F172A';
  const spinnerColor = isDanger ? '#FFFFFF' : '#0F172A';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={28} color={iconColor} />
          </View>

          {/* Title & Message */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {/* Actions */}
          {secondaryText && onSecondary ? (
            <View style={styles.verticalActionList}>
              <TouchableOpacity
                style={[
                  styles.verticalBtn,
                  isDanger ? styles.confirmBtnDanger : styles.confirmBtnPrimary,
                ]}
                onPress={onConfirm}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={spinnerColor} />
                ) : (
                  <Text style={[styles.btnText, { color: confirmTextColor }]}>
                    {confirmText}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.verticalBtn, styles.secondaryBtn]}
                onPress={onSecondary}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryBtnText}>
                  {secondaryText}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.verticalBtn, styles.cancelBtn]}
                onPress={onCancel}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>{cancelText}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, styles.rowCancelBtn]}
                onPress={onCancel}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>{cancelText}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  styles.rowConfirmBtn,
                  isDanger ? styles.confirmBtnDanger : styles.confirmBtnPrimary,
                ]}
                onPress={onConfirm}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={spinnerColor} />
                ) : (
                  <Text style={[styles.btnText, { color: confirmTextColor }]}>
                    {confirmText}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  verticalActionList: {
    width: '100%',
    marginTop: 20,
    gap: 10,
  },
  verticalBtn: {
    width: '100%',
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  rowCancelBtn: {
    flex: 1,
  },
  rowConfirmBtn: {
    flex: 1.2,
  },
  cancelBtn: {
    backgroundColor: '#F1F5F9',
    minHeight: 48,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  secondaryBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  confirmBtn: {
    minHeight: 48,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  confirmBtnDanger: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  confirmBtnPrimary: {
    backgroundColor: '#FFD740',
    shadowColor: '#F59E0B',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
});
