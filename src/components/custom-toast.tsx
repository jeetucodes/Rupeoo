import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ToastConfig, BaseToastProps } from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';

export const customToastConfig: ToastConfig = {
  success: (props: BaseToastProps) => (
    <View style={[styles.toastContainer, styles.successToast]}>
      <View style={[styles.iconCircle, styles.successIconBg]}>
        <Ionicons name="checkmark-circle" size={20} color="#10B981" />
      </View>
      <View style={styles.textContainer}>
        {props.text1 ? (
          <Text style={styles.titleText} numberOfLines={1}>
            {props.text1}
          </Text>
        ) : null}
        {props.text2 ? (
          <Text style={styles.subtitleText} numberOfLines={2}>
            {props.text2}
          </Text>
        ) : null}
      </View>
      <View style={styles.emeraldAccent} />
    </View>
  ),

  error: (props: BaseToastProps) => (
    <View style={[styles.toastContainer, styles.errorToast]}>
      <View style={[styles.iconCircle, styles.errorIconBg]}>
        <Ionicons name="alert-circle" size={20} color="#EF4444" />
      </View>
      <View style={styles.textContainer}>
        {props.text1 ? (
          <Text style={[styles.titleText, { color: '#991B1B' }]} numberOfLines={1}>
            {props.text1}
          </Text>
        ) : null}
        {props.text2 ? (
          <Text style={[styles.subtitleText, { color: '#B91C1C' }]} numberOfLines={2}>
            {props.text2}
          </Text>
        ) : null}
      </View>
      <View style={styles.rubyAccent} />
    </View>
  ),

  info: (props: BaseToastProps) => (
    <View style={[styles.toastContainer, styles.infoToast]}>
      <View style={[styles.iconCircle, styles.infoIconBg]}>
        <Ionicons name="sparkles" size={18} color="#D97706" />
      </View>
      <View style={styles.textContainer}>
        {props.text1 ? (
          <Text style={styles.titleText} numberOfLines={1}>
            {props.text1}
          </Text>
        ) : null}
        {props.text2 ? (
          <Text style={styles.subtitleText} numberOfLines={2}>
            {props.text2}
          </Text>
        ) : null}
      </View>
      <View style={styles.amberAccent} />
    </View>
  ),
};

const styles = StyleSheet.create({
  toastContainer: {
    width: '92%',
    maxWidth: 420,
    minHeight: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    position: 'relative',
    overflow: 'hidden',
  },
  successToast: {
    borderColor: '#D1FAE5',
  },
  errorToast: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FFF5F5',
  },
  infoToast: {
    borderColor: '#FEF3C7',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  successIconBg: {
    backgroundColor: '#ECFDF5',
  },
  errorIconBg: {
    backgroundColor: '#FEE2E2',
  },
  infoIconBg: {
    backgroundColor: '#FEF3C7',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  subtitleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  emeraldAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#10B981',
  },
  rubyAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#EF4444',
  },
  amberAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#F59E0B',
  },
});
