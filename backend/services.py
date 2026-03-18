from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime
import re
from typing import Dict, List, Tuple

from course_scheduler.models.course import Course
from course_scheduler.utils.data_utils import flatten_courses
from course_scheduler.planner.conflict_detector import Conflict, detect_conflicts
from course_scheduler.scraper_run import build_records

DATA_PATH = Path(__file__).resolve().parent / "data" / "cursos.json"




SESSION_COURSES_DIR = Path(__file__).resolve().parent / "data" / "sessions"


def _session_courses_path(session_id: str | None) -> Path:
    if not session_id:
        return DATA_PATH
    safe = _safe_session_id(session_id)
    return SESSION_COURSES_DIR / f"{safe}_cursos.json"
def load_courses(session_id: str | None = None) -> List[Course]:
    courses_path = _session_courses_path(session_id)
    if not courses_path.exists():
        return []
    with open(courses_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return []
    return [Course.from_dict(item) for item in flatten_courses(data) if isinstance(item, dict)]


def save_records(records: List[Dict[str, object]], session_id: str | None = None) -> None:
    target = _session_courses_path(session_id)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def refresh_courses_from_cookie(cookie: str, term: str, session_id: str | None = None) -> Dict[str, object]:
    result = build_records(term, cookie=cookie)
    records = result.get("records", [])
    if isinstance(records, list):
        save_records(records, session_id=session_id)
    return result



SCHEDULES_DIR = Path(__file__).resolve().parent / "data" / "schedules"


def _safe_session_id(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", value or "")
    return cleaned[:64] or "default"


def _session_file(session_id: str) -> Path:
    return SCHEDULES_DIR / f"{_safe_session_id(session_id)}.json"


def list_saved_schedules(session_id: str) -> List[Dict[str, object]]:
    path = _session_file(session_id)
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    items = data.get("items", []) if isinstance(data, dict) else []
    return items if isinstance(items, list) else []


def save_schedule(
    session_id: str,
    selections_a: List[Tuple[str, str, str]],
    selections_b: List[Tuple[str, str, str]],
    name: str | None = None,
) -> Dict[str, object]:
    from uuid import uuid4

    items = list_saved_schedules(session_id)
    schedule_id = uuid4().hex
    entry = {
        "id": schedule_id,
        "name": (name or f"Horario {len(items) + 1}"),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "selections_a": [
            {"course_key": c, "nrc": n, "block": b} for c, n, b in selections_a
        ],
        "selections_b": [
            {"course_key": c, "nrc": n, "block": b} for c, n, b in selections_b
        ],
    }
    items.append(entry)
    SCHEDULES_DIR.mkdir(parents=True, exist_ok=True)
    with open(_session_file(session_id), "w", encoding="utf-8") as f:
        json.dump({"items": items}, f, ensure_ascii=False, indent=2)
    return entry


def get_saved_schedule(session_id: str, schedule_id: str) -> Dict[str, object] | None:
    for item in list_saved_schedules(session_id):
        if isinstance(item, dict) and item.get("id") == schedule_id:
            return item
    return None

METRICS_PATH = Path(__file__).resolve().parent / "data" / "metrics.json"


def get_total_visits() -> int:
    if not METRICS_PATH.exists():
        return 0
    try:
        with open(METRICS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return int(data.get("total_visits", 0)) if isinstance(data, dict) else 0
    except Exception:
        return 0


def increment_total_visits() -> int:
    total = get_total_visits() + 1
    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump({"total_visits": total}, f, ensure_ascii=False, indent=2)
    return total
def group_course_catalog(courses: List[Course]) -> List[Dict[str, object]]:
    grouped: Dict[str, Dict[str, object]] = {}
    for course in courses:
        key = course.course_key() or course.name
        if key not in grouped:
            grouped[key] = {
                "course_key": key,
                "name": course.name,
                "subject": course.subject,
                "course": course.course,
                "credits": course.credits,
                "available_blocks": set(),
            }
        block = course.block_letter()
        if block:
            grouped[key]["available_blocks"].add(block)

    catalog = []
    for item in grouped.values():
        item["available_blocks"] = sorted(list(item["available_blocks"]))
        catalog.append(item)
    catalog.sort(key=lambda x: str(x["name"]))
    return catalog


def get_sections_for_course(courses: List[Course], course_key: str, block: str | None = None) -> List[Dict[str, object]]:
    found: List[Dict[str, object]] = []
    for course in courses:
        key = course.course_key() or course.name
        if key != course_key:
            continue
        block_letter = course.block_letter()
        if block and block_letter != block:
            continue
        found.append(
            {
                "course_key": key,
                "name": course.name,
                "nrc": course.nrc,
                "teacher": course.teacher,
                "block": course.block,
                "block_letter": block_letter,
                "horarios": [
                    {
                        "dia": s.day,
                        "inicio": s.start,
                        "fin": s.end,
                        "modalidad": s.modality,
                    }
                    for s in course.schedules
                ],
            }
        )
    found.sort(key=lambda x: str(x["nrc"]))
    return found


def resolve_selected_sections(courses: List[Course], selections: List[Tuple[str, str, str]]) -> List[Course]:
    selected: List[Course] = []
    for course_key, nrc, block_letter in selections:
        for course in courses:
            key = course.course_key() or course.name
            if key != course_key or course.nrc != nrc:
                continue
            if block_letter and course.block_letter() != block_letter:
                continue
            selected.append(course)
            break
    return selected


def serialize_conflicts(conflicts: List[Conflict]) -> List[Dict[str, object]]:
    return [
        {
            "kind": conflict.kind,
            "course_a": {
                "name": conflict.course_a.name,
                "nrc": conflict.course_a.nrc,
                "block": conflict.course_a.block,
            },
            "course_b": {
                "name": conflict.course_b.name,
                "nrc": conflict.course_b.nrc,
                "block": conflict.course_b.block,
            },
            "schedule_a": {
                "day": conflict.schedule_a.day,
                "start": conflict.schedule_a.start,
                "end": conflict.schedule_a.end,
                "modality": conflict.schedule_a.modality,
            },
            "schedule_b": {
                "day": conflict.schedule_b.day,
                "start": conflict.schedule_b.start,
                "end": conflict.schedule_b.end,
                "modality": conflict.schedule_b.modality,
            },
        }
        for conflict in conflicts
    ]


def build_schedule_response(selected_a: List[Course], selected_b: List[Course]) -> Dict[str, object]:
    conflicts_a = detect_conflicts(selected_a)
    conflicts_b = detect_conflicts(selected_b)

    def to_items(courses: List[Course]) -> List[Dict[str, object]]:
        items: List[Dict[str, object]] = []
        for course in courses:
            items.append(
                {
                    "course_key": course.course_key() or course.name,
                    "name": course.name,
                    "nrc": course.nrc,
                    "teacher": course.teacher,
                    "block": course.block,
                    "horarios": [
                        {
                            "dia": s.day,
                            "inicio": s.start,
                            "fin": s.end,
                            "modalidad": s.modality,
                        }
                        for s in course.schedules
                    ],
                }
            )
        return items

    return {
        "bloque_a": {
            "courses": to_items(selected_a),
            "conflicts": serialize_conflicts(conflicts_a),
        },
        "bloque_b": {
            "courses": to_items(selected_b),
            "conflicts": serialize_conflicts(conflicts_b),
        },
    }
