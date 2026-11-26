'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAssessmentContext } from '@/components/assessment/AssessmentContext';
import {
  addEvidenceFiles,
  canConfirmActivity,
  classifyActivity,
  evidenceFileKey,
  getEvidenceLocation,
  removeEvidenceFile,
  type EvidenceFileOutcome,
} from '@/lib/diagnosticWorkflow';
import type { Activity, Assessment } from '@/types/assessment';

type WorkflowStatus =
  | 'idle'
  | 'processing'
  | 'completed'
  | 'awaiting_review'
  | 'partial_failure'
  | 'failed'
  | 'blocked';

const categoryDetails = {
  ready: {
    title: 'Ready for confirmation',
    description: 'Complete candidate facts with no detected warnings. Review the evidence, then confirm explicitly.',
  },
  needs_review: {
    title: 'Needs review',
    description: 'Resolve missing information or inspect the listed warnings before confirming.',
  },
  blocked: {
    title: 'Blocked',
    description: 'Rejected or invalid facts cannot be confirmed until corrected or restored.',
  },
} as const;

function sourceFilename(activity: Activity, assessment: Assessment): string | null {
  const provenanceFilename = activity.provenance?.filename;
  if (typeof provenanceFilename === 'string') return provenanceFilename;
  const sourceId = activity.source_ids?.[0]?.split(':')[0];
  return assessment.uploads.find((upload) => upload.id === sourceId)?.filename ?? null;
}

function ActivityReviewItem({
  activity,
  assessment,
  isBusy,
  onConfirm,
  onUpdate,
}: {
  activity: Activity;
  assessment: Assessment;
  isBusy: boolean;
  onConfirm: (activity: Activity) => Promise<void>;
  onUpdate: (activityId: string, patch: Partial<Activity>) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(activity.label);
  const [monthlyVolume, setMonthlyVolume] = useState(activity.monthly_volume?.toString() ?? '');
  const [minutesPerUnit, setMinutesPerUnit] = useState(activity.minutes_per_unit?.toString() ?? '');
  const [hourlyRate, setHourlyRate] = useState(activity.hourly_rate?.toString() ?? '');
  const [editError, setEditError] = useState('');
  const location = getEvidenceLocation(activity);
  const filename = sourceFilename(activity, assessment);

  const saveChanges = async () => {
    setEditError('');
    if (![monthlyVolume, minutesPerUnit, hourlyRate].every((value) => value.trim() !== '')) {
      setEditError('Enter all three numeric values before saving.');
      return;
    }
    const volume = Number(monthlyVolume);
    const minutes = Number(minutesPerUnit);
    const rate = Number(hourlyRate);
    if (
      !label.trim() ||
      ![volume, minutes, rate].every((value) => Number.isFinite(value) && value >= 0)
    ) {
      setEditError('Enter an activity name and non-negative numeric values.');
      return;
    }

    const saved = await onUpdate(activity.activity_id, {
      label: label.trim(),
      monthly_volume: volume,
      minutes_per_unit: minutes,
      hourly_rate: rate,
      confirmed: false,
      rejected: false,
    });
    if (saved) setIsEditing(false);
  };

  return (
    <article style={{ borderTop: '1px solid var(--border-default)', padding: '16px 0' }}>
      {isEditing ? (
        <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <label className="form-group">
            <span className="form-label">Activity</span>
            <input className="form-control" value={label} onChange={(event) => setLabel(event.target.value)} required />
          </label>
          <label className="form-group">
            <span className="form-label">Monthly volume</span>
            <input className="form-control" type="number" min="0" value={monthlyVolume} onChange={(event) => setMonthlyVolume(event.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">Minutes per unit</span>
            <input className="form-control" type="number" min="0" step="any" value={minutesPerUnit} onChange={(event) => setMinutesPerUnit(event.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">Hourly rate ({activity.currency})</span>
            <input className="form-control" type="number" min="0" step="any" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} />
          </label>
          <div style={{ display: 'flex', alignItems: 'end', gap: '8px', paddingBottom: '16px' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveChanges()} disabled={isBusy}>Save correction</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditing(false)} disabled={isBusy}>Cancel</button>
          </div>
        </div>
        {editError && <p role="alert" style={{ color: 'var(--error)', margin: '0 0 8px' }}>{editError}</p>}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <strong>{activity.label}</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                {activity.monthly_volume ?? '—'} per month · {activity.minutes_per_unit ?? '—'} min/unit · {activity.hourly_rate ?? '—'} {activity.currency}/hour
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsEditing(true)} disabled={isBusy}>Correct</button>
              {activity.rejected ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void onUpdate(activity.activity_id, { rejected: false, confirmed: false })} disabled={isBusy}>Restore for review</button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void onConfirm(activity)}
                  disabled={isBusy || !canConfirmActivity(activity)}
                  title={!canConfirmActivity(activity) ? 'Correct missing or invalid values before confirmation.' : 'Explicitly confirm this activity as a verified fact.'}
                >
                  Confirm facts
                </button>
              )}
              {!activity.rejected && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onUpdate(activity.activity_id, { rejected: true, confirmed: false })} disabled={isBusy}>Reject</button>
              )}
            </div>
          </div>

          {(activity.validation_errors?.length || activity.validation_warnings?.length || activity.ambiguity_flags?.length) ? (
            <ul style={{ margin: '10px 0 0', paddingLeft: '20px', color: activity.validation_errors?.length ? 'var(--error)' : 'var(--warning)', fontSize: '13px' }}>
              {[...(activity.validation_errors ?? []), ...(activity.validation_warnings ?? []), ...(activity.ambiguity_flags ?? [])]
                .filter((issue, index, issues) => issues.indexOf(issue) === index)
                .map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          ) : null}
          <details style={{ marginTop: '10px', fontSize: '13px' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>Evidence and source details</summary>
            <div style={{ padding: '8px 0 0', color: 'var(--text-secondary)' }}>
              <div>File: {filename ?? 'Source file unavailable'}</div>
              <div>Location: {location}</div>
              <div>Evidence preview: unavailable in this interface; no excerpt or page preview is provided by the current API.</div>
              {activity.confidence && <div>Extraction confidence label: {activity.confidence}</div>}
            </div>
          </details>
        </>
      )}
    </article>
  );
}

export function DiagnosticWorkspace() {
  const {
    assessment,
    isBusy,
    analyzeOperations,
    toggleConfirmFact,
    updateActivity,
  } = useAssessmentContext();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectionErrors, setSelectionErrors] = useState<string[]>([]);
  const [fileOutcomes, setFileOutcomes] = useState<EvidenceFileOutcome[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>('idle');
  const [workflowMessage, setWorkflowMessage] = useState('');

  const groupedActivities = useMemo(() => {
    const groups: Record<'ready' | 'needs_review' | 'blocked', Activity[]> = {
      ready: [],
      needs_review: [],
      blocked: [],
    };
    for (const activity of assessment?.activities ?? []) {
      const category = classifyActivity(activity);
      if (category !== 'confirmed') groups[category].push(activity);
    }
    return groups;
  }, [assessment?.activities]);

  if (!assessment) return null;

  const selectFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const result = addEvidenceFiles(selectedFiles, Array.from(fileList));
    setSelectedFiles(result.files);
    setSelectionErrors(result.errors);
    if (fileInput.current) fileInput.current.value = '';
  };

  const processEvidence = async () => {
    setWorkflowStatus('processing');
    setWorkflowMessage('');
    const result = await analyzeOperations(selectedFiles);
    setFileOutcomes(result.fileOutcomes);
    setSelectedFiles((current) =>
      current.filter((file) => {
        const outcome = result.fileOutcomes.find((item) => item.key === evidenceFileKey(file));
        return outcome?.status === 'failed' && outcome.retryable !== false;
      })
    );
    setWorkflowStatus(result.status);
    setWorkflowMessage(result.message);
  };

  const statusText: Record<WorkflowStatus, string> = {
    idle: 'Ready to analyse',
    processing: 'Processing files',
    completed: 'Processing completed',
    awaiting_review: 'Awaiting human review',
    partial_failure: 'Partial failure',
    failed: 'Processing failed',
    blocked: 'Blocked',
  };
  const candidateCount =
    groupedActivities.ready.length + groupedActivities.needs_review.length + groupedActivities.blocked.length;
  const eligibleCount = assessment.calculations?.calculation_eligible_activity_count ?? 0;
  const currencyMismatch = Boolean(assessment.calculations?.currency_mismatch);
  const canStart = selectedFiles.length > 0 || assessment.uploads.length > 0;
  const buttonLabel =
    selectedFiles.length === 0 && assessment.uploads.length > 0 && fileOutcomes.length > 0
      ? 'Retry analysis'
      : 'Analyse My Operations';
  const currentStatusText =
    workflowStatus === 'idle' && selectedFiles.length > 0
      ? 'Files selected · ready to analyse'
      : statusText[workflowStatus];

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Your diagnostic</h1>
          <p className="page-subtitle">Upload your operating procedure and activity data, then review the extracted facts.</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-secondary" href={`/assessments/${assessment.id}/recommendations`}>Recommendations</Link>
          <Link className="btn btn-secondary" href={`/assessments/${assessment.id}/report`}>Report review</Link>
        </div>
      </div>

      <section className="card" aria-labelledby="evidence-heading" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" id="evidence-heading">1. Add your evidence</h2>
          </div>
        </div>
        <div className="card-body">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.csv,application/pdf,text/csv"
            multiple
            onChange={(event) => selectFiles(event.target.files)}
            aria-label="Select SOP PDF and operational CSV files"
          />
          <p className="form-hint">PDF and CSV only.</p>
          {selectedFiles.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
              {selectedFiles.map((file) => (
                <li key={evidenceFileKey(file)} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderTop: '1px solid var(--border-default)', padding: '10px 0' }}>
                  <span>{file.name} <span style={{ color: 'var(--text-muted)' }}>({file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'CSV'}, {(file.size / 1024).toFixed(0)} KB)</span></span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedFiles((files) => removeEvidenceFile(files, file))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {selectionErrors.length > 0 && (
            <ul className="alert-banner alert-banner-error" role="alert" style={{ display: 'block', marginTop: '12px' }}>
              {selectionErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          )}
          {assessment.uploads.length > 0 && (
            <details style={{ marginTop: '14px' }}>
              <summary style={{ cursor: 'pointer' }}>Already uploaded evidence ({assessment.uploads.length})</summary>
              <ul>
                {assessment.uploads.map((upload) => <li key={upload.id}>{upload.filename} · {upload.kind.toUpperCase()}</li>)}
              </ul>
            </details>
          )}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '16px' }}>
            <button type="button" className="btn btn-primary" onClick={() => void processEvidence()} disabled={isBusy || workflowStatus === 'processing' || !canStart}>
              {workflowStatus === 'processing' ? 'Processing…' : buttonLabel}
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{currentStatusText}</span>
          </div>
          {workflowMessage && workflowStatus !== 'completed' && workflowStatus !== 'awaiting_review' && (
            <div role="status" aria-live="polite" className={`alert-banner ${workflowStatus === 'partial_failure' ? 'alert-banner-error' : 'alert-banner-warning'}`} style={{ marginTop: '12px' }}>
              {workflowMessage}
            </div>
          )}
          {(workflowStatus === 'completed' || workflowStatus === 'awaiting_review') && workflowMessage && (
            <div role="status" aria-live="polite" className="alert-banner alert-banner-success" style={{ marginTop: '12px' }}>
              {workflowMessage}
            </div>
          )}
          {fileOutcomes.length > 0 && (
            <ul aria-label="File processing results" style={{ margin: '12px 0 0', paddingLeft: '20px' }}>
              {fileOutcomes.map((outcome, index) => (
                <li key={`${outcome.key ?? outcome.filename}-${index}`}>
                  {outcome.filename}: {outcome.status === 'succeeded' ? 'processed' : `failed${outcome.error ? ` — ${outcome.error}` : ''}`}
                  {outcome.retryable && ' (retry available)'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="review-heading" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <div>
            <h2 className="card-title" id="review-heading">2. Review extracted facts</h2>
            <p className="card-subtitle">Extraction creates candidates only. Nothing is confirmed automatically.</p>
          </div>
          <span className={`badge ${eligibleCount > 0 ? 'badge-success' : 'badge-warning'}`}>
            {eligibleCount} calculation-eligible confirmed {eligibleCount === 1 ? 'activity' : 'activities'}
          </span>
        </div>
        <div className="card-body">
          {currencyMismatch && (
            <div className="alert-banner alert-banner-warning" role="alert" style={{ marginBottom: '14px' }}>
              Evidence currency ({assessment.calculations?.currency}) differs from assessment currency ({assessment.currency || 'GBP'}). Resolve the currency issue before report approval.
            </div>
          )}
          {assessment.activities.filter((activity) => activity.confirmed && !activity.rejected).length > 0 && (
            <details style={{ marginBottom: '14px' }}>
              <summary style={{ cursor: 'pointer' }}>Confirmed facts ({assessment.activities.filter((activity) => activity.confirmed && !activity.rejected).length})</summary>
              <ul>
                {assessment.activities.filter((activity) => activity.confirmed && !activity.rejected).map((activity) => (
                  <li key={activity.activity_id}>
                    {activity.label} — {getEvidenceLocation(activity)}
                    {typeof activity.provenance?.filename === 'string'
                      ? ` · ${activity.provenance.filename}`
                      : null}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {candidateCount === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              {assessment.uploads.length === 0 ? 'Choose evidence above to start the review.' : 'No extracted candidates are available yet. Check the file results and retry analysis if needed.'}
            </p>
          ) : (
            (Object.keys(categoryDetails) as Array<keyof typeof categoryDetails>).map((category) => (
              <section key={category} aria-labelledby={`category-${category}`} style={{ marginTop: '8px' }}>
                <h3 id={`category-${category}`} style={{ fontSize: '15px', margin: '12px 0 4px' }}>
                  {categoryDetails[category].title} ({groupedActivities[category].length})
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 6px' }}>{categoryDetails[category].description}</p>
                {groupedActivities[category].length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>None</p>
                ) : (
                  groupedActivities[category].map((activity) => (
                    <ActivityReviewItem
                      key={activity.activity_id}
                      activity={activity}
                      assessment={assessment}
                      isBusy={isBusy}
                      onConfirm={toggleConfirmFact}
                      onUpdate={updateActivity}
                    />
                  ))
                )}
              </section>
            ))
          )}
        </div>
      </section>

      {assessment.calculations && eligibleCount === 0 && (
        <div className="alert-banner alert-banner-warning" role="alert">
          Calculations are not shown as verified results because the server reports no eligible, human-confirmed activities. Review and explicitly confirm valid facts, then analyse again.
        </div>
      )}
      {eligibleCount > 0 && (
        <section className="card" style={{ marginBottom: '18px' }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">3. Verified operational results</h2>
              <p className="card-subtitle">Server-calculated totals based on confirmed, calculation-eligible facts.</p>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
              <div><strong>{assessment.calculations?.annual_hours}</strong> annual hours</div>
              <div><strong>{assessment.calculations?.annual_effort_cost} {assessment.calculations?.currency}</strong> annual effort cost</div>
              <div><strong>{eligibleCount}</strong> eligible confirmed activities</div>
            </div>
            {(assessment.calculations?.data_quality_issues ?? []).length > 0 && (
              <ul style={{ color: 'var(--warning)' }}>
                {assessment.calculations?.data_quality_issues?.map((issue, index) => (
                  <li key={`${issue.activity_id ?? 'issue'}-${index}`}>{issue.label ?? 'Activity'}: {issue.errors.join('; ')}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '28px' }}>
        <Link className="btn btn-secondary" href="/assessments">Assessment history</Link>
        <Link className="btn btn-primary" href={`/assessments/${assessment.id}/report`}>Review report</Link>
      </div>
    </div>
  );
}
