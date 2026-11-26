'use client';

import React from 'react';
import Link from 'next/link';
import { LogoIcon, ShieldIcon, CheckIcon } from '@/components/icons';

interface AuthShellProps {
  mode: 'login' | 'register' | 'onboarding';
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthShell({ mode, title, subtitle, children }: AuthShellProps) {
  return (
    <div className="auth-layout">
      <div className="auth-container">
        {/* Left Brand / Governance Panel */}
        <div className="auth-brand-panel">
          <div className="auth-brand-header">
            <div className="auth-brand-logo">
              <LogoIcon size={20} />
            </div>
            <div>
              <div className="auth-brand-title">AI Operations Diagnostic</div>
              <div className="auth-brand-sub">Operational Intelligence Platform</div>
            </div>
          </div>

          <div className="auth-brand-copy">
            <h1>Evidence-led operational intelligence for every workspace.</h1>
            <p>
              Upload standard operating procedures or workflow logs, verify operational metrics with
              human-in-the-loop controls, and export executive diagnostic reports.
            </p>
          </div>

          <ul className="auth-feature-list">
            <li>
              <span className="auth-feature-icon">
                <CheckIcon size={13} />
              </span>
              <span>Workspace-isolated assessments and reports</span>
            </li>
            <li>
              <span className="auth-feature-icon">
                <CheckIcon size={13} />
              </span>
              <span>Role-based access control (Owner, Admin, Analyst, Viewer)</span>
            </li>
            <li>
              <span className="auth-feature-icon">
                <CheckIcon size={13} />
              </span>
              <span>Deterministic cost and capacity modeling</span>
            </li>
          </ul>

          <div className="auth-brand-footer">
            <ShieldIcon size={14} />
            <span>Credentials &amp; sessions stored securely in local database</span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="auth-card-panel">
          {mode !== 'onboarding' && (
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <Link
                href="/login"
                role="tab"
                aria-selected={mode === 'login'}
                className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              >
                Sign In
              </Link>
              <Link
                href="/register"
                role="tab"
                aria-selected={mode === 'register'}
                className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              >
                Register
              </Link>
            </div>
          )}

          {mode === 'onboarding' && (
            <div className="auth-step-indicator">
              <span className="auth-step-pill done">1. Account Created</span>
              <span className="auth-step-sep">→</span>
              <span className="auth-step-pill active">2. Workspace &amp; Profile</span>
            </div>
          )}

          <div className="auth-card-head">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
