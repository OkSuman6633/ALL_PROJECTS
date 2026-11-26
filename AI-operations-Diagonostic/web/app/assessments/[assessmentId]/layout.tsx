'use client';

import React from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AssessmentProvider, useAssessmentContext } from '@/components/assessment/AssessmentContext';
import { AlertTriangleIcon, CheckIcon, CloseIcon, RefreshIcon } from '@/components/icons';

function AssessmentWorkspaceHeader() {
  const pathname = usePathname();
  const { assessment, isLoading, isBusy, errorMessage, successNotice, setErrorMessage, setSuccessNotice, reload } =
    useAssessmentContext();

  if (isLoading || !assessment) {
    return (
      <div style={{ padding: '24px 0', color: 'var(--text-muted)' }}>
        Loading assessment workspace...
      </div>
    );
  }

  const isSandbox = Boolean(assessment.is_sandbox);
  const statusClass =
    assessment.status === 'COMPLETE'
      ? 'badge-success'
      : assessment.status === 'REVIEW'
      ? 'badge-warning'
      : assessment.status === 'RUNNING'
      ? 'badge-info'
      : 'badge-neutral';

  return (
    <div>
      {/* Sandbox Alert Banner if Sandbox */}
      {isSandbox && (
        <div className="alert-banner alert-banner-sandbox">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-sandbox">SANDBOX ENVIRONMENT</span>
            <span style={{ fontWeight: 500, fontSize: '13px' }}>
              This is an isolated test assessment. Calculations, uploads, and report simulations will not affect production records.
            </span>
          </div>
        </div>
      )}

      {/* Global Toast / Feedback Banners */}
      {errorMessage && (
        <div className="alert-banner alert-banner-error">
          <AlertTriangleIcon size={16} />
          <div style={{ flex: 1 }}>{errorMessage}</div>
          <button
            type="button"
            className="alert-close-btn"
            onClick={() => setErrorMessage('')}
            aria-label="Dismiss error"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {successNotice && (
        <div className="alert-banner alert-banner-success">
          <CheckIcon size={16} />
          <div style={{ flex: 1 }}>{successNotice}</div>
          <button
            type="button"
            className="alert-close-btn"
            onClick={() => setSuccessNotice('')}
            aria-label="Dismiss notice"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Workspace Header */}
      <div className="page-header" style={{ marginBottom: '18px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span className={`badge ${statusClass}`}>{assessment.status}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Currency: <strong>{assessment.currency || 'GBP'}</strong>
            </span>
            {assessment.calculations?.currency && assessment.calculations.currency !== (assessment.currency || 'GBP') && (
              <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                Evidence Mismatch: {assessment.calculations.currency}
              </span>
            )}
          </div>
          <h1 className="page-title">{assessment.process_name}</h1>
          <p className="page-subtitle">
            Sector: {assessment.sector} · Period: {assessment.period} · Unit: {assessment.unit}
            {assessment.goals && ` · Goal: ${assessment.goals}`}
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={reload}
            disabled={isBusy}
            title="Refresh assessment"
          >
            <RefreshIcon size={14} />
            <span>Sync</span>
          </button>
          <Link
            href={isSandbox ? '/sandbox' : '/assessments'}
            className="btn btn-secondary btn-sm"
          >
            <span>Exit Workspace</span>
          </Link>
        </div>
      </div>

      <nav aria-label="Diagnostic sections" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-default)', paddingBottom: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Diagnostic', href: `/assessments/${assessment.id}` },
          { label: 'Recommendations', href: `/assessments/${assessment.id}/recommendations` },
          { label: 'Report', href: `/assessments/${assessment.id}/report` },
        ].map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={active ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            >
              {item.label}
            </Link>
          );
        })}
        <details style={{ marginLeft: 'auto', position: 'relative' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px', padding: '7px 10px' }}>Advanced stages</summary>
          <div style={{ position: 'absolute', right: 0, zIndex: 2, display: 'grid', gap: '6px', minWidth: '180px', padding: '10px', background: 'var(--bg-canvas)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)' }}>
            <Link href={`/assessments/${assessment.id}/baseline`}>Baseline details</Link>
            <Link href={`/assessments/${assessment.id}/evidence`}>Evidence management</Link>
            <Link href={`/assessments/${assessment.id}/review`}>Detailed fact review</Link>
          </div>
        </details>
      </nav>
    </div>
  );
}

export default function AssessmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const assessmentId = params?.assessmentId as string;

  return (
    <AssessmentProvider assessmentId={assessmentId}>
      <AssessmentWorkspaceHeader />
      <div>{children}</div>
    </AssessmentProvider>
  );
}
