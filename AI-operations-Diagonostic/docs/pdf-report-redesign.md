# PDF Report Redesign

## Understanding

- Redesign the generated backend PDF so managers can scan findings quickly and read its detailed evidence.
- Keep a detailed multi-page report, with the executive decision snapshot first and structured supporting sections after it.
- Put verified labor baseline metrics and clearly labeled illustrative capacity scenarios into concise, readable visual groupings.
- Keep the activity/evidence register and recommendations, but reduce prose and improve table structure, page flow, and typography.
- Do not invent profit, cash savings, ROI, net savings, or payback. Omit those measures when required inputs are absent and show useful unit economics that can be derived from confirmed activity data.
- Preserve the assessment API, calculated values, evidence traceability, currency warnings, sandbox labeling, and PDF export behavior.

## Findings from the supplied PDF

The supplied two-page report uses mostly 7–8.5 pt body and table text. Page one combines explanatory prose, baseline cards and table, and three scenarios, while the activity table and recommendations are pushed to page two. The activity register compresses eight columns into the page width, and baseline rows have tightly packed text. Extracted report content repeats the caveat that capacity value is not cash savings. This creates a dense first page, an awkward page break, and avoidable repetition.

The renderer already has a ReportLab implementation and the calculation model supplies confirmed annual hours and labor cost plus conservative/base/optimistic capacity-release hours and values. The model explicitly leaves `cash_savings` unset and has no implementation-cost input, so it cannot produce verified profit, ROI, net savings, or payback.

## Assumptions

- Keep A4, the current API response, and the ReportLab renderer; do not change calculation formulas.
- Use ReportLab-bundled Vera fonts to keep embedded typography portable to the Linux API container without adding production dependencies.
- Target roughly 10–11 pt body copy and 9–10 pt table cells, with smaller type reserved for compact captions.
- Preserve all necessary detail and provenance in a structured multi-page layout; use concise labels and explanations.
- Normal report volumes apply; multi-page generation and long activity tables/labels must continue to work.
- Sensitive assessment data remains limited to the authorized generated report; it must not be added to operational logs.
- The working tree already contains extensive uncommitted changes to `api/app/services/report.py`; integrate with the live contents and preserve them.

## Decision log

1. **Use an executive snapshot followed by structured detail pages.** Compared with merely polishing the current order, this puts decision-critical metrics first and improves the activity-detail page break. A chart-heavy dashboard was rejected because it adds complexity without improving these calculations.
2. **Use four executive KPIs and a compact scenario comparison.** Show verified annual hours and labor-effort cost, then base-scenario released hours and illustrative capacity value. List each scenario’s reduction assumption, released hours, and illustrative value.
3. **Keep financial claims strictly evidence-based.** Present capacity value as illustrative, never as realized savings. Omit ROI, net savings, profit, and payback when their required input data is unavailable; show annual eligible volume, average handling time per unit, and labor effort cost per unit instead.
4. **Replace the squeezed register with a readable table.** Give activity/status, monthly volume, minutes per unit, hourly rate, annual hours, and annual labor cost clear columns; place evidence references beneath activity labels.
5. **Convert recommendations to short action cards.** Separate suggested action from rationale/evidence and do not assign unsupported monetary impact.
6. **Embed ReportLab Vera fonts and increase hierarchy.** Bundle-provided fonts avoid machine-specific font availability, while larger body/table type and spacing directly address legibility.
7. **Preserve controls and data semantics.** Keep currency warnings, sandbox notice, provenance, API behavior, and confirmed-only authoritative totals.

## Proposed design

### Executive page

Lead with process name and concise assessment metadata, followed by a one-line finding, four large KPI cards, and a three-row scenario table. Keep the distinction between verified baseline cost and illustrative capacity value visible next to the scenario comparison. Prominently display mixed-currency or data-quality warnings. When a required metric is missing, display “Not available” rather than implying a measured zero.

### Detail pages

Follow with the activity/evidence register using readable typography, aligned numeric fields, units, wrapped source references, repeated table headers, and rows that do not split across pages. Distinguish confirmed, pending, rejected, and invalid activity states; only existing calculation-eligible confirmed activities contribute to authoritative totals. Present recommendations as concise action/rationale cards. End with compact assumptions, limitations, and provenance.

### Typography and flow

Use ReportLab-bundled Vera regular/bold/italic TrueType fonts and embed them in generated PDFs. Retain the current A4 format, running page header/footer, and page numbering. Target approximately 10–11 pt body text and 9–10 pt table text; use concise copy, stronger title/section contrast, comfortable table padding, and restrained color. Keep rows/cards together where practical while allowing long reports to span pages.

## Verification plan

- Add renderer tests first for scenario values and wording, confirmed cost totals, unavailable profitability metrics, and preservation of evidence/status labels.
- Cover mixed-currency warnings, sandbox notices, missing values, long activity tables, and long labels.
- Inspect generated PDF text/page structure and embedded font resources; visually inspect rendered pages if a local PDF rasterizer is available.
- Run the targeted report tests and the complete API suite from the repository root, because some existing fixture paths are repository-relative.

## Implementation and verification

- Implemented the executive snapshot, KPI cards, capacity scenarios, derived unit economics, and a readable activity/evidence register with concise action cards.
- Embedded ReportLab Vera fonts and added clear labels for activity status and unavailable unit-economics inputs. The report does not imply that illustrative capacity value is cash savings or profit.
- The unit-economics table derives annual eligible volume from confirmed monthly volumes × 12, average handling time from annual hours ÷ annual units, and labor effort cost per unit from annual labor cost ÷ annual units. Per-unit values are unavailable when volume is zero or absent; monetary unit cost is also suppressed when currencies cannot be combined.
- User-facing pages and generated reports show document names or a simple evidence-linked status instead of assessment IDs, source IDs, or file hashes. These identifiers remain available internally for linking and verification.
- Corrected singular wording for a baseline with exactly one eligible activity.
- Added renderer coverage for calculated unit economics, missing values, mixed currencies, sandbox notices, font embedding and sizes, activity statuses, evidence, and long reports.
- Visually inspected the generated two-page PDF in the browser at 58% zoom; the executive metrics, scenario table, activity register, and recommendations are separated into readable sections.
- Verification: renderer tests **9 passed**. The latest full API run had **78 passed, 1 failed**: an unrelated provider-backed extraction test expected five fixture activities but received zero. A previous full run with rules extraction passed all **78** tests before the additional zero-volume renderer test was added. The report-specific tests pass; the suite also reports the existing Starlette `TestClient` deprecation warning.

## KPI card alignment design

### Understanding

- Align the four executive KPI cards shown in the report screenshot.
- Keep all cards in a single row and give them a shared top and bottom edge.
- Preserve the current labels, values, colors, and calculations.
- Allow the row to grow with its tallest card so wrapped content is not clipped.
- Limit the change to PDF layout; do not change report data or API behavior.

### Assumptions

- The current ReportLab renderer remains the layout mechanism; no new dependencies are needed.
- The change has negligible performance impact and does not alter privacy or security behavior.
- Existing page flow and readability must remain intact.

### Decision log

1. **Use adaptive shared row height.** Let the tallest KPI card determine the row height and draw each card’s background, border, and teal accent across the full shared height. Keep card contents top-aligned. This preserves current content and avoids the clipping risk of a hard-coded height.
2. **Keep the four-card horizontal layout.** Stacking was rejected because the user explicitly requested one row.
3. **Test layout geometry and inspect the generated PDF.** Verify equal rendered card heights, then run report renderer tests and visually inspect alignment.

### Implementation and verification

- Moved the card backgrounds, borders, and accent lines to the shared four-card table row, with explicit spacer columns between cards. The tallest card sets the adaptive row height; all card content remains top-aligned.
- Added a PDF drawing-geometry regression test that checks all four rendered card backgrounds have equal heights. It failed before the layout change with heights of **102.4016 pt, 92.40157 pt, 102.4016 pt, and 102.4016 pt**.
- Verification after implementation: PDF renderer tests **10 passed**; frontend production build passed; `git diff --check` passed.
- Generated a fresh PDF preview. Browser screenshot capture was unavailable in this session, so visual confirmation is based on the PDF drawing geometry test rather than a new screenshot.
