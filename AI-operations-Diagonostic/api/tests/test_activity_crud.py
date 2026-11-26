import uuid

import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import get_settings
from app.storage.json_store import JsonStateStore


HEADERS = {"Authorization": f"Bearer {get_settings().demo_token}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", JsonStateStore(str(tmp_path / "state")))
    with TestClient(main.app) as test_client:
        yield test_client


def create_assessment(client):
    response = client.post(
        "/v1/assessments",
        headers=HEADERS,
        json={
            "process_name": "Activity creation regression",
            "activity_inputs": [
                {
                    "label": "Existing activity",
                    "monthly_volume": 100,
                    "minutes_per_unit": 5,
                    "hourly_rate": 25,
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def add_activity(client, assessment, label):
    response = client.patch(
        f"/v1/assessments/{assessment['id']}/facts",
        headers=HEADERS,
        json={
            "expected_revision": assessment["revision"],
            "add_activities": [
                {
                    "label": label,
                    "monthly_volume": 50,
                    "minutes_per_unit": 3,
                    "hourly_rate": 20,
                    "currency": "GBP",
                    "confirmed": True,
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_activity_create_edit_delete_and_refresh_preserves_revision_and_ids(client):
    created = create_assessment(client)
    original = created["activities"][0]

    after_first_add = add_activity(client, created, "Added step one")
    first_added = next(a for a in after_first_add["activities"] if a["label"] == "Added step one")
    assert str(uuid.UUID(first_added["activity_id"])) == first_added["activity_id"]
    assert first_added["activity_id"] != "__new__"
    assert after_first_add["revision"] == created["revision"] + 1
    assert any(a["activity_id"] == original["activity_id"] for a in after_first_add["activities"])

    after_second_add = add_activity(client, after_first_add, "Added step two")
    second_added = next(a for a in after_second_add["activities"] if a["label"] == "Added step two")
    assert str(uuid.UUID(second_added["activity_id"])) == second_added["activity_id"]
    assert second_added["activity_id"] != first_added["activity_id"]
    assert len(after_second_add["activities"]) == 3

    edited = client.patch(
        f"/v1/assessments/{created['id']}/facts",
        headers=HEADERS,
        json={
            "expected_revision": after_second_add["revision"],
            "changes": [{"activity_id": original["activity_id"], "label": "Existing activity edited"}],
        },
    )
    assert edited.status_code == 200, edited.text
    assert len(edited.json()["activities"]) == 3

    deleted = client.patch(
        f"/v1/assessments/{created['id']}/facts",
        headers=HEADERS,
        json={
            "expected_revision": edited.json()["revision"],
            "remove_activity_ids": [second_added["activity_id"]],
        },
    )
    assert deleted.status_code == 200, deleted.text

    refreshed = client.get(f"/v1/assessments/{created['id']}", headers=HEADERS)
    assert refreshed.status_code == 200, refreshed.text
    persisted = refreshed.json()
    assert persisted["revision"] == deleted.json()["revision"]
    assert {a["label"] for a in persisted["activities"]} == {
        "Existing activity edited",
        "Added step one",
    }
    assert second_added["activity_id"] not in {a["activity_id"] for a in persisted["activities"]}


def test_repeated_activity_create_with_stale_revision_does_not_duplicate(client):
    created = create_assessment(client)
    payload = {
        "expected_revision": created["revision"],
        "add_activities": [{"label": "Single submitted step", "confirmed": True}],
    }
    first = client.patch(
        f"/v1/assessments/{created['id']}/facts",
        headers=HEADERS,
        json=payload,
    )
    assert first.status_code == 200, first.text

    repeated = client.patch(
        f"/v1/assessments/{created['id']}/facts",
        headers=HEADERS,
        json=payload,
    )
    assert repeated.status_code == 409, repeated.text

    refreshed = client.get(f"/v1/assessments/{created['id']}", headers=HEADERS).json()
    assert len(refreshed["activities"]) == 2
    assert sum(a["label"] == "Single submitted step" for a in refreshed["activities"]) == 1


def test_failed_activity_creation_and_temporary_update_id_leave_data_unchanged(client):
    created = create_assessment(client)
    before = client.get(f"/v1/assessments/{created['id']}", headers=HEADERS).json()

    failed_create = client.patch(
        f"/v1/assessments/{created['id']}/facts",
        headers=HEADERS,
        json={
            "expected_revision": before["revision"],
            "add_activities": [{"label": "   "}],
        },
    )
    assert failed_create.status_code == 422, failed_create.text

    fake_update = client.patch(
        f"/v1/assessments/{created['id']}/facts",
        headers=HEADERS,
        json={
            "expected_revision": before["revision"],
            "changes": [{"activity_id": "__new__", "label": "Must not be created by update"}],
        },
    )
    assert fake_update.status_code == 422, fake_update.text
    assert fake_update.json()["detail"]["code"] == "UNKNOWN_ACTIVITY"

    after = client.get(f"/v1/assessments/{created['id']}", headers=HEADERS).json()
    assert after == before
