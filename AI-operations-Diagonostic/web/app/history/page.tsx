'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Assessment } from '@/types/assessment';
import {
  HistoryIcon,
  SearchIcon,
  ChevronRight,
  DownloadIcon,
  RefreshIcon,
  AlertTriangleIcon,
} from '@/components/icons';
import { formatDate } from '@/lib/formatters';

export default function HistoryPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [reportFilter, setReportFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Production historical assessments only
      const res = await api.getAssessments();
      setAssessments(res.items);
    } catch (err) {
      setError((err as Error).message || 'Failed to load historical assessments.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, []);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    assessments.forEach((a) => {
      if (a.sector) set.add(a.sector);
    });
    return Array.from(set).sort();
  }, [assessments]);

  const filteredItems = useMemo(() => {
    return assessments
      .filter((a) => {
        const matchesSearch =
          a.process_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.sector && a.sector.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesStatus =
          statusFilter === 'ALL' || a.status.toUpperCase() === statusFilter;

        const matchesSector =
          sectorFilter === 'ALL' || a.sector === sectorFilter;

        const matchesReport =
          reportFilter === 'ALL' ||
          (reportFilter === 'APPROVED' ? a.report_ready : !a.report_ready);

        return matchesSearch && matchesStatus && matchesSector && matchesReport;
      })
      .sort((a, b) => {
        const timeA = new Date(a.updated_at).getTime();
        const timeB = new Date(b.updated_at).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
  }, [assessments, searchQuery, statusFilter, sectorFilter, reportFilter, sortOrder]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage]);

  const handleDownloadReport = async (assessment: Assessment) => {
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
      alert((err as Error).message || 'Failed to download report.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Assessment History</h1>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchHistory}
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
              placeholder="Search historical records..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="table-filters">
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="CREATED">Created</option>
              <option value="REVIEW">In Review</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETE">Complete</option>
            </select>

            <select
              className="filter-select"
              value={sectorFilter}
              onChange={(e) => {
                setSectorFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              className="filter-select"
              value={reportFilter}
              onChange={(e) => {
                setReportFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Reports</option>
              <option value="APPROVED">Report Approved</option>
              <option value="PENDING">Report Pending</option>
            </select>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            >
              <span>{sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading historical archive...
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="empty-state">
            <HistoryIcon size={36} />
            <div className="empty-state-title">No historical records match</div>
            <div className="empty-state-desc">
              Try a different search or filter.
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Process</th>
                <th>Sector</th>
                <th>Revision</th>
                <th>Created Date</th>
                <th>Last Modified</th>
                <th>Status</th>
                <th>Report Ready</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
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
                  <td>{item.sector || 'Unspecified'}</td>
                  <td className="tabular-nums">
                    <span className="badge badge-neutral">Rev {item.revision}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {formatDate(item.created_at)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {formatDate(item.updated_at)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        item.status === 'COMPLETE'
                          ? 'badge-success'
                          : item.status === 'REVIEW'
                          ? 'badge-warning'
                          : 'badge-neutral'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td>
                    {item.report_ready ? (
                      <span className="badge badge-success">Approved ✓</span>
                    ) : (
                      <span className="badge badge-neutral">Pending</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      {item.report_ready && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDownloadReport(item)}
                          title="Download approved PDF"
                        >
                          <DownloadIcon size={12} />
                          <span>PDF</span>
                        </button>
                      )}
                      <Link
                        href={`/assessments/${item.id}/baseline`}
                        className="btn btn-secondary btn-sm"
                      >
                        <span>Workspace</span>
                        <ChevronRight size={12} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {filteredItems.length > itemsPerPage && (
          <div className="table-pagination">
            <span>
              Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, filteredItems.length)} of{' '}
              {filteredItems.length} records
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
