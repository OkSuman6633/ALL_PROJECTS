from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
HEADERS = {"Authorization": "Bearer local-demo-token-change-me"}

def test_multi_activity_creation_preserves_distinct_activities():
    """
    Regression test proving that three entered activities remain three distinct activities
    after assessment creation, each with a stable unique activity_id and initial unconfirmed state.
    """
    payload = {
        "process_name": "Order fulfillment dispatch",
        "sector": "Retail",
        "period": "Monthly",
        "unit": "orders",
        "goals": "Streamline order verification pipeline",
        "activity_inputs": [
            {"label": "Order validation", "monthly_volume": 1200, "minutes_per_unit": 2.0, "hourly_rate": 30, "currency": "GBP", "confirmed": False},
            {"label": "Inventory check", "monthly_volume": 1200, "minutes_per_unit": 1.5, "hourly_rate": 30, "currency": "GBP", "confirmed": False},
            {"label": "Order confirmation", "monthly_volume": 1200, "minutes_per_unit": 2.5, "hourly_rate": 30, "currency": "GBP", "confirmed": False},
        ],
    }

    resp = client.post("/v1/assessments", json=payload, headers=HEADERS)
    assert resp.status_code == 201, resp.text
    assessment = resp.json()

    activities = assessment.get("activities", [])
    assert len(activities) == 3, f"Expected 3 activities, got {len(activities)}"

    labels = [a["label"] for a in activities]
    assert labels == ["Order validation", "Inventory check", "Order confirmation"]

    ids = [a["activity_id"] for a in activities]
    assert len(set(ids)) == 3, "Activity IDs must be unique"
    assert all(a["confirmed"] is False for a in activities), "Initial activities must start unconfirmed"

def test_acceptance_three_activities_calculation_and_report():
    """
    Acceptance test:
    Enter:
      - Order validation: 1,200 cases/mo, 2.0 min/case, £30/hr -> 480 hrs, £14,400
      - Inventory check: 1,200 cases/mo, 1.5 min/case, £30/hr -> 360 hrs, £10,800
      - Order confirmation: 1,200 cases/mo, 2.5 min/case, £30/hr -> 600 hrs, £18,000

    When all three are confirmed, expected annual hours = 480 + 360 + 600 = 1,440.00
    Expected annual effort value = £43,200.00 at £30/hr.
    """
    payload = {
        "process_name": "Order fulfillment dispatch",
        "sector": "Retail",
        "activity_inputs": [
            {"label": "Order validation", "monthly_volume": 1200, "minutes_per_unit": 2.0, "hourly_rate": 30, "currency": "GBP", "confirmed": False},
            {"label": "Inventory check", "monthly_volume": 1200, "minutes_per_unit": 1.5, "hourly_rate": 30, "currency": "GBP", "confirmed": False},
            {"label": "Order confirmation", "monthly_volume": 1200, "minutes_per_unit": 2.5, "hourly_rate": 30, "currency": "GBP", "confirmed": False},
        ],
    }

    created = client.post("/v1/assessments", json=payload, headers=HEADERS).json()
    aid = created["id"]
    activities = created["activities"]
    assert len(activities) == 3

    # Confirm all three activities via patch
    confirm_changes = [{"activity_id": a["activity_id"], "confirmed": True} for a in activities]
    patched = client.patch(
        f"/v1/assessments/{aid}/facts",
        json={"expected_revision": created["revision"], "changes": confirm_changes},
        headers=HEADERS,
    )
    assert patched.status_code == 200, patched.text
    patched_data = patched.json()
    assert all(a["confirmed"] is True for a in patched_data["activities"])

    # Submit for authoritative calculation
    submitted = client.post(
        f"/v1/assessments/{aid}/submit",
        json={"expected_revision": patched_data["revision"]},
        headers=HEADERS,
    )
    assert submitted.status_code == 202, submitted.text
    calc = submitted.json()["assessment"]["calculations"]

    # Verify exact acceptance math:
    # 480 + 360 + 600 = 1440.00 hours
    # 14,400 + 10,800 + 18,000 = £43,200.00
    assert calc["annual_hours"] == "1440.00"
    assert calc["annual_effort_cost"] == "43200.00"
    assert calc["confirmed_activity_count"] == 3
    assert calc["unconfirmed_activity_count"] == 0

    # Verify individual activity calculated metrics
    act_map = {a["label"]: a for a in calc["activities"]}
    assert act_map["Order validation"]["annual_hours"] == "480.00"
    assert act_map["Order validation"]["annual_effort_cost"] == "14400.00"
    assert act_map["Inventory check"]["annual_hours"] == "360.00"
    assert act_map["Inventory check"]["annual_effort_cost"] == "10800.00"
    assert act_map["Order confirmation"]["annual_hours"] == "600.00"
    assert act_map["Order confirmation"]["annual_effort_cost"] == "18000.00"

    # Approve report
    rev = submitted.json()["assessment"]["revision"]
    approved = client.post(
        f"/v1/assessments/{aid}/approve",
        json={"expected_revision": rev, "accepted_assumptions": {"verified": True}},
        headers=HEADERS,
    )
    assert approved.status_code == 202, approved.text

    # Download PDF and verify
    pdf_resp = client.get(f"/v1/assessments/{aid}/report", headers=HEADERS)
    assert pdf_resp.status_code == 200
    assert pdf_resp.content.startswith(b"%PDF")
    assert len(pdf_resp.content) > 1000

def test_multi_activity_editing_and_removing_single_row():
    """Verify that editing or deleting one row does not modify other rows."""
    payload = {
        "process_name": "Multi step operations",
        "activity_inputs": [
            {"label": "Step 1", "monthly_volume": 100, "minutes_per_unit": 5.0, "hourly_rate": 20},
            {"label": "Step 2", "monthly_volume": 200, "minutes_per_unit": 10.0, "hourly_rate": 25},
            {"label": "Step 3", "monthly_volume": 300, "minutes_per_unit": 15.0, "hourly_rate": 30},
        ],
    }
    created = client.post("/v1/assessments", json=payload, headers=HEADERS).json()
    aid = created["id"]
    acts = created["activities"]
    id1, id2, id3 = acts[0]["activity_id"], acts[1]["activity_id"], acts[2]["activity_id"]

    # 1. Edit only Step 2
    patch_resp = client.patch(
        f"/v1/assessments/{aid}/facts",
        json={
            "expected_revision": created["revision"],
            "changes": [{"activity_id": id2, "label": "Step 2 Modified", "hourly_rate": 35}],
        },
        headers=HEADERS,
    )
    assert patch_resp.status_code == 200
    updated_acts = {a["activity_id"]: a for a in patch_resp.json()["activities"]}

    # Verify Step 1 is unchanged
    assert updated_acts[id1]["label"] == "Step 1"
    assert updated_acts[id1]["hourly_rate"] == 20
    # Verify Step 2 is modified
    assert updated_acts[id2]["label"] == "Step 2 Modified"
    assert updated_acts[id2]["hourly_rate"] == 35
    # Verify Step 3 is unchanged
    assert updated_acts[id3]["label"] == "Step 3"
    assert updated_acts[id3]["hourly_rate"] == 30

    # 2. Remove only Step 3
    rev2 = patch_resp.json()["revision"]
    del_resp = client.patch(
        f"/v1/assessments/{aid}/facts",
        json={"expected_revision": rev2, "remove_activity_ids": [id3]},
        headers=HEADERS,
    )
    assert del_resp.status_code == 200
    remaining_acts = del_resp.json()["activities"]
    assert len(remaining_acts) == 2
    rem_ids = [a["activity_id"] for a in remaining_acts]
    assert id1 in rem_ids
    assert id2 in rem_ids
    assert id3 not in rem_ids

def test_multi_activity_validation_rejections():
    """Verify independent validation rejects invalid inputs and empty activity names."""
    # 1. Empty label
    resp1 = client.post(
        "/v1/assessments",
        json={
            "process_name": "Test proc",
            "activity_inputs": [{"label": "   ", "monthly_volume": 100, "minutes_per_unit": 5, "hourly_rate": 20}],
        },
        headers=HEADERS,
    )
    assert resp1.status_code == 422

    # 2. Negative volume
    resp2 = client.post(
        "/v1/assessments",
        json={
            "process_name": "Test proc",
            "activity_inputs": [{"label": "Valid label", "monthly_volume": -50, "minutes_per_unit": 5, "hourly_rate": 20}],
        },
        headers=HEADERS,
    )
    assert resp2.status_code == 422

    # 3. Negative rate
    resp3 = client.post(
        "/v1/assessments",
        json={
            "process_name": "Test proc",
            "activity_inputs": [{"label": "Valid label", "monthly_volume": 50, "minutes_per_unit": 5, "hourly_rate": -10}],
        },
        headers=HEADERS,
    )
    assert resp3.status_code == 422

    # 4. Empty activity_inputs list is allowed for metadata-only drafts
    resp4 = client.post(
        "/v1/assessments",
        json={"process_name": "Test proc", "activity_inputs": []},
        headers=HEADERS,
    )
    assert resp4.status_code == 201
    assert resp4.json()["activities"] == []

    # 5. Omitted activity_inputs uses the same metadata-only default
    resp5 = client.post(
        "/v1/assessments",
        json={"process_name": "Test proc"},
        headers=HEADERS,
    )
    assert resp5.status_code == 201
    assert resp5.json()["activities"] == []

def test_backward_compatibility_single_activity_and_legacy_fields():
    """Verify backward compatibility with single activity input and legacy singular keys."""
    # Single activity in list
    resp1 = client.post(
        "/v1/assessments",
        json={
            "process_name": "Single activity process",
            "activity_inputs": [{"label": "Legacy single step", "monthly_volume": 50, "minutes_per_unit": 10, "hourly_rate": 25}],
        },
        headers=HEADERS,
    )
    assert resp1.status_code == 201
    assert len(resp1.json()["activities"]) == 1

    # Legacy singular 'activity_input'
    resp2 = client.post(
        "/v1/assessments",
        json={
            "process_name": "Legacy singular format",
            "activity_input": {"label": "Singular step", "monthly_volume": 80, "minutes_per_unit": 4, "hourly_rate": 30},
        },
        headers=HEADERS,
    )
    assert resp2.status_code == 201
    assert len(resp2.json()["activities"]) == 1
    assert resp2.json()["activities"][0]["label"] == "Singular step"
