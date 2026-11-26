import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addEvidenceFiles,
  buildBatchAnalysisFormData,
  buildMetadataAssessmentPayload,
  canConfirmActivity,
  classifyActivity,
  getEvidenceLocation,
  removeEvidenceFile,
  summarizeFileOutcomes,
} from '../lib/diagnosticWorkflow.ts';

const makeFile = (name, type, content = 'data') =>
  new File([content], name, { type, lastModified: 1 });

test('metadata-only assessment payload leaves the activity list to the API default', () => {
  const payload = buildMetadataAssessmentPayload({
    process_name: 'Invoice processing',
    sector: 'Finance',
    description: 'Supplier invoice handling',
    currency: 'GBP',
  });

  assert.equal(Object.hasOwn(payload, 'activity_inputs'), false);
  assert.equal(payload.process_name, 'Invoice processing');
});

test('combined PDF and CSV selection preserves existing files and reports unsupported files', () => {
  const pdf = makeFile('procedure.pdf', 'application/pdf');
  const csv = makeFile('operations.csv', 'text/csv');
  const unsupported = makeFile('notes.txt', 'text/plain');
  const result = addEvidenceFiles([pdf], [csv, unsupported]);

  assert.deepEqual(result.files, [pdf, csv]);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /notes\.txt/);
});

test('file removal supports replacing a selected file without dropping others', () => {
  const pdf = makeFile('procedure.pdf', 'application/pdf');
  const csv = makeFile('operations.csv', 'text/csv');
  const replacement = makeFile('revised-procedure.pdf', 'application/pdf');
  const remaining = removeEvidenceFile([pdf, csv], pdf);
  const result = addEvidenceFiles(remaining, [replacement]);

  assert.deepEqual(result.files, [csv, replacement]);
});

test('batch multipart payload includes each file under the files field', () => {
  const pdf = makeFile('procedure.pdf', 'application/pdf');
  const csv = makeFile('operations.csv', 'text/csv');
  const formData = buildBatchAnalysisFormData({ expected_revision: 6, files: [pdf, csv] });

  assert.equal(formData.get('expected_revision'), '6');
  assert.deepEqual(formData.getAll('files').map((file) => file.name), [
    'procedure.pdf',
    'operations.csv',
  ]);
});

test('review categories never automatically confirm extracted activities', () => {
  const complete = {
    monthly_volume: 10,
    minutes_per_unit: 5,
    hourly_rate: 20,
    is_valid: true,
    confirmed: false,
    rejected: false,
    validation_errors: [],
    ambiguity_flags: [],
  };
  const needsReview = { ...complete, ambiguity_flags: ['Check currency'] };
  const blocked = { ...complete, is_valid: false, validation_errors: ['Invalid rate'] };

  assert.equal(classifyActivity(complete), 'ready');
  assert.equal(complete.confirmed, false);
  assert.equal(classifyActivity(needsReview), 'needs_review');
  assert.equal(classifyActivity(blocked), 'blocked');
  assert.equal(classifyActivity({ ...complete, confirmed: true }), 'confirmed');
  assert.equal(canConfirmActivity(complete), true);
  assert.equal(canConfirmActivity(blocked), false);
});

test('partial file failure is explicit and retryable', () => {
  assert.equal(
    summarizeFileOutcomes([
      { filename: 'procedure.pdf', status: 'succeeded' },
      { filename: 'operations.csv', status: 'failed' },
    ]),
    'partial_failure'
  );
  assert.equal(
    summarizeFileOutcomes([{ filename: 'operations.csv', status: 'failed' }]),
    'failed'
  );
});

test('missing evidence location is labelled unavailable rather than inferred', () => {
  assert.equal(getEvidenceLocation({}), 'Source location unavailable');
  assert.equal(
    getEvidenceLocation({ provenance: { source_type: 'pdf', provider: 'gemini', page_number: 1 } }),
    'PDF page not verified'
  );
  assert.equal(
    getEvidenceLocation({ provenance: { source_type: 'csv', row_number: 12 } }),
    'CSV row 12'
  );
});
