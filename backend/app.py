from __future__ import annotations

from pathlib import Path
from typing import List, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.pdf_exporter import export_schedule_pdf
from backend.emailer import send_contact_email
from backend.services import (
    build_schedule_response,
    get_sections_for_course,
    group_course_catalog,
    load_courses,
    list_saved_schedules,
    save_schedule,
    get_saved_schedule,
    get_total_visits,
    increment_total_visits,
    refresh_courses_from_cookie,
    resolve_selected_sections,
)
from course_scheduler.planner.auto_scheduler import generate_auto_schedule


class ScrapeRequest(BaseModel):
    session_id: str | None = None
    cookie: str = Field(min_length=5)
    term: str = Field(default="202610", min_length=4)


class SelectedSection(BaseModel):
    course_key: str
    nrc: str
    block: Literal["A", "B"]


class BuildScheduleRequest(BaseModel):
    selections_a: List[SelectedSection] = Field(default_factory=list)
    selections_b: List[SelectedSection] = Field(default_factory=list)


class ValidateConflictRequest(BaseModel):
    sections: List[SelectedSection] = Field(default_factory=list)


class AutoScheduleRequest(BaseModel):
    course_keys: List[str] = Field(default_factory=list)
    allowed_days: List[str] = Field(default_factory=list)
    target_credits: int = Field(default=12, ge=1)
    allow_less: bool = True


class ContactRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    subject: str = Field(min_length=2, max_length=120)
    message: str = Field(min_length=5, max_length=2000)


class SaveScheduleRequest(BaseModel):
    session_id: str = Field(min_length=4)
    name: str | None = None
    selections_a: List[SelectedSection] = Field(default_factory=list)
    selections_b: List[SelectedSection] = Field(default_factory=list)

app = FastAPI(title="Course Scheduler UC - Web API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/courses")
def list_courses(session_id: str | None = None) -> dict:
    courses = load_courses(session_id=session_id)
    return {"items": group_course_catalog(courses), "count": len(courses)}


@app.get("/api/courses/{course_key}/sections")
def list_sections(course_key: str, block: Literal["A", "B"] | None = None, session_id: str | None = None) -> dict:
    courses = load_courses(session_id=session_id)
    sections = get_sections_for_course(courses, course_key, block)
    if not sections:
        raise HTTPException(status_code=404, detail="Curso o secciones no encontradas")
    return {"items": sections, "count": len(sections)}


@app.post("/api/scrape/recommended")
def scrape_recommended(payload: ScrapeRequest) -> dict:
    try:
        result = refresh_courses_from_cookie(
            cookie=payload.cookie.strip(),
            term=payload.term.strip(),
            session_id=payload.session_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "message": "Cursos actualizados",
        "courses_found": result.get("courses_found", 0),
        "sections_found": result.get("sections_found", 0),
        "horarios_processed": result.get("horarios_processed", 0),
        "saved_records": len(result.get("records", [])) if isinstance(result.get("records"), list) else 0,
    }


@app.post("/api/conflicts/validate")
def validate_conflicts(payload: ValidateConflictRequest, session_id: str | None = None) -> dict:
    courses = load_courses(session_id=session_id)
    selections_a = [
        (item.course_key, item.nrc, item.block)
        for item in payload.sections
        if item.block == "A"
    ]
    selections_b = [
        (item.course_key, item.nrc, item.block)
        for item in payload.sections
        if item.block == "B"
    ]
    selected_a = resolve_selected_sections(courses, selections_a)
    selected_b = resolve_selected_sections(courses, selections_b)
    schedule = build_schedule_response(selected_a, selected_b)
    conflicts_a = schedule["bloque_a"]["conflicts"]
    conflicts_b = schedule["bloque_b"]["conflicts"]
    return {
        "selected": len(selected_a) + len(selected_b),
        "conflicts": conflicts_a + conflicts_b,
        "conflicts_a": conflicts_a,
        "conflicts_b": conflicts_b,
    }


@app.post("/api/schedule/build")
def build_schedule(payload: BuildScheduleRequest, session_id: str | None = None) -> dict:
    courses = load_courses(session_id=session_id)
    selections_a = [(item.course_key, item.nrc, item.block) for item in payload.selections_a]
    selections_b = [(item.course_key, item.nrc, item.block) for item in payload.selections_b]
    selected_a = resolve_selected_sections(courses, selections_a)
    selected_b = resolve_selected_sections(courses, selections_b)

    return build_schedule_response(selected_a, selected_b)


@app.post("/api/schedule/auto")
def auto_schedule(payload: AutoScheduleRequest, session_id: str | None = None) -> dict:
    courses = load_courses(session_id=session_id)
    result = generate_auto_schedule(
        courses,
        selected_course_keys=payload.course_keys,
        allowed_days=payload.allowed_days,
        target_credits=payload.target_credits,
        allow_less=payload.allow_less,
    )

    selected_a = result.get("bloque_a", {}).get("courses", [])
    selected_b = result.get("bloque_b", {}).get("courses", [])
    schedule = build_schedule_response(selected_a, selected_b)

    credits_a = sum(c.credits for c in selected_a)
    credits_b = sum(c.credits for c in selected_b)

    schedule["bloque_a"]["credits"] = credits_a
    schedule["bloque_b"]["credits"] = credits_b
    schedule["bloque_a"]["selections"] = [
        {"course_key": c.course_key() or c.name, "nrc": c.nrc, "block": "A"}
        for c in selected_a
    ]
    schedule["bloque_b"]["selections"] = [
        {"course_key": c.course_key() or c.name, "nrc": c.nrc, "block": "B"}
        for c in selected_b
    ]

    return schedule


@app.post("/api/schedule/save")
def save_schedule_endpoint(payload: SaveScheduleRequest) -> dict:
    selections_a = [(i.course_key, i.nrc, i.block) for i in payload.selections_a]
    selections_b = [(i.course_key, i.nrc, i.block) for i in payload.selections_b]
    entry = save_schedule(payload.session_id, selections_a, selections_b, payload.name)
    return {"item": entry}


@app.get("/api/schedule/saved")
def list_saved(session_id: str) -> dict:
    items = list_saved_schedules(session_id)
    return {"items": items, "count": len(items)}


@app.get("/api/schedule/saved/{schedule_id}")
def get_saved(session_id: str, schedule_id: str) -> dict:
    item = get_saved_schedule(session_id, schedule_id)
    if not item:
        raise HTTPException(status_code=404, detail="Horario no encontrado")
    return {"item": item}


@app.post("/api/schedule/export/pdf")
def export_pdf(payload: BuildScheduleRequest, session_id: str | None = None) -> FileResponse:
    courses = load_courses(session_id=session_id)
    selections_a = [(item.course_key, item.nrc, item.block) for item in payload.selections_a]
    selections_b = [(item.course_key, item.nrc, item.block) for item in payload.selections_b]
    selected_a = resolve_selected_sections(courses, selections_a)
    selected_b = resolve_selected_sections(courses, selections_b)

    export_dir = Path(__file__).resolve().parent / "data" / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    filename = f"horario_{len(list(export_dir.glob('*.pdf'))) + 1}.pdf"
    filepath = export_dir / filename
    export_schedule_pdf(str(filepath), selected_a, selected_b)
    return FileResponse(filepath, media_type="application/pdf", filename="horario.pdf")


@app.get("/cookie-guide")
def cookie_guide() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "cookie-guide.html")


@app.get("/about")
def about_page() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "about.html")


@app.get("/api/metrics/visit")
def metrics_visit() -> dict:
    total = increment_total_visits()
    return {"total_visits": total}


@app.get("/api/metrics")
def metrics_read() -> dict:
    total = get_total_visits()
    return {"total_visits": total}


@app.post("/api/contact")
def contact(payload: ContactRequest) -> dict:
    try:
        send_contact_email(payload.name, payload.email, payload.subject, payload.message)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}


@app.get("/auto")
def auto_page() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "auto.html")

@app.get("/")
def home() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")
    return FileResponse(FRONTEND_DIR / "index.html")
