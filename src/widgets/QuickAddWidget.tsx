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

const MIC_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

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
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Top Header Row: Spent Info + Daily Left / Rupeo Brand */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        {/* Left: Today's Spend */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <TextWidget
            text="TODAY "
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#64748B',
              letterSpacing: 0.5,
            }}
          />
          <TextWidget
            text={`${currency}${formatAmount(todaySpent)}`}
            style={{
              fontSize: 15,
              fontWeight: 'bold',
              color: '#0F172A',
            }}
          />
        </FlexWidget>

        {/* Right: Daily Left or Rupeo Badge */}
        {remainingLimit !== null ? (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <TextWidget
              text="LEFT "
              style={{
                fontSize: 10,
                fontWeight: 'bold',
                color: '#64748B',
                letterSpacing: 0.5,
              }}
            />
            <TextWidget
              text={`${currency}${formatAmount(remainingLimit)}`}
              style={{
                fontSize: 14,
                fontWeight: 'bold',
                color: remainingLimit > 0 ? '#16A34A' : '#DC2626',
              }}
            />
          </FlexWidget>
        ) : (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
            style={{
              backgroundColor: '#F1F5F9',
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <TextWidget
              text="RUPEO"
              style={{
                fontSize: 9,
                fontWeight: 'bold',
                color: '#6366F1',
                letterSpacing: 0.8,
              }}
            />
          </FlexWidget>
        )}
      </FlexWidget>

      {/* Bottom Action Row: Compact Light Pills */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          flexGap: 6,
        }}
      >
        {/* 1. Expense Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=expense' }}
          style={{
            flex: 1,
            height: 32,
            backgroundColor: '#FEE2E2',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#FECACA',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text="− Expense"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#DC2626',
            }}
          />
        </FlexWidget>

        {/* 2. Income Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=income' }}
          style={{
            flex: 1,
            height: 32,
            backgroundColor: '#DCFCE7',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#BBF7D0',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text="+ Income"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#16A34A',
            }}
          />
        </FlexWidget>

        {/* 3. Voice Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add-voice' }}
          style={{
            flex: 1,
            height: 32,
            backgroundColor: '#EEF2FF',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#E0E7FF',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget
            svg={MIC_SVG}
            style={{
              width: 12,
              height: 12,
              marginRight: 4,
            }}
          />
          <TextWidget
            text="Voice"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#4F46E5',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
