'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAssessmentContext } from '@/components/assessment/AssessmentContext';
import {
  DownloadIcon,
  CheckIcon,
  ShieldIcon,
} from '@/components/icons';
import { canAlignCurrency, getEvidenceLocation } from '@/lib/diagnosticWorkflow';
import { formatCurrency, formatHours, formatNumber } from '@/lib/formatters';

export default function ReportStagePage() {
  const {
    assessment,
    isBusy,
    approveReport,
    downloadPdf,
    alignCurrency,
  } = useAssessmentContext();

  const [acknowledgeCurrencyMismatch, setAcknowledgeCurrencyMismatch] = useState(false);

  if (!assessment) return null;

  const calculations = assessment.calculations;
  const currency = calculations?.currency || assessment.currency || 'GBP';
  const eligibleCount = calculations?.calculation_eligible_activity_count ?? 0;
  const hasEligibleActivities = eligibleCount > 0;
  const isApproved = assessment.report_ready && hasEligibleActivities;

  const hasUnconfirmedFacts = Boolean(
    calculations && calculations.unconfirmed_activity_count > 0
  );
  const hasCurrencyMismatch = Boolean(calculations?.currency_mismatch);
  const hasInvalidActivities = Boolean(
    calculations && (calculations.invalid_activity_count || 0) > 0
  );

  const canApprove =
    !isBusy &&
    Boolean(calculations) &&
    hasEligibleActivities &&
    !hasUnconfirmedFacts &&
    !hasInvalidActivities &&
    (!hasCurrencyMismatch || acknowledgeCurrencyMismatch) &&
    !isApproved;

  const confirmedActivities = (calculations?.activities || []).filter(
    (activity) => activity.confirmed && !activity.rejected && activity.is_calculation_eligible === true
  );

  return (
    <div>
      {/* Stage Header */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Diagnostic report</div>
            <div className="card-subtitle">
              Review results, resolve blockers, then approve or export the PDF.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isApproved ? (
              <>
                <span className="badge badge-success" style={{ padding: '6px 12px' }}>
                  <CheckIcon size={14} />
                  <span>Report Approved</span>
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={downloadPdf}
                  disabled={isBusy || !hasEligibleActivities}
                >
                  <DownloadIcon size={14} />
                  <span>Export Diagnostic PDF</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={approveReport}
                disabled={!canApprove}
                title={
                  !canApprove
                    ? 'Resolve pending validation or confirmation requirements before approval'
                    : 'Approve finalized diagnostic report'
                }
              >
                <ShieldIcon size={14} />
                <span>Approve report</span>
              </button>
            )}
          </div>
        </div>

        {/* Approval Gate Status Banner */}
        {assessment.report_ready && !hasEligibleActivities && (
          <div className="alert-banner alert-banner-error" role="alert" style={{ marginBottom: '16px' }}>
            Approval cannot be validated because no eligible, confirmed activities were found.
          </div>
        )}
        <div className="card-body" style={{ background: isApproved ? 'var(--success-bg)' : 'var(--bg-subtle)', borderBottom: '1px solid var(--border-default)' }}>
          {isApproved ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ color: 'var(--success)' }}>
                <CheckIcon size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--success)' }}>
                  Diagnostic Report Approved
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  This assessment passed review and data-quality checks and is ready to download.
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--brand-navy)', marginBottom: '4px' }}>
                Approval status
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Only reviewer-confirmed facts are treated as verified.
              </div>

              {/* Blocking Issues */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {!calculations && (
                  <div style={{ fontSize: '12px', color: 'var(--error)' }}>
                    ✕ Run analysis before approving the report.
                  </div>
                )}
                {calculations && !hasEligibleActivities && (
                  <div style={{ fontSize: '12px', color: 'var(--error)' }}>
                    ✕ Confirm at least one valid activity before calculating or approving the report.
                  </div>
                )}
                {hasUnconfirmedFacts && (
                  <div style={{ fontSize: '12px', color: 'var(--warning)' }}>
                    ⚠ Suggested activities remain unconfirmed ({calculations?.unconfirmed_activity_count}): Confirm or reject them before approval.
                  </div>
                )}
                {hasInvalidActivities && (
                  <div style={{ fontSize: '12px', color: 'var(--error)' }}>
                    ✕ Fix missing rates or negative volumes before approval.
                  </div>
                )}
                {hasCurrencyMismatch && (
                  <div style={{ fontSize: '12px', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>⚠ Evidence currency mismatch ({calculations?.currency} vs {assessment.currency || 'GBP'}):</span>
                    {calculations?.currency === 'MIXED' && (
                      <span>
                        Multiple currencies were detected. Update activity currencies or acknowledge the mismatch below.
                      </span>
                    )}
                    {canAlignCurrency(calculations?.currency) && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => alignCurrency(calculations.currency)}
                        disabled={isBusy}
                      >
                        Align to {calculations.currency}
                      </button>
                    )}
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', marginLeft: '12px' }}>
                      <input
                        type="checkbox"
                        checked={acknowledgeCurrencyMismatch}
                        onChange={(e) => setAcknowledgeCurrencyMismatch(e.target.checked)}
                      />
                      <span>Acknowledge mismatch as reviewer assumption</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Professional Diagnostic Report Preview */}
      <div className="card" style={{ maxWidth: '960px', margin: '0 auto', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ padding: '36px 40px', borderBottom: '2px solid var(--border-default)', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand-teal)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Diagnostic report
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--brand-navy)', marginTop: '4px' }}>
                {assessment.process_name}
              </h2>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Sector: {assessment.sector} · Evaluation Period: {assessment.period} · Unit: {assessment.unit}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span className={`badge ${isApproved ? 'badge-success' : 'badge-neutral'}`}>
                {isApproved ? 'Approved Report' : 'Draft Assessment'}
              </span>
            </div>
          </div>

          {/* Sandbox Watermark if in Sandbox */}
          {assessment.is_sandbox && (
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--sandbox-bg)',
                border: '1px solid var(--sandbox-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--brand-navy)',
                fontSize: '12px',
                marginBottom: '20px',
              }}
            >
              <strong>*** TEST / SANDBOX REPORT — NOT FOR PRODUCTION USE ***</strong>
              <div>This report was generated using synthetic simulation data in an isolated testing environment.</div>
            </div>
          )}

          {/* Section 1: Executive Summary */}
          <div style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '8px' }}>
              1. Executive Summary
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Results use reviewer-confirmed activities; capacity release is potential time, not guaranteed cash savings.
            </p>
          </div>

          {!hasEligibleActivities && (
            <div className="alert-banner alert-banner-warning" role="alert" style={{ marginBottom: '20px' }}>
              Results are unavailable until at least one valid activity is confirmed.
            </div>
          )}

          {/* Section 2: Current Operational Baseline KPI Highlights */}
          {hasEligibleActivities && <div style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '12px' }}>
              2. Verified baseline
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ padding: '14px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Annual Handling Time</div>
                <div className="tabular-nums" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--brand-navy)', marginTop: '4px' }}>
                  {calculations?.annual_hours ? `${formatHours(calculations.annual_hours)} hrs` : '0.0 hrs'}
                </div>
              </div>
              <div style={{ padding: '14px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Annual Labour Effort Cost</div>
                <div className="tabular-nums" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--brand-navy)', marginTop: '4px' }}>
                  {calculations?.annual_effort_cost ? formatCurrency(calculations.annual_effort_cost, currency) : `${currency} 0.00`}
                </div>
              </div>
              <div style={{ padding: '14px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Verified Activities</div>
                <div className="tabular-nums" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--brand-navy)', marginTop: '4px' }}>
                  {eligibleCount} eligible confirmed
                </div>
              </div>
            </div>
          </div>}

          {/* Section 3: Process Activity Breakdown Table */}
          {hasEligibleActivities && <div style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '12px' }}>
              3. Activities
            </h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Activity Step</th>
                  <th>Monthly Volume</th>
                  <th>Time / Unit</th>
                  <th>Hourly Rate</th>
                  <th>Annual Hours</th>
                  <th>Annual Cost</th>
                </tr>
              </thead>
              <tbody>
                {confirmedActivities.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No confirmed activities in this assessment.
                    </td>
                  </tr>
                ) : (
                  confirmedActivities.map((act) => (
                    <tr key={act.activity_id}>
                      <td style={{ fontWeight: 600 }}>{act.label}</td>
                      <td className="tabular-nums">{act.monthly_volume !== null ? formatNumber(act.monthly_volume) : 'Not provided'}</td>
                      <td className="tabular-nums">{act.minutes_per_unit !== null ? `${act.minutes_per_unit} min` : 'Not provided'}</td>
                      <td className="tabular-nums">{act.hourly_rate !== null ? formatCurrency(act.hourly_rate, act.currency || currency) : 'Not provided'}</td>
                      <td className="tabular-nums">{act.annual_hours ? `${act.annual_hours} h` : '—'}</td>
                      <td className="tabular-nums">{act.annual_effort_cost ? formatCurrency(act.annual_effort_cost, act.currency || currency) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>}

          {/* Section 4: Evidence Summary */}
          <div style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '8px' }}>
              4. Supporting Documents
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(assessment.uploads || []).length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>No evidence files attached.</div>
              ) : (
                assessment.uploads.map((u) => (
                  <div key={u.id} style={{ padding: '8px 12px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontWeight: 600 }}>{u.filename} ({u.kind.toUpperCase()})</span>
                    </div>
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: 'var(--text-secondary)' }}>
                      {assessment.activities.filter((activity) => activity.source_ids?.some((source) => source === u.id || source.startsWith(`${u.id}:`))).map((activity) => (
                        <li key={activity.activity_id}>
                          {activity.label} — {getEvidenceLocation(activity)}
                          {typeof activity.provenance?.filename === 'string'
                            ? ` · ${activity.provenance.filename}`
                            : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Source excerpts are unavailable. Unverified PDF page references are not treated as confirmed.
              </div>
            </div>
          </div>

          {/* Section 5: Improvement Hypotheses & Scenarios */}
          {hasEligibleActivities && <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--brand-navy)', marginBottom: '8px' }}>
              5. Recommendations & scenarios
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(calculations?.recommendations || []).map((r, i) => (
                <div key={i} style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--brand-navy)' }}>{r.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{r.rationale}</div>
                </div>
              ))}
            </div>
          </div>}
        </div>

        {/* Action Bottom Toolbar */}
        <div className="card-footer">
          <Link href={`/assessments/${assessment.id}/recommendations`} className="btn btn-secondary btn-sm">
            <span>‹ Back to Recommendations</span>
          </Link>
          {isApproved && (
            <button type="button" className="btn btn-primary btn-sm" onClick={downloadPdf}>
              <DownloadIcon size={14} />
              <span>Download Signed Diagnostic PDF</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
