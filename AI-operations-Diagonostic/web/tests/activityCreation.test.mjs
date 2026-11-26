import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAddActivityPayload } from '../lib/activityCreation.ts';
import { formatApiValidationError } from '../lib/apiErrors.ts';

test('activity creation payload uses add_activities and excludes temporary IDs', () => {
  const activity = {
    activity_id: '__new__',
    label: 'New step',
    monthly_volume: 100,
    minutes_per_unit: 5,
    hourly_rate: 25,
    currency: 'GBP',
    confirmed: true,
  };

  assert.deepEqual(buildAddActivityPayload(4, activity), {
    expected_revision: 4,
    add_activities: [
      {
        label: 'New step',
        monthly_volume: 100,
        minutes_per_unit: 5,
        hourly_rate: 25,
        currency: 'GBP',
        confirmed: true,
      },
    ],
  });
});

test('validation failures show the backend error rather than a generic status', () => {
  assert.equal(
    formatApiValidationError([
      { msg: 'Value error, Added activity 1: activity label cannot be blank.' },
    ]),
    'Added activity 1: activity label cannot be blank.'
  );
});
