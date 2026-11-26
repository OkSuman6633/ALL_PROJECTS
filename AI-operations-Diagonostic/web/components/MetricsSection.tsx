'use client';

import { formatCurrency, formatHours } from '@/lib/formatters';
import type { CalculationsResult } from '@/types/assessment';

interface MetricsSectionProps {
  calculations: CalculationsResult;
  totalActivitiesCount: number;
}

export function MetricsSection({ calculations, totalActivitiesCount }: MetricsSectionProps) {
  return (
    <div className="metrics">
      <div className="metric">
        <span>Annual handling effort</span>
        <strong>
          {formatHours(calculations.annual_hours)}
          <small> hrs</small>
        </strong>
      </div>

      <div className="metric">
        <span>Annual effort cost</span>
        <strong>
          {formatCurrency(calculations.annual_effort_cost, calculations.currency)}
        </strong>
      </div>

      <div className="metric">
        <span>Confirmed inputs</span>
        <strong>
          {calculations.confirmed_activity_count}
          <small> / {totalActivitiesCount}</small>
        </strong>
      </div>
    </div>
  );
}
