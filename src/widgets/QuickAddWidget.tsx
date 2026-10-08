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
  // Backward compatibility props:
  todaySpent?: number;
  dailyLimit?: number;
  remainingLimit?: number | null;
  currency?: string;
}

/**
 * Quick Add Widget (4x1)
 * Clean light launcher with 4 fast actions:
 * + Expense, + Income, Voice (mic), Udhar / Scan.
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
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 12,
        paddingVertical: 10,
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
          <SvgWidget svg={RUPEO_BRAND_LOGO_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
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

        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <TextWidget
            text={`Today: ${formatWidgetAmount(spent, curr)}`}
            style={{
              fontSize: 10,
              fontWeight: '600',
              color: '#64748B',
            }}
          />
          {updatedAt ? (
            <TextWidget
              text={` • ${formatWidgetTime(updatedAt)}`}
              style={{
                fontSize: 8.5,
                color: '#94A3B8',
                marginLeft: 3,
              }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>

      {/* 2. 4 Fast Action Buttons */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          flexGap: 6,
        }}
      >
        {/* + Expense */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=expense&fromWidget=1' }}
          style={{
            flex: 1,
            height: 40,
            backgroundColor: '#FEF2F2',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#FECACA',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={ICON_EXPENSE_SVG} style={{ width: 11, height: 11, marginRight: 4 }} />
          <TextWidget
            text="Expense"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#DC2626',
            }}
          />
        </FlexWidget>

        {/* + Income */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=income&fromWidget=1' }}
          style={{
            flex: 1,
            height: 40,
            backgroundColor: '#F0FDF4',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#BBF7D0',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={ICON_INCOME_SVG} style={{ width: 11, height: 11, marginRight: 4 }} />
          <TextWidget
            text="Income"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#16A34A',
            }}
          />
        </FlexWidget>

        {/* Voice Entry */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add-voice?fromWidget=1' }}
          style={{
            flex: 1,
            height: 40,
            backgroundColor: '#EEF2FF',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#C7D2FE',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={ICON_MIC_SVG} style={{ width: 12, height: 12, marginRight: 4 }} />
          <TextWidget
            text="Voice"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#4F46E5',
            }}
          />
        </FlexWidget>

        {/* Udhar / Scan */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://udhar' }}
          style={{
            flex: 1,
            height: 40,
            backgroundColor: '#F8FAFC',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={ICON_UDHAR_SVG} style={{ width: 11, height: 11, marginRight: 4 }} />
          <TextWidget
            text="Udhar"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#334155',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
