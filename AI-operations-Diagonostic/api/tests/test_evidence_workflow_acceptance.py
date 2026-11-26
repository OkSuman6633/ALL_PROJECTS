from __future__ import annotations
import io
import json
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.extraction import extract_file
from app.services.providers import RulesExtractionProvider, GeminiExtractionProvider
from app.domain.calculations import calculate_assessment
from app.domain.recommendations import build_recommendations
from app.services.report import render_report
from _documents import SOP_ORDER_PROCESS_STEPS, build_sop_pdf

client = TestClient(app)
HEADERS = {"Authorization": "Bearer local-demo-token-change-me"}

SAMPLE_3_ROW_CSV = b"""activity,monthly_volume,avg_minutes_per_item,loaded_hourly_cost_usd,currency,rework_rate,error_rate
Order validation,1200,2.0,30,USD,0.03,0.01
Inventory check,1200,1.5,30,USD,0.02,0.005
Order confirmation,1200,2.5,30,USD,0.01,0.004
"""

SAMPLE_SOP_TEXT_PAGE = """Standard Operating Procedure: Order Processing
Purpose: Process standard customer orders accurately and on time.
Scope: The activity volumes below represent distinct work, not duplicate counts.
Measurement period: A typical month. Fictional test data.
Cost currency: USD for all activities.
Process steps / review notes
1
Receive and validate order details.
2
Check inventory availability.
3
Prepare order confirmation.
4
Exception counts are reported separately and must not automatically be added to standard-order volume.
"""

def test_csv_extraction_all_three_rows_and_provenance():
    parsed_file = extract_file("metrics.csv", "text/csv", SAMPLE_3_ROW_CSV)
    assert parsed_file["kind"] == "csv"
    assert parsed_file["row_count"] == 3
    assert len(parsed_file["rows"]) == 3

    provider = RulesExtractionProvider()
    result = provider.extract(parsed_file)
    assert result["status"] == "review_required"
    activities = result["activities"]
    assert len(activities) == 3

    labels = [a["label"] for a in activities]
    assert labels == ["Order validation", "Inventory check", "Order confirmation"]

    assert activities[0]["monthly_volume"] == 1200.0
    assert activities[0]["minutes_per_unit"] == 2.0
    assert activities[0]["hourly_rate"] == 30.0
    assert activities[0]["currency"] == "USD"
    assert activities[0]["source_ids"] == [f"{parsed_file['source_id']}:row-2"]
    assert activities[0]["provenance"]["row_number"] == 2
    assert activities[0]["provenance"]["filename"] == "metrics.csv"

    assert activities[1]["minutes_per_unit"] == 1.5
    assert activities[1]["source_ids"] == [f"{parsed_file['source_id']}:row-3"]

    assert activities[2]["minutes_per_unit"] == 2.5
    assert activities[2]["source_ids"] == [f"{parsed_file['source_id']}:row-4"]

def test_pdf_extraction_multiline_steps_and_metadata():
    doc = {
        "kind": "pdf",
        "source_id": "pdf-src-123",
        "filename": "order_sop.pdf",
        "pages": [{"page": 1, "text": SAMPLE_SOP_TEXT_PAGE}],
    }
    provider = RulesExtractionProvider()
    res = provider.extract(doc)
    assert res["status"] == "review_required"
    acts = res["activities"]
    assert len(acts) == 3
    assert acts[0]["label"] == "Receive and validate order details."
    assert acts[0]["source_ids"] == ["pdf-src-123:page-1:step-1"]
    assert acts[0]["currency"] == "USD"
    assert acts[1]["label"] == "Check inventory availability."
    assert acts[2]["label"] == "Prepare order confirmation."
    assert any("Exception counts" in c for c in res["cautions"])

def test_pdf_scanned_detection():
    doc = {
        "kind": "pdf",
        "source_id": "scanned-123",
        "filename": "scanned.pdf",
        "pages": [{"page": 1, "text": "   "}],
        "is_scanned": True,
    }
    provider = RulesExtractionProvider()
    res = provider.extract(doc)
    assert res["status"] == "manual_review_required"
    assert "Scanned or image-based PDF" in res["note"]
    assert len(res["activities"]) == 0

@patch("google.genai.Client")
def test_gemini_fallback_on_invalid_model_or_failure(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.models.generate_content.side_effect = Exception("404 models/gemini-3.8-flash is not found")

    provider = GeminiExtractionProvider(api_key="valid-looking-key", model="gemini-3.8-flash")
    parsed_file = extract_file("metrics.csv", "text/csv", SAMPLE_3_ROW_CSV)

    result = provider.extract(parsed_file)
    assert result["provider"] == "gemini"
    assert result["fallback_provider"] == "rules"
    assert result["status"] == "manual_review_required"
    assert result["error_code"] == "INVALID_MODEL"
    # Even though Gemini failed, 3 candidates are extracted by fallback rules for manual review!
    assert len(result["activities"]) == 3
    assert result["activities"][0]["label"] == "Order validation"

def test_upload_csv_populates_three_activities_and_provenance():
    payload = {
        "process_name": "Standard Order Processing",
        "sector": "Retail",
        "currency": "GBP",
        "activity_inputs": [
            {
                "label": "Order validation",
                "monthly_volume": 1200.0,
                "minutes_per_unit": 2.0,
                "hourly_rate": 30.0,
                "currency": "GBP",
                "confirmed": False,
            }
        ],
    }
    created = client.post("/v1/assessments", json=payload, headers=HEADERS).json()
    aid = created["id"]
    assert len(created["activities"]) == 1

    # Upload the 3-row CSV
    files = {"file": ("order_processing_metrics.csv", io.BytesIO(SAMPLE_3_ROW_CSV), "text/csv")}
    upload_res = client.post(f"/v1/assessments/{aid}/uploads", files=files, headers=HEADERS)
    assert upload_res.status_code == 201, upload_res.text
    assessment = upload_res.json()["assessment"]

    # All three activities should now be present in activities
    activities = assessment["activities"]
    assert len(activities) == 3
    labels = [a["label"] for a in activities]
    assert "Order validation" in labels
    assert "Inventory check" in labels
    assert "Order confirmation" in labels

    # Check provenance on Order validation
    val_act = next(a for a in activities if a["label"] == "Order validation")
    assert len(val_act["source_ids"]) > 0
    assert "row-2" in val_act["source_ids"][0]
    assert val_act["currency"] == "USD"
    assert val_act["confirmed"] is False

    # Check deduplication: upload the exact same file again
    files2 = {"file": ("order_processing_metrics.csv", io.BytesIO(SAMPLE_3_ROW_CSV), "text/csv")}
    upload_res2 = client.post(f"/v1/assessments/{aid}/uploads", files=files2, headers=HEADERS)
    assert upload_res2.status_code == 201
    assessment2 = upload_res2.json()["assessment"]
    assert len(assessment2["activities"]) == 3, "Re-uploading must not create duplicate activities"

def test_confirmed_activity_preserves_values_and_links_source():
    payload = {
        "process_name": "Standard Order Processing",
        "sector": "Retail",
        "currency": "GBP",
        "activity_inputs": [
            {
                "label": "Order validation",
                "monthly_volume": 1200.0,
                "minutes_per_unit": 2.0,
                "hourly_rate": 30.0,
                "currency": "GBP",
                "confirmed": True,  # Already confirmed
            }
        ],
    }
    created = client.post("/v1/assessments", json=payload, headers=HEADERS).json()
    aid = created["id"]

    # Upload CSV containing row 2 for Order validation
    files = {"file": ("order_processing_metrics.csv", io.BytesIO(SAMPLE_3_ROW_CSV), "text/csv")}
    upload_res = client.post(f"/v1/assessments/{aid}/uploads", files=files, headers=HEADERS)
    assert upload_res.status_code == 201
    assessment = upload_res.json()["assessment"]

    val_act = next(a for a in assessment["activities"] if a["label"] == "Order validation")
    assert val_act["confirmed"] is True, "Confirmed state must not be silently reverted"
    assert len(val_act["source_ids"]) > 0, "Source id from uploaded evidence should be linked"
    assert "row-2" in val_act["source_ids"][0]

def test_three_activities_happy_path_calculation_and_currency():
    activities = [
        {
            "label": "Order validation",
            "monthly_volume": 1200.0,
            "minutes_per_unit": 2.0,
            "hourly_rate": 30.0,
            "currency": "USD",
            "source_ids": ["src-1:row-2"],
            "confirmed": True,
        },
        {
            "label": "Inventory check",
            "monthly_volume": 1200.0,
            "minutes_per_unit": 1.5,
            "hourly_rate": 30.0,
            "currency": "USD",
            "source_ids": ["src-1:row-3"],
            "confirmed": True,
        },
        {
            "label": "Order confirmation",
            "monthly_volume": 1200.0,
            "minutes_per_unit": 2.5,
            "hourly_rate": 30.0,
            "currency": "USD",
            "source_ids": ["src-1:row-4"],
            "confirmed": True,
        },
    ]

    calc = calculate_assessment(activities, assessment_currency="USD")
    assert calc["annual_hours"] == "1440.00"
    assert calc["annual_effort_cost"] == "43200.00"
    assert calc["currency"] == "USD"
    assert calc["confirmed_activity_count"] == 3
    assert calc["unconfirmed_activity_count"] == 0

    scenarios = calc["scenarios"]
    assert scenarios["conservative"]["capacity_hours_released"] == "144.00"
    assert scenarios["conservative"]["capacity_value"] == "4320.00"

    assert scenarios["base"]["capacity_hours_released"] == "288.00"
    assert scenarios["base"]["capacity_value"] == "8640.00"

    assert scenarios["optimistic"]["capacity_hours_released"] == "504.00"
    assert scenarios["optimistic"]["capacity_value"] == "15120.00"

def test_currency_mismatch_warning_and_recommendation():
    activities = [
        {
            "label": "Order validation",
            "monthly_volume": 1200.0,
            "minutes_per_unit": 2.0,
            "hourly_rate": 30.0,
            "currency": "USD",
            "source_ids": ["src-1:row-2"],
            "confirmed": True,
        }
    ]
    # Assessment configured in GBP, activity in USD
    calc = calculate_assessment(activities, assessment_currency="GBP")
    assert calc["currency_mismatch"] is True
    assert "USD" in calc["currency_mismatch_warning"]
    assert "GBP" in calc["currency_mismatch_warning"]

    # Recommendation should include currency mismatch
    rec_titles = [r["title"] for r in calc["recommendations"]]
    assert "Resolve currency mismatch" in rec_titles

    # Because source_ids is populated, it should NOT say "Attach supporting evidence"
    assert "Attach supporting evidence" not in rec_titles

def test_evidence_recommendation_distinguishes_uploaded_vs_unlinked():
    # 1. Confirmed activity with valid source -> No evidence gap
    recs_with_source = build_recommendations(
        [{"label": "A", "annual_hours": "480", "monthly_volume": "1200", "minutes_per_unit": "2", "source_ids": ["s1:row-2"], "confirmed": True}],
        uploads=[{"id": "s1"}],
    )
    assert not any(r["title"] == "Attach supporting evidence" for r in recs_with_source)
    assert not any(r["title"] == "Link activity to supporting evidence" for r in recs_with_source)

    # 2. Confirmed activity with no source but uploads exist -> "Link activity to supporting evidence"
    recs_unlinked = build_recommendations(
        [{"label": "A", "annual_hours": "480", "monthly_volume": "1200", "minutes_per_unit": "2", "source_ids": [], "confirmed": True}],
        uploads=[{"id": "s1"}],
    )
    assert any(r["title"] == "Link activity to supporting evidence" for r in recs_unlinked)

    # 3. Confirmed activity with no source and no uploads -> "Attach supporting evidence"
    recs_no_upload = build_recommendations(
        [{"label": "A", "annual_hours": "480", "monthly_volume": "1200", "minutes_per_unit": "2", "source_ids": [], "confirmed": True}],
        uploads=[],
    )
    assert any(r["title"] == "Attach supporting evidence" for r in recs_no_upload)

def test_rejected_activity_excluded_from_calculations():
    activities = [
        {
            "label": "Order validation",
            "monthly_volume": 1200.0,
            "minutes_per_unit": 2.0,
            "hourly_rate": 30.0,
            "currency": "USD",
            "source_ids": ["src-1:row-2"],
            "confirmed": True,
        },
        {
            "label": "Out of scope task",
            "monthly_volume": 500.0,
            "minutes_per_unit": 10.0,
            "hourly_rate": 30.0,
            "currency": "USD",
            "source_ids": ["src-1:row-5"],
            "confirmed": False,
            "rejected": True,
        },
    ]
    calc = calculate_assessment(activities, assessment_currency="USD")
    assert calc["annual_hours"] == "480.00"
    assert calc["confirmed_activity_count"] == 1
    assert calc["rejected_activity_count"] == 1

def test_pdf_report_rendering_matches_calculations():
    assessment = {
        "id": "49d1ab39-test",
        "process_name": "Standard Order Processing",
        "status": "COMPLETE",
        "revision": 20,
        "calculations": {
            "annual_hours": "1440.00",
            "annual_effort_cost": "43200.00",
            "currency": "USD",
            "confirmed_activity_count": 3,
            "unconfirmed_activity_count": 0,
            "scenarios": {
                "conservative": {"assumed_reduction_pct": "10.00", "capacity_hours_released": "144.00", "capacity_value": "4320.00"},
                "base": {"assumed_reduction_pct": "20.00", "capacity_hours_released": "288.00", "capacity_value": "8640.00"},
                "optimistic": {"assumed_reduction_pct": "35.00", "capacity_hours_released": "504.00", "capacity_value": "15120.00"},
            },
            "activities": [
                {"label": "Order validation", "monthly_volume": "1200.00", "minutes_per_unit": "2.00", "hourly_rate": "30.00", "confirmed": True, "currency": "USD", "source_ids": ["metrics.csv:row-2"]},
                {"label": "Inventory check", "monthly_volume": "1200.00", "minutes_per_unit": "1.50", "hourly_rate": "30.00", "confirmed": True, "currency": "USD", "source_ids": ["metrics.csv:row-3"]},
                {"label": "Order confirmation", "monthly_volume": "1200.00", "minutes_per_unit": "2.50", "hourly_rate": "30.00", "confirmed": True, "currency": "USD", "source_ids": ["metrics.csv:row-4"]},
            ],
            "recommendations": [
                {"title": "Assess repetitive-step standardisation", "activity": "Order validation", "rationale": "High volume short duration"}
            ],
            "limitations": ["Illustrative scenarios only"],
        },
    }
    pdf_bytes = render_report(assessment)
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF")

def test_gemini_schema_has_no_additional_properties():
    from app.services.providers import GeminiExtractionOutput
    from google.genai._transformers import t_schema
    # t_schema must translate GeminiExtractionOutput without raising ValueError('additionalProperties is not supported in the Gemini API.')
    schema = t_schema(None, GeminiExtractionOutput)
    assert schema is not None
    assert hasattr(schema, "properties")
    assert "activities" in schema.properties

def test_pdf_numeric_values_represented_as_none_not_zero():
    doc = {
        "kind": "pdf",
        "source_id": "pdf-src-123",
        "filename": "order_sop.pdf",
        "pages": [{"page": 1, "text": SAMPLE_SOP_TEXT_PAGE}],
    }
    rules_provider = RulesExtractionProvider()
    result = rules_provider.extract(doc)
    assert result["status"] == "review_required"
    assert len(result["activities"]) == 3
    for act in result["activities"]:
        assert act["monthly_volume"] is None, "PDF step volume must be None, not 0.0"
        assert act["minutes_per_unit"] is None, "PDF step duration must be None, not 0.0"
        assert act["hourly_rate"] is None, "PDF step rate must be None, not 0.0"
        assert any("Quantitative metrics" in flag or "not present" in flag for flag in act["ambiguity_flags"])

def test_cross_matching_pdf_steps_with_csv_rows_preserves_both_sources():
    payload = {
        "process_name": "Standard Order Processing",
        "currency": "GBP",
        "activity_inputs": [{"label": "Order validation", "monthly_volume": 1200.0, "minutes_per_unit": 2.0, "hourly_rate": 30.0, "currency": "USD", "confirmed": False}],
    }
    created = client.post("/v1/assessments", json=payload, headers=HEADERS).json()
    aid = created["id"]

    # Upload PDF first (built in memory: api/data/ is gitignored and absent in CI)
    pdf_bytes = build_sop_pdf(SOP_ORDER_PROCESS_STEPS)

    pdf_files = {"file": ("simple_order_processing_sop.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    pdf_res = client.post(f"/v1/assessments/{aid}/uploads", files=pdf_files, headers=HEADERS)
    assert pdf_res.status_code == 201

    # Upload CSV second
    csv_files = {"file": ("order_processing_metrics.csv", io.BytesIO(SAMPLE_3_ROW_CSV), "text/csv")}
    csv_res = client.post(f"/v1/assessments/{aid}/uploads", files=csv_files, headers=HEADERS)
    assert csv_res.status_code == 201
    assessment = csv_res.json()["assessment"]

    activities = assessment["activities"]
    assert len(activities) == 3
    for a in activities:
        assert a["monthly_volume"] is not None and a["monthly_volume"] > 0
        assert a["minutes_per_unit"] is not None and a["minutes_per_unit"] > 0
        assert a["currency"] == "USD"
        # Verify both source references are preserved
        assert len(a["source_ids"]) >= 1
        source_texts = " ".join(a["source_ids"])
        assert "row-" in source_texts or "step-" in source_texts

def test_currency_alignment_patch_removes_warning_and_enables_approval():
    payload = {
        "process_name": "Standard Order Processing",
        "currency": "GBP",
        "activity_inputs": [
            {"label": "Order validation", "monthly_volume": 1200.0, "minutes_per_unit": 2.0, "hourly_rate": 30.0, "currency": "USD", "confirmed": True, "source_ids": ["csv:row-2"]},
            {"label": "Inventory check", "monthly_volume": 1200.0, "minutes_per_unit": 1.5, "hourly_rate": 30.0, "currency": "USD", "confirmed": True, "source_ids": ["csv:row-3"]},
            {"label": "Order confirmation", "monthly_volume": 1200.0, "minutes_per_unit": 2.5, "hourly_rate": 30.0, "currency": "USD", "confirmed": True, "source_ids": ["csv:row-4"]},
        ],
    }
    created = client.post("/v1/assessments", json=payload, headers=HEADERS).json()
    aid = created["id"]
    rev = created["revision"]

    # Submit analysis with assessment currency GBP vs activities USD
    sub_res = client.post(f"/v1/assessments/{aid}/submit", json={"expected_revision": rev}, headers=HEADERS)
    assert sub_res.status_code == 202
    assessment = sub_res.json()["assessment"]
    assert assessment["calculations"]["currency_mismatch"] is True
    rev = assessment["revision"]

    # Attempting to approve without acknowledging currency mismatch must be blocked
    approve_fail = client.post(f"/v1/assessments/{aid}/approve", json={"expected_revision": rev, "accepted_assumptions": {}}, headers=HEADERS)
    assert approve_fail.status_code == 422
    assert approve_fail.json()["detail"]["code"] == "CURRENCY_MISMATCH_UNRESOLVED"

    # Align assessment currency to USD via patch
    patch_res = client.patch(f"/v1/assessments/{aid}/facts", json={"expected_revision": rev, "currency": "USD"}, headers=HEADERS)
    assert patch_res.status_code == 200
    patched = patch_res.json()
    assert patched["currency"] == "USD"
    rev = patched["revision"]

    # Re-submit analysis now that currency is aligned
    sub_res2 = client.post(f"/v1/assessments/{aid}/submit", json={"expected_revision": rev}, headers=HEADERS)
    assert sub_res2.status_code == 202
    assessment2 = sub_res2.json()["assessment"]
    assert assessment2["calculations"]["currency_mismatch"] is False
    assert assessment2["calculations"]["currency_mismatch_warning"] is None
    assert assessment2["calculations"]["currency"] == "USD"
    assert assessment2["status"] == "COMPLETE"
    rev = assessment2["revision"]

    # Approval should now succeed cleanly
    app_res = client.post(f"/v1/assessments/{aid}/approve", json={"expected_revision": rev, "accepted_assumptions": {}}, headers=HEADERS)
    assert app_res.status_code == 202
    assert app_res.json()["status"] == "COMPLETE"

def test_recommendations_consolidated_and_currency_evidence_gap_false():
    activities = [
        {"label": "Order validation", "monthly_volume": "1200.00", "minutes_per_unit": "2.00", "hourly_rate": "30.00", "confirmed": True, "currency": "USD", "source_ids": ["csv:row-2"], "annual_hours": "480.00"},
        {"label": "Inventory check", "monthly_volume": "1200.00", "minutes_per_unit": "1.50", "hourly_rate": "30.00", "confirmed": True, "currency": "USD", "source_ids": ["csv:row-3"], "annual_hours": "360.00"},
        {"label": "Order confirmation", "monthly_volume": "1200.00", "minutes_per_unit": "2.50", "hourly_rate": "30.00", "confirmed": True, "currency": "USD", "source_ids": ["csv:row-4"], "annual_hours": "600.00"},
    ]
    recs = build_recommendations(activities, uploads=[{"id": "u1"}], currency_mismatch=True, currency_mismatch_warning="Mismatch")
    
    # 1. Currency mismatch must NOT have evidence_gap: True
    curr_rec = next(r for r in recs if r["id"] == "currency-mismatch")
    assert curr_rec["evidence_gap"] is False

    # 2. High-volume activities must be consolidated into one process-level recommendation
    rep_recs = [r for r in recs if "standardisation" in r["title"].lower()]
    assert len(rep_recs) == 1, "Must consolidate repetitive recommendations instead of repeating per activity"
    assert "across high-volume" in rep_recs[0]["title"] or "activities" in rep_recs[0]["activity"]


