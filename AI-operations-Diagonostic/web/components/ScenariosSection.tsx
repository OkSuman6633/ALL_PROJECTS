'use client';

import { formatCurrency, formatHours } from '@/lib/formatters';
import type { ScenarioItem } from '@/types/assessment';

interface ScenariosSectionProps {
  scenarios: Record<string, ScenarioItem>;
  currency?: string;
}

export function ScenariosSection({ scenarios, currency = 'GBP' }: ScenariosSectionProps) {
  if (!scenarios || Object.keys(scenarios).length === 0) return null;

  return (
    <>
      <div className="scenario-head">
        <h4>Potential capacity opportunity</h4>
        <span className="muted">Illustrative assumptions</span>
      </div>

      <div className="scenarios">
        {Object.entries(scenarios).map(([key, item]) => {
          const widthPct = Math.min(100, Math.max(0, Number(item.assumed_reduction_pct) || 0));

          return (
            <div className="scenario" key={key}>
              <span>{key}</span>
              <strong>{formatHours(item.capacity_hours_released)} h</strong>
              <small>{formatCurrency(item.capacity_value, currency)} capacity value</small>

              <div className="bar">
                <i style={{ width: `${widthPct}%` }} />
              </div>

              <small>{item.assumed_reduction_pct}% assumed reduction</small>
            </div>
          );
        })}
      </div>
    </>
  );
}
