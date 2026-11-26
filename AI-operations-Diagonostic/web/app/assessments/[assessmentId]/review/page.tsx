'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAssessmentContext } from '@/components/assessment/AssessmentContext';
import {
  FileTextIcon,
  PlayIcon,
  RefreshIcon,
  CheckIcon,
  AlertTriangleIcon,
  InfoIcon,
  ChevronRight,
  TrashIcon,
} from '@/components/icons';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { canAlignCurrency } from '@/lib/diagnosticWorkflow';
import type { Activity } from '@/types/assessment';

export default function ReviewStagePage() {
  const {
    assessment,
    isBusy,
    toggleConfirmFact,
    updateActivity,
    removeActivity,
    alignCurrency,
    runAnalysis,
    reextract,
  } = useAssessmentContext();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    label: string;
    monthly_volume: string;
    minutes_per_unit: string;
    hourly_rate: string;
    currency: string;
  }>({
    label: '',
    monthly_volume: '',
    minutes_per_unit: '',
    hourly_rate: '',
    currency: '',
  });

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  if (!assessment) return null;

  const activities = assessment.activities || [];
  const uploads = assessment.uploads || [];
  const extractions = assessment.extraction || [];
  const targetCurrency = assessment.currency || 'GBP';
  const calculations = assessment.calculations;

  const hasCurrencyMismatch = Boolean(calculations?.currency_mismatch);
  const detectedCurrency = calculations?.currency;

  const startEdit = (a: Activity) => {
    setEditingId(a.activity_id);
    setEditValues({
      label: a.label,
      monthly_volume: a.monthly_volume !== null && a.monthly_volume !== undefined ? String(a.monthly_volume) : '',
      minutes_per_unit: a.minutes_per_unit !== null && a.minutes_per_unit !== undefined ? String(a.minutes_per_unit) : '',
      hourly_rate: a.hourly_rate !== null && a.hourly_rate !== undefined ? String(a.hourly_rate) : '',
      currency: a.currency || targetCurrency,
    });
  };

  const saveEdit = async (activityId: string) => {
    const vol = editValues.monthly_volume.trim() !== '' && !isNaN(Number(editValues.monthly_volume))
      ? parseFloat(editValues.monthly_volume)
      : null;
    const mins = editValues.minutes_per_unit.trim() !== '' && !isNaN(Number(editValues.minutes_per_unit))
      ? parseFloat(editValues.minutes_per_unit)
      : null;
    const rate = editValues.hourly_rate.trim() !== '' && !isNaN(Number(editValues.hourly_rate))
      ? parseFloat(editValues.hourly_rate)
      : null;
    await updateActivity(activityId, {
      label: editValues.label.trim(),
      monthly_volume: vol,
      minutes_per_unit: mins,
      hourly_rate: rate,
      currency: editValues.currency.trim().toUpperCase() || targetCurrency,
    });
    setEditingId(null);
  };

  return (
    <div>
      {/* Currency Mismatch Alert Banner */}
      {hasCurrencyMismatch && detectedCurrency && (
        <div className="alert-banner alert-banner-warning">
          <AlertTriangleIcon size={18} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>
              Currency Discrepancy Detected
            </div>
            <div style={{ fontSize: '12.5px' }}>
              Assessment is configured for <strong>{targetCurrency}</strong>, but evidence sources contain rates in{' '}
              <strong>{detectedCurrency}</strong>. Approval is blocked until currencies are aligned or the difference is acknowledged.
              {detectedCurrency === 'MIXED' && ' Update individual activity currencies here; mixed evidence cannot be aligned to one currency.'}
            </div>
          </div>
          {canAlignCurrency(detectedCurrency) && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => alignCurrency(detectedCurrency)}
              disabled={isBusy}
            >
              Align to {detectedCurrency}
            </button>
          )}
        </div>
      )}

      {/* Action Header */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Review activities</div>
            <div className="card-subtitle">
              Confirm valid activities to include them in calculations.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={reextract}
              disabled={isBusy || uploads.length === 0}
            >
              <RefreshIcon size={14} />
              <span>Refresh suggestions</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={runAnalysis}
              disabled={isBusy}
            >
              <PlayIcon size={14} />
              <span>Calculate results ↗</span>
            </button>
          </div>
        </div>
      </div>

      {/* Three Conceptual Areas Layout */}
      <div className="review-grid">
        {/* Panel A: Evidence Documents */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Evidence Files</div>
            </div>
            <Link href={`/assessments/${assessment.id}/evidence`} className="btn btn-ghost btn-sm">
              <span>+ Add</span>
            </Link>
          </div>
          <div className="card-body" style={{ padding: '12px' }}>
            {uploads.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 12px' }}>
                <FileTextIcon size={28} />
                <div className="empty-state-title" style={{ fontSize: '13px' }}>No evidence files</div>
                <div className="empty-state-desc" style={{ fontSize: '11.5px' }}>
                  Upload a PDF procedure or CSV log to support activity details.
                </div>
              </div>
            ) : (
              uploads.map((file) => {
                const isSelected = selectedFileId === file.id;
                return (
                  <div
                    key={file.id}
                    className="evidence-source-card"
                    style={{
                      borderColor: isSelected ? 'var(--brand-teal)' : 'var(--border-default)',
                      background: isSelected ? 'var(--bg-subtle)' : '#ffffff',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedFileId(isSelected ? null : file.id)}
                  >
                    <div className="evidence-source-header">
                      <span className="evidence-source-title">{file.filename}</span>
                      <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                        {file.kind.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Panel B: Extracted Candidate Records */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Suggested Activities</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: '12px' }}>
            <div
              style={{
                fontSize: '11.5px',
                color: 'var(--text-muted)',
                padding: '8px 10px',
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '12px',
                border: '1px solid var(--border-default)',
              }}
            >
              <InfoIcon size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
              <strong>Needs your review:</strong> Suggested values are preliminary and are not used in calculations until confirmed.
            </div>

            {extractions.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 12px' }}>
                <div className="empty-state-title" style={{ fontSize: '13px' }}>No candidates extracted</div>
                <div className="empty-state-desc" style={{ fontSize: '11.5px' }}>
                  Upload a PDF procedure or CSV log to see suggested activities.
                </div>
              </div>
            ) : (
              extractions.flatMap((ext) =>
                (ext.activities || []).map((cand, idx) => (
                  <div key={`${ext.source_id}-${idx}`} className="candidate-card">
                    <div className="candidate-header">
                      <span className="candidate-title">{cand.label || 'Unnamed Step'}</span>
                      <span className="badge badge-info" style={{ fontSize: '10px' }}>
                        {cand.confidence || 'inferred'}
                      </span>
                    </div>
                    <div className="candidate-meta">
                      <div>Volume: {cand.monthly_volume !== null && cand.monthly_volume !== undefined ? String(cand.monthly_volume) : 'Not provided'}</div>
                      <div>Time: {cand.minutes_per_unit !== null && cand.minutes_per_unit !== undefined ? `${cand.minutes_per_unit} min` : 'Not provided'}</div>
                      <div>Rate: {cand.hourly_rate !== null && cand.hourly_rate !== undefined ? String(cand.hourly_rate) : 'Not provided'}</div>
                    </div>
                    {uploads.find((file) => file.id === ext.source_id)?.filename && (
                      <div style={{ fontSize: '10.5px', color: 'var(--brand-teal)', marginTop: '4px' }}>
                        From: {uploads.find((file) => file.id === ext.source_id)?.filename}
                      </div>
                    )}
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* Panel C: Activity Facts & Validation Table */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Activity Details ({activities.length})</div>
              <div className="card-subtitle">
                Confirmed activities used in calculations ({calculations?.confirmed_activity_count || 0} confirmed,{' '}
                {calculations?.unconfirmed_activity_count || 0} awaiting confirmation)
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Activity Step</th>
                  <th>Monthly Volume</th>
                  <th>Handling Time</th>
                  <th>Loaded Rate</th>
                  <th>Validation Status</th>
                  <th>Reviewer Action</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => {
                  const isEditing = editingId === a.activity_id;
                  const vol = a.monthly_volume;
                  const mins = a.minutes_per_unit;
                  const rate = a.hourly_rate;
                  const isCurrencyMismatch = a.currency && targetCurrency && a.currency !== targetCurrency;

                  if (isEditing) {
                    return (
                      <tr key={a.activity_id} style={{ background: '#f8fafc' }}>
                        <td colSpan={7} style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>
                            Edit Activity Fact: {a.label}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '10px' }}>
                            <div>
                              <label className="form-label">Step Label</label>
                              <input
                                type="text"
                                className="form-control"
                                value={editValues.label}
                                onChange={(e) => setEditValues({ ...editValues, label: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="form-label">Monthly volume</label>
                              <input
                                type="number"
                                className="form-control tabular-nums"
                                value={editValues.monthly_volume}
                                placeholder="Optional"
                                onChange={(e) => setEditValues({ ...editValues, monthly_volume: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="form-label">Minutes / Case</label>
                              <input
                                type="number"
                                step="0.1"
                                className="form-control tabular-nums"
                                value={editValues.minutes_per_unit}
                                placeholder="Optional"
                                onChange={(e) => setEditValues({ ...editValues, minutes_per_unit: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="form-label">Hourly Rate</label>
                              <input
                                type="number"
                                step="0.01"
                                className="form-control tabular-nums"
                                value={editValues.hourly_rate}
                                placeholder="Optional"
                                onChange={(e) => setEditValues({ ...editValues, hourly_rate: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="form-label">Currency</label>
                              <input
                                type="text"
                                className="form-control"
                                value={editValues.currency}
                                onChange={(e) => setEditValues({ ...editValues, currency: e.target.value })}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => saveEdit(a.activity_id)}
                              disabled={isBusy}
                            >
                              Save Fact Changes
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={a.activity_id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--brand-navy)' }}>
                            {a.label}
                          </span>
                          {a.source_ids && a.source_ids.length > 0 ? (
                            <span style={{ fontSize: '11px', color: 'var(--brand-teal)' }}>
                              Evidence: {Array.from(new Set(a.source_ids
                                .map((sourceId) => uploads.find((file) => sourceId === file.id || sourceId.startsWith(`${file.id}:`))?.filename)
                                .filter((filename): filename is string => Boolean(filename)))).join(', ')}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
                              No source evidence linked
                            </span>
                          )}
                          {isCurrencyMismatch && (
                            <span style={{ fontSize: '11px', color: 'var(--warning)', fontWeight: 500 }}>
                              ⚠ Stated in {a.currency} (differs from {targetCurrency})
                            </span>
                          )}
                          {a.validation_errors && a.validation_errors.length > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--error)' }}>
                              ✕ {a.validation_errors.join('; ')}
                            </span>
                          )}
                          {a.validation_warnings && a.validation_warnings.length > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--warning)' }}>
                              ⚠ {a.validation_warnings.join('; ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="tabular-nums">
                        {vol !== null && vol !== undefined ? formatNumber(vol) : <span style={{ color: 'var(--text-faint)' }}>Not provided</span>}
                      </td>
                      <td className="tabular-nums">
                        {mins !== null && mins !== undefined ? `${mins} min` : <span style={{ color: 'var(--text-faint)' }}>Not provided</span>}
                      </td>
                      <td className="tabular-nums">
                        {rate !== null && rate !== undefined ? (
                          formatCurrency(rate, a.currency || targetCurrency)
                        ) : (
                          <span style={{ color: 'var(--text-faint)' }}>Not provided</span>
                        )}
                      </td>
                      <td>
                        {a.is_valid === false ? (
                          <span className="badge badge-error">Invalid</span>
                        ) : a.is_calculation_eligible ? (
                          <span className="badge badge-success">Eligible</span>
                        ) : (
                          <span className="badge badge-neutral">Candidate</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`btn btn-sm ${a.confirmed ? 'btn-teal' : 'btn-secondary'}`}
                          onClick={() => toggleConfirmFact(a)}
                          disabled={isBusy}
                          title={a.confirmed ? 'Click to unconfirm' : 'Click to confirm as true operational fact'}
                        >
                          {a.confirmed ? (
                            <>
                              <CheckIcon size={12} />
                              <span>Confirmed</span>
                            </>
                          ) : (
                            <span>Confirm Fact</span>
                          )}
                        </button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => startEdit(a)}
                            disabled={isBusy}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--error)' }}
                            onClick={() => removeActivity(a.activity_id)}
                            disabled={isBusy || activities.length === 1}
                            title="Remove activity"
                          >
                            <TrashIcon size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card-footer">
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              After confirming or editing facts, trigger <strong>Run Analysis</strong> to refresh calculations.
            </div>
            <Link
              href={`/assessments/${assessment.id}/recommendations`}
              className="btn btn-primary btn-sm"
            >
              <span>Next: Recommendations</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
