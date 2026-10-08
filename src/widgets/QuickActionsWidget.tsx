import React from 'react';
import type { WidgetSnapshot } from '@/lib/widgetSnapshot';
import { QuickAddWidget } from './QuickAddWidget';

export interface QuickActionsWidgetProps {
  snapshot?: WidgetSnapshot | null;
  currency?: string;
}

/**
 * QuickActionsWidget - Backward-compatible wrapper mapping to QuickAddWidget (4x1)
 */
export function QuickActionsWidget({ snapshot, currency = '₹' }: QuickActionsWidgetProps) {
  return <QuickAddWidget snapshot={snapshot} currency={currency} />;
}
