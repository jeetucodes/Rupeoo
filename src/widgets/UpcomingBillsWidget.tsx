import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '@/lib/widgetSnapshot';
import {
  WidgetContainer,
  WidgetFallbackState,
  formatWidgetAmount,
  formatWidgetTime,
  RUPEO_BRAND_LOGO_SVG,
  ICON_BELL_SVG,
} from './WidgetCommon';

export interface UpcomingBillsWidgetProps {
  snapshot?: WidgetSnapshot | null;
}

/**
 * Upcoming Bills Widget (4x2)
 * Shows next 3 bills with due dates, highlighting ones due within 3 days.
 */
export function UpcomingBillsWidget({ snapshot }: UpcomingBillsWidgetProps) {
  if (!snapshot) {
    return <WidgetFallbackState />;
  }

  const { upcomingBills = [], currency = '₹', updatedAt } = snapshot;
  const list = upcomingBills.slice(0, 3);

  return (
    <WidgetContainer clickActionUri="rupeo://reminders" paddingHorizontal={14} paddingVertical={10}>
      {/* 1. Header */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          marginBottom: 4,
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SvgWidget svg={RUPEO_BRAND_LOGO_SVG} style={{ width: 13, height: 13, marginRight: 5 }} />
          <TextWidget
            text="UPCOMING BILLS"
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
            text="Reminders ›"
            style={{
              fontSize: 9.5,
              fontWeight: 'bold',
              color: '#4F46E5',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 2. Bills List */}
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
            text="No upcoming bills scheduled"
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: '#64748B',
            }}
          />
          <TextWidget
            text="Tap to add recurring bill reminders"
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
          {list.map((bill, idx) => {
            const isDueSoon = bill.isDueSoon;
            let dueText = `Due in ${bill.daysLeft}d`;
            if (bill.daysLeft === 0) dueText = 'Due Today';
            else if (bill.daysLeft === 1) dueText = 'Due Tomorrow';
            else if (bill.daysLeft < 0) dueText = 'Overdue';

            return (
              <FlexWidget
                key={bill.id || `bill_${idx}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: 'match_parent',
                  paddingVertical: 3,
                  borderBottomWidth: idx < list.length - 1 ? 0.5 : 0,
                  borderColor: '#F1F5F9',
                }}
              >
                <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <SvgWidget svg={ICON_BELL_SVG} style={{ width: 11, height: 11, marginRight: 5 }} />
                  <TextWidget
                    text={bill.title}
                    truncate="END"
                    maxLines={1}
                    style={{
                      fontSize: 10.5,
                      fontWeight: '600',
                      color: '#1E293B',
                    }}
                  />
                </FlexWidget>

                <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* Urgency Badge */}
                  <FlexWidget
                    style={{
                      backgroundColor: isDueSoon ? '#FEF3C7' : '#F1F5F9',
                      borderRadius: 6,
                      paddingHorizontal: 5,
                      paddingVertical: 1.5,
                      marginRight: 6,
                    }}
                  >
                    <TextWidget
                      text={dueText}
                      style={{
                        fontSize: 8,
                        fontWeight: 'bold',
                        color: isDueSoon ? '#B45309' : '#64748B',
                      }}
                    />
                  </FlexWidget>

                  <TextWidget
                    text={formatWidgetAmount(bill.amount, currency)}
                    style={{
                      fontSize: 11,
                      fontWeight: 'bold',
                      color: '#0F172A',
                    }}
                  />
                </FlexWidget>
              </FlexWidget>
            );
          })}
        </FlexWidget>
      )}
    </WidgetContainer>
  );
}
