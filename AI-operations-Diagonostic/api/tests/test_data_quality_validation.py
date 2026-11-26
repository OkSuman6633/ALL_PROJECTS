import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.domain.validation import validate_activity
from app.domain.calculations import calculate_activity, calculate_assessment
from _documents import (
    INVALID_METRICS_CSV_ROWS,
    SOP_FIVE_STEPS,
    SOP_ORDER_PROCESS_STEPS,
    build_activity_csv,
    build_sop_pdf,
)

client = TestClient(app)
HEADERS = {
    "Authorization": "Bearer local-demo-token-change-me",
    "X-Tenant-Id": "test-data-quality",
    "X-User-Id": "test-user",
}

def test_criterion_1_valid_record_confirmed_included_in_totals():
    """Criterion 1: Valid record confirmed is calculation-eligible and included in totals."""
    act = {
        "label": "Valid order processing",
        "monthly_volume": 500,
        "minutes_per_unit": 6,
        "hourly_rate": 30,
        "currency": "GBP",
        "confirmed": True,
    }
    val = validate_activity(act)
    assert val["is_valid"] is True
    assert val["is_calculation_eligible"] is True
    assert len(val["errors"]) == 0

    calc = calculate_assessment([act], assessment_currency="GBP")
    assert calc["confirmed_activity_count"] == 1
    assert calc["calculation_eligible_activity_count"] == 1
    assert calc["invalid_activity_count"] == 0
    assert calc["annual_hours"] == "600.00"  # 500 * 6 * 12 / 60
    assert calc["annual_effort_cost"] == "18000.00"

def test_criterion_2_blank_activity_name_rejected_from_calculation_eligibility():
    """Criterion 2: Blank or whitespace activity name cannot become calculation-eligible."""
    act = {
        "label": "   ",
        "monthly_volume": 100,
        "minutes_per_unit": 5,
        "hourly_rate": 25,
        "confirmed": True,
    }
    val = validate_activity(act)
    assert val["is_valid"] is False
    assert val["is_calculation_eligible"] is False
    assert any("blank" in err.lower() or "name is required" in err.lower() for err in val["errors"])

    calc = calculate_assessment([act], assessment_currency="GBP")
    assert calc["confirmed_activity_count"] == 1
    assert calc["calculation_eligible_activity_count"] == 0
    assert calc["invalid_activity_count"] == 1
    assert calc["annual_hours"] == "0.00"
    assert calc["annual_effort_cost"] == "0.00"

def test_criterion_3_negative_monthly_volume_rejected():
    """Criterion 3: Negative monthly case volumes are rejected from calculation eligibility."""
    act = {
        "label": "Negative volume task",
        "monthly_volume": -50,
        "minutes_per_unit": 4,
        "hourly_rate": 20,
        "confirmed": True,
    }
    val = validate_activity(act)
    assert val["is_valid"] is False
    assert val["is_calculation_eligible"] is False
    assert any("negative" in err.lower() and "volume" in err.lower() for err in val["errors"])

    calc = calculate_assessment([act], assessment_currency="GBP")
    assert calc["calculation_eligible_activity_count"] == 0
    assert calc["invalid_activity_count"] == 1
    assert calc["annual_hours"] == "0.00"

def test_criterion_4_zero_handling_time_requires_review_warning():
    """Criterion 4: Zero handling time is treated as a review-required warning condition."""
    act = {
        "label": "Automated zero-touch step",
        "monthly_volume": 200,
        "minutes_per_unit": 0,
        "hourly_rate": 25,
        "confirmed": True,
    }
    val = validate_activity(act)
    assert val["is_valid"] is True
    assert val["is_calculation_eligible"] is True
    assert any("zero handling time" in w.lower() for w in val["warnings"])

def test_criterion_5_missing_hourly_rate_remains_null_not_zero():
    """Criterion 5: Missing hourly rate remains null, not silently converted to zero."""
    act = {
        "label": "Step without hourly rate",
        "monthly_volume": 100,
        "minutes_per_unit": 2,
        "hourly_rate": None,
        "confirmed": True,
    }
    val = validate_activity(act)
    assert val["is_valid"] is False
    assert val["is_calculation_eligible"] is False
    assert any("hourly rate is missing (null)" in err.lower() for err in val["errors"])

    calc = calculate_assessment([act], assessment_currency="GBP")
    act_row = calc["activities"][0]
    assert act_row["hourly_rate"] is None
    assert calc["calculation_eligible_activity_count"] == 0

def test_criterion_6_explicit_zero_rate_distinguishable_from_null():
    """Criterion 6: Explicit zero rate remains distinguishable from missing null."""
    act_zero = {
        "label": "Step with free volunteer rate",
        "monthly_volume": 100,
        "minutes_per_unit": 2,
        "hourly_rate": 0.0,
        "confirmed": True,
    }
    val_zero = validate_activity(act_zero)
    assert val_zero["is_valid"] is True

    calc_zero = calculate_assessment([act_zero], assessment_currency="GBP")
    assert calc_zero["activities"][0]["hourly_rate"] == "0.00"

    act_none = {
        "label": "Step with unstated rate",
        "monthly_volume": 100,
        "minutes_per_unit": 2,
        "hourly_rate": None,
        "confirmed": False,
    }
    calc_none = calculate_assessment([act_none], assessment_currency="GBP")
    assert calc_none["activities"][0]["hourly_rate"] is None
    assert calc_zero["activities"][0]["hourly_rate"] != calc_none["activities"][0]["hourly_rate"]

def test_criterion_7_rework_rate_outside_range_rejected():
    """Criterion 7: Rework rate outside [0.0, 1.0] is rejected from calculation eligibility."""
    act_bad = {
        "label": "Step with 125% rework",
        "monthly_volume": 100,
        "minutes_per_unit": 2,
        "hourly_rate": 25,
        "rework_rate": 1.25,
        "confirmed": True,
    }
    val = validate_activity(act_bad)
    assert val["is_valid"] is False
    assert val["is_calculation_eligible"] is False
    assert any("rework rate must be between 0.0 and 1.0" in err.lower() for err in val["errors"])

    act_good = {
        "label": "Step with 15% rework",
        "monthly_volume": 100,
        "minutes_per_unit": 2,
        "hourly_rate": 25,
        "rework_rate": 0.15,
        "confirmed": True,
    }
    val_good = validate_activity(act_good)
    assert val_good["is_valid"] is True

def test_criterion_8_and_9_currency_mismatch_and_approval_gate():
    """Criteria 8 & 9: Evidence source currency USD vs GBP assessment are preserved and block approval."""
    created = client.post(
        "/v1/assessments",
        json={
            "process_name": "Currency Mismatch Gate Test",
            "currency": "GBP",
            "activity_inputs": [
                {"label": "Valid row USD", "monthly_volume": 100, "minutes_per_unit": 2, "hourly_rate": 25, "currency": "USD", "confirmed": True}
            ],
        },
        headers=HEADERS,
    ).json()
    aid = created["id"]
    rev = created["revision"]

    sub = client.post(f"/v1/assessments/{aid}/submit", json={"expected_revision": rev}, headers=HEADERS).json()
    assert sub["assessment"]["calculations"]["currency_mismatch"] is True
    assert sub["assessment"]["calculations"]["currency"] == "USD"
    assert sub["assessment"]["calculations"]["assessment_currency"] == "GBP"

    rev = sub["assessment"]["revision"]
    # Approval must be blocked with CURRENCY_MISMATCH_UNRESOLVED
    app_fail = client.post(f"/v1/assessments/{aid}/approve", json={"expected_revision": rev}, headers=HEADERS)
    assert app_fail.status_code == 422
    assert app_fail.json()["detail"]["code"] == "CURRENCY_MISMATCH_UNRESOLVED"

def test_criterion_10_invalid_confirmed_records_excluded_from_authoritative_calculations():
    """Criterion 10: Invalid confirmed records cannot enter authoritative calculations."""
    activities = [
        {"activity_id": "1", "label": "Valid act", "monthly_volume": 100, "minutes_per_unit": 6, "hourly_rate": 20, "confirmed": True},
        {"activity_id": "2", "label": "Negative vol", "monthly_volume": -10, "minutes_per_unit": 6, "hourly_rate": 20, "confirmed": True},
        {"activity_id": "3", "label": "Missing rate", "monthly_volume": 100, "minutes_per_unit": 6, "hourly_rate": None, "confirmed": True},
    ]
    calc = calculate_assessment(activities, assessment_currency="GBP")
    assert calc["confirmed_activity_count"] == 3
    assert calc["calculation_eligible_activity_count"] == 1
    assert calc["invalid_activity_count"] == 2
    # Only Valid act (100 * 6 * 12 / 60 = 120 hrs, 120 * 20 = 2400)
    assert calc["annual_hours"] == "120.00"
    assert calc["annual_effort_cost"] == "2400.00"

def test_criterion_11_pdf_candidate_identities_and_source_references_preserved():
    """Criterion 11: PDF candidate identities (all 5 steps) and individual source references preserved."""
    pdf_bytes = build_sop_pdf(SOP_FIVE_STEPS)

    created = client.post(
        "/v1/assessments",
        json={"process_name": "PDF Step Identity Test", "currency": "GBP", "activity_inputs": [{"label": "Baseline", "monthly_volume": 10, "minutes_per_unit": 5, "hourly_rate": 20}]},
        headers=HEADERS,
    ).json()
    aid = created["id"]

    res = client.post(
        f"/v1/assessments/{aid}/uploads",
        files={"file": ("data_quality_test_sop.pdf", pdf_bytes, "application/pdf")},
        headers=HEADERS,
    )
    assert res.status_code == 201
    assessment = res.json()["assessment"]
    source_id = res.json()["upload"]["id"]

    pdf_acts = [a for a in assessment["activities"] if any(s.startswith(f"{source_id}:") for s in a.get("source_ids", []))]
    assert len(pdf_acts) == 5, f"Expected 5 distinct PDF steps, got {len(pdf_acts)}"

    # Verify each has its own distinct step source reference
    step_refs = [a["source_ids"][0] for a in pdf_acts]
    assert len(set(step_refs)) == 5
    for expected_step in ("step-1", "step-2", "step-3", "step-4", "step-5"):
        assert any(expected_step in ref for ref in step_refs), f"missing {expected_step} in {step_refs}"

def test_criterion_12_pdf_descriptions_do_not_receive_invented_metrics():
    """Criterion 12: PDF process descriptions do not receive invented quantitative metrics (represented as None)."""
    pdf_bytes = build_sop_pdf(SOP_ORDER_PROCESS_STEPS)
    created = client.post(
        "/v1/assessments",
        json={"process_name": "PDF Metrics Null Test", "currency": "GBP", "activity_inputs": [{"label": "Baseline", "monthly_volume": 10, "minutes_per_unit": 5, "hourly_rate": 20}]},
        headers=HEADERS,
    ).json()
    aid = created["id"]
    res = client.post(
        f"/v1/assessments/{aid}/uploads",
        files={"file": ("simple_order_processing_sop.pdf", pdf_bytes, "application/pdf")},
        headers=HEADERS,
    )
    assessment = res.json()["assessment"]
    source_id = res.json()["upload"]["id"]
    pdf_acts = [a for a in assessment["activities"] if any(s.startswith(f"{source_id}:") for s in a.get("source_ids", []))]
    assert len(pdf_acts) == 3
    for act in pdf_acts:
        assert act["monthly_volume"] is None
        assert act["minutes_per_unit"] is None
        assert act["hourly_rate"] is None

def test_criterion_13_and_14_approval_blocked_on_invalid_and_succeeds_when_resolved():
    """Criteria 13 & 14: Approval blocked by 422 DATA_VALIDATION_ERRORS when invalid facts exist, and succeeds when corrected."""
    created = client.post(
        "/v1/assessments",
        json={
            "process_name": "Full Approval Workflow Test",
            "currency": "GBP",
            "activity_inputs": [
                {"label": "Valid initial task", "monthly_volume": 100, "minutes_per_unit": 2, "hourly_rate": 25, "currency": "GBP", "confirmed": True}
            ],
        },
        headers=HEADERS,
    ).json()
    aid = created["id"]
    rev = created["revision"]

    # Upload intentionally invalid CSV
    csv_bytes = build_activity_csv(INVALID_METRICS_CSV_ROWS)
    up_res = client.post(
        f"/v1/assessments/{aid}/uploads",
        files={"file": ("intentionally_invalid_metrics.csv", csv_bytes, "text/csv")},
        headers=HEADERS,
    )
    assessment = up_res.json()["assessment"]
    rev = assessment["revision"]

    acts = assessment["activities"]
    invalid_vol_act = next(a for a in acts if a.get("monthly_volume") == -10.0)

    # Keep only invalid_vol_act and confirm it so unconfirmed_activity_count == 0, but invalid_activity_count == 1
    other_act_ids = [a["activity_id"] for a in acts if a["activity_id"] != invalid_vol_act["activity_id"]]
    patch_res = client.patch(
        f"/v1/assessments/{aid}/facts",
        json={
            "expected_revision": rev,
            "remove_activity_ids": other_act_ids,
            "changes": [{"activity_id": invalid_vol_act["activity_id"], "confirmed": True}],
        },
        headers=HEADERS,
    )
    rev = patch_res.json()["revision"]

    # Run submit analysis
    sub_res = client.post(f"/v1/assessments/{aid}/submit", json={"expected_revision": rev}, headers=HEADERS)
    rev = sub_res.json()["assessment"]["revision"]

    # Try to approve report -> must be blocked with DATA_VALIDATION_ERRORS
    app_fail = client.post(f"/v1/assessments/{aid}/approve", json={"expected_revision": rev, "accepted_assumptions": {"currency_mismatch_acknowledged": True}}, headers=HEADERS)
    assert app_fail.status_code == 422
    assert app_fail.json()["detail"]["code"] == "DATA_VALIDATION_ERRORS"

    # Now correct the invalid activity: update negative volume to valid positive volume
    patch_res2 = client.patch(
        f"/v1/assessments/{aid}/facts",
        json={
            "expected_revision": rev,
            "currency": "USD",  # Align assessment currency with USD
            "changes": [
                {
                    "activity_id": invalid_vol_act["activity_id"],
                    "label": "Corrected positive volume task",
                    "monthly_volume": 100.0,
                    "confirmed": True,
                }
            ],
        },
        headers=HEADERS,
    )
    rev = patch_res2.json()["revision"]

    # Re-submit analysis
    sub_res2 = client.post(f"/v1/assessments/{aid}/submit", json={"expected_revision": rev}, headers=HEADERS)
    assert sub_res2.status_code == 202
    assert sub_res2.json()["assessment"]["status"] == "COMPLETE"
    assert sub_res2.json()["assessment"]["calculations"]["invalid_activity_count"] == 0
    assert sub_res2.json()["assessment"]["calculations"]["unconfirmed_activity_count"] == 0
    assert sub_res2.json()["assessment"]["calculations"]["currency_mismatch"] is False
    rev = sub_res2.json()["assessment"]["revision"]

    # Approval should now succeed cleanly with 202
    app_ok = client.post(f"/v1/assessments/{aid}/approve", json={"expected_revision": rev}, headers=HEADERS)
    assert app_ok.status_code == 202
    assert app_ok.json()["status"] == "COMPLETE"
    assert "/report" in app_ok.json()["report_url"]
