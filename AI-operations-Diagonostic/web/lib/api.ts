import { CONFIG } from './config';
import { formatApiValidationError } from './apiErrors';
import type {
  AnalysisResponse,
  Assessment,
  AssessmentCreatePayload,
  AssessmentListResponse,
  FactPatchPayload,
  SubmitRequestPayload,
  ApproveRequestPayload,
  UploadItem,
  ExtractionResult,
  ProviderStatus,
  SandboxResetResponse,
} from '@/types/assessment';
import type {
  AuthResponse,
  AuthUser,
  OnboardingPayload,
  WorkspaceMemberCreatePayload,
} from '@/types/auth';

const TOKEN_STORAGE_KEY = 'aod_access_token';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export class ApiClientError extends Error {
  status: number;
  code?: string;
  correlationId?: string;

  constructor(status: number, message: string, code?: string, correlationId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }
}

async function request<T>(path: string, init: RequestInit = {}, options?: { skipAuth?: boolean }): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!options?.skipAuth && !headers.has('Authorization')) {
    const token = getStoredToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const url = `${CONFIG.API_BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (err) {
    throw new ApiClientError(
      0,
      `Network connection failed. Ensure backend API is running at ${CONFIG.API_BASE_URL}. (${(err as Error).message})`
    );
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    let correlationId: string | undefined;

    try {
      const errorBody = await response.json();
      const detail = errorBody?.detail;
      const validationMessage = formatApiValidationError(detail);
      if (validationMessage) {
        message = validationMessage;
      } else if (typeof detail === 'object' && detail !== null) {
        message = detail.message || detail.code || message;
        code = detail.code;
        correlationId = detail.correlation_id;
      } else if (typeof detail === 'string') {
        message = detail;
      }
    } catch {
      // Body was not JSON; keep fallback message
    }

    if (response.status === 401 && !options?.skipAuth && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aod:unauthorized'));
    }

    throw new ApiClientError(response.status, message, code, correlationId);
  }

  if (response.headers.get('content-type')?.includes('application/pdf')) {
    return (await response.blob()) as unknown as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  async register(payload: {
    email: string;
    password: string;
    confirm_password: string;
  }): Promise<AuthResponse> {
    return request<AuthResponse>(
      '/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      { skipAuth: true }
    );
  },

  async completeOnboarding(payload: OnboardingPayload): Promise<{ user: AuthUser }> {
    return request<{ user: AuthUser }>('/v1/auth/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async login(payload: { email: string; password: string }): Promise<AuthResponse> {
    return request<AuthResponse>(
      '/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      { skipAuth: true }
    );
  },

  async logout(): Promise<{ status: string }> {
    return request<{ status: string }>('/v1/auth/logout', {
      method: 'POST',
    });
  },

  async getMe(): Promise<{ user: AuthUser }> {
    return request<{ user: AuthUser }>('/v1/auth/me');
  },

  async getWorkspaceMembers(): Promise<{
    items: AuthUser[];
    workspace_id: string;
    workspace_name: string;
  }> {
    return request<{ items: AuthUser[]; workspace_id: string; workspace_name: string }>(
      '/v1/workspace/members'
    );
  },

  async createWorkspaceMember(payload: WorkspaceMemberCreatePayload): Promise<{ user: AuthUser }> {
    return request<{ user: AuthUser }>('/v1/workspace/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async updateWorkspaceMemberRole(
    memberId: string,
    role: 'admin' | 'analyst' | 'viewer'
  ): Promise<{ user: AuthUser }> {
    return request<{ user: AuthUser }>(`/v1/workspace/members/${memberId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
  },

  async getAssessments(options?: { is_sandbox?: boolean }): Promise<AssessmentListResponse> {
    const query = options?.is_sandbox ? '?is_sandbox=true' : '';
    return request<AssessmentListResponse>(`/v1/assessments${query}`);
  },

  async getProviders(): Promise<ProviderStatus> {
    return request<ProviderStatus>('/v1/providers');
  },

  async resetSandbox(): Promise<SandboxResetResponse> {
    return request<SandboxResetResponse>('/v1/sandbox/reset', {
      method: 'POST',
    });
  },

  async getAssessment(id: string): Promise<Assessment> {
    return request<Assessment>(`/v1/assessments/${id}`);
  },

  async createAssessment(payload: AssessmentCreatePayload): Promise<Assessment> {
    return request<Assessment>('/v1/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async uploadEvidence(
    assessmentId: string,
    file: File
  ): Promise<{ assessment: Assessment; upload: UploadItem; extraction: ExtractionResult }> {
    const formData = new FormData();
    formData.append('file', file);

    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${CONFIG.API_BASE_URL}/v1/assessments/${assessmentId}/uploads`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let message = 'Upload failed';
      let code: string | undefined;
      try {
        const body = await response.json();
        const detail = body?.detail;
        const validationMessage = formatApiValidationError(detail);
        if (validationMessage) {
          message = validationMessage;
        } else if (typeof detail === 'object' && detail !== null) {
          message = detail.message || detail.code || message;
          code = detail.code;
        } else if (typeof detail === 'string') {
          message = detail;
        }
      } catch {
        // Fallback message
      }
      throw new ApiClientError(response.status, message, code);
    }

    return response.json();
  },

  async analyzeAssessment(
    assessmentId: string,
    expectedRevision: number,
    files: File[],
    idempotencyKey?: string
  ): Promise<AnalysisResponse> {
    const formData = new FormData();
    formData.append('expected_revision', String(expectedRevision));
    files.forEach((file) => formData.append('files', file));

    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const response = await fetch(`${CONFIG.API_BASE_URL}/v1/assessments/${assessmentId}/analyze`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let message = 'Analysis failed';
      let code: string | undefined;
      try {
        const body = await response.json();
        const detail = body?.detail;
        const validationMessage = formatApiValidationError(detail);
        if (validationMessage) {
          message = validationMessage;
        } else if (typeof detail === 'object' && detail !== null) {
          message = detail.message || detail.code || message;
          code = detail.code;
        } else if (typeof detail === 'string') {
          message = detail;
        }
      } catch {
        // Fallback message
      }
      throw new ApiClientError(response.status, message, code);
    }

    return response.json();
  },

  async patchFacts(assessmentId: string, payload: FactPatchPayload): Promise<Assessment> {
    return request<Assessment>(`/v1/assessments/${assessmentId}/facts`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async runAnalysis(
    assessmentId: string,
    payload: SubmitRequestPayload
  ): Promise<{ job_id: string; status: string; assessment: Assessment }> {
    return request<{ job_id: string; status: string; assessment: Assessment }>(
      `/v1/assessments/${assessmentId}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
  },

  async approveReport(
    assessmentId: string,
    payload: ApproveRequestPayload
  ): Promise<{ status: string; revision: number; report_url: string }> {
    return request<{ status: string; revision: number; report_url: string }>(
      `/v1/assessments/${assessmentId}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
  },

  async reextractAssessment(assessmentId: string): Promise<Assessment> {
    return request<Assessment>(`/v1/assessments/${assessmentId}/reextract`, {
      method: 'POST',
    });
  },

  async downloadReportPdf(assessmentId: string): Promise<Blob> {
    return request<Blob>(`/v1/assessments/${assessmentId}/report`);
  },
};
