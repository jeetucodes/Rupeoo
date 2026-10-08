import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';

export const RUPEO_BRAND_LOGO_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#1C1C1E"/><path d="M7 6h10M7 10h8M7 6v12M12 10a4 4 0 0 1 0 8H7" stroke="#FFD740" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICON_EXPENSE_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="3" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

export const ICON_INCOME_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

export const ICON_MIC_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

export const ICON_UDHAR_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

export const ICON_BELL_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

export const ICON_TARGET_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;

/**
 * Formats amount with Indian number system, abbreviating above 1 Lakh.
 * Example:
 * 500 -> ₹500
 * 12500 -> ₹12,500
 * 150000 -> ₹1.5L
 * 12000000 -> ₹1.2Cr
 */
export function formatWidgetAmount(n?: number, currency: string = '₹'): string {
  if (n === undefined || n === null || isNaN(n)) return `${currency}0`;
  const isNegative = n < 0;
  const abs = Math.abs(n);
  const prefix = isNegative ? `-${currency}` : currency;

  if (abs >= 10000000) {
    const cr = abs / 10000000;
    const formatted = cr >= 10 ? cr.toFixed(0) : cr.toFixed(1);
    return `${prefix}${formatted.replace(/\.0$/, '')}Cr`;
  }
  if (abs >= 100000) {
    const lakh = abs / 100000;
    const formatted = lakh >= 10 ? lakh.toFixed(0) : lakh.toFixed(1);
    return `${prefix}${formatted.replace(/\.0$/, '')}L`;
  }
  return `${prefix}${Math.round(abs).toLocaleString('en-IN')}`;
}

/**
 * Formats timestamp as 'hh:mm' (e.g. 14:05)
 */
export function formatWidgetTime(timestamp?: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export interface WidgetContainerProps {
  children: any;
  clickActionUri?: string;
  paddingHorizontal?: number;
  paddingVertical?: number;
}

/**
 * Unified Light Theme Card Container
 * Clean 16dp rounded corners, pure white background, subtle border, no heavy gradients
 */
export function WidgetContainer({
  children,
  clickActionUri = 'rupeo://(tabs)/dashboard',
  paddingHorizontal = 12,
  paddingVertical = 10,
}: WidgetContainerProps) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: clickActionUri }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal,
        paddingVertical,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {children}
    </FlexWidget>
  );
}

/**
 * Fallback state: When snapshot data is missing
 */
export function WidgetFallbackState({ message = 'Open Rupeo to sync' }: { message?: string }) {
  return (
    <WidgetContainer clickActionUri="rupeo://(tabs)/dashboard" paddingHorizontal={14} paddingVertical={12}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SvgWidget svg={RUPEO_BRAND_LOGO_SVG} style={{ width: 14, height: 14, marginRight: 6 }} />
        <TextWidget
          text="RUPEO"
          style={{
            fontSize: 10,
            fontWeight: 'bold',
            color: '#0F172A',
            letterSpacing: 0.8,
          }}
        />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-start', marginVertical: 4 }}>
        <TextWidget
          text={message}
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: '#475569',
          }}
        />
        <TextWidget
          text="Tap anywhere to sync"
          style={{
            fontSize: 10,
            color: '#94A3B8',
            marginTop: 2,
          }}
        />
      </FlexWidget>
      <FlexWidget
        style={{
          backgroundColor: '#EEF2FF',
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 3,
        }}
      >
        <TextWidget
          text="Open App ›"
          style={{
            fontSize: 9.5,
            fontWeight: 'bold',
            color: '#4F46E5',
          }}
        />
      </FlexWidget>
    </WidgetContainer>
  );
}

/**
 * Logged-out state: When user logged out of Rupeo
 */
export function WidgetLoggedOutState() {
  return (
    <WidgetContainer clickActionUri="rupeo://login" paddingHorizontal={14} paddingVertical={12}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SvgWidget svg={RUPEO_BRAND_LOGO_SVG} style={{ width: 14, height: 14, marginRight: 6 }} />
        <TextWidget
          text="RUPEO"
          style={{
            fontSize: 10,
            fontWeight: 'bold',
            color: '#0F172A',
            letterSpacing: 0.8,
          }}
        />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', marginVertical: 4 }}>
        <TextWidget
          text="Login to see data"
          style={{
            fontSize: 12,
            fontWeight: 'bold',
            color: '#0F172A',
          }}
        />
        <TextWidget
          text="Tap to log in to Rupeo"
          style={{
            fontSize: 10,
            color: '#64748B',
            marginTop: 2,
          }}
        />
      </FlexWidget>
      <FlexWidget
        style={{
          backgroundColor: '#0F172A',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}
      >
        <TextWidget
          text="Login ›"
          style={{
            fontSize: 10,
            fontWeight: 'bold',
            color: '#FFFFFF',
          }}
        />
      </FlexWidget>
    </WidgetContainer>
  );
}
