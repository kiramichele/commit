# ============================================================
# COMMIT PLATFORM — Exercise Responses Router
# backend/routers/exercise_responses.py
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin

router = APIRouter()


class SaveResponse(BaseModel):
    lesson_id: str
    exercise_index: int
    exercise_type: str          # 'free_response' | 'multiple_choice' | 'short_answer'
    response_text: Optional[str] = None
    selected_choice: Optional[str] = None
    is_correct: Optional[bool] = None
    word_count: Optional[int] = None


@router.post("/save")
async def save_response(
    body: SaveResponse,
    user: CurrentUser = Depends(get_current_user),
):
    """Upserts a student's response to an exercise."""
    # user.profile_id = profiles.id (the UUID primary key)
    existing = (
        supabase_admin.table("exercise_responses")
        .select("id")
        .eq("student_id", user.profile_id)
        .eq("lesson_id", body.lesson_id)
        .eq("exercise_index", body.exercise_index)
        .execute()
    )

    data = {
        "student_id": user.profile_id,
        "lesson_id": body.lesson_id,
        "exercise_index": body.exercise_index,
        "exercise_type": body.exercise_type,
        "response_text": body.response_text,
        "selected_choice": body.selected_choice,
        "is_correct": body.is_correct,
        "word_count": body.word_count,
    }

    if existing.data:
        result = (
            supabase_admin.table("exercise_responses")
            .update(data)
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        result = supabase_admin.table("exercise_responses").insert(data).execute()

    return result.data[0] if result.data else {}


@router.get("/lesson/{lesson_id}/my")
async def get_my_responses(
    lesson_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the current student's responses for a lesson."""
    result = (
        supabase_admin.table("exercise_responses")
        .select("*")
        .eq("lesson_id", lesson_id)
        .eq("student_id", user.profile_id)
        .order("exercise_index")
        .execute()
    )
    return result.data or []


@router.get("/lesson/{lesson_id}/all")
async def get_all_responses(
    lesson_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns all student responses for a lesson (teacher only)."""
    result = (
        supabase_admin.table("exercise_responses")
        .select("*, profiles!exercise_responses_student_id_fkey(display_name)")
        .eq("lesson_id", lesson_id)
        .order("exercise_index")
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []