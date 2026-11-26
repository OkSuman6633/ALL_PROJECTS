export type UserRole = 'owner' | 'admin' | 'analyst' | 'viewer';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  job_title: string;
  workspace_id: string;
  workspace_name: string;
  sector?: string;
  default_currency?: string;
  role: UserRole;
  permissions: string[];
  onboarding_completed: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface OnboardingPayload {
  workspace_name: string;
  full_name: string;
  job_title: string;
  sector: string;
  default_currency: string;
}

export interface WorkspaceMemberCreatePayload {
  email: string;
  password: string;
  full_name: string;
  job_title: string;
  role: 'admin' | 'analyst' | 'viewer';
}
