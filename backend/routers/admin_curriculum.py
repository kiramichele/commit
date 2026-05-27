# ============================================================
# COMMIT PLATFORM — Admin Curriculum Router
# ============================================================
# CRUD over units, lessons, and lesson_content, plus an HTML upload
# endpoint that writes to Supabase Storage. Replaces import_curriculum.py.
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List, Any

from auth_deps import CurrentUser, require_admin
from db import supabase_admin

router = APIRouter()

BUCKET = "lesson-content"


# ============================================================
# SCHEMAS
# ============================================================

class UnitCreate(BaseModel):
    order_index: int
    title: str
    description: Optional[str] = ""
    is_published: bool = False


class UnitUpdate(BaseModel):
    order_index: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    is_published: Optional[bool] = None


class ExerciseItem(BaseModel):
    type: str = "coding"
    instructions: str = ""
    starter_code: str = ""


class LessonContent(BaseModel):
    estimated_minutes: int = 20
    has_coding_exercise: bool = False
    coding_instructions: Optional[str] = ""
    coding_starter_code: Optional[str] = ""
    example_code: Optional[str] = ""
    example_explanation: Optional[str] = ""
    exercises: Optional[List[ExerciseItem]] = None
    html_body: Optional[str] = None       # pasted HTML; written to storage as lesson.html
    activity_body: Optional[str] = None   # pasted HTML; written to storage as activity.html


class LessonCreate(BaseModel):
    order_index: int
    title: str
    scaffold_level: str = "typed_python"
    standards_tags: Optional[List[str]] = None
    is_published: bool = False
    content: LessonContent


class LessonUpdate(BaseModel):
    order_index: Optional[int] = None
    title: Optional[str] = None
    scaffold_level: Optional[str] = None
    standards_tags: Optional[List[str]] = None
    is_published: Optional[bool] = None
    content: Optional[LessonContent] = None


# ============================================================
# HELPERS
# ============================================================

def _upload_html_body(unit_id: str, lesson_id: str, filename: str, body: str) -> str:
    """Uploads an HTML string to Supabase Storage. Returns the storage path."""
    storage_path = f"units/{unit_id}/lessons/{lesson_id}/{filename}"
    supabase_admin.storage.from_(BUCKET).upload(
        path=storage_path,
        file=body.encode("utf-8"),
        file_options={"content-type": "text/html", "upsert": "true"},
    )
    return storage_path


def _upsert_lesson_content(lesson_id: str, unit_id: str, content: LessonContent):
    """Writes/updates the lesson_content row and uploads any inline HTML bodies."""
    existing = (
        supabase_admin.table("lesson_content")
        .select("id, html_file_path, activity_file_path")
        .eq("lesson_id", lesson_id)
        .maybe_single()
        .execute()
    )
    prior = (existing.data if existing else None) or {}

    html_path = prior.get("html_file_path")
    activity_path = prior.get("activity_file_path")

    if content.html_body is not None:
        html_path = _upload_html_body(unit_id, lesson_id, "lesson.html", content.html_body) if content.html_body else None
    if content.activity_body is not None:
        activity_path = _upload_html_body(unit_id, lesson_id, "activity.html", content.activity_body) if content.activity_body else None

    row = {
        "lesson_id": lesson_id,
        "html_file_path": html_path,
        "activity_file_path": activity_path,
        "estimated_minutes": content.estimated_minutes,
        "has_coding_exercise": content.has_coding_exercise,
        "coding_instructions": content.coding_instructions or "",
        "coding_starter_code": content.coding_starter_code or "",
        "example_code": content.example_code or "",
        "example_explanation": content.example_explanation or "",
        "exercises": [e.model_dump() for e in content.exercises] if content.exercises else None,
    }

    if prior.get("id"):
        supabase_admin.table("lesson_content").update(row).eq("lesson_id", lesson_id).execute()
    else:
        supabase_admin.table("lesson_content").insert(row).execute()


# ============================================================
# UNITS
# ============================================================

@router.get("/units")
async def list_units(user: CurrentUser = Depends(require_admin)):
    """All units including unpublished — admin view."""
    response = (
        supabase_admin.table("units")
        .select("*")
        .order("order_index")
        .execute()
    )
    return response.data or []


@router.post("/units", status_code=201)
async def create_unit(body: UnitCreate, user: CurrentUser = Depends(require_admin)):
    response = supabase_admin.table("units").insert(body.model_dump()).execute()
    return response.data[0]


@router.patch("/units/{unit_id}")
async def update_unit(unit_id: str, body: UnitUpdate, user: CurrentUser = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    response = supabase_admin.table("units").update(updates).eq("id", unit_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Unit not found.")
    return response.data[0]


@router.delete("/units/{unit_id}", status_code=204)
async def delete_unit(unit_id: str, user: CurrentUser = Depends(require_admin)):
    """Deletes a unit. Will fail if lessons still reference it — delete those first."""
    lessons = supabase_admin.table("lessons").select("id", count="exact").eq("unit_id", unit_id).execute()
    if lessons.count and lessons.count > 0:
        raise HTTPException(status_code=409, detail=f"Unit has {lessons.count} lesson(s). Delete them first.")
    supabase_admin.table("units").delete().eq("id", unit_id).execute()


# ============================================================
# LESSONS
# ============================================================

@router.get("/units/{unit_id}/lessons")
async def list_lessons(unit_id: str, user: CurrentUser = Depends(require_admin)):
    """All lessons in a unit, with their content row joined."""
    response = (
        supabase_admin.table("lessons")
        .select("*, lesson_content(*)")
        .eq("unit_id", unit_id)
        .order("order_index")
        .execute()
    )
    return response.data or []


@router.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: str, user: CurrentUser = Depends(require_admin)):
    """Single lesson with content. HTML bodies returned inline so the editor can populate."""
    response = (
        supabase_admin.table("lessons")
        .select("*, lesson_content(*)")
        .eq("id", lesson_id)
        .maybe_single()
        .execute()
    )
    if not response or not response.data:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    lesson = response.data
    content_rows = lesson.get("lesson_content") or []
    content = content_rows[0] if isinstance(content_rows, list) and content_rows else (content_rows or {})

    # Fetch HTML body strings for the editor, if any
    html_body = _download_html(content.get("html_file_path")) if content.get("html_file_path") else None
    activity_body = _download_html(content.get("activity_file_path")) if content.get("activity_file_path") else None

    lesson["lesson_content"] = {
        **content,
        "html_body": html_body,
        "activity_body": activity_body,
    }
    return lesson


def _download_html(storage_path: str) -> Optional[str]:
    try:
        blob = supabase_admin.storage.from_(BUCKET).download(storage_path)
        return blob.decode("utf-8") if blob else None
    except Exception as e:
        print(f"[admin_curriculum] download failed for {storage_path}: {e}")
        return None


@router.post("/units/{unit_id}/lessons", status_code=201)
async def create_lesson(unit_id: str, body: LessonCreate, user: CurrentUser = Depends(require_admin)):
    unit = supabase_admin.table("units").select("id").eq("id", unit_id).maybe_single().execute()
    if not unit or not unit.data:
        raise HTTPException(status_code=404, detail="Unit not found.")

    lesson_row = {
        "unit_id": unit_id,
        "order_index": body.order_index,
        "title": body.title,
        "scaffold_level": body.scaffold_level,
        "standards_tags": body.standards_tags,
        "is_published": body.is_published,
    }
    result = supabase_admin.table("lessons").insert(lesson_row).execute()
    lesson_id = result.data[0]["id"]

    _upsert_lesson_content(lesson_id, unit_id, body.content)
    return await get_lesson(lesson_id, user)


@router.patch("/lessons/{lesson_id}")
async def update_lesson(lesson_id: str, body: LessonUpdate, user: CurrentUser = Depends(require_admin)):
    existing = supabase_admin.table("lessons").select("id, unit_id").eq("id", lesson_id).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    unit_id = existing.data["unit_id"]

    lesson_updates = {
        k: v for k, v in {
            "order_index": body.order_index,
            "title": body.title,
            "scaffold_level": body.scaffold_level,
            "standards_tags": body.standards_tags,
            "is_published": body.is_published,
        }.items() if v is not None
    }
    if lesson_updates:
        supabase_admin.table("lessons").update(lesson_updates).eq("id", lesson_id).execute()

    if body.content is not None:
        _upsert_lesson_content(lesson_id, unit_id, body.content)

    return await get_lesson(lesson_id, user)


@router.delete("/lessons/{lesson_id}", status_code=204)
async def delete_lesson(lesson_id: str, user: CurrentUser = Depends(require_admin)):
    """Deletes a lesson + its content row. Storage files are left behind (manual cleanup)."""
    # Block deletion if classroom assignments reference this lesson
    refs = supabase_admin.table("assignments").select("id", count="exact").eq("lesson_id", lesson_id).execute()
    if refs.count and refs.count > 0:
        raise HTTPException(status_code=409, detail=f"Lesson is referenced by {refs.count} assignment(s).")
    supabase_admin.table("lesson_content").delete().eq("lesson_id", lesson_id).execute()
    supabase_admin.table("lessons").delete().eq("id", lesson_id).execute()


# ============================================================
# FILE UPLOAD (for .html file picker in the admin UI)
# ============================================================

@router.post("/lessons/{lesson_id}/upload-html")
async def upload_html_file(
    lesson_id: str,
    file: UploadFile = File(...),
    file_type: str = Form(...),  # "lesson" | "activity"
    user: CurrentUser = Depends(require_admin),
):
    """Uploads a .html file and updates the matching lesson_content path."""
    if file_type not in ("lesson", "activity"):
        raise HTTPException(status_code=400, detail="file_type must be 'lesson' or 'activity'.")

    lesson = supabase_admin.table("lessons").select("id, unit_id").eq("id", lesson_id).maybe_single().execute()
    if not lesson or not lesson.data:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    body = await file.read()
    storage_path = f"units/{lesson.data['unit_id']}/lessons/{lesson_id}/{file_type}.html"
    supabase_admin.storage.from_(BUCKET).upload(
        path=storage_path,
        file=body,
        file_options={"content-type": "text/html", "upsert": "true"},
    )

    column = "html_file_path" if file_type == "lesson" else "activity_file_path"
    existing = supabase_admin.table("lesson_content").select("id").eq("lesson_id", lesson_id).maybe_single().execute()
    if existing and existing.data:
        supabase_admin.table("lesson_content").update({column: storage_path}).eq("lesson_id", lesson_id).execute()
    else:
        supabase_admin.table("lesson_content").insert({"lesson_id": lesson_id, column: storage_path}).execute()

    return {"storage_path": storage_path}
