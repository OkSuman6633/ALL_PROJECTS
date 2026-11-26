'use client';

import type { CalculationsResult } from '@/types/assessment';

interface ApprovalAndExportSectionProps {
  calculations: CalculationsResult | null;
  reportReady: boolean;
  isBusy: boolean;
  onApprove: () => Promise<void>;
  onDownload: () => Promise<void>;
}

export function ApprovalAndExportSection({
  calculations,
  reportReady,
  isBusy,
  onApprove,
  onDownload,
}: ApprovalAndExportSectionProps) {
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
    !hasUnconfirmedFacts &&
    !hasCurrencyMismatch &&
    !hasInvalidActivities &&
    !reportReady;

  return (
    <>
      <div className="approval">
        <div>
          <strong>Human approval</strong>
          <p>
            {hasCurrencyMismatch
              ? '⚠️ Resolve currency mismatch before report approval.'
              : hasInvalidActivities
              ? '⚠️ Resolve data quality errors on confirmed activities before report approval.'
              : hasUnconfirmedFacts
              ? 'Confirm every activity, run analysis again, then approve the report.'
              : 'All activities confirmed and validated. Approve the diagnostic report.'}
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={!canApprove}
          onClick={onApprove}
          aria-label="Approve report"
          title={
            hasCurrencyMismatch
              ? 'Standardize assessment currency before approval'
              : hasInvalidActivities
              ? 'Resolve data validation errors on activities before approval'
              : hasUnconfirmedFacts
              ? 'Confirm all candidate facts before approval'
              : undefined
          }
        >
          {reportReady ? 'Report approved ✓' : 'Approve report ✓'}
        </button>
      </div>

      {reportReady && (
        <button
          type="button"
          className="download"
          disabled={isBusy}
          onClick={onDownload}
          aria-label="Download diagnostic PDF report"
        >
          {isBusy ? 'Generating PDF…' : '↓ Download diagnostic PDF'}
        </button>
      )}
    </>
  );
}
