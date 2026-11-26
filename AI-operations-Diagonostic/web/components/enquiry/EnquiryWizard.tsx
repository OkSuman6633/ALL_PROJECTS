'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import { CONFIG, SECTOR_OPTIONS } from '@/lib/config';
import { formatCurrency, formatFileSize, formatHours } from '@/lib/formatters';
import { DownloadIcon, UploadIcon } from '@/components/icons';
import type { ActivityCreateInput, Assessment, FactChangeItem } from '@/types/assessment';

const STEPS = [
    { number: 1, title: 'Your enquiry', caption: 'Ask your question' },
    { number: 2, title: 'Documents', caption: 'Add SOP and data' },
    { number: 3, title: 'AI analysis', caption: 'We read and analyse' },
    { number: 4, title: 'Report', caption: 'Review and download' },
] as const;

const CURRENCIES = ['GBP', 'USD', 'EUR', 'INR', 'AUD', 'CAD', 'SGD'];

type WizardStep = 1 | 2 | 3 | 4;
type BusyState = 'idle' | 'analyse' | 'generate' | 'download' | 'resume';

interface DraftRow {
    key: string;
    activityId: string | null;
    label: string;
    volume: string;
    minutes: string;
    rate: string;
    include: boolean;
}

interface EnquiryWizardProps {
    initialAssessmentId?: string;
}

function toDraftRows(assessment: Assessment): DraftRow[] {
    return (assessment.activities || [])
        .filter((activity) => !activity.rejected)
        .map((activity) => ({
            key: activity.activity_id,
            activityId: activity.activity_id,
            label: activity.label || '',
            volume:
                activity.monthly_volume === null || activity.monthly_volume === undefined
                    ? ''
                    : String(activity.monthly_volume),
            minutes:
                activity.minutes_per_unit === null || activity.minutes_per_unit === undefined
                    ? ''
                    : String(activity.minutes_per_unit),
            rate:
                activity.hourly_rate === null || activity.hourly_rate === undefined
                    ? ''
                    : String(activity.hourly_rate),
            include: true,
        }));
}

function parseAmount(value: string): number | null {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
}

function rowIssue(row: DraftRow): string | null {
    if (!row.label.trim()) return 'Give this activity a name.';
    const volume = parseAmount(row.volume);
    if (volume === null || volume < 0) return 'Enter how many times this happens each month.';
    const minutes = parseAmount(row.minutes);
    if (minutes === null || minutes < 0) return 'Enter how many minutes each one takes.';
    const rate = parseAmount(row.rate);
    if (rate === null || rate < 0) return 'Enter the hourly cost for this work.';
    return null;
}

function describeError(error: unknown): string {
    if (error instanceof ApiClientError) return error.message;
    if (error instanceof Error) return error.message;
    return 'Something went wrong. Please try again.';
}

function createRow(): DraftRow {
    return {
        key: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        activityId: null,
        label: '',
        volume: '',
        minutes: '',
        rate: '',
        include: true,
    };
}

export function EnquiryWizard({ initialAssessmentId }: EnquiryWizardProps) {
    const [step, setStep] = useState<WizardStep>(1);
    const [processName, setProcessName] = useState('');
    const [question, setQuestion] = useState('');
    const [sector, setSector] = useState<string>(SECTOR_OPTIONS[0]);
    const [period, setPeriod] = useState('Last 30 days');
    const [unit, setUnit] = useState('cases');
    const [currency, setCurrency] = useState('GBP');
    const [files, setFiles] = useState<File[]>([]);
    const [assessment, setAssessment] = useState<Assessment | null>(null);
    const [rows, setRows] = useState<DraftRow[]>([]);
    const [busy, setBusy] = useState<BusyState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [fileIssues, setFileIssues] = useState<string[]>([]);
    const [reportReady, setReportReady] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const isBusy = busy !== 'idle';

    const applyAssessment = useCallback((loaded: Assessment) => {
        setAssessment(loaded);
        setProcessName(loaded.process_name || '');
        setQuestion(loaded.goals || '');
        if (loaded.sector) setSector(loaded.sector);
        if (loaded.period) setPeriod(loaded.period);
        if (loaded.unit) setUnit(loaded.unit);
        if (loaded.currency) setCurrency(loaded.currency);
        const draftRows = toDraftRows(loaded);
        setRows(draftRows);
        const approved = Boolean(loaded.report_ready) && loaded.approved_revision === loaded.revision;
        setReportReady(approved);
        const hasWork = draftRows.length > 0 || (loaded.uploads || []).length > 0;
        setStep(hasWork ? 4 : 1);
    }, []);

    useEffect(() => {
        if (!initialAssessmentId) return;
        let cancelled = false;
        setBusy('resume');
        api
            .getAssessment(initialAssessmentId)
            .then((loaded) => {
                if (!cancelled) applyAssessment(loaded);
            })
            .catch((err) => {
                if (!cancelled) setError(describeError(err));
            })
            .finally(() => {
                if (!cancelled) setBusy('idle');
            });
        return () => {
            cancelled = true;
        };
    }, [initialAssessmentId, applyAssessment]);

    const includedRows = useMemo(() => rows.filter((row) => row.include), [rows]);
    const calculations = assessment?.calculations ?? null;
    const reportCurrency =
        calculations?.currency && calculations.currency !== 'MIXED' ? calculations.currency : currency;
    const baseScenario = calculations?.scenarios?.base ?? null;

    const selectFiles = useCallback((incoming: FileList | null) => {
        if (!incoming || incoming.length === 0) return;
        const limit = CONFIG.MAX_UPLOAD_MB * 1024 * 1024;
        const accepted: File[] = [];
        const issues: string[] = [];
        Array.from(incoming).forEach((file) => {
            const name = file.name.toLowerCase();
            if (!name.endsWith('.pdf') && !name.endsWith('.csv')) {
                issues.push(`${file.name} is not a PDF or CSV file.`);
                return;
            }
            if (file.size > limit) {
                issues.push(`${file.name} is larger than ${CONFIG.MAX_UPLOAD_MB} MB.`);
                return;
            }
            accepted.push(file);
        });
        if (accepted.length > 0) {
            setFiles((current) => {
                const merged = [...current];
                accepted.forEach((file) => {
                    const exists = merged.some((item) => item.name === file.name && item.size === file.size);
                    if (!exists) merged.push(file);
                });
                return merged;
            });
        }
        setFileIssues(issues);
    }, []);

    const handleEnquiryContinue = () => {
        if (!processName.trim()) {
            setError('Give your enquiry a name first, for example "Invoice approvals".');
            return;
        }
        if (!question.trim()) {
            setError('Tell us what you want to find out. The AI answers this question in your report.');
            return;
        }
        setError(null);
        setStep(2);
    };

    const ensureAssessment = async (): Promise<Assessment> => {
        if (assessment) return assessment;
        const created = await api.createAssessment({
            process_name: processName.trim(),
            sector,
            period,
            unit,
            currency,
            goals: question.trim(),
            activity_inputs: [],
        });
        setAssessment(created);
        return created;
    };

    const runAnalysis = async () => {
        if (files.length === 0) {
            setError('Add at least one PDF or CSV file, or choose to enter activities yourself.');
            return;
        }
        setError(null);
        setNotice(null);
        setFileIssues([]);
        setBusy('analyse');
        setStep(3);
        try {
            const current = await ensureAssessment();
            const idempotencyKey = `wizard-${current.id}-r${current.revision}-${files
                .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
                .join('|')}`;
            const result = await api.analyzeAssessment(current.id, current.revision, files, idempotencyKey);
            setAssessment(result.assessment);
            setReportReady(false);
            const draftRows = toDraftRows(result.assessment);
            setRows(draftRows);

            const failures = result.files
                .filter((item) => item.status === 'failed')
                .map((item) => `${item.filename}: ${item.error?.message || 'could not be read'}`);
            setFileIssues(failures);

            const duplicates = result.files.filter((item) => item.status === 'duplicate').length;
            if (draftRows.length === 0) {
                setNotice(
                    'We could not detect activities in these documents. Add them yourself below and we will still build your report.'
                );
            } else if (failures.length > 0) {
                setNotice('Some documents could not be read. The activities we did find are ready for you below.');
            } else if (duplicates > 0) {
                setNotice('Some documents were analysed earlier, so we reused the existing results.');
            } else {
                setNotice(null);
            }
            setStep(4);
        } catch (err) {
            setError(describeError(err));
            setStep(2);
        } finally {
            setBusy('idle');
        }
    };

    const handleManualEntry = () => {
        setError(null);
        setFileIssues([]);
        setRows([]);
        setNotice('No problem. Add your activities by hand below and we will still build your report.');
        setStep(4);
    };

    const updateRow = (key: string, patch: Partial<DraftRow>) => {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    };

    const removeRow = (key: string) => {
        setRows((current) => current.filter((row) => row.key !== key));
    };

    const downloadReport = async (assessmentId: string) => {
        const blob = await api.downloadReportPdf(assessmentId);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `enquiry-report-${assessmentId.slice(0, 8)}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleGenerate = async () => {
        setError(null);
        if (includedRows.length === 0) {
            setError('Include at least one activity so the report has something to measure.');
            return;
        }
        const problems = includedRows.filter((row) => rowIssue(row) !== null);
        if (problems.length > 0) {
            const names = problems.map((row) => row.label.trim() || 'Untitled activity').join(', ');
            setError(`Add the missing numbers for: ${names}.`);
            return;
        }

        setBusy('generate');
        try {
            let current = await ensureAssessment();

            const changes: FactChangeItem[] = [];
            const additions: ActivityCreateInput[] = [];
            const retainedIds = new Set(
                rows.filter((row) => row.include && row.activityId).map((row) => row.activityId as string)
            );
            const removals: string[] = (current.activities || [])
                .map((activity) => activity.activity_id)
                .filter((id) => !retainedIds.has(id));

            rows.forEach((row) => {
                if (!row.include) {
                    return;
                }
                const label = row.label.trim();
                const volume = parseAmount(row.volume) as number;
                const minutes = parseAmount(row.minutes) as number;
                const rate = parseAmount(row.rate) as number;
                if (row.activityId) {
                    changes.push({
                        activity_id: row.activityId,
                        label,
                        monthly_volume: volume,
                        minutes_per_unit: minutes,
                        hourly_rate: rate,
                        currency,
                        confirmed: true,
                    });
                } else {
                    additions.push({
                        label,
                        monthly_volume: volume,
                        minutes_per_unit: minutes,
                        hourly_rate: rate,
                        currency,
                        confirmed: true,
                    });
                }
            });

            if (changes.length > 0 || additions.length > 0 || removals.length > 0 || current.currency !== currency) {
                current = await api.patchFacts(current.id, {
                    expected_revision: current.revision,
                    currency,
                    changes,
                    add_activities: additions,
                    remove_activity_ids: removals,
                });
            }

            const submitted = await api.runAnalysis(current.id, { expected_revision: current.revision });
            const analysed = submitted.assessment;

            const assumptions: Record<string, unknown> = {
                enquiry: question.trim() || 'Operational cost review',
                workflow: 'guided-enquiry',
                capacity_value_is_not_cash_savings: true,
            };
            if (analysed.calculations?.currency_mismatch) {
                assumptions.currency_mismatch_acknowledged = true;
                assumptions.currency_standardised_to = currency;
            }

            await api.approveReport(analysed.id, {
                expected_revision: analysed.revision,
                accepted_assumptions: assumptions,
            });

            const finalAssessment = await api.getAssessment(analysed.id);
            setAssessment(finalAssessment);
            setRows(toDraftRows(finalAssessment));
            setReportReady(true);
            setNotice('Your report is ready and downloading now.');
            setBusy('download');
            await downloadReport(finalAssessment.id);
            setBusy('idle');
        } catch (err) {
            setError(describeError(err));
            setBusy('idle');
        }
    };

    const handleDownloadAgain = async () => {
        if (!assessment) return;
        setError(null);
        setBusy('download');
        try {
            await downloadReport(assessment.id);
        } catch (err) {
            setError(describeError(err));
        } finally {
            setBusy('idle');
        }
    };

    const startAnother = () => {
        setStep(1);
        setProcessName('');
        setQuestion('');
        setSector(SECTOR_OPTIONS[0]);
        setPeriod('Last 30 days');
        setUnit('cases');
        setCurrency('GBP');
        setFiles([]);
        setAssessment(null);
        setRows([]);
        setError(null);
        setNotice(null);
        setFileIssues([]);
        setReportReady(false);
        setBusy('idle');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    if (busy === 'resume') {
        return (
            <div className="wizard">
                <div className="wizard-card">
                    <p className="wizard-hint">Loading your enquiry...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="wizard">
            <header className="wizard-hero">
                <p className="wizard-eyebrow">Guided enquiry</p>
                <h1 className="wizard-title">Describe the problem. Upload your documents. Get a cost report.</h1>
                <p className="wizard-subtitle">
                    Four simple steps. No setup and no formulas. We read your SOP and operating data, answer your question
                    and build a detailed PDF with practical ways to reduce cost.
                </p>
                <p className="wizard-meta">
                    PDF and CSV only · up to {CONFIG.MAX_UPLOAD_MB} MB per file
                </p>
            </header>

            <ol className="wizard-steps">
                {STEPS.map((item) => {
                    const state = step === item.number ? 'current' : step > item.number ? 'done' : 'todo';
                    return (
                        <li key={item.number} className={`wizard-step wizard-step-${state}`}>
                            <span className="wizard-step-number">{state === 'done' ? '✓' : item.number}</span>
                            <span className="wizard-step-text">
                                <strong>{item.title}</strong>
                                <em>{item.caption}</em>
                            </span>
                        </li>
                    );
                })}
            </ol>

            {error && (
                <div className="wizard-alert wizard-alert-error" role="alert">
                    {error}
                </div>
            )}
            {notice && <div className="wizard-alert wizard-alert-info">{notice}</div>}
            {fileIssues.length > 0 && (
                <div className="wizard-alert wizard-alert-warning">
                    <ul className="wizard-issue-list">
                        {fileIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                        ))}
                    </ul>
                </div>
            )}

            {step === 1 && (
                <section className="wizard-card" aria-labelledby="wizard-step-1">
                    <div className="wizard-card-head">
                        <span className="wizard-card-index">Step 1</span>
                        <h2 id="wizard-step-1">Your enquiry</h2>
                        <p>Give this enquiry a name and tell us what you want the report to answer.</p>
                    </div>
                    <div className="wizard-grid">
                        <label className="wizard-field wizard-field-wide">
                            <span className="wizard-label">
                                What is the process called? <em>required</em>
                            </span>
                            <input
                                className="form-control"
                                value={processName}
                                onChange={(event) => setProcessName(event.target.value)}
                                placeholder="Invoice approvals"
                                maxLength={120}
                            />
                        </label>
                        <label className="wizard-field wizard-field-wide">
                            <span className="wizard-label">
                                What do you want to find out? <em>required</em>
                            </span>
                            <textarea
                                className="form-control"
                                rows={3}
                                value={question}
                                onChange={(event) => setQuestion(event.target.value)}
                                placeholder="Where are we losing time on invoice approvals, what does it cost us, and how can we reduce it?"
                                maxLength={1000}
                            />
                            <span className="wizard-hint">
                                The AI uses this to focus the analysis, the recommendations and the PDF.
                            </span>
                        </label>
                    </div>
                    <details className="wizard-details">
                        <summary>Optional details (sector, period, unit, currency)</summary>
                        <div className="wizard-grid">
                            <label className="wizard-field">
                                <span className="wizard-label">Sector</span>
                                <select className="form-control" value={sector} onChange={(event) => setSector(event.target.value)}>
                                    {SECTOR_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="wizard-field">
                                <span className="wizard-label">Period covered</span>
                                <input
                                    className="form-control"
                                    value={period}
                                    onChange={(event) => setPeriod(event.target.value)}
                                    placeholder="Last 30 days"
                                    maxLength={60}
                                />
                            </label>
                            <label className="wizard-field">
                                <span className="wizard-label">What is one unit?</span>
                                <input
                                    className="form-control"
                                    value={unit}
                                    onChange={(event) => setUnit(event.target.value)}
                                    placeholder="cases"
                                    maxLength={40}
                                />
                            </label>
                            <label className="wizard-field">
                                <span className="wizard-label">Currency</span>
                                <select className="form-control" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                                    {CURRENCIES.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </details>
                    <div className="wizard-actions">
                        <button type="button" className="btn btn-primary" onClick={handleEnquiryContinue}>
                            Continue to documents
                        </button>
                    </div>
                </section>
            )}

            {step === 2 && (
                <section className="wizard-card" aria-labelledby="wizard-step-2">
                    <div className="wizard-card-head">
                        <span className="wizard-card-index">Step 2</span>
                        <h2 id="wizard-step-2">Add your documents</h2>
                        <p>Upload your SOP as a PDF and your operating data as a CSV. You can add as many files as you like.</p>
                    </div>
                    <div
                        className="wizard-dropzone"
                        role="button"
                        tabIndex={0}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                fileInputRef.current?.click();
                            }
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            selectFiles(event.dataTransfer.files);
                        }}
                    >
                        <UploadIcon size={26} />
                        <p className="wizard-dropzone-title">Drag and drop files here, or browse</p>
                        <p className="wizard-dropzone-hint">
                            PDF procedures and CSV logs · up to {CONFIG.MAX_UPLOAD_MB} MB each
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.csv"
                            multiple
                            className="wizard-file-input"
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                                selectFiles(event.target.files);
                                event.target.value = '';
                            }}
                        />
                    </div>
                    {files.length > 0 && (
                        <ul className="wizard-file-list">
                            {files.map((file) => (
                                <li key={`${file.name}-${file.size}`} className="wizard-file">
                                    <span className="wizard-file-kind">{file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'CSV'}</span>
                                    <span className="wizard-file-name">{file.name}</span>
                                    <span className="wizard-file-size">{formatFileSize(file.size)}</span>
                                    <button
                                        type="button"
                                        className="wizard-file-remove"
                                        onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="wizard-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} disabled={isBusy}>
                            Back
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={handleManualEntry} disabled={isBusy}>
                            I do not have documents
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={runAnalysis}
                            disabled={files.length === 0 || isBusy}
                        >
                            Send to analyse
                        </button>
                    </div>
                </section>
            )}

            {step === 3 && (
                <section className="wizard-card" aria-labelledby="wizard-step-3">
                    <div className="wizard-card-head">
                        <span className="wizard-card-index">Step 3</span>
                        <h2 id="wizard-step-3">Analysing your documents</h2>
                        <p>The AI is reading every page and matching it to your question. This usually takes a few seconds.</p>
                    </div>
                    <ul className="wizard-progress-list">
                        <li>
                            Reading {files.length} document{files.length === 1 ? '' : 's'}
                        </li>
                        <li>Extracting activities, volumes and handling times</li>
                        <li>Calculating annual effort and cost</li>
                        <li>Writing your recommendations and PDF</li>
                    </ul>
                    <div className="wizard-progress-bar" aria-hidden="true">
                        <span />
                    </div>
                </section>
            )}

            {step === 4 && (
                <section className="wizard-card" aria-labelledby="wizard-step-4">
                    <div className="wizard-card-head">
                        <span className="wizard-card-index">Step 4</span>
                        <h2 id="wizard-step-4">{reportReady ? 'Your report is ready' : 'Check what we found'}</h2>
                        <p>
                            {reportReady
                                ? 'Download your PDF below, or adjust the numbers and generate it again.'
                                : 'These are the activities we found. Adjust anything that looks wrong, then generate your report.'}
                        </p>
                    </div>

                    {rows.length === 0 ? (
                        <div className="wizard-empty">
                            <p>We have not detected any activities yet.</p>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setRows((current) => [...current, createRow()])}
                            >
                                Add an activity
                            </button>
                        </div>
                    ) : (
                        <ul className="wizard-rows">
                            {rows.map((row) => {
                                const issue = row.include ? rowIssue(row) : null;
                                return (
                                    <li key={row.key} className={`wizard-row${row.include ? '' : ' wizard-row-excluded'}`}>
                                        <div className="wizard-row-head">
                                            <label className="wizard-check">
                                                <input
                                                    type="checkbox"
                                                    checked={row.include}
                                                    onChange={(event) => updateRow(row.key, { include: event.target.checked })}
                                                />
                                                <span>{row.include ? 'Included in the report' : 'Left out of the report'}</span>
                                            </label>
                                            <button
                                                type="button"
                                                className="wizard-row-remove"
                                                onClick={() => removeRow(row.key)}
                                                aria-label={`Remove ${row.label || 'activity'}`}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                        <label className="wizard-field wizard-field-wide">
                                            <span className="wizard-label">Activity</span>
                                            <input
                                                className="form-control"
                                                value={row.label}
                                                onChange={(event) => updateRow(row.key, { label: event.target.value })}
                                                placeholder="Review invoice"
                                            />
                                        </label>
                                        <div className="wizard-row-numbers">
                                            <label className="wizard-field">
                                                <span className="wizard-label">Times per month</span>
                                                <input
                                                    className="form-control"
                                                    inputMode="decimal"
                                                    value={row.volume}
                                                    onChange={(event) => updateRow(row.key, { volume: event.target.value })}
                                                    placeholder="100"
                                                />
                                            </label>
                                            <label className="wizard-field">
                                                <span className="wizard-label">Minutes each</span>
                                                <input
                                                    className="form-control"
                                                    inputMode="decimal"
                                                    value={row.minutes}
                                                    onChange={(event) => updateRow(row.key, { minutes: event.target.value })}
                                                    placeholder="6"
                                                />
                                            </label>
                                            <label className="wizard-field">
                                                <span className="wizard-label">Hourly cost ({currency})</span>
                                                <input
                                                    className="form-control"
                                                    inputMode="decimal"
                                                    value={row.rate}
                                                    onChange={(event) => updateRow(row.key, { rate: event.target.value })}
                                                    placeholder="30"
                                                />
                                            </label>
                                        </div>
                                        {issue && <p className="wizard-row-issue">{issue}</p>}
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <div className="wizard-row-actions">
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setRows((current) => [...current, createRow()])}
                        >
                            + Add another activity
                        </button>
                    </div>

                    {reportReady && calculations && (
                        <div className="wizard-summary">
                            <div className="wizard-summary-grid">
                                <div className="wizard-kpi">
                                    <span>Annual handling hours</span>
                                    <strong>{formatHours(calculations.annual_hours)} hrs</strong>
                                </div>
                                <div className="wizard-kpi">
                                    <span>Annual cost of this work</span>
                                    <strong>{formatCurrency(calculations.annual_effort_cost, reportCurrency)}</strong>
                                </div>
                                {baseScenario && (
                                    <div className="wizard-kpi">
                                        <span>Capacity value (base scenario)</span>
                                        <strong>{formatCurrency(baseScenario.capacity_value, reportCurrency)}</strong>
                                    </div>
                                )}
                            </div>
                            <p className="wizard-disclaimer">
                                Capacity value is the value of released time, not guaranteed cash savings. Scenarios are
                                assumptions, not forecasts.
                            </p>
                            {(calculations.recommendations || []).length > 0 && (
                                <div className="wizard-recs">
                                    <h3>How to reduce cost</h3>
                                    <ul>
                                        {calculations.recommendations.map((rec) => (
                                            <li key={rec.id}>
                                                <strong>{rec.title}</strong>
                                                <p>{rec.rationale}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="wizard-actions">
                        {!reportReady && (
                            <button type="button" className="btn btn-secondary" onClick={() => setStep(2)} disabled={isBusy}>
                                Back to documents
                            </button>
                        )}
                        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={isBusy}>
                            {busy === 'generate' || busy === 'download' ? (
                                'Building your PDF...'
                            ) : reportReady ? (
                                'Update report'
                            ) : (
                                'Confirm and generate PDF'
                            )}
                        </button>
                        {reportReady && assessment && (
                            <>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleDownloadAgain}
                                    disabled={isBusy}
                                >
                                    <DownloadIcon size={16} /> Download PDF again
                                </button>
                                <Link className="btn btn-ghost" href={`/assessments/${assessment.id}/report`}>
                                    Open report page
                                </Link>
                                <button type="button" className="btn btn-ghost" onClick={startAnother}>
                                    Start another enquiry
                                </button>
                            </>
                        )}
                    </div>

                    {assessment && (
                        <details className="wizard-details">
                            <summary>Need more control? Open the advanced workspace</summary>
                            <p className="wizard-hint">
                                The advanced workspace shows every source, confidence flag and evidence link for this enquiry.
                            </p>
                            <Link className="btn btn-secondary btn-sm" href={`/assessments/${assessment.id}`}>
                                Open advanced workspace
                            </Link>
                        </details>
                    )}
                </section>
            )}
        </div>
    );
}
