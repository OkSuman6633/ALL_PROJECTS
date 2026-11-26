'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useAssessmentContext } from '@/components/assessment/AssessmentContext';
import {
  UploadIcon,
  FileTextIcon,
  RefreshIcon,
  PlayIcon,
  ChevronRight,
} from '@/components/icons';
import { formatDate } from '@/lib/formatters';

export default function EvidenceStagePage() {
  const {
    assessment,
    isBusy,
    uploadEvidence,
    reextract,
    runAnalysis,
  } = useAssessmentContext();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  if (!assessment) return null;

  const uploads = assessment.uploads || [];
  const extractions = assessment.extraction || [];

  const handleFile = (file: File) => {
    void uploadEvidence(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div>
      {/* Stage Header */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Upload evidence</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={reextract}
              disabled={isBusy || uploads.length === 0}
              title="Refresh suggestions from uploaded files"
            >
              <RefreshIcon size={14} />
              <span>Refresh suggestions</span>
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={runAnalysis}
              disabled={isBusy || assessment.activities.length === 0}
            >
              <PlayIcon size={14} />
              <span>Calculate results ↗</span>
            </button>
          </div>
        </div>

        {/* Drag and Drop Upload Area */}
        <div className="card-body">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${isDragOver ? 'var(--brand-teal)' : 'var(--border-strong)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '36px 20px',
              textAlign: 'center',
              background: isDragOver ? 'var(--bg-subtle)' : '#ffffff',
              transition: 'all 200ms ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'var(--bg-subtle)',
                color: 'var(--brand-teal)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              <UploadIcon size={22} />
            </div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--brand-navy)', marginBottom: '4px' }}>
              Drag & drop operational evidence files here
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Accepts Standard Operating Procedures (<strong>.pdf</strong>) or Event Metrics (<strong>.csv</strong>) up to 10 MB
            </p>
            <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
              <span>Browse Files</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv"
                style={{ display: 'none' }}
                disabled={isBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Uploaded Evidence Files Table */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Uploaded Evidence Files ({uploads.length})</div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Document / File Name</th>
                <th>Kind</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Extraction Status</th>
              </tr>
            </thead>
            <tbody>
              {uploads.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state" style={{ padding: '28px' }}>
                      <FileTextIcon size={32} />
                      <div className="empty-state-title">No evidence files uploaded yet</div>
                      <div className="empty-state-desc">
                        Add a PDF procedure or CSV log above to get started.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                uploads.map((file) => {
                  const extResult = extractions.find((e) => e.source_id === file.id);
                  const isScanned = Boolean((file as any).is_scanned);

                  return (
                    <tr key={file.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileTextIcon size={16} style={{ color: 'var(--brand-teal)' }} />
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--brand-navy)' }}>
                              {file.filename}
                            </span>
                            {isScanned && (
                              <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '2px' }}>
                                ⚠ Scanned/image-only PDF detected (OCR review required)
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                          {file.kind}
                        </span>
                      </td>
                      <td className="tabular-nums">
                        {(file.size / 1024).toFixed(1)} KB
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {formatDate(file.uploaded_at)}
                        </span>
                      </td>
                      <td>
                        {extResult ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span
                              className={`badge ${
                                extResult.status === 'manual_review_required'
                                  ? 'badge-warning'
                                  : 'badge-success'
                              }`}
                            >
                              {extResult.status === 'manual_review_required'
                                ? 'Review Required'
                                : extResult.status || 'Extracted'}
                            </span>
                          </div>
                        ) : (
                          <span className="badge badge-neutral">Uploaded</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="card-footer">
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Review and confirm suggested activities before analysis.
          </div>
          <Link href={`/assessments/${assessment.id}/review`} className="btn btn-primary btn-sm">
            <span>Next: Review & Analyse</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
