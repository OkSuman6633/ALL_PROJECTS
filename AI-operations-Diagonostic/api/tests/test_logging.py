import json
import logging
import re
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app, identity
from app.observability import JsonLogFormatter, RequestLoggingMiddleware
from app.services.providers import GeminiExtractionProvider
from app.storage.json_store import JsonStateStore


@pytest.fixture
def aod_records():
    logger = logging.getLogger("aod")
    records = []
    handler = logging.Handler()
    handler.emit = records.append
    previous_level = logger.level
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    try:
        yield records
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)


def test_http_request_emits_correlated_completion_log(aod_records):
    response = TestClient(app).get(
        "/healthz?private-query-value=must-not-be-logged",
        headers={"X-Correlation-ID": "trace-test-123"},
    )

    assert response.status_code == 200
    records = [
        record
        for record in aod_records
        if getattr(record, "event", None) == "http_request_completed"
    ]
    assert len(records) == 1
    record = records[0]
    assert record.request_id == "trace-test-123"
    assert record.method == "GET"
    assert record.route == "/healthz"
    assert record.status_code == 200
    assert record.duration_ms >= 0
    serialized = JsonLogFormatter().format(record)
    entry = json.loads(serialized)
    assert entry["timestamp"].endswith("Z")
    assert entry["source"]["file"].endswith("observability.py")
    assert entry["source"]["line"] > 0
    assert "private-query-value" not in serialized


def test_non_uuid_assessment_path_is_not_logged(aod_records):
    test_app = FastAPI()

    @test_app.get("/v1/assessments/{assessment_id}")
    def get_assessment(assessment_id: str):
        return {"ok": True}

    client = TestClient(RequestLoggingMiddleware(test_app))
    response = client.get("/v1/assessments/private-assessment-name")

    assert response.status_code == 200
    completion = next(
        record
        for record in aod_records
        if getattr(record, "event", None) == "http_request_completed"
    )
    serialized = JsonLogFormatter().format(completion)
    assert "private-assessment-name" not in serialized
    assert getattr(completion, "assessment_id", None) is None


def test_invalid_correlation_id_is_replaced_and_reused_in_error(aod_records):
    response = TestClient(app).get(
        "/v1/assessments",
        headers={"X-Correlation-ID": "invalid\nidentifier"},
    )

    assert response.status_code == 401
    correlation_id = response.json()["detail"]["correlation_id"]
    assert re.fullmatch(r"[0-9a-f-]{36}", correlation_id)
    assert response.headers["x-correlation-id"] == correlation_id
    completion = next(
        record
        for record in aod_records
        if getattr(record, "event", None) == "http_request_completed"
        and getattr(record, "route", None) == "/v1/assessments"
    )
    assert completion.request_id == correlation_id
    error = next(
        record
        for record in aod_records
        if getattr(record, "event", None) == "http.error"
    )
    assert error.error_code == "UNAUTHENTICATED"
    assert error.status_code == 401
    assert error.request_id == correlation_id


def test_unexpected_exception_logs_safe_stack_and_assessment_context(aod_records):
    test_app = FastAPI()

    @test_app.get("/v1/assessments/{assessment_id}/explode")
    def explode(assessment_id: str):
        raise RuntimeError("uploaded evidence contents must not be logged")

    client = TestClient(RequestLoggingMiddleware(test_app), raise_server_exceptions=False)
    assessment_id = "123e4567-e89b-12d3-a456-426614174000"
    response = client.get(
        f"/v1/assessments/{assessment_id}/explode",
        headers={"X-Correlation-ID": "trace-error-123"},
    )

    assert response.status_code == 500
    error_record = next(
        record
        for record in aod_records
        if getattr(record, "event", None) == "http_request_failed"
    )
    assert error_record.exc_info[0] is RuntimeError
    assert error_record.assessment_id == assessment_id
    assert error_record.request_id == "trace-error-123"
    serialized = JsonLogFormatter().format(error_record)
    assert "stack_trace" in serialized
    assert "uploaded evidence contents" not in serialized

    completion = next(
        record
        for record in aod_records
        if getattr(record, "event", None) == "http_request_completed"
        and getattr(record, "route", None) == "/v1/assessments/{assessment_id}/explode"
    )
    assert completion.status_code == 500


@patch("google.genai.Client")
def test_provider_failure_logs_code_without_provider_secret(
    mock_client_class, aod_records
):
    secret = "private-provider-secret-123"
    mock_client = MagicMock()
    mock_client_class.return_value = mock_client
    mock_client.models.generate_content.side_effect = Exception(
        f"API_KEY_INVALID {secret}"
    )

    result = GeminiExtractionProvider(api_key=secret).extract(
        {"kind": "csv", "source_id": "source-1", "rows": []}
    )

    assert result["error_code"] == "INVALID_API_KEY"
    provider_error = next(
        record
        for record in aod_records
        if getattr(record, "event", None) == "provider.extraction_fallback"
    )
    assert provider_error.provider == "gemini"
    assert provider_error.error_code == "INVALID_API_KEY"
    serialized = JsonLogFormatter().format(provider_error)
    assert "stack_trace" in serialized
    assert secret not in serialized


def test_failed_analysis_logs_safe_assessment_context(
    tmp_path, monkeypatch, aod_records
):
    monkeypatch.setattr(
        "app.main.store",
        JsonStateStore(str(tmp_path)),
    )
    monkeypatch.setitem(
        app.dependency_overrides,
        identity,
        lambda: {
            "user_id": "logging-test-user",
            "tenant_id": "logging-test-tenant",
            "role": "owner",
        },
    )

    with TestClient(app) as client:
        created = client.post(
            "/v1/assessments",
            json={
                "process_name": "Logging test",
                "activity_inputs": [
                    {
                        "label": "Review invoice",
                        "monthly_volume": 10,
                        "minutes_per_unit": 2,
                        "hourly_rate": 30,
                    }
                ],
            },
        )
        assert created.status_code == 201, created.text
        assessment_id = created.json()["id"]

        response = client.post(
            f"/v1/assessments/{assessment_id}/analyze",
            data={"expected_revision": str(created.json()["revision"])},
            files=[
                (
                    "files",
                    ("private-name.txt", b"private evidence contents", "text/plain"),
                )
            ],
        )

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    failure = next(
        record
        for record in aod_records
        if getattr(record, "event", None) == "evidence.processing_failed"
    )
    assert failure.assessment_id == assessment_id
    assert failure.stage == "validation"
    assert failure.error_code == "INVALID_EVIDENCE"
    serialized = JsonLogFormatter().format(failure)
    assert "private-name.txt" not in serialized
    assert "private evidence contents" not in serialized


def test_review_and_report_events_include_assessment_context(
    tmp_path, monkeypatch, aod_records
):
    monkeypatch.setattr(
        "app.main.store",
        JsonStateStore(str(tmp_path)),
    )
    monkeypatch.setitem(
        app.dependency_overrides,
        identity,
        lambda: {
            "user_id": "logging-test-user",
            "tenant_id": "logging-test-tenant",
            "role": "owner",
        },
    )

    with TestClient(app) as client:
        created = client.post(
            "/v1/assessments",
            json={
                "process_name": "Logging workflow",
                "activity_inputs": [
                    {
                        "label": "Review invoice",
                        "monthly_volume": 10,
                        "minutes_per_unit": 2,
                        "hourly_rate": 30,
                        "confirmed": True,
                    }
                ],
            },
        )
        assert created.status_code == 201, created.text
        assessment_id = created.json()["id"]

        submitted = client.post(
            f"/v1/assessments/{assessment_id}/submit",
            json={"expected_revision": created.json()["revision"]},
        )
        assert submitted.status_code == 202, submitted.text
        current = submitted.json()["assessment"]
        approved = client.post(
            f"/v1/assessments/{assessment_id}/approve",
            json={
                "expected_revision": current["revision"],
                "accepted_assumptions": {},
            },
        )
        assert approved.status_code == 202, approved.text
        report = client.get(f"/v1/assessments/{assessment_id}/report")

    assert report.status_code == 200
    assert report.content.startswith(b"%PDF")
    workflow_events = {
        record.event: record
        for record in aod_records
        if getattr(record, "event", None)
        in {"assessment.submitted", "assessment.approved", "report.generated"}
    }
    assert set(workflow_events) == {
        "assessment.submitted",
        "assessment.approved",
        "report.generated",
    }
    assert all(
        record.assessment_id == assessment_id for record in workflow_events.values()
    )
    request_ids_by_route = {
        record.route: record.request_id
        for record in aod_records
        if getattr(record, "event", None) == "http_request_completed"
    }
    assert workflow_events["assessment.submitted"].request_id == request_ids_by_route[
        "/v1/assessments/{assessment_id}/submit"
    ]
    assert workflow_events["assessment.approved"].request_id == request_ids_by_route[
        "/v1/assessments/{assessment_id}/approve"
    ]
    assert workflow_events["report.generated"].request_id == request_ids_by_route[
        "/v1/assessments/{assessment_id}/report"
    ]
