# ============================================================
# COMMIT PLATFORM — Curriculum Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import os

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin

router = APIRouter()

STORAGE_BUCKET = "lesson-content"


# ============================================================
# ROUTES
# ============================================================

@router.get("/units")
async def list_units(user: CurrentUser = Depends(get_current_user)):
    """Returns all published units with their lessons."""
    units = (
        supabase_admin.table("units")
        .select("*, lessons(id, order_index, title, scaffold_level, is_published)")
        .eq("is_published", True)
        .order("order_index")
        .execute()
    )
    return units.data or []


@router.get("/units/{unit_id}")
async def get_unit(
    unit_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a single unit with all its lessons."""
    unit = (
        supabase_admin.table("units")
        .select("*, lessons(*, lesson_content(*))")
        .eq("id", unit_id)
        .single()
        .execute()
    )
    if not unit.data:
        raise HTTPException(status_code=404, detail="Unit not found.")
    return unit.data


@router.get("/lessons/{lesson_id}")
async def get_lesson(
    lesson_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a lesson with its content metadata."""
    lesson = (
        supabase_admin.table("lessons")
        .select("*, lesson_content(*), units(id, title, order_index)")
        .eq("id", lesson_id)
        .single()
        .execute()
    )
    if not lesson.data:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    # Normalize lesson_content from array to single object
    data = lesson.data
    lc = data.get("lesson_content")
    if isinstance(lc, list):
        data["lesson_content"] = lc[0] if lc else None

    return data


@router.get("/lessons/{lesson_id}/url")
async def get_lesson_html_url(
    lesson_id: str,
    file_type: str = "lesson",
    user: CurrentUser = Depends(get_current_user),
):
    """
    Returns a signed URL for the lesson HTML file.
    file_type: 'lesson' or 'activity'
    Signed URLs expire after 1 hour.
    """
    lesson = (
        supabase_admin.table("lesson_content")
        .select("html_file_path, activity_file_path")
        .eq("lesson_id", lesson_id)
        .single()
        .execute()
    )
    if not lesson.data:
        raise HTTPException(status_code=404, detail="Lesson content not found.")

    path = lesson.data.get("html_file_path") if file_type == "lesson" else lesson.data.get("activity_file_path")

    if not path:
        raise HTTPException(status_code=404, detail=f"No {file_type} file for this lesson.")

    try:
        signed = supabase_admin.storage.from_(STORAGE_BUCKET).create_signed_url(path, 3600)
        return {"url": signed["signedURL"], "expires_in": 3600}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate URL: {str(e)}")


@router.get("/lessons/{lesson_id}/activity-url")
async def get_activity_url(
    lesson_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a signed URL for a lesson's activity HTML file."""
    lesson_content = (
        supabase_admin.table("lesson_content")
        .select("activity_file_path")
        .eq("lesson_id", lesson_id)
        .single()
        .execute()
    )

    if not lesson_content.data or not lesson_content.data.get("activity_file_path"):
        return {"url": None}

    path = lesson_content.data["activity_file_path"]

    try:
        signed = supabase_admin.storage.from_(STORAGE_BUCKET).create_signed_url(path, 3600)
        return {"url": signed.get("signedURL") or signed.get("signedUrl")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate URL: {str(e)}")


@router.get("/classroom/{classroom_id}/unlocked")
async def get_unlocked_lessons(
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns all lessons unlocked for a classroom, grouped by unit."""
    unlocks = (
        supabase_admin.table("classroom_lesson_unlocks")
        .select("lesson_id, lessons(*, units(id, title, order_index), lesson_content(*))")
        .eq("classroom_id", classroom_id)
        .execute()
    )
    return unlocks.data or []


@router.post("/classroom/{classroom_id}/unlock/{lesson_id}")
async def unlock_lesson(
    classroom_id: str,
    lesson_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Teacher unlocks a lesson for their classroom."""
    # Verify teacher owns classroom
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", classroom_id)
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")

    result = supabase_admin.table("classroom_lesson_unlocks").insert({
        "classroom_id": classroom_id,
        "lesson_id": lesson_id,
        "unlocked_by": user.profile_id,
    }).execute()

    return {"unlocked": True}


@router.delete("/classroom/{classroom_id}/unlock/{lesson_id}")
async def lock_lesson(
    classroom_id: str,
    lesson_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Teacher locks a lesson for their classroom."""
    supabase_admin.table("classroom_lesson_unlocks").delete().eq(
        "classroom_id", classroom_id
    ).eq("lesson_id", lesson_id).execute()
    return {"locked": True}