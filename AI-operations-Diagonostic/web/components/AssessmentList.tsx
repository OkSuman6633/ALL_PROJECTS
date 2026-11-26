'use client';

import { formatDate } from '@/lib/formatters';
import type { Assessment } from '@/types/assessment';

interface AssessmentListProps {
  assessments: Assessment[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export function AssessmentList({
  assessments,
  selectedId,
  onSelect,
  onRefresh,
  isLoading,
}: AssessmentListProps) {
  return (
    <div className="panel list-panel">
      <div className="section-head">
        <div>
          <div className="eyebrow">02 / YOUR WORKSPACE</div>
          <h3>Recent assessments</h3>
        </div>
        <button
          type="button"
          className="quiet"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Refresh assessment list"
        >
          ↻ Refresh
        </button>
      </div>

      {assessments.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            ◎
          </div>
          <h4>Your workspace starts here</h4>
          <p>
            Create a diagnostic to review evidence, confirm baseline facts and calculate
            potential capacity opportunities.
          </p>
        </div>
      ) : (
        <div className="assessment-list" role="list">
          {assessments.map((item) => {
            const isSelected = selectedId === item.id;
            const statusClass = item.status.toLowerCase();

            return (
              <button
                key={item.id}
                type="button"
                className={`assessment-row ${isSelected ? 'active' : ''}`}
                onClick={() => onSelect(item.id)}
                aria-current={isSelected ? 'true' : undefined}
              >
                <span className="row-icon" aria-hidden="true">
                  ↗
                </span>
                <span className="row-main">
                  <strong>{item.process_name}</strong>
                  <small>
                    {item.sector} · Updated {formatDate(item.updated_at)}
                  </small>
                </span>
                <span className={`status ${statusClass}`}>{item.status}</span>
                <span aria-hidden="true">→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
