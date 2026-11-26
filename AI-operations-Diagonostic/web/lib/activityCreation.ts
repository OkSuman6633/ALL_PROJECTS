import type { ActivityCreateInput, FactPatchPayload } from '@/types/assessment';

export function buildAddActivityPayload(
  expectedRevision: number,
  activity: ActivityCreateInput
): FactPatchPayload {
  const { label, monthly_volume, minutes_per_unit, hourly_rate, currency, confirmed, source_ids } = activity;

  return {
    expected_revision: expectedRevision,
    add_activities: [
      {
        label,
        monthly_volume,
        minutes_per_unit,
        hourly_rate,
        currency,
        confirmed,
        ...(source_ids === undefined ? {} : { source_ids }),
      },
    ],
  };
}
