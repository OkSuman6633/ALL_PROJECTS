# Release checklist (do not bypass)

## Before dev deployment
- [ ] Review Terraform plan in a dedicated non-production GCP project.
- [ ] Configure Terraform state backend and restricted state IAM.
- [ ] Add dedicated service accounts and least-privilege IAM; no service-account key files.
- [ ] Wire GCS state/source/report adapters and GCS generation precondition tests.
- [ ] Wire Cloud Tasks queue, authenticated worker, idempotency and retry/dead-letter runbooks.
- [ ] Wire BigQuery append-only events and retention policy.
- [ ] Configure Secret Manager, model spend guardrails and alert destinations.
- [ ] Replace demo authentication before any non-synthetic data.

## Before staging UAT
- [ ] API tests and frontend lint/build pass in CI.
- [ ] End-to-end create/upload/review/analyze/approve/PDF path passes.
- [ ] 40 labelled synthetic docs evaluated; report extraction-quality metrics.
- [ ] Prompt injection, malformed PDF, CSV formula, oversize upload and retry tests pass.
- [ ] Cross-tenant negative suite passes with real identity claims.
- [ ] Accessibility and browser compatibility checks complete.
- [ ] No secrets in repo, images, logs or frontend bundle except explicitly local demo token.

## Before production
- [ ] Security review and threat model signed off.
- [ ] Data processing terms, residency, retention and erasure approved.
- [ ] Budgets, usage guardrails, monitoring, paging and incident contacts tested.
- [ ] 20 concurrent sessions / 20 queued jobs staging load test measured.
- [ ] Rollback and safe task reprocessing rehearsed.
- [ ] Immutable image digest, SBOM and scan reports recorded.
- [ ] Product sponsor, security reviewer and DevOps owner explicitly approve release.
