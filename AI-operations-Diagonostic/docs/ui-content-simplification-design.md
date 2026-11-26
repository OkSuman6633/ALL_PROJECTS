# User-Facing UI Content Simplification

## Understanding

- Simplify all user-facing pages, not only the assessment workspace.
- Reduce visual clutter and improve readability by removing repeated explanations, unnecessary subtitles, and technical jargon.
- Keep essential actions, results, metrics, current status, and important safety or validation warnings visible.
- Keep useful secondary details available in compact expandable sections instead of deleting the underlying information.
- Keep backend behavior, APIs, calculations, navigation, and stored data unchanged.
- Keep internal identifiers and file hashes out of normal user-facing views.

## Assumptions and non-functional requirements

- **Performance:** Prefer concise copy, existing components, and native disclosure controls; add no dependencies or noticeable load.
- **Scale:** Apply consistently to the existing pages and their normal assessment and report volumes.
- **Privacy:** Do not expose additional backend identifiers or sensitive data; treat this as presentation-only work.
- **Reliability:** Existing navigation, workflow actions, warnings, and accessibility behavior continue to work.
- **Maintenance:** Use plain language and existing design patterns so the cleanup is easy to review and maintain.

## Design

### Content hierarchy

- Keep one clear page title and only the shortest useful context line.
- Remove copy that repeats information already conveyed by a heading, field label, banner, or status.
- On the assessment workspace, keep a concise sandbox notice and file-type hint; remove redundant explanations such as processing order or repeated reminders about already-uploaded files.
- Keep file results and errors when they are relevant.
- Apply this rule to assessment, evidence, report, history, dashboard, recommendations, settings, and other user-facing pages.

### Secondary details

- Keep the primary workflow, current status, key results, and next action visible.
- Put supporting material—such as long activity explanations, audit details, or evidence provenance—in expandable sections using existing disclosure patterns where suitable.
- Do not collapse errors, warnings that block approval, required inputs, or results the user needs to act on.

### Scope and safeguards

- Audit every user-facing route and shared component, then make targeted copy and visibility changes.
- Do not change data, API calls, calculations, stored content, or navigation behavior.
- Preserve file formats, sandbox and financial caveats, blocking warnings, validation errors, and actionable results.
- Main risk: removing an instruction users need. Mitigation: keep action-specific instructions, errors, and safety caveats visible; collapse only supporting information.

### Verification

- Run existing frontend tests and lint/build checks.
- Review visible copy across routes to confirm the content is concise and no internal IDs or hashes are displayed.
- Inspect representative screens to ensure key actions, results, warnings, and errors remain visible.

## Implementation and verification

- Shortened repeated page introductions, stage explanations, technical processing details, and empty-state copy across assessment workflows, overview, assessments, recommendations, reports, history, sandbox, and settings.
- Preserved primary actions, required inputs, status and result values, processing/validation errors, currency and approval blockers, financial caveats, sandbox isolation/reset safeguards, and workspace security/governance guidance.
- Kept supporting evidence and confirmed-fact detail available in native disclosure sections.
- Kept report downloads identifiable by using a sanitized process name in the filename rather than a backend assessment ID.
- No API, calculation, navigation, persistence, or data-model changes were made.
- Verification: frontend Node tests **24 passed**; `npm run lint` passed; `npm run build` passed; `git diff --check` passed.
- Route coverage was reviewed through source and regression tests. No live browser-based visual inspection was completed.

## Decision log

1. **Simplify all user-facing pages.** The screenshot identifies the issue, but the request explicitly covers the whole site; limiting changes to the assessment page would leave the broader problem unresolved.
2. **Choose content and hierarchy cleanup over broad visual redesign.** This directly removes redundant information with lower implementation scope and regression risk. Existing layouts and controls remain.
3. **Collapse supporting detail instead of deleting it.** This preserves access to evidence context and audit information while reducing default-page density.
4. **Preserve decision-critical information.** Required inputs, actions, results, blocking warnings, validation errors, and safety caveats remain visible.
5. **Keep the work presentation-only.** Backend behavior, APIs, calculations, stored data, and navigation are explicit non-goals.
