import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';

export interface QuickAddWidgetProps {
  enabled?: boolean;
  todaySpent?: number;
  dailyLimit?: number;
  remainingLimit?: number | null;
  currency?: string;
  theme?: 'light' | 'dark';
}

const RUPEO_LOGO_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#1C1C1E"/><path d="M7 6h10M7 10h8M7 6v12M12 10a4 4 0 0 1 0 8H7" stroke="#FFD740" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const MINUS_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="3" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

const PLUS_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

const MIC_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

function formatAmount(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-IN');
}

export function QuickAddWidget({
  todaySpent = 0,
  dailyLimit = 0,
  remainingLimit = null,
  currency = '₹',
}: QuickAddWidgetProps) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: {
          from: '#FFFFFF',
          to: '#F8FAFC',
          orientation: 'TOP_BOTTOM',
        },
        borderRadius: 22,
        borderWidth: 1.2,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* 1. Header: Rupeo Branding & Daily Budget Status */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        {/* Brand Pill */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#F1F5F9',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            paddingHorizontal: 8,
            paddingVertical: 3.5,
          }}
        >
          <SvgWidget svg={RUPEO_LOGO_SVG} style={{ width: 14, height: 14, marginRight: 5 }} />
          <TextWidget
            text="RUPEO"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 1,
            }}
          />
        </FlexWidget>

        {/* Right Status Pill */}
        {remainingLimit !== null ? (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: remainingLimit > 0 ? '#DCFCE7' : '#FEE2E2',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: remainingLimit > 0 ? '#86EFAC' : '#FCA5A5',
              paddingHorizontal: 8,
              paddingVertical: 3.5,
            }}
          >
            <TextWidget
              text="LEFT "
              style={{
                fontSize: 9,
                fontWeight: 'bold',
                color: remainingLimit > 0 ? '#15803D' : '#991B1B',
                letterSpacing: 0.5,
              }}
            />
            <TextWidget
              text={`${currency}${formatAmount(remainingLimit)}`}
              style={{
                fontSize: 11,
                fontWeight: 'bold',
                color: remainingLimit > 0 ? '#166534' : '#DC2626',
              }}
            />
          </FlexWidget>
        ) : (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
            style={{
              backgroundColor: '#F1F5F9',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              paddingHorizontal: 8,
              paddingVertical: 3.5,
            }}
          >
            <TextWidget
              text="DAILY TRACKER"
              style={{
                fontSize: 9,
                fontWeight: 'bold',
                color: '#64748B',
                letterSpacing: 0.6,
              }}
            />
          </FlexWidget>
        )}
      </FlexWidget>

      {/* 2. Middle Row: Today's Spend in Crisp Contrast Typography */}
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          paddingVertical: 2,
        }}
      >
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text="TODAY'S SPENT"
            style={{
              fontSize: 9.5,
              fontWeight: 'bold',
              color: '#64748B',
              letterSpacing: 0.8,
            }}
          />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
            <TextWidget
              text={`${currency} `}
              style={{
                fontSize: 16,
                fontWeight: 'bold',
                color: '#F59E0B',
              }}
            />
            <TextWidget
              text={formatAmount(todaySpent)}
              style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: '#0F172A',
              }}
            />
          </FlexWidget>
        </FlexWidget>

        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#EEF2FF',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#E0E7FF',
            paddingHorizontal: 9,
            paddingVertical: 5,
          }}
        >
          <TextWidget
            text="Dashboard ›"
            style={{
              fontSize: 10.5,
              fontWeight: 'bold',
              color: '#4F46E5',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 3. Bottom Action Row: Clean 1-Tap Touch Buttons */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          flexGap: 6,
        }}
      >
        {/* Expense Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=expense&fromWidget=1' }}
          style={{
            flex: 1,
            height: 40,
            backgroundColor: '#FEF2F2',
            borderRadius: 12,
            borderWidth: 1.2,
            borderColor: '#FECACA',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={MINUS_SVG} style={{ width: 12, height: 12, marginRight: 4 }} />
          <TextWidget
            text="Expense"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#DC2626',
            }}
          />
        </FlexWidget>

        {/* Income Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=income&fromWidget=1' }}
          style={{
            flex: 1,
            height: 40,
            backgroundColor: '#F0FDF4',
            borderRadius: 12,
            borderWidth: 1.2,
            borderColor: '#BBF7D0',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={PLUS_SVG} style={{ width: 12, height: 12, marginRight: 4 }} />
          <TextWidget
            text="Income"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#16A34A',
            }}
          />
        </FlexWidget>

        {/* Voice Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add-voice?fromWidget=1' }}
          style={{
            flex: 1.15,
            height: 40,
            backgroundGradient: {
              from: '#4F46E5',
              to: '#4338CA',
              orientation: 'TOP_BOTTOM',
            },
            borderRadius: 12,
            borderWidth: 1.2,
            borderColor: '#4338CA',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={MIC_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
          <TextWidget
            text="Voice"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#FFFFFF',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
