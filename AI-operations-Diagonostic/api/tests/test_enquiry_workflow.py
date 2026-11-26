from __future__ import annotations

from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.domain.calculations import calculate_assessment
from app.domain.recommendations import build_recommendations
from app.main import app
from app.services import extraction as extraction_service
from app.services.providers import GeminiExtractionProvider
from app.services.report import render_report

client = TestClient(app)
HEADERS = {"Authorization": "Bearer local-demo-token-change-me"}

ENQUIRY = "How can we reduce the cost of processing supplier invoices?"

SAMPLE_CSV = b"""activity,monthly_volume,avg_minutes_per_item,loaded_hourly_cost_usd,currency
Invoice matching,1200,4.0,30,GBP
Payment run,300,12.0,30,GBP
"""


@pytest.fixture(autouse=True)
def _isolate_analysis_cache(monkeypatch):
    from app import main as main_module

    monkeypatch.setattr(main_module, "IDEMPOTENCY_CACHE", {})


def _confirmed_activities() -> list[dict]:
    return [
        {
            "activity_id": "activity-1",
            "label": "Invoice matching",
            "monthly_volume": 1200,
            "minutes_per_unit": 4,
            "hourly_rate": 30,
            "currency": "GBP",
            "confirmed": True,
            "source_ids": ["source-abc:row-2"],
        },
        {
            "activity_id": "activity-2",
            "label": "Payment run",
            "monthly_volume": 300,
            "minutes_per_unit": 12,
            "hourly_rate": 30,
            "currency": "GBP",
            "confirmed": True,
            "source_ids": [],
        },
    ]


def _assessment_with_enquiry() -> dict:
    activities = _confirmed_activities()
    calculations = calculate_assessment(activities, assessment_currency="GBP")
    return {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "process_name": "Supplier invoice review",
        "sector": "Retail",
        "period": "Last 90 days",
        "unit": "invoices",
        "currency": "GBP",
        "status": "COMPLETE",
        "revision": 3,
        "goals": ENQUIRY,
        "activities": activities,
        "calculations": calculations,
    }


def _read_report(assessment: dict) -> str:
    reader = PdfReader(BytesIO(render_report(assessment)))
    return " ".join(
        " ".join((page.extract_text() or "").split()) for page in reader.pages
    ).casefold()


def test_extract_with_provider_forwards_enquiry_question_to_provider(monkeypatch):
    captured: dict = {}

    class RecordingProvider:
        def extract(self, document, **kwargs):
            captured["document"] = document
            captured["enquiry"] = kwargs.get("enquiry")
            return {"activities": []}

    monkeypatch.setattr(
        extraction_service,
        "get_extraction_provider",
        lambda **kwargs: RecordingProvider(),
    )

    document = {"kind": "csv", "headers": ["activity"], "rows": [{"activity": "Invoice matching"}]}
    extraction_service.extract_with_provider(
        document,
        provider_name="rules",
        api_key=None,
        model="gemini-3.1-flash-lite",
        enquiry=ENQUIRY,
    )

    assert captured["document"] is document
    assert captured["enquiry"] == ENQUIRY


@patch("google.genai.Client")
def test_gemini_prompt_includes_the_user_enquiry(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.models.generate_content.return_value = MagicMock(text='{"activities": []}')

    provider = GeminiExtractionProvider(api_key="valid-looking-key")
    document = {
        "kind": "csv",
        "headers": ["activity"],
        "rows": [{"activity": "Invoice matching"}],
        "source_id": "source-1",
    }

    provider.extract(document, enquiry=ENQUIRY)

    prompt = mock_client.models.generate_content.call_args.kwargs["contents"]
    assert ENQUIRY in prompt


def test_analyze_passes_the_enquiry_goal_into_extraction(monkeypatch):
    captured: dict = {}
    real_extract = extraction_service.extract_with_provider

    def recording_extract(document, provider_name, api_key, model, enquiry=None):
        captured["enquiry"] = enquiry
        return real_extract(document, provider_name, api_key, model, enquiry=enquiry)

    monkeypatch.setattr("app.main.extract_with_provider", recording_extract)

    created = client.post(
        "/v1/assessments",
        json={
            "process_name": "Supplier invoice review",
            "sector": "Retail",
            "currency": "GBP",
            "goals": ENQUIRY,
        },
        headers=HEADERS,
    )
    assert created.status_code == 201
    assessment = created.json()

    analysed = client.post(
        f"/v1/assessments/{assessment['id']}/analyze",
        data={"expected_revision": assessment["revision"]},
        files={"files": ("metrics.csv", SAMPLE_CSV, "text/csv")},
        headers=HEADERS,
    )

    assert analysed.status_code == 200
    assert captured["enquiry"] == ENQUIRY


def test_recommendations_prioritise_cost_reduction_for_a_confirmed_baseline():
    activities = [
        {
            "label": "Invoice matching",
            "monthly_volume": "1200",
            "minutes_per_unit": "4",
            "hourly_rate": "30",
            "currency": "GBP",
            "confirmed": True,
            "source_ids": ["csv:row-2"],
            "annual_hours": "960",
            "annual_effort_cost": "28800",
        },
        {
            "label": "Payment run",
            "monthly_volume": "300",
            "minutes_per_unit": "12",
            "hourly_rate": "30",
            "currency": "GBP",
            "confirmed": True,
            "source_ids": [],
            "annual_hours": "720",
            "annual_effort_cost": "21600",
        },
    ]

    recommendations = build_recommendations(activities)

    cost_recommendations = [r for r in recommendations if r["id"] == "cost-reduction-priority"]
    assert len(cost_recommendations) == 1
    recommendation = cost_recommendations[0]
    assert recommendation["priority"] == "cost"
    assert "cost" in recommendation["title"].casefold()
    assert "invoice matching" in recommendation["rationale"].casefold()
    assert recommendation["evidence_gap"] is False
    standardisation = [r for r in recommendations if "standardisation" in r["title"].casefold()]
    assert len(standardisation) == 1


def test_report_opens_with_the_enquiry_question_and_cost_reduction_focus():
    text = _read_report(_assessment_with_enquiry())

    assert "your enquiry" in text
    assert "how can we reduce the cost of processing supplier invoices" in text
    assert "cost reduction" in text


def test_browser_preflight_for_analyze_allows_the_idempotency_header():
    response = client.options(
        "/v1/assessments/00000000-0000-0000-0000-000000000000/analyze",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
        },
    )

    assert response.status_code == 200
    allowed_headers = response.headers.get("access-control-allow-headers", "").casefold()
    assert "idempotency-key" in allowed_headers
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
