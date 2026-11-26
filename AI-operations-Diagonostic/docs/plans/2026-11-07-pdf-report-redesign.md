# PDF Report Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the generated operational diagnostic PDF substantially easier for managers to scan and read while retaining detailed, traceable operational and financial data.

**Architecture:** Keep the existing ReportLab renderer and calculation/API contracts. Reorganize the PDF into an executive snapshot and structured detail pages, embed ReportLab’s bundled Vera fonts, and use concise tables/cards that clearly distinguish verified labor cost from illustrative capacity value.

**Tech Stack:** Python 3.12, ReportLab Platypus and bundled TrueType fonts, pypdf, pytest.

---

### Task 1: Specify the report’s financial and content contract

**Files:**
- Create: `api/tests/test_report_rendering.py`
- Modify: `api/app/services/report.py`

**Step 1: Write failing PDF-content tests**

Add a minimal, representative assessment fixture using `calculate_assessment`. Render it and extract text with `pypdf`. Assert that the refreshed report identifies its executive snapshot, displays verified annual labor hours/cost and scenario values, explicitly calls opportunity values illustrative capacity value, and states ROI/payback/net savings/cash savings are not calculated. Add a second test with missing financial inputs to ensure unavailable values do not appear as fabricated zeroes.

**Step 2: Run the tests and verify the expected failures**

Run from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -c api\pytest.ini api\tests\test_report_rendering.py -q
```

Expected: the tests fail because the current report still uses the prose-first layout and does not clearly label profitability fields as not calculated.

**Step 3: Make the smallest renderer change to satisfy the content contract**

Keep all financial calculations in `calculate_assessment`; format only supplied values. Change narrative labels and ordering in `render_report` so verified baseline and illustrative scenario values are unmistakably distinct. Show “Not available”/“Not calculated” where inputs are absent, never a cash-savings, profit, ROI, or payback estimate.

**Step 4: Re-run the targeted tests**

Expected: the new financial/content tests pass and existing calculation values remain unchanged.

### Task 2: Rebuild the executive snapshot and detail tables

**Files:**
- Modify: `api/app/services/report.py`
- Test: `api/tests/test_report_rendering.py`

**Step 1: Add failing assertions for structure and traceability**

Assert the first page contains the four executive measures and scenario comparison; the activity table has distinct columns for activity/status, monthly volume, minutes/unit, rate, annual hours, and annual cost; and source references remain present. Assert long activity lists render across pages with all row labels retained.

**Step 2: Run the targeted tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -c api\pytest.ini api\tests\test_report_rendering.py -q
```

Expected: FAIL because the current eight-column register and current page organization do not match the new structure.

**Step 3: Implement the executive and detail-page layout**

Reorganize the story so page one leads with process metadata, concise executive finding, four KPI cards (annual confirmed hours, annual confirmed labor cost, base capacity hours, base illustrative capacity value), and three scenario rows. Follow with the activity/evidence register using the six readable fields above; put source references beneath the activity name. Keep recommendations as concise action/rationale cards and retain a compact limitations/provenance section. Preserve mixed-currency warnings, sandbox labeling, validation states, and confirmed-only totals. Avoid unsupported monetary impact in recommendations.

**Step 4: Verify normal and long reports**

Re-run the targeted tests and confirm pypdf extracts all rows, recommendations, assumptions, and evidence references from generated pages.

### Task 3: Improve typography, embedding, and page flow

**Files:**
- Modify: `api/app/services/report.py`
- Test: `api/tests/test_report_rendering.py`

**Step 1: Add failing tests for embedded fonts and exceptional layouts**

Inspect generated PDF resources with pypdf and assert that a TrueType font program is embedded. Add cases for mixed currency, sandbox reports, no eligible data, long process/activity names, and enough activity rows to force continuation pages.

**Step 2: Run the targeted tests**

Expected: FAIL for unembedded Helvetica and any missing scenario handling.

**Step 3: Register and use bundled Vera fonts**

Register ReportLab’s bundled `Vera.ttf`, `VeraBd.ttf`, `VeraIt.ttf`, and `VeraBI.ttf` using paths resolved from ReportLab’s installed package. Apply them consistently to headers, titles, KPI cards, tables, recommendations, and footnotes. Target 10–11 pt body text and 9–10 pt table text; reserve smaller sizes for concise captions. Improve contrast and whitespace, repeat table headers on continuation pages, and prevent individual activity rows/cards from splitting when possible. Keep A4 and running page numbers.

**Step 4: Re-run targeted PDF tests**

Expected: all tests pass, including font-embedding, missing-data, mixed-currency, sandbox, and long-report cases.

### Task 4: Inspect rendered output and verify regressions

**Files:**
- Modify: `docs/pdf-report-redesign.md`

**Step 1: Inspect generated PDFs**

Use the supplied example assessment values where practical. Check page text/order, page count, font embedding, and visual page rendering if a local PDF rasterizer is available. If no rasterizer is available, state this limitation and use pypdf text/resource checks without claiming visual inspection.

**Step 2: Run report and regression suites from the repository root**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -c api\pytest.ini api\tests\test_report_rendering.py api\tests\test_evidence_workflow_acceptance.py -q
.\.venv\Scripts\python.exe -m pytest -c api\pytest.ini api\tests -q
```

Expected: targeted report tests pass and the full API suite passes; repository-relative PDF fixtures resolve because pytest runs from the repository root.

**Step 3: Document final report behavior**

Update the design document’s implemented-behavior and verification sections to reflect the final renderer, financial labels, font choices, and actual test output.
