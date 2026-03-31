# ============================================================
# COMMIT PLATFORM — Help Requests Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin

router = APIRouter()


# ============================================================
# SCHEMAS
# ============================================================

class HelpRequestCreate(BaseModel):
    submission_id: str
    classroom_id: str
    note: Optional[str] = None


class HelpRequestUpdate(BaseModel):
    status: str  # 'in_progress' | 'resolved'


# ============================================================
# ROUTES
# ============================================================

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_help_request(
    body: HelpRequestCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Student raises their hand on an assignment."""
    existing = (
        supabase_admin.table("help_requests")
        .select("id")
        .eq("submission_id", body.submission_id)
        .eq("student_id", user.profile_id)
        .eq("status", "open")
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=400,
            detail="You already have an open help request for this assignment."
        )

    result = supabase_admin.table("help_requests").insert({
        "submission_id": body.submission_id,
        "student_id": user.profile_id,
        "classroom_id": body.classroom_id,
        "note": body.note,
        "status": "open",
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create help request.")

    return result.data[0]


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_help_request(
    request_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Student cancels their own help request."""
    supabase_admin.table("help_requests").update({
        "status": "resolved",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).eq("student_id", user.profile_id).execute()


@router.get("/classroom/{classroom_id}")
async def list_classroom_help_requests(
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns all open/in-progress help requests for a classroom."""
    response = (
        supabase_admin.table("help_requests")
        .select("*, profiles!help_requests_student_id_fkey(display_name, email), submissions(assignment_id, assignments(title))")
        .eq("classroom_id", classroom_id)
        .in_("status", ["open", "in_progress"])
        .order("created_at", desc=False)
        .execute()
    )
    return response.data or []


@router.get("/student/{submission_id}")
async def get_student_help_request(
    submission_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the current help request status for a student's submission."""
    response = (
        supabase_admin.table("help_requests")
        .select("*")
        .eq("submission_id", submission_id)
        .eq("student_id", user.profile_id)
        .in_("status", ["open", "in_progress"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


@router.patch("/{request_id}")
async def update_help_request(
    request_id: str,
    body: HelpRequestUpdate,
    user: CurrentUser = Depends(require_teacher),
):
    """Teacher claims or resolves a help request."""
    if body.status not in ("in_progress", "resolved"):
        raise HTTPException(status_code=400, detail="Invalid status.")

    updates = {"status": body.status}

    if body.status == "in_progress":
        updates["claimed_by"] = user.profile_id

    if body.status == "resolved":
        updates["resolved_at"] = datetime.now(timezone.utc).isoformat()

    result = (
        supabase_admin.table("help_requests")
        .update(updates)
        .eq("id", request_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Help request not found.")
    return result.data[0]