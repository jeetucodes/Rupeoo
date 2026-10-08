import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '@/lib/widgetSnapshot';
import {
  WidgetContainer,
  WidgetFallbackState,
  formatWidgetAmount,
  RUPEO_BRAND_LOGO_SVG,
} from './WidgetCommon';

export interface TodaySummaryWidgetProps {
  snapshot?: WidgetSnapshot | null;
}

/**
 * Today Summary Widget (2x1)
 * Shows today's spent and remaining daily limit.
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
    <WidgetContainer clickActionUri="rupeo://(tabs)/dashboard" paddingHorizontal={12} paddingVertical={9}>
      {/* Top Header: Rupeo Branding & Limit Status */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SvgWidget svg={RUPEO_BRAND_LOGO_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
          <TextWidget
            text="TODAY"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 0.8,
            }}
          />
        </FlexWidget>

        {hasDailyLimit ? (
          <FlexWidget
            style={{
              backgroundColor: isOver ? '#FEE2E2' : '#DCFCE7',
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <TextWidget
              text={isOver ? 'OVER' : 'LEFT'}
              style={{
                fontSize: 8.5,
                fontWeight: 'bold',
                color: isOver ? '#DC2626' : '#16A34A',
                letterSpacing: 0.5,
              }}
            />
          </FlexWidget>
        ) : (
          <TextWidget
            text="DAILY"
            style={{
              fontSize: 8.5,
              fontWeight: '600',
              color: '#94A3B8',
              letterSpacing: 0.5,
            }}
          />
        )}
      </FlexWidget>

      {/* Main Spend Amount */}
      <FlexWidget style={{ flexDirection: 'column', marginVertical: 2 }}>
        <TextWidget
          text="Spent Today"
          style={{
            fontSize: 9.5,
            fontWeight: '600',
            color: '#64748B',
          }}
        />
        <TextWidget
          text={formatWidgetAmount(todaySpent, currency)}
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: '#0F172A',
          }}
        />
      </FlexWidget>

      {/* Bottom Sub-info: Remaining daily limit */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
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
            fontWeight: '500',
            color: isOver ? '#EF4444' : hasDailyLimit ? '#10B981' : '#94A3B8',
          }}
        />
      </FlexWidget>
    </WidgetContainer>
  );
}
