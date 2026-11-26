'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Assessment } from '@/types/assessment';
import {
  SandboxIcon,
  TrashIcon,
  RefreshIcon,
  ChevronRight,
  AlertTriangleIcon,
  CheckIcon,
  PlayIcon,
} from '@/components/icons';
import { formatDate } from '@/lib/formatters';

interface SampleScenario {
  id: string;
  title: string;
  sector: string;
  description: string;
  currency: string;
  activities: Array<{
    label: string;
    monthly_volume: number;
    minutes_per_unit: number;
    hourly_rate: number;
    currency: string;
    confirmed: boolean;
  }>;
}

const SAMPLE_SCENARIOS: SampleScenario[] = [
  {
    id: 'retail-order',
    title: 'Retail — Standard Order Processing',
    sector: 'Retail & E-Commerce',
    description: 'E-commerce fulfillment workflow covering cart verification, warehouse picking, and dispatch.',
    currency: 'GBP',
    activities: [
      { label: 'Order verification & fraud check', monthly_volume: 1200, minutes_per_unit: 4, hourly_rate: 24, currency: 'GBP', confirmed: true },
      { label: 'Warehouse picking & packing', monthly_volume: 1200, minutes_per_unit: 8, hourly_rate: 20, currency: 'GBP', confirmed: true },
      { label: 'Courier manifest & dispatch label', monthly_volume: 1200, minutes_per_unit: 3, hourly_rate: 18, currency: 'GBP', confirmed: true },
    ],
  },
  {
    id: 'finance-ap',
    title: 'Finance — Accounts Payable',
    sector: 'Financial Services',
    description: 'Invoice 3-way matching, discrepancy resolution, and payment batch scheduling.',
    currency: 'USD',
    activities: [
      { label: 'Invoice intake & OCR header capture', monthly_volume: 800, minutes_per_unit: 5, hourly_rate: 32, currency: 'USD', confirmed: true },
      { label: '3-way purchase order matching', monthly_volume: 800, minutes_per_unit: 9, hourly_rate: 35, currency: 'USD', confirmed: true },
      { label: 'Exception review & supplier inquiry', monthly_volume: 160, minutes_per_unit: 18, hourly_rate: 38, currency: 'USD', confirmed: true },
      { label: 'Payment release authorization', monthly_volume: 800, minutes_per_unit: 2, hourly_rate: 45, currency: 'USD', confirmed: true },
    ],
  },
  {
    id: 'fin-services-dq',
    title: 'Financial Services — Data Quality Validation',
    sector: 'Financial Services',
    description: 'Strict validation test suite with edge cases: zero handling times, missing rates, and currency mismatches.',
    currency: 'GBP',
    activities: [
      { label: 'Automated ledger reconciliation', monthly_volume: 500, minutes_per_unit: 0, hourly_rate: 40, currency: 'GBP', confirmed: true },
      { label: 'Manual exception underwriting', monthly_volume: 150, minutes_per_unit: 14, hourly_rate: 42, currency: 'GBP', confirmed: true },
      { label: 'Cross-border foreign exchange conversion', monthly_volume: 200, minutes_per_unit: 6, hourly_rate: 35, currency: 'USD', confirmed: true },
    ],
  },
  {
    id: 'customer-support',
    title: 'Customer Support — Ticket Processing',
    sector: 'Customer Support & BPO',
    description: 'Tier-1 and Tier-2 inquiry handling, triage categorization, and escalation routing.',
    currency: 'GBP',
    activities: [
      { label: 'Inbound email ticket triage & tagging', monthly_volume: 2500, minutes_per_unit: 2.5, hourly_rate: 22, currency: 'GBP', confirmed: true },
      { label: 'Standard resolution response', monthly_volume: 2000, minutes_per_unit: 6, hourly_rate: 22, currency: 'GBP', confirmed: true },
      { label: 'Complex issue escalation to engineering', monthly_volume: 500, minutes_per_unit: 15, hourly_rate: 34, currency: 'GBP', confirmed: true },
    ],
  },
  {
    id: 'manufacturing-qc',
    title: 'Manufacturing — Quality Inspection',
    sector: 'Manufacturing',
    description: 'Assembly line sample testing, defect logging, and batch compliance certification.',
    currency: 'EUR',
    activities: [
      { label: 'Visual surface defect inspection', monthly_volume: 600, minutes_per_unit: 7, hourly_rate: 26, currency: 'EUR', confirmed: true },
      { label: 'Dimensional tolerance measurement', monthly_volume: 600, minutes_per_unit: 12, hourly_rate: 28, currency: 'EUR', confirmed: true },
      { label: 'Batch non-conformance quarantine documentation', monthly_volume: 45, minutes_per_unit: 25, hourly_rate: 32, currency: 'EUR', confirmed: true },
    ],
  },
];

export default function SandboxPage() {
  const router = useRouter();
  const [sandboxAssessments, setSandboxAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const fetchSandboxData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Query exclusively sandbox assessments
      const res = await api.getAssessments({ is_sandbox: true });
      setSandboxAssessments(res.items);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch sandbox assessments.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchSandboxData();
  }, []);

  const handleLaunchScenario = async (scenario: SampleScenario) => {
    setIsLaunching(true);
    setError(null);
    try {
      const payload = {
        process_name: `[SANDBOX] ${scenario.title}`,
        sector: scenario.sector,
        period: 'Representative Month (Simulated)',
        unit: 'cases',
        currency: scenario.currency,
        goals: `Simulation test: ${scenario.description}`,
        is_sandbox: true,
        activity_inputs: scenario.activities,
      };

      const created = await api.createAssessment(payload);
      router.push(`/assessments/${created.id}/baseline`);
    } catch (err) {
      setError((err as Error).message || 'Failed to initialize sandbox test scenario.');
      setIsLaunching(false);
    }
  };

  const handleResetSandbox = async () => {
    setIsResetting(true);
    setError(null);
    try {
      const res = await api.resetSandbox();
      setShowResetModal(false);
      setNotice(res.message || 'Sandbox assessments reset successfully.');
      await fetchSandboxData();
    } catch (err) {
      setError((err as Error).message || 'Failed to reset sandbox data.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div>
      {/* Sandbox Environment Alert Banner */}
      <div className="alert-banner alert-banner-sandbox" style={{ marginBottom: '24px' }}>
        <SandboxIcon size={20} style={{ color: 'var(--sandbox-accent)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: 'var(--brand-navy)' }}>
            SANDBOX — ISOLATED TESTING
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Sandbox tests are isolated and do not affect production assessments.
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Sandbox Environment</h1>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchSandboxData}
            disabled={isLoading}
          >
            <RefreshIcon size={14} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setShowResetModal(true)}
            disabled={isResetting || sandboxAssessments.length === 0}
            title="Reset sandbox data"
          >
            <TrashIcon size={14} />
            <span>Reset Sandbox Data</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="alert-banner alert-banner-success">
          <CheckIcon size={16} />
          <div>{notice}</div>
        </div>
      )}

      {error && (
        <div className="alert-banner alert-banner-error">
          <AlertTriangleIcon size={16} />
          <div>{error}</div>
        </div>
      )}

      {/* Sample Test Scenarios Grid */}
      <div className="card" style={{ marginBottom: '28px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Pre-configured Test Scenarios</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {SAMPLE_SCENARIOS.map((scenario) => (
              <div
                key={scenario.id}
                style={{
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px',
                  background: 'var(--bg-canvas)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--brand-navy)' }}>
                      {scenario.title}
                    </span>
                    <span className="badge badge-sandbox" style={{ fontSize: '10px' }}>
                      {scenario.currency}
                    </span>
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
                    {scenario.description}
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--brand-teal)', marginBottom: '14px', fontWeight: 500 }}>
                    {scenario.activities.length} initial activities ({scenario.activities.map((a) => a.label).slice(0, 2).join(', ')}…)
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%' }}
                  disabled={isLaunching}
                  onClick={() => handleLaunchScenario(scenario)}
                >
                  <PlayIcon size={12} />
                  <span>Launch Simulation Test</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Sandbox Test Experiments */}
      <div className="table-wrapper">
        <div className="table-toolbar">
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--brand-navy)' }}>
            Sandbox Assessments ({sandboxAssessments.length})
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading sandbox tests...
          </div>
        ) : sandboxAssessments.length === 0 ? (
          <div className="empty-state">
            <SandboxIcon size={36} />
            <div className="empty-state-title">No sandbox tests running</div>
            <div className="empty-state-desc">
              Launch a test scenario above to get started.
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Test Process Name</th>
                <th>Sector</th>
                <th>Revision</th>
                <th>Status</th>
                <th>Last Modified</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sandboxAssessments.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <Link
                        href={`/assessments/${item.id}/baseline`}
                        style={{ fontWeight: 600, color: 'var(--brand-navy)' }}
                      >
                        {item.process_name}
                      </Link>
                    </div>
                  </td>
                  <td>{item.sector}</td>
                  <td className="tabular-nums">Rev {item.revision}</td>
                  <td>
                    <span className="badge badge-sandbox">{item.status}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {formatDate(item.updated_at)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      href={`/assessments/${item.id}/baseline`}
                      className="btn btn-secondary btn-sm"
                    >
                      <span>Open Test Workspace</span>
                      <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirmation Modal for Destructive Sandbox Reset */}
      {showResetModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">Confirm Sandbox Reset</span>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Are you sure you want to reset all sandbox test data?
              </p>
              <div
                style={{
                  padding: '12px',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-default)',
                }}
              >
                Only sandbox records will be deleted. Production assessments, reports, and revision history will not be affected.
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleResetSandbox}
                disabled={isResetting}
              >
                {isResetting ? 'Resetting...' : 'Reset Sandbox Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
