import pytest
from app.domain.calculations import calculate_activity, calculate_assessment

def test_annual_hours_formula():
    row=calculate_activity({"label":"Invoice checks", "monthly_volume":100, "minutes_per_unit":6, "hourly_rate":30, "confirmed":True})
    assert row["annual_hours"] == "120.00"
    assert row["annual_effort_cost"] == "3600.00"
    assert row["capacity_hours_released"] == "24.00"
    assert row["capacity_value"] == "720.00"
    assert row["cash_savings"] is None

def test_only_confirmed_inputs_in_totals():
    result=calculate_assessment([{"label":"A", "monthly_volume":10, "minutes_per_unit":6, "hourly_rate":20, "confirmed":True},{"label":"B", "monthly_volume":1000, "minutes_per_unit":60, "hourly_rate":100, "confirmed":False}])
    assert result["confirmed_activity_count"] == 1
    assert result["unconfirmed_activity_count"] == 1
    assert result["annual_hours"] == "12.00"

def test_negative_values_rejected():
    with pytest.raises(ValueError): calculate_activity({"label":"A", "monthly_volume":-1, "minutes_per_unit":3})

def test_reduction_range_rejected():
    with pytest.raises(ValueError): calculate_activity({"label":"A", "monthly_volume":1, "minutes_per_unit":3, "achievable_reduction_pct":101})

def test_recommendations_are_hypotheses_and_require_confirmed_facts():
    result=calculate_assessment([{"label":"Routine validation", "monthly_volume":500, "minutes_per_unit":5, "hourly_rate":25, "confirmed":True, "source_ids":[]}])
    assert result["recommendations"]
    assert all(item["not_a_guarantee"] for item in result["recommendations"])
    assert any(item["evidence_gap"] for item in result["recommendations"])
