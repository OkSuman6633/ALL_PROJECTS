'use client';

import type { RecommendationItem } from '@/types/assessment';

interface RecommendationsSectionProps {
  recommendations: RecommendationItem[];
}

export function RecommendationsSection({ recommendations }: RecommendationsSectionProps) {
  if (!recommendations || recommendations.length === 0) return null;

  return (
    <>
      <div className="scenario-head">
        <h4>Recommendations to investigate</h4>
        <span className="muted">Transparent rule-based hypotheses</span>
      </div>

      <div className="recommendations">
        {recommendations.map((rec) => (
          <div className="recommendation" key={rec.id}>
            <span className="status review">{rec.priority}</span>
            <div>
              <strong>{rec.title}</strong>
              <p>{rec.rationale}</p>
              {rec.evidence_gap && (
                <small>Evidence gap: attach a source or measurement reference.</small>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="disclaimer">
        Capacity value is not realised cash savings. Calculations include confirmed inputs only.
        Scenarios are assumptions, not forecasts or guarantees.
      </p>
    </>
  );
}
