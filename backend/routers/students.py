# ============================================================
# COMMIT PLATFORM — Students Router
# backend/routers/students.py
# ============================================================
# Student profile pages — viewable by:
#   - the student themselves
#   - any teacher who shares a classroom with them
#   - any admin
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from auth_deps import CurrentUser, get_current_user
from db import supabase_admin

router = APIRouter()


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


def _can_view_student(viewer: CurrentUser, student_id: str) -> bool:
    """Admin / self / teacher-shares-a-classroom."""
    if viewer.role == "admin":
        return True
    if viewer.profile_id == student_id:
        return True
    if viewer.role == "teacher":
        # Does the teacher own any classroom this student is in?
        rows = (
            supabase_admin.table("classroom_members")
            .select("classroom_id, classrooms!inner(teacher_id)")
            .eq("student_id", student_id)
            .execute()
        ).data or []
        for r in rows:
            cls = r.get("classrooms") or {}
            if cls.get("teacher_id") == viewer.profile_id:
                return True
    return False


@router.get("/{student_id}/profile")
async def get_student_profile(
    student_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the student's profile + the classrooms they're in + per-classroom grade summary."""
    if not _can_view_student(user, student_id):
        raise HTTPException(status_code=403, detail="Not permitted to view this profile.")

    profile = (
        supabase_admin.table("profiles")
        .select("id, role, display_name, email, school_name, state, avatar_url, current_streak, longest_streak, last_activity_date, created_at")
        .eq("id", student_id)
        .maybe_single()
        .execute()
    )
    if not profile or not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found.")

    # Classrooms they belong to.
    memberships = (
        supabase_admin.table("classroom_members")
        .select("classroom_id, classrooms(id, name, archived, grade_weights, teacher_id, profiles!classrooms_teacher_id_fkey(display_name))")
        .eq("student_id", student_id)
        .execute()
    ).data or []
    classrooms = []
    for m in memberships:
        c = m.get("classrooms")
        if not c or c.get("archived"):
            continue
        # If the viewer is a teacher, only include their own classrooms.
        if user.role == "teacher" and c.get("teacher_id") != user.profile_id:
            continue
        classrooms.append({
            "id": c["id"],
            "name": c["name"],
            "teacher_name": (c.get("profiles") or {}).get("display_name"),
            "grade_weights": c.get("grade_weights"),
        })

    # For each visible classroom, pull a quick grade summary —
    # weighted avg, classroom assignments graded, curriculum assignments graded.
    DEFAULT_WEIGHTS = {"code": 35, "project": 35, "quiz": 15, "activity": 10, "checkin": 5}
    TYPE_KEYS = ["code", "activity", "checkin", "quiz", "project"]

    for c in classrooms:
        weights = {**DEFAULT_WEIGHTS, **(c.get("grade_weights") or {})}

        # Classroom assignment submissions for this student in this classroom.
        assignments_in_classroom = (
            supabase_admin.table("assignments")
            .select("id, assignment_type")
            .eq("classroom_id", c["id"])
            .execute()
        ).data or []
        assignment_type_by_id = {a["id"]: a.get("assignment_type") or "code" for a in assignments_in_classroom}

        subs = (
            supabase_admin.table("submissions")
            .select("assignment_id, grade, penalized_grade")
            .eq("student_id", student_id)
            .in_("assignment_id", [a["id"] for a in assignments_in_classroom] or ["__none__"])
            .execute()
        ).data or []

        # Curriculum assignment scores for this student.
        curric_subs = (
            supabase_admin.table("exercise_responses")
            .select("lesson_id, score")
            .eq("student_id", student_id)
            .eq("exercise_type", "curriculum_assignment")
            .execute()
        ).data or []
        curric_ids = [r["lesson_id"] for r in curric_subs]
        curric_assignments = []
        if curric_ids:
            curric_assignments = (
                supabase_admin.table("curriculum_assignments")
                .select("id, assignment_type")
                .in_("id", curric_ids)
                .execute()
            ).data or []
        curric_type_by_id = {a["id"]: a.get("assignment_type") or "code" for a in curric_assignments}

        # Bucket grades by type and compute weighted average.
        buckets: dict[str, list[float]] = {}
        graded_count = 0

        for s in subs:
            g = s.get("penalized_grade") if s.get("penalized_grade") is not None else s.get("grade")
            if g is None:
                continue
            t = assignment_type_by_id.get(s["assignment_id"]) or "code"
            if t not in TYPE_KEYS:
                t = "code"
            buckets.setdefault(t, []).append(float(g))
            graded_count += 1

        for r in curric_subs:
            if r.get("score") is None:
                continue
            t = curric_type_by_id.get(r["lesson_id"]) or "code"
            if t not in TYPE_KEYS:
                t = "code"
            buckets.setdefault(t, []).append(float(r["score"]))
            graded_count += 1

        per_type = {t: (sum(vals) / len(vals)) for t, vals in buckets.items() if vals}
        present_types = list(per_type.keys())
        total_weight = sum(weights.get(t, 0) for t in present_types)
        weighted_avg = None
        if present_types and total_weight > 0:
            weighted_avg = sum(per_type[t] * weights.get(t, 0) for t in present_types) / total_weight
        elif present_types:
            # all present types had 0 weight — fall back to straight average
            weighted_avg = sum(per_type.values()) / len(per_type)

        c["weighted_average"] = round(weighted_avg, 1) if weighted_avg is not None else None
        c["graded_count"] = graded_count
        c["per_type_averages"] = {t: round(v, 1) for t, v in per_type.items()}

    return {
        "profile": profile.data,
        "classrooms": classrooms,
    }


@router.patch("/me")
async def update_my_profile(
    body: ProfileUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """Lets the current user update their own display name and/or avatar URL."""
    updates: dict = {}
    if body.display_name is not None:
        if not body.display_name.strip():
            raise HTTPException(status_code=400, detail="Display name cannot be empty.")
        updates["display_name"] = body.display_name.strip()
    if body.avatar_url is not None:
        # empty string clears it
        updates["avatar_url"] = body.avatar_url or None
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    result = (
        supabase_admin.table("profiles")
        .update(updates)
        .eq("id", user.profile_id)
        .execute()
    )
    return result.data[0] if result.data else {}
