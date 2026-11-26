'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/formatters';
import type { Activity } from '@/types/assessment';

interface FactReviewSectionProps {
  activities: Activity[];
  currency?: string;
  isBusy: boolean;
  onToggleConfirm: (activity: Activity) => Promise<void>;
  onUpdateActivity?: (activityId: string, patch: Partial<Activity>) => Promise<void>;
  onRemoveActivity?: (activityId: string) => Promise<void>;
}

export function FactReviewSection({
  activities,
  currency = 'GBP',
  isBusy,
  onToggleConfirm,
  onUpdateActivity,
  onRemoveActivity,
}: FactReviewSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editVolume, setEditVolume] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editCurrency, setEditCurrency] = useState('');

  const startEditing = (a: Activity) => {
    setEditingId(a.activity_id);
    setEditLabel(a.label);
    setEditVolume(a.monthly_volume !== null && a.monthly_volume !== undefined ? String(a.monthly_volume) : '');
    setEditMinutes(a.minutes_per_unit !== null && a.minutes_per_unit !== undefined ? String(a.minutes_per_unit) : '');
    setEditRate(a.hourly_rate !== null && a.hourly_rate !== undefined ? String(a.hourly_rate) : '');
    setEditCurrency(a.currency || currency);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = async (activityId: string) => {
    if (!onUpdateActivity) return;
    const vol = editVolume.trim() !== '' && !isNaN(Number(editVolume)) ? parseFloat(editVolume) : null;
    const mins = editMinutes.trim() !== '' && !isNaN(Number(editMinutes)) ? parseFloat(editMinutes) : null;
    const rate = editRate.trim() !== '' && !isNaN(Number(editRate)) ? parseFloat(editRate) : null;
    await onUpdateActivity(activityId, {
      label: editLabel.trim(),
      monthly_volume: vol,
      minutes_per_unit: mins,
      hourly_rate: rate,
      currency: editCurrency.trim().toUpperCase() || currency,
    });
    setEditingId(null);
  };

  return (
    <>
      <div className="activity-head">
        <h4>Activities</h4>
      </div>

      {activities && activities.length > 0 ? (
        activities.map((a) => {
          const isEditing = editingId === a.activity_id;
          const isCurrencyMismatch = a.currency && currency && a.currency !== currency;

          return (
            <div
              className="fact-row"
              key={a.activity_id}
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                padding: '12px',
                marginBottom: '8px',
                borderLeft: a.confirmed ? '4px solid var(--accent, #16a34a)' : '4px solid var(--muted, #94a3b8)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '15px', color: a.label?.trim() ? 'inherit' : '#dc2626' }}>
                      {a.label?.trim() ? a.label : '(Missing activity name)'}
                    </strong>
                    {a.confirmed ? (
                      a.is_valid === false || (a.validation_errors && a.validation_errors.length > 0) ? (
                        <span style={{ fontSize: '11px', padding: '1px 6px', background: '#fee2e2', color: '#b91c1c', borderRadius: '3px', fontWeight: 600 }}>
                          Confirmed (Invalid)
                        </span>
                      ) : (
                        <span className="status confirmed" style={{ fontSize: '11px', padding: '1px 6px' }}>
                          Confirmed ✓
                        </span>
                      )
                    ) : (
                      <span className="status review" style={{ fontSize: '11px', padding: '1px 6px' }}>
                        Candidate / Unconfirmed
                      </span>
                    )}
                    {a.minutes_per_unit === 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#b45309',
                          background: '#fef3c7',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          fontWeight: 600,
                        }}
                      >
                        ⚠️ Zero handling time — review required
                      </span>
                    )}
                    {a.monthly_volume !== null && a.monthly_volume !== undefined && a.monthly_volume < 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#b91c1c',
                          background: '#fee2e2',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          fontWeight: 600,
                        }}
                      >
                        ⚠️ Negative volume ({a.monthly_volume})
                      </span>
                    )}
                    {a.rework_rate !== null && a.rework_rate !== undefined && (a.rework_rate < 0 || a.rework_rate > 1) && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#b91c1c',
                          background: '#fee2e2',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          fontWeight: 600,
                        }}
                      >
                        ⚠️ Invalid rework rate ({(a.rework_rate * 100).toFixed(0)}%)
                      </span>
                    )}
                    {isCurrencyMismatch && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#b45309',
                          background: '#fef3c7',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          fontWeight: 600,
                        }}
                      >
                        ⚠️ Currency: {a.currency} (Assessment is {currency})
                      </span>
                    )}
                  </div>

                  {a.monthly_volume !== null && a.monthly_volume !== undefined && a.minutes_per_unit !== null && a.minutes_per_unit !== undefined ? (
                    <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary, #475569)' }}>
                      {a.monthly_volume} cases/mo · {a.minutes_per_unit} min/case ·{' '}
                      {a.hourly_rate !== null && a.hourly_rate !== undefined
                        ? `${formatCurrency(a.hourly_rate, a.currency || currency)}/hour`
                        : 'Rate missing'}
                      {a.rework_rate !== null && a.rework_rate !== undefined && a.rework_rate >= 0 && a.rework_rate <= 1 && (
                        <> · Rework: {(a.rework_rate * 100).toFixed(1)}%</>
                      )}
                      {a.error_rate !== null && a.error_rate !== undefined && a.error_rate >= 0 && a.error_rate <= 1 && (
                        <> · Error: {(a.error_rate * 100).toFixed(1)}%</>
                      )}
                    </small>
                  ) : (
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>
                        ⚠️ Quantitative metrics missing
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        Process step from SOP; enter volume & time or upload CSV metrics.
                      </span>
                    </div>
                  )}

                  {a.validation_errors && a.validation_errors.length > 0 && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        color: '#991b1b',
                        fontSize: '12px',
                      }}
                    >
                      <strong>Data quality issues (not included in calculations):</strong>
                      <ul style={{ margin: '3px 0 0 16px', padding: 0 }}>
                        {a.validation_errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="secondary"
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                    disabled={isBusy}
                    onClick={() => (isEditing ? cancelEditing() : startEditing(a))}
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>

                  {onRemoveActivity && !a.confirmed && (
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: '12px', padding: '4px 8px', color: '#dc2626' }}
                      disabled={isBusy}
                      onClick={() => onRemoveActivity(a.activity_id)}
                      title="Reject candidate fact"
                    >
                      Reject
                    </button>
                  )}

                  {(() => {
                    const hasMissingMetrics = a.monthly_volume === null || a.monthly_volume === undefined || a.minutes_per_unit === null || a.minutes_per_unit === undefined;
                    return (
                      <button
                        type="button"
                        className={a.confirmed ? 'confirmed' : 'confirm'}
                        disabled={isBusy || (!a.confirmed && hasMissingMetrics)}
                        onClick={() => onToggleConfirm(a)}
                        title={hasMissingMetrics ? 'Enter metrics before confirming' : undefined}
                        aria-label={a.confirmed ? 'Mark activity as unconfirmed' : 'Confirm activity facts'}
                      >
                        {a.confirmed ? '✓ Confirmed' : hasMissingMetrics ? 'Metrics required' : 'Confirm facts'}
                      </button>
                    );
                  })()}
                </div>
              </div>

              {isEditing && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '10px',
                    background: 'var(--bg-secondary, #f8fafc)',
                    borderRadius: '6px',
                    border: '1px solid var(--border, #e2e8f0)',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                    <div>
                      <label style={{ fontSize: '11px', display: 'block', fontWeight: 600 }}>Activity Label</label>
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        style={{ width: '100%', padding: '4px', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', display: 'block', fontWeight: 600 }}>Cases / Month</label>
                      <input
                        type="number"
                        value={editVolume}
                        onChange={(e) => setEditVolume(e.target.value)}
                        style={{ width: '100%', padding: '4px', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', display: 'block', fontWeight: 600 }}>Minutes / Case</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editMinutes}
                        onChange={(e) => setEditMinutes(e.target.value)}
                        style={{ width: '100%', padding: '4px', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', display: 'block', fontWeight: 600 }}>Hourly Rate</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        style={{ width: '100%', padding: '4px', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', display: 'block', fontWeight: 600 }}>Currency</label>
                      <select
                        value={editCurrency}
                        onChange={(e) => setEditCurrency(e.target.value)}
                        style={{ width: '100%', padding: '4px', fontSize: '12px' }}
                      >
                        <option value="USD">USD ($)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="EUR">EUR (€)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                      onClick={cancelEditing}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="confirm"
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                      disabled={isBusy || !editLabel.trim()}
                      onClick={() => saveEditing(a.activity_id)}
                    >
                      Save changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      ) : (
        <p className="helper">
          No activities yet. Add a step or upload evidence to get started.
        </p>
      )}
    </>
  );
}
