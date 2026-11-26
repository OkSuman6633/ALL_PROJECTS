'use client';

import type { ExtractionResult } from '@/types/assessment';

interface ExtractionReviewQueueProps {
  extractions: ExtractionResult[];
  onReextract?: () => Promise<void>;
  isBusy?: boolean;
}

export function ExtractionReviewQueue({ extractions, onReextract, isBusy }: ExtractionReviewQueueProps) {
  if (!extractions || extractions.length === 0) return null;

  return (
    <div className="source-list">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Suggested activities</strong>
        {onReextract && (
          <button
            type="button"
            className="secondary"
            style={{ fontSize: '12px', padding: '4px 8px' }}
            disabled={isBusy}
            onClick={onReextract}
          >
            ↻ Re-extract files
          </button>
        )}
      </div>
      <p className="helper">
        Confirm valid activities to include them in calculations.
      </p>

      {extractions.map((x) => {
        let statusLabel = x.status;
        let statusBadgeClass = 'review';

        if (x.status === 'review_required' && !x.fallback_provider) {
          statusLabel = 'Extraction successful';
          statusBadgeClass = 'confirmed';
        } else if (x.fallback_provider || (x.status === 'manual_review_required' && (x.activities?.length ?? 0) > 0)) {
          statusLabel = 'Needs review';
          statusBadgeClass = 'review';
        } else if (x.status === 'provider_error' || x.status === 'failed') {
          statusLabel = 'Extraction failed';
          statusBadgeClass = 'conflict';
        } else if (x.status === 'manual_review_required') {
          statusLabel = 'Manual review required';
          statusBadgeClass = 'review';
        }

        return (
          <div key={x.source_id} className="extraction-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div>
                <span className={`status ${statusBadgeClass}`}>{statusLabel}</span>
              </div>
            </div>

            {(x.questions || []).map((q: string, i: number) => (
              <p className="helper" key={`q-${i}`} style={{ margin: '2px 0', color: 'var(--text-secondary, #475569)' }}>
                • {q}
              </p>
            ))}

            {(x.activities && x.activities.length > 0) && (
              <div style={{ marginTop: '8px', padding: '6px 8px', background: 'rgba(0,0,0,0.02)', borderRadius: '4px' }}>
                <small style={{ fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Suggested Activities ({x.activities.length}):
                </small>
                {x.activities.map((candidate, i: number) => {
                  const vol = candidate.monthly_volume ?? '—';
                  const mins = candidate.minutes_per_unit ?? '—';
                  const rate = candidate.hourly_rate ?? '—';
                  return (
                    <div key={`c-${i}`} style={{ fontSize: '12px', margin: '3px 0' }}>
                      <strong>{candidate.label || 'Unnamed activity'}</strong>: {vol} cases/mo · {mins} min/case · {rate}/hr
                    </div>
                  );
                })}
              </div>
            )}

            {x.note && (
              <small style={{ display: 'block', marginTop: '6px', color: 'var(--muted)' }}>
                Note: {x.note}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}
