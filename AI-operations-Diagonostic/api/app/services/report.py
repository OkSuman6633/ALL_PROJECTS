"""
AI Operations Diagnostic – Professional Executive PDF Report Generator

Features:
- ReportLab Platypus layout with NumberedCanvas for dynamic "Page X of Y"
- Rich corporate brand styling: Navy (#0F2438), Teal (#0D9488), Slate (#475569)
- Fully responsive table cells with Paragraph wrapping to prevent text collision or overflow
- Uniform cell padding, clean borders, alternating row backgrounds
- KPI cards with subtle styling
- Recommendation cards with left-accent bars and KeepTogether protection
- Header and footer on all pages with running titles and pagination
- Strict handling of long strings, source hashes, and special characters
"""

import datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    CondPageBreak,
    HRFlowable,
    KeepTogether,
    Paragraph,
    PageBreak,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── Brand Palette ──────────────────────────────────────────────────
NAVY = colors.HexColor("#0F2438")       # Deep primary navy
NAVY_LIGHT = colors.HexColor("#1A3A56") # Subtle navy
TEAL = colors.HexColor("#0D9488")       # Accent teal
TEAL_LIGHT = colors.HexColor("#E6FFFA") # Soft teal bg
SLATE_900 = colors.HexColor("#0F172A")  # Headings text
SLATE_700 = colors.HexColor("#334155")  # Body text
SLATE_500 = colors.HexColor("#64748B")  # Muted captions
SLATE_300 = colors.HexColor("#CBD5E1")  # Light borders
SLATE_100 = colors.HexColor("#F1F5F9")  # Subhead bg
SLATE_50 = colors.HexColor("#F8FAFC")   # Alternating row bg
AMBER_BG = colors.HexColor("#FFFBEB")   # Warning card bg
AMBER_BORDER = colors.HexColor("#F59E0B") # Warning card border
AMBER_TEXT = colors.HexColor("#92400E") # Warning text
SUCCESS_TEXT = colors.HexColor("#166534") # Green confirmed
WHITE = colors.white

# ── Geometry & Layout ──────────────────────────────────────────────
PAGE_W, PAGE_H = A4
LEFT_MARGIN = 16 * mm
RIGHT_MARGIN = 16 * mm
TOP_MARGIN = 24 * mm
BOTTOM_MARGIN = 20 * mm
CONTENT_W = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN  # 178 mm printable width
FONT_REGULAR = "AODVera"
FONT_BOLD = "AODVera-Bold"
FONT_ITALIC = "AODVera-Italic"
FONT_BOLD_ITALIC = "AODVera-BoldItalic"


def _register_fonts() -> None:
    font_dir = Path(reportlab.__file__).parent / "fonts"
    fonts = {
        FONT_REGULAR: "Vera.ttf",
        FONT_BOLD: "VeraBd.ttf",
        FONT_ITALIC: "VeraIt.ttf",
        FONT_BOLD_ITALIC: "VeraBI.ttf",
    }
    for name, filename in fonts.items():
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(font_dir / filename)))
    pdfmetrics.registerFontFamily(
        FONT_REGULAR,
        normal=FONT_REGULAR,
        bold=FONT_BOLD,
        italic=FONT_ITALIC,
        boldItalic=FONT_BOLD_ITALIC,
    )


_register_fonts()


def _safe(value) -> str:
    """Escapes strings for XML / Paragraph rendering."""
    if value is None:
        return "—"
    return escape(str(value))


def _format_number(val) -> str:
    """Formats numeric values with commas if applicable."""
    if val is None:
        return "—"
    try:
        f = float(val)
        if f.is_integer():
            return f"{int(f):,}"
        return f"{f:,.2f}"
    except (ValueError, TypeError):
        return _safe(val)


def _activity_status(activity: dict) -> tuple[str, str]:
    if activity.get("rejected"):
        return "Rejected", "#B91C1C"
    if not activity.get("is_valid", False):
        return "Needs review", "#92400E"
    if activity.get("confirmed"):
        return "Verified", "#166534"
    return "Pending", "#92400E"


# ── Numbered Canvas for "Page X of Y" and Running Header/Footer ───
class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas that collects all pages and stamps accurate
    running headers, footers, and 'Page X of Y' on every page.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self.doc_title = "AI Operations Diagnostic"
        self.process_name = ""
        self.is_sandbox = False

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def _draw_page_decorations(self, total_pages: int):
        self.saveState()

        # ── Running Top Header ──
        self.setFillColor(NAVY)
        self.rect(0, PAGE_H - 14 * mm, PAGE_W, 14 * mm, fill=True, stroke=False)

        # Teal accent stripe
        self.setFillColor(TEAL)
        self.rect(0, PAGE_H - 14.8 * mm, PAGE_W, 0.8 * mm, fill=True, stroke=False)

        # Header Title
        self.setFillColor(WHITE)
        self.setFont(FONT_BOLD, 9)
        self.drawString(LEFT_MARGIN, PAGE_H - 9.5 * mm, "AI OPERATIONS DIAGNOSTIC")

        self.setFont(FONT_REGULAR, 8.5)
        self.setFillColor(colors.HexColor("#94A3B8"))
        self.drawString(LEFT_MARGIN + 50 * mm, PAGE_H - 9.5 * mm, "|   EXECUTIVE ASSESSMENT")

        # Right-aligned process name
        display_name = self.process_name or "Operational Diagnostic"
        if len(display_name) > 42:
            display_name = display_name[:39] + "…"
        self.drawRightString(PAGE_W - RIGHT_MARGIN, PAGE_H - 9.5 * mm, display_name)

        # Sandbox pill if sandbox
        if self.is_sandbox:
            self.setFillColor(AMBER_BORDER)
            self.setFont(FONT_BOLD, 8)
            self.drawCentredString(PAGE_W / 2, PAGE_H - 9.5 * mm, "TEST / SANDBOX REPORT")

        # ── Running Footer ──
        footer_y = BOTTOM_MARGIN - 8 * mm
        self.setStrokeColor(SLATE_300)
        self.setLineWidth(0.4)
        self.line(LEFT_MARGIN, footer_y + 3 * mm, PAGE_W - RIGHT_MARGIN, footer_y + 3 * mm)

        self.setFont(FONT_REGULAR, 8)
        self.setFillColor(SLATE_500)
        self.drawString(
            LEFT_MARGIN,
            footer_y,
            "Confidential · AI Operations Diagnostic Platform · Operational Intelligence",
        )

        page_str = f"Page {self._pageNumber} of {total_pages}"
        self.drawRightString(PAGE_W - RIGHT_MARGIN, footer_y, page_str)

        self.restoreState()


# ── Stylesheet ─────────────────────────────────────────────────────
def _create_styles():
    base = getSampleStyleSheet()

    custom = {
        "SuperTitle": ParagraphStyle(
            "SuperTitle",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=9,
            leading=11,
            textColor=TEAL,
            textTransform="uppercase",
            spaceAfter=2,
        ),
        "MainTitle": ParagraphStyle(
            "MainTitle",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=21,
            leading=25,
            textColor=NAVY,
            spaceAfter=2,
        ),
        "MetaLine": ParagraphStyle(
            "MetaLine",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=9,
            leading=12,
            textColor=SLATE_500,
            spaceAfter=1.5,
        ),
        "SectionH1": ParagraphStyle(
            "SectionH1",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=13,
            leading=16,
            textColor=NAVY,
            spaceBefore=3.5 * mm,
            spaceAfter=2 * mm,
            keepWithNext=True,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=10.5,
            leading=14,
            textColor=SLATE_700,
            spaceAfter=1.5 * mm,
        ),
        "BodySmall": ParagraphStyle(
            "BodySmall",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=9,
            leading=11,
            textColor=SLATE_500,
        ),
        "WarningBody": ParagraphStyle(
            "WarningBody",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=10,
            leading=13,
            textColor=AMBER_TEXT,
        ),
        "ThDark": ParagraphStyle(
            "ThDark",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=9,
            leading=11,
            textColor=WHITE,
            alignment=TA_LEFT,
        ),
        "ThDarkRight": ParagraphStyle(
            "ThDarkRight",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=9,
            leading=11,
            textColor=WHITE,
            alignment=TA_RIGHT,
        ),
        "ThDarkCenter": ParagraphStyle(
            "ThDarkCenter",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=9,
            leading=11,
            textColor=WHITE,
            alignment=TA_CENTER,
        ),
        "Cell": ParagraphStyle(
            "Cell",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=9.5,
            leading=12,
            textColor=SLATE_700,
            alignment=TA_LEFT,
        ),
        "CellBold": ParagraphStyle(
            "CellBold",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=9.5,
            leading=12,
            textColor=SLATE_900,
            alignment=TA_LEFT,
        ),
        "CellRight": ParagraphStyle(
            "CellRight",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=9.5,
            leading=12,
            textColor=SLATE_700,
            alignment=TA_RIGHT,
        ),
        "CellCenter": ParagraphStyle(
            "CellCenter",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=9.5,
            leading=12,
            textColor=SLATE_700,
            alignment=TA_CENTER,
        ),
        "CellMono": ParagraphStyle(
            "CellMono",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=8.5,
            leading=10.5,
            textColor=SLATE_500,
            alignment=TA_LEFT,
        ),
        "KpiLabel": ParagraphStyle(
            "KpiLabel",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=8.5,
            leading=10,
            textColor=SLATE_500,
            textTransform="uppercase",
            alignment=TA_LEFT,
        ),
        "KpiValue": ParagraphStyle(
            "KpiValue",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=16,
            leading=19,
            textColor=NAVY,
            alignment=TA_LEFT,
        ),
        "KpiSub": ParagraphStyle(
            "KpiSub",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=8.5,
            leading=10,
            textColor=SLATE_500,
            alignment=TA_LEFT,
        ),
        "RecTitle": ParagraphStyle(
            "RecTitle",
            parent=base["Normal"],
            fontName=FONT_BOLD,
            fontSize=10.5,
            leading=13,
            textColor=NAVY,
            spaceAfter=1,
        ),
        "RecBody": ParagraphStyle(
            "RecBody",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=9.5,
            leading=12,
            textColor=SLATE_700,
        ),
        "BulletText": ParagraphStyle(
            "BulletText",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=9.5,
            leading=12,
            textColor=SLATE_700,
            leftIndent=3 * mm,
            firstLineIndent=-3 * mm,
            spaceAfter=1 * mm,
        ),
        "DisclaimerText": ParagraphStyle(
            "DisclaimerText",
            parent=base["Normal"],
            fontName=FONT_REGULAR,
            fontSize=8.5,
            leading=10,
            textColor=SLATE_500,
            spaceAfter=1 * mm,
        ),
    }

    for name, st in custom.items():
        base.add(st)
    return base


# ── Components ─────────────────────────────────────────────────────
def _render_kpi_card(title: str, value: str, subtitle: str, width: float, styles) -> Table:
    """Creates a high-polish KPI metric card."""
    content = [
        [Paragraph(title, styles["KpiLabel"])],
        [Spacer(1, 0.8 * mm)],
        [Paragraph(value, styles["KpiValue"])],
        [Spacer(1, 0.4 * mm)],
        [Paragraph(subtitle, styles["KpiSub"])],
    ]
    t = Table(content, colWidths=[width])
    t.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def _build_kpi_strip(cards: list[Table], card_width: float) -> Table:
    gap = 3 * mm
    row = []
    column_widths = []
    card_columns = []
    for index, card in enumerate(cards):
        column = len(row)
        row.append(card)
        column_widths.append(card_width)
        card_columns.append(column)
        if index < len(cards) - 1:
            row.append("")
            column_widths.append(gap)

    strip = Table([row], colWidths=column_widths)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]
    for column in card_columns:
        style.extend([
            ("BACKGROUND", (column, 0), (column, 0), SLATE_50),
            ("BOX", (column, 0), (column, 0), 0.5, SLATE_300),
            ("LINEBEFORE", (column, 0), (column, 0), 2.5, TEAL),
        ])
    strip.setStyle(TableStyle(style))
    return strip


def _build_styled_table(data, col_widths, *, is_alt_rows=True, pad_v=4.0, pad_h=5.0) -> Table:
    """Builds a table with deep navy header, thin borders, and alternating rows."""
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("LINEBELOW", (0, 0), (-1, 0), 1.2, TEAL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), pad_v),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad_v),
        ("LEFTPADDING", (0, 0), (-1, -1), pad_h),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad_h),
        ("GRID", (0, 0), (-1, -1), 0.4, SLATE_300),
    ]
    if is_alt_rows and len(data) > 2:
        for idx in range(2, len(data), 2):
            style.append(("BACKGROUND", (0, idx), (-1, idx), SLATE_50))

    t.setStyle(TableStyle(style))
    return t


# ── Report Renderer ────────────────────────────────────────────────
def render_report(assessment: dict) -> bytes:
    """
    Renders an executive-ready A4 PDF report for an assessment.
    Returns the generated PDF as raw bytes.
    """
    buf = BytesIO()
    styles = _create_styles()

    process_name = assessment.get("process_name", "Operational Assessment")
    is_sandbox = bool(assessment.get("is_sandbox"))
    calc = assessment.get("calculations") or {}
    currency = calc.get("currency", assessment.get("currency", "GBP"))

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN,
        bottomMargin=BOTTOM_MARGIN,
        title=f"AI Operations Diagnostic - {process_name}",
        author="AI Operations Diagnostic Platform",
    )

    story = []

    # ──────────────────────────────────────────────────────────────
    # HEADER / TITLE BLOCK
    # ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1 * mm))

    # Optional Sandbox Banner
    if is_sandbox:
        sandbox_card = Table([[
            Paragraph(
                "<b>⚠ TEST / SANDBOX ENVIRONMENT REPORT</b> — "
                "This report was generated using synthetic simulation data in an isolated testing sandbox. "
                "Calculations and findings are for testing verification only and are not authoritative operational facts.",
                styles["WarningBody"],
            )
        ]], colWidths=[CONTENT_W])
        sandbox_card.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), AMBER_BG),
            ("BOX", (0, 0), (-1, -1), 0.7, AMBER_BORDER),
            ("LINEBEFORE", (0, 0), (0, -1), 3.0, AMBER_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 4.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(sandbox_card)
        story.append(Spacer(1, 2.5 * mm))

    # Supertitle & Main Title
    story.append(Paragraph("Operational Intelligence &amp; Capacity Diagnostic", styles["SuperTitle"]))
    story.append(Paragraph(_safe(process_name), styles["MainTitle"]))

    # Metadata badges / line
    sector = assessment.get("sector") or "General Operations"
    period = assessment.get("period") or "Current Cycle"
    unit = assessment.get("unit") or "Operations Team"
    status = assessment.get("status", "COMPLETE")

    meta_text = (
        f"<b>{_safe(sector)}</b> &nbsp;·&nbsp; {_safe(period)} &nbsp;·&nbsp; "
        f"{_safe(unit)} &nbsp;·&nbsp; Currency: <b>{_safe(currency)}</b>"
    )
    story.append(Paragraph(meta_text, styles["MetaLine"]))

    sub_meta = f"Status: {_safe(status)}"
    story.append(Paragraph(sub_meta, styles["MetaLine"]))

    # Accent divider
    story.append(Spacer(1, 1 * mm))
    story.append(HRFlowable(width="100%", thickness=1.0, color=TEAL, spaceBefore=0, spaceAfter=2.5 * mm))

    # ──────────────────────────────────────────────────────────────
    # USER ENQUIRY
    # ──────────────────────────────────────────────────────────────
    enquiry = str(assessment.get("goals") or "").strip()
    if enquiry:
        enquiry_card = Table(
            [[Paragraph(f"<b>Your enquiry:</b> {_safe(enquiry)}", styles["Body"])]],
            colWidths=[CONTENT_W],
        )
        enquiry_card.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), SLATE_50),
            ("BOX", (0, 0), (-1, -1), 0.5, SLATE_300),
            ("LINEBEFORE", (0, 0), (0, -1), 3.0, TEAL),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(enquiry_card)
        story.append(Spacer(1, 3 * mm))

    # ──────────────────────────────────────────────────────────────
    # EXECUTIVE SNAPSHOT
    # ──────────────────────────────────────────────────────────────
    story.append(Paragraph("Executive snapshot", styles["SectionH1"]))
    confirmed_count = calc.get("confirmed_activity_count", 0)
    eligible_count = calc.get("calculation_eligible_activity_count", 0)
    unconfirmed_count = calc.get("unconfirmed_activity_count", 0)
    calculated_activities = calc.get("activities", [])
    eligible_monthly_volume = sum(
        float(activity.get("monthly_volume") or 0)
        for activity in calculated_activities
        if activity.get("is_calculation_eligible")
    )
    annual_volume = eligible_monthly_volume * 12
    annual_hours = calc.get("annual_hours")
    annual_cost = calc.get("annual_effort_cost")
    scenarios = calc.get("scenarios") or {}
    base_scenario = scenarios.get("base") or {}
    has_baseline = eligible_count > 0
    has_single_currency = not calc.get("currency_mismatch", False)
    hours_display = f"{_format_number(annual_hours)} hrs" if has_baseline else "Not available"
    cost_display = (
        f"{currency} {_format_number(annual_cost)}"
        if has_baseline and has_single_currency
        else "Not available"
    )
    base_hours_display = (
        f"{_format_number(base_scenario.get('capacity_hours_released'))} hrs"
        if has_baseline
        else "Not available"
    )
    base_value_display = (
        f"{currency} {_format_number(base_scenario.get('capacity_value'))}"
        if has_baseline and has_single_currency
        else "Not available"
    )
    if has_baseline:
        activity_label = "activity" if eligible_count == 1 else "activities"
        verb = "represents" if eligible_count == 1 else "represent"
        finding = (
            f"<b>Verified baseline:</b> {eligible_count} eligible {activity_label} {verb} "
            f"{hours_display} of annual handling time at {cost_display} annual labour cost."
        )
    else:
        finding = "<b>Baseline unavailable:</b> no eligible, confirmed activity data was provided."
    story.append(Paragraph(finding, styles["Body"]))

    # Currency Notice Alert if currency mismatch exists
    if calc.get("currency_mismatch"):
        mismatch_msg = calc.get(
            "currency_mismatch_warning",
            "Multiple currencies were detected. Monetary totals and scenario values cannot be combined without conversion."
        )
        warn_table = Table([[
            Paragraph(f"<b>Currency Governance Notice:</b> {_safe(mismatch_msg)}", styles["WarningBody"])
        ]], colWidths=[CONTENT_W])
        warn_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), AMBER_BG),
            ("BOX", (0, 0), (-1, -1), 0.6, AMBER_BORDER),
            ("LINEBEFORE", (0, 0), (0, -1), 2.5, AMBER_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ]))
        story.append(warn_table)
        story.append(Spacer(1, 1.5 * mm))

    # ──────────────────────────────────────────────────────────────
    # VERIFIED BASELINE METRICS
    # ──────────────────────────────────────────────────────────────
    card_w = (CONTENT_W - 9 * mm) / 4
    cards = [
        _render_kpi_card("Annual handling hours", hours_display, "Verified baseline", card_w, styles),
        _render_kpi_card("Annual labor cost", cost_display, "Verified baseline", card_w, styles),
        _render_kpi_card("Base scenario capacity", base_hours_display, "Hours released", card_w, styles),
        _render_kpi_card("Base capacity value", base_value_display, "Not cash savings", card_w, styles),
    ]
    kpi_strip = _build_kpi_strip(cards, card_w)
    story.append(kpi_strip)
    story.append(Spacer(1, 4 * mm))

    # ──────────────────────────────────────────────────────────────
    # SCENARIO COMPARISON
    # ──────────────────────────────────────────────────────────────
    story.append(Paragraph("Capacity-release scenarios", styles["SectionH1"]))
    sc_data = [
        [
            Paragraph("Scenario", styles["ThDark"]),
            Paragraph("Assumed change", styles["ThDarkCenter"]),
            Paragraph("Hours released / year", styles["ThDarkRight"]),
            Paragraph("Illustrative capacity value", styles["ThDarkRight"]),
        ]
    ]

    for key in ["conservative", "base", "optimistic"]:
        item = scenarios.get(key)
        if item:
            red_pct = item.get("assumed_reduction_pct", "—")
            hours = (
                f"{_format_number(item.get('capacity_hours_released'))} hrs"
                if has_baseline
                else "Not available"
            )
            val = (
                f"{currency} {_format_number(item.get('capacity_value'))}"
                if has_baseline and has_single_currency
                else "Not available"
            )
            sc_data.append([
                Paragraph(f"<b>{key.title()}</b>", styles["CellBold"]),
                Paragraph(f"{red_pct}%", styles["CellCenter"]),
                Paragraph(hours, styles["CellRight"]),
                Paragraph(val, styles["CellRight"]),
            ])

    if len(sc_data) == 1:
        for name, item in scenarios.items():
            sc_data.append([
                Paragraph(f"<b>{name.title()}</b>", styles["CellBold"]),
                Paragraph(f"{item.get('assumed_reduction_pct', '—')}%", styles["CellCenter"]),
                Paragraph(
                    f"{_format_number(item.get('capacity_hours_released'))} hrs"
                    if has_baseline else "Not available",
                    styles["CellRight"],
                ),
                Paragraph(
                    f"{currency} {_format_number(item.get('capacity_value'))}"
                    if has_baseline and has_single_currency else "Not available",
                    styles["CellRight"],
                ),
            ])

    if len(sc_data) > 1:
        widths = [30 * mm, 34 * mm, 50 * mm, CONTENT_W - 114 * mm]
        story.append(_build_styled_table(sc_data, widths, pad_v=6, pad_h=6))
    else:
        story.append(Paragraph("Scenario values are not available.", styles["BodySmall"]))

    annual_volume_display = (
        f"{_format_number(annual_volume)} {_safe(unit)}/year"
        if has_baseline
        else "Not available"
    )
    handling_time_display = (
        f"{_format_number(float(annual_hours) * 60 / annual_volume)} min"
        if has_baseline and annual_volume > 0 and annual_hours is not None
        else "Not available"
    )
    unit_cost_display = (
        f"{currency} {float(annual_cost) / annual_volume:,.2f}"
        if (
            has_baseline
            and has_single_currency
            and annual_volume > 0
            and annual_cost is not None
        )
        else "Not available"
    )
    story.append(Paragraph("Unit economics", styles["SectionH1"]))
    unit_economics_data = [
        [
            Paragraph("Metric", styles["ThDark"]),
            Paragraph("Calculated value", styles["ThDark"]),
        ],
        [
            Paragraph("Annual eligible volume", styles["CellBold"]),
            Paragraph(annual_volume_display, styles["Cell"]),
        ],
        [
            Paragraph("Average handling time per unit", styles["CellBold"]),
            Paragraph(handling_time_display, styles["Cell"]),
        ],
        [
            Paragraph("Labor effort cost per unit", styles["CellBold"]),
            Paragraph(unit_cost_display, styles["Cell"]),
        ],
    ]
    story.append(_build_styled_table(
        unit_economics_data,
        [CONTENT_W * 0.58, CONTENT_W * 0.42],
        pad_v=4,
        pad_h=6,
    ))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        f"{eligible_count} eligible · {confirmed_count} confirmed · {unconfirmed_count} unconfirmed excluded",
        styles["MetaLine"],
    ))
    story.append(PageBreak())

    # ──────────────────────────────────────────────────────────────
    # ACTIVITY AND EVIDENCE REGISTER
    # ──────────────────────────────────────────────────────────────
    story.append(Paragraph("Activity and evidence register", styles["SectionH1"]))

    activities = calc.get("activities", [])
    act_data = [
        [
            Paragraph("Activity / status", styles["ThDark"]),
            Paragraph("Monthly volume", styles["ThDarkRight"]),
            Paragraph("Minutes per unit", styles["ThDarkRight"]),
            Paragraph("Hourly rate", styles["ThDarkRight"]),
            Paragraph("Annual hours", styles["ThDarkRight"]),
            Paragraph("Annual labor cost", styles["ThDarkRight"]),
        ]
    ]

    for a in activities:
        act_currency = a.get("currency", currency)
        src_ids = a.get("source_ids", [])
        evidence_status = "Evidence linked" if src_ids else "No linked evidence"
        label = a.get("label") or "Unnamed Step"

        vol = _format_number(a.get("monthly_volume"))
        mins = _format_number(a.get("minutes_per_unit"))
        rate = f"{act_currency} {_format_number(a.get('hourly_rate'))}" if a.get("hourly_rate") is not None else "—"
        annual_h = f"{_format_number(a.get('annual_hours'))} h" if a.get("annual_hours") is not None else "—"
        annual_c = f"{act_currency} {_format_number(a.get('annual_effort_cost'))}" if a.get("annual_effort_cost") is not None else "—"
        activity_status, status_color = _activity_status(a)
        activity_cell = (
            f"<b>{_safe(label)}</b><br/>"
            f"<font color='#64748B' size='8.5'>{evidence_status}</font><br/>"
            f"<font color='{status_color}' size='8.5'><b>{activity_status}</b></font>"
        )

        act_data.append([
            Paragraph(activity_cell, styles["Cell"]),
            Paragraph(vol, styles["CellRight"]),
            Paragraph(mins, styles["CellRight"]),
            Paragraph(rate, styles["CellRight"]),
            Paragraph(annual_h, styles["CellRight"]),
            Paragraph(annual_c, styles["CellRight"]),
        ])

    if len(act_data) == 1:
        act_data.append([
            Paragraph("No activities recorded", styles["CellBold"]),
            Paragraph("—", styles["CellRight"]),
            Paragraph("—", styles["CellRight"]),
            Paragraph("—", styles["CellRight"]),
            Paragraph("—", styles["CellRight"]),
            Paragraph("—", styles["CellRight"]),
        ])

    act_col_widths = [51 * mm, 24 * mm, 24 * mm, 25 * mm, 24 * mm, 30 * mm]
    story.append(_build_styled_table(act_data, act_col_widths, pad_v=7, pad_h=5))
    story.append(Spacer(1, 3.5 * mm))

    # ──────────────────────────────────────────────────────────────
    # COST REDUCTION PRIORITIES
    # ──────────────────────────────────────────────────────────────
    cost_priorities = [
        rec for rec in calc.get("recommendations", []) if rec.get("priority") == "cost"
    ]
    if cost_priorities and has_single_currency:
        story.append(Paragraph("Cost reduction priorities", styles["SectionH1"]))
        story.append(Paragraph(
            "Where effort cost is concentrated in the confirmed baseline. Validate volumes, handling time "
            "and hourly rates with the process owner before acting on these priorities.",
            styles["BodySmall"],
        ))
        for rec in cost_priorities:
            story.append(Paragraph(
                f"• &nbsp;<b>{_safe(rec.get('activity') or 'Overall baseline')}</b>",
                styles["BulletText"],
            ))
            story.append(Paragraph(_safe(rec.get("rationale", "")), styles["BodySmall"]))
        story.append(Spacer(1, 3 * mm))

    # ──────────────────────────────────────────────────────────────
    # RECOMMENDED NEXT ACTIONS
    # ──────────────────────────────────────────────────────────────
    story.append(Paragraph("Recommended next actions", styles["SectionH1"]))

    recommendations = calc.get("recommendations", [])
    if recommendations:
        for idx, rec in enumerate(recommendations, 1):
            title = rec.get("title", f"Recommendation {idx}")
            activity_ref = rec.get("activity") or "Overall baseline"
            rationale = rec.get("rationale", "")

            rec_card = Table(
                [
                    [
                        Paragraph("Action", styles["CellBold"]),
                        Paragraph(f"<b>{idx}. {_safe(title)}</b>", styles["RecTitle"]),
                    ],
                    [
                        Paragraph("Scope", styles["CellBold"]),
                        Paragraph(_safe(activity_ref), styles["RecBody"]),
                    ],
                    [
                        Paragraph("Why", styles["CellBold"]),
                        Paragraph(_safe(rationale), styles["RecBody"]),
                    ],
                ],
                colWidths=[25 * mm, CONTENT_W - 25 * mm],
            )
            rec_card.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), SLATE_50),
                ("BOX", (0, 0), (-1, -1), 0.5, SLATE_300),
                ("LINEBEFORE", (0, 0), (0, -1), 2.5, TEAL),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(KeepTogether([rec_card, Spacer(1, 2 * mm)]))
    else:
        story.append(Paragraph("No recommendations recorded.", styles["BodySmall"]))

    story.append(Spacer(1, 2 * mm))

    # ──────────────────────────────────────────────────────────────
    # ASSUMPTIONS AND PROVENANCE
    # ──────────────────────────────────────────────────────────────
    story.append(Paragraph("Assumptions and provenance", styles["SectionH1"]))

    limitations = calc.get("limitations", [])
    for note in limitations:
        if "capacity value is not" not in note.casefold():
            story.append(Paragraph(f"• &nbsp;{_safe(note)}", styles["BulletText"]))

    story.append(Spacer(1, 1.5 * mm))
    story.append(HRFlowable(width="100%", thickness=0.4, color=SLATE_300, spaceBefore=1 * mm, spaceAfter=2 * mm))
    story.append(Paragraph(
        "Capacity value is a planning estimate for released labor time, not realized cash savings.",
        styles["DisclaimerText"],
    ))
    story.append(Paragraph(
        f"<b>Provenance:</b> Report generated by AI Operations Diagnostic Engine &nbsp;·&nbsp; "
        f"UTC Timestamp: {datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        styles["DisclaimerText"],
    ))

    # ── Canvas Builder with NumberedCanvas ─────────────────────────
    def _canvas_factory(*args, **kwargs):
        c = NumberedCanvas(*args, **kwargs)
        c.process_name = process_name
        c.is_sandbox = is_sandbox
        return c

    doc.build(story, canvasmaker=_canvas_factory)
    return buf.getvalue()
