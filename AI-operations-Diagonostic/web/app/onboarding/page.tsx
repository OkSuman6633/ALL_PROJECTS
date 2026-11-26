'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { SECTOR_OPTIONS } from '@/lib/config';
import { AlertTriangleIcon, ChevronRight, LogOutIcon } from '@/components/icons';

const CURRENCY_OPTIONS = [
  { code: 'GBP', label: 'GBP (£) — British Pound' },
  { code: 'USD', label: 'USD ($) — US Dollar' },
  { code: 'EUR', label: 'EUR (€) — Euro' },
  { code: 'INR', label: 'INR (₹) — Indian Rupee' },
  { code: 'AUD', label: 'AUD ($) — Australian Dollar' },
  { code: 'CAD', label: 'CAD ($) — Canadian Dollar' },
  { code: 'SGD', label: 'SGD ($) — Singapore Dollar' },
];

export default function OnboardingPage() {
  const { user, completeOnboarding, logout } = useAuth();
  const router = useRouter();

  const [workspaceName, setWorkspaceName] = useState(user?.workspace_name || '');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [jobTitle, setJobTitle] = useState(user?.job_title || 'Operations Lead');
  const [sector, setSector] = useState<string>(user?.sector || SECTOR_OPTIONS[0]);
  const [defaultCurrency, setDefaultCurrency] = useState<string>(user?.default_currency || 'GBP');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (workspaceName.trim().length < 2) {
      setError('Workspace name must be at least 2 characters.');
      return;
    }
    if (fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }

    setIsSubmitting(true);
    try {
      await completeOnboarding({
        workspace_name: workspaceName.trim(),
        full_name: fullName.trim(),
        job_title: jobTitle.trim() || 'Operations Lead',
        sector,
        default_currency: defaultCurrency,
      });
      router.replace('/start');
    } catch (err) {
      setError((err as Error).message || 'Could not save workspace details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      mode="onboarding"
      title="Set up your workspace"
      subtitle={
        user?.email
          ? `Signed in as ${user.email}. Complete your profile and workspace details to enter the platform.`
          : 'Complete your profile and workspace details to enter the platform.'
      }
    >
      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        {error && (
          <div className="auth-alert" role="alert">
            <AlertTriangleIcon size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="onboarding-workspace" className="form-label">
            Workspace name
          </label>
          <input
            id="onboarding-workspace"
            name="workspace_name"
            type="text"
            required
            className="form-control"
            placeholder="e.g. Acme Operations"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            autoFocus
          />
          <span className="form-hint">
            All assessments, evidence uploads, and reports are isolated to this workspace.
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="onboarding-fullname" className="form-label">
            Your full name
          </label>
          <input
            id="onboarding-fullname"
            name="full_name"
            type="text"
            required
            className="form-control"
            placeholder="e.g. Jane Smith"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="onboarding-title" className="form-label">
            Role / Job title
          </label>
          <input
            id="onboarding-title"
            name="job_title"
            type="text"
            className="form-control"
            placeholder="e.g. Operations Lead"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>

        <div className="auth-two-col">
          <div className="form-group">
            <label htmlFor="onboarding-sector" className="form-label">
              Industry sector
            </label>
            <select
              id="onboarding-sector"
              name="sector"
              className="form-control"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            >
              {SECTOR_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="onboarding-currency" className="form-label">
              Default currency
            </label>
            <select
              id="onboarding-currency"
              name="default_currency"
              className="form-control"
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary btn-lg auth-submit-btn"
        >
          <span>{isSubmitting ? 'Entering platform…' : 'Enter Platform'}</span>
          <ChevronRight size={15} />
        </button>

        <div className="auth-onboarding-footer">
          <button type="button" onClick={() => void logout()} className="btn btn-ghost btn-sm">
            <LogOutIcon size={14} />
            <span>Use a different account</span>
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
