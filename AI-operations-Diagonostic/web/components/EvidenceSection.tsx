'use client';

import type { UploadItem } from '@/types/assessment';

interface EvidenceSectionProps {
  uploads: UploadItem[];
}

export function EvidenceSection({ uploads }: EvidenceSectionProps) {
  if (!uploads || uploads.length === 0) return null;

  return (
    <div className="source-list">
      <strong>Evidence files ({uploads.length})</strong>
      {uploads.map((u) => (
        <div key={u.id} className="source-row">
          <span>▤ {u.filename}</span>
          <small>
            {u.kind.toUpperCase()} · {u.scan_status}
            {u.page_count ? ` · ${u.page_count} pages` : ''}
            {u.row_count ? ` · ${u.row_count} rows` : ''}
          </small>
        </div>
      ))}
    </div>
  );
}
