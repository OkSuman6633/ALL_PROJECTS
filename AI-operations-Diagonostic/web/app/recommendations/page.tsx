'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Assessment, RecommendationItem } from '@/types/assessment';
import {
  RecommendationsIcon,
  SearchIcon,
  ChevronRight,
  RefreshIcon,
  AlertTriangleIcon,
} from '@/components/icons';

interface RecommendationWithContext extends RecommendationItem {
  processName: string;
  assessmentId: string;
  sector: string;
  currency: string;
}

export default function GlobalRecommendationsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');

  const fetchRecommendations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getAssessments();
      setAssessments(res.items);
    } catch (err) {
      setError((err as Error).message || 'Failed to load recommendations.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchRecommendations();
  }, []);

  const allRecommendations = useMemo(() => {
    const list: RecommendationWithContext[] = [];
    assessments.forEach((a) => {
      if (a.calculations?.recommendations) {
        a.calculations.recommendations.forEach((r) => {
          list.push({
            ...r,
            processName: a.process_name,
            assessmentId: a.id,
            sector: a.sector || 'Unspecified',
            currency: a.calculations?.currency || a.currency || 'GBP',
          });
        });
      }
    });
    return list;
  }, [assessments]);

  const sectors = useMemo(() => {
    const s = new Set<string>();
    allRecommendations.forEach((r) => s.add(r.sector));
    return Array.from(s).sort();
  }, [allRecommendations]);

  const filtered = useMemo(() => {
    return allRecommendations.filter((r) => {
      const matchesSearch =
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.rationale.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.processName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPriority =
        priorityFilter === 'ALL' || r.priority.toLowerCase() === priorityFilter.toLowerCase();

      const matchesSector =
        sectorFilter === 'ALL' || r.sector === sectorFilter;

      return matchesSearch && matchesPriority && matchesSector;
    });
  }, [allRecommendations, searchQuery, priorityFilter, sectorFilter]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Recommendations</h1>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchRecommendations}
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
              placeholder="Search recommendations, processes, or rationale..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="table-filters">
            <select
              className="filter-select"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="ALL">All Priorities</option>
              <option value="cost">Cost Reduction</option>
              <option value="investigate">Investigate</option>
              <option value="data_quality">Data Quality</option>
            </select>

            <select
              className="filter-select"
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
            >
              <option value="ALL">All Sectors</option>
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading recommendations...
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <RecommendationsIcon size={36} />
            <div className="empty-state-title">No recommendations found</div>
            <div className="empty-state-desc">
              {allRecommendations.length === 0
                ? 'Complete baseline fact review and run analysis to generate recommendations.'
                : 'No recommendations match your search filters.'}
            </div>
            <Link href="/assessments" className="btn btn-primary btn-sm">
              View Assessments
            </Link>
          </div>
        ) : (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filtered.map((rec, idx) => (
              <div
                key={`${rec.id}-${idx}`}
                style={{
                  padding: '16px 18px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  background: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--brand-navy)' }}>
                        {rec.title}
                      </span>
                      <span className={`badge ${rec.priority === 'investigate' ? 'badge-info' : 'badge-warning'}`}>
                        {rec.priority.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Process: <strong>{rec.processName}</strong> ({rec.sector})
                      {rec.activity && ` · Step: ${rec.activity}`}
                    </div>
                  </div>

                  <Link
                    href={`/assessments/${rec.assessmentId}/recommendations`}
                    className="btn btn-secondary btn-sm"
                  >
                    <span>View in Assessment</span>
                    <ChevronRight size={12} />
                  </Link>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0' }}>
                  {rec.rationale}
                </p>

                <div style={{ display: 'flex', gap: '16px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  <div>
                    <strong>Evidence references:</strong>{' '}
                    {rec.evidence.length > 0 ? (
                      <span style={{ color: 'var(--brand-teal)' }}>{rec.evidence.join(', ')}</span>
                    ) : (
                      <span style={{ color: 'var(--warning)' }}>No explicit link</span>
                    )}
                  </div>
                  {rec.evidence_gap && (
                    <div style={{ color: 'var(--warning)', fontWeight: 500 }}>
                      ⚠ Evidence gap: Needs supporting logs
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
