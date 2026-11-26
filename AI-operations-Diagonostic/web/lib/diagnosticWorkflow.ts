import type {
  Activity,
  AnalyzeAssessmentRequest,
  AssessmentCreatePayload,
} from '@/types/assessment';

export type EvidenceFileOutcome = {
  key?: string;
  filename: string;
  status: 'succeeded' | 'failed';
  error?: string;
  retryable?: boolean;
};

export type ReviewCategory = 'ready' | 'needs_review' | 'blocked' | 'confirmed';

type MetadataFields = Pick<
  AssessmentCreatePayload,
  'process_name' | 'sector' | 'period' | 'unit' | 'goals' | 'currency'
>;

export function canAlignCurrency(currency: string | null | undefined): currency is string {
  return typeof currency === 'string' && currency.length === 3;
}

export function buildMetadataAssessmentPayload(fields: MetadataFields): AssessmentCreatePayload {
  return {
    ...fields,
    is_sandbox: false,
  };
}

export function evidenceFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function supportedEvidenceFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'pdf' || extension === 'csv';
}

export function addEvidenceFiles(
  existing: File[],
  incoming: File[],
  maximum = 5
): { files: File[]; errors: string[] } {
  const files = [...existing];
  const errors: string[] = [];

  for (const file of incoming) {
    if (!supportedEvidenceFile(file)) {
      errors.push(`${file.name}: choose a PDF or CSV file.`);
      continue;
    }
    if (files.some((selected) => evidenceFileKey(selected) === evidenceFileKey(file))) {
      errors.push(`${file.name}: this file is already selected.`);
      continue;
    }
    if (files.length >= maximum) {
      errors.push(`${file.name}: no more than ${maximum} files can be selected.`);
      continue;
    }
    files.push(file);
  }

  return { files, errors };
}

export function removeEvidenceFile(files: File[], target: File): File[] {
  const targetKey = evidenceFileKey(target);
  return files.filter((file) => evidenceFileKey(file) !== targetKey);
}

export function buildBatchAnalysisFormData(request: AnalyzeAssessmentRequest): FormData {
  const formData = new FormData();
  formData.append('expected_revision', String(request.expected_revision));
  for (const file of request.files) {
    formData.append('files', file, file.name);
  }
  return formData;
}

export function classifyActivity(activity: Activity): ReviewCategory {
  if (activity.confirmed && !activity.rejected) return 'confirmed';
  if (activity.rejected || activity.is_valid === false || (activity.validation_errors?.length ?? 0) > 0) {
    return 'blocked';
  }

  const hasRequiredMetrics = [activity.monthly_volume, activity.minutes_per_unit, activity.hourly_rate]
    .every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (!hasRequiredMetrics) return 'needs_review';

  if (
    (activity.ambiguity_flags?.length ?? 0) > 0 ||
    (activity.validation_warnings?.length ?? 0) > 0
  ) {
    return 'needs_review';
  }
  return 'ready';
}

export function canConfirmActivity(activity: Activity): boolean {
  return (
    !activity.confirmed &&
    !activity.rejected &&
    activity.is_valid !== false &&
    (activity.validation_errors?.length ?? 0) === 0 &&
    [activity.monthly_volume, activity.minutes_per_unit, activity.hourly_rate].every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
    )
  );
}

export function summarizeFileOutcomes(outcomes: EvidenceFileOutcome[]): 'completed' | 'partial_failure' | 'failed' {
  const succeeded = outcomes.filter((outcome) => outcome.status === 'succeeded').length;
  const failed = outcomes.length - succeeded;
  if (failed === 0) return 'completed';
  return succeeded === 0 ? 'failed' : 'partial_failure';
}

export function getEvidenceLocation(activity: Activity): string {
  const provenance = activity.provenance;
  if (!provenance || typeof provenance !== 'object') return 'Source location unavailable';

  const sourceType = provenance.source_type;
  if (sourceType === 'csv' && typeof provenance.row_number === 'number') {
    return `CSV row ${provenance.row_number}`;
  }
  if (sourceType === 'pdf') {
    if (provenance.provider === 'gemini') return 'PDF page not verified';
    if (typeof provenance.page_number === 'number') return `PDF page ${provenance.page_number}`;
    return 'PDF page unavailable';
  }
  return 'Source location unavailable';
}
