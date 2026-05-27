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

# ============================================================
# PROJECTS (admin)
# ============================================================

class ProjectCreate(BaseModel):
    order_index: int
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
    order_index: int
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
    html_body: Optional[str] = None  # for activity-type — uploaded to storage


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


_VALID_ASSIGNMENT_TYPES = {"code", "activity", "checkin", "quiz", "project"}


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
    unit = supabase_admin.table("units").select("id").eq("id", unit_id).maybe_single().execute()
    if not unit or not unit.data:
        raise HTTPException(status_code=404, detail="Unit not found.")

    raw = body.model_dump()
    html_body = raw.pop("html_body", None)
    row = {**raw, "unit_id": unit_id}
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
    raw = body.model_dump()
    html_body = raw.pop("html_body", None)
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
