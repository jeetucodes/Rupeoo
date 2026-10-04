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

const MIC_SVG_WHITE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

const MIC_SVG_EMERALD = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

function formatAmount(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-IN');
}

export function QuickAddWidget({
  enabled = true,
  todaySpent = 0,
  dailyLimit = 0,
  remainingLimit = null,
  currency = '₹',
  theme = 'dark',
}: QuickAddWidgetProps) {
  const isDark = theme === 'dark';

  if (enabled === false) {
    return (
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'rupeo://settings' }}
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          borderRadius: 16,
          padding: 12,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <TextWidget
          text="RUPEO"
          style={{
            fontSize: 10,
            fontWeight: 'bold',
            color: isDark ? '#64748B' : '#94A3B8',
            letterSpacing: 1,
            marginBottom: 4,
          }}
        />
        <TextWidget
          text="Widget is disabled in Settings"
          style={{
            fontSize: 13,
            fontWeight: 'bold',
            color: isDark ? '#F1F5F9' : '#0F172A',
            textAlign: 'center',
          }}
        />
        <FlexWidget
          style={{
            marginTop: 8,
            backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <TextWidget
            text="Tap to open Settings →"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: isDark ? '#60A5FA' : '#2563EB',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
        borderRadius: 16,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Top Header: Spent & Limit */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        {/* Left Column: Today's Spent */}
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text="TODAY'S SPENT"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: isDark ? '#94A3B8' : '#64748B',
              letterSpacing: 0.5,
            }}
          />
          <TextWidget
            text={`${currency}${formatAmount(todaySpent)}`}
            style={{
              fontSize: 18,
              fontWeight: 'bold',
              color: isDark ? '#F8FAFC' : '#0F172A',
            }}
          />
        </FlexWidget>

        {/* Right Column: Remaining Daily Limit (if set) or App Brand */}
        {remainingLimit !== null ? (
          <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <TextWidget
              text="DAILY LEFT"
              style={{
                fontSize: 10,
                fontWeight: 'bold',
                color: isDark ? '#94A3B8' : '#64748B',
                letterSpacing: 0.5,
              }}
            />
            <TextWidget
              text={`${currency}${formatAmount(remainingLimit)}`}
              style={{
                fontSize: 18,
                fontWeight: 'bold',
                color: remainingLimit > 0 ? (isDark ? '#86EFAC' : '#16A34A') : (isDark ? '#FCA5A5' : '#DC2626'),
              }}
            />
          </FlexWidget>
        ) : (
          <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <TextWidget
              text="RUPEO"
              style={{
                fontSize: 11,
                fontWeight: 'bold',
                color: isDark ? '#64748B' : '#94A3B8',
                letterSpacing: 1,
              }}
            />
            <TextWidget
              text="Quick Add"
              style={{
                fontSize: 12,
                color: isDark ? '#94A3B8' : '#64748B',
              }}
            />
          </FlexWidget>
        )}
      </FlexWidget>

      {/* Bottom Action Row: Three Interactive Buttons */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          flexGap: 8,
        }}
      >
        {/* 1. + Expense Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=expense' }}
          style={{
            flex: 1,
            height: 38,
            backgroundColor: isDark ? '#450A0A' : '#FEE2E2',
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text="+ Expense"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: isDark ? '#FCA5A5' : '#DC2626',
            }}
          />
        </FlexWidget>

        {/* 2. + Income Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=income' }}
          style={{
            flex: 1,
            height: 38,
            backgroundColor: isDark ? '#052E16' : '#DCFCE7',
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text="+ Income"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: isDark ? '#86EFAC' : '#16A34A',
            }}
          />
        </FlexWidget>

        {/* 3. Voice Entry Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add-voice' }}
          style={{
            flex: 1,
            height: 38,
            backgroundColor: isDark ? '#064E3B' : '#ECFDF5',
            borderRadius: 10,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget
            svg={isDark ? MIC_SVG_WHITE : MIC_SVG_EMERALD}
            style={{
              width: 13,
              height: 13,
              marginRight: 4,
            }}
          />
          <TextWidget
            text="Voice"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: isDark ? '#6EE7B7' : '#059669',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
