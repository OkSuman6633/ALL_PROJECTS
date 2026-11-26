import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const uiFiles = [
  '../app/assessments/[assessmentId]/layout.tsx',
  '../app/assessments/[assessmentId]/review/page.tsx',
  '../app/assessments/[assessmentId]/evidence/page.tsx',
  '../app/assessments/[assessmentId]/baseline/page.tsx',
  '../app/assessments/[assessmentId]/report/page.tsx',
  '../app/assessments/page.tsx',
  '../app/reports/page.tsx',
  '../app/history/page.tsx',
  '../app/sandbox/page.tsx',
  '../components/AssessmentDetail.tsx',
  '../components/EvidenceSection.tsx',
  '../components/ExtractionReviewQueue.tsx',
  '../components/FactReviewSection.tsx',
];

test('user-facing assessment views do not render backend identifiers or digests', () => {
  const source = uiFiles
    .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
    .join('\n');

  const backendIdentifierDisplays = [
    /truncateId\((?:assessment|item|a)\.id/,
    /(?:TEST )?ID:\s*(?:<span[^>]*>)?\s*\{(?:assessment|item|a)\.id/,
    /\{file\.id\}\s*\(\s*\{file\.sha256/,
    /(?:SHA|SHA256):\s*\{[^}]*sha256/,
    /Source ID(?:\s*\/\s*Digest)?:/,
    /Source: \{(?:ext\.source_id|truncateId\(x\.source_id)/,
    /Provider: (?:<strong>)?\{(?:ext\.provider|providerLabel)/,
    /(?:Provenance|Linked|Source reference):\s*\{[^}]*source_ids/,
    /\{u\.id\} · SHA256:/,
    /\{x\.error_code\}/,
  ];

  for (const pattern of backendIdentifierDisplays) {
    assert.doesNotMatch(source, pattern);
  }
});
