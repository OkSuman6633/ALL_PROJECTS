'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function SingleReportRedirect() {
  const router = useRouter();
  const params = useParams();
  const reportId = params?.reportId as string;

  useEffect(() => {
    if (reportId) {
      router.replace(`/assessments/${reportId}/report`);
    }
  }, [reportId, router]);

  return (
    <div style={{ padding: '32px 0', color: 'var(--text-muted)' }}>
      Opening diagnostic report...
    </div>
  );
}

