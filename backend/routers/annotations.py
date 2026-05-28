# ============================================================
# COMMIT PLATFORM — Annotations + Search Router
# backend/routers/annotations.py
# ============================================================
# Student annotations on lessons (highlights + sidebar notes) plus a
# small search endpoint that scans Python doc keywords, lesson
# titles, and the calling user's own annotations.
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

from auth_deps import CurrentUser, get_current_user
from db import supabase_admin

router = APIRouter()


# ── SCHEMAS ──────────────────────────────────────────────────

class AnnotationCreate(BaseModel):
    lesson_id: str
    kind: str  # 'highlight' | 'note'
    selected_text: Optional[str] = None
    quote_before: Optional[str] = None
    quote_after: Optional[str] = None
    note_text: Optional[str] = None
    linked_annotation_id: Optional[str] = None


class AnnotationUpdate(BaseModel):
    note_text: Optional[str] = None
    linked_annotation_id: Optional[str] = None


# ── CRUD ─────────────────────────────────────────────────────

@router.get("/lesson/{lesson_id}")
async def list_my_annotations_for_lesson(
    lesson_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """My annotations on this lesson — both highlights and notes."""
    response = (
        supabase_admin.table("lesson_annotations")
        .select("*")
        .eq("student_id", user.profile_id)
        .eq("lesson_id", lesson_id)
        .order("created_at")
        .execute()
    )
    return response.data or []


@router.post("/", status_code=201)
async def create_annotation(
    body: AnnotationCreate,
    user: CurrentUser = Depends(get_current_user),
):
    if body.kind not in ("highlight", "note"):
        raise HTTPException(status_code=400, detail="kind must be highlight or note.")
    if body.kind == "highlight" and not (body.selected_text or "").strip():
        raise HTTPException(status_code=400, detail="highlights need selected_text.")
    if body.kind == "note" and not (body.note_text or "").strip() and not body.linked_annotation_id:
        raise HTTPException(status_code=400, detail="notes need note_text or a linked highlight.")

    row = {
        "student_id": user.profile_id,
        "lesson_id": body.lesson_id,
        "kind": body.kind,
        "selected_text": body.selected_text,
        "quote_before": body.quote_before,
        "quote_after": body.quote_after,
        "note_text": body.note_text,
        "linked_annotation_id": body.linked_annotation_id,
    }
    result = supabase_admin.table("lesson_annotations").insert(row).execute()
    return result.data[0] if result.data else {}


@router.patch("/{annotation_id}")
async def update_annotation(
    annotation_id: str,
    body: AnnotationUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    # Verify ownership.
    existing = (
        supabase_admin.table("lesson_annotations")
        .select("id, student_id")
        .eq("id", annotation_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Annotation not found.")
    if existing.data["student_id"] != user.profile_id:
        raise HTTPException(status_code=403, detail="Not your annotation.")

    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.note_text is not None:
        updates["note_text"] = body.note_text
    if body.linked_annotation_id is not None:
        updates["linked_annotation_id"] = body.linked_annotation_id or None

    result = supabase_admin.table("lesson_annotations").update(updates).eq("id", annotation_id).execute()
    return result.data[0] if result.data else {}


@router.delete("/{annotation_id}", status_code=204)
async def delete_annotation(
    annotation_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    existing = (
        supabase_admin.table("lesson_annotations")
        .select("id, student_id")
        .eq("id", annotation_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        return  # 204 either way
    if existing.data["student_id"] != user.profile_id:
        raise HTTPException(status_code=403, detail="Not your annotation.")
    supabase_admin.table("lesson_annotations").delete().eq("id", annotation_id).execute()


# ── SEARCH ───────────────────────────────────────────────────

# Pulled from the frontend Python docs so the backend can match on
# keys/names without depending on the FE. Keep in sync with
# frontend/src/lib/pythonDocs.ts.
PYTHON_DOC_KEYWORDS = [
    "print()", "print() with sep",
    "String", "Integer", "Float", "Boolean", "type()",
    "Concatenation", "f-string", "len()", ".upper() / .lower()", ".split()",
    "input()", "int(input())",
    "if / elif / else", "Comparison ops", "Logical ops",
    "for loop", "for in list", "while loop", "break", "continue",
    "def", "return", "Default params",
    "Create list", "Indexing", ".append()", ".remove()",
]


@router.get("/search")
async def search(
    q: str,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Returns lightweight matches across:
      - python docs entries (matched against the keyword name)
      - lesson titles the user can see
      - the user's own annotations (highlight text + note text)
    Frontend renders each section in its own tab. Search is case-insensitive
    substring matching; full-text search is a future iteration.
    """
    needle = (q or "").strip().lower()
    if not needle:
        return {"docs": [], "lessons": [], "annotations": []}

    # Docs — quick keyword filter.
    docs = [
        {"name": k, "search": k}
        for k in PYTHON_DOC_KEYWORDS
        if needle in k.lower()
    ]

    # Lessons — published lessons whose title matches.
    lessons_resp = (
        supabase_admin.table("lessons")
        .select("id, title, unit_id, units(title)")
        .eq("is_published", True)
        .ilike("title", f"%{q}%")
        .order("order_index")
        .limit(50)
        .execute()
    )
    lessons = [
        {
            "id": r["id"],
            "title": r["title"],
            "unit_title": (r.get("units") or {}).get("title"),
        }
        for r in (lessons_resp.data or [])
    ]

    # Annotations — student-scoped, matches selected text or note text.
    annotations_resp = (
        supabase_admin.table("lesson_annotations")
        .select("*, lessons(title)")
        .eq("student_id", user.profile_id)
        .or_(f"selected_text.ilike.%{q}%,note_text.ilike.%{q}%")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    annotations = [
        {
            "id": a["id"],
            "lesson_id": a["lesson_id"],
            "lesson_title": (a.get("lessons") or {}).get("title"),
            "kind": a["kind"],
            "selected_text": a.get("selected_text"),
            "note_text": a.get("note_text"),
        }
        for a in (annotations_resp.data or [])
    ]

    return {
        "docs": docs,
        "lessons": lessons,
        "annotations": annotations,
    }
