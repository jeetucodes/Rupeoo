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

export interface MonthOverviewWidgetProps {
  snapshot?: WidgetSnapshot | null;
}

/**
 * Month Overview Widget (2x2)
 * Shows month income, expense, and net balance with a small progress bar.
 */
export function MonthOverviewWidget({ snapshot }: MonthOverviewWidgetProps) {
  if (!snapshot) {
    return <WidgetFallbackState />;
  }

  const {
    monthSpent = 0,
    monthIncome = 0,
    balance = 0,
    currency = '₹',
    updatedAt,
  } = snapshot;

  const totalFlow = monthIncome + monthSpent;
  const spendPct = totalFlow > 0 ? Math.min(100, Math.round((monthSpent / totalFlow) * 100)) : 0;

  return (
    <WidgetContainer clickActionUri="rupeo://(tabs)/ai_insights" paddingHorizontal={12} paddingVertical={10}>
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
            text="THIS MONTH"
            style={{
              fontSize: 9.5,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 0.6,
            }}
          />
        </FlexWidget>

        {updatedAt ? (
          <TextWidget
            text={formatWidgetTime(updatedAt)}
            style={{
              fontSize: 8.5,
              color: '#94A3B8',
            }}
          />
        ) : null}
      </FlexWidget>

      {/* 2. Total Balance Block */}
      <FlexWidget style={{ flexDirection: 'column', marginVertical: 3 }}>
        <TextWidget
          text="Total Balance"
          style={{
            fontSize: 9,
            fontWeight: '600',
            color: '#64748B',
          }}
        />
        <TextWidget
          text={formatWidgetAmount(balance, currency)}
          style={{
            fontSize: 18,
            fontWeight: 'bold',
            color: balance < 0 ? '#EF4444' : '#0F172A',
          }}
        />
      </FlexWidget>

      {/* 3. Spend Ratio Progress Bar */}
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginVertical: 2 }}>
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 5,
            backgroundColor: '#DCFCE7',
            borderRadius: 3,
            overflow: 'hidden',
            flexDirection: 'row',
          }}
        >
          <FlexWidget
            style={{
              flex: Math.max(1, spendPct),
              height: 'match_parent',
              backgroundColor: '#EF4444',
            }}
          />
          {spendPct < 100 ? (
            <FlexWidget
              style={{
                flex: Math.max(1, 100 - spendPct),
                height: 'match_parent',
                backgroundColor: '#DCFCE7',
              }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>

      {/* 4. Income & Expense Row */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          backgroundColor: '#F8FAFC',
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 5,
        }}
      >
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text="Income"
            style={{
              fontSize: 8.5,
              fontWeight: '600',
              color: '#16A34A',
            }}
          />
          <TextWidget
            text={formatWidgetAmount(monthIncome, currency)}
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#16A34A',
            }}
          />
        </FlexWidget>

        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
          <TextWidget
            text="Spent"
            style={{
              fontSize: 8.5,
              fontWeight: '600',
              color: '#DC2626',
            }}
          />
          <TextWidget
            text={formatWidgetAmount(monthSpent, currency)}
            style={{
              fontSize: 11,
              fontWeight: 'bold',
              color: '#DC2626',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </WidgetContainer>
  );
}
