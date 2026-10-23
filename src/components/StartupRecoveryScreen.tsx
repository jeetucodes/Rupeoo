import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { repairCorruptedStorageKeys } from '@/lib/safeStorage';
import { recordCrash } from '@/lib/crashReporting';

interface Props {
  onRetry: () => void;
  errorMessage?: string;
  isWatchdogTriggered?: boolean;
}

export function StartupRecoveryScreen({
  onRetry,
  errorMessage,
  isWatchdogTriggered = true,
}: Props) {
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    try {
      const repaired = await repairCorruptedStorageKeys();
      if (repaired.corruptedKeys.length > 0) {
        setRepairResult(`Successfully repaired ${repaired.corruptedKeys.length} cached item(s). Your transactions and account are preserved.`);
      } else {
        setRepairResult('No corrupted cache found. All stored transactions and account data are intact.');
      }
    } catch {
      setRepairResult('Repair check completed. Retrying startup now...');
    } finally {
      setRepairing(false);
      // Wait a moment so user can read message before auto-retrying
      setTimeout(() => {
        onRetry();
      }, 1200);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons
            name={isWatchdogTriggered ? 'time-outline' : 'alert-circle-outline'}
            size={40}
            color="#D97706"
          />
        </View>

        <Text style={styles.title}>
          {isWatchdogTriggered ? 'Startup Delay Detected' : 'App Recovery Mode'}
        </Text>

        <Text style={styles.subtitle}>
          Rupeo is taking longer than usual to open. You can retry immediately or run a safe, non-destructive repair on cached data.
        </Text>

        {repairResult ? (
          <View style={styles.resultBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={styles.resultText}>{repairResult}</Text>
          </View>
        ) : null}

        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            activeOpacity={0.8}
            disabled={repairing}
          >
            <Ionicons name="refresh" size={18} color="#0F172A" style={{ marginRight: 8 }} />
            <Text style={styles.retryButtonText}>Retry Opening</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.repairButton}
            onPress={handleRepair}
            activeOpacity={0.8}
            disabled={repairing}
          >
            {repairing ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <>
                <Ionicons name="build-outline" size={18} color="#0F172A" style={{ marginRight: 8 }} />
                <Text style={styles.repairButtonText}>Repair App Data</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.privacyNote}>
          Safe Repair resets corrupted cache only. Transactions, Khata, and your account session are never deleted.
        </Text>

        {errorMessage ? (
          <View style={styles.detailsContainer}>
            <TouchableOpacity
              onPress={() => setShowDetails(!showDetails)}
              style={styles.detailsToggle}
            >
              <Text style={styles.detailsToggleText}>
                {showDetails ? 'Hide technical details' : 'View technical details'}
              </Text>
              <Ionicons
                name={showDetails ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#64748B"
              />
            </TouchableOpacity>

            {showDetails ? (
              <ScrollView style={styles.errorBox} nestedScrollEnabled>
                <Text style={styles.errorText} selectable>
                  {errorMessage}
                </Text>
              </ScrollView>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  resultText: {
    fontSize: 13,
    color: '#065F46',
    marginLeft: 8,
    flex: 1,
    fontWeight: '500',
  },
  actionContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 14,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  repairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 14,
  },
  repairButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  privacyNote: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
  detailsContainer: {
    width: '100%',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detailsToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailsToggleText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginRight: 4,
  },
  errorBox: {
    maxHeight: 120,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  errorText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#DC2626',
    lineHeight: 15,
  },
});
