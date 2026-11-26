'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDate, formatHours } from '@/lib/formatters';
import { AssessmentsIcon, ChevronRight, DownloadIcon, PlusIcon, RefreshIcon } from '@/components/icons';
import type { Assessment } from '@/types/assessment';

const STATUS_LABELS: Record<string, string> = {
    CREATED: 'Draft',
    REVIEW: 'Needs your review',
    RUNNING: 'Analysing',
    COMPLETE: 'Report ready',
};

const STATUS_CLASSES: Record<string, string> = {
    CREATED: 'badge',
    REVIEW: 'badge badge-warning',
    RUNNING: 'badge badge-info',
    COMPLETE: 'badge badge-success',
};

export default function EnquiriesPage() {
    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const loadEnquiries = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.getAssessments();
            setAssessments(response.items || []);
        } catch (err) {
            setError((err as Error).message || 'Could not load your enquiries.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadEnquiries();
    }, [loadEnquiries]);

    const recentEnquiries = useMemo(() => {
        return [...assessments]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 20);
    }, [assessments]);

    const downloadReport = async (assessment: Assessment) => {
        setDownloadingId(assessment.id);
        setError(null);
        try {
            const blob = await api.downloadReportPdf(assessment.id);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `enquiry-report-${assessment.id.slice(0, 8)}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            setError((err as Error).message || 'Could not download that report.');
        } finally {
            setDownloadingId(null);
        }
    };

    return (
        <div className="enquiry-list">
            <div className="page-header">
                <div>
                    <h1 className="page-title">My enquiries</h1>
                    <p className="page-subtitle">Every enquiry you have started, newest first.</p>
                </div>
                <div className="page-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void loadEnquiries()}
                        disabled={isLoading}
                    >
                        <RefreshIcon size={16} /> Refresh
                    </button>
                    <Link href="/start" className="btn btn-primary">
                        <PlusIcon size={16} /> New enquiry
                    </Link>
                </div>
            </div>

            {error && (
                <div className="wizard-alert wizard-alert-error" role="alert">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="card">
                    <p className="wizard-hint">Loading your enquiries...</p>
                </div>
            ) : recentEnquiries.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <AssessmentsIcon size={24} />
                        </div>
                        <p className="empty-state-title">No enquiries yet</p>
                        <p className="empty-state-desc">
                            Start with one question about your operation. Upload a PDF procedure and a CSV of the work, and we
                            will build the report for you.
                        </p>
                        <Link href="/start" className="btn btn-primary" style={{ marginTop: '16px' }}>
                            Start your first enquiry
                        </Link>
                    </div>
                </div>
            ) : (
                <ul className="enquiry-list-items">
                    {recentEnquiries.map((assessment) => {
                        const statusLabel = STATUS_LABELS[assessment.status] || assessment.status;
                        const statusClass = STATUS_CLASSES[assessment.status] || 'badge';
                        const isReportReady = Boolean(assessment.report_ready);
                        const activityCount = (assessment.activities || []).filter((activity) => !activity.rejected).length;
                        const annualHours = assessment.calculations?.annual_hours;

                        return (
                            <li key={assessment.id} className="card enquiry-card">
                                <div className="enquiry-card-main">
                                    <div className="enquiry-card-head">
                                        <h2 className="enquiry-card-title">{assessment.process_name}</h2>
                                        <span className={statusClass}>{statusLabel}</span>
                                    </div>
                                    {assessment.goals && <p className="enquiry-card-question">{assessment.goals}</p>}
                                    <p className="enquiry-card-meta">
                                        {assessment.sector} · {assessment.period} · Created {formatDate(assessment.created_at)}
                                        {activityCount > 0 ? ` · ${activityCount} activities` : ''}
                                        {annualHours ? ` · ${formatHours(annualHours)} hrs/year` : ''}
                                    </p>
                                </div>
                                <div className="enquiry-card-actions">
                                    {isReportReady && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => void downloadReport(assessment)}
                                            disabled={downloadingId === assessment.id}
                                        >
                                            <DownloadIcon size={14} />
                                            {downloadingId === assessment.id ? 'Preparing...' : 'PDF'}
                                        </button>
                                    )}
                                    <Link className="btn btn-ghost btn-sm" href={`/start?assessment=${assessment.id}`}>
                                        Continue <ChevronRight size={14} />
                                    </Link>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {assessments.length > recentEnquiries.length && (
                <p className="enquiry-list-note">
                    Showing the {recentEnquiries.length} most recent enquiries. Open{' '}
                    <Link href="/assessments">the full archive</Link> for everything.
                </p>
            )}
        </div>
    );
}
