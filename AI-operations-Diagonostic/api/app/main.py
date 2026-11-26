from __future__ import annotations
import csv, io, json, logging, os, time, uuid, hashlib, hmac
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Form, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import get_settings
from .observability import RequestLoggingMiddleware, configure_logging, emit_event
from .domain.schemas import (
    AssessmentCreate,
    FactPatch,
    SubmitRequest,
    ApproveRequest,
    RegisterRequest,
    OnboardingRequest,
    LoginRequest,
    WorkspaceMemberCreateRequest,
    WorkspaceMemberRoleUpdateRequest,
)
from .domain.calculations import calculate_assessment
from .storage.auth_db import AuthDB, EmailAlreadyExistsError
from .storage.json_store import RevisionConflict
from .storage.sqlite_store import SqliteStateStore
from .services.extraction import extract_file, extract_with_provider
from .services.report import render_report

settings = get_settings()
_db_path = Path(settings.data_dir) / "aod.db"
store = SqliteStateStore(_db_path)
auth_db = AuthDB(_db_path)
configure_logging()
app = FastAPI(title=settings.app_name, version="0.1.0", description="Evidence-driven operational diagnostic. Local demo auth is not production authentication.")
app.openapi_version = "3.1.0"
IDEMPOTENCY_CACHE: dict[str, dict[str, object]] = {}
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Correlation-ID"],
    expose_headers=["X-Correlation-ID"],
)
app.add_middleware(RequestLoggingMiddleware)

def now(): return datetime.now(timezone.utc).isoformat()

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": {"assessments:read", "assessments:write", "assessments:approve", "sandbox:reset", "workspace:manage"},
    "admin": {"assessments:read", "assessments:write", "assessments:approve", "sandbox:reset", "workspace:manage"},
    "analyst": {"assessments:read", "assessments:write"},
    "viewer": {"assessments:read"},
}

def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None

def _user_with_permissions(user_record: dict) -> dict:
    role = user_record.get("role", "viewer")
    return {
        **user_record,
        "permissions": sorted(ROLE_PERMISSIONS.get(role, set())),
    }

def identity(authorization: str | None = Header(default=None)):
    token = _extract_bearer_token(authorization)
    if token:
        db_user = auth_db.get_user_by_token(token)
        if db_user:
            return {
                "user_id": db_user["id"],
                "tenant_id": db_user["workspace_id"],
                "role": db_user["role"],
                "email": db_user["email"],
                "full_name": db_user["full_name"],
                "job_title": db_user["job_title"],
                "workspace_name": db_user["workspace_name"],
                "sector": db_user.get("sector", "Professional services"),
                "default_currency": db_user.get("default_currency", "GBP"),
                "onboarding_completed": db_user["onboarding_completed"],
                "auth_type": "session",
                "user_record": db_user,
            }

    if settings.auth_mode == "demo":
        expected = f"Bearer {settings.demo_token}"
        if authorization and hmac.compare_digest(authorization, expected):
            return {
                "user_id": "local-demo-user",
                "tenant_id": "local-demo-tenant",
                "role": "owner",
                "email": "demo@local.aod",
                "full_name": "Demo Owner",
                "job_title": "Operations Lead",
                "workspace_name": "Local Demo Workspace",
                "sector": "Professional services",
                "default_currency": "GBP",
                "onboarding_completed": True,
                "auth_type": "demo",
            }
    raise HTTPException(401, detail={"code": "UNAUTHENTICATED", "message": "Authentication required. Please sign in."})

def require_permission(permission: str):
    def _checker(user=Depends(identity)):
        role = user.get("role", "")
        allowed = ROLE_PERMISSIONS.get(role, set())
        if permission not in allowed:
            raise HTTPException(
                403,
                detail={
                    "code": "FORBIDDEN",
                    "message": f"Your role ({role or 'unknown'}) does not have permission to perform this action ({permission}).",
                },
            )
        return user
    return _checker

def get_assessment(tenant_id: str, assessment_id: str):
    item = store.get(tenant_id, assessment_id)
    if not item: raise HTTPException(404, detail={"code":"NOT_FOUND", "message":"Assessment not found."})
    return item

def safe_item(item):
    return {k:v for k,v in item.items() if k not in {"tenant_id", "report_bytes"}}

def err_conflict():
    raise HTTPException(409, detail={"code":"REVISION_CONFLICT", "message":"Assessment changed. Refresh and retry with the latest revision."})

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"message":str(exc.detail)}
    detail.setdefault("correlation_id", getattr(request.state, "correlation_id", str(uuid.uuid4())))
    emit_event(
        logging.WARNING if exc.status_code >= 500 else logging.INFO,
        "http.error",
        method=request.method,
        route=getattr(request.scope.get("route"), "path", "<unmatched>"),
        assessment_id=request.path_params.get("assessment_id"),
        status_code=exc.status_code,
        error_code=detail.get("code"),
        outcome="server_error" if exc.status_code >= 500 else "client_error",
    )
    return JSONResponse(status_code=exc.status_code, content={"detail":detail})

@app.get("/healthz")
def healthz(): return {"status":"healthy", "version":"0.1.0", "environment":settings.environment}

@app.get("/readyz")
def readyz():
    try:
        Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
        return {"status":"ready", "state_store":"local-sqlite", "model_configured":bool(settings.gemini_api_key)}
    except Exception: raise HTTPException(503, detail={"code":"NOT_READY", "message":"State store is unavailable."})

@app.get("/v1/providers")
def providers(user=Depends(identity)):
    return {
        "extraction_provider": "gemini" if settings.gemini_api_key else "rules/manual-review",
        "gemini_configured": bool(settings.gemini_api_key),
        "gemini_model": settings.gemini_model,
        "state_store": "local-sqlite",
        "production_auth_configured": user.get("auth_type") == "session",
    }

@app.post("/v1/auth/register", status_code=201)
def register(payload: RegisterRequest):
    try:
        user_record = auth_db.register_user(payload.email, payload.password)
    except EmailAlreadyExistsError as exc:
        raise HTTPException(409, detail={"code": "EMAIL_ALREADY_EXISTS", "message": str(exc)})
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "INVALID_EMAIL", "message": str(exc)})

    token = auth_db.create_session(user_record["id"])
    emit_event(logging.INFO, "auth.registered", stage="auth", outcome="succeeded")
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_with_permissions(user_record),
    }

@app.post("/v1/auth/onboarding")
def complete_onboarding(payload: OnboardingRequest, user=Depends(identity)):
    if user.get("auth_type") != "session":
        raise HTTPException(400, detail={"code": "ONBOARDING_NOT_APPLICABLE", "message": "Demo token accounts do not use user onboarding."})
    updated = auth_db.complete_onboarding(
        user_id=user["user_id"],
        workspace_name=payload.workspace_name,
        full_name=payload.full_name,
        job_title=payload.job_title,
        sector=payload.sector,
        default_currency=payload.default_currency,
    )
    emit_event(logging.INFO, "auth.onboarding_completed", stage="auth", outcome="succeeded")
    return {"user": _user_with_permissions(updated)}

@app.post("/v1/auth/login")
def login(payload: LoginRequest):
    user_record = auth_db.authenticate(payload.email, payload.password)
    if not user_record:
        emit_event(logging.INFO, "auth.login_failed", stage="auth", outcome="failed", error_code="INVALID_CREDENTIALS")
        raise HTTPException(401, detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password."})
    token = auth_db.create_session(user_record["id"])
    emit_event(logging.INFO, "auth.logged_in", stage="auth", outcome="succeeded")
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_with_permissions(user_record),
    }

@app.post("/v1/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    token = _extract_bearer_token(authorization)
    if token:
        auth_db.revoke_session(token)
    return {"status": "signed_out"}

@app.get("/v1/auth/me")
def get_me(user=Depends(identity)):
    if user.get("auth_type") == "session" and user.get("user_record"):
        return {"user": _user_with_permissions(user["user_record"])}
    return {
        "user": _user_with_permissions({
            "id": user["user_id"],
            "email": user.get("email", ""),
            "full_name": user.get("full_name", "Demo Owner"),
            "job_title": user.get("job_title", "Operations Lead"),
            "workspace_id": user["tenant_id"],
            "workspace_name": user.get("workspace_name", "Local Demo Workspace"),
            "sector": user.get("sector", "Professional services"),
            "default_currency": user.get("default_currency", "GBP"),
            "role": user["role"],
            "onboarding_completed": True,
        })
    }

@app.get("/v1/workspace/members")
def list_workspace_members(user=Depends(require_permission("workspace:manage"))):
    members = [_user_with_permissions(m) for m in auth_db.list_workspace_users(user["tenant_id"])]
    return {"items": members, "workspace_id": user["tenant_id"], "workspace_name": user.get("workspace_name", "")}

@app.post("/v1/workspace/members", status_code=201)
def create_workspace_member(payload: WorkspaceMemberCreateRequest, user=Depends(require_permission("workspace:manage"))):
    try:
        member = auth_db.create_workspace_member(
            workspace_id=user["tenant_id"],
            workspace_name=user.get("workspace_name", "Workspace"),
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
            role=payload.role,
            job_title=payload.job_title,
        )
    except EmailAlreadyExistsError as exc:
        raise HTTPException(409, detail={"code": "EMAIL_ALREADY_EXISTS", "message": str(exc)})
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "INVALID_MEMBER", "message": str(exc)})
    return {"user": _user_with_permissions(member)}

@app.patch("/v1/workspace/members/{member_id}/role")
def update_workspace_member_role(
    member_id: str,
    payload: WorkspaceMemberRoleUpdateRequest,
    user=Depends(require_permission("workspace:manage")),
):
    try:
        updated = auth_db.update_member_role(user["tenant_id"], member_id, payload.role)
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "INVALID_ROLE_UPDATE", "message": str(exc)})
    if not updated:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Workspace member not found."})
    return {"user": _user_with_permissions(updated)}

@app.post("/v1/assessments", status_code=201)
def create_assessment(payload: AssessmentCreate, user=Depends(require_permission("assessments:write"))):
    assessment_id = str(uuid.uuid4())
    activities = []
    for a in payload.activity_inputs:
        row = a.model_dump()
        row["activity_id"] = str(uuid.uuid4())
        row["provenance"] = row.get("provenance") or {}
        activities.append(row)
    item = {
        "id": assessment_id,
        "tenant_id": user["tenant_id"],
        "owner_id": user["user_id"],
        "template_id": payload.template_id,
        "process_name": payload.process_name,
        "sector": payload.sector,
        "period": payload.period,
        "unit": payload.unit,
        "currency": getattr(payload, "currency", "GBP") or "GBP",
        "goals": payload.goals,
        "is_sandbox": bool(getattr(payload, "is_sandbox", False)),
        "status": "CREATED",
        "revision": 1,
        "reviewed_revision": 0,
        "approved_revision": None,
        "created_at": now(),
        "updated_at": now(),
        "activities": activities,
        "uploads": [],
        "extraction": [],
        "calculations": None,
        "accepted_assumptions": None,
        "report_ready": False,
        "events": [{"event":"ASSESSMENT_CREATED", "at":now()}],
    }
    store.create(item)
    return safe_item(item)

@app.get("/v1/assessments")
def list_assessments(is_sandbox: bool | None = None, user=Depends(require_permission("assessments:read"))):
    all_items = [safe_item(i) for i in store.list(user["tenant_id"])]
    if is_sandbox is True:
        items = [i for i in all_items if i.get("is_sandbox") is True]
    else:
        # Default: production assessments only, strictly excluding sandbox records
        items = [i for i in all_items if not i.get("is_sandbox")]
    return {"items": items, "next_cursor": None}

@app.get("/v1/assessments/{assessment_id}")
def get_assessment_route(assessment_id: str, user=Depends(require_permission("assessments:read"))):
    return safe_item(get_assessment(user["tenant_id"], assessment_id))

def _matches_activity(label1: str, label2: str) -> bool:
    import re
    l1 = label1.strip().lower()
    l2 = label2.strip().lower()
    if not l1 or not l2:
        return False
    if l1 == l2:
        return True
    stop_words = {
        'and', 'the', 'for', 'in', 'to', 'of', 'a', 'an', 'details', 'step', 'process',
        'check', 'record', 'with', 'verify', 'test', 'sample', 'procedure', 'item', 'routine'
    }
    tokens1 = {w for w in re.findall(r'[a-z0-9]+', l1) if w not in stop_words}
    tokens2 = {w for w in re.findall(r'[a-z0-9]+', l2) if w not in stop_words}
    if not tokens1 or not tokens2:
        return False
    stems1 = {w[:5] for w in tokens1}
    stems2 = {w[:5] for w in tokens2}
    common = stems1.intersection(stems2)
    return len(common) >= 2 or (len(common) >= 1 and (len(tokens1) == 1 or len(tokens2) == 1))

def _merge_candidates_into_activities(current_activities: list[dict], candidate_activities: list[dict], filename: str, doc_source_id: str):
    """
    Merges extracted candidates into assessment activities:
    - Never overwrites confirmed values.
    - If unconfirmed matching activity exists, attaches provenance and updates values.
    - If already confirmed activity matches but lacks source reference, attaches source reference.
    - Adds new distinct candidate activities with confirmed=False.
    - Prevents duplicate activities when re-extracted or re-uploaded.
    - Prevents distinct steps/rows from the same document from collapsing into each other.
    """
    from app.domain.validation import validate_activity
    for candidate in candidate_activities:
        cand_label = candidate["label"].strip()
        cand_sources = candidate.get("source_ids") or [doc_source_id]

        # 1. Match by exact existing source reference (e.g. re-extraction of the same file/row)
        existing = next((a for a in current_activities if any(s in (a.get("source_ids") or []) for s in cand_sources)), None)

        # 2. If not found by exact source reference, match by label or content, BUT:
        # A candidate from `doc_source_id` can NEVER match an existing activity that already has
        # a DIFFERENT step or row reference from `doc_source_id`!
        if not existing and cand_label:
            eligible_activities = [
                a for a in current_activities
                if not any(s.startswith(f"{doc_source_id}:") for s in (a.get("source_ids") or []))
            ]
            existing = next((a for a in eligible_activities if a["label"].strip().lower() == cand_label.lower()), None)
            if not existing:
                existing = next((a for a in eligible_activities if _matches_activity(a["label"], cand_label)), None)

        if existing:
            cand_vol = candidate.get("monthly_volume")
            cand_mins = candidate.get("minutes_per_unit")
            cand_rate = candidate.get("hourly_rate")
            cand_curr = candidate.get("currency")
            cand_rework = candidate.get("rework_rate")
            cand_error = candidate.get("error_rate")

            # If already confirmed, preserve reviewer numbers and confirmation
            if existing.get("confirmed"):
                if not existing.get("source_ids"):
                    existing["source_ids"] = list(cand_sources)
                else:
                    for s in cand_sources:
                        if s not in existing["source_ids"]:
                            existing["source_ids"].append(s)
                if not existing.get("provenance") and candidate.get("provenance"):
                    existing["provenance"] = candidate["provenance"]
            else:
                # If unconfirmed, update with candidate data if candidate has metrics
                has_cand_metrics = cand_vol is not None and cand_mins is not None and (cand_vol > 0 or cand_mins > 0)
                if has_cand_metrics:
                    existing["monthly_volume"] = cand_vol
                    existing["minutes_per_unit"] = cand_mins
                    existing["hourly_rate"] = cand_rate
                    if cand_curr:
                        existing["currency"] = cand_curr
                    if cand_rework is not None:
                        existing["rework_rate"] = cand_rework
                    if cand_error is not None:
                        existing["error_rate"] = cand_error
                    if len(candidate["label"]) <= len(existing["label"]) and candidate["label"].strip():
                        existing["label"] = candidate["label"]

                if not existing.get("source_ids"):
                    existing["source_ids"] = list(cand_sources)
                else:
                    for s in cand_sources:
                        if s not in existing["source_ids"]:
                            existing["source_ids"].append(s)
                if candidate.get("provenance"):
                    existing["provenance"] = candidate["provenance"]

            val = validate_activity(existing)
            existing["is_valid"] = val["is_valid"]
            existing["validation_status"] = val["validation_status"]
            existing["validation_errors"] = val["errors"]
            existing["validation_warnings"] = val["warnings"]
            existing["is_calculation_eligible"] = val["is_calculation_eligible"]
        else:
            # Add as new unconfirmed candidate
            cand_vol = candidate.get("monthly_volume")
            cand_mins = candidate.get("minutes_per_unit")
            cand_rate = candidate.get("hourly_rate")
            cand_rework = candidate.get("rework_rate")
            cand_error = candidate.get("error_rate")

            vol = float(cand_vol) if cand_vol is not None else None
            mins = float(cand_mins) if cand_mins is not None else None
            rate = float(cand_rate) if cand_rate is not None else None
            rework = float(cand_rework) if cand_rework is not None else None
            error = float(cand_error) if cand_error is not None else None

            val = validate_activity({
                "label": cand_label,
                "monthly_volume": vol,
                "minutes_per_unit": mins,
                "hourly_rate": rate,
                "rework_rate": rework,
                "error_rate": error,
                "currency": candidate.get("currency", "GBP"),
                "achievable_reduction_pct": candidate.get("achievable_reduction_pct", 20.0),
                "confirmed": False,
                "rejected": False,
            })

            new_act = {
                "activity_id": str(uuid.uuid4()),
                "label": cand_label,
                "monthly_volume": vol,
                "minutes_per_unit": mins,
                "hourly_rate": rate,
                "rework_rate": rework,
                "error_rate": error,
                "currency": candidate.get("currency", "GBP"),
                "achievable_reduction_pct": float(candidate.get("achievable_reduction_pct", 20.0) or 20.0),
                "source_ids": list(cand_sources),
                "confirmed": False,
                "rejected": False,
                "is_valid": val["is_valid"],
                "validation_status": val["validation_status"],
                "validation_errors": val["errors"],
                "validation_warnings": val["warnings"],
                "is_calculation_eligible": False,
                "confidence": candidate.get("confidence", "heuristic"),
                "ambiguity_flags": candidate.get("ambiguity_flags", []),
                "provenance": candidate.get("provenance") or {
                    "evidence_id": doc_source_id,
                    "filename": filename,
                    "source_type": "unknown",
                },
            }
            current_activities.append(new_act)

@app.post("/v1/assessments/{assessment_id}/analyze", status_code=200)
async def analyze_assessment(
    assessment_id: str,
    expected_revision: int = Form(...),
    files: list[UploadFile] = File(default=[]),
    user=Depends(require_permission("assessments:write")),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    started = time.perf_counter()
    if not files:
        raise HTTPException(422, detail={"code": "NO_FILES", "message": "Provide at least one evidence file to analyze."})

    payload_snapshot = []
    for file_obj in files:
        data = await file_obj.read()
        payload_snapshot.append({
            "filename": file_obj.filename or "upload",
            "content_type": file_obj.content_type,
            "sha256": hashlib.sha256(data).hexdigest(),
            "size": len(data),
        })
        file_obj.file.seek(0)
    request_hash = hashlib.sha256(json.dumps({"expected_revision": expected_revision, "files": payload_snapshot}, sort_keys=True).encode("utf-8")).hexdigest()

    if idempotency_key:
        key = f"{user['tenant_id']}:{assessment_id}:{idempotency_key}"
        prior = IDEMPOTENCY_CACHE.get(key)
        if prior is not None:
            if prior["request_hash"] != request_hash:
                raise HTTPException(409, detail={"code": "IDEMPOTENCY_KEY_REUSED", "message": "This idempotency key was already used with different request content."})
            return prior["response"]

    item = get_assessment(user["tenant_id"], assessment_id)
    if item["revision"] != expected_revision:
        err_conflict()

    file_results: list[dict[str, object]] = []
    current_item = deepcopy(item)
    current_revision = item["revision"]

    for upload_file in files:
        filename = upload_file.filename or "upload"
        data = await upload_file.read()
        if len(data) > settings.max_upload_mb * 1024 * 1024:
            emit_event(
                logging.WARNING,
                "evidence.processing_failed",
                assessment_id=assessment_id,
                stage="validation",
                outcome="failed",
                error_code="FILE_TOO_LARGE",
            )
            file_results.append({
                "filename": filename,
                "status": "failed",
                "error": {"code": "FILE_TOO_LARGE", "message": "Upload exceeds configured limit."},
            })
            continue

        suffix = Path(filename).suffix.lower()
        if suffix not in {".pdf", ".csv"}:
            emit_event(
                logging.WARNING,
                "evidence.processing_failed",
                assessment_id=assessment_id,
                stage="validation",
                outcome="failed",
                error_code="INVALID_EVIDENCE",
            )
            file_results.append({
                "filename": filename,
                "status": "failed",
                "error": {"code": "INVALID_EVIDENCE", "message": "Only PDF and CSV files are accepted."},
            })
            continue

        sha256 = hashlib.sha256(data).hexdigest()
        existing_upload = next((u for u in current_item.get("uploads", []) if u.get("sha256") == sha256), None)
        if existing_upload:
            file_results.append({
                "filename": filename,
                "status": "duplicate",
                "upload_id": existing_upload["id"],
                "duplicate_of": existing_upload["id"],
            })
            continue

        try:
            doc = extract_file(filename, upload_file.content_type or "application/octet-stream", data)
        except Exception as exc:
            emit_event(
                logging.WARNING,
                "evidence.processing_failed",
                assessment_id=assessment_id,
                stage="extraction",
                outcome="failed",
                error_code="INVALID_EVIDENCE",
            )
            file_results.append({
                "filename": filename,
                "status": "failed",
                "error": {"code": "INVALID_EVIDENCE", "message": str(exc)},
            })
            continue

        provider_name = "gemini" if settings.gemini_api_key else "rules"
        extracted = extract_with_provider(
            doc,
            provider_name,
            settings.gemini_api_key,
            settings.gemini_model,
            enquiry=current_item.get("goals"),
        )
        emit_event(
            logging.WARNING if extracted.get("status") == "provider_error" else logging.INFO,
            "evidence.extraction_completed",
            assessment_id=assessment_id,
            stage="provider_extraction",
            outcome=extracted.get("status", "unknown"),
            provider=extracted.get("provider", provider_name),
            error_code=extracted.get("error_code"),
        )

        if hasattr(store, "save_source_blob"):
            store.save_source_blob(
                tenant_id=user["tenant_id"],
                assessment_id=assessment_id,
                source_id=doc["source_id"],
                sha256=doc["sha256"],
                filename=filename,
                kind=doc["kind"],
                content=data,
            )
        else:
            evidence_folder = Path(settings.data_dir) / user["tenant_id"] / assessment_id / "sources"
            evidence_folder.mkdir(parents=True, exist_ok=True)
            evidence_path = evidence_folder / f"{doc['sha256']}{'.pdf' if doc['kind'] == 'pdf' else '.csv'}"
            if not evidence_path.exists():
                evidence_path.write_bytes(data)

        upload_item = {
            "id": doc["source_id"],
            "filename": filename,
            "kind": doc["kind"],
            "sha256": doc["sha256"],
            "size": len(data),
            "uploaded_at": now(),
            "scan_status": "not_scanned_local_only",
            "page_count": doc.get("page_count"),
            "row_count": doc.get("row_count"),
            "is_scanned": doc.get("is_scanned", False),
        }

        current_item["uploads"] = [u for u in current_item.get("uploads", []) if u["id"] != doc["source_id"]]
        current_item["uploads"].append(upload_item)
        current_item["extraction"] = [e for e in current_item.get("extraction", []) if e["source_id"] != doc["source_id"]]
        current_item["extraction"].append({"source_id": doc["source_id"], **extracted})
        _merge_candidates_into_activities(current_item["activities"], extracted.get("activities", []), filename, doc["source_id"])
        current_item["updated_at"] = now()
        current_item["report_ready"] = False
        current_item["approved_revision"] = None
        current_item["status"] = "REVIEW"
        current_item["events"].append({
            "event": "EVIDENCE_ANALYSIS",
            "at": now(),
            "source_id": doc["source_id"],
            "filename": filename,
        })
        current_item["calculations"] = calculate_assessment(
            current_item["activities"],
            assessment_currency=current_item.get("currency", "GBP"),
            uploads=current_item.get("uploads", []),
            extractions=current_item.get("extraction", []),
        )

        try:
            updated = store.update(user["tenant_id"], assessment_id, current_revision, lambda _current: current_item)
        except RevisionConflict:
            err_conflict()
        emit_event(
            logging.INFO,
            "assessment.state_persisted",
            assessment_id=assessment_id,
            stage="analysis_persistence",
            outcome="succeeded",
        )
        current_item = deepcopy(updated)
        current_revision = updated["revision"]
        file_results.append({
            "filename": filename,
            "status": "succeeded",
            "upload_id": doc["source_id"],
            "extraction_status": "completed",
        })

    if file_results and any(r["status"] in {"succeeded", "duplicate"} for r in file_results):
        current_item["status"] = "REVIEW"
        current_item["updated_at"] = now()
        current_item["events"].append({"event": "BATCH_ANALYSIS_COMPLETED", "at": now()})
        try:
            updated = store.update(user["tenant_id"], assessment_id, current_revision, lambda _current: current_item)
        except RevisionConflict:
            err_conflict()
        current_item = deepcopy(updated)

    status = "completed" if all(r["status"] in {"succeeded", "duplicate"} for r in file_results) else (
        "failed" if not any(r["status"] in {"succeeded", "duplicate"} for r in file_results) else "partial_failure"
    )
    response = {"status": status, "files": file_results, "assessment": safe_item(current_item)}
    emit_event(
        logging.INFO if status == "completed" else logging.WARNING,
        "assessment.analysis_completed",
        assessment_id=assessment_id,
        stage="analysis",
        outcome=status,
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    if idempotency_key:
        IDEMPOTENCY_CACHE[key] = {"request_hash": request_hash, "response": response}
    return response


@app.post("/v1/assessments/{assessment_id}/uploads", status_code=201)
async def upload_evidence(assessment_id: str, file: UploadFile = File(...), user=Depends(require_permission("assessments:write"))):
    started = time.perf_counter()
    item = get_assessment(user["tenant_id"], assessment_id)
    if len(item["uploads"]) >= settings.max_files_per_assessment:
        raise HTTPException(429, detail={"code":"FILE_LIMIT", "message":"Maximum file count reached."})
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, detail={"code":"FILE_TOO_LARGE", "message":"Upload exceeds configured limit."})
    try:
        document = extract_file(file.filename or "upload", file.content_type or "application/octet-stream", data)
    except UnicodeDecodeError:
        emit_event(
            logging.WARNING,
            "evidence.processing_failed",
            assessment_id=assessment_id,
            stage="extraction",
            outcome="failed",
            error_code="INVALID_ENCODING",
        )
        raise HTTPException(422, detail={"code":"INVALID_ENCODING", "message":"CSV must be UTF-8 encoded."})
    except Exception as exc:
        emit_event(
            logging.WARNING,
            "evidence.processing_failed",
            assessment_id=assessment_id,
            stage="extraction",
            outcome="failed",
            error_code="INVALID_EVIDENCE",
        )
        raise HTTPException(422, detail={"code":"INVALID_EVIDENCE", "message":str(exc)})

    if hasattr(store, "save_source_blob"):
        store.save_source_blob(
            tenant_id=user["tenant_id"],
            assessment_id=assessment_id,
            source_id=document["source_id"],
            sha256=document["sha256"],
            filename=file.filename or "upload",
            kind=document["kind"],
            content=data,
        )
    else:
        folder = Path(settings.data_dir) / user["tenant_id"] / assessment_id / "sources"
        folder.mkdir(parents=True, exist_ok=True)
        suffix = Path(file.filename or 'upload').suffix.lower()
        (folder / f"{document['sha256']}{suffix}").write_bytes(data)

    provider_name = "gemini" if settings.gemini_api_key else "rules"
    extracted = extract_with_provider(
        document,
        provider_name,
        settings.gemini_api_key,
        settings.gemini_model,
        enquiry=item.get("goals"),
    )
    emit_event(
        logging.WARNING if extracted.get("status") == "provider_error" else logging.INFO,
        "evidence.extraction_completed",
        assessment_id=assessment_id,
        stage="provider_extraction",
        outcome=extracted.get("status", "unknown"),
        provider=extracted.get("provider", provider_name),
        error_code=extracted.get("error_code"),
    )

    upload_item = {
        "id": document["source_id"],
        "filename": file.filename,
        "kind": document["kind"],
        "sha256": document["sha256"],
        "size": len(data),
        "uploaded_at": now(),
        "scan_status": "not_scanned_local_only",
        "page_count": document.get("page_count"),
        "row_count": document.get("row_count"),
        "is_scanned": document.get("is_scanned", False),
    }

    def mutate(current):
        # Update or append upload entry
        current["uploads"] = [u for u in current.get("uploads", []) if u["id"] != document["source_id"]]
        current["uploads"].append(upload_item)

        # Update or append extraction queue entry
        extraction_entry = {"source_id": document["source_id"], **extracted}
        current["extraction"] = [e for e in current.get("extraction", []) if e["source_id"] != document["source_id"]]
        current["extraction"].append(extraction_entry)

        # Merge extracted candidate activities
        _merge_candidates_into_activities(
            current["activities"],
            extracted.get("activities", []),
            file.filename or "evidence",
            document["source_id"],
        )

        current["updated_at"] = now()
        current["status"] = "REVIEW"
        current["report_ready"] = False
        current["approved_revision"] = None
        current["events"].append({
            "event": "EVIDENCE_UPLOADED",
            "at": now(),
            "source_id": document["source_id"],
            "filename": file.filename,
        })

        if current.get("calculations"):
            current["calculations"] = calculate_assessment(
                current["activities"],
                assessment_currency=current.get("currency", "GBP"),
                uploads=current.get("uploads", []),
                extractions=current.get("extraction", []),
            )

        return current

    try:
        updated = store.update(user["tenant_id"], assessment_id, item["revision"], mutate)
    except RevisionConflict:
        err_conflict()
    emit_event(
        logging.INFO,
        "assessment.state_persisted",
        assessment_id=assessment_id,
        stage="upload_persistence",
        outcome="succeeded",
    )
    emit_event(
        logging.INFO,
        "evidence.upload_completed",
        assessment_id=assessment_id,
        stage="upload",
        outcome="succeeded",
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return {"assessment": safe_item(updated), "upload": upload_item, "extraction": extracted}

@app.get("/v1/assessments/{assessment_id}/sources/{source_id}")
def inspect_source(assessment_id: str, source_id: str, user=Depends(require_permission("assessments:read"))):
    item = get_assessment(user["tenant_id"], assessment_id)
    upload = next((u for u in item.get("uploads", []) if u.get("id") == source_id), None)
    if not upload:
        raise HTTPException(404, detail={"code": "SOURCE_NOT_FOUND", "message": "Evidence source was not found for this assessment."})

    data = None
    if hasattr(store, "get_source_blob"):
        data = store.get_source_blob(user["tenant_id"], assessment_id, upload["sha256"])
    if data is None:
        folder = Path(settings.data_dir) / user["tenant_id"] / assessment_id / "sources"
        suffix = ".pdf" if upload.get("kind") == "pdf" else ".csv"
        file_path = folder / f"{upload['sha256']}{suffix}"
        if not file_path.exists():
            raise HTTPException(404, detail={"code": "SOURCE_UNAVAILABLE", "message": "The original evidence file is not available for inspection."})
        data = file_path.read_bytes()
    response = {
        "assessment_id": assessment_id,
        "source_id": source_id,
        "filename": upload.get("filename"),
        "kind": upload.get("kind"),
        "sha256": upload.get("sha256"),
        "size": upload.get("size"),
        "source_type": upload.get("kind"),
    }

    if upload.get("kind") == "pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data), strict=False)
        pages = []
        for index, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            pages.append({"page_number": index, "text": text[:20000]})
        response["pages"] = pages
        response["source_references"] = [{"kind": "page", "page_number": page["page_number"], "available": bool(page["text"].strip())} for page in pages]
    else:
        try:
            csv_text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(422, detail={"code": "INVALID_ENCODING", "message": "CSV evidence is not UTF-8 encoded."})
        reader = csv.DictReader(io.StringIO(csv_text))
        rows = []
        for row_number, row in enumerate(reader, start=2):
            cleaned = {str(k).strip(): str(v or "").strip()[:2000] for k, v in row.items() if k is not None}
            rows.append({"row_number": row_number, "values": cleaned})
        response["rows"] = rows
        response["source_references"] = [{"kind": "row", "row_number": row["row_number"], "available": bool(row["values"])} for row in rows]

    return response

@app.post("/v1/assessments/{assessment_id}/reextract", status_code=200)
def reextract_assessment(assessment_id: str, user=Depends(require_permission("assessments:write"))):
    """Re-runs extraction across all uploaded sources for the assessment using current providers and fallback logic."""
    started = time.perf_counter()
    item = get_assessment(user["tenant_id"], assessment_id)
    folder = Path(settings.data_dir) / user["tenant_id"] / assessment_id / "sources"

    new_extractions = []
    for upload in item.get("uploads", []):
        sha = upload["sha256"]
        kind = upload.get("kind", "")
        data = None
        if hasattr(store, "get_source_blob"):
            data = store.get_source_blob(user["tenant_id"], assessment_id, sha)
        if data is None:
            suffix = ".pdf" if kind == "pdf" else ".csv"
            file_path = folder / f"{sha}{suffix}"
            if not file_path.exists():
                continue
            data = file_path.read_bytes()
        try:
            doc = extract_file(upload["filename"], "application/pdf" if kind == "pdf" else "text/csv", data)
            provider_name = "gemini" if settings.gemini_api_key else "rules"
            extracted = extract_with_provider(
                doc,
                provider_name,
                settings.gemini_api_key,
                settings.gemini_model,
                enquiry=item.get("goals"),
            )
            new_extractions.append({"source_id": upload["id"], **extracted, "filename": upload["filename"]})
        except Exception as exc:
            emit_event(
                logging.WARNING,
                "evidence.reextraction_failed",
                assessment_id=assessment_id,
                stage="reextraction",
                outcome="failed",
                error_code="REEXTRACT_FAILED",
            )
            new_extractions.append({
                "source_id": upload["id"],
                "provider": "gemini" if settings.gemini_api_key else "rules",
                "status": "manual_review_required",
                "error_code": "REEXTRACT_FAILED",
                "activities": [],
                "questions": [f"Re-extraction error: {str(exc)}"],
                "note": "Re-extraction could not process source file.",
            })

    def mutate(current):
        current["extraction"] = new_extractions
        for ext in new_extractions:
            _merge_candidates_into_activities(
                current["activities"],
                ext.get("activities", []),
                ext.get("filename", "evidence"),
                ext["source_id"],
            )
        current["updated_at"] = now()
        current["report_ready"] = False
        current["approved_revision"] = None
        current["events"].append({"event": "EVIDENCE_REEXTRACTED", "at": now()})
        if current.get("calculations"):
            current["calculations"] = calculate_assessment(
                current["activities"],
                assessment_currency=current.get("currency", "GBP"),
                uploads=current.get("uploads", []),
                extractions=current.get("extraction", []),
            )
        return current

    try:
        updated = store.update(user["tenant_id"], assessment_id, item["revision"], mutate)
    except RevisionConflict:
        err_conflict()
    emit_event(
        logging.INFO,
        "assessment.state_persisted",
        assessment_id=assessment_id,
        stage="reextraction_persistence",
        outcome="succeeded",
    )
    emit_event(
        logging.INFO,
        "assessment.reextraction_completed",
        assessment_id=assessment_id,
        stage="reextraction",
        outcome="succeeded",
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return safe_item(updated)

@app.patch("/v1/assessments/{assessment_id}/facts")
def patch_facts(assessment_id: str, payload: FactPatch, user=Depends(require_permission("assessments:write"))):
    item = get_assessment(user["tenant_id"], assessment_id)
    def mutate(current):
        by_id = {a["activity_id"]: a for a in current["activities"]}
        if payload.remove_activity_ids:
            remove_set = set(payload.remove_activity_ids)
            current["activities"] = [a for a in current["activities"] if a["activity_id"] not in remove_set]
            by_id = {a["activity_id"]: a for a in current["activities"]}
        if payload.add_activities:
            for new_act in payload.add_activities:
                act_dict = new_act.model_dump()
                act_dict["activity_id"] = str(uuid.uuid4())
                act_dict["provenance"] = act_dict.get("provenance") or {}
                current["activities"].append(act_dict)
                by_id[act_dict["activity_id"]] = act_dict
        for change in payload.changes:
            if change.activity_id not in by_id:
                raise HTTPException(422, detail={"code": "UNKNOWN_ACTIVITY", "message": f"Unknown activity id {change.activity_id}"})
            act = by_id[change.activity_id]
            for key, value in change.model_dump(exclude_unset=True, exclude={"activity_id"}).items():
                if key == "label" and (value is None or not str(value).strip()):
                    raise HTTPException(422, detail={"code": "INVALID_LABEL", "message": "Activity label cannot be empty."})
                if key == "confirmed" and value is True:
                    act["confirmed_at"] = now()
                    act["confirmed_by"] = user["user_id"]
                elif key == "rejected" and value is True:
                    act["rejected_at"] = now()
                    act["rejected_by"] = user["user_id"]
                    act["confirmed"] = False
                if value is not None:
                    act[key] = value

        from app.domain.validation import validate_activity
        for act in current["activities"]:
            val = validate_activity(act)
            act["is_valid"] = val["is_valid"]
            act["validation_status"] = val["validation_status"]
            act["validation_errors"] = val["errors"]
            act["validation_warnings"] = val["warnings"]
            act["is_calculation_eligible"] = val["is_calculation_eligible"]

        if payload.currency:
            current["currency"] = payload.currency.upper()

        current["updated_at"] = now()
        if payload.changes or payload.add_activities or payload.remove_activity_ids:
            current["calculations"] = None
            current["report_ready"] = False
            current["approved_revision"] = None
        elif current.get("calculations"):
            current["calculations"] = calculate_assessment(
                current["activities"],
                assessment_currency=current["currency"],
                uploads=current.get("uploads", []),
                extractions=current.get("extraction", []),
            )
            current["report_ready"] = False
            current["approved_revision"] = None
        current["status"] = "REVIEW"
        current["events"].append({"event": "FACTS_UPDATED", "at": now()})
        return current

    try:
        updated = store.update(user["tenant_id"], assessment_id, payload.expected_revision, mutate)
    except RevisionConflict:
        err_conflict()
    emit_event(
        logging.INFO,
        "assessment.state_persisted",
        assessment_id=assessment_id,
        stage="facts_persistence",
        outcome="succeeded",
    )
    return safe_item(updated)

@app.post("/v1/assessments/{assessment_id}/submit", status_code=202)
def submit(assessment_id: str, payload: SubmitRequest, user=Depends(require_permission("assessments:write"))):
    started = time.perf_counter()
    get_assessment(user["tenant_id"], assessment_id)
    def mutate(current):
        current["status"] = "RUNNING"
        current["report_ready"] = False
        current["approved_revision"] = None
        current["calculations"] = calculate_assessment(
            current["activities"],
            assessment_currency=current.get("currency", "GBP"),
            uploads=current.get("uploads", []),
            extractions=current.get("extraction", []),
        )
        has_unconfirmed = current["calculations"]["unconfirmed_activity_count"] > 0
        has_currency_mismatch = current["calculations"].get("currency_mismatch", False)
        has_invalid = current["calculations"].get("invalid_activity_count", 0) > 0
        current["status"] = "REVIEW" if (has_unconfirmed or has_currency_mismatch or has_invalid) else "COMPLETE"
        current["updated_at"] = now()
        current["events"].append({
            "event": "ANALYSIS_COMPLETED",
            "at": now(),
            "idempotency_key": f"analysis:{assessment_id}:{payload.expected_revision}",
        })
        return current

    try:
        updated = store.update(user["tenant_id"], assessment_id, payload.expected_revision, mutate)
    except RevisionConflict:
        err_conflict()
    emit_event(
        logging.INFO,
        "assessment.state_persisted",
        assessment_id=assessment_id,
        stage="submission_persistence",
        outcome="succeeded",
    )
    emit_event(
        logging.INFO,
        "assessment.submitted",
        assessment_id=assessment_id,
        stage="submission",
        outcome=updated["status"],
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return {
        "job_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"aod:{assessment_id}:{payload.expected_revision}")),
        "status": updated["status"],
        "assessment": safe_item(updated),
    }

@app.post("/v1/assessments/{assessment_id}/approve", status_code=202)
def approve(assessment_id: str, payload: ApproveRequest, user=Depends(require_permission("assessments:approve"))):
    started = time.perf_counter()
    item = get_assessment(user["tenant_id"], assessment_id)
    if not item.get("calculations"):
        raise HTTPException(409, detail={"code":"ANALYSIS_REQUIRED", "message":"Submit the assessment before approval."})
    if item["calculations"].get("invalid_activity_count", 0) > 0:
        issues = item["calculations"].get("data_quality_issues", [])
        issue_msgs = "; ".join([f"{iss.get('label') or 'Unnamed'}: {', '.join(iss.get('errors', []))}" for iss in issues if iss.get("errors")])
        raise HTTPException(422, detail={
            "code": "DATA_VALIDATION_ERRORS",
            "message": f"Resolve data quality errors before report approval: {issue_msgs}",
            "issues": issues,
        })
    if item["calculations"]["unconfirmed_activity_count"] > 0:
        raise HTTPException(422, detail={"code":"UNCONFIRMED_FACTS", "message":"Confirm or remove every activity before report approval."})
    if item["calculations"].get("calculation_eligible_activity_count", 0) == 0:
        raise HTTPException(422, detail={"code":"NO_ELIGIBLE_FACTS", "message":"At least one valid, confirmed and eligible activity is required before report approval."})
    if item["calculations"].get("currency_mismatch"):
        assumptions = payload.accepted_assumptions or {}
        if not assumptions.get("currency_mismatch_acknowledged"):
            raise HTTPException(422, detail={"code":"CURRENCY_MISMATCH_UNRESOLVED", "message":"Resolve the currency mismatch or acknowledge it explicitly before approval."})

    def mutate(current):
        current["accepted_assumptions"] = payload.accepted_assumptions
        current["reviewed_revision"] = payload.expected_revision
        current["status"] = "COMPLETE"
        current["report_ready"] = True
        current["approved_revision"] = current["revision"] + 1
        current["approved_at"] = now()
        current["approved_by"] = user["user_id"]
        if current.get("is_sandbox"):
            current["approved_as_sandbox"] = True
        current["updated_at"] = now()
        current["events"].append({"event":"REPORT_APPROVED", "at":now()})
        return current

    try:
        updated = store.update(user["tenant_id"], assessment_id, payload.expected_revision, mutate)
    except RevisionConflict:
        err_conflict()
    emit_event(
        logging.INFO,
        "assessment.state_persisted",
        assessment_id=assessment_id,
        stage="approval_persistence",
        outcome="succeeded",
    )
    emit_event(
        logging.INFO,
        "assessment.approved",
        assessment_id=assessment_id,
        stage="approval",
        outcome="succeeded",
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return {"status":"COMPLETE", "revision":updated["revision"], "approved_revision":updated["approved_revision"], "report_url":f"/v1/assessments/{assessment_id}/report"}

@app.get("/v1/assessments/{assessment_id}/report")
def report(assessment_id: str, user=Depends(require_permission("assessments:read"))):
    started = time.perf_counter()
    item = get_assessment(user["tenant_id"], assessment_id)
    if not item.get("report_ready") or item.get("approved_revision") != item.get("revision"):
        raise HTTPException(409, detail={"code":"REPORT_NOT_READY", "message":"Reviewer approval is required before report export."})
    is_sandbox = bool(item.get("is_sandbox"))
    prefix = "sandbox-diagnostic" if is_sandbox else "ai-operations-diagnostic"
    headers = {
        "Content-Disposition": f"attachment; filename={prefix}-{assessment_id[:8]}.pdf",
        "Cache-Control": "no-store",
    }
    if is_sandbox:
        headers["X-Sandbox-Environment"] = "true"
    report_bytes = render_report(item)
    emit_event(
        logging.INFO,
        "report.generated",
        assessment_id=assessment_id,
        stage="report_generation",
        outcome="succeeded",
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
    )
    return Response(
        content=report_bytes,
        media_type="application/pdf",
        headers=headers,
    )

@app.post("/v1/sandbox/reset")
def reset_sandbox(user=Depends(require_permission("sandbox:reset"))):
    tenant_id = user["tenant_id"]
    all_items = store.list(tenant_id)
    sandbox_items = [i for i in all_items if i.get("is_sandbox") is True]
    deleted_count = 0
    import shutil
    for s_item in sandbox_items:
        aid = s_item["id"]
        store.delete(tenant_id, aid)
        folder = Path(settings.data_dir) / tenant_id / aid
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)
        deleted_count += 1
    return {
        "status": "SUCCESS",
        "deleted_count": deleted_count,
        "message": f"Reset {deleted_count} sandbox assessments. Production assessments were not affected."
    }

@app.get("/v1/templates")
def templates(_user=Depends(identity)):
    return {
        "items": [
            {
                "id": "standard-process-v1",
                "name": "Standard operational process",
                "version": 1,
                "fields": ["label", "monthly_volume", "minutes_per_unit", "hourly_rate", "source_ids", "confirmed"],
            }
        ]
    }

@app.get("/v1/docs")
def list_stored_docs(_user=Depends(require_permission("assessments:read"))):
    if not hasattr(store, "list_docs"):
        return {"items": []}
    return {"items": store.list_docs()}

@app.get("/v1/docs/{doc_path:path}")
def get_stored_doc(doc_path: str, _user=Depends(require_permission("assessments:read"))):
    if not hasattr(store, "get_doc"):
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Document store is unavailable."})
    doc = store.get_doc(doc_path)
    if not doc:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Document not found in local database."})
    return doc
