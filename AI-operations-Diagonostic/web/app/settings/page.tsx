'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CONFIG, SECTOR_OPTIONS } from '@/lib/config';
import { useAuth } from '@/components/auth/AuthContext';
import type { ProviderStatus } from '@/types/assessment';
import type { AuthUser } from '@/types/auth';
import {
  SettingsIcon,
  ShieldIcon,
  CheckIcon,
  RefreshIcon,
  AlertTriangleIcon,
  SparklesIcon,
  DatabaseIcon,
  LockIcon,
  UsersIcon,
  PlusIcon,
} from '@/components/icons';

interface WorkspacePreferences {
  defaultCurrency: string;
  defaultSector: string;
  defaultPeriod: string;
  defaultUnit: string;
  enableAutoAudit: boolean;
  strictCurrencyEnforcement: boolean;
}

const DEFAULT_PREFERENCES: WorkspacePreferences = {
  defaultCurrency: 'GBP',
  defaultSector: 'Professional services',
  defaultPeriod: 'Last 30 days',
  defaultUnit: 'cases',
  enableAutoAudit: true,
  strictCurrencyEnforcement: true,
};

const CURRENCY_LABELS: Record<string, string> = {
  GBP: 'GBP (£) — British Pound',
  USD: 'USD ($) — US Dollar',
  EUR: 'EUR (€) — Euro',
  INR: 'INR (₹) — Indian Rupee',
  AUD: 'AUD ($) — Australian Dollar',
  CAD: 'CAD ($) — Canadian Dollar',
  SGD: 'SGD ($) — Singapore Dollar',
};

export default function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const canManageWorkspace = hasPermission('workspace:manage');

  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<WorkspacePreferences>(DEFAULT_PREFERENCES);
  const [isSaved, setIsSaved] = useState(false);

  const [members, setMembers] = useState<AuthUser[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'analyst' | 'viewer'>('analyst');
  const [isCreatingMember, setIsCreatingMember] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!canManageWorkspace) return;
    setIsLoadingMembers(true);
    setMembersError(null);
    try {
      const res = await api.getWorkspaceMembers();
      setMembers(res.items);
    } catch (err) {
      setMembersError((err as Error).message || 'Failed to load workspace members.');
    } finally {
      setIsLoadingMembers(false);
    }
  }, [canManageWorkspace]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ai_ops_workspace_preferences');
      if (stored) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(stored) });
      }
    } catch {
      // Fallback to default preferences
    }

    void fetchProviders();
  }, []);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMembersError(null);
    if (!newMemberEmail.trim() || !newMemberName.trim() || newMemberPassword.length < 8) {
      setMembersError('Provide full name, valid email, and a password of at least 8 characters.');
      return;
    }
    setIsCreatingMember(true);
    try {
      await api.createWorkspaceMember({
        email: newMemberEmail.trim(),
        full_name: newMemberName.trim(),
        password: newMemberPassword,
        job_title: newMemberRole.charAt(0).toUpperCase() + newMemberRole.slice(1),
        role: newMemberRole,
      });
      setNewMemberEmail('');
      setNewMemberName('');
      setNewMemberPassword('');
      await fetchMembers();
    } catch (err) {
      setMembersError((err as Error).message || 'Failed to add workspace member.');
    } finally {
      setIsCreatingMember(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: 'admin' | 'analyst' | 'viewer') => {
    setMembersError(null);
    try {
      await api.updateWorkspaceMemberRole(memberId, role);
      await fetchMembers();
    } catch (err) {
      setMembersError((err as Error).message || 'Failed to update member role.');
    }
  };

  const fetchProviders = async () => {
    setIsLoadingProviders(true);
    setProviderError(null);
    try {
      const status = await api.getProviders();
      setProviderStatus(status);
    } catch (err) {
      setProviderError((err as Error).message || 'Failed to fetch provider status.');
    } finally {
      setIsLoadingProviders(false);
    }
  };

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('ai_ops_workspace_preferences', JSON.stringify(preferences));
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3500);
    } catch {
      // Ignore storage errors
    }
  };

  const handleResetDefaults = () => {
    setPreferences(DEFAULT_PREFERENCES);
    try {
      localStorage.setItem('ai_ops_workspace_preferences', JSON.stringify(DEFAULT_PREFERENCES));
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3500);
    } catch {
      // Ignore storage errors
    }
  };

  const isGeminiActive = Boolean(providerStatus?.gemini_configured);
  const activeModelName = providerStatus?.gemini_model || 'rules-deterministic-v1';

  return (
    <div className="settings-layout">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--brand-navy)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <SettingsIcon size={18} />
            </div>
            <div>
              <h1 className="page-title">Workspace Settings</h1>
              <p className="page-subtitle">
                Configure default diagnostic parameters, inspect AI extraction provider readiness, and review governance guardrails.
              </p>
            </div>
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="btn btn-ghost"
            title="Restore default workspace preferences"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={() => void fetchProviders()}
            disabled={isLoadingProviders}
            className="btn btn-secondary"
          >
            <RefreshIcon size={14} />
            <span>{isLoadingProviders ? 'Refreshing…' : 'Refresh Providers'}</span>
          </button>
        </div>
      </div>

      {/* Save Confirmation Banner */}
      {isSaved && (
        <div className="alert-banner alert-banner-success" style={{ marginBottom: 0 }} role="status">
          <CheckIcon size={16} />
          <div style={{ fontWeight: 600 }}>
            Workspace assessment defaults and governance preferences have been saved.
          </div>
        </div>
      )}

      {/* Provider Error Banner */}
      {providerError && (
        <div className="alert-banner alert-banner-warning" style={{ marginBottom: 0 }} role="alert">
          <AlertTriangleIcon size={16} />
          <div>{providerError}</div>
        </div>
      )}

      {/* Top Status KPI Strip */}
      <div className="kpi-grid" style={{ marginBottom: 0 }}>
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Extraction Engine</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--brand-teal)' }}>
              <SparklesIcon size={15} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <span className="kpi-value" style={{ fontSize: '20px', textTransform: 'capitalize' }}>
              {isLoadingProviders ? 'Checking…' : providerStatus?.extraction_provider || 'Rules'}
            </span>
            {!isLoadingProviders && (
              <span className={`badge ${isGeminiActive ? 'badge-success' : 'badge-neutral'}`}>
                {isGeminiActive ? 'AI Active' : 'Deterministic'}
              </span>
            )}
          </div>
          <div className="kpi-subtext">
            {isGeminiActive
              ? 'Model-assisted candidate extraction with rules fallback'
              : 'Deterministic PDF/CSV parser active'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Configured Model</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--brand-blue)' }}>
              <SettingsIcon size={15} />
            </div>
          </div>
          <div
            className="kpi-value font-mono"
            style={{
              fontSize: '15.5px',
              paddingTop: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={activeModelName}
          >
            {isLoadingProviders ? '…' : activeModelName}
          </div>
          <div className="kpi-subtext">Untrusted output gated by schema validation</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">State Persistence</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--success)' }}>
              <DatabaseIcon size={15} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <span className="kpi-value font-mono" style={{ fontSize: '18px' }}>
              {isLoadingProviders ? '…' : providerStatus?.state_store || 'local-sqlite'}
            </span>
            <span className="badge badge-info">Atomic CAS</span>
          </div>
          <div className="kpi-subtext">Revision-locked assessment state & source storage</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Default Currency</span>
            <div className="kpi-icon-wrap">
              <LockIcon size={15} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <span className="kpi-value" style={{ fontSize: '20px' }}>
              {preferences.defaultCurrency}
            </span>
            <span className="badge badge-neutral">{preferences.defaultUnit}</span>
          </div>
          <div className="kpi-subtext">
            {preferences.strictCurrencyEnforcement
              ? 'Strict currency mismatch guard enabled'
              : 'Flexible currency mode'}
          </div>
        </div>
      </div>

      {/* Main 2-Column Settings Grid */}
      <div className="settings-grid">
        {/* Left Column: Assessment Defaults & AI Provider */}
        <div className="settings-col">
          {/* Card 1: Assessment Defaults & Currency */}
          <form onSubmit={handleSavePreferences} className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Assessment Defaults & Currency</div>
                <div className="card-subtitle">
                  Baseline parameters pre-filled when launching new operational assessments or guided enquiries.
                </div>
              </div>
              <span className="badge badge-neutral">Workspace Defaults</span>
            </div>

            <div className="card-body">
              <div className="settings-form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="defaultCurrency">
                    Primary Workspace Currency
                  </label>
                  <select
                    id="defaultCurrency"
                    className="form-control"
                    value={preferences.defaultCurrency}
                    onChange={(e) =>
                      setPreferences({ ...preferences, defaultCurrency: e.target.value })
                    }
                  >
                    {Object.entries(CURRENCY_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="form-hint">
                    Used for effort cost totals unless a different activity currency is acknowledged.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="defaultSector">
                    Default Business Sector
                  </label>
                  <select
                    id="defaultSector"
                    className="form-control"
                    value={preferences.defaultSector}
                    onChange={(e) =>
                      setPreferences({ ...preferences, defaultSector: e.target.value })
                    }
                  >
                    {SECTOR_OPTIONS.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </select>
                  <div className="form-hint">
                    Default industry classification for new process diagnostics.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="defaultPeriod">
                    Default Measurement Period
                  </label>
                  <input
                    id="defaultPeriod"
                    type="text"
                    className="form-control"
                    value={preferences.defaultPeriod}
                    onChange={(e) =>
                      setPreferences({ ...preferences, defaultPeriod: e.target.value })
                    }
                    placeholder="e.g. Last 30 days"
                  />
                  <div className="form-hint">
                    Reference observation window shown on executive PDF reports.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="defaultUnit">
                    Default Throughput Unit
                  </label>
                  <input
                    id="defaultUnit"
                    type="text"
                    className="form-control"
                    value={preferences.defaultUnit}
                    onChange={(e) =>
                      setPreferences({ ...preferences, defaultUnit: e.target.value })
                    }
                    placeholder="e.g. cases, invoices, orders"
                  />
                  <div className="form-hint">
                    Unit label used across monthly volume and handling duration tables.
                  </div>
                </div>
              </div>

              <div className="settings-divider" />

              <div className="settings-section-label">Verification & Audit Controls</div>

              <div className="settings-toggle-list">
                <label
                  className={`settings-toggle-card ${
                    preferences.strictCurrencyEnforcement ? 'active' : ''
                  }`}
                >
                  <div className="settings-toggle-content">
                    <span className="settings-toggle-title">
                      Block Reports with Currency Mismatches
                    </span>
                    <span className="settings-toggle-desc">
                      Block report approval when activity and assessment currencies differ, unless a reviewer explicitly records an assumption acknowledgement.
                    </span>
                  </div>
                  <span className="settings-switch">
                    <input
                      type="checkbox"
                      checked={preferences.strictCurrencyEnforcement}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          strictCurrencyEnforcement: e.target.checked,
                        })
                      }
                    />
                    <span className="settings-switch-track" />
                  </span>
                </label>

                <label
                  className={`settings-toggle-card ${preferences.enableAutoAudit ? 'active' : ''}`}
                >
                  <div className="settings-toggle-content">
                    <span className="settings-toggle-title">Automatic Evidence Audit Trail</span>
                    <span className="settings-toggle-desc">
                      Record source SHA-256 hashes, CSV row numbers, PDF page citations, and original extracted values for every candidate metric.
                    </span>
                  </div>
                  <span className="settings-switch">
                    <input
                      type="checkbox"
                      checked={preferences.enableAutoAudit}
                      onChange={(e) =>
                        setPreferences({ ...preferences, enableAutoAudit: e.target.checked })
                      }
                    />
                    <span className="settings-switch-track" />
                  </span>
                </label>
              </div>
            </div>

            <div className="card-footer">
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Preferences are stored locally for this browser workspace.
              </span>
              <button type="submit" className="btn btn-primary">
                <CheckIcon size={14} />
                <span>Save Assessment Defaults</span>
              </button>
            </div>
          </form>

          {/* Card 2: AI Provider & Extraction Engine */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">AI Provider & Extraction Engine</div>
                <div className="card-subtitle">
                  Live status of server-side document parsing and candidate activity extraction.
                </div>
              </div>
              {isLoadingProviders ? (
                <span className="badge badge-neutral">Checking…</span>
              ) : isGeminiActive ? (
                <span className="badge badge-success">Connected</span>
              ) : (
                <span className="badge badge-warning">Fallback Mode</span>
              )}
            </div>

            <div className="card-body">
              <div className="settings-provider-grid">
                <div className="settings-info-card">
                  <div className="settings-info-top">
                    <span className="settings-info-label">Active Provider</span>
                    {isGeminiActive ? (
                      <span className="badge badge-success">Gemini AI</span>
                    ) : (
                      <span className="badge badge-neutral">Rules / Fallback</span>
                    )}
                  </div>
                  <div className="settings-info-value" style={{ textTransform: 'capitalize' }}>
                    {isLoadingProviders
                      ? 'Loading…'
                      : providerStatus?.extraction_provider || 'rules/manual-review'}
                  </div>
                  <div className="settings-info-desc">
                    {isGeminiActive
                      ? 'AI document analysis is enabled with deterministic fallback protection.'
                      : 'Deterministic rule-based parsing is active for PDF and CSV uploads.'}
                  </div>
                </div>

                <div className="settings-info-card">
                  <div className="settings-info-top">
                    <span className="settings-info-label">Model Configuration</span>
                    <span className="badge badge-info">Verified</span>
                  </div>
                  <div className="settings-info-value font-mono" style={{ fontSize: '13.5px' }}>
                    {isLoadingProviders ? 'Loading…' : activeModelName}
                  </div>
                  <div className="settings-info-desc">
                    Structured JSON schema output validated for required operational fields.
                  </div>
                </div>

                <div className="settings-info-card">
                  <div className="settings-info-top">
                    <span className="settings-info-label">Evidence Ingestion Limits</span>
                    <span className="badge badge-neutral">Enforced</span>
                  </div>
                  <div className="settings-info-value">
                    PDF & CSV · Up to {CONFIG.MAX_UPLOAD_MB} MB
                  </div>
                  <div className="settings-info-desc">
                    Supports multi-page SOP documents (up to 100 pages) and UTF-8 event logs.
                  </div>
                </div>

                <div className="settings-info-card">
                  <div className="settings-info-top">
                    <span className="settings-info-label">Resilience & Fallback</span>
                    <span className="badge badge-success">Always On</span>
                  </div>
                  <div className="settings-info-value">Deterministic Rules Backup</div>
                  <div className="settings-info-desc">
                    Automatically extracts candidate rows if the AI provider times out or is rate-limited.
                  </div>
                </div>
              </div>

              <div className="settings-callout">
                <div className="settings-callout-icon">
                  <ShieldIcon size={16} />
                </div>
                <div>
                  <div className="settings-callout-title">Credential Security & Isolation</div>
                  <div className="settings-callout-text">
                    Provider API keys (<code className="font-mono">AOD_GEMINI_API_KEY</code>) are stored exclusively in server-side environment configuration (<code className="font-mono">api/.env</code>), redacted from logs, and never transmitted to browser clients.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Workspace Profile & Governance */}
        <div className="settings-col">
          {/* Card 3: Workspace Profile */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Workspace Profile</div>
                <div className="card-subtitle">Active environment and runtime bindings.</div>
              </div>
            </div>
            <div className="card-body">
              <div className="settings-meta-list">
                <div className="settings-meta-row">
                  <span className="settings-meta-key">Workspace Name</span>
                  <span className="settings-meta-val">{user?.workspace_name || 'Workspace'}</span>
                </div>
                <div className="settings-meta-row">
                  <span className="settings-meta-key">Signed-In User</span>
                  <span className="settings-meta-val">{user?.full_name || user?.email || '—'}</span>
                </div>
                <div className="settings-meta-row">
                  <span className="settings-meta-key">User Role</span>
                  <span className="settings-meta-val">
                    <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>
                      {user?.role || 'member'}
                    </span>
                  </span>
                </div>
                <div className="settings-meta-row">
                  <span className="settings-meta-key">Environment Tier</span>
                  <span className="settings-meta-val">
                    <span className="badge badge-success">Production Workspace</span>
                  </span>
                </div>
                <div className="settings-meta-row">
                  <span className="settings-meta-key">Authentication Mode</span>
                  <span className="settings-meta-val">
                    <span className="badge badge-neutral">
                      {providerStatus?.production_auth_configured
                        ? 'Local Session Auth & RBAC'
                        : 'Demo Bearer Token'}
                    </span>
                  </span>
                </div>
                <div className="settings-meta-row">
                  <span className="settings-meta-key">State Store Adapter</span>
                  <span className="settings-meta-val font-mono" style={{ fontSize: '12px' }}>
                    {providerStatus?.state_store || 'local-sqlite'}
                  </span>
                </div>
                <div className="settings-meta-row">
                  <span className="settings-meta-key">API Base Endpoint</span>
                  <span className="settings-meta-val font-mono" style={{ fontSize: '12px' }}>
                    {CONFIG.API_BASE_URL}
                  </span>
                </div>
                <div className="settings-meta-row">
                  <span className="settings-meta-key">Application Version</span>
                  <span className="settings-meta-val font-mono" style={{ fontSize: '12px' }}>
                    {CONFIG.APP_VERSION}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: User-Based Access Control */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">User Access Control</div>
                <div className="card-subtitle">
                  Workspace role permissions and team access stored in the local database.
                </div>
              </div>
              <UsersIcon size={16} style={{ color: 'var(--brand-teal)' }} />
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {membersError && (
                <div className="auth-alert" role="alert">
                  <AlertTriangleIcon size={15} />
                  <span>{membersError}</span>
                </div>
              )}

              <div>
                <div className="form-label" style={{ marginBottom: '6px' }}>
                  Your Granted Permissions
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(user?.permissions || []).map((perm) => (
                    <span key={perm} className="badge badge-neutral font-mono" style={{ fontSize: '11px' }}>
                      {perm}
                    </span>
                  ))}
                </div>
              </div>

              {canManageWorkspace && (
                <>
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                    <div className="form-label" style={{ marginBottom: '8px' }}>
                      Workspace Members ({isLoadingMembers ? '…' : members.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {members.map((member) => (
                        <div
                          key={member.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '8px 10px',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '12.5px' }}>
                              {member.full_name || member.email}
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                              {member.email}
                            </div>
                          </div>
                          {member.role === 'owner' ? (
                            <span className="badge badge-success">Owner</span>
                          ) : (
                            <select
                              aria-label={`Role for ${member.email}`}
                              className="form-control"
                              style={{ width: 'auto', minWidth: '105px', padding: '4px 8px', fontSize: '12px' }}
                              value={member.role}
                              onChange={(e) =>
                                void handleRoleChange(
                                  member.id,
                                  e.target.value as 'admin' | 'analyst' | 'viewer'
                                )
                              }
                            >
                              <option value="admin">Admin</option>
                              <option value="analyst">Analyst</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <form
                    onSubmit={handleAddMember}
                    style={{
                      borderTop: '1px solid var(--border-subtle)',
                      paddingTop: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div className="form-label">Add Workspace Member</div>
                    <div className="auth-two-col">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Full name"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                      />
                      <input
                        type="email"
                        className="form-control"
                        placeholder="Email address"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                      />
                    </div>
                    <div className="auth-two-col">
                      <input
                        type="password"
                        className="form-control"
                        placeholder="Initial password (min 8 chars)"
                        value={newMemberPassword}
                        onChange={(e) => setNewMemberPassword(e.target.value)}
                      />
                      <select
                        className="form-control"
                        value={newMemberRole}
                        onChange={(e) =>
                          setNewMemberRole(e.target.value as 'admin' | 'analyst' | 'viewer')
                        }
                      >
                        <option value="admin">Admin</option>
                        <option value="analyst">Analyst</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={isCreatingMember}
                      className="btn btn-secondary btn-sm"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      <PlusIcon size={14} />
                      <span>{isCreatingMember ? 'Adding…' : 'Add Member'}</span>
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>

          {/* Card 5: Governance & Policies */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Governance & Policies</div>
                <div className="card-subtitle">
                  Non-negotiable financial and evidentiary controls.
                </div>
              </div>
              <ShieldIcon size={16} style={{ color: 'var(--brand-teal)' }} />
            </div>
            <div className="card-body">
              <ul className="settings-policy-list">
                <li className="settings-policy-item">
                  <span className="settings-policy-check">
                    <CheckIcon size={12} />
                  </span>
                  <div className="settings-policy-text">
                    <strong>Human-in-the-Loop Gate</strong>
                    Unconfirmed or AI-extracted candidate facts are strictly excluded from authoritative cost and hour totals.
                  </div>
                </li>
                <li className="settings-policy-item">
                  <span className="settings-policy-check">
                    <CheckIcon size={12} />
                  </span>
                  <div className="settings-policy-text">
                    <strong>Deterministic Calculation Engine</strong>
                    Annual handling effort, labor cost, and 10% / 20% / 35% capacity scenarios are computed deterministically—never by an LLM.
                  </div>
                </li>
                <li className="settings-policy-item">
                  <span className="settings-policy-check">
                    <CheckIcon size={12} />
                  </span>
                  <div className="settings-policy-text">
                    <strong>Sandbox Isolation</strong>
                    Sandbox simulation tests are segregated from production assessments and excluded from executive KPIs.
                  </div>
                </li>
                <li className="settings-policy-item">
                  <span className="settings-policy-check">
                    <CheckIcon size={12} />
                  </span>
                  <div className="settings-policy-text">
                    <strong>Audit & Revision Control</strong>
                    Every upload, fact edit, and approval increments the assessment revision and invalidates prior PDF approvals.
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

