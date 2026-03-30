# ============================================================
# COMMIT PLATFORM — Assignments Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

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


class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    instructions: Optional[str] = None
    starter_code: Optional[str] = None
    min_commits: Optional[int] = None
    scaffold_level: Optional[str] = None
    due_date: Optional[str] = None
    allow_collab: Optional[bool] = None


# ============================================================
# ROUTES
# ============================================================

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
            "lesson_id": body.lesson_id,
            "title": body.title,
            "instructions": body.instructions,
            "starter_code": body.starter_code,
            "min_commits": max(1, body.min_commits),
            "scaffold_level": body.scaffold_level,
            "due_date": body.due_date or None,
            "allow_collab": body.allow_collab,
        })
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment.")

    return result.data[0]


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