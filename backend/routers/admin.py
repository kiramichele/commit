# ============================================================
# COMMIT PLATFORM — Admin Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from auth_deps import CurrentUser, require_admin
from db import supabase_admin

router = APIRouter()


# ============================================================
# SCHEMAS
# ============================================================

class ApprovalAction(BaseModel):
    action: str  # 'approved' or 'rejected'
    notes: Optional[str] = None


# ============================================================
# ROUTES
# ============================================================

@router.get("/applications")
async def list_applications(
    status: Optional[str] = None,
    user: CurrentUser = Depends(require_admin),
):
    """Returns all teacher applications, optionally filtered by status."""
    query = (
        supabase_admin.table("profiles")
        .select("id, display_name, email, school_name, state, application_notes, approval_status, created_at")
        .eq("role", "teacher")
        .order("created_at", desc=True)
    )
    if status:
        query = query.eq("approval_status", status)
    return query.execute().data


@router.patch("/applications/{profile_id}")
async def review_application(
    profile_id: str,
    body: ApprovalAction,
    user: CurrentUser = Depends(require_admin),
):
    """Approve or reject a teacher application."""
    if body.action not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Action must be 'approved' or 'rejected'.")

    response = (
        supabase_admin.table("profiles")
        .update({"approval_status": body.action})
        .eq("id", profile_id)
        .eq("role", "teacher")
        .select()
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Teacher profile not found.")

    return {
        "profile_id": profile_id,
        "approval_status": body.action,
        "display_name": response.data["display_name"],
        "email": response.data["email"],
    }


@router.get("/stats")
async def platform_stats(user: CurrentUser = Depends(require_admin)):
    """High-level platform statistics."""
    teachers_total   = supabase_admin.table("profiles").select("id", count="exact").eq("role", "teacher").execute()
    teachers_pending = supabase_admin.table("profiles").select("id", count="exact").eq("role", "teacher").eq("approval_status", "pending").execute()
    teachers_approved= supabase_admin.table("profiles").select("id", count="exact").eq("role", "teacher").eq("approval_status", "approved").execute()
    students_total   = supabase_admin.table("profiles").select("id", count="exact").eq("role", "student").execute()
    classrooms_total = supabase_admin.table("classrooms").select("id", count="exact").eq("archived", False).execute()
    submissions_total= supabase_admin.table("submissions").select("id", count="exact").execute()
    commits_total    = supabase_admin.table("code_commits").select("id", count="exact").execute()

    return {
        "teachers":    {"total": teachers_total.count or 0, "pending": teachers_pending.count or 0, "approved": teachers_approved.count or 0},
        "students":    {"total": students_total.count or 0},
        "classrooms":  {"total": classrooms_total.count or 0},
        "submissions": {"total": submissions_total.count or 0},
        "commits":     {"total": commits_total.count or 0},
    }


@router.get("/classrooms")
async def list_all_classrooms(
    user: CurrentUser = Depends(require_admin),
):
    """Returns all classrooms on the platform with teacher info."""
    response = (
        supabase_admin.table("classrooms")
        .select("*, profiles!classrooms_teacher_id_fkey(display_name, email, school_name)")
        .eq("archived", False)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


@router.get("/classrooms/{classroom_id}/students")
async def admin_classroom_students(
    classroom_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Returns progress summary for any classroom."""
    response = supabase_admin.rpc(
        "classroom_progress_summary", {"p_classroom_id": classroom_id}
    ).execute()
    return response.data or []


@router.get("/classrooms/{classroom_id}/assignments")
async def admin_classroom_assignments(
    classroom_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Returns assignments for any classroom."""
    response = (
        supabase_admin.table("assignments")
        .select("*")
        .eq("classroom_id", classroom_id)
        .order("created_at")
        .execute()
    )
    return response.data or []
