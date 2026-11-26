# UAT starter cases

| ID | Scenario | Expected result |
|---|---|---|
| UAT-01 | Confirmed 100 cases/month × 6 min | 120 annual handling hours |
| UAT-02 | Unconfirmed activity with large values | Excluded from authoritative totals |
| UAT-03 | Negative volume or minutes | API validation rejects input |
| UAT-04 | Reduction outside 0–100% | Validation rejects input |
| UAT-05 | Stale revision in PATCH | HTTP 409; no update |
| UAT-06 | Report requested before approval | HTTP 409 |
| UAT-07 | Approval while any activity unconfirmed | HTTP 422 |
| UAT-08 | Unsupported file extension | HTTP 422 |
| UAT-09 | File above configured byte limit | HTTP 413 |
| UAT-10 | Prompt injection embedded in evidence | Treated as untrusted data; never changes system instructions |
| UAT-11 | Duplicate background job delivery | One terminal transition/report/charge (requires future Cloud Tasks integration) |
| UAT-12 | Cross-tenant access attempt | HTTP 403/404 with production identity integration (not yet implemented) |

The current automated suite covers a subset of these cases. UAT-10, UAT-11 and UAT-12 require additional security and cloud-integration tests before staging sign-off.
