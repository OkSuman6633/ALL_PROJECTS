'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Assessment } from '@/types/assessment';
import {
  ReportsIcon,
  SearchIcon,
  DownloadIcon,
  ChevronRight,
  RefreshIcon,
  AlertTriangleIcon,
} from '@/components/icons';
import { formatDate, formatCurrency, formatHours } from '@/lib/formatters';

export default function ReportsLibraryPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [showPending, setShowPending] = useState(false);

  const fetchReports = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Production assessments only
      const res = await api.getAssessments();
      setAssessments(res.items);
    } catch (err) {
      setError((err as Error).message || 'Failed to load reports.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchReports();
  }, []);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    assessments.forEach((a) => {
      if (a.sector) set.add(a.sector);
    });
    return Array.from(set).sort();
  }, [assessments]);

  const reportItems = useMemo(() => {
    return assessments.filter((a) => {
      const isApproved = a.report_ready;
      if (!showPending && !isApproved) return false;

      const matchesSearch =
        a.process_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSector =
        sectorFilter === 'ALL' || a.sector === sectorFilter;

      return matchesSearch && matchesSector;
    });
  }, [assessments, searchQuery, sectorFilter, showPending]);

  const handleDownload = async (assessment: Assessment) => {
    try {
      const blob = await api.downloadReportPdf(assessment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const reportName = assessment.process_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'diagnostic';
      link.download = `${reportName}-report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message || 'Failed to download report PDF.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchReports}
            disabled={isLoading}
          >
            <RefreshIcon size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-banner-error">
          <AlertTriangleIcon size={16} />
          <div>{error}</div>
        </div>
      )}

      <div className="table-wrapper">
        <div className="table-toolbar">
          <div className="search-input-wrap">
            <SearchIcon size={14} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search reports by process or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="table-filters">
            <select
              className="filter-select"
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
            >
              <option value="ALL">All Sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPending}
                onChange={(e) => setShowPending(e.target.checked)}
              />
              <span>Include unapproved drafts</span>
            </label>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading report library...
          </div>
        ) : reportItems.length === 0 ? (
          <div className="empty-state">
            <ReportsIcon size={36} />
            <div className="empty-state-title">No approved reports found</div>
            <div className="empty-state-desc">
              {showPending
                ? 'No assessments match your current filters.'
                : 'Approve an assessment to see its report here.'}
            </div>
            <Link href="/assessments" className="btn btn-primary btn-sm">
              View In-Progress Assessments
            </Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Report Title / Process</th>
                <th>Sector</th>
                <th>Annual Handling Effort</th>
                <th>Labour Cost</th>
                <th>Approval Status</th>
                <th>Date Generated</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reportItems.map((item) => {
                const hours = item.calculations?.annual_hours;
                const cost = item.calculations?.annual_effort_cost;
                const curr = item.calculations?.currency || item.currency || 'GBP';

                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Link
                          href={`/assessments/${item.id}/report`}
                          style={{ fontWeight: 600, color: 'var(--brand-navy)' }}
                        >
                          {item.process_name}
                        </Link>
                      </div>
                    </td>
                    <td>{item.sector || 'Unspecified'}</td>
                    <td className="tabular-nums">
                      {hours ? `${formatHours(hours)} hrs/yr` : '—'}
                    </td>
                    <td className="tabular-nums">
                      {cost ? formatCurrency(cost, curr) : '—'}
                    </td>
                    <td>
                      {item.report_ready ? (
                        <span className="badge badge-success">Approved ✓</span>
                      ) : (
                        <span className="badge badge-warning">Draft (Pending)</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {formatDate(item.updated_at)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {item.report_ready && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleDownload(item)}
                            title="Download PDF"
                          >
                            <DownloadIcon size={12} />
                            <span>PDF</span>
                          </button>
                        )}
                        <Link
                          href={`/assessments/${item.id}/report`}
                          className="btn btn-secondary btn-sm"
                        >
                          <span>Preview</span>
                          <ChevronRight size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
