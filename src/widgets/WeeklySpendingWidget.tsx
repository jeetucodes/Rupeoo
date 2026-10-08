import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '@/lib/widgetSnapshot';
import {
  WidgetContainer,
  WidgetFallbackState,
  formatWidgetAmount,
  formatWidgetTime,
  RUPEO_BRAND_LOGO_SVG,
} from './WidgetCommon';

export interface WeeklySpendingWidgetProps {
  snapshot?: WidgetSnapshot | null;
}

/**
 * Weekly Spending Chart Widget (4x2)
 * 7 vertical bars built purely with FlexWidget, today highlighted in Indigo.
 */
export function WeeklySpendingWidget({ snapshot }: WeeklySpendingWidgetProps) {
  if (!snapshot) {
    return <WidgetFallbackState />;
  }

  const { weeklySpend = [], currency = '₹', updatedAt } = snapshot;

  const totalWeekly = weeklySpend.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const maxDaySpend = Math.max(1, ...weeklySpend.map((w) => w.amount || 0));

  return (
    <WidgetContainer clickActionUri="rupeo://(tabs)/ai_insights" paddingHorizontal={14} paddingVertical={10}>
      {/* 1. Header */}
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
            text="WEEKLY SPENDING"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 0.6,
            }}
          />
        </FlexWidget>

        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextWidget
            text={`Total: ${formatWidgetAmount(totalWeekly, currency)}`}
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#0F172A',
            }}
          />
          {updatedAt ? (
            <TextWidget
              text={` • ${formatWidgetTime(updatedAt)}`}
              style={{
                fontSize: 8.5,
                color: '#94A3B8',
                marginLeft: 2,
              }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>

      {/* 2. 7-Bar Chart Row */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          width: 'match_parent',
          height: 62,
          paddingTop: 6,
          paddingHorizontal: 4,
        }}
      >
        {weeklySpend.map((item, idx) => {
          const heightPct = Math.max(10, Math.min(100, Math.round((item.amount / maxDaySpend) * 100)));
          const isToday = item.isToday;
          const barColor: `#${string}` = isToday ? '#4F46E5' : item.amount > 0 ? '#94A3B8' : '#E2E8F0';

          return (
            <FlexWidget
              key={`day_${idx}`}
              style={{
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                flex: 1,
                height: 'match_parent',
              }}
            >
              {/* Pillar Container */}
              <FlexWidget
                style={{
                  flexDirection: 'column',
                  width: 14,
                  height: 44,
                  backgroundColor: isToday ? '#EEF2FF' : '#F8FAFC',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                {/* Empty top space */}
                {heightPct < 100 ? (
                  <FlexWidget
                    style={{
                      flex: Math.max(1, 100 - heightPct),
                      width: 'match_parent',
                    }}
                  />
                ) : null}
                {/* Filled portion from bottom */}
                <FlexWidget
                  style={{
                    flex: Math.max(1, heightPct),
                    width: 'match_parent',
                    backgroundColor: barColor,
                    borderRadius: 4,
                  }}
                />
              </FlexWidget>

              {/* Day Label */}
              <TextWidget
                text={item.day.slice(0, 3)}
                style={{
                  fontSize: 8.5,
                  fontWeight: isToday ? 'bold' : '500',
                  color: isToday ? '#4F46E5' : '#64748B',
                  marginTop: 3,
                }}
              />
            </FlexWidget>
          );
        })}
      </FlexWidget>
    </WidgetContainer>
  );
}
