'use client';

import { useRef } from 'react';
import { CONFIG } from '@/lib/config';
import { canAlignCurrency } from '@/lib/diagnosticWorkflow';
import { EvidenceSection } from './EvidenceSection';
import { ExtractionReviewQueue } from './ExtractionReviewQueue';
import { FactReviewSection } from './FactReviewSection';
import { MetricsSection } from './MetricsSection';
import { ScenariosSection } from './ScenariosSection';
import { RecommendationsSection } from './RecommendationsSection';
import { ApprovalAndExportSection } from './ApprovalAndExportSection';
import type { Assessment, Activity } from '@/types/assessment';

interface AssessmentDetailProps {
  assessment: Assessment;
  isBusy: boolean;
  onUpload: (file: File) => Promise<void>;
  onRunAnalysis: () => Promise<void>;
  onToggleConfirmFact: (activity: Activity) => Promise<void>;
  onUpdateActivity?: (activityId: string, patch: Partial<Activity>) => Promise<void>;
  onRemoveActivity?: (activityId: string) => Promise<void>;
  onReextract?: () => Promise<void>;
  onAlignCurrency?: (currency: string) => Promise<void>;
  onApprove: () => Promise<void>;
  onDownloadPdf: () => Promise<void>;
}

export function AssessmentDetail({
  assessment,
  isBusy,
  onUpload,
  onRunAnalysis,
  onToggleConfirmFact,
  onUpdateActivity,
  onRemoveActivity,
  onReextract,
  onAlignCurrency,
  onApprove,
  onDownloadPdf,
}: AssessmentDetailProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void onUpload(file);
      // Reset input value so re-uploading the same file triggers onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const statusClass = assessment.status.toLowerCase();
  const effectiveCurrency = assessment.calculations?.currency || assessment.currency || 'GBP';

  return (
    <div className="panel detail-panel">
      <div className="section-head">
        <div>
          <div className="eyebrow">03 / REVIEW & ANALYSE</div>
          <h3>{assessment.process_name}</h3>
          <p className="muted">
            Currency: {assessment.currency || 'GBP'}
          </p>
        </div>
        <span className={`status ${statusClass}`}>{assessment.status}</span>
      </div>

      <div className="toolbar">
        <label className="upload-button">
          ＋ Add PDF / CSV
          <input
            ref={fileInputRef}
            type="file"
            accept={CONFIG.SUPPORTED_EXTENSIONS}
            disabled={isBusy}
            onChange={handleFileChange}
          />
        </label>

        <button
          type="button"
          className="secondary"
          disabled={isBusy}
          onClick={onRunAnalysis}
        >
          {isBusy ? 'Processing…' : 'Run analysis ↗'}
        </button>
      </div>

      {assessment.calculations?.currency_mismatch && (
        <div
          style={{
            margin: '12px 0',
            padding: '12px 14px',
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            color: '#92400e',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <strong>⚠️ Currency Mismatch Detected: </strong>
              {assessment.calculations.currency_mismatch_warning}
            </div>
            {onAlignCurrency && canAlignCurrency(assessment.calculations.currency) && (
              <button
                type="button"
                className="secondary"
                disabled={isBusy}
                style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
                onClick={() => void onAlignCurrency(assessment.calculations!.currency)}
              >
                Standardize Assessment to {assessment.calculations.currency} ↗
              </button>
            )}
          </div>
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#78350f' }}>
            Source currencies are preserved. Align currencies to enable report approval.
          </div>
        </div>
      )}

      <EvidenceSection uploads={assessment.uploads} />

      <ExtractionReviewQueue
        extractions={assessment.extraction}
        onReextract={onReextract}
        isBusy={isBusy}
      />

      <FactReviewSection
        activities={assessment.activities}
        currency={effectiveCurrency}
        isBusy={isBusy}
        onToggleConfirm={onToggleConfirmFact}
        onUpdateActivity={onUpdateActivity}
        onRemoveActivity={onRemoveActivity}
      />

      {assessment.calculations && (
        <>
          <MetricsSection
            calculations={assessment.calculations}
            totalActivitiesCount={assessment.activities.length}
          />

          <ScenariosSection
            scenarios={assessment.calculations.scenarios}
            currency={assessment.calculations.currency}
          />

          <RecommendationsSection
            recommendations={assessment.calculations.recommendations}
          />
        </>
      )}

      <ApprovalAndExportSection
        calculations={assessment.calculations}
        reportReady={assessment.report_ready}
        isBusy={isBusy}
        onApprove={onApprove}
        onDownload={onDownloadPdf}
      />
    </div>
  );
}
