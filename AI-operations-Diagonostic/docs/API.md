# API examples

Set the local token in PowerShell:

```powershell
$headers = @{ Authorization = 'Bearer local-demo-token-change-me' }
```

Create an assessment:

```powershell
$body = @{
  process_name = 'Invoice review'
  sector = 'Professional services'
  period = 'Last 30 days'
  unit = 'invoices'
  activity_inputs = @(@{
    label = 'Check invoice details'
    monthly_volume = 100
    minutes_per_unit = 6
    hourly_rate = 30
    currency = 'GBP'
    confirmed = $false
  })
} | ConvertTo-Json -Depth 8
$a = Invoke-RestMethod -Method Post -Uri http://localhost:8000/v1/assessments -Headers $headers -ContentType 'application/json' -Body $body
$a.id
```

Submit for calculation using the latest revision:

```powershell
$body = @{ expected_revision = $a.revision } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/v1/assessments/$($a.id)/submit" -Headers $headers -ContentType 'application/json' -Body $body
```

The API uses expected revisions for mutation requests. A stale revision returns HTTP 409; fetch the latest state before retrying. Review the generated OpenAPI document at `/openapi.json` for exact schemas.

## Proposed combined analysis contract (Step 3; not implemented)

The frontend's single **Analyse My Operations** action currently uses the existing per-file upload endpoint followed by the synchronous `/submit` endpoint. It does not call `/analyze`, and it does not claim that a background job exists.

Step 3 may replace those calls with this single synchronous endpoint:

```http
POST /v1/assessments/{assessment_id}/analyze
Content-Type: multipart/form-data
```

Send `expected_revision` as a multipart text field and each selected evidence file as a repeated `files` field. Stale revisions should return HTTP 409. Do not send fabricated page references, row references, or extracted facts from the browser.

Successful requests should return HTTP 200 only after processing has reached a terminal state:

```json
{
  "status": "completed",
  "files": [
    {
      "filename": "procedure.pdf",
      "status": "succeeded",
      "upload_id": "source-id",
      "extraction_status": "completed"
    },
    {
      "filename": "operations.csv",
      "status": "failed",
      "error": {
        "code": "extraction_failed",
        "message": "The CSV could not be processed."
      }
    }
  ],
  "assessment": {}
}
```

The terminal assessment status is `completed`, `partial_failure`, `failed`, or `blocked`. Every selected file must have an individual result (`succeeded`, `duplicate`, or `failed`) so clients can present partial outcomes and retry only what the server reports as retryable. The returned `assessment` is the authoritative current assessment, including its revision, uploads, extraction candidates, confirmed facts, calculations, and report readiness. Extracted candidates must remain unconfirmed.

Non-2xx responses should use the existing error envelope:

```json
{
  "detail": {
    "code": "validation_error",
    "message": "A human-readable explanation.",
    "correlation_id": "optional-request-reference"
  }
}
```

This contract is a proposal only. The endpoint, per-file duplicate semantics, and retryability guarantees do not exist until implemented and tested in Step 3. Metadata-only creation also requires Step 3 backend support; the current frontend sends `activity_inputs: []` without supplying sample facts.

Implemented Step 3 behaviors in the backend include:

- `POST /v1/assessments/{assessment_id}/analyze` accepts multipart `files` and returns a synchronously terminal result object.
- `Idempotency-Key` is supported as an optional request header for repeat-safe batch analysis.
- `GET /v1/assessments/{assessment_id}/sources/{source_id}` returns evidence metadata and page/row context for the owning assessment only.
- `approved_revision` is persisted and the report route blocks export unless `report_ready == true` and `approved_revision == current.revision`.

The local JSON store remains a single-process implementation and is not a distributed or multi-instance guarantee.
