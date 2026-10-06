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

const RUPEO_LOGO_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#4F46E5"/><path d="M7 6h10M7 10h8M7 6v12M12 10a4 4 0 0 1 0 8H7" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const MINUS_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F87171" stroke-width="3" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

const PLUS_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

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
          from: '#0B0F19',
          to: '#111827',
          orientation: 'TOP_BOTTOM',
        },
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#1F293D',
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* 1. Top Header Row: Rupeo Branding & Daily Limit Pill */}
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
            backgroundColor: '#1E1B4B80',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#3730A3',
            paddingHorizontal: 7,
            paddingVertical: 3,
          }}
        >
          <SvgWidget svg={RUPEO_LOGO_SVG} style={{ width: 14, height: 14, marginRight: 5 }} />
          <TextWidget
            text="RUPEO"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#A5B4FC',
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
              backgroundColor: remainingLimit > 0 ? '#064E3B60' : '#450A0A60',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: remainingLimit > 0 ? '#05966960' : '#DC262660',
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <TextWidget
              text="LEFT "
              style={{
                fontSize: 9,
                fontWeight: 'bold',
                color: remainingLimit > 0 ? '#6EE7B7' : '#FCA5A5',
                letterSpacing: 0.5,
              }}
            />
            <TextWidget
              text={`${currency}${formatAmount(remainingLimit)}`}
              style={{
                fontSize: 11,
                fontWeight: 'bold',
                color: remainingLimit > 0 ? '#34D399' : '#F87171',
              }}
            />
          </FlexWidget>
        ) : (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
            style={{
              backgroundColor: '#1E293B60',
              borderRadius: 8,
              paddingHorizontal: 7,
              paddingVertical: 3,
            }}
          >
            <TextWidget
              text="QUICK TRACK"
              style={{
                fontSize: 9,
                fontWeight: 'bold',
                color: '#94A3B8',
                letterSpacing: 0.6,
              }}
            />
          </FlexWidget>
        )}
      </FlexWidget>

      {/* 2. Middle Row: Today's Spend Showcase */}
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
              fontSize: 9,
              fontWeight: 'bold',
              color: '#64748B',
              letterSpacing: 0.8,
            }}
          />
          <TextWidget
            text={`${currency}${formatAmount(todaySpent)}`}
            style={{
              fontSize: 22,
              fontWeight: 'bold',
              color: '#F8FAFC',
              marginTop: 1,
            }}
          />
        </FlexWidget>

        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#1E293B',
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <TextWidget
            text="Insights ›"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#818CF8',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 3. Bottom Action Row: Big Comfortable Touch Buttons */}
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
            backgroundColor: '#3B1219',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#7F1D1D',
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
              color: '#FCA5A5',
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
            backgroundColor: '#062B1E',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#065F46',
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
              color: '#86EFAC',
            }}
          />
        </FlexWidget>

        {/* Voice Button (Hero highlighted action) */}
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
            borderWidth: 1,
            borderColor: '#6366F1',
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
