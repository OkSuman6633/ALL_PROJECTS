"""Deterministic in-memory evidence documents for tests.

`api/data/` is gitignored, so tests must never depend on sources that were
uploaded on a developer machine. These builders generate the SOP PDFs and CSV
metrics used by the extraction tests, so the suite behaves identically on a
clean checkout and in CI.
"""

from __future__ import annotations

from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

# Three order-processing steps. Labels match the CSV rows used in
# `test_cross_matching_pdf_steps_with_csv_rows_preserves_both_sources`.
SOP_ORDER_PROCESS_STEPS = [
    "Receive and validate order details.",
    "Check inventory availability.",
    "Prepare order confirmation.",
]

# Five supplier-invoice steps used by the candidate-identity criterion.
SOP_FIVE_STEPS = [
    "Receive inbound supplier invoice.",
    "Match invoice to purchase order.",
    "Confirm goods receipt.",
    "Route invoice for approval.",
    "Schedule supplier payment run.",
]

# Rows for an intentionally invalid metrics CSV: one valid row, one negative
# volume row and one row whose hourly rate is missing.
INVALID_METRICS_CSV_ROWS = [
    "Valid baseline row,100,2.0,25,USD",
    "Negative volume row,-10,2.0,25,USD",
    "Missing rate row,100,2.0,,USD",
]


def build_sop_pdf(
    steps: list[str],
    *,
    process_name: str = "Order Processing",
    currency: str = "USD",
    period: str = "A typical month.",
) -> bytes:
    """Render a text-based SOP PDF with numbered process steps.

    The layout mirrors the documents the rules provider expects: a header block
    with the process name, cost currency and measurement period, then a
    standalone step number followed by its description line.
    """
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setFont("Helvetica", 11)

    y = 800
    for line in (
        f"Standard Operating Procedure: {process_name}",
        f"Cost currency: {currency} for all activities.",
        f"Measurement period: {period}",
        "Process steps",
    ):
        pdf.drawString(60, y, line)
        y -= 20

    for number, step in enumerate(steps, start=1):
        pdf.drawString(60, y, str(number))
        y -= 16
        pdf.drawString(72, y, step)
        y -= 20

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def build_activity_csv(rows: list[str]) -> bytes:
    """Render a metrics CSV with the standard activity/volume/minutes/rate columns."""
    header = "activity,monthly_volume,avg_minutes_per_item,loaded_hourly_cost_usd,currency"
    return ("\n".join([header, *rows]) + "\n").encode("utf-8")
