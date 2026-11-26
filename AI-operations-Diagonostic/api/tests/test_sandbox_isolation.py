import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
HEADERS = {"Authorization": "Bearer local-demo-token-change-me"}

def test_sandbox_record_identification_and_query_isolation():
    """Verify sandbox records are flagged and strictly excluded from default production queries."""
    # 1. Create a production assessment
    prod_payload = {
        "process_name": "Production Operational Audit",
        "sector": "Retail",
        "currency": "GBP",
        "is_sandbox": False,
        "activity_inputs": [
            {"label": "Production Step A", "monthly_volume": 500, "minutes_per_unit": 10, "hourly_rate": 30, "confirmed": True}
        ],
    }
    prod_res = client.post("/v1/assessments", json=prod_payload, headers=HEADERS)
    assert prod_res.status_code == 201
    prod_item = prod_res.json()
    prod_id = prod_item["id"]
    assert prod_item.get("is_sandbox") is False

    # 2. Create a sandbox test assessment
    sandbox_payload = {
        "process_name": "Sandbox Test Order Flow",
        "sector": "Logistics",
        "currency": "USD",
        "is_sandbox": True,
        "activity_inputs": [
            {"label": "Sandbox Step 1", "monthly_volume": 100, "minutes_per_unit": 5, "hourly_rate": 25, "currency": "USD", "confirmed": True}
        ],
    }
    sandbox_res = client.post("/v1/assessments", json=sandbox_payload, headers=HEADERS)
    assert sandbox_res.status_code == 201
    sandbox_item = sandbox_res.json()
    sandbox_id = sandbox_item["id"]
    assert sandbox_item.get("is_sandbox") is True
    assert sandbox_id != prod_id

    # 3. Query production assessments: MUST NOT contain sandbox record
    prod_list = client.get("/v1/assessments", headers=HEADERS).json()["items"]
    prod_ids = [a["id"] for a in prod_list]
    assert prod_id in prod_ids, "Production assessment must be in production list"
    assert sandbox_id not in prod_ids, "Sandbox assessment must NEVER appear in production list"

    # 4. Query sandbox assessments: MUST contain sandbox record and NOT production record
    sandbox_list = client.get("/v1/assessments?is_sandbox=true", headers=HEADERS).json()["items"]
    s_ids = [a["id"] for a in sandbox_list]
    assert sandbox_id in s_ids, "Sandbox assessment must be in sandbox list"
    assert prod_id not in s_ids, "Production assessment must not appear in sandbox list"

    # 5. Verify sandbox workflow: submit and approve
    sub = client.post(f"/v1/assessments/{sandbox_id}/submit", json={"expected_revision": 1}, headers=HEADERS)
    assert sub.status_code == 202
    sub_data = sub.json()["assessment"]

    appr = client.post(
        f"/v1/assessments/{sandbox_id}/approve",
        json={"expected_revision": sub_data["revision"], "accepted_assumptions": {}},
        headers=HEADERS,
    )
    assert appr.status_code == 202
    updated_sandbox = client.get(f"/v1/assessments/{sandbox_id}", headers=HEADERS).json()
    assert updated_sandbox.get("approved_as_sandbox") is True

    # 6. Verify sandbox report export header
    pdf_res = client.get(f"/v1/assessments/{sandbox_id}/report", headers=HEADERS)
    assert pdf_res.status_code == 200
    assert pdf_res.headers.get("x-sandbox-environment") == "true"
    assert "sandbox-diagnostic" in pdf_res.headers.get("content-disposition", "")
    assert pdf_res.content.startswith(b"%PDF")

    # 7. Test Sandbox Reset: Deletes ONLY sandbox records, production records remain untouched
    reset_res = client.post("/v1/sandbox/reset", headers=HEADERS)
    assert reset_res.status_code == 200
    assert reset_res.json()["deleted_count"] >= 1

    # Verify sandbox assessment is gone
    get_sandbox = client.get(f"/v1/assessments/{sandbox_id}", headers=HEADERS)
    assert get_sandbox.status_code == 404

    # Verify production assessment is STILL present and untouched
    get_prod = client.get(f"/v1/assessments/{prod_id}", headers=HEADERS)
    assert get_prod.status_code == 200
    assert get_prod.json()["id"] == prod_id
