# ============================================================
# COMMIT PLATFORM — Assignments Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from pydantic import BaseModel
from typing import Optional, List
import uuid

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin, get_user_client

router = APIRouter()


# ============================================================
# SCHEMAS
# ============================================================

class AssignmentCreate(BaseModel):
    classroom_id: str
    lesson_id: Optional[str] = None
    title: str
    instructions: Optional[str] = None
    starter_code: str = ''
    min_commits: int = 1
    scaffold_level: str = 'typed_python'
    due_date: Optional[str] = None
    allow_collab: bool = False
    assignment_type: str = 'code'
    is_graded: bool = True
    standards_tags: Optional[List[str]] = []
    hints_enabled: bool = True
    hint_1: Optional[str] = None
    hint_2: Optional[str] = None


class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    instructions: Optional[str] = None
    starter_code: Optional[str] = None
    min_commits: Optional[int] = None
    scaffold_level: Optional[str] = None
    due_date: Optional[str] = None
    allow_collab: Optional[bool] = None
    hints_enabled: Optional[bool] = None
    hint_1: Optional[str] = None
    hint_2: Optional[str] = None


# ============================================================
# ROUTES
# ============================================================

@router.get("/ungraded-queue")
async def get_ungraded_queue(
    user: CurrentUser = Depends(require_teacher),
):
    """Returns all assignments with ungraded submitted submissions for the teacher's classrooms."""
    classrooms = (
        supabase_admin.table("classrooms")
        .select("id, name")
        .eq("teacher_id", user.profile_id)
        .eq("archived", False)
        .execute()
    )
    if not classrooms.data:
        return []

    classroom_ids = [c["id"] for c in classrooms.data]
    classroom_map = {c["id"]: c["name"] for c in classrooms.data}

    assignments = (
        supabase_admin.table("assignments")
        .select("id, title, classroom_id, assignment_type")
        .in_("classroom_id", classroom_ids)
        .execute()
    )
    if not assignments.data:
        return []

    results = []
    for assignment in assignments.data:
        ungraded = (
            supabase_admin.table("submissions")
            .select("id", count="exact")
            .eq("assignment_id", assignment["id"])
            .not_.is_("submitted_at", "null")
            .is_("grade", "null")
            .execute()
        )
        count = ungraded.count or 0
        if count > 0:
            results.append({
                "assignment_id": assignment["id"],
                "assignment_title": assignment["title"],
                "classroom_id": assignment["classroom_id"],
                "classroom_name": classroom_map.get(assignment["classroom_id"], "Unknown"),
                "ungraded_count": count,
                "assignment_type": assignment.get("assignment_type", "code"),
            })

    results.sort(key=lambda x: x["ungraded_count"], reverse=True)
    return results


@router.get("/")
async def list_assignments(
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns all assignments for a classroom."""
    client = get_user_client(user.access_token)
    response = (
        client.table("assignments")
        .select("*")
        .eq("classroom_id", classroom_id)
        .order("created_at", desc=False)
        .execute()
    )
    return response.data or []


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate,
    user: CurrentUser = Depends(require_teacher),
):
    """Creates a new assignment in a classroom."""
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", body.classroom_id)
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found or access denied.")

    if body.scaffold_level not in ('block_pseudo', 'typed_pseudo', 'block_python', 'typed_python'):
        raise HTTPException(status_code=400, detail="Invalid scaffold level.")

    result = (
        supabase_admin.table("assignments")
        .insert({
            "classroom_id": body.classroom_id,
            "lesson_id": body.lesson_id or None,
            "title": body.title,
            "instructions": body.instructions,
            "starter_code": body.starter_code,
            "min_commits": max(0, body.min_commits) if body.assignment_type != 'code' else max(1, body.min_commits),
            "scaffold_level": body.scaffold_level,
            "due_date": body.due_date or None,
            "allow_collab": body.allow_collab,
            "assignment_type": body.assignment_type,
            "is_graded": body.is_graded,
            "standards_tags": body.standards_tags or [],
            "hints_enabled": body.hints_enabled,
            "hint_1": body.hint_1,
            "hint_2": body.hint_2,
        })
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment.")

    return result.data[0]


@router.get("/{assignment_id}/analytics")
async def get_assignment_analytics(
    assignment_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns analytics for a single assignment."""
    from datetime import datetime, timezone

    assignment = (
        supabase_admin.table("assignments")
        .select("id, classroom_id, title, min_commits")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom_id = assignment.data["classroom_id"]

    members = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_id)
        .execute()
    )
    total_students = len(members.data or [])

    if total_students == 0:
        return {
            "total_students": 0, "submitted_count": 0, "submission_rate": 0,
            "graded_count": 0, "avg_grade": None, "avg_commits": None,
            "avg_time_to_submit_minutes": None,
            "grade_distribution": {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0},
            "hint_usage": {"none": 0, "hint1_only": 0, "hint2": 0},
        }

    submissions = (
        supabase_admin.table("submissions")
        .select("id, submitted_at, grade, first_opened_at, hint_count, hint_1_unlocked_at, hint_2_unlocked_at")
        .eq("assignment_id", assignment_id)
        .execute()
    )
    subs = submissions.data or []

    submitted_subs = [s for s in subs if s.get("submitted_at")]
    graded_subs = [s for s in subs if s.get("grade") is not None]

    grades = [s["grade"] for s in graded_subs]
    avg_grade = round(sum(grades) / len(grades), 1) if grades else None

    dist = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for g in grades:
        if g >= 90: dist["A"] += 1
        elif g >= 80: dist["B"] += 1
        elif g >= 70: dist["C"] += 1
        elif g >= 60: dist["D"] += 1
        else: dist["F"] += 1

    commit_counts = []
    for s in submitted_subs:
        count = supabase_admin.table("code_commits").select("id", count="exact").eq("submission_id", s["id"]).execute()
        commit_counts.append(count.count or 0)
    avg_commits = round(sum(commit_counts) / len(commit_counts), 1) if commit_counts else None

    times = []
    for s in submitted_subs:
        if s.get("first_opened_at") and s.get("submitted_at"):
            try:
                opened = datetime.fromisoformat(s["first_opened_at"].replace("Z", "+00:00"))
                submitted = datetime.fromisoformat(s["submitted_at"].replace("Z", "+00:00"))
                minutes = (submitted - opened).total_seconds() / 60
                if minutes > 0:
                    times.append(minutes)
            except Exception:
                pass
    avg_time = round(sum(times) / len(times), 0) if times else None

    hint_usage = {
        "none": sum(1 for s in subs if not s.get("hint_1_unlocked_at")),
        "hint1_only": sum(1 for s in subs if s.get("hint_1_unlocked_at") and not s.get("hint_2_unlocked_at")),
        "hint2": sum(1 for s in subs if s.get("hint_2_unlocked_at")),
    }

    return {
        "total_students": total_students,
        "submitted_count": len(submitted_subs),
        "submission_rate": round(len(submitted_subs) / total_students * 100),
        "graded_count": len(graded_subs),
        "avg_grade": avg_grade,
        "avg_commits": avg_commits,
        "avg_time_to_submit_minutes": int(avg_time) if avg_time else None,
        "grade_distribution": dist,
        "hint_usage": hint_usage,
    }


@router.get("/{assignment_id}")
async def get_assignment(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a single assignment."""
    client = get_user_client(user.access_token)
    response = (
        client.table("assignments")
        .select("*")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return response.data


@router.patch("/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    body: AssignmentUpdate,
    user: CurrentUser = Depends(require_teacher),
):
    """Updates an assignment."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    existing = (
        supabase_admin.table("assignments")
        .select("classroom_id")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", existing.data["classroom_id"])
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=403, detail="Access denied.")

    result = (
        supabase_admin.table("assignments")
        .update(updates)
        .eq("id", assignment_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update assignment.")
    return result.data[0]


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Deletes an assignment."""
    existing = (
        supabase_admin.table("assignments")
        .select("classroom_id")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", existing.data["classroom_id"])
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=403, detail="Access denied.")

    supabase_admin.table("assignments").delete().eq("id", assignment_id).execute()


# ============================================================
# INSTRUCTIONS HTML UPLOAD
# ============================================================

@router.post("/{assignment_id}/upload-instructions")
async def upload_instructions_html(
    assignment_id: str,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
):
    """Uploads an HTML file as the rich instructions for an assignment."""
    existing = (
        supabase_admin.table("assignments")
        .select("classroom_id, instructions_html_path")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", existing.data["classroom_id"])
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=403, detail="Access denied.")

    if not file.filename.endswith(".html"):
        raise HTTPException(status_code=400, detail="Only .html files are accepted.")

    contents = await file.read()

    old_path = existing.data.get("instructions_html_path")
    if old_path:
        try:
            supabase_admin.storage.from_("assignment-instructions").remove([old_path])
        except Exception:
            pass

    file_path = f"{assignment_id}/instructions.html"
    supabase_admin.storage.from_("assignment-instructions").upload(
        path=file_path,
        file=contents,
        file_options={"content-type": "text/html", "upsert": "true"},
    )

    supabase_admin.table("assignments").update({
        "instructions_html_path": file_path
    }).eq("id", assignment_id).execute()

    return {"instructions_html_path": file_path}


@router.get("/{assignment_id}/instructions-url")
async def get_instructions_url(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a signed URL for the assignment's HTML instructions file."""
    assignment = (
        supabase_admin.table("assignments")
        .select("instructions_html_path")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not assignment.data or not assignment.data.get("instructions_html_path"):
        return {"url": None}

    signed = supabase_admin.storage.from_("assignment-instructions").create_signed_url(
        assignment.data["instructions_html_path"],
        expires_in=3600,
    )
    return {"url": signed.get("signedURL") or signed.get("signed_url")}


@router.delete("/{assignment_id}/upload-instructions")
async def delete_instructions_html(
    assignment_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Removes the HTML instructions file and reverts to plain text only."""
    existing = (
        supabase_admin.table("assignments")
        .select("classroom_id, instructions_html_path")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", existing.data["classroom_id"])
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=403, detail="Access denied.")

    path = existing.data.get("instructions_html_path")
    if path:
        try:
            supabase_admin.storage.from_("assignment-instructions").remove([path])
        except Exception:
            pass
        supabase_admin.table("assignments").update({
            "instructions_html_path": None
        }).eq("id", assignment_id).execute()

    return {"ok": True}