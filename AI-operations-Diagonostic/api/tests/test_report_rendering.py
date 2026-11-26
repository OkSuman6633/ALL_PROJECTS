from io import BytesIO
import re

from pypdf import PdfReader

from app.domain.calculations import calculate_assessment
from app.services import report as report_service
from app.services.report import (
    CONTENT_W,
    _create_styles,
    render_report,
)


def _assessment(activities=None, *, is_sandbox=False, currency="GBP"):
    if activities is None:
        activities = [
        {
            "activity_id": "activity-1",
            "label": "Order validation",
            "monthly_volume": 500,
            "minutes_per_unit": 10,
            "hourly_rate": 30,
            "currency": currency,
            "confirmed": True,
            "source_ids": ["source-1234567890:row-2"],
        }
        ]
    calculations = calculate_assessment(activities, assessment_currency=currency)
    return {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "process_name": "Production Operational Audit",
        "sector": "Retail",
        "period": "Last 30 days",
        "unit": "cases",
        "currency": currency,
        "status": "COMPLETE",
        "revision": 6,
        "is_sandbox": is_sandbox,
        "activities": activities,
        "calculations": calculations,
    }


def _read_report(assessment):
    reader = PdfReader(BytesIO(render_report(assessment)))
    text = " ".join(
        " ".join((page.extract_text() or "").split()) for page in reader.pages
    )
    return reader, text.casefold()


def test_report_leads_with_metrics_and_distinguishes_capacity_from_profit():
    reader, text = _read_report(_assessment())

    assert len(reader.pages) >= 2
    assert "executive snapshot" in text
    assert "1 eligible activity represents" in text
    assert "annual labor cost" in text
    assert "gbp 30,000" in text
    assert "base scenario capacity" in text
    assert "200 hrs" in text
    assert "gbp 6,000" in text
    assert "illustrative capacity value" in text
    assert "unit economics" in text
    assert "annual eligible volume" in text
    assert "6,000 cases/year" in text
    assert "average handling time per unit" in text
    assert "10 min" in text
    assert "labor effort cost per unit" in text
    assert "gbp 5.00" in text
    assert "123e4567-e89b-12d3-a456-426614174000" not in text
    assert "assessment id" not in text
    assert "implementation cost" not in text
    assert "return on investment (roi)" not in text
    assert "payback period" not in text


def test_report_marks_missing_financial_values_not_available():
    reader, text = _read_report(_assessment(activities=[]))

    assert "not available" in text
    assert "gbp 0.00" not in text
    assert "annual eligible volume not available" in text
    assert "labor effort cost per unit not available" in text


def test_unit_economics_handles_zero_annual_volume_without_division_by_zero():
    activities = [
        {
            "activity_id": "activity-zero",
            "label": "No-volume activity",
            "monthly_volume": 0,
            "minutes_per_unit": 10,
            "hourly_rate": 30,
            "currency": "GBP",
            "confirmed": True,
        }
    ]

    _, text = _read_report(_assessment(activities))

    assert "annual eligible volume 0 cases/year" in text
    assert "average handling time per unit not available" in text
    assert "labor effort cost per unit not available" in text


def test_activity_register_uses_readable_structured_columns_and_evidence():
    _, text = _read_report(_assessment())

    for heading in (
        "monthly volume",
        "minutes per unit",
        "hourly rate",
        "annual hours",
        "annual labor cost",
    ):
        assert heading in text
    assert "evidence linked" in text
    assert "source-1234567890" not in text
    assert "verified" in text


def test_pdf_embeds_readable_font_and_uses_legible_body_and_table_sizes():
    reader, _ = _read_report(_assessment())
    embedded_font_names = set()
    for page in reader.pages:
        fonts = page["/Resources"].get("/Font", {})
        for font_ref in fonts.values():
            font = font_ref.get_object()
            descriptor_ref = font.get("/FontDescriptor")
            if descriptor_ref:
                descriptor = descriptor_ref.get_object()
                if descriptor.get("/FontFile2"):
                    embedded_font_names.add(str(font.get("/BaseFont", "")))
            for descendant_ref in font.get("/DescendantFonts", []):
                descendant = descendant_ref.get_object()
                descriptor = descendant.get("/FontDescriptor")
                if descriptor:
                    descriptor = descriptor.get_object()
                    if descriptor.get("/FontFile2"):
                        embedded_font_names.add(str(descendant.get("/BaseFont", "")))

    assert any("Vera" in name for name in embedded_font_names)
    styles = _create_styles()
    assert styles["Body"].fontSize >= 10
    assert styles["Cell"].fontSize >= 9


def test_kpi_cards_share_adaptive_height_and_keep_equal_visual_edges():
    reader, _ = _read_report(_assessment())
    content = reader.pages[0].get_contents().get_data().decode("latin1")
    card_width = (CONTENT_W - 9 * report_service.mm) / 4
    rectangles = re.findall(
        r"n [\d.]+ [\d.]+ ([\d.]+) -([\d.]+) re f\*",
        content,
    )
    card_heights = [
        float(height)
        for width, height in rectangles
        if abs(float(width) - card_width) < 0.1 and float(height) > 50
    ]

    assert len(card_heights) == 4
    assert max(card_heights) - min(card_heights) < 0.1


def test_long_activity_register_preserves_all_rows_across_pages():
    activities = [
        {
            "activity_id": f"activity-{index}",
            "label": f"Operational activity number {index:02d}",
            "monthly_volume": 100 + index,
            "minutes_per_unit": 5,
            "hourly_rate": 25,
            "currency": "GBP",
            "confirmed": True,
            "source_ids": [f"source-{index:02d}:row-{index + 2}"],
        }
        for index in range(35)
    ]

    reader, text = _read_report(_assessment(activities))

    assert len(reader.pages) >= 3
    for index in range(35):
        assert f"operational activity number {index:02d}" in text


def test_mixed_currencies_warn_and_hide_unconverted_money_totals():
    activities = [
        {
            "label": "GBP activity",
            "monthly_volume": 100,
            "minutes_per_unit": 5,
            "hourly_rate": 30,
            "currency": "GBP",
            "confirmed": True,
        },
        {
            "label": "USD activity",
            "monthly_volume": 100,
            "minutes_per_unit": 5,
            "hourly_rate": 30,
            "currency": "USD",
            "confirmed": True,
        },
    ]

    _, text = _read_report(_assessment(activities))

    assert "currency governance notice" in text
    assert "annual labor cost not available" in text
    assert "base capacity value not available" in text
    assert "labor effort cost per unit not available" in text
    assert "gbp 6,000" not in text


def test_sandbox_report_retains_sandbox_notice():
    _, text = _read_report(_assessment(is_sandbox=True))

    assert "test / sandbox environment report" in text
    assert "synthetic simulation data" in text


def test_activity_statuses_have_clear_labels_and_distinct_colors():
    assert callable(getattr(report_service, "_activity_status", None))

    assert report_service._activity_status(
        {"is_valid": True, "confirmed": True}
    ) == ("Verified", "#166534")
    assert report_service._activity_status(
        {"is_valid": True, "confirmed": False}
    ) == ("Pending", "#92400E")
    assert report_service._activity_status(
        {"is_valid": False, "confirmed": True}
    ) == ("Needs review", "#92400E")
    assert report_service._activity_status(
        {"is_valid": True, "rejected": True}
    ) == ("Rejected", "#B91C1C")
