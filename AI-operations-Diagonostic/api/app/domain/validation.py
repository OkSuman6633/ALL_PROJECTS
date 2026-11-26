from __future__ import annotations
import re
from typing import Any

GENERIC_PLACEHOLDER_LABELS = {
    "unknown activity",
    "unnamed activity",
    "unspecified",
    "untitled",
    "n/a",
    "na",
    "none",
    "null",
    "activity",
    "step",
}

def validate_activity(activity: dict[str, Any]) -> dict[str, Any]:
    """
    Server-side validation engine for operational activity facts.
    Ensures invalid or ungrounded data cannot enter authoritative calculations
    or bypass report approval gates.
    """
    errors: list[str] = []
    warnings: list[str] = []

    raw_label = activity.get("label")
    clean_label = str(raw_label).strip() if raw_label is not None else ""

    # 1. Label validation
    if not clean_label:
        errors.append("Activity name is required and cannot be blank.")
    elif clean_label.lower() in GENERIC_PLACEHOLDER_LABELS:
        errors.append(f"Activity name '{clean_label}' is a generic placeholder and requires a descriptive name.")

    # 2. Volume validation
    raw_vol = activity.get("monthly_volume")
    if raw_vol is None:
        errors.append("Monthly volume is missing (null); valid numeric volume required.")
    else:
        try:
            vol = float(raw_vol)
            if vol < 0:
                errors.append(f"Monthly volume cannot be negative (got {vol}).")
        except (ValueError, TypeError):
            errors.append(f"Monthly volume '{raw_vol}' is not a valid number.")

    # 3. Handling time validation
    raw_mins = activity.get("minutes_per_unit")
    if raw_mins is None:
        errors.append("Handling time (minutes per unit) is missing (null); valid numeric duration required.")
    else:
        try:
            mins = float(raw_mins)
            if mins < 0:
                errors.append(f"Handling time cannot be negative (got {mins}).")
            elif mins == 0:
                warnings.append("Zero handling time requires reviewer verification; verify if this step requires manual effort.")
        except (ValueError, TypeError):
            errors.append(f"Handling time '{raw_mins}' is not a valid number.")

    # 4. Hourly rate validation
    raw_rate = activity.get("hourly_rate")
    if raw_rate is None:
        errors.append("Hourly rate is missing (null); valid loaded hourly rate required.")
    else:
        try:
            rate = float(raw_rate)
            if rate < 0:
                errors.append(f"Hourly rate cannot be negative (got {rate}).")
        except (ValueError, TypeError):
            errors.append(f"Hourly rate '{raw_rate}' is not a valid number.")

    # 5. Rework rate validation (if present)
    raw_rework = activity.get("rework_rate")
    if raw_rework is not None and raw_rework != "":
        try:
            rework = float(raw_rework)
            if rework < 0.0 or rework > 1.0:
                errors.append(f"Rework rate must be between 0.0 and 1.0 (got {rework}).")
        except (ValueError, TypeError):
            errors.append(f"Rework rate '{raw_rework}' is not a valid number.")

    # 6. Error rate validation (if present)
    raw_err = activity.get("error_rate")
    if raw_err is not None and raw_err != "":
        try:
            err = float(raw_err)
            if err < 0.0 or err > 1.0:
                errors.append(f"Error rate must be between 0.0 and 1.0 (got {err}).")
        except (ValueError, TypeError):
            errors.append(f"Error rate '{raw_err}' is not a valid number.")

    # 7. Reduction percentage validation
    raw_red = activity.get("achievable_reduction_pct", 20.0)
    if raw_red is not None:
        try:
            red = float(raw_red)
            if red < 0 or red > 100:
                errors.append(f"Achievable reduction percentage must be between 0 and 100 (got {red}).")
        except (ValueError, TypeError):
            errors.append(f"Achievable reduction percentage '{raw_red}' is not a valid number.")

    # 8. Currency code validation
    raw_curr = activity.get("currency")
    if raw_curr:
        curr_str = str(raw_curr).strip().upper()
        if len(curr_str) != 3 or not curr_str.isalpha():
            errors.append(f"Currency code '{raw_curr}' must be a valid 3-letter currency code (e.g. USD, GBP).")

    is_valid = len(errors) == 0
    is_confirmed = bool(activity.get("confirmed", False))
    is_rejected = bool(activity.get("rejected", False))

    validation_status = "valid" if is_valid else "invalid"
    is_calculation_eligible = is_confirmed and not is_rejected and is_valid

    return {
        "is_valid": is_valid,
        "errors": errors,
        "warnings": warnings,
        "validation_status": validation_status,
        "is_calculation_eligible": is_calculation_eligible,
    }

