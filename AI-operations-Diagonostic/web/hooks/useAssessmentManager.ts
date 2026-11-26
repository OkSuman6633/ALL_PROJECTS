'use client';

import { useState, useCallback, useEffect } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type {
  Assessment,
  AssessmentCreatePayload,
  Activity,
} from '@/types/assessment';

export function useAssessmentManager() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const handleError = useCallback((err: unknown, fallbackMessage: string) => {
    if (err instanceof ApiClientError) {
      setErrorMessage(err.message);
    } else if (err instanceof Error) {
      setErrorMessage(err.message);
    } else {
      setErrorMessage(fallbackMessage);
    }
  }, []);

  const refreshAssessments = useCallback(async () => {
    try {
      const response = await api.getAssessments();
      setAssessments(response.items);
      // Update selectedAssessment if it exists in the new list
      setSelectedAssessment((prev) => {
        if (!prev) return null;
        const matching = response.items.find((item) => item.id === prev.id);
        return matching || prev;
      });
    } catch (err) {
      handleError(err, 'Failed to fetch assessments.');
    } finally {
      setIsInitialLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    void refreshAssessments();
  }, [refreshAssessments]);

  const selectAssessmentById = useCallback(async (id: string) => {
    setIsBusy(true);
    setErrorMessage('');
    try {
      const full = await api.getAssessment(id);
      setSelectedAssessment(full);
    } catch (err) {
      handleError(err, 'Failed to load assessment details.');
    } finally {
      setIsBusy(false);
    }
  }, [handleError]);

  const handleCreateAssessment = useCallback(
    async (payload: AssessmentCreatePayload) => {
      setIsBusy(true);
      setErrorMessage('');
      try {
        const created = await api.createAssessment(payload);
        setSelectedAssessment(created);
        setSuccessNotice('Assessment workspace created. Review baseline inputs before calculating.');
        await refreshAssessments();
      } catch (err) {
        handleError(err, 'Failed to create assessment.');
      } finally {
        setIsBusy(false);
      }
    },
    [refreshAssessments, handleError]
  );

  const handleToggleConfirmFact = useCallback(
    async (activity: Activity) => {
      if (!selectedAssessment) return;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const updated = await api.patchFacts(selectedAssessment.id, {
          expected_revision: selectedAssessment.revision,
          changes: [
            {
              activity_id: activity.activity_id,
              confirmed: !activity.confirmed,
            },
          ],
        });
        setSelectedAssessment(updated);
        setSuccessNotice('Fact confirmation updated. Re-run analysis to recalculate authoritative totals.');
        await refreshAssessments();
      } catch (err) {
        handleError(err, 'Failed to update activity fact.');
      } finally {
        setIsBusy(false);
      }
    },
    [selectedAssessment, refreshAssessments, handleError]
  );

  const handleUpdateActivity = useCallback(
    async (activityId: string, patch: Partial<Activity>) => {
      if (!selectedAssessment) return;
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

        const updated = await api.patchFacts(selectedAssessment.id, {
          expected_revision: selectedAssessment.revision,
          changes: [change as any],
        });
        setSelectedAssessment(updated);
        setSuccessNotice('Activity updated successfully. Re-run analysis to recalculate authoritative totals.');
        await refreshAssessments();
      } catch (err) {
        handleError(err, 'Failed to update activity.');
      } finally {
        setIsBusy(false);
      }
    },
    [selectedAssessment, refreshAssessments, handleError]
  );

  const handleRemoveActivity = useCallback(
    async (activityId: string) => {
      if (!selectedAssessment) return;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const updated = await api.patchFacts(selectedAssessment.id, {
          expected_revision: selectedAssessment.revision,
          changes: [],
          remove_activity_ids: [activityId],
        });
        setSelectedAssessment(updated);
        setSuccessNotice('Activity candidate removed.');
        await refreshAssessments();
      } catch (err) {
        handleError(err, 'Failed to remove activity.');
      } finally {
        setIsBusy(false);
      }
    },
    [selectedAssessment, refreshAssessments, handleError]
  );

  const handleReextract = useCallback(async () => {
    if (!selectedAssessment) return;
    setIsBusy(true);
    setErrorMessage('');
    try {
      const updated = await api.reextractAssessment(selectedAssessment.id);
      setSelectedAssessment(updated);
      setSuccessNotice('Re-extraction completed. Candidate activities updated from uploaded sources.');
      await refreshAssessments();
    } catch (err) {
      handleError(err, 'Failed to re-extract sources.');
    } finally {
      setIsBusy(false);
    }
  }, [selectedAssessment, refreshAssessments, handleError]);

  const handleUploadEvidence = useCallback(
    async (file: File) => {
      if (!selectedAssessment) return;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const result = await api.uploadEvidence(selectedAssessment.id, file);
        setSelectedAssessment(result.assessment);
        setSuccessNotice(
          `Uploaded "${file.name}". Extracted candidate items require manual review and confirmation.`
        );
        await refreshAssessments();
      } catch (err) {
        handleError(err, 'Failed to upload evidence file.');
      } finally {
        setIsBusy(false);
      }
    },
    [selectedAssessment, refreshAssessments, handleError]
  );

  const handleRunAnalysis = useCallback(async () => {
    if (!selectedAssessment) return;
    setIsBusy(true);
    setErrorMessage('');
    try {
      const result = await api.runAnalysis(selectedAssessment.id, {
        expected_revision: selectedAssessment.revision,
      });
      setSelectedAssessment(result.assessment);
      setSuccessNotice('Analysis completed. Review the calculated scenarios and recommendations.');
      await refreshAssessments();
    } catch (err) {
      handleError(err, 'Failed to run analysis.');
    } finally {
      setIsBusy(false);
    }
  }, [selectedAssessment, refreshAssessments, handleError]
  );

  const handleApproveReport = useCallback(async () => {
    if (!selectedAssessment) return;
    setIsBusy(true);
    setErrorMessage('');
    try {
      await api.approveReport(selectedAssessment.id, {
        expected_revision: selectedAssessment.revision,
        accepted_assumptions: {
          reviewer_confirmed: true,
          confirmed_at: new Date().toISOString(),
        },
      });
      const fresh = await api.getAssessment(selectedAssessment.id);
      setSelectedAssessment(fresh);
      setSuccessNotice('Report approved! You can now download the finalized diagnostic PDF.');
      await refreshAssessments();
    } catch (err) {
      handleError(err, 'Failed to approve report.');
    } finally {
      setIsBusy(false);
    }
  }, [selectedAssessment, refreshAssessments, handleError]
  );

  const handleDownloadPdf = useCallback(async () => {
    if (!selectedAssessment) return;
    setIsBusy(true);
    setErrorMessage('');
    try {
      const blob = await api.downloadReportPdf(selectedAssessment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ai-operations-diagnostic-${selectedAssessment.id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      handleError(err, 'Failed to download report PDF.');
    } finally {
      setIsBusy(false);
    }
  }, [selectedAssessment, handleError]);

  const handleAlignCurrency = useCallback(
    async (targetCurrency: string) => {
      if (!selectedAssessment) return;
      setIsBusy(true);
      setErrorMessage('');
      try {
        const updated = await api.patchFacts(selectedAssessment.id, {
          expected_revision: selectedAssessment.revision,
          currency: targetCurrency,
        });
        setSelectedAssessment(updated);
        setSuccessNotice(`Assessment currency aligned to ${targetCurrency}.`);
        await refreshAssessments();
      } catch (err) {
        handleError(err, 'Failed to align assessment currency.');
      } finally {
        setIsBusy(false);
      }
    },
    [selectedAssessment, refreshAssessments, handleError]
  );

  return {
    assessments,
    selectedAssessment,
    isInitialLoading,
    isBusy,
    errorMessage,
    successNotice,
    setErrorMessage,
    setSuccessNotice,
    refreshAssessments,
    selectAssessmentById,
    createAssessment: handleCreateAssessment,
    toggleConfirmFact: handleToggleConfirmFact,
    updateActivity: handleUpdateActivity,
    removeActivity: handleRemoveActivity,
    alignCurrency: handleAlignCurrency,
    reextract: handleReextract,
    uploadEvidence: handleUploadEvidence,
    runAnalysis: handleRunAnalysis,
    approveReport: handleApproveReport,
    downloadPdf: handleDownloadPdf,
  };
}
