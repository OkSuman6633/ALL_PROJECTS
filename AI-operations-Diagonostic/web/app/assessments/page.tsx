'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Assessment } from '@/types/assessment';
import {
  AssessmentsIcon,
  PlusIcon,
  SearchIcon,
  ChevronRight,
  AlertTriangleIcon,
  RefreshIcon,
} from '@/components/icons';
import { formatDate, formatCurrency, formatNumber } from '@/lib/formatters';

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchAssessments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getAssessments();
      setAssessments(res.items);
    } catch (err) {
      setError((err as Error).message || 'Failed to load assessments.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAssessments();
  }, []);

  // Distinct sectors
  const sectors = useMemo(() => {
    const set = new Set<string>();
    assessments.forEach((a) => {
      if (a.sector) set.add(a.sector);
    });
    return Array.from(set).sort();
  }, [assessments]);

  // Filtered and sorted assessments
  const filteredAssessments = useMemo(() => {
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

        return matchesSearch && matchesStatus && matchesSector;
      })
      .sort((a, b) => {
        const timeA = new Date(a.updated_at).getTime();
        const timeB = new Date(b.updated_at).getTime();
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      });
  }, [assessments, searchQuery, statusFilter, sectorFilter, sortOrder]);

  // Paginated
  const totalPages = Math.ceil(filteredAssessments.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAssessments.slice(start, start + itemsPerPage);
  }, [filteredAssessments, currentPage]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'COMPLETE':
        return 'badge-success';
      case 'REVIEW':
        return 'badge-warning';
      case 'RUNNING':
        return 'badge-info';
      default:
        return 'badge-neutral';
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Assessments</h1>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchAssessments}
            disabled={isLoading}
            title="Refresh assessments list"
          >
            <RefreshIcon size={14} />
            <span>Refresh</span>
          </button>
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

      {/* Table Container */}
      <div className="table-wrapper">
        {/* Table Toolbar */}
        <div className="table-toolbar">
          <div className="search-input-wrap">
            <SearchIcon size={14} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search by process name, sector, or ID..."
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
              <option value="CREATED">Baseline Created</option>
              <option value="REVIEW">In Review</option>
              <option value="RUNNING">Analysis Running</option>
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
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              title="Toggle sort direction"
            >
              <span>Updated: {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        {isLoading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading production assessments...
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="empty-state">
            <AssessmentsIcon size={40} />
            <div className="empty-state-title">No assessments found</div>
            <div className="empty-state-desc">
              {searchQuery || statusFilter !== 'ALL' || sectorFilter !== 'ALL'
                ? 'No assessments match your current filters. Try a different search or filter.'
                : 'Create an assessment to get started.'}
            </div>
            <Link href="/assessments/new" className="btn btn-primary btn-sm">
              <PlusIcon size={14} />
              <span>New Assessment</span>
            </Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Process Name</th>
                <th>Sector</th>
                <th>Measurement Period</th>
                <th>Annual Handling Effort</th>
                <th>Status</th>
                <th>Last Modified</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((a) => {
                const hours = a.calculations?.annual_hours;
                const cost = a.calculations?.annual_effort_cost;
                const curr = a.calculations?.currency || a.currency || 'GBP';

                return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Link
                          href={`/assessments/${a.id}/baseline`}
                          style={{
                            fontWeight: 600,
                            color: 'var(--brand-navy)',
                            textDecoration: 'none',
                          }}
                        >
                          {a.process_name}
                        </Link>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-secondary)' }}>{a.sector || 'Unspecified'}</span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-muted)' }}>{a.period || 'Last 30 days'}</span>
                    </td>
                    <td>
                      {hours && cost ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatNumber(hours)} hrs/yr
                          </span>
                          <span className="tabular-nums" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatCurrency(cost, curr)}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                          Pending analysis
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(a.status)}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {formatDate(a.updated_at)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/assessments/${a.id}/baseline`}
                        className="btn btn-secondary btn-sm"
                      >
                        <span>Workspace</span>
                        <ChevronRight size={13} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {filteredAssessments.length > itemsPerPage && (
          <div className="table-pagination">
            <span>
              Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, filteredAssessments.length)} of{' '}
              {filteredAssessments.length} assessments
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
