import os
from fastapi.testclient import TestClient
from app.config import get_settings
from app.main import app

client=TestClient(app)
HEADERS={"Authorization":"Bearer local-demo-token-change-me"}

def test_auth_required():
    assert client.get('/v1/assessments').status_code == 401

def test_assessment_review_approval_report(tmp_path, monkeypatch):
    # Existing app store path is settings-cached at import; use unique assessment IDs and normal test data.
    payload={"process_name":"Invoice review", "activity_inputs":[{"label":"Check invoice", "monthly_volume":100, "minutes_per_unit":6, "hourly_rate":30, "confirmed":False}]}
    created=client.post('/v1/assessments', json=payload, headers=HEADERS)
    assert created.status_code == 201, created.text
    item=created.json(); aid=item['id']
    submitted=client.post(f'/v1/assessments/{aid}/submit', json={"expected_revision":1}, headers=HEADERS)
    assert submitted.status_code == 202, submitted.text
    current=submitted.json()['assessment']
    activity=current['activities'][0]
    patched=client.patch(f'/v1/assessments/{aid}/facts', json={"expected_revision":current['revision'], "changes":[{"activity_id":activity['activity_id'], "confirmed":True}]}, headers=HEADERS)
    assert patched.status_code == 200, patched.text
    current=patched.json()
    submitted2=client.post(f'/v1/assessments/{aid}/submit', json={"expected_revision":current['revision']}, headers=HEADERS)
    current=submitted2.json()['assessment']
    approved=client.post(f'/v1/assessments/{aid}/approve', json={"expected_revision":current['revision'], "accepted_assumptions":{}}, headers=HEADERS)
    assert approved.status_code == 202, approved.text
    pdf=client.get(f'/v1/assessments/{aid}/report', headers=HEADERS)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b'%PDF')
