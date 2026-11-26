from __future__ import annotations
import json
from unittest.mock import MagicMock, patch
import pytest
from app.services.providers import (
    RulesExtractionProvider,
    GeminiExtractionProvider,
    redact_secrets,
    get_extraction_provider,
)

def test_secret_redaction():
    secret = "AIzaSySuperSecretDummyKey12345"
    message = f"Error calling Google API with key {secret}: 403 Forbidden"
    cleaned = redact_secrets(message, [secret])
    assert secret not in cleaned
    assert "[REDACTED_API_KEY]" in cleaned

def test_rules_csv_extraction():
    provider = RulesExtractionProvider()
    doc = {
        "kind": "csv",
        "source_id": "src-csv-1",
        "rows": [
            {
                "record_id": "CS-001",
                "activity": "Ticket triage",
                "monthly_volume": "3000",
                "avg_minutes_per_item": "1.5",
                "loaded_hourly_cost_usd": "26.0",
            },
            {
                "record_id": "CS-002",
                "activity": "Response drafting",
                "monthly_volume": "3000",
                "avg_minutes_per_item": "5.0",
                "loaded_hourly_cost_usd": "26.0",
            },
            {
                "record_id": "CS-003",
                "activity": "Knowledge lookup",
                "monthly_volume": "2100",
                "avg_minutes_per_item": "2.5",
                "loaded_hourly_cost_usd": "26.0",
            },
            {
                "record_id": "CS-004",
                "activity": "Escalation handling",
                "monthly_volume": "300",
                "avg_minutes_per_item": "8.0",
                "loaded_hourly_cost_usd": "26.0",
            },
        ],
    }
    result = provider.extract(doc)
    assert result["provider"] == "rules"
    assert result["status"] == "review_required"
    assert len(result["activities"]) == 4

    labels = [a["label"] for a in result["activities"]]
    assert labels == ["Ticket triage", "Response drafting", "Knowledge lookup", "Escalation handling"]
    assert result["activities"][0]["monthly_volume"] == 3000.0
    assert result["activities"][0]["minutes_per_unit"] == 1.5
    assert result["activities"][0]["currency"] == "USD"
    assert result["activities"][0]["source_ids"] == ["src-csv-1:row-2"]
    assert any("USD currency" in flag for flag in result["activities"][0]["ambiguity_flags"])

def test_rules_pdf_extraction():
    provider = RulesExtractionProvider()
    doc = {
        "kind": "pdf",
        "source_id": "src-pdf-1",
        "pages": [
            {
                "page": 1,
                "text": (
                    "Step 1. Receive a support ticket.\n"
                    "Step 2. Classify by urgency.\n"
                    "Step 3. Search knowledge base and draft response.\n"
                    "Review caution: Knowledge lookup and response drafting may overlap."
                ),
            }
        ],
    }
    result = provider.extract(doc)
    assert result["provider"] == "rules"
    assert len(result["activities"]) == 3
    assert len(result["cautions"]) >= 1
    assert any("overlap" in c.lower() for c in result["cautions"])

def test_gemini_missing_api_key():
    provider = GeminiExtractionProvider(api_key="")
    result = provider.extract({"kind": "csv", "rows": []})
    assert result["provider"] == "gemini"
    assert result["status"] == "provider_error"
    assert result["error_code"] == "MISSING_API_KEY"

@patch("google.genai.Client")
def test_gemini_valid_structured_response(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "activities": [
            {
                "label": "Ticket triage",
                "monthly_volume": 3000,
                "minutes_per_unit": 1.5,
                "hourly_rate": 26,
                "currency": "GBP",
                "achievable_reduction_pct": 20,
                "confidence": "high",
                "ambiguity_flags": [],
            }
        ],
        "questions": ["Is 3000 cases representative?"],
        "cautions": [],
    })
    mock_client.models.generate_content.return_value = mock_response

    provider = GeminiExtractionProvider(api_key="valid-dummy-key")
    result = provider.extract({"kind": "csv", "source_id": "src-1", "rows": [{"a": "1"}]})

    assert result["provider"] == "gemini"
    assert result["status"] == "review_required"
    assert len(result["activities"]) == 1
    assert result["activities"][0]["label"] == "Ticket triage"
    assert result["activities"][0]["monthly_volume"] == 3000.0

@patch("google.genai.Client")
def test_gemini_invalid_api_key(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.models.generate_content.side_effect = Exception("API_KEY_INVALID: 403 Forbidden")

    provider = GeminiExtractionProvider(api_key="invalid-key-xyz")
    result = provider.extract({"kind": "csv", "source_id": "src-1", "rows": []})

    assert result["provider"] == "gemini"
    assert result["status"] == "provider_error"
    assert result["error_code"] == "INVALID_API_KEY"
    assert "invalid-key-xyz" not in result["note"]

@patch("google.genai.Client")
def test_gemini_rate_limited(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.models.generate_content.side_effect = Exception("429 ResourceExhausted: Quota exceeded")

    provider = GeminiExtractionProvider(api_key="key")
    result = provider.extract({"kind": "csv", "source_id": "src-1", "rows": []})

    assert result["error_code"] == "RATE_LIMITED"

@patch("google.genai.Client")
def test_gemini_malformed_json_response(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_response = MagicMock()
    mock_response.text = "NOT JSON AT ALL"
    mock_client.models.generate_content.return_value = mock_response

    provider = GeminiExtractionProvider(api_key="key")
    result = provider.extract({"kind": "csv", "source_id": "src-1", "rows": []})

    assert result["error_code"] == "MALFORMED_OUTPUT"

def test_get_extraction_provider_selection():
    p_rules = get_extraction_provider("rules", "some-key")
    assert p_rules.name == "rules"

    p_gemini = get_extraction_provider("gemini", "some-key")
    assert p_gemini.name == "gemini"

    p_default_nokey = get_extraction_provider(None, "")
    assert p_default_nokey.name == "rules"
