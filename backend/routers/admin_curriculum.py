# ============================================================
# COMMIT PLATFORM — Admin Curriculum Router
# ============================================================
# CRUD over units, lessons, and lesson_content, plus an HTML upload
# endpoint that writes to Supabase Storage. Replaces import_curriculum.py.
# ============================================================

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List, Any

from auth_deps import CurrentUser, require_admin
from db import supabase_admin

router = APIRouter()

BUCKET = "lesson-content"


def _next_order_for(table: str, scope_col: Optional[str], scope_val: Optional[str]) -> int:
    """Returns max(order_index) + 1 within the given scope (e.g. lessons in a unit)."""
    q = supabase_admin.table(table).select("order_index")
    if scope_col and scope_val:
        q = q.eq(scope_col, scope_val)
    rows = q.execute().data or []
    max_idx = 0
    for r in rows:
        v = r.get("order_index")
        if isinstance(v, int) and v > max_idx:
            max_idx = v
    return max_idx + 1


# ============================================================
# SCHEMAS
# ============================================================

class UnitCreate(BaseModel):
    order_index: Optional[int] = None  # auto-assigns to max+1 when None
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
    order_index: Optional[int] = None  # auto-assigns to max+1 when None
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
    unit_id: Optional[str] = None  # supports moving the lesson to another unit


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
    row = body.model_dump()
    if row.get("order_index") is None:
        row["order_index"] = _next_order_for("units", None, None)
    response = supabase_admin.table("units").insert(row).execute()
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
        "order_index": body.order_index if body.order_index is not None else _next_order_for("lessons", "unit_id", unit_id),
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

# ============================================================
# PROJECTS (admin)
# ============================================================

class ProjectCreate(BaseModel):
    order_index: Optional[int] = None  # auto-assigns to max+1 when None
    title: str
    description: Optional[str] = ""
    estimated_minutes: int = 60
    scaffold_level: str = "typed_python"
    standards_tags: Optional[List[str]] = None
    is_published: bool = False


class ProjectUpdate(BaseModel):
    order_index: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    estimated_minutes: Optional[int] = None
    scaffold_level: Optional[str] = None
    standards_tags: Optional[List[str]] = None
    is_published: Optional[bool] = None
    unit_id: Optional[str] = None  # supports moving the project to another unit


class ProjectStepCreate(BaseModel):
    order_index: int
    title: str
    step_type: str  # 'coding' | 'reading' | 'free_response'
    instructions: Optional[str] = ""
    starter_code: Optional[str] = ""
    example_code: Optional[str] = ""
    example_explanation: Optional[str] = ""
    html_body: Optional[str] = None  # uploaded to storage when provided
    prompt: Optional[str] = ""
    min_words: Optional[int] = 0
    max_words: Optional[int] = 0
    is_published: bool = False


class ProjectStepUpdate(BaseModel):
    order_index: Optional[int] = None
    title: Optional[str] = None
    step_type: Optional[str] = None
    instructions: Optional[str] = None
    starter_code: Optional[str] = None
    example_code: Optional[str] = None
    example_explanation: Optional[str] = None
    html_body: Optional[str] = None
    prompt: Optional[str] = None
    min_words: Optional[int] = None
    max_words: Optional[int] = None
    is_published: Optional[bool] = None


def _upload_step_html(project_id: str, step_id: str, body: str) -> str:
    storage_path = f"projects/{project_id}/steps/{step_id}/reading.html"
    supabase_admin.storage.from_(BUCKET).upload(
        path=storage_path,
        file=body.encode("utf-8"),
        file_options={"content-type": "text/html", "upsert": "true"},
    )
    return storage_path


@router.get("/units/{unit_id}/projects")
async def list_projects(unit_id: str, user: CurrentUser = Depends(require_admin)):
    response = (
        supabase_admin.table("projects")
        .select("*, project_steps(id, order_index, title, step_type, is_published)")
        .eq("unit_id", unit_id)
        .order("order_index")
        .execute()
    )
    return response.data or []


@router.post("/units/{unit_id}/projects", status_code=201)
async def create_project(unit_id: str, body: ProjectCreate, user: CurrentUser = Depends(require_admin)):
    unit = supabase_admin.table("units").select("id").eq("id", unit_id).maybe_single().execute()
    if not unit or not unit.data:
        raise HTTPException(status_code=404, detail="Unit not found.")
    row = {**body.model_dump(), "unit_id": unit_id}
    if row.get("order_index") is None:
        row["order_index"] = _next_order_for("projects", "unit_id", unit_id)
    result = supabase_admin.table("projects").insert(row).execute()
    return result.data[0]


@router.get("/projects/{project_id}")
async def get_project(project_id: str, user: CurrentUser = Depends(require_admin)):
    response = (
        supabase_admin.table("projects")
        .select("*, project_steps(*)")
        .eq("id", project_id)
        .maybe_single()
        .execute()
    )
    if not response or not response.data:
        raise HTTPException(status_code=404, detail="Project not found.")
    project = response.data
    steps = project.get("project_steps") or []
    steps.sort(key=lambda s: s.get("order_index", 0))
    # Hydrate reading-step HTML bodies for the editor
    for step in steps:
        if step.get("step_type") == "reading" and step.get("html_file_path"):
            step["html_body"] = _download_html(step["html_file_path"])
        else:
            step["html_body"] = None
    project["project_steps"] = steps
    return project


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, user: CurrentUser = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    response = supabase_admin.table("projects").update(updates).eq("id", project_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found.")
    return response.data[0]


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, user: CurrentUser = Depends(require_admin)):
    # Cascade-deletes steps via FK; storage files are left behind
    supabase_admin.table("projects").delete().eq("id", project_id).execute()


@router.post("/projects/{project_id}/steps", status_code=201)
async def create_step(project_id: str, body: ProjectStepCreate, user: CurrentUser = Depends(require_admin)):
    project = supabase_admin.table("projects").select("id").eq("id", project_id).maybe_single().execute()
    if not project or not project.data:
        raise HTTPException(status_code=404, detail="Project not found.")

    if body.step_type not in ("coding", "reading", "free_response"):
        raise HTTPException(status_code=400, detail="step_type must be coding, reading, or free_response.")

    row = {k: v for k, v in body.model_dump().items() if k != "html_body"}
    row["project_id"] = project_id
    result = supabase_admin.table("project_steps").insert(row).execute()
    step_id = result.data[0]["id"]

    if body.step_type == "reading" and body.html_body:
        path = _upload_step_html(project_id, step_id, body.html_body)
        supabase_admin.table("project_steps").update({"html_file_path": path}).eq("id", step_id).execute()

    return supabase_admin.table("project_steps").select("*").eq("id", step_id).single().execute().data


@router.patch("/steps/{step_id}")
async def update_step(step_id: str, body: ProjectStepUpdate, user: CurrentUser = Depends(require_admin)):
    existing = supabase_admin.table("project_steps").select("id, project_id, step_type").eq("id", step_id).maybe_single().execute()
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Step not found.")

    raw = body.model_dump()
    html_body = raw.pop("html_body", None)
    updates = {k: v for k, v in raw.items() if v is not None}

    if updates:
        supabase_admin.table("project_steps").update(updates).eq("id", step_id).execute()

    if html_body is not None:
        if html_body:
            path = _upload_step_html(existing.data["project_id"], step_id, html_body)
            supabase_admin.table("project_steps").update({"html_file_path": path}).eq("id", step_id).execute()
        else:
            supabase_admin.table("project_steps").update({"html_file_path": None}).eq("id", step_id).execute()

    return supabase_admin.table("project_steps").select("*").eq("id", step_id).single().execute().data


@router.delete("/steps/{step_id}", status_code=204)
async def delete_step(step_id: str, user: CurrentUser = Depends(require_admin)):
    supabase_admin.table("project_steps").delete().eq("id", step_id).execute()


# ============================================================
# CURRICULUM ASSIGNMENTS (admin-authored templates per unit)
# ============================================================

class CurriculumAssignmentCreate(BaseModel):
    order_index: Optional[int] = None  # auto-assigns to max+1 when None
    title: str
    instructions: Optional[str] = ""
    starter_code: Optional[str] = ""
    assignment_type: str = "code"
    min_commits: int = 1
    scaffold_level: str = "typed_python"
    allow_collab: bool = False
    standards_tags: Optional[List[str]] = None
    hints_enabled: bool = True
    hint_1: Optional[str] = None
    hint_2: Optional[str] = None
    is_published: bool = False
    html_body: Optional[str] = None  # for activity-type and html check-ins — uploaded to storage
    checkin_format: Optional[str] = None  # 'html' | 'short_answer' | 'rating' | 'coding'
    source_curriculum_assignment_id: Optional[str] = None  # for code_review type
    pairing_strategy: Optional[str] = None  # 'random' | 'similar_grade' | 'opposite_grade' | 'manual'
    discussion_min_posts: Optional[int] = None
    discussion_min_comments: Optional[int] = None
    test_cases: Optional[List[dict]] = None  # see _validate_test_cases for shape
    default_comparison: Optional[str] = None
    collab_enabled: Optional[bool] = None
    collab_group_size: Optional[int] = None
    collab_strategy: Optional[str] = None
    collab_allow_student_choice: Optional[bool] = None
    collab_allow_solo: Optional[bool] = None


class CurriculumAssignmentUpdate(BaseModel):
    order_index: Optional[int] = None
    title: Optional[str] = None
    instructions: Optional[str] = None
    starter_code: Optional[str] = None
    assignment_type: Optional[str] = None
    min_commits: Optional[int] = None
    scaffold_level: Optional[str] = None
    allow_collab: Optional[bool] = None
    standards_tags: Optional[List[str]] = None
    hints_enabled: Optional[bool] = None
    hint_1: Optional[str] = None
    hint_2: Optional[str] = None
    is_published: Optional[bool] = None
    html_body: Optional[str] = None  # set to "" to clear, None to leave unchanged
    unit_id: Optional[str] = None  # supports moving the assignment to another unit
    checkin_format: Optional[str] = None  # 'html' | 'short_answer' | 'rating' | 'coding'
    source_curriculum_assignment_id: Optional[str] = None
    pairing_strategy: Optional[str] = None
    discussion_min_posts: Optional[int] = None
    discussion_min_comments: Optional[int] = None
    test_cases: Optional[List[dict]] = None
    default_comparison: Optional[str] = None
    collab_enabled: Optional[bool] = None
    collab_group_size: Optional[int] = None
    collab_strategy: Optional[str] = None
    collab_allow_student_choice: Optional[bool] = None
    collab_allow_solo: Optional[bool] = None


_VALID_ASSIGNMENT_TYPES = {"code", "activity", "checkin", "quiz", "project", "code_review", "discussion"}
_VALID_PAIRING_STRATEGIES = {"random", "similar_grade", "opposite_grade", "manual"}
_VALID_COMPARISONS = {"exact", "strip_trailing_whitespace", "case_insensitive", "contains"}


def _validate_test_cases(raw):
    """Normalizes and validates a list of test cases. Raises 400 on bad
    input. Returns the cleaned list ready to store as JSONB.
    """
    if raw is None:
        return None
    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="test_cases must be a list.")
    seen_ids = set()
    cleaned = []
    for i, tc in enumerate(raw):
        if not isinstance(tc, dict):
            raise HTTPException(status_code=400, detail=f"test_cases[{i}] must be an object.")
        tc_id = (tc.get("id") or "").strip()
        description = (tc.get("description") or "").strip()
        if not tc_id:
            raise HTTPException(status_code=400, detail=f"test_cases[{i}].id is required.")
        if tc_id in seen_ids:
            raise HTTPException(status_code=400, detail=f"Duplicate test case id: {tc_id!r}.")
        seen_ids.add(tc_id)
        if not description:
            raise HTTPException(status_code=400, detail=f"test_cases[{i}].description is required.")
        if "expected_stdout" not in tc or tc["expected_stdout"] is None:
            raise HTTPException(status_code=400, detail=f"test_cases[{i}].expected_stdout is required.")
        comparison = tc.get("comparison")
        if comparison is not None and comparison not in _VALID_COMPARISONS:
            raise HTTPException(status_code=400, detail=f"test_cases[{i}].comparison invalid: {comparison!r}.")
        weight = tc.get("weight", 1)
        try:
            weight = int(weight)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"test_cases[{i}].weight must be an integer.")
        if weight < 0:
            raise HTTPException(status_code=400, detail=f"test_cases[{i}].weight must be >= 0.")
        entry = {
            "id": tc_id,
            "description": description,
            "stdin": tc.get("stdin", "") or "",
            "expected_stdout": tc["expected_stdout"],
            "weight": weight,
            "hidden": bool(tc.get("hidden", False)),
        }
        if comparison:
            entry["comparison"] = comparison
        cleaned.append(entry)
    return cleaned


def _upload_assignment_html(assignment_id: str, body: str) -> str:
    storage_path = f"curriculum_assignments/{assignment_id}/body.html"
    supabase_admin.storage.from_(BUCKET).upload(
        path=storage_path,
        file=body.encode("utf-8"),
        file_options={"content-type": "text/html", "upsert": "true"},
    )
    return storage_path


@router.get("/units/{unit_id}/assignments")
async def list_curriculum_assignments(unit_id: str, user: CurrentUser = Depends(require_admin)):
    response = (
        supabase_admin.table("curriculum_assignments")
        .select("*")
        .eq("unit_id", unit_id)
        .order("order_index")
        .execute()
    )
    return response.data or []


@router.post("/units/{unit_id}/assignments", status_code=201)
async def create_curriculum_assignment(
    unit_id: str,
    body: CurriculumAssignmentCreate,
    user: CurrentUser = Depends(require_admin),
):
    if body.assignment_type not in _VALID_ASSIGNMENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid assignment_type.")
    if body.pairing_strategy and body.pairing_strategy not in _VALID_PAIRING_STRATEGIES:
        raise HTTPException(status_code=400, detail="Invalid pairing_strategy.")
    if body.default_comparison is not None and body.default_comparison not in _VALID_COMPARISONS:
        raise HTTPException(status_code=400, detail="Invalid default_comparison.")
    if body.collab_strategy is not None and body.collab_strategy not in (
        "random", "similar_grade", "opposite_grade", "manual", "student_choice"
    ):
        raise HTTPException(status_code=400, detail="Invalid collab_strategy.")
    if body.collab_group_size is not None and (body.collab_group_size < 1 or body.collab_group_size > 6):
        raise HTTPException(status_code=400, detail="collab_group_size must be 1–6.")
    unit = supabase_admin.table("units").select("id").eq("id", unit_id).maybe_single().execute()
    if not unit or not unit.data:
        raise HTTPException(status_code=404, detail="Unit not found.")

    raw = body.model_dump()
    html_body = raw.pop("html_body", None)
    raw["test_cases"] = _validate_test_cases(raw.get("test_cases"))
    row = {**raw, "unit_id": unit_id}
    if row.get("order_index") is None:
        row["order_index"] = _next_order_for("curriculum_assignments", "unit_id", unit_id)
    result = supabase_admin.table("curriculum_assignments").insert(row).execute()
    assignment_id = result.data[0]["id"]

    if html_body:
        path = _upload_assignment_html(assignment_id, html_body)
        supabase_admin.table("curriculum_assignments").update({"html_file_path": path}).eq("id", assignment_id).execute()

    return supabase_admin.table("curriculum_assignments").select("*").eq("id", assignment_id).single().execute().data


@router.get("/assignments/{assignment_id}")
async def get_curriculum_assignment(assignment_id: str, user: CurrentUser = Depends(require_admin)):
    response = (
        supabase_admin.table("curriculum_assignments")
        .select("*")
        .eq("id", assignment_id)
        .maybe_single()
        .execute()
    )
    if not response or not response.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    data = response.data
    # Hydrate the activity HTML body so the editor can populate.
    if data.get("html_file_path"):
        data["html_body"] = _download_html(data["html_file_path"])
    else:
        data["html_body"] = None
    return data


@router.patch("/assignments/{assignment_id}")
async def update_curriculum_assignment(
    assignment_id: str,
    body: CurriculumAssignmentUpdate,
    user: CurrentUser = Depends(require_admin),
):
    if body.assignment_type and body.assignment_type not in _VALID_ASSIGNMENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid assignment_type.")
    if body.pairing_strategy and body.pairing_strategy not in _VALID_PAIRING_STRATEGIES:
        raise HTTPException(status_code=400, detail="Invalid pairing_strategy.")
    if body.default_comparison is not None and body.default_comparison not in _VALID_COMPARISONS:
        raise HTTPException(status_code=400, detail="Invalid default_comparison.")
    if body.collab_strategy is not None and body.collab_strategy not in (
        "random", "similar_grade", "opposite_grade", "manual", "student_choice"
    ):
        raise HTTPException(status_code=400, detail="Invalid collab_strategy.")
    if body.collab_group_size is not None and (body.collab_group_size < 1 or body.collab_group_size > 6):
        raise HTTPException(status_code=400, detail="collab_group_size must be 1–6.")
    raw = body.model_dump()
    html_body = raw.pop("html_body", None)
    # Validate test_cases shape if the caller is sending them. An empty
    # list clears the test cases; None means leave them unchanged.
    if "test_cases" in raw and raw["test_cases"] is not None:
        raw["test_cases"] = _validate_test_cases(raw["test_cases"])
    updates = {k: v for k, v in raw.items() if v is not None}

    if updates:
        response = (
            supabase_admin.table("curriculum_assignments")
            .update(updates)
            .eq("id", assignment_id)
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Assignment not found.")

    if html_body is not None:
        if html_body:
            path = _upload_assignment_html(assignment_id, html_body)
            supabase_admin.table("curriculum_assignments").update({"html_file_path": path}).eq("id", assignment_id).execute()
        else:
            supabase_admin.table("curriculum_assignments").update({"html_file_path": None}).eq("id", assignment_id).execute()

    if not updates and html_body is None:
        raise HTTPException(status_code=400, detail="No fields to update.")

    return supabase_admin.table("curriculum_assignments").select("*").eq("id", assignment_id).single().execute().data


@router.delete("/assignments/{assignment_id}", status_code=204)
async def delete_curriculum_assignment(assignment_id: str, user: CurrentUser = Depends(require_admin)):
    supabase_admin.table("curriculum_assignments").delete().eq("id", assignment_id).execute()


# ============================================================
# QUIZ QUESTIONS (per curriculum assignment, type=quiz)
# ============================================================

@router.get("/assignments/{assignment_id}/questions")
async def list_quiz_questions(assignment_id: str, user: CurrentUser = Depends(require_admin)):
    response = (
        supabase_admin.table("quiz_questions")
        .select("*")
        .eq("curriculum_assignment_id", assignment_id)
        .order("order_index")
        .execute()
    )
    return response.data or []


@router.post("/assignments/{assignment_id}/questions/upload-csv")
async def upload_quiz_questions_csv(
    assignment_id: str,
    file: UploadFile = File(...),
    replace: bool = Form(True),
    user: CurrentUser = Depends(require_admin),
):
    """
    Parses an uploaded CSV and (re)populates the quiz questions for the
    assignment.

    Expected columns (case-insensitive, order-insensitive):
      question_type, question, code, a, b, c, d, correct_answer
    """
    # Sanity: assignment must exist and be a quiz
    assignment = (
        supabase_admin.table("curriculum_assignments")
        .select("id, assignment_type")
        .eq("id", assignment_id)
        .maybe_single()
        .execute()
    )
    if not assignment or not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if assignment.data.get("assignment_type") != "quiz":
        raise HTTPException(status_code=400, detail="Assignment is not a quiz.")

    body = (await file.read()).decode("utf-8", errors="replace")
    # Handle BOM and trim
    body = body.lstrip("﻿").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Empty CSV.")

    reader = csv.DictReader(io.StringIO(body))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="No CSV header found.")

    # Normalize headers
    field_map = {name.strip().lower(): name for name in reader.fieldnames}
    required = ["question_type", "question", "correct_answer"]
    missing = [r for r in required if r not in field_map]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing CSV columns: {', '.join(missing)}")

    def cell(row, key):
        original = field_map.get(key)
        return (row.get(original) or "").strip() if original else ""

    rows = []
    errors: list[str] = []
    for line_num, row in enumerate(reader, start=2):  # account for header on line 1
        qtype = cell(row, "question_type").lower().replace("-", "_")
        if qtype in ("mc", "multiple choice", "multiple_choice"):
            qtype = "multiple_choice"
        elif qtype in ("cr", "constructed response", "constructed_response", "free_response"):
            qtype = "constructed_response"
        else:
            errors.append(f"Row {line_num}: unknown question_type '{qtype}'")
            continue

        qtext = cell(row, "question")
        if not qtext:
            errors.append(f"Row {line_num}: 'question' is empty")
            continue

        code_block = cell(row, "code") or None
        choice_a = cell(row, "a") or None
        choice_b = cell(row, "b") or None
        choice_c = cell(row, "c") or None
        choice_d = cell(row, "d") or None
        correct = (cell(row, "correct_answer") or "").lower() or None

        if qtype == "multiple_choice":
            if not (choice_a and choice_b):
                errors.append(f"Row {line_num}: multiple_choice needs at least choices a and b")
                continue
            if correct not in ("a", "b", "c", "d"):
                errors.append(f"Row {line_num}: correct_answer must be a/b/c/d for multiple_choice")
                continue
        else:
            # constructed response: no choices, no correct_answer required
            choice_a = choice_b = choice_c = choice_d = None
            correct = None

        rows.append({
            "curriculum_assignment_id": assignment_id,
            "order_index": len(rows) + 1,
            "question_type": qtype,
            "question_text": qtext,
            "code_block": code_block,
            "choice_a": choice_a,
            "choice_b": choice_b,
            "choice_c": choice_c,
            "choice_d": choice_d,
            "correct_answer": correct,
        })

    if errors and not rows:
        raise HTTPException(status_code=400, detail="No valid rows. " + " | ".join(errors[:5]))

    if replace:
        supabase_admin.table("quiz_questions").delete().eq("curriculum_assignment_id", assignment_id).execute()

    inserted = 0
    if rows:
        result = supabase_admin.table("quiz_questions").insert(rows).execute()
        inserted = len(result.data or [])

    return {"inserted": inserted, "errors": errors}


@router.delete("/assignments/{assignment_id}/questions/{question_id}", status_code=204)
async def delete_quiz_question(
    assignment_id: str,
    question_id: str,
    user: CurrentUser = Depends(require_admin),
):
    supabase_admin.table("quiz_questions").delete().eq("id", question_id).eq("curriculum_assignment_id", assignment_id).execute()


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
