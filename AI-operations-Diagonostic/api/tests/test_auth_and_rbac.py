from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path
from fastapi.testclient import TestClient

from app import main
from app.storage.auth_db import AuthDB


def _setup_isolated_auth_db(tmp_path: Path, monkeypatch) -> AuthDB:
    db_path = tmp_path / "test_auth.db"
    test_auth_db = AuthDB(db_path)
    monkeypatch.setattr(main, "auth_db", test_auth_db)
    return test_auth_db


def test_register_validation_and_duplicate_email(tmp_path, monkeypatch):
    _setup_isolated_auth_db(tmp_path, monkeypatch)
    client = TestClient(main.app)

    # Password mismatch
    bad_pw = client.post(
        "/v1/auth/register",
        json={
            "email": "alice@example.com",
            "password": "StrongPassword123",
            "confirm_password": "DifferentPassword123",
        },
    )
    assert bad_pw.status_code == 422

    # Valid registration
    email = f"alice-{uuid.uuid4().hex[:8]}@example.com"
    created = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPassword123",
            "confirm_password": "StrongPassword123",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == email
    assert body["user"]["role"] == "owner"
    assert body["user"]["onboarding_completed"] is False

    # Duplicate email rejected
    dup = client.post(
        "/v1/auth/register",
        json={
            "email": email.upper(),
            "password": "StrongPassword123",
            "confirm_password": "StrongPassword123",
        },
    )
    assert dup.status_code == 409
    assert dup.json()["detail"]["code"] == "EMAIL_ALREADY_EXISTS"


def test_register_onboarding_login_and_sqlite_persistence(tmp_path, monkeypatch):
    test_db = _setup_isolated_auth_db(tmp_path, monkeypatch)
    client = TestClient(main.app)

    email = f"bob-{uuid.uuid4().hex[:8]}@company.io"
    password = "SecurePass!2026"

    # 1. Register
    reg = client.post(
        "/v1/auth/register",
        json={"email": email, "password": password, "confirm_password": password},
    )
    assert reg.status_code == 201
    reg_token = reg.json()["access_token"]

    # 2. Complete onboarding details (workspace name, user full name, etc.)
    onboard = client.post(
        "/v1/auth/onboarding",
        headers={"Authorization": f"Bearer {reg_token}"},
        json={
            "workspace_name": "Northstar Logistics",
            "full_name": "Bob Taylor",
            "job_title": "VP Operations",
            "sector": "Logistics",
            "default_currency": "USD",
        },
    )
    assert onboard.status_code == 200, onboard.text
    onboard_user = onboard.json()["user"]
    assert onboard_user["onboarding_completed"] is True
    assert onboard_user["workspace_name"] == "Northstar Logistics"
    assert onboard_user["full_name"] == "Bob Taylor"
    assert onboard_user["default_currency"] == "USD"

    # 3. Verify credentials are persisted & hashed (never plaintext) in local SQLite DB
    with sqlite3.connect(test_db.db_path) as conn:
        row = conn.execute(
            "SELECT email, password_hash, workspace_name, full_name FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    assert row is not None
    assert row[0] == email
    assert row[1] != password
    assert row[1].startswith("pbkdf2_sha256$")
    assert row[2] == "Northstar Logistics"
    assert row[3] == "Bob Taylor"

    # 4. Logout revokes session
    logout_res = client.post(
        "/v1/auth/logout",
        headers={"Authorization": f"Bearer {reg_token}"},
    )
    assert logout_res.status_code == 200
    assert (
        client.get("/v1/auth/me", headers={"Authorization": f"Bearer {reg_token}"}).status_code
        == 401
    )

    # 5. Wrong password fails login
    bad_login = client.post(
        "/v1/auth/login",
        json={"email": email, "password": "WrongPassword"},
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["detail"]["code"] == "INVALID_CREDENTIALS"

    # 6. Matching email & password succeeds and returns workspace details
    good_login = client.post(
        "/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert good_login.status_code == 200, good_login.text
    login_data = good_login.json()
    assert login_data["access_token"]
    assert login_data["user"]["workspace_name"] == "Northstar Logistics"
    assert login_data["user"]["full_name"] == "Bob Taylor"


def test_workspace_isolation_and_rbac_roles(tmp_path, monkeypatch):
    _setup_isolated_auth_db(tmp_path, monkeypatch)
    client = TestClient(main.app)

    # Owner A registers & completes onboarding
    reg_a = client.post(
        "/v1/auth/register",
        json={
            "email": "owner-a@alpha.test",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    ).json()
    token_a = reg_a["access_token"]
    client.post(
        "/v1/auth/onboarding",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"workspace_name": "Alpha Ops", "full_name": "Owner Alpha"},
    )

    # Owner B registers & completes onboarding in a separate workspace
    reg_b = client.post(
        "/v1/auth/register",
        json={
            "email": "owner-b@beta.test",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    ).json()
    token_b = reg_b["access_token"]
    client.post(
        "/v1/auth/onboarding",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"workspace_name": "Beta Ops", "full_name": "Owner Beta"},
    )

    # Owner A creates an assessment
    created_a = client.post(
        "/v1/assessments",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "process_name": "Alpha Claims",
            "activity_inputs": [
                {
                    "label": "Review claim",
                    "monthly_volume": 100,
                    "minutes_per_unit": 5,
                    "hourly_rate": 30,
                    "confirmed": True,
                }
            ],
        },
    )
    assert created_a.status_code == 201
    aid = created_a.json()["id"]

    # Owner B cannot see Owner A's assessment
    list_b = client.get("/v1/assessments", headers={"Authorization": f"Bearer {token_b}"})
    assert list_b.status_code == 200
    assert all(item["id"] != aid for item in list_b.json()["items"])
    assert (
        client.get(
            f"/v1/assessments/{aid}", headers={"Authorization": f"Bearer {token_b}"}
        ).status_code
        == 404
    )

    # Owner A creates a Viewer and an Analyst in Alpha Ops
    viewer_res = client.post(
        "/v1/workspace/members",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "email": "viewer@alpha.test",
            "password": "Password123!",
            "full_name": "Viewer Alpha",
            "role": "viewer",
        },
    )
    assert viewer_res.status_code == 201

    analyst_res = client.post(
        "/v1/workspace/members",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "email": "analyst@alpha.test",
            "password": "Password123!",
            "full_name": "Analyst Alpha",
            "role": "analyst",
        },
    )
    assert analyst_res.status_code == 201
    analyst_id = analyst_res.json()["user"]["id"]

    viewer_token = client.post(
        "/v1/auth/login",
        json={"email": "viewer@alpha.test", "password": "Password123!"},
    ).json()["access_token"]
    analyst_token = client.post(
        "/v1/auth/login",
        json={"email": "analyst@alpha.test", "password": "Password123!"},
    ).json()["access_token"]

    # Viewer can read Alpha Ops assessments, cannot write or manage members
    assert (
        client.get(
            f"/v1/assessments/{aid}", headers={"Authorization": f"Bearer {viewer_token}"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/v1/assessments",
            headers={"Authorization": f"Bearer {viewer_token}"},
            json={"process_name": "Blocked Create"},
        ).status_code
        == 403
    )
    assert (
        client.get(
            "/v1/workspace/members", headers={"Authorization": f"Bearer {viewer_token}"}
        ).status_code
        == 403
    )

    # Analyst can submit assessment, cannot approve or reset sandbox
    submitted = client.post(
        f"/v1/assessments/{aid}/submit",
        headers={"Authorization": f"Bearer {analyst_token}"},
        json={"expected_revision": 1},
    )
    assert submitted.status_code == 202
    rev = submitted.json()["assessment"]["revision"]

    blocked_approve = client.post(
        f"/v1/assessments/{aid}/approve",
        headers={"Authorization": f"Bearer {analyst_token}"},
        json={"expected_revision": rev, "accepted_assumptions": {}},
    )
    assert blocked_approve.status_code == 403

    # Owner promotes Analyst to Admin -> now can approve!
    promoted = client.patch(
        f"/v1/workspace/members/{analyst_id}/role",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"role": "admin"},
    )
    assert promoted.status_code == 200
    assert promoted.json()["user"]["role"] == "admin"

    allowed_approve = client.post(
        f"/v1/assessments/{aid}/approve",
        headers={"Authorization": f"Bearer {analyst_token}"},
        json={"expected_revision": rev, "accepted_assumptions": {}},
    )
    assert allowed_approve.status_code == 202
