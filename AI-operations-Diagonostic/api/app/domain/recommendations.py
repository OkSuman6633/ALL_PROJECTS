from __future__ import annotations
from decimal import Decimal, InvalidOperation
from typing import Any


def _decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value if value is not None else "0"))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def build_recommendations(
    activities: list[dict[str, Any]],
    uploads: list[dict[str, Any]] | None = None,
    extractions: list[dict[str, Any]] | None = None,
    currency_mismatch: bool = False,
    currency_mismatch_warning: str | None = None,
) -> list[dict[str, Any]]:
    """Transparent heuristics: suggestions for human investigation, not autonomous decisions."""
    results: list[dict[str, Any]] = []

    if currency_mismatch:
        results.append({
            "id": "currency-mismatch",
            "activity": None,
            "priority": "data_quality",
            "title": "Resolve currency mismatch",
            "rationale": currency_mismatch_warning or "Mismatched currencies detected across confirmed activities or evidence. Verify and align currencies before relying on financial totals.",
            "evidence": ["currency"],
            "evidence_gap": False,
            "confidence": "deterministic-check",
            "not_a_guarantee": True,
        })

    confirmed_rows = [r for r in activities if r.get("confirmed") and not r.get("rejected")]
    has_confirmed = bool(confirmed_rows)
    has_uploads = bool(uploads and len(uploads) > 0)

    repeatable_rows: list[dict[str, Any]] = []
    effort_rows: list[dict[str, Any]] = []

    for row in confirmed_rows:
        hours = Decimal(str(row.get("annual_hours") or "0"))
        volume = Decimal(str(row.get("monthly_volume") or "0"))
        minutes = Decimal(str(row.get("minutes_per_unit") or "0"))

        if volume >= 250 and minutes <= 10:
            repeatable_rows.append(row)
        elif hours >= Decimal("120"):
            effort_rows.append(row)

    if len(repeatable_rows) > 1:
        labels = [r["label"] for r in repeatable_rows]
        has_any_source_gap = any(not (r.get("source_ids") and len(r.get("source_ids")) > 0) for r in repeatable_rows)
        results.append({
            "id": "repeatable-standardisation",
            "activity": f"{len(repeatable_rows)} activities",
            "priority": "investigate",
            "title": "Assess repetitive-step standardisation across high-volume activities",
            "rationale": f"High monthly volumes and short handling times confirmed across {len(repeatable_rows)} activities ({', '.join(labels)}). Evaluate standardized input templates, workflow orchestration, or batch processing across these steps.",
            "evidence": ["monthly_volume", "minutes_per_unit"],
            "evidence_gap": has_any_source_gap,
            "confidence": "heuristic",
            "not_a_guarantee": True,
        })
    elif len(repeatable_rows) == 1:
        row = repeatable_rows[0]
        has_valid_source = bool(row.get("source_ids") and len(row.get("source_ids")) > 0)
        results.append({
            "id": "repeatable-1",
            "activity": row["label"],
            "priority": "investigate",
            "title": "Assess repetitive-step standardisation",
            "rationale": "The confirmed input indicates a relatively high monthly volume and short handling time. Check whether a stable rule-based workflow, form validation or batch handling could reduce manual touches.",
            "evidence": ["monthly_volume", "minutes_per_unit"],
            "evidence_gap": not has_valid_source,
            "confidence": "heuristic",
            "not_a_guarantee": True,
        })

    if len(effort_rows) > 1:
        labels = [r["label"] for r in effort_rows]
        has_any_source_gap = any(not (r.get("source_ids") and len(r.get("source_ids")) > 0) for r in effort_rows)
        results.append({
            "id": "effort-investigation",
            "activity": f"{len(effort_rows)} activities",
            "priority": "investigate",
            "title": "Map handoffs and rework across high-effort activities",
            "rationale": f"Substantial annual effort confirmed across {len(effort_rows)} activities ({', '.join(labels)}), each exceeding 120 handling hours per year. Validate handoffs, wait times, and rework loops before choosing interventions.",
            "evidence": ["annual_hours"],
            "evidence_gap": has_any_source_gap,
            "confidence": "heuristic",
            "not_a_guarantee": True,
        })
    elif len(effort_rows) == 1:
        row = effort_rows[0]
        has_valid_source = bool(row.get("source_ids") and len(row.get("source_ids")) > 0)
        results.append({
            "id": "effort-1",
            "activity": row["label"],
            "priority": "investigate",
            "title": "Map handoffs and rework before automating",
            "rationale": "The confirmed estimate represents at least 120 handling hours per year. Validate where active work, waiting time and rework occur before selecting an intervention.",
            "evidence": ["monthly_volume", "minutes_per_unit"],
            "evidence_gap": not has_valid_source,
            "confidence": "heuristic",
            "not_a_guarantee": True,
        })

    if confirmed_rows and not currency_mismatch:
        costed: list[tuple[Decimal, dict[str, Any]]] = []
        for row in confirmed_rows:
            cost = _decimal(row.get("annual_effort_cost"))
            if cost <= 0:
                cost = (
                    _decimal(row.get("monthly_volume"))
                    * _decimal(row.get("minutes_per_unit"))
                    * Decimal("12")
                    / Decimal("60")
                    * _decimal(row.get("hourly_rate"))
                )
            if cost > 0:
                costed.append((cost, row))

        if costed:
            costed.sort(key=lambda pair: pair[0], reverse=True)
            total_cost = sum((cost for cost, _ in costed), Decimal("0"))
            top_cost, top_row = costed[0]
            top_label = str(top_row.get("label") or "the highest-cost activity")
            top_share = float(top_cost / total_cost * 100) if total_cost > 0 else 0.0
            top_sources = top_row.get("source_ids") or []
            results.append({
                "id": "cost-reduction-priority",
                "activity": top_label,
                "priority": "cost",
                "title": "Target cost reduction on the highest-cost confirmed activities",
                "rationale": (
                    f"{top_label} carries the largest annual effort cost in the confirmed baseline "
                    f"({top_share:.0f}% of total effort cost). To lower cost, shorten handling time on this step first, "
                    "remove rework and error loops that repeat the work, then re-check volume and hourly-rate assumptions "
                    "with the process owner. Focus on the top two or three activities by annual cost before broad changes."
                ),
                "evidence": ["annual_effort_cost", "annual_hours"],
                "evidence_gap": not bool(top_sources),
                "confidence": "heuristic",
                "not_a_guarantee": True,
            })

    for row in confirmed_rows:
        sources = row.get("source_ids") or []
        has_valid_source = bool(sources and len(sources) > 0)
        if not has_valid_source:
            if has_uploads:
                results.append({
                    "id": f"evidence-link-{len(results)+1}",
                    "activity": row["label"],
                    "priority": "data_quality",
                    "title": "Link activity to supporting evidence",
                    "rationale": "This confirmed activity has no linked source reference, although evidence files are uploaded. Associate this activity with its supporting evidence location (PDF page or CSV row) to verify provenance.",
                    "evidence": [],
                    "evidence_gap": True,
                    "confidence": "data-quality-rule",
                    "not_a_guarantee": True,
                })
            else:
                results.append({
                    "id": f"evidence-{len(results)+1}",
                    "activity": row["label"],
                    "priority": "data_quality",
                    "title": "Attach supporting evidence",
                    "rationale": "This confirmed value has no linked source reference. Record the source, sample size and measurement period so a reviewer can independently reproduce the baseline.",
                    "evidence": [],
                    "evidence_gap": True,
                    "confidence": "data-quality-rule",
                    "not_a_guarantee": True,
                })

    if not has_confirmed:
        unconfirmed_acts = [a for a in activities if not a.get("rejected")]
        if unconfirmed_acts:
            results.append({
                "id": "review-candidates",
                "activity": None,
                "priority": "data_quality",
                "title": "Review and confirm extracted candidate activities",
                "rationale": "Candidate operational activities have been extracted or entered but have not yet been confirmed by a reviewer. Review and confirm facts before generating authoritative totals.",
                "evidence": ["candidate_activities"],
                "evidence_gap": False,
                "confidence": "workflow-rule",
                "not_a_guarantee": True,
            })
        elif has_uploads:
            results.append({
                "id": "process-evidence",
                "activity": None,
                "priority": "data_quality",
                "title": "Process uploaded evidence",
                "rationale": "Evidence files are uploaded but have not produced candidate activities. Verify extraction or enter activity steps manually.",
                "evidence": ["uploads"],
                "evidence_gap": False,
                "confidence": "data-quality-rule",
                "not_a_guarantee": True,
            })
        else:
            results.append({
                "id": "baseline-first",
                "activity": None,
                "priority": "data_quality",
                "title": "Establish a confirmed baseline",
                "rationale": "No confirmed activity facts are available yet. Collect volume, active handling time, measurement period and source references before ranking improvement options.",
                "evidence": [],
                "evidence_gap": True,
                "confidence": "data-quality-rule",
                "not_a_guarantee": True,
            })

    return results
