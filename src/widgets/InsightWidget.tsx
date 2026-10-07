import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';

export interface InsightWidgetProps {
  thisMonthSpent?: number;
  monthlyBudget?: number;
  budgetPercentage?: number;
  remainingMonthlyBudget?: number | null;
  todaySpent?: number;
  currency?: string;
}

const RUPEO_LOGO_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#1C1C1E"/><path d="M7 6h10M7 10h8M7 6v12M12 10a4 4 0 0 1 0 8H7" stroke="#FFD740" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CHART_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;

const PLUS_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

function formatAmount(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-IN');
}

export function InsightWidget({
  thisMonthSpent = 0,
  monthlyBudget = 0,
  budgetPercentage = 0,
  remainingMonthlyBudget = null,
  todaySpent = 0,
  currency = '₹',
}: InsightWidgetProps) {
  const pct = Math.min(100, Math.max(0, budgetPercentage || 0));

  let progressColor: `#${string}` = '#10B981';
  let statusBadgeBg: `#${string}` = '#DCFCE7';
  let statusBadgeBorder: `#${string}` = '#86EFAC';
  let statusBadgeText: `#${string}` = '#15803D';
  let statusLabel = 'ON TRACK';

  if (monthlyBudget > 0) {
    if (pct > 90) {
      progressColor = '#EF4444';
      statusBadgeBg = '#FEE2E2';
      statusBadgeBorder = '#FCA5A5';
      statusBadgeText = '#991B1B';
      statusLabel = 'ALERT';
    } else if (pct > 75) {
      progressColor = '#F59E0B';
      statusBadgeBg = '#FEF3C7';
      statusBadgeBorder = '#FDE68A';
      statusBadgeText = '#B45309';
      statusLabel = 'WARNING';
    }
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: {
          from: '#FFFFFF',
          to: '#F8FAFC',
          orientation: 'TOP_BOTTOM',
        },
        borderRadius: 22,
        borderWidth: 1.2,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* 1. Header Row: Rupeo Branding & Month Overview Badge */}
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
          clickActionData={{ uri: 'rupeo://(tabs)/ai_insights' }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#F1F5F9',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            paddingHorizontal: 8,
            paddingVertical: 3.5,
          }}
        >
          <SvgWidget svg={RUPEO_LOGO_SVG} style={{ width: 14, height: 14, marginRight: 5 }} />
          <TextWidget
            text="INSIGHTS"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 1,
            }}
          />
        </FlexWidget>

        {monthlyBudget > 0 ? (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'rupeo://(tabs)/ai_insights' }}
            style={{
              backgroundColor: statusBadgeBg,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: statusBadgeBorder,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <TextWidget
              text={`${pct}% • ${statusLabel}`}
              style={{
                fontSize: 9.5,
                fontWeight: 'bold',
                color: statusBadgeText,
                letterSpacing: 0.3,
              }}
            />
          </FlexWidget>
        ) : (
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'rupeo://(tabs)/ai_insights' }}
            style={{
              backgroundColor: '#EEF2FF',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#E0E7FF',
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <TextWidget
              text="THIS MONTH"
              style={{
                fontSize: 9.5,
                fontWeight: 'bold',
                color: '#4F46E5',
                letterSpacing: 0.4,
              }}
            />
          </FlexWidget>
        )}
      </FlexWidget>

      {/* 2. Middle Row: Monthly Spend vs Budget */}
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'rupeo://(tabs)/ai_insights' }}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          paddingVertical: 2,
        }}
      >
        {/* Left Column: Month Spent */}
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text="THIS MONTH SPENT"
            style={{
              fontSize: 9,
              fontWeight: 'bold',
              color: '#64748B',
              letterSpacing: 0.7,
            }}
          />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
            <TextWidget
              text={`${currency} `}
              style={{
                fontSize: 14,
                fontWeight: 'bold',
                color: '#F59E0B',
              }}
            />
            <TextWidget
              text={formatAmount(thisMonthSpent)}
              style={{
                fontSize: 22,
                fontWeight: 'bold',
                color: '#0F172A',
              }}
            />
          </FlexWidget>
        </FlexWidget>

        {/* Right Column: Monthly Budget or Today */}
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
          <TextWidget
            text={monthlyBudget > 0 ? 'MONTHLY BUDGET' : "TODAY'S SPENT"}
            style={{
              fontSize: 9,
              fontWeight: 'bold',
              color: '#64748B',
              letterSpacing: 0.7,
            }}
          />
          <TextWidget
            text={`${currency}${formatAmount(monthlyBudget > 0 ? monthlyBudget : todaySpent)}`}
            style={{
              fontSize: 16,
              fontWeight: 'bold',
              color: '#475569',
              marginTop: 2,
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* 3. Progress Bar (if budget is set) */}
      {monthlyBudget > 0 && (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://(tabs)/ai_insights' }}
          style={{
            flexDirection: 'column',
            width: 'match_parent',
          }}
        >
          <FlexWidget
            style={{
              width: 'match_parent',
              height: 6,
              backgroundColor: '#E2E8F0',
              borderRadius: 3,
              flexDirection: 'row',
            }}
          >
            <FlexWidget
              style={{
                flex: Math.max(1, pct),
                height: 'match_parent',
                backgroundColor: progressColor,
                borderRadius: 3,
              }}
            />
            <FlexWidget
              style={{
                flex: Math.max(0, 100 - pct),
                height: 'match_parent',
              }}
            />
          </FlexWidget>

          <FlexWidget
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 3,
            }}
          >
            <TextWidget
              text={`${pct}% of budget used`}
              style={{
                fontSize: 9,
                color: '#64748B',
                fontWeight: 'bold',
              }}
            />
            <TextWidget
              text={
                remainingMonthlyBudget !== null && remainingMonthlyBudget > 0
                  ? `${currency}${formatAmount(remainingMonthlyBudget)} left`
                  : 'Over budget'
              }
              style={{
                fontSize: 9,
                fontWeight: 'bold',
                color: remainingMonthlyBudget && remainingMonthlyBudget > 0 ? '#15803D' : '#DC2626',
              }}
            />
          </FlexWidget>
        </FlexWidget>
      )}

      {/* 4. Bottom Action Buttons: View Reports + Quick Add */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          flexGap: 8,
        }}
      >
        {/* Reports Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://(tabs)/ai_insights' }}
          style={{
            flex: 1,
            height: 36,
            backgroundColor: '#EEF2FF',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#C7D2FE',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={CHART_SVG} style={{ width: 12, height: 12, marginRight: 5 }} />
          <TextWidget
            text="Reports"
            style={{
              fontSize: 11.5,
              fontWeight: 'bold',
              color: '#4F46E5',
            }}
          />
        </FlexWidget>

        {/* Add Entry Button */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://add' }}
          style={{
            flex: 1,
            height: 36,
            backgroundColor: '#1E293B',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#0F172A',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <SvgWidget svg={PLUS_SVG} style={{ width: 11, height: 11, marginRight: 4 }} />
          <TextWidget
            text="Add Entry"
            style={{
              fontSize: 11.5,
              fontWeight: 'bold',
              color: '#FFFFFF',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
