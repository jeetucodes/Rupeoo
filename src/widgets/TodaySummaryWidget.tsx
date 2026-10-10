import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '@/lib/widgetSnapshot';
import {
  WidgetContainer,
  WidgetFallbackState,
  formatWidgetAmount,
  RUPEO_BRAND_LOGO_SVG,
  ICON_EXPENSE_SVG,
  ICON_INCOME_SVG,
} from './WidgetCommon';

export interface TodaySummaryWidgetProps {
  snapshot?: WidgetSnapshot | null;
}

/**
 * Today Summary Widget (2x1 / 4x2)
 * Shows today's spent and remaining daily limit with large, high-contrast buttons
 * that trigger the main Add Transaction screen (/add).
 */
export function TodaySummaryWidget({ snapshot }: TodaySummaryWidgetProps) {
  if (!snapshot) {
    return <WidgetFallbackState />;
  }

  const { todaySpent = 0, dailyLimit = 0, currency = '₹' } = snapshot;
  const hasDailyLimit = dailyLimit > 0;
  const remaining = hasDailyLimit ? dailyLimit - todaySpent : null;
  const isOver = remaining !== null && remaining < 0;

  return (
    <WidgetContainer clickActionUri="rupeo://(tabs)/dashboard" paddingHorizontal={14} paddingVertical={12}>
      {/* 1. Top Header: Rupeo Branding & Limit Status */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SvgWidget svg={RUPEO_BRAND_LOGO_SVG} style={{ width: 15, height: 15, marginRight: 6 }} />
          <TextWidget
            text="RUPEO"
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 0.8,
            }}
          />
          <FlexWidget
            style={{
              backgroundColor: '#F1F5F9',
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
              marginLeft: 6,
            }}
          >
            <TextWidget
              text="TODAY"
              style={{
                fontSize: 9,
                fontWeight: 'bold',
                color: '#475569',
                letterSpacing: 0.5,
              }}
            />
          </FlexWidget>
        </FlexWidget>

        {hasDailyLimit ? (
          <FlexWidget
            style={{
              backgroundColor: isOver ? '#FEE2E2' : '#DCFCE7',
              borderRadius: 6,
              paddingHorizontal: 7,
              paddingVertical: 2,
            }}
          >
            <TextWidget
              text={isOver ? 'OVER BUDGET' : 'WITHIN LIMIT'}
              style={{
                fontSize: 8.5,
                fontWeight: 'bold',
                color: isOver ? '#DC2626' : '#16A34A',
                letterSpacing: 0.4,
              }}
            />
          </FlexWidget>
        ) : (
          <TextWidget
            text="Track Daily"
            style={{
              fontSize: 9,
              fontWeight: '600',
              color: '#94A3B8',
              letterSpacing: 0.3,
            }}
          />
        )}
      </FlexWidget>

      {/* 2. Main Content Row: Left is Big Spend, Right is 2 Large Fast Action Buttons */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          marginVertical: 4,
        }}
      >
        {/* Left Section: Spend & Remaining */}
        <FlexWidget style={{ flexDirection: 'column', flex: 1, marginRight: 8 }}>
          <TextWidget
            text="Today's Spend"
            style={{
              fontSize: 10,
              fontWeight: '600',
              color: '#64748B',
            }}
          />
          <TextWidget
            text={formatWidgetAmount(todaySpent, currency)}
            style={{
              fontSize: 23,
              fontWeight: 'bold',
              color: '#0F172A',
            }}
          />
          <TextWidget
            text={
              hasDailyLimit
                ? isOver
                  ? `Exceeded by ${formatWidgetAmount(Math.abs(remaining!), currency)}`
                  : `${formatWidgetAmount(remaining!, currency)} remaining`
                : 'Tap to view dashboard'
            }
            truncate="END"
            maxLines={1}
            style={{
              fontSize: 9.5,
              fontWeight: '600',
              color: isOver ? '#EF4444' : hasDailyLimit ? '#10B981' : '#94A3B8',
              marginTop: 1,
            }}
          />
        </FlexWidget>

        {/* Right Section: Big, Tactile Add Buttons (direct to main Add screen /add) */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'rupeo://add?type=expense&fromWidget=1' }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: '#FEF2F2',
              borderRadius: 12,
              borderWidth: 1.2,
              borderColor: '#FECACA',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <SvgWidget svg={ICON_EXPENSE_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
            <TextWidget
              text="+ Expense"
              style={{
                fontSize: 12,
                fontWeight: 'bold',
                color: '#DC2626',
              }}
            />
          </FlexWidget>

          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'rupeo://add?type=income&fromWidget=1' }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: '#F0FDF4',
              borderRadius: 12,
              borderWidth: 1.2,
              borderColor: '#BBF7D0',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <SvgWidget svg={ICON_INCOME_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
            <TextWidget
              text="+ Income"
              style={{
                fontSize: 12,
                fontWeight: 'bold',
                color: '#16A34A',
              }}
            />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
    </WidgetContainer>
  );
}
