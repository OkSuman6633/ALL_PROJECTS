'use client';

import { useState } from 'react';
import { SECTOR_OPTIONS, DEFAULT_PROCESS_FORM, DEFAULT_ACTIVITY_FORM } from '@/lib/config';
import type { AssessmentCreatePayload } from '@/types/assessment';

interface CreateAssessmentPanelProps {
  onSubmit: (payload: AssessmentCreatePayload) => Promise<void>;
  isBusy: boolean;
}

export interface FormActivityItem {
  id: string;
  label: string;
  monthly_volume: string;
  minutes_per_unit: string;
  hourly_rate: string;
  currency: string;
}

function generateRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'act_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
}

export function CreateAssessmentPanel({ onSubmit, isBusy }: CreateAssessmentPanelProps) {
  const [form, setForm] = useState(DEFAULT_PROCESS_FORM);
  const [activities, setActivities] = useState<FormActivityItem[]>([
    {
      id: generateRowId(),
      ...DEFAULT_ACTIVITY_FORM,
    },
  ]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleAddActivity = () => {
    setValidationError(null);
    setActivities((prev) => [
      ...prev,
      {
        id: generateRowId(),
        label: '',
        monthly_volume: '100',
        minutes_per_unit: '5',
        hourly_rate: '30',
        currency: 'GBP',
      },
    ]);
  };

  const handleRemoveActivity = (id: string) => {
    if (activities.length <= 1) return;
    setValidationError(null);
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  const handleActivityChange = (id: string, field: keyof FormActivityItem, value: string) => {
    setValidationError(null);
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (activities.length === 0) {
      setValidationError('At least one activity is required.');
      return;
    }

    for (let i = 0; i < activities.length; i++) {
      const act = activities[i];
      const rowNum = i + 1;
      const label = act.label.trim();
      if (!label) {
        setValidationError(`Activity ${rowNum}: Activity / process step name is required.`);
        return;
      }
      const vol = Number(act.monthly_volume);
      if (isNaN(vol) || vol < 0) {
        setValidationError(`Activity ${rowNum} (${label}): Cases / month must be a valid non-negative number.`);
        return;
      }
      const mins = Number(act.minutes_per_unit);
      if (isNaN(mins) || mins < 0) {
        setValidationError(`Activity ${rowNum} (${label}): Minutes / case must be a valid non-negative number.`);
        return;
      }
      const rate = Number(act.hourly_rate);
      if (isNaN(rate) || rate < 0) {
        setValidationError(`Activity ${rowNum} (${label}): Hourly rate must be a valid non-negative number.`);
        return;
      }
    }

    const payload: AssessmentCreatePayload = {
      process_name: form.process_name.trim(),
      sector: form.sector,
      period: form.period.trim(),
      unit: form.unit.trim(),
      goals: form.goals.trim(),
      activity_inputs: activities.map((act) => ({
        label: act.label.trim(),
        monthly_volume: Number(act.monthly_volume),
        minutes_per_unit: Number(act.minutes_per_unit),
        hourly_rate: Number(act.hourly_rate),
        currency: act.currency || 'GBP',
        confirmed: false,
      })),
    };
    await onSubmit(payload);
  }

  return (
    <aside className="panel create-panel">
      <div className="section-head">
        <div>
          <div className="eyebrow">01 / NEW WORKSPACE</div>
          <h3>Start a diagnostic</h3>
        </div>
        <span className="number">01</span>
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          Process name
          <input
            required
            minLength={2}
            value={form.process_name}
            onChange={(e) => setForm({ ...form, process_name: e.target.value })}
            placeholder="e.g. Invoice review"
          />
        </label>

        <div className="two">
          <label>
            Sector
            <select
              value={form.sector}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
            >
              {SECTOR_OPTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </label>

          <label>
            Measurement period
            <input
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
              placeholder="e.g. Last 30 days"
            />
          </label>
        </div>

        <label>
          Improvement objective
          <textarea
            value={form.goals}
            onChange={(e) => setForm({ ...form, goals: e.target.value })}
            rows={2}
            placeholder="e.g. Reduce manual handling and rework"
          />
        </label>

        <div className="rule" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
          <div className="eyebrow">
            BASELINE INPUT {activities.length > 1 ? `(${activities.length} STEPS)` : ''}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={handleAddActivity}
            disabled={isBusy}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              cursor: 'pointer',
              borderRadius: '6px',
            }}
          >
            + Add Activity
          </button>
        </div>

        <div className="activity-inputs-list" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {activities.map((act, index) => (
            <div
              key={act.id}
              className="activity-card"
              style={{
                border: '1px solid #dce5dc',
                borderRadius: '8px',
                padding: '12px',
                background: '#fcfdf9',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow" style={{ fontSize: '10px', color: 'var(--teal)' }}>
                  ACTIVITY {String(index + 1).padStart(2, '0')}
                </span>
                {activities.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveActivity(act.id)}
                    disabled={isBusy}
                    title="Remove this activity row"
                    aria-label={`Remove activity ${index + 1}`}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    ✕ Remove
                  </button>
                )}
              </div>

              <label>
                Activity / process step
                <input
                  required
                  value={act.label}
                  onChange={(e) => handleActivityChange(act.id, 'label', e.target.value)}
                  placeholder="e.g. Check invoice and PO matching"
                  disabled={isBusy}
                />
              </label>

              <div className="three">
                <label>
                  Cases / month
                  <input
                    type="number"
                    min="0"
                    required
                    value={act.monthly_volume}
                    onChange={(e) => handleActivityChange(act.id, 'monthly_volume', e.target.value)}
                    disabled={isBusy}
                  />
                </label>

                <label>
                  Minutes / case
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    required
                    value={act.minutes_per_unit}
                    onChange={(e) => handleActivityChange(act.id, 'minutes_per_unit', e.target.value)}
                    disabled={isBusy}
                  />
                </label>

                <label>
                  Hourly rate (£)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={act.hourly_rate}
                    onChange={(e) => handleActivityChange(act.id, 'hourly_rate', e.target.value)}
                    disabled={isBusy}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        {validationError && (
          <div
            role="alert"
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              color: '#dc2626',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            {validationError}
          </div>
        )}

        <p className="helper">
          New values are unconfirmed until a reviewer checks them. Use synthetic or approved anonymised evidence only.
        </p>

        <button className="primary" type="submit" disabled={isBusy}>
          {isBusy ? 'Working…' : 'Create assessment'} <span aria-hidden="true">↗</span>
        </button>
      </form>
    </aside>
  );
}
