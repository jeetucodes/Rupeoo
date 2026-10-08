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

export interface RecentTransactionsWidgetProps {
  snapshot?: WidgetSnapshot | null;
}

/**
 * Recent Transactions Widget (4x2)
 * Shows up to 5 entries with category/title, amount (green/red) and time.
 */
export function RecentTransactionsWidget({ snapshot }: RecentTransactionsWidgetProps) {
  if (!snapshot) {
    return <WidgetFallbackState />;
  }

  const { recentTransactions = [], currency = '₹', updatedAt } = snapshot;
  const list = recentTransactions.slice(0, 5);

  return (
    <WidgetContainer clickActionUri="rupeo://(tabs)/history" paddingHorizontal={14} paddingVertical={10}>
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
            text="RECENT TRANSACTIONS"
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
            text="View All ›"
            style={{
              fontSize: 9.5,
              fontWeight: 'bold',
              color: '#4F46E5',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 2. Transactions List */}
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
            text="No transactions recorded yet"
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: '#64748B',
            }}
          />
          <TextWidget
            text="Tap to add your first transaction"
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
          {list.map((tx, idx) => {
            const isIncome = tx.type === 'credit';
            const displayTitle = (tx.title || tx.category || 'Transaction').trim();
            const truncatedTitle =
              displayTitle.length > 20 ? `${displayTitle.slice(0, 18)}…` : displayTitle;

            return (
              <FlexWidget
                key={tx.id || `tx_${idx}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: 'match_parent',
                  paddingVertical: 2.5,
                  borderBottomWidth: idx < list.length - 1 ? 0.5 : 0,
                  borderColor: '#F1F5F9',
                }}
              >
                <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  {/* Category Pill */}
                  <FlexWidget
                    style={{
                      backgroundColor: isIncome ? '#F0FDF4' : '#FEF2F2',
                      borderRadius: 6,
                      paddingHorizontal: 5,
                      paddingVertical: 1.5,
                      marginRight: 6,
                    }}
                  >
                    <TextWidget
                      text={tx.category || (isIncome ? 'Income' : 'Expense')}
                      truncate="END"
                      maxLines={1}
                      style={{
                        fontSize: 8,
                        fontWeight: 'bold',
                        color: isIncome ? '#16A34A' : '#DC2626',
                      }}
                    />
                  </FlexWidget>

                  <TextWidget
                    text={truncatedTitle}
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
                  <TextWidget
                    text={tx.time ? `${tx.time}  ` : ''}
                    style={{
                      fontSize: 8.5,
                      color: '#94A3B8',
                    }}
                  />
                  <TextWidget
                    text={`${isIncome ? '+' : '-'}${formatWidgetAmount(tx.amount, currency)}`}
                    style={{
                      fontSize: 11,
                      fontWeight: 'bold',
                      color: isIncome ? '#16A34A' : '#DC2626',
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
