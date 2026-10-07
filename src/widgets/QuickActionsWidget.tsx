import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';

export interface QuickActionsWidgetProps {
  currency?: string;
}

const RUPEO_LOGO_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#1C1C1E"/><path d="M7 6h10M7 10h8M7 6v12M12 10a4 4 0 0 1 0 8H7" stroke="#FFD740" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const MINUS_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="3" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

const PLUS_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

const MIC_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

const RECEIPT_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>`;

export function QuickActionsWidget(_props: QuickActionsWidgetProps) {
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
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* 1. Header: Rupeo Branding & Quick Actions Tag */}
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
          clickActionData={{ uri: 'rupeo://(tabs)/dashboard' }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#F1F5F9',
            borderRadius: 9,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            paddingHorizontal: 7,
            paddingVertical: 3,
          }}
        >
          <SvgWidget svg={RUPEO_LOGO_SVG} style={{ width: 13, height: 13, marginRight: 4 }} />
          <TextWidget
            text="RUPEO"
            style={{
              fontSize: 9.5,
              fontWeight: 'bold',
              color: '#0F172A',
              letterSpacing: 0.8,
            }}
          />
        </FlexWidget>

        <TextWidget
          text="1-TAP ACTIONS"
          style={{
            fontSize: 9,
            fontWeight: 'bold',
            color: '#64748B',
            letterSpacing: 0.5,
          }}
        />
      </FlexWidget>

      {/* 2. 4 Fast Action Buttons */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
          flexGap: 6,
        }}
      >
        {/* Expense */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=expense&fromWidget=1' }}
          style={{
            flex: 1,
            height: 44,
            backgroundColor: '#FEF2F2',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#FECACA',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 4,
          }}
        >
          <SvgWidget svg={MINUS_SVG} style={{ width: 12, height: 12 }} />
          <TextWidget
            text="Expense"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#DC2626',
              marginTop: 2,
            }}
          />
        </FlexWidget>

        {/* Income */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add?type=income&fromWidget=1' }}
          style={{
            flex: 1,
            height: 44,
            backgroundColor: '#F0FDF4',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#BBF7D0',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 4,
          }}
        >
          <SvgWidget svg={PLUS_SVG} style={{ width: 12, height: 12 }} />
          <TextWidget
            text="Income"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#16A34A',
              marginTop: 2,
            }}
          />
        </FlexWidget>

        {/* Voice */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://quick-add-voice?fromWidget=1' }}
          style={{
            flex: 1,
            height: 44,
            backgroundColor: '#EEF2FF',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#C7D2FE',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 4,
          }}
        >
          <SvgWidget svg={MIC_SVG} style={{ width: 12, height: 12 }} />
          <TextWidget
            text="Voice"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#4F46E5',
              marginTop: 2,
            }}
          />
        </FlexWidget>

        {/* History */}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'rupeo://(tabs)/transactions' }}
          style={{
            flex: 1,
            height: 44,
            backgroundColor: '#F8FAFC',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 4,
          }}
        >
          <SvgWidget svg={RECEIPT_SVG} style={{ width: 12, height: 12 }} />
          <TextWidget
            text="History"
            style={{
              fontSize: 10,
              fontWeight: 'bold',
              color: '#334155',
              marginTop: 2,
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
