'use client';

import React from 'react';
import Link from 'next/link';
import { useAssessmentContext } from '@/components/assessment/AssessmentContext';
import {
  RecommendationsIcon,
  ChevronRight,
  InfoIcon,
  PlayIcon,
} from '@/components/icons';
import { formatCurrency, formatHours } from '@/lib/formatters';

export default function RecommendationsStagePage() {
  const { assessment, isBusy, runAnalysis } = useAssessmentContext();

  if (!assessment) return null;

  const calculations = assessment.calculations;
  const currency = calculations?.currency || assessment.currency || 'GBP';
  const recommendations = calculations?.recommendations || [];
  const scenarios = calculations?.scenarios || {};
  const limitations = calculations?.limitations || [];
  const eligibleCount = calculations?.calculation_eligible_activity_count ?? 0;
  const canShowAuthoritativeResults = Boolean(calculations && eligibleCount > 0);

  return (
    <div>
      {/* Header */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Improvement opportunities</div>
            <div className="card-subtitle">
              Potential capacity release from confirmed activities.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={runAnalysis}
            disabled={isBusy}
          >
            <PlayIcon size={14} />
            <span>Recalculate results</span>
          </button>
        </div>
      </div>

      {!canShowAuthoritativeResults ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <RecommendationsIcon size={36} />
              <div className="empty-state-title">
                {calculations ? 'Verified results are blocked' : 'Analysis not yet calculated'}
              </div>
              <div className="empty-state-desc">
                {calculations
                  ? 'The server reports no calculation-eligible, human-confirmed activities. Review and explicitly confirm valid facts before using recommendations or scenarios.'
                  : 'Add evidence, review extracted facts, and explicitly confirm valid activities before calculating recommendations.'}
              </div>
              <Link
                href={`/assessments/${assessment.id}`}
                className="btn btn-primary btn-sm"
              >
                Go to diagnostic review
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Capacity Scenarios Section */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <div className="card-title">Capacity Release Scenarios</div>
                <div className="card-subtitle">
                  Potential hours released under different efficiency assumptions.
                </div>
              </div>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                {Object.entries(scenarios).map(([key, item]) => {
                  const pct = Math.min(100, Math.max(0, Number(item.assumed_reduction_pct) || 0));
                  return (
                    <div
                      key={key}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-canvas)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--brand-navy)', textTransform: 'capitalize' }}>
                          {key} Scenario
                        </span>
                        <span className="badge badge-info" style={{ fontSize: '10.5px' }}>
                          {item.assumed_reduction_pct}% reduction
                        </span>
                      </div>
                      <div className="tabular-nums" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--brand-teal)' }}>
                        {formatHours(item.capacity_hours_released)} hrs/yr
                      </div>
                      <div className="tabular-nums" style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px', marginBottom: '12px' }}>
                        {formatCurrency(item.capacity_value, currency)} capacity value
                      </div>
                      <div style={{ height: '5px', background: 'var(--border-default)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${pct * 2}%`,
                            height: '100%',
                            background: 'var(--brand-teal)',
                            borderRadius: '3px',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Crucial Enterprise Disclaimer */}
              <div
                style={{
                  marginTop: '16px',
                  padding: '10px 14px',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <InfoIcon size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
                <strong>Important:</strong> Capacity release is time returned for higher-value work, not guaranteed or realized cash savings.
              </div>
            </div>
          </div>

          {/* Recommendations List */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <div className="card-title">Recommendations ({recommendations.length})</div>
              </div>
            </div>
            <div className="card-body" style={{ padding: '16px 20px' }}>
              {recommendations.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px' }}>
                  <div className="empty-state-title">No specific recommendations generated</div>
                  <div className="empty-state-desc">
                    No recommendations based on the current baseline.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {recommendations.map((rec, idx) => (
                    <div
                      key={`${rec.id}-${idx}`}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        background: '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--brand-navy)' }}>
                            {rec.title}
                          </span>
                          {rec.activity && (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              · Step: <strong>{rec.activity}</strong>
                            </span>
                          )}
                        </div>
                        <span className={`badge ${rec.priority === 'investigate' ? 'badge-info' : 'badge-warning'}`}>
                          {rec.priority.toUpperCase()}
                        </span>
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        {rec.rationale}
                      </p>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                        <div>
                          <strong>Confidence:</strong> {rec.confidence}
                        </div>
                        <div>
                          <strong>Supporting Evidence:</strong>{' '}
                          {rec.evidence.length > 0 ? (
                            <span style={{ color: 'var(--brand-teal)' }}>{rec.evidence.join(', ')}</span>
                          ) : (
                            <span style={{ color: 'var(--warning)' }}>No explicit file link</span>
                          )}
                        </div>
                        {rec.evidence_gap && (
                          <div style={{ color: 'var(--warning)', fontWeight: 500 }}>
                            ⚠ Evidence gap: attach supporting logs or procedures to verify
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {limitations.length > 0 && (
                <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Methodology Limitations & Exclusions
                  </div>
                  <ul style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, paddingLeft: '18px' }}>
                    {limitations.map((lim, idx) => (
                      <li key={idx}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="card-footer">
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Review findings before approving the report.
              </div>
              <Link
                href={`/assessments/${assessment.id}/report`}
                className="btn btn-primary btn-sm"
              >
                <span>Next: Diagnostic Report</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
