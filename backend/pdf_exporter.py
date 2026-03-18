"""PDF export for web backend (ReportLab only)."""
from __future__ import annotations

from datetime import datetime
import unicodedata
from typing import List, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import cm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from course_scheduler.models.course import Course
from course_scheduler.utils.time_utils import to_minutes

PALETTE = [
    "#4E79A7",
    "#59A14F",
    "#F28E2B",
    "#E15759",
    "#76B7B2",
    "#EDC948",
    "#B07AA1",
    "#FF9DA7",
    "#9C755F",
    "#BAB0AC",
]

DAY_ORDER = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def _wrap_text(text_value: str, font_name: str, font_size: int, max_width: float) -> list[str]:
    words = str(text_value).split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = current + " " + word
        if stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines




def _normalize_day(day_value: str) -> str:
    value = str(day_value or "").strip()
    if not value:
        return ""
    lowered = value.casefold()
    normalized = unicodedata.normalize("NFD", lowered)
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    normalized = "".join(ch for ch in normalized if ch.isalpha())

    mapping = {
        "lunes": "Lunes",
        "martes": "Martes",
        "miercoles": "Miércoles",
        "jueves": "Jueves",
        "viernes": "Viernes",
        "sabado": "Sábado",
        "domingo": "Domingo",
        "l": "Lunes",
        "m": "Martes",
        "x": "Miércoles",
        "j": "Jueves",
        "v": "Viernes",
        "s": "Sábado",
        "d": "Domingo",
    }
    if normalized in mapping:
        return mapping[normalized]
    if normalized.startswith("mi"):
        return "Miércoles"
    if normalized.startswith("sa"):
        return "Sábado"
    if normalized.startswith("do"):
        return "Domingo"
    if normalized.startswith("lu"):
        return "Lunes"
    if normalized.startswith("ma"):
        return "Martes"
    if normalized.startswith("ju"):
        return "Jueves"
    if normalized.startswith("vi"):
        return "Viernes"
    return value


def _course_color(course_key: str) -> colors.Color:
    idx = abs(hash(course_key)) % len(PALETTE)
    return colors.HexColor(PALETTE[idx])


def _time_bounds(_: List[Course]) -> Tuple[int, int]:
    return 7 * 60, 24 * 60


def _draw_calendar(c: canvas.Canvas, x: float, y: float, w: float, h: float, courses: List[Course]) -> None:
    start_min, end_min = _time_bounds(courses)
    hours = list(range(start_min, end_min + 1, 60))
    label_hours = hours[:-1]
    rows = len(label_hours) + 1
    col_w = w / 7.0
    row_h = h / rows
    y_top = y + h

    c.setStrokeColor(colors.lightgrey)
    for i in range(8):
        c.line(x + i * col_w, y, x + i * col_w, y_top)
    for i in range(rows + 1):
        c.line(x, y_top - i * row_h, x + w, y_top - i * row_h)

    c.setFillColor(colors.black)
    c.drawRightString(x - 4, y_top + 4, "Hora")
    for i, day in enumerate(["L", "M", "X", "J", "V", "S", "D"]):
        c.drawCentredString(x + i * col_w + col_w / 2, y_top + 4, day)

    c.setFont("Helvetica", 8)
    for i, hour in enumerate(label_hours):
        c.drawRightString(x - 4, y_top - (i + 1) * row_h + 2, f"{hour//60:02d}:00")

    for course in courses:
        key = course.course_key() or course.name
        color = _course_color(key)
        for s in course.schedules:
            day = _normalize_day(s.day)
            if day not in DAY_ORDER:
                continue
            day_idx = DAY_ORDER.index(day)
            start = to_minutes(s.start)
            end = to_minutes(s.end)
            if start >= end:
                continue
            y0 = y_top - ((start - start_min) / 60.0 + 1) * row_h
            y1 = y_top - ((end - start_min) / 60.0 + 1) * row_h
            c.setFillColor(color)
            rect_height = max(6, y0 - y1 - 2)
            c.rect(x + day_idx * col_w + 1, y1 + 1, col_w - 2, rect_height, stroke=0, fill=1)
            c.setFillColor(colors.black)
            font_name = "Helvetica"
            font_size = 6
            c.setFont(font_name, font_size)
            text_x = x + day_idx * col_w + 3
            text_y = y0 - 10
            max_width = col_w - 6
            max_lines = max(1, int((rect_height - 6) // (font_size + 1)))
            for line in _wrap_text(course.name, font_name, font_size, max_width)[:max_lines]:
                c.drawString(text_x, text_y, line)
                text_y -= (font_size + 1)


def _draw_table(c: canvas.Canvas, x: float, y: float, w: float, rows: List[Tuple[str, str, str]]) -> None:
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Curso")
    c.drawString(x + w * 0.65, y, "NRC")
    c.drawString(x + w * 0.8, y, "Docente")
    c.setFont("Helvetica", 8)
    y -= 12
    for curso, nrc, docente in rows:
        c.drawString(x, y, curso[:45])
        c.drawString(x + w * 0.65, y, nrc)
        c.drawString(x + w * 0.8, y, docente[:25])
        y -= 12


def export_schedule_pdf(path: str, bloque_a: List[Course], bloque_b: List[Course]) -> None:
    c = canvas.Canvas(path, pagesize=landscape(A4))
    width, height = landscape(A4)
    margin_x = 2.5 * cm
    margin_y = 2 * cm

    def render_block(title: str, courses: List[Course]) -> None:
        c.setFont("Helvetica-Bold", 16)
        c.drawString(margin_x, height - margin_y, f"Horario {title}")
        cal_top = height - margin_y - 40
        cal_height = height * 0.55
        c.setFont("Helvetica-Bold", 12)
        _draw_calendar(c, margin_x, cal_top - cal_height, width - 2 * margin_x, cal_height, courses)
        y = cal_top - cal_height - 32
        c.setStrokeColor(colors.black)
        c.line(margin_x, y + 20, width - margin_x, y + 20)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(margin_x, y, f"Cuadro resumen {title[-1]}")
        y -= 12
        rows = [(c1.name, c1.nrc, c1.teacher or "") for c1 in courses]
        _draw_table(c, margin_x, y, width - 2 * margin_x, rows)

    render_block("Bloque A", bloque_a)
    c.showPage()
    render_block("Bloque B", bloque_b)
    c.showPage()
    c.save()
