import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  new URL('../components/assessment/DiagnosticWorkspace.tsx', import.meta.url),
  'utf8'
);
const assessmentLayout = readFileSync(
  new URL('../app/assessments/[assessmentId]/layout.tsx', import.meta.url),
  'utf8'
);
const newAssessment = readFileSync(
  new URL('../app/assessments/new/page.tsx', import.meta.url),
  'utf8'
);
const evidencePage = readFileSync(
  new URL('../app/assessments/[assessmentId]/evidence/page.tsx', import.meta.url),
  'utf8'
);
const baselinePage = readFileSync(
  new URL('../app/assessments/[assessmentId]/baseline/page.tsx', import.meta.url),
  'utf8'
);
const reviewPage = readFileSync(
  new URL('../app/assessments/[assessmentId]/review/page.tsx', import.meta.url),
  'utf8'
);
const recommendationsPage = readFileSync(
  new URL('../app/assessments/[assessmentId]/recommendations/page.tsx', import.meta.url),
  'utf8'
);
const reportPage = readFileSync(
  new URL('../app/assessments/[assessmentId]/report/page.tsx', import.meta.url),
  'utf8'
);
const factReview = readFileSync(
  new URL('../components/FactReviewSection.tsx', import.meta.url),
  'utf8'
);
const overviewPage = readFileSync(
  new URL('../app/overview/page.tsx', import.meta.url),
  'utf8'
);
const assessmentsListPage = readFileSync(
  new URL('../app/assessments/page.tsx', import.meta.url),
  'utf8'
);
const recommendationsListPage = readFileSync(
  new URL('../app/recommendations/page.tsx', import.meta.url),
  'utf8'
);
const reportsLibraryPage = readFileSync(
  new URL('../app/reports/page.tsx', import.meta.url),
  'utf8'
);
const historyPage = readFileSync(
  new URL('../app/history/page.tsx', import.meta.url),
  'utf8'
);
const sandboxPage = readFileSync(
  new URL('../app/sandbox/page.tsx', import.meta.url),
  'utf8'
);
const settingsPage = readFileSync(
  new URL('../app/settings/page.tsx', import.meta.url),
  'utf8'
);

test('assessment workspace avoids redundant processing and upload instructions', () => {
  assert.doesNotMatch(
    workspace,
    /Files are processed one at a time by the existing API\./,
    'do not expose internal processing-order details'
  );
  assert.doesNotMatch(
    workspace,
    /Upload and analysis requests run synchronously\. This interface does not report background-job progress\./,
    'do not expose implementation details about processing'
  );
  assert.doesNotMatch(
    workspace,
    /Existing uploaded evidence remains in the assessment\./,
    'do not repeat that uploaded evidence is retained'
  );
});

test('assessment workspace keeps its primary action and file-format guidance', () => {
  assert.match(workspace, /Analyse My Operations/);
  assert.match(workspace, /PDF and CSV only/);
});

test('sandbox notice explains that the test assessment is isolated', () => {
  assert.match(
    assessmentLayout,
    /This is an isolated test assessment\.[\s\S]*?will not affect production records\./
  );
});

test('currency mismatches remain visibly blocking for report approval', () => {
  assert.match(
    workspace,
    /Evidence currency \([\s\S]*?\) differs from assessment currency \([\s\S]*?\)\. Resolve the currency issue before report approval\./
  );
});

test('file-processing failures keep their error details visible', () => {
  assert.match(
    workspace,
    /failed\$\{[^?]*\?\s*` — \$\{[^}]+\}`/,
    'show the processing error alongside its failed-file status'
  );
});

test('supporting evidence details remain in a native disclosure', () => {
  assert.match(
    workspace,
    /<details\b[^>]*>\s*<summary\b[^>]*>Evidence and source details<\/summary>[\s\S]*?File:[\s\S]*?Location:[\s\S]*?<\/details>/
  );
});

test('assessment routes avoid repeated or technical supporting copy', () => {
  assert.doesNotMatch(newAssessment, /These details identify the diagnostic; no activity facts are assumed\./);
  assert.doesNotMatch(evidencePage, /Uploaded files and their processing status/);
  assert.doesNotMatch(baselinePage, /Stage 01 — Operational Process Baseline/);
  assert.doesNotMatch(reviewPage, /Stage 03 — Review and Confirm Activities/);
  assert.doesNotMatch(recommendationsPage, /Stage 04 — Improvement Opportunities & Capacity Scenarios/);
  assert.doesNotMatch(reportPage, /Stage 05 — Diagnostic Report & Executive Verification/);
  assert.doesNotMatch(reviewPage, /Monthly Vol \(null if empty\)/);
  assert.doesNotMatch(reviewPage, /:\s*<span[^>]*>null<\/span>/);
  assert.doesNotMatch(reportPage, /:\s*'null'/);
  assert.doesNotMatch(reviewPage, /Upload evidence documents in Stage 02/);
  assert.doesNotMatch(reportPage, /Operational Intelligence Diagnostic Report/);
  assert.doesNotMatch(reportPage, /current API/);
  assert.doesNotMatch(reportPage, /server reports no eligible/);
  assert.doesNotMatch(factReview, /Rate missing \(null\)/);
});

test('assessment creation, upload, and baseline retain required inputs and actions', () => {
  assert.match(newAssessment, /Process name[\s\S]*?required/);
  assert.match(newAssessment, /role="alert"/);
  assert.match(newAssessment, /setErrorMessage\(\s*detail\s*\)/);
  assert.match(newAssessment, /Create diagnostic/);
  assert.match(evidencePage, /Standard Operating Procedures/);
  assert.match(evidencePage, /\.pdf/);
  assert.match(evidencePage, /\.csv/);
  assert.match(evidencePage, /up to 10 MB/);
  assert.match(evidencePage, /Browse Files/);
  assert.match(evidencePage, /Add a PDF procedure or CSV log above to get started/);
  assert.match(baselinePage, /Activity Name/);
  assert.match(baselinePage, /Activity label cannot be empty/);
  assert.match(baselinePage, /Save Step/);
});

test('review and report preserve currency blockers, results, caveats, and next actions', () => {
  assert.match(reviewPage, /Currency Discrepancy Detected/);
  assert.match(reviewPage, /Approval is blocked until currencies are aligned/);
  assert.match(reviewPage, /Next: Recommendations/);
  assert.match(recommendationsPage, /not guaranteed or realized cash savings/);
  assert.match(recommendationsPage, /Next: Diagnostic Report/);
  assert.match(reportPage, /Evidence currency mismatch/);
  assert.match(reportPage, /Acknowledge mismatch as reviewer assumption/);
  assert.match(reportPage, /Annual Handling Time/);
  assert.match(reportPage, /Annual Labour Effort Cost/);
  assert.match(reportPage, /Approve report/);
  assert.match(reportPage, /[Uu]nverified PDF page references are not treated as confirmed/);
  assert.match(reportPage, /Export Diagnostic PDF/);
});

test('overview and list pages avoid redundant page descriptions', () => {
  assert.doesNotMatch(
    overviewPage,
    /Monitor operational assessments, evidence quality, and improvement opportunities across your enterprise workspace\./
  );
  assert.doesNotMatch(overviewPage, /Breakdown across active diagnostic stages/);
  assert.doesNotMatch(
    assessmentsListPage,
    /Create, manage and review operational diagnostic assessments across business processes\./
  );
  assert.doesNotMatch(
    recommendationsListPage,
    /Cross-workspace operational hypotheses and evidence-backed efficiency opportunities\./
  );
  assert.doesNotMatch(recommendationsListPage, /Improvement Recommendations Explorer/);
  assert.doesNotMatch(
    reportsLibraryPage,
    /Repository of verified, human-approved operational diagnostic reports ready for PDF export and executive review\./
  );
  assert.doesNotMatch(reportsLibraryPage, /Diagnostic Reports Library/);
  assert.doesNotMatch(
    historyPage,
    /Historical records, revisions, and audit trails for all production operational assessments\./
  );
  assert.doesNotMatch(historyPage, /Assessment History & Audit Archive/);
});

test('overview and list pages retain actions, metrics, filters, results, and errors', () => {
  assert.match(overviewPage, /Operations Overview/);
  assert.match(overviewPage, /New Assessment/);
  assert.match(overviewPage, /Open Sandbox/);
  assert.match(overviewPage, /Total Assessments/);
  assert.match(overviewPage, /Analyzed Annual Effort Value/);
  assert.match(overviewPage, /formatCurrency\(kpis\.totalLaborValue/);
  assert.match(overviewPage, /\{error\}/);
  assert.match(overviewPage, /Create an assessment to see progress here/);

  assert.match(assessmentsListPage, /Search by process name, sector, or ID/);
  assert.match(assessmentsListPage, /All Statuses/);
  assert.match(assessmentsListPage, /All Sectors/);
  assert.match(assessmentsListPage, /Annual Handling Effort/);
  assert.match(assessmentsListPage, /Pending analysis/);
  assert.match(assessmentsListPage, /No assessments match your current filters/);
  assert.match(assessmentsListPage, /\{error\}/);

  assert.match(recommendationsListPage, /All Priorities/);
  assert.match(recommendationsListPage, /All Sectors/);
  assert.match(recommendationsListPage, /\{rec\.rationale\}/);
  assert.match(recommendationsListPage, /Evidence gap: Needs supporting logs/);
  assert.match(recommendationsListPage, /View in Assessment/);
  assert.match(recommendationsListPage, /Complete baseline fact review and run analysis to generate recommendations/);
  assert.match(recommendationsListPage, /\{error\}/);

  assert.match(reportsLibraryPage, /Include unapproved drafts/);
  assert.match(reportsLibraryPage, /Annual Handling Effort/);
  assert.match(reportsLibraryPage, /Labour Cost/);
  assert.match(reportsLibraryPage, /Download PDF/);
  assert.match(reportsLibraryPage, /Approve an assessment to see its report here/);
  assert.match(reportsLibraryPage, /\{error\}/);
  assert.match(reportsLibraryPage, /const reportName = assessment\.process_name[\s\S]*?replace\(/);
  assert.match(reportsLibraryPage, /link\.download = `\$\{reportName\}-report\.pdf`/);
  assert.doesNotMatch(reportsLibraryPage, /link\.download = 'ai-operations-diagnostic-report\.pdf'/);

  assert.match(historyPage, /All Statuses/);
  assert.match(historyPage, /All Reports/);
  assert.match(historyPage, /Created Date/);
  assert.match(historyPage, /Last Modified/);
  assert.match(historyPage, /Report Ready/);
  assert.match(historyPage, /Download approved PDF/);
  assert.match(historyPage, /\{error\}/);
  assert.match(historyPage, /const reportName = assessment\.process_name[\s\S]*?replace\(/);
  assert.match(historyPage, /link\.download = `\$\{reportName\}-report\.pdf`/);
  assert.doesNotMatch(historyPage, /link\.download = 'ai-operations-diagnostic-report\.pdf'/);
});

test('sandbox copy is concise and reset protections remain clear', () => {
  assert.doesNotMatch(
    sandboxPage,
    /Execute synthetic test scenarios, validate document extraction rules, and verify calculation governance in full isolation\./
  );
  assert.doesNotMatch(
    sandboxPage,
    /Instantiate realistic operational data models to test validation, extraction, and report flows/
  );
  assert.match(sandboxPage, /SANDBOX — ISOLATED TESTING/);
  assert.match(sandboxPage, /do not affect production assessments/);
  assert.match(sandboxPage, /Launch a test scenario above/);
  assert.match(sandboxPage, /Confirm Sandbox Reset/);
  assert.match(sandboxPage, /Production assessments, reports, and revision history will not be affected/);
  assert.match(sandboxPage, /onClick=\{handleResetSandbox\}/);
  assert.match(sandboxPage, /api\.resetSandbox\(\)/);
  assert.match(sandboxPage, /setShowResetModal\(false\)/);
  assert.match(sandboxPage, /setError\(\(err as Error\)\.message \|\| 'Failed to reset sandbox data\.'\)/);
});

test('settings remove implementation detail but preserve configuration and safety guidance', () => {
  assert.doesNotMatch(
    settingsPage,
    /Manage operational defaults, intelligence providers, environment configuration, and governance policies\./
  );
  assert.doesNotMatch(settingsPage, /Pre-populate new operational diagnostic assessments with consistent organization standards/);
  assert.doesNotMatch(settingsPage, /Pydantic model contracts/);
  assert.doesNotMatch(settingsPage, /Tenant Identifier/);
  assert.doesNotMatch(settingsPage, /API Base Endpoint/);
  assert.doesNotMatch(settingsPage, /Storage Architecture/);
  assert.doesNotMatch(settingsPage, /GEMINI_API_KEY/);

  assert.match(settingsPage, /Primary Workspace Currency/);
  assert.match(settingsPage, /Default Sector/);
  assert.match(settingsPage, /Default Measurement Period/);
  assert.match(settingsPage, /Default Throughput Unit/);
  assert.match(settingsPage, /Block Reports with Currency Mismatches/);
  assert.match(settingsPage, /Automatic Audit Trail/);
  assert.match(settingsPage, /Provider credentials are stored on the server and never exposed/);
  assert.match(settingsPage, /Human review/);
  assert.match(settingsPage, /Sandbox isolation/);
  assert.match(settingsPage, /Audit log/);
  assert.match(settingsPage, /\{providerError\}/);
  assert.match(settingsPage, /Failed to fetch provider status/);
  assert.match(settingsPage, /Workspace preferences updated successfully/);
  assert.match(settingsPage, /localStorage\.setItem\('ai_ops_workspace_preferences'/);
});
