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

export interface UdharSummaryWidgetProps {
  snapshot?: WidgetSnapshot | null;
}

/**
 * Udhar Summary Widget (2x2)
 * Shows "To receive" and "To pay" totals and top people.
 */
export function UdharSummaryWidget({ snapshot }: UdharSummaryWidgetProps) {
  if (!snapshot) {
    return <WidgetFallbackState />;
  }

  const { udhar, currency = '₹', updatedAt } = snapshot;
  const toReceive = udhar?.toReceive || 0;
  const toPay = udhar?.toPay || 0;
  const topPeople = udhar?.topPeople || [];

  return (
    <WidgetContainer clickActionUri="rupeo://udhar" paddingHorizontal={12} paddingVertical={10}>
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
            text="UDHAR & FRIENDS"
            style={{
              fontSize: 9,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 0.5,
            }}
          />
        </FlexWidget>

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

      {/* 2. To Receive / To Pay Split Cards */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          width: 'match_parent',
          marginVertical: 3,
          flexGap: 6,
        }}
      >
        {/* To Receive */}
        <FlexWidget
          style={{
            flex: 1,
            backgroundColor: '#F0FDF4',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#DCFCE7',
            paddingHorizontal: 6,
            paddingVertical: 4,
            flexDirection: 'column',
          }}
        >
          <TextWidget
            text="To Receive"
            style={{
              fontSize: 8,
              fontWeight: 'bold',
              color: '#15803D',
            }}
          />
          <TextWidget
            text={formatWidgetAmount(toReceive, currency)}
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#16A34A',
              marginTop: 1,
            }}
          />
        </FlexWidget>

        {/* To Pay */}
        <FlexWidget
          style={{
            flex: 1,
            backgroundColor: '#FEF2F2',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#FEE2E2',
            paddingHorizontal: 6,
            paddingVertical: 4,
            flexDirection: 'column',
          }}
        >
          <TextWidget
            text="To Pay"
            style={{
              fontSize: 8,
              fontWeight: 'bold',
              color: '#B91C1C',
            }}
          />
          <TextWidget
            text={formatWidgetAmount(toPay, currency)}
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              color: '#DC2626',
              marginTop: 1,
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 3. Top Friends List */}
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        {topPeople.length === 0 ? (
          <FlexWidget style={{ paddingVertical: 4, alignItems: 'center' }}>
            <TextWidget
              text="No active balances"
              style={{
                fontSize: 9.5,
                color: '#94A3B8',
              }}
            />
          </FlexWidget>
        ) : (
          topPeople.slice(0, 2).map((person, idx) => {
            const isReceivable = (person.balance || 0) > 0;
            return (
              <FlexWidget
                key={`person_${idx}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: 'match_parent',
                  paddingVertical: 2,
                }}
              >
                <FlexWidget style={{ flex: 1, marginRight: 4 }}>
                  <TextWidget
                    text={person.name}
                    truncate="END"
                    maxLines={1}
                    style={{
                      fontSize: 9.5,
                      fontWeight: '600',
                      color: '#334155',
                    }}
                  />
                </FlexWidget>
                <TextWidget
                  text={`${isReceivable ? '+' : '-'}${formatWidgetAmount(Math.abs(person.balance || 0), currency)}`}
                  style={{
                    fontSize: 9.5,
                    fontWeight: 'bold',
                    color: isReceivable ? '#16A34A' : '#DC2626',
                  }}
                />
              </FlexWidget>
            );
          })
        )}
      </FlexWidget>
    </WidgetContainer>
  );
}
