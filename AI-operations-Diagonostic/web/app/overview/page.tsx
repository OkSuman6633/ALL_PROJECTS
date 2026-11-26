'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Assessment } from '@/types/assessment';
import {
  AssessmentsIcon,
  ReportsIcon,
  SandboxIcon,
  RecommendationsIcon,
  PlusIcon,
  ChevronRight,
  AlertTriangleIcon,
  RefreshIcon,
} from '@/components/icons';
import { formatCurrency, formatDate } from '@/lib/formatters';

export default function OverviewPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverviewData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getAssessments();
      setAssessments(res.items);
    } catch (err) {
      setError((err as Error).message || 'Failed to fetch overview metrics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchOverviewData();
  }, []);

  // Compute live KPI metrics from real production assessments only
  const kpis = useMemo(() => {
    const total = assessments.length;
    const inProgress = assessments.filter((a) => a.status !== 'COMPLETE').length;
    const approvedReports = assessments.filter((a) => a.report_ready).length;
    const pendingReviews = assessments.filter((a) => a.status === 'REVIEW').length;

    // Total potential annual labour value across calculation-eligible assessments
    let totalLaborValue = 0;
    const currencyMap: Record<string, number> = {};

    assessments.forEach((a) => {
      if (a.calculations?.annual_effort_cost) {
        const val = parseFloat(a.calculations.annual_effort_cost) || 0;
        const curr = a.calculations.currency || a.currency || 'GBP';
        totalLaborValue += val;
        currencyMap[curr] = (currencyMap[curr] || 0) + val;
      }
    });

    const dominantCurrency = Object.keys(currencyMap)[0] || 'GBP';

    // Status breakdown
    const statusCounts: Record<string, number> = {
      CREATED: 0,
      REVIEW: 0,
      RUNNING: 0,
      COMPLETE: 0,
    };
    assessments.forEach((a) => {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    });

    // Recent events across all assessments
    const allEvents: Array<{ event: string; at: string; processName: string; assessmentId: string }> = [];
    assessments.forEach((a) => {
      (a.events || []).forEach((e) => {
        allEvents.push({
          event: e.event,
          at: e.at,
          processName: a.process_name,
          assessmentId: a.id,
        });
      });
    });
    allEvents.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    // Top recommendations across assessments
    const topRecommendations = assessments
      .flatMap((a) =>
        (a.calculations?.recommendations || []).map((r) => ({
          ...r,
          processName: a.process_name,
          assessmentId: a.id,
          currency: a.calculations?.currency || a.currency || 'GBP',
        }))
      )
      .slice(0, 5);

    return {
      total,
      inProgress,
      approvedReports,
      pendingReviews,
      totalLaborValue,
      dominantCurrency,
      statusCounts,
      recentEvents: allEvents.slice(0, 6),
      topRecommendations,
    };
  }, [assessments]);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Operations Overview</h1>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchOverviewData}
            disabled={isLoading}
            title="Refresh overview metrics"
          >
            <RefreshIcon size={14} />
            <span>Refresh</span>
          </button>
          <Link href="/sandbox" className="btn btn-secondary">
            <SandboxIcon size={14} />
            <span>Open Sandbox</span>
          </Link>
          <Link href="/assessments/new" className="btn btn-primary">
            <PlusIcon size={14} />
            <span>New Assessment</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-banner-error">
          <AlertTriangleIcon size={16} />
          <div>{error}</div>
        </div>
      )}

      {/* KPI Section */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Total Assessments</span>
            <div className="kpi-icon-wrap">
              <AssessmentsIcon size={16} />
            </div>
          </div>
          <div className="kpi-value tabular-nums">
            {isLoading ? '...' : kpis.total}
          </div>
          <div className="kpi-subtext">Active operational assessments</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">In Progress</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--brand-teal)' }}>
              <AssessmentsIcon size={16} />
            </div>
          </div>
          <div className="kpi-value tabular-nums">
            {isLoading ? '...' : kpis.inProgress}
          </div>
          <div className="kpi-subtext">Baseline or evidence review stages</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Pending Reviews</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--warning)' }}>
              <AlertTriangleIcon size={16} />
            </div>
          </div>
          <div className="kpi-value tabular-nums">
            {isLoading ? '...' : kpis.pendingReviews}
          </div>
          <div className="kpi-subtext">Require reviewer fact confirmation</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Approved Reports</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--success)' }}>
              <ReportsIcon size={16} />
            </div>
          </div>
          <div className="kpi-value tabular-nums">
            {isLoading ? '...' : kpis.approvedReports}
          </div>
          <div className="kpi-subtext">Verified and ready for PDF export</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Analyzed Annual Effort Value</span>
            <div className="kpi-icon-wrap" style={{ color: 'var(--brand-blue)' }}>
              <RecommendationsIcon size={16} />
            </div>
          </div>
          <div className="kpi-value tabular-nums">
            {isLoading
              ? '...'
              : formatCurrency(kpis.totalLaborValue, kpis.dominantCurrency)}
          </div>
          <div className="kpi-subtext">Calculated from confirmed facts only</div>
        </div>
      </div>

      {/* Main Grid: Status Distribution & Recommendations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Status Distribution */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Assessment Status Distribution</div>
            </div>
          </div>
          <div className="card-body">
            {assessments.length === 0 && !isLoading ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <AssessmentsIcon size={32} />
                <div className="empty-state-title">No assessments yet</div>
                <div className="empty-state-desc">Create an assessment to see progress here.</div>
                <Link href="/assessments/new" className="btn btn-primary btn-sm">Create Assessment</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Complete / Ready for Report', count: kpis.statusCounts.COMPLETE || 0, color: 'var(--success)', bg: 'var(--success-bg)' },
                  { label: 'In Review (Pending Confirmation)', count: kpis.statusCounts.REVIEW || 0, color: 'var(--warning)', bg: 'var(--warning-bg)' },
                  { label: 'Baseline Created', count: kpis.statusCounts.CREATED || 0, color: 'var(--brand-teal)', bg: '#f0fdfa' },
                  { label: 'Analysis Running', count: kpis.statusCounts.RUNNING || 0, color: 'var(--info)', bg: 'var(--info-bg)' },
                ].map((item) => {
                  const pct = kpis.total > 0 ? Math.round((item.count / kpis.total) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{item.label}</span>
                        <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <div style={{ height: '6px', background: 'var(--bg-muted)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: '3px', transition: 'width 300ms ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Improvement Opportunities Overview */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Improvement Opportunities</div>
            </div>
            <Link href="/recommendations" className="btn btn-ghost btn-sm">
              <span>View all</span>
              <ChevronRight size={14} />
            </Link>
          </div>
          <div className="card-body" style={{ padding: '12px 20px' }}>
            {kpis.topRecommendations.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <RecommendationsIcon size={32} />
                <div className="empty-state-title">No recommendations yet</div>
                <div className="empty-state-desc">Complete and submit an assessment to see recommendations here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {kpis.topRecommendations.map((rec, idx) => (
                  <div
                    key={`${rec.id}-${idx}`}
                    style={{
                      padding: '10px 12px',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--brand-navy)' }}>
                        {rec.title}
                      </span>
                      <span className={`badge ${rec.priority === 'investigate' ? 'badge-info' : 'badge-warning'}`}>
                        {rec.priority}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineClamp: 2 }}>
                      {rec.rationale}
                    </p>
                    <div style={{ fontSize: '11px', color: 'var(--brand-teal)', marginTop: '4px', fontWeight: 500 }}>
                      Process: {rec.processName} · {rec.evidence.length} evidence references
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity Timeline & Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Recent Workspace Events */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent Workspace Activity</div>
            </div>
            <Link href="/history" className="btn btn-ghost btn-sm">
              <span>Full audit history</span>
              <ChevronRight size={14} />
            </Link>
          </div>
          <div className="card-body" style={{ padding: '0 20px' }}>
            {kpis.recentEvents.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-state-desc">No activity recorded yet.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {kpis.recentEvents.map((evt, idx) => (
                  <div
                    key={`${evt.assessmentId}-${evt.at}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: idx < kpis.recentEvents.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: evt.event.includes('APPROVED')
                            ? 'var(--success)'
                            : evt.event.includes('EVIDENCE')
                            ? 'var(--brand-teal)'
                            : 'var(--brand-navy)',
                        }}
                      />
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {evt.event.replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          Process: {evt.processName}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>
                      {formatDate(evt.at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Launchpad */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Quick Actions</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link href="/assessments/new" className="btn btn-primary" style={{ justifyContent: 'flex-start' }}>
              <PlusIcon size={16} />
              <span>Create New Assessment</span>
            </Link>
            <Link href="/assessments" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <AssessmentsIcon size={16} />
              <span>Manage Assessments</span>
            </Link>
            <Link href="/sandbox" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <SandboxIcon size={16} />
              <span>Launch Sandbox Test</span>
            </Link>
            <Link href="/reports" className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
              <ReportsIcon size={16} />
              <span>View Approved Reports</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
