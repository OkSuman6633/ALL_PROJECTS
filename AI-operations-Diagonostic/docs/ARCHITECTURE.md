# Architecture decision record

## Decisions

- **Bounded workflow over open-ended agent autonomy:** extraction can propose candidate facts, but confirmed inputs alone feed deterministic calculations. This reduces fabricated financial claims.
- **Human confirmation before publication:** all uploaded/model-derived facts are untrusted until reviewed; report approval is a separate endpoint.
- **Decimal arithmetic:** financial/effort values use Python `Decimal` and explicit two-decimal presentation.
- **Local JSON adapter for local demo:** no SQL database is introduced, matching the specification's GCS-first production direction. The adapter uses atomic file replacement and an in-process lock only; it is not suitable for distributed deployment.
- **Gemini optional:** local manual-review fallback is available without a key. If enabled, model output is untrusted and must be confirmed.
- **Cloud resources are staged separately:** initial Terraform provisions selected GCP resources but is not wired into the API. No cloud deployment is claimed.

## Trust boundaries

1. Uploaded documents and CSV/PDF content are untrusted data, never instructions.
2. LLM extraction output is untrusted candidate data.
3. Reviewer-confirmed activity facts are the only input to aggregate calculations.
4. Report approval is an explicit human action; generated output states limitations.
5. The demo bearer token is a local convenience only and does not authenticate individual people or tenants.

## Production design still required

- OIDC/JWT auth and role/tenant membership checks.
- GCS generation-based state compare-and-swap and private source/report object access.
- Cloud Tasks dispatch, authenticated worker and idempotency persistence.
- BigQuery append-only event/usage/quality writers and retention controls.
- Cloud Run deployment, IAM, Secret Manager, observability, cost guardrails and approved CI/CD.
