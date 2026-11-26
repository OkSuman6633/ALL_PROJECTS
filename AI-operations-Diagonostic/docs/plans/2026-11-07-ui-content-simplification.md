# User-Facing UI Content Simplification Implementation Plan

> Execute one task at a time. Use a fresh implementation agent for each task and review its changes before continuing. Do not commit unless requested.

**Goal:** Reduce repeated, technical, and non-actionable copy across every user-facing page while preserving decision-critical information and workflow behavior.

**Architecture:** Keep the existing Next.js page and component structure. Simplify visible copy and use native expandable sections for long supporting details, without changing API calls, calculations, navigation, or stored data.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node.js built-in test runner, ESLint.

---

### Task 1: Add content-cleanup regression coverage

**Files:**
- Create: `web/tests/site-copy.test.mjs`
- Reference: `docs/ui-content-simplification-design.md`

**Step 1: Write failing tests for the agreed content rules**

Add focused source-level checks for the current clutter in the assessment workspace and for preservation of decision-critical copy. Cover:
- The redundant upload instructions and repeated assessment workspace introduction are absent after cleanup.
- The sandbox safety notice, file format guidance, blocking currency warning, and file-processing errors remain.
- Secondary evidence and audit detail remains in a native `<details>` disclosure when it is collapsed.

**Step 2: Run the tests and verify the expected failures**

Run from the repository root:

```powershell
Set-Location web
node --test tests\site-copy.test.mjs
```

Expected: FAIL because the existing workspace still contains duplicate instructional copy and supporting content is not consistently compact.

### Task 2: Simplify the main assessment workspace

**Files:**
- Modify: `web/components/assessment/DiagnosticWorkspace.tsx`
- Modify: `web/app/assessments/[assessmentId]/layout.tsx`
- Test: `web/tests/site-copy.test.mjs`

**Step 1: Remove redundant workspace copy**

Keep the page title, one concise instruction for uploading and reviewing activity data, the file type hint, the current status, and actionable per-file results. Remove the processing-order explanation, redundant reminders about already-uploaded files, and repeated explanation of confirmation rules when already stated by section controls.

**Step 2: Keep supporting material accessible**

Keep the existing uploaded-file list and confirmed-fact/evidence detail in native `<details>` sections. Preserve sandbox isolation, currency-mismatch warnings, processing errors, and review-blocking messages in the visible flow.

**Step 3: Run the focused regression test**

Run:

```powershell
Set-Location web
node --test tests\site-copy.test.mjs
```

Expected: PASS with all workflow-critical copy present and repeated instructions absent.

### Task 3: Simplify assessment creation, evidence, baseline, review, and report pages

**Files:**
- Modify: `web/app/assessments/new/page.tsx`
- Modify: `web/app/assessments/[assessmentId]/page.tsx`
- Modify: `web/app/assessments/[assessmentId]/evidence/page.tsx`
- Modify: `web/app/assessments/[assessmentId]/baseline/page.tsx`
- Modify: `web/app/assessments/[assessmentId]/review/page.tsx`
- Modify: `web/app/assessments/[assessmentId]/recommendations/page.tsx`
- Modify: `web/app/assessments/[assessmentId]/report/page.tsx`
- Modify: `web/components/AssessmentDetail.tsx`
- Modify: `web/components/EvidenceSection.tsx`
- Modify: `web/components/ExtractionReviewQueue.tsx`
- Modify: `web/components/FactReviewSection.tsx`

**Step 1: Trim repeated titles, subtitles, and explanatory text**

Use one concise heading/context line per page or section. Remove jargon or text that restates adjacent labels, but keep form labels, required-file guidance, validation feedback, evidence-linked filenames, currency warnings, approval blockers, financial caveats, and report results.

**Step 2: Collapse only secondary detail**

Use existing native disclosure patterns for lengthy supporting detail if needed. Do not hide required inputs, errors, approval warnings, primary results, or the next action.

**Step 3: Run the focused regression test and lint affected files**

Run:

```powershell
Set-Location web
node --test tests\site-copy.test.mjs
.\node_modules\.bin\eslint.cmd 'app\assessments\new\page.tsx' 'app\assessments\[assessmentId]\evidence\page.tsx' 'app\assessments\[assessmentId]\baseline\page.tsx' 'app\assessments\[assessmentId]\review\page.tsx' 'app\assessments\[assessmentId]\recommendations\page.tsx' 'app\assessments\[assessmentId]\report\page.tsx' components\AssessmentDetail.tsx components\EvidenceSection.tsx components\ExtractionReviewQueue.tsx components\FactReviewSection.tsx
```

Expected: tests pass and ESLint reports no new errors.

### Task 4: Simplify overview, list, report library, history, sandbox, and settings

**Files:**
- Modify: `web/app/overview/page.tsx`
- Modify: `web/app/assessments/page.tsx`
- Modify: `web/app/recommendations/page.tsx`
- Modify: `web/app/reports/page.tsx`
- Modify: `web/app/reports/[reportId]/page.tsx`
- Modify: `web/app/history/page.tsx`
- Modify: `web/app/sandbox/page.tsx`
- Modify: `web/app/settings/page.tsx`
- Test: `web/tests/site-copy.test.mjs`

**Step 1: Trim redundant descriptions and empty-state text**

Keep the page purpose, primary controls, key table data, and actionable empty states. Remove verbose descriptions that repeat the page title, column labels, or available controls. In the sandbox, keep a short, unmistakable isolation warning. The root route only redirects, the report detail route only redirects with a loading status, and `Hero`, `AssessmentList`, and `CreateAssessmentPanel` have no current callers; leave these unchanged.

**Step 2: Keep configuration and governance safety copy**

Retain help required to make settings safe or understandable, and keep validation, save, reset, and provider error feedback. Remove backend identifiers and raw endpoint or storage internals from settings when they do not help users configure the workspace. Shorten wording rather than removing safeguards.

**Step 3: Run all frontend tests and lint affected files**

Run:

```powershell
Set-Location web
node --test
npm run lint
```

Expected: all Node tests pass and ESLint reports no new errors.

### Task 5: Review complete routes and verify the final UI

**Files:**
- Modify: `docs/ui-content-simplification-design.md` (add implementation and verification notes)

**Step 1: Build the frontend**

Run:

```powershell
Set-Location web
npm run build
```

Expected: optimized production build completes successfully.

**Step 2: Review all user-facing routes**

Check the page inventory from `web/app/**/page.tsx`. Confirm each has concise unique context, preserves decision-critical content, and does not expose internal identifiers. Inspect representative assessment, evidence, overview, report, and settings screens when browser preview is available.

**Step 3: Check whitespace and document evidence**

Run:

```powershell
git diff --check
```

Update the design notes only with the actual implemented scope and observed test/build/inspection results.

Do not commit unless explicitly requested.
