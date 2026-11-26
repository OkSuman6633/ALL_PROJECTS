from __future__ import annotations
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from .recommendations import build_recommendations

SCENARIOS = {
    "conservative": Decimal("0.10"),
    "base": Decimal("0.20"),
    "optimistic": Decimal("0.35"),
}

def _d(value: Any, field: str) -> Decimal:
    try:
        result = Decimal(str(value))
    except Exception as exc:
        raise ValueError(f"{field} must be numeric") from exc
    if not result.is_finite():
        raise ValueError(f"{field} must be finite")
    return result

def calculate_activity(activity: dict[str, Any]) -> dict[str, Any]:
    label = str(activity.get("label", "")).strip()
    if not label:
        raise ValueError("Activity label is required")

    raw_vol = activity.get("monthly_volume")
    raw_mins = activity.get("minutes_per_unit")
    raw_rate = activity.get("hourly_rate")

    is_confirmed = bool(activity.get("confirmed", False))
    if is_confirmed and (raw_vol is None or raw_mins is None):
        raise ValueError("Confirmed activity must have non-null monthly_volume and minutes_per_unit")

    vol_val = 0 if raw_vol is None else raw_vol
    mins_val = 0 if raw_mins is None else raw_mins
    rate_val = 0 if raw_rate is None else raw_rate

    monthly_volume = _d(vol_val, "monthly_volume")
    minutes = _d(mins_val, "minutes_per_unit")
    hourly_rate = _d(rate_val, "hourly_rate")
    reduction = _d(activity.get("achievable_reduction_pct", 20), "achievable_reduction_pct")

    if monthly_volume < 0 or minutes < 0 or hourly_rate < 0:
        raise ValueError("Volumes, duration and hourly rate cannot be negative")
    if reduction < 0 or reduction > 100:
        raise ValueError("achievable_reduction_pct must be between 0 and 100")

    annual_hours = monthly_volume * minutes * Decimal(12) / Decimal(60)
    annual_cost = annual_hours * hourly_rate
    saved_hours = annual_hours * reduction / Decimal(100)
    capacity_value = saved_hours * hourly_rate
    q = lambda x: str(x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    return {
        "activity_id": activity.get("activity_id"),
        "label": label,
        "monthly_volume": q(monthly_volume) if raw_vol is not None else None,
        "minutes_per_unit": q(minutes) if raw_mins is not None else None,
        "hourly_rate": q(hourly_rate) if raw_rate is not None else None,
        "annual_hours": q(annual_hours),
        "annual_effort_cost": q(annual_cost),
        "achievable_reduction_pct": q(reduction),
        "capacity_hours_released": q(saved_hours),
        "capacity_value": q(capacity_value),
        "cash_savings": None,
        "currency": str(activity.get("currency", "GBP")),
        "source_ids": activity.get("source_ids", []),
        "confirmed": is_confirmed,
        "rejected": bool(activity.get("rejected", False)),
        "provenance": activity.get("provenance"),
    }

def calculate_assessment(
    activities: list[dict[str, Any]],
    assessment_currency: str = "GBP",
    uploads: list[dict[str, Any]] | None = None,
    extractions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    from .validation import validate_activity
    rows: list[dict[str, Any]] = []
    for a in activities:
        val = validate_activity(a)
        if val["is_valid"]:
            try:
                row = calculate_activity(a)
                row["is_valid"] = True
                row["validation_status"] = "valid"
                row["validation_errors"] = []
                row["validation_warnings"] = val["warnings"]
                row["is_calculation_eligible"] = val["is_calculation_eligible"]
                row["rework_rate"] = a.get("rework_rate")
                row["error_rate"] = a.get("error_rate")
                rows.append(row)
            except ValueError as e:
                raw_vol = a.get("monthly_volume")
                raw_mins = a.get("minutes_per_unit")
                raw_rate = a.get("hourly_rate")
                rows.append({
                    "activity_id": a.get("activity_id"),
                    "label": a.get("label", ""),
                    "monthly_volume": str(raw_vol) if raw_vol is not None else None,
                    "minutes_per_unit": str(raw_mins) if raw_mins is not None else None,
                    "hourly_rate": str(raw_rate) if raw_rate is not None else None,
                    "currency": str(a.get("currency", "GBP")),
                    "annual_hours": "0.00",
                    "annual_effort_cost": "0.00",
                    "achievable_reduction_pct": str(a.get("achievable_reduction_pct", 20.0)),
                    "capacity_hours_released": "0.00",
                    "capacity_value": "0.00",
                    "cash_savings": None,
                    "source_ids": a.get("source_ids", []),
                    "confirmed": bool(a.get("confirmed", False)),
                    "rejected": bool(a.get("rejected", False)),
                    "provenance": a.get("provenance"),
                    "rework_rate": a.get("rework_rate"),
                    "error_rate": a.get("error_rate"),
                    "is_valid": False,
                    "validation_status": "invalid",
                    "validation_errors": [str(e)],
                    "validation_warnings": val["warnings"],
                    "is_calculation_eligible": False,
                })
        else:
            raw_vol = a.get("monthly_volume")
            raw_mins = a.get("minutes_per_unit")
            raw_rate = a.get("hourly_rate")
            rows.append({
                "activity_id": a.get("activity_id"),
                "label": a.get("label", ""),
                "monthly_volume": str(raw_vol) if raw_vol is not None else None,
                "minutes_per_unit": str(raw_mins) if raw_mins is not None else None,
                "hourly_rate": str(raw_rate) if raw_rate is not None else None,
                "currency": str(a.get("currency", "GBP")),
                "annual_hours": "0.00",
                "annual_effort_cost": "0.00",
                "achievable_reduction_pct": str(a.get("achievable_reduction_pct", 20.0)),
                "capacity_hours_released": "0.00",
                "capacity_value": "0.00",
                "cash_savings": None,
                "source_ids": a.get("source_ids", []),
                "confirmed": bool(a.get("confirmed", False)),
                "rejected": bool(a.get("rejected", False)),
                "provenance": a.get("provenance"),
                "rework_rate": a.get("rework_rate"),
                "error_rate": a.get("error_rate"),
                "is_valid": False,
                "validation_status": "invalid",
                "validation_errors": val["errors"],
                "validation_warnings": val["warnings"],
                "is_calculation_eligible": False,
            })

    confirmed = [r for r in rows if r["confirmed"] and not r.get("rejected")]
    unconfirmed = [r for r in rows if not r["confirmed"] and not r.get("rejected")]
    rejected = [r for r in rows if r.get("rejected")]
    calculation_eligible = [r for r in confirmed if r.get("is_valid", False)]
    invalid_confirmed = [r for r in confirmed if not r.get("is_valid", False)]
    invalid_activities = [r for r in rows if not r.get("is_valid", False)]

    confirmed_currencies = {r.get("currency") for r in calculation_eligible if r.get("currency")}
    if not confirmed_currencies:
        confirmed_currencies = {r.get("currency") for r in confirmed if r.get("currency")}
    currency_mismatch = False
    currency_mismatch_warning = None

    if len(confirmed_currencies) > 1:
        currency_mismatch = True
        curr_str = ", ".join(sorted(confirmed_currencies))
        currency_mismatch_warning = (
            f"Multiple currencies detected across confirmed activities ({curr_str}). "
            "Authoritative monetary calculations cannot combine multiple currencies without conversion."
        )
        calc_currency = "MIXED"
    elif len(confirmed_currencies) == 1:
        calc_currency = list(confirmed_currencies)[0]
        if assessment_currency and calc_currency != assessment_currency:
            currency_mismatch = True
            currency_mismatch_warning = (
                f"Currency mismatch: Confirmed activities specify {calc_currency}, "
                f"but assessment currency is {assessment_currency}. Please verify or standardize currency."
            )
    else:
        calc_currency = assessment_currency or "GBP"

    totals = {
        "annual_hours": sum((Decimal(r["annual_hours"]) for r in calculation_eligible), Decimal("0")),
        "annual_effort_cost": sum((Decimal(r["annual_effort_cost"]) for r in calculation_eligible), Decimal("0")),
    }

    scenarios = {}
    for name, pct in SCENARIOS.items():
        hours = totals["annual_hours"] * pct
        value = totals["annual_effort_cost"] * pct
        scenarios[name] = {
            "assumed_reduction_pct": str(pct * 100),
            "capacity_hours_released": str(hours.quantize(Decimal("0.01"))),
            "capacity_value": str(value.quantize(Decimal("0.01"))),
            "cash_savings": None,
        }

    recommendations = build_recommendations(
        rows,
        uploads=uploads,
        extractions=extractions,
        currency_mismatch=currency_mismatch,
        currency_mismatch_warning=currency_mismatch_warning,
    )

    return {
        "activities": rows,
        "confirmed_activity_count": len(confirmed),
        "unconfirmed_activity_count": len(unconfirmed),
        "rejected_activity_count": len(rejected),
        "calculation_eligible_activity_count": len(calculation_eligible),
        "invalid_activity_count": len(invalid_confirmed),
        "data_quality_issues": [
            {
                "activity_id": r.get("activity_id"),
                "label": r.get("label"),
                "errors": r.get("validation_errors", []),
                "warnings": r.get("validation_warnings", []),
            }
            for r in invalid_activities
        ],
        "annual_hours": str(totals["annual_hours"].quantize(Decimal("0.01"))),
        "annual_effort_cost": str(totals["annual_effort_cost"].quantize(Decimal("0.01"))),
        "scenarios": scenarios,
        "currency": calc_currency,
        "assessment_currency": assessment_currency,
        "currency_mismatch": currency_mismatch,
        "currency_mismatch_warning": currency_mismatch_warning,
        "recommendations": recommendations,
        "limitations": [
            "Capacity value is not realised cash savings.",
            "Only reviewer-confirmed inputs are included in totals.",
            "Scenarios are assumptions, not forecasts or guarantees.",
        ],
    }
