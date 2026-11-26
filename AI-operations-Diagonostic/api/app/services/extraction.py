from __future__ import annotations
import csv, io, hashlib, json, os
from pathlib import Path
from typing import Any
from pypdf import PdfReader
from .providers import get_extraction_provider

ALLOWED = {"application/pdf", "text/csv", "application/vnd.ms-excel"}

def extract_file(filename: str, content_type: str, data: bytes) -> dict[str, Any]:
    if len(data) > 10 * 1024 * 1024:
        raise ValueError("File exceeds 10 MB limit")
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".csv"}:
        raise ValueError("Only PDF and CSV files are accepted")
    digest = hashlib.sha256(data).hexdigest()
    if suffix == ".csv":
        text = data.decode("utf-8-sig", errors="strict")
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for idx, row in enumerate(reader, start=2):
            cleaned_row = {
                str(k).strip(): str(v or "").strip()[:2000]
                for k, v in row.items()
                if k is not None
            }
            rows.append(cleaned_row)
            if idx > 1002:
                break
        headers = [h.strip() for h in (reader.fieldnames or [])]
        return {
            "filename": filename,
            "sha256": digest,
            "kind": "csv",
            "row_count": len(rows),
            "headers": headers,
            "rows": rows,
            "source_id": digest[:16],
        }

    reader = PdfReader(io.BytesIO(data), strict=False)
    if len(reader.pages) > 100:
        raise ValueError("PDF exceeds 100-page limit")
    pages = []
    total_text_len = 0
    for idx, page in enumerate(reader.pages, start=1):
        try:
            text = (page.extract_text() or "")[:20000]
        except Exception:
            text = ""
        total_text_len += len(text.strip())
        pages.append({"page": idx, "text": text})

    is_scanned = (total_text_len == 0)

    return {
        "filename": filename,
        "sha256": digest,
        "kind": "pdf",
        "page_count": len(pages),
        "pages": pages,
        "source_id": digest[:16],
        "is_scanned": is_scanned,
    }

def extract_with_provider(
    document: dict[str, Any],
    provider_name: str | None,
    api_key: str | None,
    model: str,
    enquiry: str | None = None,
) -> dict[str, Any]:
    provider = get_extraction_provider(provider_type=provider_name, api_key=api_key, model=model)
    return provider.extract(document, enquiry=enquiry)

def extract_with_gemini(document: dict[str, Any], api_key: str | None, model: str) -> dict[str, Any]:
    return extract_with_provider(document, provider_name="gemini", api_key=api_key, model=model)
