import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '@/lib/widgetSnapshot';
import {
  WidgetContainer,
  WidgetFallbackState,
  formatWidgetAmount,
  formatWidgetTime,
  RUPEO_BRAND_LOGO_SVG,
  ICON_TARGET_SVG,
} from './WidgetCommon';

export interface GoalsProgressWidgetProps {
  snapshot?: WidgetSnapshot | null;
}

/**
 * Goals Progress Widget (4x2)
 * Shows up to 3 budget/savings goals with progress bars.
 */
export function GoalsProgressWidget({ snapshot }: GoalsProgressWidgetProps) {
  if (!snapshot) {
    return <WidgetFallbackState />;
  }

  const { goals = [], currency = '₹', updatedAt } = snapshot;
  const list = goals.slice(0, 3);

  return (
    <WidgetContainer clickActionUri="rupeo://budget" paddingHorizontal={14} paddingVertical={10}>
      {/* 1. Header */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          marginBottom: 3,
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SvgWidget svg={RUPEO_BRAND_LOGO_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
          <TextWidget
            text="BUDGET GOALS"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 0.6,
            }}
          />
        </FlexWidget>

        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          {updatedAt ? (
            <TextWidget
              text={`Updated ${formatWidgetTime(updatedAt)} • `}
              style={{
                fontSize: 8.5,
                color: '#94A3B8',
              }}
            />
          ) : null}
          <TextWidget
            text="Manage ›"
            style={{
              fontSize: 9.5,
              fontWeight: 'bold',
              color: '#4F46E5',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 2. Goals List */}
      {list.length === 0 ? (
        <FlexWidget
          style={{
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: 'match_parent',
            marginVertical: 12,
          }}
        >
          <TextWidget
            text="No budget limits configured"
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: '#64748B',
            }}
          />
          <TextWidget
            text="Tap to set monthly or category budgets"
            style={{
              fontSize: 9.5,
              color: '#94A3B8',
              marginTop: 2,
            }}
          />
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            justifyContent: 'space-between',
          }}
        >
          {list.map((goal, idx) => {
            const pct = Math.min(100, Math.max(0, goal.percentage || 0));
            const isOver = (goal.current || 0) > (goal.target || 0);
            const barColor = isOver ? '#EF4444' : pct > 75 ? '#F59E0B' : '#10B981';

            return (
              <FlexWidget
                key={`goal_${idx}`}
                style={{
                  flexDirection: 'column',
                  width: 'match_parent',
                  paddingVertical: 3,
                }}
              >
                {/* Title & Amounts Row */}
                <FlexWidget
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: 'match_parent',
                    marginBottom: 2,
                  }}
                >
                  <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <SvgWidget svg={ICON_TARGET_SVG} style={{ width: 10, height: 10, marginRight: 4 }} />
                    <TextWidget
                      text={goal.name}
                      truncate="END"
                      maxLines={1}
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: '#1E293B',
                      }}
                    />
                  </FlexWidget>

                  <TextWidget
                    text={`${formatWidgetAmount(goal.current, currency)} / ${formatWidgetAmount(goal.target, currency)} (${goal.percentage}%)`}
                    style={{
                      fontSize: 9.5,
                      fontWeight: 'bold',
                      color: isOver ? '#DC2626' : '#64748B',
                    }}
                  />
                </FlexWidget>

                {/* Progress Bar */}
                <FlexWidget
                  style={{
                    flexDirection: 'row',
                    width: 'match_parent',
                    height: 5,
                    backgroundColor: '#F1F5F9',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <FlexWidget
                    style={{
                      flex: Math.max(1, pct),
                      height: 'match_parent',
                      backgroundColor: barColor,
                    }}
                  />
                  {pct < 100 ? (
                    <FlexWidget
                      style={{
                        flex: Math.max(1, 100 - pct),
                        height: 'match_parent',
                        backgroundColor: '#F1F5F9',
                      }}
                    />
                  ) : null}
                </FlexWidget>
              </FlexWidget>
            );
          })}
        </FlexWidget>
      )}
    </WidgetContainer>
  );
}
