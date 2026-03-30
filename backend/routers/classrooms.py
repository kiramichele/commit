# ============================================================
# COMMIT PLATFORM — Classrooms Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import random
import string

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin, get_user_client

router = APIRouter()

FREE_TIER_CLASSROOM_LIMIT = 3


# ============================================================
# SCHEMAS
# ============================================================

class ClassroomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sequential_unlock: bool = True
    collab_enabled: bool = False
    standup_enabled: bool = False
    standup_frequency_days: int = 7
    discussion_enabled: bool = True


class ClassroomUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sequential_unlock: Optional[bool] = None
    collab_enabled: Optional[bool] = None
    standup_enabled: Optional[bool] = None
    standup_frequency_days: Optional[int] = None
    discussion_enabled: Optional[bool] = None
    archived: Optional[bool] = None


class StudentCreate(BaseModel):
    display_name: str
    email: str
    password: str


# ============================================================
# HELPERS
# ============================================================

def generate_join_code() -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(chars, k=6))


def unique_join_code() -> str:
    """Generates a join code guaranteed to be unique in the DB."""
    for _ in range(10):
        code = generate_join_code()
        existing = (
            supabase_admin.table("classrooms")
            .select("id")
            .eq("join_code", code)
            .execute()
        )
        if not existing.data:
            return code
    raise HTTPException(status_code=500, detail="Could not generate a unique join code.")


# ============================================================
# ROUTES
# ============================================================

@router.get("/")
async def list_classrooms(user: CurrentUser = Depends(get_current_user)):
    """Returns classrooms for the current user (teacher: own, student: joined)."""
    client = get_user_client(user.access_token)

    if user.role in ("teacher", "admin"):
        response = (
            client.table("classrooms")
            .select("*, classroom_members(count)")
            .eq("teacher_id", user.profile_id)
            .eq("archived", False)
            .order("created_at", desc=True)
            .execute()
        )
    else:
        response = (
            client.table("classroom_members")
            .select("classroom_id, classrooms(*)")
            .eq("student_id", user.profile_id)
            .execute()
        )

    return response.data


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_classroom(
    body: ClassroomCreate,
    user: CurrentUser = Depends(require_teacher),
):
    """Creates a new classroom. Enforces free tier limit."""
    # Check classroom limit for free tier
    existing = (
        supabase_admin.table("classrooms")
        .select("id", count="exact")
        .eq("teacher_id", user.profile_id)
        .eq("archived", False)
        .execute()
    )
    current_count = existing.count or 0

    # TODO: check if teacher has pro subscription before enforcing limit
    if current_count >= FREE_TIER_CLASSROOM_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Free tier allows up to {FREE_TIER_CLASSROOM_LIMIT} active classrooms. "
                   "Upgrade to Teacher Pro for unlimited classrooms.",
        )

    join_code = unique_join_code()

    response = (
        supabase_admin.table("classrooms")
        .insert({
            "teacher_id": user.profile_id,
            "name": body.name,
            "description": body.description,
            "join_code": join_code,
            "sequential_unlock": body.sequential_unlock,
            "collab_enabled": body.collab_enabled,
            "standup_enabled": body.standup_enabled,
            "standup_frequency_days": body.standup_frequency_days,
            "discussion_enabled": body.discussion_enabled,
        })
        .select()
        .single()
        .execute()
    )

    return response.data


@router.get("/{classroom_id}")
async def get_classroom(
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a single classroom. RLS ensures access control."""
    client = get_user_client(user.access_token)
    response = (
        client.table("classrooms")
        .select("*")
        .eq("id", classroom_id)
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")
    return response.data


@router.patch("/{classroom_id}")
async def update_classroom(
    classroom_id: str,
    body: ClassroomUpdate,
    user: CurrentUser = Depends(require_teacher),
):
    """Updates classroom settings. Only the owning teacher can do this."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    response = (
        supabase_admin.table("classrooms")
        .update(updates)
        .eq("id", classroom_id)
        .eq("teacher_id", user.profile_id)
        .select()
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Classroom not found or access denied.")
    return response.data


@router.delete("/{classroom_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_classroom(
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Soft-deletes (archives) a classroom."""
    supabase_admin.table("classrooms").update({"archived": True}).eq(
        "id", classroom_id
    ).eq("teacher_id", user.profile_id).execute()


@router.get("/{classroom_id}/students")
async def list_students(
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns all students in a classroom with their progress summary."""
    response = supabase_admin.rpc(
        "classroom_progress_summary", {"p_classroom_id": classroom_id}
    ).execute()
    return response.data


@router.post("/{classroom_id}/students", status_code=status.HTTP_201_CREATED)
async def add_student(
    classroom_id: str,
    body: StudentCreate,
    user: CurrentUser = Depends(require_teacher),
):
    """
    Teacher creates a student account and adds them to the classroom.
    Uses the service role to create the auth user.
    """
    # Verify teacher owns this classroom
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", classroom_id)
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found or access denied.")

    # Check student count limit (45 per classroom)
    members = (
        supabase_admin.table("classroom_members")
        .select("id", count="exact")
        .eq("classroom_id", classroom_id)
        .execute()
    )
    if (members.count or 0) >= 45:
        raise HTTPException(
            status_code=403,
            detail="Classroom is at the 45 student limit.",
        )

    # Call the DB function to create auth user + profile + membership
    result = supabase_admin.rpc(
        "create_student_account",
        {
            "p_email": body.email,
            "p_password": body.password,
            "p_display_name": body.display_name,
            "p_classroom_id": classroom_id,
            "p_teacher_id": user.profile_id,
        },
    ).execute()

    return {"profile_id": result.data, "display_name": body.display_name}


@router.get("/{classroom_id}/suspicious-commits")
async def get_suspicious_commits(
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns commits flagged as potentially suspicious for this classroom."""
    response = supabase_admin.rpc(
        "flag_suspicious_commits", {"p_classroom_id": classroom_id}
    ).execute()
    return response.data