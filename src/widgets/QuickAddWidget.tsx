import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '@/lib/widgetSnapshot';
import {
  formatWidgetAmount,
  formatWidgetTime,
  RUPEO_BRAND_LOGO_SVG,
  ICON_EXPENSE_SVG,
  ICON_INCOME_SVG,
  ICON_MIC_SVG,
  ICON_UDHAR_SVG,
} from './WidgetCommon';

export interface QuickAddWidgetProps {
  snapshot?: WidgetSnapshot | null;
  todaySpent?: number;
  dailyLimit?: number;
  remainingLimit?: number | null;
  currency?: string;
}

/**
 * Quick Add Widget (4x1 / 4x2)
 * Clean, bold launcher with 4 large, tactile actions:
 * + Expense, + Income, Voice, and Udhar / Friends.
 * Directly links to the main Add screen (/add) matching the app's main '+' button.
 */
export function QuickAddWidget({
  snapshot,
  todaySpent: legacyTodaySpent,
  currency: legacyCurrency,
}: QuickAddWidgetProps) {
  const spent = snapshot ? snapshot.todaySpent : (legacyTodaySpent ?? 0);
  const curr = snapshot ? snapshot.currency : (legacyCurrency ?? '₹');
  const updatedAt = snapshot ? snapshot.updatedAt : undefined;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        borderWidth: 1.2,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* 1. Top Header Row: Brand & Spend pill */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <SvgWidget svg={RUPEO_BRAND_LOGO_SVG} style={{ width: 16, height: 16, marginRight: 6 }} />
          <TextWidget
            text="RUPEO"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 0.8,
            }}
          />
        </FlexWidget>

        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <TextWidget
            text={`Today: ${formatWidgetAmount(spent, curr)}`}
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#475569',
            }}
          />
          {updatedAt ? (
            <TextWidget
              text={` • ${formatWidgetTime(updatedAt)}`}
              style={{
                fontSize: 9,
                color: '#94A3B8',
                marginLeft: 4,
              }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>

      {/* 2. 4 Large, Tactile Action Buttons */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          flexGap: 8,
          marginTop: 6,
        }}
      >
        {/* + Expense (opens main Add screen) */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://add?type=expense&fromWidget=1' }}
          style={{
            flex: 1,
            height: 48,
            backgroundColor: '#FEF2F2',
            borderRadius: 12,
            borderWidth: 1.2,
            borderColor: '#FECACA',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={ICON_EXPENSE_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
          <TextWidget
            text="Expense"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#DC2626',
            }}
          />
        </FlexWidget>

        {/* + Income (opens main Add screen) */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://add?type=income&fromWidget=1' }}
          style={{
            flex: 1,
            height: 48,
            backgroundColor: '#F0FDF4',
            borderRadius: 12,
            borderWidth: 1.2,
            borderColor: '#BBF7D0',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={ICON_INCOME_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
          <TextWidget
            text="Income"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#16A34A',
            }}
          />
        </FlexWidget>

        {/* Voice Entry (opens main Add screen with voice activated) */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://add?voice=1&fromWidget=1' }}
          style={{
            flex: 1,
            height: 48,
            backgroundColor: '#EEF2FF',
            borderRadius: 12,
            borderWidth: 1.2,
            borderColor: '#C7D2FE',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={ICON_MIC_SVG} style={{ width: 14, height: 14, marginRight: 5 }} />
          <TextWidget
            text="Voice"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#4F46E5',
            }}
          />
        </FlexWidget>

        {/* Udhar / Len-Den */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://udhar' }}
          style={{
            flex: 1,
            height: 48,
            backgroundColor: '#F8FAFC',
            borderRadius: 12,
            borderWidth: 1.2,
            borderColor: '#E2E8F0',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={ICON_UDHAR_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
          <TextWidget
            text="Udhar"
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#334155',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
