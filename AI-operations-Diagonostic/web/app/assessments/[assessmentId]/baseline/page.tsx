'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAssessmentContext } from '@/components/assessment/AssessmentContext';
import { PlusIcon, TrashIcon, ChevronRight } from '@/components/icons';
import { formatNumber, formatCurrency } from '@/lib/formatters';
import type { Activity } from '@/types/assessment';

export default function BaselineStagePage() {
  const {
    assessment,
    isBusy,
    addActivity,
    updateActivity,
    removeActivity,
    setErrorMessage,
  } = useAssessmentContext();

  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newVolume, setNewVolume] = useState('100');
  const [newMinutes, setNewMinutes] = useState('5');
  const [newRate, setNewRate] = useState('25');

  // Inline edit state for existing activity
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    label: string;
    monthly_volume: string;
    minutes_per_unit: string;
    hourly_rate: string;
  }>({ label: '', monthly_volume: '', minutes_per_unit: '', hourly_rate: '' });

  if (!assessment) return null;

  const currency = assessment.currency || 'GBP';
  const activities = assessment.activities || [];

  const handleStartEdit = (act: Activity) => {
    setEditingId(act.activity_id);
    setEditValues({
      label: act.label,
      monthly_volume: act.monthly_volume !== null ? String(act.monthly_volume) : '',
      minutes_per_unit: act.minutes_per_unit !== null ? String(act.minutes_per_unit) : '',
      hourly_rate: act.hourly_rate !== null ? String(act.hourly_rate) : '',
    });
  };

  const handleSaveEdit = async (activityId: string) => {
    const vol = editValues.monthly_volume ? parseFloat(editValues.monthly_volume) : null;
    const mins = editValues.minutes_per_unit ? parseFloat(editValues.minutes_per_unit) : null;
    const rate = editValues.hourly_rate ? parseFloat(editValues.hourly_rate) : null;

    if (!editValues.label.trim()) {
      setErrorMessage('Activity label cannot be empty.');
      return;
    }

    await updateActivity(activityId, {
      label: editValues.label.trim(),
      monthly_volume: vol,
      minutes_per_unit: mins,
      hourly_rate: rate,
      confirmed: true,
    });
    setEditingId(null);
  };

  const handleCreateActivity = async () => {
    if (!newLabel.trim()) {
      setErrorMessage('Please provide an activity name.');
      return;
    }
    const vol = newVolume ? parseFloat(newVolume) : null;
    const mins = newMinutes ? parseFloat(newMinutes) : null;
    const rate = newRate ? parseFloat(newRate) : null;

    const created = await addActivity({
      label: newLabel.trim(),
      monthly_volume: vol,
      minutes_per_unit: mins,
      hourly_rate: rate,
      currency,
      confirmed: true,
    });

    if (created) {
      setNewLabel('');
      setIsAdding(false);
    }
  };

  // Compact baseline totals summary
  const validActivities = activities.filter((a) => a.is_valid !== false && !a.rejected);
  const totalVolume = validActivities.reduce((sum, a) => sum + (a.monthly_volume || 0), 0);
  const totalHours = validActivities.reduce(
    (sum, a) => sum + ((a.monthly_volume || 0) * (a.minutes_per_unit || 0) * 12) / 60,
    0
  );
  const totalCost = validActivities.reduce((sum, a) => {
    const hrs = ((a.monthly_volume || 0) * (a.minutes_per_unit || 0) * 12) / 60;
    return sum + hrs * (a.hourly_rate || 0);
  }, 0);

  return (
    <div>
      {/* Stage Summary Banner */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Operational baseline</div>
            <div className="card-subtitle">
              Set activity volumes, handling times, and labour rates.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setIsAdding(!isAdding)}
          >
            <PlusIcon size={14} />
            <span>{isAdding ? 'Cancel' : 'Add Activity Step'}</span>
          </button>
        </div>

        {/* Optional Add Activity Card */}
        {isAdding && (
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--bg-subtle)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>
              Add New Baseline Activity
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
              <div>
                <label className="form-label">Activity Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Credit check & underwriting"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Monthly Volume</label>
                <input
                  type="number"
                  min="0"
                  className="form-control tabular-nums"
                  value={newVolume}
                  onChange={(e) => setNewVolume(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Minutes / Case</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="form-control tabular-nums"
                  value={newMinutes}
                  onChange={(e) => setNewMinutes(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Hourly Rate ({currency})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control tabular-nums"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                />
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateActivity}
                  disabled={isBusy}
                >
                  Save Step
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Structured Activities Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>Activity Step Name</th>
                <th>Monthly Cases</th>
                <th>Minutes / Case</th>
                <th>Hourly Rate ({currency})</th>
                <th>Estimated Annual Effort</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activities.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state" style={{ padding: '32px' }}>
                      <div className="empty-state-title">No baseline activities defined</div>
                      <div className="empty-state-desc">
                        Add an activity step or upload evidence.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                activities.map((act) => {
                  const isEditing = editingId === act.activity_id;
                  const vol = act.monthly_volume;
                  const mins = act.minutes_per_unit;
                  const rate = act.hourly_rate;

                  const hasMetrics = vol !== null && mins !== null;
                  const annHours = hasMetrics ? ((vol || 0) * (mins || 0) * 12) / 60 : null;
                  const annCost = annHours !== null && rate !== null ? annHours * rate : null;

                  if (isEditing) {
                    return (
                      <tr key={act.activity_id} style={{ background: '#f8fafc' }}>
                        <td>
                          <input
                            type="text"
                            className="form-control"
                            value={editValues.label}
                            onChange={(e) =>
                              setEditValues({ ...editValues, label: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="form-control tabular-nums"
                            value={editValues.monthly_volume}
                            placeholder="Optional"
                            onChange={(e) =>
                              setEditValues({ ...editValues, monthly_volume: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            className="form-control tabular-nums"
                            value={editValues.minutes_per_unit}
                            placeholder="Optional"
                            onChange={(e) =>
                              setEditValues({ ...editValues, minutes_per_unit: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="form-control tabular-nums"
                            value={editValues.hourly_rate}
                            placeholder="Optional"
                            onChange={(e) =>
                              setEditValues({ ...editValues, hourly_rate: e.target.value })
                            }
                          />
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          Editing...
                        </td>
                        <td>
                          <span className="badge badge-neutral">Drafting</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleSaveEdit(act.activity_id)}
                              disabled={isBusy}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={act.activity_id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {act.label}
                          </span>
                          {act.source_ids && act.source_ids.length > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--brand-teal)' }}>
                              Evidence: {Array.from(new Set(act.source_ids
                                .map((sourceId) => assessment.uploads?.find((file) => sourceId === file.id || sourceId.startsWith(`${file.id}:`))?.filename)
                                .filter((filename): filename is string => Boolean(filename)))).join(', ')}
                            </span>
                          )}
                          {act.validation_errors && act.validation_errors.length > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--error)' }}>
                              ⚠ {act.validation_errors.join('; ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="tabular-nums">
                        {vol !== null ? formatNumber(vol) : <span style={{ color: 'var(--text-faint)' }}>Not provided</span>}
                      </td>
                      <td className="tabular-nums">
                        {mins !== null ? `${mins} min` : <span style={{ color: 'var(--text-faint)' }}>Not provided</span>}
                      </td>
                      <td className="tabular-nums">
                        {rate !== null ? (
                          formatCurrency(rate, act.currency || currency)
                        ) : (
                          <span style={{ color: 'var(--text-faint)' }}>Not provided</span>
                        )}
                      </td>
                      <td>
                        {annHours !== null ? (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="tabular-nums" style={{ fontWeight: 600 }}>
                              {formatNumber(annHours.toFixed(1))} hrs/yr
                            </span>
                            {annCost !== null && (
                              <span className="tabular-nums" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                {formatCurrency(annCost.toFixed(2), act.currency || currency)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>
                            Requires volume & time
                          </span>
                        )}
                      </td>
                      <td>
                        {act.confirmed ? (
                          <span className="badge badge-success">Confirmed</span>
                        ) : act.rejected ? (
                          <span className="badge badge-error">Rejected</span>
                        ) : (
                          <span className="badge badge-neutral">Candidate</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleStartEdit(act)}
                            disabled={isBusy}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--error)' }}
                            onClick={() => removeActivity(act.activity_id)}
                            disabled={isBusy || activities.length === 1}
                            title="Remove activity step"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Compact Baseline Metrics Footer */}
        {totalHours > 0 && (
          <div className="card-footer">
            <div style={{ display: 'flex', gap: '24px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total Monthly Volume:
                </span>{' '}
                <strong className="tabular-nums">{formatNumber(totalVolume)} units/mo</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total Baseline Handling:
                </span>{' '}
                <strong className="tabular-nums">{formatNumber(totalHours.toFixed(1))} hours/year</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total Baseline Labour Cost:
                </span>{' '}
                <strong className="tabular-nums">{formatCurrency(totalCost.toFixed(2), currency)}/year</strong>
              </div>
            </div>

            <Link href={`/assessments/${assessment.id}/evidence`} className="btn btn-primary btn-sm">
              <span>Next: Upload Evidence</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
