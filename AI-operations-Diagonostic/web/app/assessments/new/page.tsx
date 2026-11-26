'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { buildMetadataAssessmentPayload } from '@/lib/diagnosticWorkflow';
import { ChevronRight, AlertTriangleIcon } from '@/components/icons';

export default function NewAssessmentPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [processName, setProcessName] = useState('');
  const [sector, setSector] = useState('Financial Services');
  const [period, setPeriod] = useState('Last 30 days');
  const [unit, setUnit] = useState('cases');
  const [currency, setCurrency] = useState('GBP');
  const [goals, setGoals] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    if (!processName.trim()) {
      setErrorMessage('Enter a process name to create the diagnostic.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.createAssessment(
        buildMetadataAssessmentPayload({
          process_name: processName.trim(),
          sector,
          period,
          unit: unit.trim(),
          currency,
          goals: goals.trim(),
        })
      );
      router.push(`/assessments/${created.id}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Failed to create diagnostic.';
      setErrorMessage(
        detail
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Link href="/assessments" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Assessments
            </Link>
            <ChevronRight size={12} style={{ color: 'var(--text-faint)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
              New diagnostic
            </span>
          </div>
          <h1 className="page-title">Create a diagnostic</h1>
          <p className="page-subtitle">
            Define the process you want to improve.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="alert-banner alert-banner-error" role="alert">
          <AlertTriangleIcon size={16} />
          <div>{errorMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Process context</div>
            </div>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label" htmlFor="processName">
                Process name <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <input
                id="processName"
                className="form-control"
                type="text"
                placeholder="e.g. Supplier invoice processing"
                value={processName}
                onChange={(event) => setProcessName(event.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="sector">Business sector</label>
                <select id="sector" className="form-control" value={sector} onChange={(event) => setSector(event.target.value)}>
                  <option value="Financial Services">Financial Services</option>
                  <option value="Retail & E-Commerce">Retail & E-Commerce</option>
                  <option value="Healthcare & Life Sciences">Healthcare & Life Sciences</option>
                  <option value="Logistics & Supply Chain">Logistics & Supply Chain</option>
                  <option value="Customer Support & BPO">Customer Support & BPO</option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Public Sector">Public Sector</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="period">Measurement period</label>
                <select id="period" className="form-control" value={period} onChange={(event) => setPeriod(event.target.value)}>
                  <option value="Last 30 days">Last 30 days</option>
                  <option value="Last quarter">Last quarter</option>
                  <option value="Prior 12 months">Prior 12 months</option>
                  <option value="Representative month">Representative month</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="unit">Throughput unit</label>
                <input id="unit" className="form-control" value={unit} onChange={(event) => setUnit(event.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="currency">Assessment currency</label>
                <select id="currency" className="form-control" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="goals">Improvement objective <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <textarea
                id="goals"
                className="form-control"
                rows={3}
                value={goals}
                onChange={(event) => setGoals(event.target.value)}
                placeholder="What would you like to improve?"
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '18px' }}>
          <Link href="/assessments" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating diagnostic…' : 'Create diagnostic'}
          </button>
        </div>
      </form>
    </div>
  );
}
