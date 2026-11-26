'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { buildAddActivityPayload } from '@/lib/activityCreation';
import {
  evidenceFileKey,
  summarizeFileOutcomes,
  type EvidenceFileOutcome,
} from '@/lib/diagnosticWorkflow';
import type { Assessment, Activity, ActivityCreateInput } from '@/types/assessment';

export type AnalysisWorkflowResult = {
  status: 'completed' | 'awaiting_review' | 'partial_failure' | 'failed' | 'blocked';
  fileOutcomes: EvidenceFileOutcome[];
  message: string;
};

interface AssessmentContextValue {
  assessment: Assessment | null;
  isLoading: boolean;
  isBusy: boolean;
  errorMessage: string;
  successNotice: string;
  setErrorMessage: (msg: string) => void;
  setSuccessNotice: (msg: string) => void;
  reload: () => Promise<void>;
  addActivity: (activity: ActivityCreateInput) => Promise<boolean>;
  updateActivity: (activityId: string, patch: Partial<Activity>) => Promise<boolean>;
  removeActivity: (activityId: string) => Promise<void>;
  toggleConfirmFact: (activity: Activity) => Promise<void>;
  alignCurrency: (currency: string) => Promise<void>;
  uploadEvidence: (file: File) => Promise<void>;
  analyzeOperations: (files: File[]) => Promise<AnalysisWorkflowResult>;
  runAnalysis: () => Promise<void>;
  reextract: () => Promise<void>;
  approveReport: () => Promise<void>;
  downloadPdf: () => Promise<void>;
}

const AssessmentContext = createContext<AssessmentContextValue | null>(null);

export function AssessmentProvider({
  assessmentId,
  children,
}: {
  assessmentId: string;
  children: React.ReactNode;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const activityCreateInFlight = useRef(false);

  const handleError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof ApiClientError) {
      setErrorMessage(err.message);
    } else if (err instanceof Error) {
      setErrorMessage(err.message);
    } else {
      setErrorMessage(fallback);
    }
  }, []);

  const loadAssessment = useCallback(async () => {
    try {
      const data = await api.getAssessment(assessmentId);
      setAssessment(data);
    } catch (err) {
      handleError(err, 'Failed to load assessment data.');
    } finally {
      setIsLoading(false);
    }
  }, [assessmentId, handleError]);

  useEffect(() => {
    void loadAssessment();
  }, [loadAssessment]);

  const reload = useCallback(async () => {
    setIsBusy(true);
    try {
      await loadAssessment();
    } finally {
      setIsBusy(false);
    }
  }, [loadAssessment]);

  const addActivity = useCallback(
    async (activity: ActivityCreateInput): Promise<boolean> => {
      if (!assessment || activityCreateInFlight.current) return false;
      activityCreateInFlight.current = true;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const updated = await api.patchFacts(
          assessment.id,
          buildAddActivityPayload(assessment.revision, activity)
        );
        setAssessment(updated);
        setSuccessNotice('Activity added successfully.');
        return true;
      } catch (err) {
        handleError(err, 'Failed to add activity.');
        return false;
      } finally {
        activityCreateInFlight.current = false;
        setIsBusy(false);
      }
    },
    [assessment, handleError]
  );

  const updateActivity = useCallback(
    async (activityId: string, patch: Partial<Activity>): Promise<boolean> => {
      if (!assessment) return false;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const change: Record<string, unknown> = { activity_id: activityId };
        if (patch.label !== undefined) change.label = patch.label;
        if (patch.monthly_volume !== undefined) change.monthly_volume = patch.monthly_volume;
        if (patch.minutes_per_unit !== undefined) change.minutes_per_unit = patch.minutes_per_unit;
        if (patch.hourly_rate !== undefined) change.hourly_rate = patch.hourly_rate;
        if (patch.currency !== undefined) change.currency = patch.currency;
        if (patch.source_ids !== undefined) change.source_ids = patch.source_ids;
        if (patch.confirmed !== undefined) change.confirmed = patch.confirmed;
        if (patch.rejected !== undefined) change.rejected = patch.rejected;

        const updated = await api.patchFacts(assessment.id, {
          expected_revision: assessment.revision,
          changes: [change as any],
        });
        setAssessment(updated);
        setSuccessNotice('Activity facts saved. Re-run analysis to recalculate authoritative totals.');
        return true;
      } catch (err) {
        handleError(err, 'Failed to update activity fact.');
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [assessment, handleError]
  );

  const removeActivity = useCallback(
    async (activityId: string) => {
      if (!assessment) return;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const updated = await api.patchFacts(assessment.id, {
          expected_revision: assessment.revision,
          changes: [],
          remove_activity_ids: [activityId],
        });
        setAssessment(updated);
        setSuccessNotice('Activity removed.');
      } catch (err) {
        handleError(err, 'Failed to remove activity.');
      } finally {
        setIsBusy(false);
      }
    },
    [assessment, handleError]
  );

  const toggleConfirmFact = useCallback(
    async (activity: Activity) => {
      if (!assessment) return;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const updated = await api.patchFacts(assessment.id, {
          expected_revision: assessment.revision,
          changes: [
            {
              activity_id: activity.activity_id,
              confirmed: !activity.confirmed,
              rejected: false,
            },
          ],
        });
        setAssessment(updated);
        setSuccessNotice(
          activity.confirmed
            ? 'Marked as unconfirmed candidate.'
            : 'Activity confirmed as verified operational fact.'
        );
      } catch (err) {
        handleError(err, 'Failed to toggle fact confirmation.');
      } finally {
        setIsBusy(false);
      }
    },
    [assessment, handleError]
  );

  const alignCurrency = useCallback(
    async (targetCurrency: string) => {
      if (!assessment) return;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const updated = await api.patchFacts(assessment.id, {
          expected_revision: assessment.revision,
          currency: targetCurrency,
        });
        setAssessment(updated);
        setSuccessNotice(`Assessment currency aligned to ${targetCurrency}.`);
      } catch (err) {
        handleError(err, 'Failed to align currency.');
      } finally {
        setIsBusy(false);
      }
    },
    [assessment, handleError]
  );

  const uploadEvidence = useCallback(
    async (file: File) => {
      if (!assessment) return;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const result = await api.uploadEvidence(assessment.id, file);
        setAssessment(result.assessment);
        setSuccessNotice(`Uploaded "${file.name}". Extracted candidate items require reviewer review.`);
      } catch (err) {
        handleError(err, 'Failed to upload evidence file.');
      } finally {
        setIsBusy(false);
      }
    },
    [assessment, handleError]
  );

  const analyzeOperations = useCallback(
    async (files: File[]): Promise<AnalysisWorkflowResult> => {
      if (!assessment) {
        return { status: 'failed', fileOutcomes: [], message: 'Assessment is not loaded.' };
      }

      if (files.length === 0 && assessment.uploads.length === 0) {
        return {
          status: 'blocked',
          fileOutcomes: [],
          message: 'Select at least one PDF or CSV before analysing this diagnostic.',
        };
      }

      setIsBusy(true);
      setErrorMessage('');
      const fileOutcomes: EvidenceFileOutcome[] = [];
      let currentAssessment = assessment;

      try {
        for (const file of files) {
          try {
            const result = await api.uploadEvidence(currentAssessment.id, file);
            currentAssessment = result.assessment;
            setAssessment(currentAssessment);
            const extractionStatus = result.extraction.status.toLowerCase();
            const extractionFailed =
              extractionStatus.includes('fail') ||
              extractionStatus.includes('error') ||
              Boolean(result.extraction.error_code);
            fileOutcomes.push({
              key: evidenceFileKey(file),
              filename: file.name,
              status: extractionFailed ? 'failed' : 'succeeded',
              retryable: false,
              error: extractionFailed
                ? result.extraction.note || result.extraction.error_code || 'Evidence extraction did not complete.'
                : undefined,
            });
          } catch (err) {
            fileOutcomes.push({
              key: evidenceFileKey(file),
              filename: file.name,
              status: 'failed',
              retryable: true,
              error: err instanceof Error ? err.message : 'Upload failed.',
            });
          }
        }

        const successfulUploads = fileOutcomes.some((outcome) => outcome.status === 'succeeded');
        if (!successfulUploads && currentAssessment.uploads.length === 0) {
          const message = 'No evidence file was processed successfully. Review the file errors and retry.';
          return {
            status: 'failed',
            fileOutcomes,
            message,
          };
        }

        const result = await api.runAnalysis(currentAssessment.id, {
          expected_revision: currentAssessment.revision,
        });
        currentAssessment = result.assessment;
        setAssessment(currentAssessment);

        const uploadStatus = summarizeFileOutcomes(fileOutcomes);
        const eligibleCount = currentAssessment.calculations?.calculation_eligible_activity_count ?? 0;
        const status =
          uploadStatus === 'failed'
            ? 'failed'
            : uploadStatus === 'partial_failure'
            ? 'partial_failure'
            : eligibleCount > 0
              ? 'completed'
              : currentAssessment.activities.length > 0
                ? 'awaiting_review'
                : 'blocked';
        const message =
          status === 'completed'
            ? 'Evidence processed. Review every extracted fact before treating it as verified.'
            : status === 'partial_failure'
              ? 'Analysis completed with file errors. Review each result; only failed uploads are offered for retry.'
              : status === 'failed'
                ? 'Evidence processing failed. Retry failed uploads, or use Advanced stages to re-extract files already stored.'
              : status === 'awaiting_review'
                ? 'Processing finished. Extracted facts are unverified and require your review and confirmation.'
                : 'No eligible, confirmed activities are available for authoritative calculations yet.';
        setSuccessNotice(status === 'completed' || status === 'awaiting_review' ? message : '');
        return { status, fileOutcomes, message };
      } catch (err) {
        handleError(err, 'Analysis failed. Retry when the service is available.');
        return {
          status: 'failed',
          fileOutcomes,
          message: err instanceof Error ? err.message : 'Analysis failed. Retry when the service is available.',
        };
      } finally {
        setIsBusy(false);
      }
    },
    [assessment, handleError]
  );

  const runAnalysis = useCallback(async () => {
    if (!assessment) return;
    setIsBusy(true);
    setErrorMessage('');
    try {
      const res = await api.runAnalysis(assessment.id, {
        expected_revision: assessment.revision,
      });
      setAssessment(res.assessment);
      setSuccessNotice('Analysis completed. Review the calculated scenarios and recommendations.');
    } catch (err) {
      handleError(err, 'Failed to run analysis.');
    } finally {
      setIsBusy(false);
    }
  }, [assessment, handleError]);

  const reextract = useCallback(async () => {
    if (!assessment) return;
    setIsBusy(true);
    setErrorMessage('');
    try {
      const updated = await api.reextractAssessment(assessment.id);
      setAssessment(updated);
      setSuccessNotice('Re-extraction completed across all uploaded sources.');
    } catch (err) {
      handleError(err, 'Failed to re-extract sources.');
    } finally {
      setIsBusy(false);
    }
  }, [assessment, handleError]);

  const approveReport = useCallback(async () => {
    if (!assessment) return;
    setIsBusy(true);
    setErrorMessage('');
    try {
      const assumptions: Record<string, unknown> = {
        reviewer_confirmed: true,
        confirmed_at: new Date().toISOString(),
      };
      if (assessment.calculations?.currency_mismatch) {
        assumptions.currency_mismatch_acknowledged = true;
      }
      await api.approveReport(assessment.id, {
        expected_revision: assessment.revision,
        accepted_assumptions: assumptions,
      });
      const fresh = await api.getAssessment(assessment.id);
      setAssessment(fresh);
      setSuccessNotice('Report approved! You can now download the finalized diagnostic PDF.');
    } catch (err) {
      handleError(err, 'Failed to approve report.');
    } finally {
      setIsBusy(false);
    }
  }, [assessment, handleError]);

  const downloadPdf = useCallback(async () => {
    if (!assessment) return;
    setIsBusy(true);
    setErrorMessage('');
    try {
      const blob = await api.downloadReportPdf(assessment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const prefix = assessment.is_sandbox ? 'sandbox-diagnostic' : 'ai-operations-diagnostic';
      link.download = `${prefix}-report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      handleError(err, 'Failed to download PDF report.');
    } finally {
      setIsBusy(false);
    }
  }, [assessment, handleError]);

  return (
    <AssessmentContext.Provider
      value={{
        assessment,
        isLoading,
        isBusy,
        errorMessage,
        successNotice,
        setErrorMessage,
        setSuccessNotice,
        reload,
        addActivity,
        updateActivity,
        removeActivity,
        toggleConfirmFact,
        alignCurrency,
        uploadEvidence,
        analyzeOperations,
        runAnalysis,
        reextract,
        approveReport,
        downloadPdf,
      }}
    >
      {children}
    </AssessmentContext.Provider>
  );
}

export function useAssessmentContext() {
  const ctx = useContext(AssessmentContext);
  if (!ctx) {
    throw new Error('useAssessmentContext must be used within an AssessmentProvider');
  }
  return ctx;
}
