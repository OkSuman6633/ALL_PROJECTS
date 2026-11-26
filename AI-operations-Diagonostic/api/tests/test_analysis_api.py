import io

import pytest
from fastapi.testclient import TestClient

from app import main
from app.storage.json_store import JsonStateStore

client = TestClient(main.app)


@pytest.fixture
def isolated_api_state(tmp_path, monkeypatch):
    monkeypatch.setattr(main.settings, "data_dir", str(tmp_path))
    monkeypatch.setattr(main.settings, "gemini_api_key", None)
    monkeypatch.setattr(main, "store", JsonStateStore(str(tmp_path)))
    return {"Authorization": f"Bearer {main.settings.demo_token}"}


def create_assessment_with_candidate(headers, process_name):
    return client.post(
        "/v1/assessments",
        json={
            "process_name": process_name,
            "activity_inputs": [
                {
                    "label": "TEST ONLY - unconfirmed setup candidate",
                    "monthly_volume": 10,
                    "minutes_per_unit": 5,
                    "hourly_rate": 20,
                    "confirmed": False,
                }
            ],
        },
        headers=headers,
    )


def test_batch_analyze_processes_each_file_and_keeps_candidates_unconfirmed(isolated_api_state):
    created = create_assessment_with_candidate(isolated_api_state, "Batch evidence test")
    assert created.status_code == 201, created.text
    assessment_id = created.json()["id"]

    response = client.post(
        f"/v1/assessments/{assessment_id}/analyze",
        data={"expected_revision": "1"},
        files=[
            ("files", ("operations.csv", io.BytesIO(
                b"activity,monthly_volume,minutes_per_unit,hourly_rate,currency\n"
                b"Review TEST invoice,100,6,30,GBP\n"
            ), "text/csv")),
            ("files", ("unsupported.txt", io.BytesIO(b"not evidence"), "text/plain")),
        ],
        headers=isolated_api_state,
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "partial_failure"
    assert [file_result["status"] for file_result in result["files"]] == ["succeeded", "failed"]
    assert result["files"][0]["filename"] == "operations.csv"
    assert result["files"][1]["filename"] == "unsupported.txt"
    assert result["assessment"]["revision"] == 3
    assert len(result["assessment"]["uploads"]) == 1
    assert len(result["assessment"]["activities"]) == 2
    extracted_activity = next(
        activity for activity in result["assessment"]["activities"]
        if activity["provenance"].get("row_number") == 2
    )
    assert extracted_activity["confirmed"] is False
    assert result["assessment"]["calculations"]["calculation_eligible_activity_count"] == 0


def test_analyze_rejects_stale_revision_without_saving_evidence(isolated_api_state):
    created = create_assessment_with_candidate(isolated_api_state, "Stale analysis test")
    assert created.status_code == 201, created.text
    assessment_id = created.json()["id"]
    patched = client.patch(
        f"/v1/assessments/{assessment_id}/facts",
        json={"expected_revision": 1, "currency": "USD"},
        headers=isolated_api_state,
    )
    assert patched.status_code == 200, patched.text

    response = client.post(
        f"/v1/assessments/{assessment_id}/analyze",
        data={"expected_revision": "1"},
        files={"files": ("operations.csv", io.BytesIO(
            b"activity,monthly_volume,minutes_per_unit,hourly_rate\n"
            b"Review invoice,100,6,30\n"
        ), "text/csv")},
        headers=isolated_api_state,
    )

    assert response.status_code == 409, response.text
    current = client.get(
        f"/v1/assessments/{assessment_id}", headers=isolated_api_state
    ).json()
    assert current["revision"] == 2
    assert current["uploads"] == []

def test_analyze_reupload_is_reported_as_duplicate_without_duplicate_facts(isolated_api_state):
    created = create_assessment_with_candidate(isolated_api_state, "Duplicate analysis test")
    assert created.status_code == 201, created.text
    assessment_id = created.json()["id"]
    content = (
        b"activity,monthly_volume,minutes_per_unit,hourly_rate\n"
        b"Review invoice,100,6,30\n"
    )

    first = client.post(
        f"/v1/assessments/{assessment_id}/analyze",
        data={"expected_revision": "1"},
        files={"files": ("operations.csv", io.BytesIO(content), "text/csv")},
        headers=isolated_api_state,
    )
    assert first.status_code == 200, first.text
    assert first.json()["files"][0]["status"] == "succeeded"

    second = client.post(
        f"/v1/assessments/{assessment_id}/analyze",
        data={"expected_revision": str(first.json()["assessment"]["revision"])},
        files={"files": ("operations-copy.csv", io.BytesIO(content), "text/csv")},
        headers=isolated_api_state,
    )

    assert second.status_code == 200, second.text
    result = second.json()
    assert result["status"] == "completed"
    assert result["files"][0]["status"] == "duplicate"
    assert len(result["assessment"]["uploads"]) == 1
    assert len(result["assessment"]["activities"]) == 2


def test_analyze_supports_idempotency_key_and_rejects_reuse_with_different_content(isolated_api_state):
    created = create_assessment_with_candidate(isolated_api_state, "Idempotent analysis test")
    assert created.status_code == 201, created.text
    assessment_id = created.json()["id"]
    shared_headers = {**isolated_api_state, "Idempotency-Key": "batch-req-123"}
    content = (
        b"activity,monthly_volume,minutes_per_unit,hourly_rate,currency\n"
        b"Review invoice,100,6,30,GBP\n"
    )

    first = client.post(
        f"/v1/assessments/{assessment_id}/analyze",
        data={"expected_revision": "1"},
        files={"files": ("operations.csv", io.BytesIO(content), "text/csv")},
        headers=shared_headers,
    )
    assert first.status_code == 200, first.text
    second = client.post(
        f"/v1/assessments/{assessment_id}/analyze",
        data={"expected_revision": "1"},
        files={"files": ("operations.csv", io.BytesIO(content), "text/csv")},
        headers=shared_headers,
    )
    assert second.status_code == 200, second.text
    assert second.json() == first.json()

    changed = client.post(
        f"/v1/assessments/{assessment_id}/analyze",
        data={"expected_revision": "1"},
        files={"files": ("operations.csv", io.BytesIO(b"activity,monthly_volume\nOther,12\n"), "text/csv")},
        headers=shared_headers,
    )
    assert changed.status_code == 409, changed.text


def test_source_inspection_route_requires_same_assessment_and_returns_row_context(isolated_api_state):
    created = create_assessment_with_candidate(isolated_api_state, "Source inspection test")
    assessment_id = created.json()["id"]
    other = client.post(
        "/v1/assessments",
        json={"process_name": "Other process", "activity_inputs": [{"label": "Other step", "monthly_volume": 5, "minutes_per_unit": 5, "hourly_rate": 20}]},
        headers=isolated_api_state,
    )
    other_id = other.json()["id"]

    analysis = client.post(
        f"/v1/assessments/{assessment_id}/analyze",
        data={"expected_revision": "1"},
        files={"files": ("operations.csv", io.BytesIO(b"activity,monthly_volume,minutes_per_unit,hourly_rate,currency\nReview invoice,100,6,30,GBP\n"), "text/csv")},
        headers=isolated_api_state,
    )
    assert analysis.status_code == 200, analysis.text
    source_id = analysis.json()["assessment"]["uploads"][0]["id"]

    lookup = client.get(f"/v1/assessments/{assessment_id}/sources/{source_id}", headers=isolated_api_state)
    assert lookup.status_code == 200, lookup.text
    payload = lookup.json()
    assert payload["kind"] == "csv"
    assert payload["source_references"][0]["kind"] == "row"
    assert payload["source_references"][0]["row_number"] == 2

    denied = client.get(f"/v1/assessments/{other_id}/sources/{source_id}", headers=isolated_api_state)
    assert denied.status_code == 404, denied.text


def test_approval_must_use_current_revision_and_invalidate_stale_report(isolated_api_state):
    created = client.post(
        "/v1/assessments",
        json={
            "process_name": "Approval revision test",
            "activity_inputs": [{"label": "Review invoice", "monthly_volume": 100, "minutes_per_unit": 6, "hourly_rate": 30, "currency": "GBP", "confirmed": False}],
        },
        headers=isolated_api_state,
    )
    assert created.status_code == 201, created.text
    assessment_id = created.json()["id"]

    confirmed = client.patch(
        f"/v1/assessments/{assessment_id}/facts",
        json={"expected_revision": 1, "changes": [{"activity_id": created.json()["activities"][0]["activity_id"], "confirmed": True}]},
        headers=isolated_api_state,
    )
    assert confirmed.status_code == 200, confirmed.text
    submitted = client.post(
        f"/v1/assessments/{assessment_id}/submit",
        json={"expected_revision": confirmed.json()["revision"]},
        headers=isolated_api_state,
    )
    assert submitted.status_code == 202, submitted.text

    approval = client.post(
        f"/v1/assessments/{assessment_id}/approve",
        json={"expected_revision": submitted.json()["assessment"]["revision"], "accepted_assumptions": {"verified": True}},
        headers=isolated_api_state,
    )
    assert approval.status_code == 202, approval.text
    report = client.get(f"/v1/assessments/{assessment_id}/report", headers=isolated_api_state)
    assert report.status_code == 200, report.text

    stale = client.patch(
        f"/v1/assessments/{assessment_id}/facts",
        json={"expected_revision": approval.json()["revision"], "changes": [{"activity_id": created.json()["activities"][0]["activity_id"], "label": "Updated label"}]},
        headers=isolated_api_state,
    )
    assert stale.status_code == 200, stale.text
    invalidated = client.get(f"/v1/assessments/{assessment_id}/report", headers=isolated_api_state)
    assert invalidated.status_code == 409, invalidated.text


def test_analyze_failed_files_are_reported_as_failed_and_do_not_create_duplicate_candidates(isolated_api_state):
    created = create_assessment_with_candidate(isolated_api_state, "Failed analysis test")
    assessment_id = created.json()["id"]

    response = client.post(
        f"/v1/assessments/{assessment_id}/analyze",
        data={"expected_revision": "1"},
        files=[
            ("files", ("unsupported.txt", io.BytesIO(b"not evidence"), "text/plain")),
            ("files", ("notes.md", io.BytesIO(b"# notes"), "text/markdown")),
        ],
        headers=isolated_api_state,
    )

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "failed"
    assert [item["status"] for item in result["files"]] == ["failed", "failed"]
    assert len(result["assessment"]["activities"]) == 1
