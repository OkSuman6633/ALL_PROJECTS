export interface Activity {
  activity_id: string;
  label: string;
  monthly_volume: number | null;
  minutes_per_unit: number | null;
  hourly_rate: number | null;
  currency: string;
  rework_rate?: number | null;
  error_rate?: number | null;
  confirmed: boolean;
  rejected?: boolean;
  is_valid?: boolean;
  validation_status?: 'valid' | 'invalid' | 'candidate' | string;
  validation_errors?: string[];
  validation_warnings?: string[];
  is_calculation_eligible?: boolean;
  source_ids: string[];
  provenance?: Record<string, unknown>;
  confidence?: string;
  ambiguity_flags?: string[];
  annual_hours?: string;
  annual_effort_cost?: string;
  achievable_reduction_pct?: string;
  capacity_hours_released?: string;
  capacity_value?: string;
  cash_savings?: null;
}

export interface ScenarioItem {
  assumed_reduction_pct: string;
  capacity_hours_released: string;
  capacity_value: string;
  cash_savings: null;
}

export interface RecommendationItem {
  id: string;
  activity: string | null;
  priority: 'investigate' | 'data_quality' | string;
  title: string;
  rationale: string;
  evidence: string[];
  evidence_gap: boolean;
  confidence: string;
  not_a_guarantee: boolean;
}

export interface CalculationsResult {
  activities: Activity[];
  confirmed_activity_count: number;
  unconfirmed_activity_count: number;
  rejected_activity_count?: number;
  calculation_eligible_activity_count?: number;
  invalid_activity_count?: number;
  data_quality_issues?: Array<{
    activity_id?: string;
    label?: string;
    errors: string[];
    warnings?: string[];
  }>;
  annual_hours: string;
  annual_effort_cost: string;
  scenarios: Record<string, ScenarioItem>;
  currency: string;
  assessment_currency?: string;
  currency_mismatch?: boolean;
  currency_mismatch_warning?: string | null;
  recommendations: RecommendationItem[];
  limitations: string[];
}

export interface UploadItem {
  id: string;
  filename: string;
  kind: 'pdf' | 'csv' | string;
  sha256: string;
  size: number;
  uploaded_at: string;
  scan_status: string;
  page_count?: number;
  row_count?: number;
}

export interface ExtractionCandidate {
  label?: string;
  monthly_volume?: number | string;
  minutes_per_unit?: number | string;
  hourly_rate?: number | string;
  confidence?: string;
  ambiguity_flags?: string[];
  source_ids?: string[];
}

export interface ExtractionResult {
  source_id: string;
  provider: string;
  fallback_provider?: string;
  status: string;
  error_code?: string;
  activities?: ExtractionCandidate[];
  questions?: string[];
  note?: string;
  error_type?: string;
}

export interface AssessmentEvent {
  event: string;
  at: string;
  [key: string]: unknown;
}

export interface Assessment {
  id: string;
  tenant_id?: string;
  owner_id?: string;
  template_id?: string;
  process_name: string;
  sector: string;
  period: string;
  unit: string;
  goals: string;
  currency?: string;
  is_sandbox?: boolean;
  approved_as_sandbox?: boolean;
  status: 'CREATED' | 'REVIEW' | 'RUNNING' | 'COMPLETE' | string;
  revision: number;
  created_at: string;
  updated_at: string;
  activities: Activity[];
  uploads: UploadItem[];
  extraction: ExtractionResult[];
  calculations: CalculationsResult | null;
  accepted_assumptions?: Record<string, unknown> | null;
  report_ready: boolean;
  approved_revision?: number | null;
  events?: AssessmentEvent[];
}

export interface AssessmentListResponse {
  items: Assessment[];
  next_cursor: string | null;
}

export interface AssessmentCreatePayload {
  process_name: string;
  sector: string;
  period: string;
  unit: string;
  goals: string;
  currency?: string;
  template_id?: string;
  is_sandbox?: boolean;
  activity_inputs?: {
    label: string;
    monthly_volume: number;
    minutes_per_unit: number;
    hourly_rate: number;
    currency: string;
    confirmed: boolean;
    source_ids?: string[];
  }[];
}

export interface AnalyzeFileResult {
  filename: string;
  status: 'succeeded' | 'duplicate' | 'failed';
  upload_id?: string;
  extraction_status?: string;
  error?: ApiErrorDetail;
}

export interface AnalyzeAssessmentRequest {
  expected_revision: number;
  files: File[];
}

export interface AnalyzeAssessmentResponse {
  status: 'completed' | 'partial_failure' | 'failed' | 'blocked';
  files: AnalyzeFileResult[];
  assessment: Assessment;
}

export type AnalysisResponse = AnalyzeAssessmentResponse;

export interface FactChangeItem {
  activity_id: string;
  label?: string;
  monthly_volume?: number;
  minutes_per_unit?: number;
  hourly_rate?: number;
  currency?: string;
  confirmed?: boolean;
  rejected?: boolean;
  source_ids?: string[];
  provenance?: Record<string, unknown>;
}

export interface ActivityCreateInput {
  label: string;
  monthly_volume: number | null;
  minutes_per_unit: number | null;
  hourly_rate: number | null;
  currency: string;
  confirmed: boolean;
  source_ids?: string[];
}

export interface FactPatchPayload {
  expected_revision: number;
  currency?: string;
  changes?: FactChangeItem[];
  add_activities?: ActivityCreateInput[];
  remove_activity_ids?: string[];
}

export interface SubmitRequestPayload {
  expected_revision: number;
}

export interface ApproveRequestPayload {
  expected_revision: number;
  accepted_assumptions: Record<string, unknown>;
}

export interface ApiErrorDetail {
  code?: string;
  message?: string;
  correlation_id?: string;
}

export interface ProviderStatus {
  extraction_provider: string;
  gemini_configured: boolean;
  gemini_model: string;
  state_store: string;
  production_auth_configured: boolean;
}

export interface SandboxResetResponse {
  status: string;
  deleted_count: number;
  message: string;
}
