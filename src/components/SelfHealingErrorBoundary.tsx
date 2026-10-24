/**
 * SelfHealingErrorBoundary: Silent Auto-Recovery & Zero-Crash Error Boundary
 *
 * Wraps the root app view and individual Home Screen widgets:
 * - Total Balance & Cashflow Card
 * - Upcoming Bills Carousel
 * - Friends & Udhar / Khata Card
 * - Recent Transactions Card
 *
 * Features:
 * 1. Silently catches runtime exceptions and unhandled render errors.
 * 2. Automatically attempts a silent state reset within 800ms to recover the component.
 * 3. Never displays a red crash screen, white screen, or terminates the background process.
 * 4. Falls back to safe default rendering (or safe default UI) if repeated retries fail.
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { warn, error as logError } from '../lib/logger.ts';
import { recordCrash } from '../lib/crashReporting.ts';

export interface SelfHealingErrorBoundaryProps {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
  silent?: boolean;
  onRecover?: () => void;
  maxAutoRetries?: number;
}

interface SelfHealingErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  lastErrorTimestamp: number;
}

export class SelfHealingErrorBoundary extends Component<
  SelfHealingErrorBoundaryProps,
  SelfHealingErrorBoundaryState
> {
  private autoRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: SelfHealingErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
      lastErrorTimestamp: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<SelfHealingErrorBoundaryState> {
    return {
      hasError: true,
      error,
      lastErrorTimestamp: Date.now(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const componentName = this.props.name || 'Component';
    logError(`[SelfHealingErrorBoundary:${componentName}] Caught render error:`, error, errorInfo);

    recordCrash(
      error,
      false,
      'root_error_boundary'
    ).catch(() => {});

    const maxRetries = this.props.maxAutoRetries ?? 2;
    const now = Date.now();
    const timeSinceLast = now - this.state.lastErrorTimestamp;

    // Reset retry counter if previous error occurred more than 15 seconds ago
    const currentRetries = timeSinceLast > 15000 ? 0 : this.state.retryCount;

    if (currentRetries < maxRetries) {
      // Automatic silent recovery: schedule automatic state reset within 700ms
      if (this.autoRetryTimer) clearTimeout(this.autoRetryTimer);
      this.autoRetryTimer = setTimeout(() => {
        this.autoRetryTimer = null;
        this.resetError(currentRetries + 1);
      }, 700);
    }
  }

  componentWillUnmount(): void {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
      this.autoRetryTimer = null;
    }
  }

  public resetError = (newRetryCount: number = 0): void => {
    this.setState({
      hasError: false,
      error: null,
      retryCount: newRetryCount,
    });
    this.props.onRecover?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // If silent mode (for embedded widgets on Home Screen), render clean empty placeholder during 700ms auto-heal
      if (this.props.silent) {
        return null;
      }

      // Safe, polite recovery card for isolated widgets (instead of red/white screen)
      const componentName = this.props.name || 'Section';
      return (
        <View style={styles.fallbackCard}>
          <View style={styles.fallbackContent}>
            <Ionicons name="refresh-circle-outline" size={24} color="#64748B" />
            <Text style={styles.fallbackText}>{componentName} recovering...</Text>
          </View>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => this.resetError(0)}
            activeOpacity={0.7}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-Order Component helper to wrap any component in SelfHealingErrorBoundary.
 */
export function withSelfHealing<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  name: string,
  silent: boolean = true
): React.FC<P> {
  const ComponentWithHealing: React.FC<P> = (props) => (
    <SelfHealingErrorBoundary name={name} silent={silent}>
      <WrappedComponent {...props} />
    </SelfHealingErrorBoundary>
  );
  ComponentWithHealing.displayName = `WithSelfHealing(${name})`;
  return ComponentWithHealing;
}

const styles = StyleSheet.create({
  fallbackCard: {
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fallbackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fallbackText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
