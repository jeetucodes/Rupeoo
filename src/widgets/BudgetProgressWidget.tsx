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

export interface BudgetProgressWidgetProps {
  snapshot?: WidgetSnapshot | null;
}

/**
 * Budget Progress Widget (2x2)
 * Shows used vs total budget, percentage, colour changes at 70% and 100%.
 */
export function BudgetProgressWidget({ snapshot }: BudgetProgressWidgetProps) {
  if (!snapshot) {
    return <WidgetFallbackState />;
  }

  const {
    budgetTotal = 0,
    budgetUsed = 0,
    currency = '₹',
    updatedAt,
  } = snapshot;

  const hasBudget = budgetTotal > 0;
  const pct = hasBudget ? Math.round((budgetUsed / budgetTotal) * 100) : 0;
  const barWidth = Math.min(100, Math.max(0, pct));
  const remainingBar = Math.max(0, 100 - barWidth);

  let statusColor: `#${string}` = '#10B981';
  let badgeBg: `#${string}` = '#DCFCE7';
  let badgeText: `#${string}` = '#15803D';
  let statusLabel = 'ON TRACK';

  if (pct >= 100) {
    statusColor = '#EF4444';
    badgeBg = '#FEE2E2';
    badgeText = '#991B1B';
    statusLabel = 'OVER BUDGET';
  } else if (pct >= 70) {
    statusColor = '#F59E0B';
    badgeBg = '#FEF3C7';
    badgeText = '#B45309';
    statusLabel = 'CAUTION';
  }

  return (
    <WidgetContainer clickActionUri="rupeo://budget" paddingHorizontal={12} paddingVertical={10}>
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
            text="BUDGET"
            style={{
              fontSize: 9.5,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 0.6,
            }}
          />
        </FlexWidget>

        {hasBudget ? (
          <FlexWidget
            style={{
              backgroundColor: badgeBg,
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <TextWidget
              text={statusLabel}
              style={{
                fontSize: 8,
                fontWeight: 'bold',
                color: badgeText,
              }}
            />
          </FlexWidget>
        ) : (
          <TextWidget
            text="NOT SET"
            style={{
              fontSize: 8.5,
              color: '#94A3B8',
            }}
          />
        )}
      </FlexWidget>

      {/* 2. Percentage Callout */}
      <FlexWidget style={{ flexDirection: 'column', marginVertical: 3 }}>
        {hasBudget ? (
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextWidget
              text={`${pct}%`}
              style={{
                fontSize: 22,
                fontWeight: 'bold',
                color: statusColor,
              }}
            />
            <TextWidget
              text=" used"
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: '#64748B',
                marginLeft: 4,
              }}
            />
          </FlexWidget>
        ) : (
          <TextWidget
            text="Set Monthly Budget"
            style={{
              fontSize: 13,
              fontWeight: 'bold',
              color: '#4F46E5',
            }}
          />
        )}
      </FlexWidget>

      {/* 3. Progress Bar */}
      <FlexWidget style={{ width: 'match_parent', marginVertical: 2 }}>
        <FlexWidget
          style={{
            flexDirection: 'row',
            width: 'match_parent',
            height: 6,
            backgroundColor: '#F1F5F9',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <FlexWidget
            style={{
              flex: Math.max(1, barWidth),
              height: 'match_parent',
              backgroundColor: statusColor,
            }}
          />
          {remainingBar > 0 ? (
            <FlexWidget
              style={{
                flex: remainingBar,
                height: 'match_parent',
                backgroundColor: '#F1F5F9',
              }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>

      {/* 4. Used vs Total Numbers */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        <TextWidget
          text={`${formatWidgetAmount(budgetUsed, currency)} of ${formatWidgetAmount(budgetTotal, currency)}`}
          truncate="END"
          maxLines={1}
          style={{
            fontSize: 9.5,
            fontWeight: '600',
            color: '#475569',
          }}
        />

        {updatedAt ? (
          <TextWidget
            text={formatWidgetTime(updatedAt)}
            style={{
              fontSize: 8,
              color: '#94A3B8',
            }}
          />
        ) : null}
      </FlexWidget>
    </WidgetContainer>
  );
}
