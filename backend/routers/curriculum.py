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
    """Returns all published units with their lessons, projects, and curriculum assignments."""
    units = (
        supabase_admin.table("units")
        .select(
            "*, "
            "lessons(id, order_index, title, scaffold_level, is_published), "
            "projects(id, order_index, title, description, estimated_minutes, is_published), "
            "curriculum_assignments(id, order_index, title, assignment_type, is_published)"
        )
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


# ============================================================
# LESSON COMPLETIONS
# ============================================================

@router.post("/lessons/{lesson_id}/complete")
async def mark_lesson_complete(
    lesson_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Marks a lesson as complete for the current student."""
    from datetime import datetime, timezone

    existing = (
        supabase_admin.table("lesson_completions")
        .select("id, completed_at")
        .eq("lesson_id", lesson_id)
        .eq("student_id", user.profile_id)
        .execute()
    )

    if existing.data:
        return existing.data[0]

    result = supabase_admin.table("lesson_completions").insert({
        "student_id": user.profile_id,
        "lesson_id": lesson_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    try:
        supabase_admin.rpc(
            "update_student_streak",
            {"p_student_id": user.profile_id}
        ).execute()
    except Exception as e:
        print(f"Streak update failed: {e}")

    return result.data[0] if result.data else {}


@router.get("/lessons/{lesson_id}/completion")
async def get_lesson_completion(
    lesson_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the current student's completion status for a lesson."""
    result = (
        supabase_admin.table("lesson_completions")
        .select("id, completed_at")
        .eq("lesson_id", lesson_id)
        .eq("student_id", user.profile_id)
        .execute()
    )
    return {"completed": bool(result.data), "completed_at": result.data[0]["completed_at"] if result.data else None}


@router.get("/lessons/{lesson_id}/completions/count")
async def get_lesson_completion_count(
    lesson_id: str,
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns how many students in a classroom have completed a lesson."""
    members = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_id)
        .execute()
    )
    total = len(members.data or [])
    student_ids = [m["student_id"] for m in (members.data or [])]

    if not student_ids:
        return {"completed": 0, "total": 0}

    completions = (
        supabase_admin.table("lesson_completions")
        .select("id")
        .eq("lesson_id", lesson_id)
        .in_("student_id", student_ids)
        .execute()
    )

    return {"completed": len(completions.data or []), "total": total}


@router.get("/classroom/{classroom_id}/completions")
async def get_classroom_completions(
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns all lesson completions for the current student in a classroom."""
    unlocked = (
        supabase_admin.table("classroom_lesson_unlocks")
        .select("lesson_id")
        .eq("classroom_id", classroom_id)
        .execute()
    )
    lesson_ids = [u["lesson_id"] for u in (unlocked.data or [])]

    if not lesson_ids:
        return []

    completions = (
        supabase_admin.table("lesson_completions")
        .select("lesson_id, completed_at")
        .eq("student_id", user.profile_id)
        .in_("lesson_id", lesson_ids)
        .execute()
    )

    return completions.data or []


# ============================================================
# LESSON DETAILS
# ============================================================

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


# ============================================================
# CURRICULUM ASSIGNMENTS (student-facing reads + responses)
# ============================================================

class CurriculumAssignmentSubmission(BaseModel):
    response_data: dict  # arbitrary JSON — meaning depends on assignment_type


@router.get("/curriculum-assignments/{assignment_id}")
async def get_curriculum_assignment(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a published curriculum assignment with its unit info.
    The raw `test_cases` array is stripped before returning — exposing
    stdin/expected_stdout would let students hardcode outputs, and
    hidden cases would leak their descriptions. Only a boolean
    `has_test_cases` flag is exposed; the test runner is server-side
    via /code/run-tests.
    """
    response = (
        supabase_admin.table("curriculum_assignments")
        .select("*, units(id, title, order_index)")
        .eq("id", assignment_id)
        .eq("is_published", True)
        .maybe_single()
        .execute()
    )
    if not response or not response.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    data = response.data
    raw_cases = data.pop("test_cases", None) or []
    data["has_test_cases"] = bool(raw_cases)
    return data


@router.get("/curriculum-assignments/{assignment_id}/html-url")
async def get_curriculum_assignment_html_url(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Signed URL for the activity HTML body (activity-type only)."""
    row = (
        supabase_admin.table("curriculum_assignments")
        .select("html_file_path")
        .eq("id", assignment_id)
        .maybe_single()
        .execute()
    )
    if not row or not row.data or not row.data.get("html_file_path"):
        raise HTTPException(status_code=404, detail="No HTML for this assignment.")
    try:
        signed = supabase_admin.storage.from_(STORAGE_BUCKET).create_signed_url(
            row.data["html_file_path"], 60 * 60
        )
        return {"url": signed.get("signedURL") or signed.get("signedUrl")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate URL: {str(e)}")


@router.get("/curriculum-assignments/{assignment_id}/questions")
async def get_curriculum_assignment_questions(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns quiz questions for a quiz-type assignment. Hides correct_answer from students."""
    response = (
        supabase_admin.table("quiz_questions")
        .select("id, order_index, question_type, question_text, code_block, choice_a, choice_b, choice_c, choice_d")
        .eq("curriculum_assignment_id", assignment_id)
        .order("order_index")
        .execute()
    )
    return response.data or []


@router.get("/curriculum-assignments/{assignment_id}/questions-for-grading")
async def get_curriculum_assignment_questions_for_grading(
    assignment_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Same as /questions but includes correct_answer so the teacher can grade."""
    response = (
        supabase_admin.table("quiz_questions")
        .select("*")
        .eq("curriculum_assignment_id", assignment_id)
        .order("order_index")
        .execute()
    )
    return response.data or []


@router.post("/curriculum-assignments/{assignment_id}/submit")
async def submit_curriculum_assignment(
    assignment_id: str,
    body: CurriculumAssignmentSubmission,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Records a student's submission to a curriculum assignment.
    Auto-grades multiple-choice quiz answers against correct_answer;
    leaves constructed/activity/check-in responses unscored for now.
    Stored alongside other exercise_responses with exercise_type='curriculum_assignment'.
    """
    assignment = (
        supabase_admin.table("curriculum_assignments")
        .select("id, assignment_type")
        .eq("id", assignment_id)
        .maybe_single()
        .execute()
    )
    if not assignment or not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    payload = body.response_data or {}
    score: Optional[float] = None

    # Auto-grade quizzes: payload is {questionId: 'a' | 'b' | 'c' | 'd'}.
    if assignment.data.get("assignment_type") == "quiz":
        questions = (
            supabase_admin.table("quiz_questions")
            .select("id, question_type, correct_answer")
            .eq("curriculum_assignment_id", assignment_id)
            .execute()
        ).data or []
        gradable = [q for q in questions if q["question_type"] == "multiple_choice" and q.get("correct_answer")]
        if gradable:
            correct = sum(
                1 for q in gradable
                if (payload.get(q["id"]) or "").lower() == q["correct_answer"]
            )
            score = round(100 * correct / len(gradable), 1)

    existing = (
        supabase_admin.table("exercise_responses")
        .select("id")
        .eq("student_id", user.profile_id)
        .eq("lesson_id", assignment_id)
        .eq("exercise_index", 0)
        .maybe_single()
        .execute()
    )

    import json
    row = {
        "student_id": user.profile_id,
        "lesson_id": assignment_id,  # reuse lesson_id column to point at the curriculum assignment
        "exercise_index": 0,
        "exercise_type": "curriculum_assignment",
        "response_text": json.dumps(payload),
        "is_correct": (score is not None and score == 100) if score is not None else None,
    }
    if existing and existing.data:
        supabase_admin.table("exercise_responses").update(row).eq("id", existing.data["id"]).execute()
    else:
        supabase_admin.table("exercise_responses").insert(row).execute()

    return {"submitted": True, "score": score}


@router.get("/curriculum-assignments/{assignment_id}/my-submission")
async def get_my_curriculum_assignment_submission(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the current student's saved submission for this curriculum assignment, if any."""
    response = (
        supabase_admin.table("exercise_responses")
        .select("*")
        .eq("student_id", user.profile_id)
        .eq("lesson_id", assignment_id)
        .eq("exercise_type", "curriculum_assignment")
        .maybe_single()
        .execute()
    )
    return response.data if response else None


# ============================================================
# CODE REVIEW
# ============================================================
# Code-review curriculum assignments don't have submissions in the
# traditional sense — instead they have *pairings*. A pairing says
# "student R reviews student E's submission to the source assignment".
# Pairings are per-classroom because rosters differ.
# ============================================================


def _build_pairings_for_strategy(student_ids, grades_by_student, strategy):
    """
    Given a roster (list of profile_ids) and an optional grade map, return a
    list of (reviewer_id, reviewee_id) pairs implementing the strategy.

    - random: shuffle, then offset by 1 so no student reviews themselves
    - similar_grade: sort by grade, pair adjacent (offset by 1)
    - opposite_grade: sort by grade, top reviews bottom and vice versa
    - manual: returns empty — teacher will set pairings explicitly
    """
    import random
    if not student_ids or len(student_ids) < 2:
        return []
    ids = list(student_ids)
    if strategy == "random":
        random.shuffle(ids)
    elif strategy in ("similar_grade", "opposite_grade"):
        ids.sort(key=lambda s: grades_by_student.get(s, 0.0))
        if strategy == "opposite_grade":
            ids.reverse()  # high to low; pairing offset will tie top↔bottom-ish
    elif strategy == "manual":
        return []

    # Pair each student with the NEXT one in the ordered list. Wrap around
    # so the last student reviews the first. This guarantees nobody reviews
    # themselves and everyone gets exactly one assignment.
    pairs = []
    n = len(ids)
    for i in range(n):
        reviewer = ids[i]
        reviewee = ids[(i + 1) % n]
        pairs.append((reviewer, reviewee))
    return pairs


@router.post("/code-review/{assignment_id}/classroom/{classroom_id}/generate-pairings")
async def generate_pairings(
    assignment_id: str,
    classroom_id: str,
    replace: bool = False,
    user: CurrentUser = Depends(require_teacher),
):
    """
    Generates pairings for the given code-review assignment in the teacher's
    classroom using the assignment's configured strategy. By default this is
    additive (creates pairings only for students who don't have one yet);
    pass ?replace=true to wipe existing pairings first.
    """
    # Teacher must own the classroom.
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", classroom_id)
        .eq("teacher_id", user.profile_id)
        .maybe_single()
        .execute()
    )
    if not classroom or not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")

    # Pull the code-review assignment and its source.
    assignment = (
        supabase_admin.table("curriculum_assignments")
        .select("id, assignment_type, pairing_strategy, source_curriculum_assignment_id")
        .eq("id", assignment_id)
        .maybe_single()
        .execute()
    )
    if not assignment or not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if assignment.data.get("assignment_type") != "code_review":
        raise HTTPException(status_code=400, detail="Assignment is not a code_review.")

    strategy = assignment.data.get("pairing_strategy") or "random"

    # Roster.
    members = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_id)
        .execute()
    ).data or []
    student_ids = [m["student_id"] for m in members]
    if len(student_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 students in the classroom to pair.")

    # If grade-based strategy, fetch each student's average score on the source assignment.
    grades_by_student: dict = {}
    if strategy in ("similar_grade", "opposite_grade") and assignment.data.get("source_curriculum_assignment_id"):
        source_id = assignment.data["source_curriculum_assignment_id"]
        rows = (
            supabase_admin.table("exercise_responses")
            .select("student_id, score")
            .eq("lesson_id", source_id)
            .eq("exercise_type", "curriculum_assignment")
            .in_("student_id", student_ids)
            .execute()
        ).data or []
        for r in rows:
            if r.get("score") is not None:
                grades_by_student[r["student_id"]] = float(r["score"])

    if replace:
        supabase_admin.table("code_review_pairings").delete().eq("code_review_assignment_id", assignment_id).eq("classroom_id", classroom_id).execute()

    existing = (
        supabase_admin.table("code_review_pairings")
        .select("reviewer_id")
        .eq("code_review_assignment_id", assignment_id)
        .eq("classroom_id", classroom_id)
        .execute()
    ).data or []
    existing_reviewers = {p["reviewer_id"] for p in existing}

    pairs = _build_pairings_for_strategy(student_ids, grades_by_student, strategy)
    new_rows = [
        {
            "code_review_assignment_id": assignment_id,
            "classroom_id": classroom_id,
            "reviewer_id": rv,
            "reviewee_id": re,
        }
        for rv, re in pairs
        if rv not in existing_reviewers
    ]
    if new_rows:
        supabase_admin.table("code_review_pairings").insert(new_rows).execute()

    return {"created": len(new_rows), "total_pairs": len(pairs), "strategy": strategy}


@router.get("/code-review/{assignment_id}/classroom/{classroom_id}/pairings")
async def list_pairings(
    assignment_id: str,
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """All pairings for a code-review assignment in a classroom — teacher view."""
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", classroom_id)
        .eq("teacher_id", user.profile_id)
        .maybe_single()
        .execute()
    )
    if not classroom or not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")

    pairings = (
        supabase_admin.table("code_review_pairings")
        .select(
            "*, "
            "reviewer:profiles!code_review_pairings_reviewer_id_fkey(id, display_name), "
            "reviewee:profiles!code_review_pairings_reviewee_id_fkey(id, display_name)"
        )
        .eq("code_review_assignment_id", assignment_id)
        .eq("classroom_id", classroom_id)
        .execute()
    ).data or []
    return pairings


@router.get("/code-review/{assignment_id}/my-pairing")
async def get_my_pairing(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Returns the current student's pairing for a code-review assignment along
    with the reviewee's submission to the source assignment.

    The student belongs to potentially many classrooms — we return the first
    pairing found. (Classroom-aware fetching could be added later if students
    routinely belong to multiple classrooms running the same review.)
    """
    pairing = (
        supabase_admin.table("code_review_pairings")
        .select(
            "*, "
            "reviewee:profiles!code_review_pairings_reviewee_id_fkey(id, display_name)"
        )
        .eq("code_review_assignment_id", assignment_id)
        .eq("reviewer_id", user.profile_id)
        .limit(1)
        .execute()
    ).data or []
    if not pairing:
        return None
    p = pairing[0]

    # Look up the source assignment id so we can fetch the reviewee's submission.
    assignment = (
        supabase_admin.table("curriculum_assignments")
        .select("source_curriculum_assignment_id")
        .eq("id", assignment_id)
        .maybe_single()
        .execute()
    )
    source_id = assignment.data.get("source_curriculum_assignment_id") if assignment and assignment.data else None

    reviewee_submission = None
    if source_id:
        sub = (
            supabase_admin.table("exercise_responses")
            .select("response_text, score")
            .eq("lesson_id", source_id)
            .eq("exercise_type", "curriculum_assignment")
            .eq("student_id", p["reviewee_id"])
            .maybe_single()
            .execute()
        )
        if sub and sub.data:
            try:
                import json
                payload = json.loads(sub.data.get("response_text") or "{}")
                reviewee_submission = {
                    "code": payload.get("code") or payload.get("starter_code") or "",
                    "raw": payload,
                }
            except Exception:
                reviewee_submission = {"code": "", "raw": None}

    return {
        "pairing": p,
        "source_assignment_id": source_id,
        "reviewee_submission": reviewee_submission,
    }


# ── GRADEBOOK DATA (all curriculum assignment scores in a classroom) ──

@router.get("/classroom/{classroom_id}/curriculum-grade-data")
async def curriculum_grade_data_for_classroom(
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """
    Returns:
      assignments: list of published curriculum_assignments (gradable types only)
      submissions: list of exercise_responses for those assignments, filtered
                   to students who belong to the given classroom.
    Lets the gradebook merge curriculum scores alongside classroom assignments.
    """
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", classroom_id)
        .eq("teacher_id", user.profile_id)
        .maybe_single()
        .execute()
    )
    if not classroom or not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")

    assignments = (
        supabase_admin.table("curriculum_assignments")
        .select("id, unit_id, title, assignment_type, order_index")
        .eq("is_published", True)
        .order("order_index")
        .execute()
    ).data or []
    if not assignments:
        return {"assignments": [], "submissions": []}

    members = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_id)
        .execute()
    ).data or []
    student_ids = [m["student_id"] for m in members]
    if not student_ids:
        return {"assignments": assignments, "submissions": []}

    submissions = (
        supabase_admin.table("exercise_responses")
        .select("id, student_id, lesson_id, score, is_correct, graded_at")
        .eq("exercise_type", "curriculum_assignment")
        .in_("student_id", student_ids)
        .in_("lesson_id", [a["id"] for a in assignments])
        .execute()
    ).data or []

    return {"assignments": assignments, "submissions": submissions}


@router.get("/my/classroom/{classroom_id}/curriculum-grades")
async def my_curriculum_grades(
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the current student's curriculum assignment submissions + the assignment metadata."""
    # Confirm the caller is a member of this classroom.
    member = (
        supabase_admin.table("classroom_members")
        .select("id")
        .eq("classroom_id", classroom_id)
        .eq("student_id", user.profile_id)
        .maybe_single()
        .execute()
    )
    if not member or not member.data:
        # Not a member — return empty rather than 403 so the grades page just shows nothing for that tab.
        return {"assignments": [], "submissions": []}

    assignments = (
        supabase_admin.table("curriculum_assignments")
        .select("id, title, assignment_type, order_index")
        .eq("is_published", True)
        .order("order_index")
        .execute()
    ).data or []

    submissions = (
        supabase_admin.table("exercise_responses")
        .select("id, lesson_id, score, is_correct, graded_at")
        .eq("exercise_type", "curriculum_assignment")
        .eq("student_id", user.profile_id)
        .execute()
    ).data or []

    return {"assignments": assignments, "submissions": submissions}


# ── TEACHER GRADING (for constructed-response quizzes etc.) ──

@router.get("/curriculum-assignments/{assignment_id}/classroom/{classroom_id}/submissions")
async def list_curriculum_assignment_submissions(
    assignment_id: str,
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """
    Returns every submission for a curriculum assignment from students
    who belong to the given classroom. Scoped so a teacher only ever
    sees submissions from their own classrooms.
    """
    # Verify the teacher owns the classroom.
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", classroom_id)
        .eq("teacher_id", user.profile_id)
        .maybe_single()
        .execute()
    )
    if not classroom or not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")

    # Roster for the classroom.
    members = (
        supabase_admin.table("classroom_members")
        .select("student_id, profiles!classroom_members_student_id_fkey(id, display_name, email)")
        .eq("classroom_id", classroom_id)
        .execute()
    ).data or []
    roster_by_id = {m["student_id"]: m.get("profiles") for m in members}
    student_ids = list(roster_by_id.keys())
    if not student_ids:
        return []

    submissions = (
        supabase_admin.table("exercise_responses")
        .select("*")
        .eq("lesson_id", assignment_id)
        .eq("exercise_type", "curriculum_assignment")
        .in_("student_id", student_ids)
        .execute()
    ).data or []

    for s in submissions:
        s["student"] = roster_by_id.get(s["student_id"])
    return submissions


class GradeSubmissionBody(BaseModel):
    score: Optional[float] = None
    teacher_feedback: Optional[str] = None
    per_question_grades: Optional[dict] = None   # { question_id: numeric score }
    per_question_feedback: Optional[dict] = None # { question_id: text }


@router.patch("/curriculum-assignments/submissions/{submission_id}/grade")
async def grade_curriculum_submission(
    submission_id: str,
    body: GradeSubmissionBody,
    user: CurrentUser = Depends(require_teacher),
):
    """
    Sets the score / feedback / per-question grades on a single submission.
    Per-question grades + feedback are merged into the response_text JSON
    (under 'grades' and 'feedback' keys) so the original student answers
    aren't touched.
    """
    existing = (
        supabase_admin.table("exercise_responses")
        .select("id, response_text, lesson_id")
        .eq("id", submission_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Submission not found.")

    import json
    try:
        payload = json.loads(existing.data.get("response_text") or "{}")
    except Exception:
        payload = {}
    if body.per_question_grades is not None:
        payload["grades"] = body.per_question_grades
    if body.per_question_feedback is not None:
        payload["feedback"] = body.per_question_feedback

    updates: dict = {"response_text": json.dumps(payload)}
    if body.score is not None:
        updates["score"] = body.score
    if body.teacher_feedback is not None:
        updates["teacher_feedback"] = body.teacher_feedback
    from datetime import datetime, timezone
    updates["graded_at"] = datetime.now(timezone.utc).isoformat()
    updates["graded_by"] = user.profile_id

    result = (
        supabase_admin.table("exercise_responses")
        .update(updates)
        .eq("id", submission_id)
        .execute()
    )
    return result.data[0] if result.data else {}


# ============================================================
# PROJECTS (student-facing reads)
# ============================================================

@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a published project with its published steps."""
    project = (
        supabase_admin.table("projects")
        .select("*, units(id, title, order_index), project_steps(*)")
        .eq("id", project_id)
        .eq("is_published", True)
        .maybe_single()
        .execute()
    )
    if not project or not project.data:
        raise HTTPException(status_code=404, detail="Project not found.")
    data = project.data
    steps = data.get("project_steps") or []
    # Only published steps for students
    steps = [s for s in steps if s.get("is_published")]
    steps.sort(key=lambda s: s.get("order_index", 0))
    data["project_steps"] = steps
    return data


@router.get("/steps/{step_id}")
async def get_project_step(
    step_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a single published project step."""
    step = (
        supabase_admin.table("project_steps")
        .select("*, projects(id, title, unit_id, units(id, title, order_index))")
        .eq("id", step_id)
        .eq("is_published", True)
        .maybe_single()
        .execute()
    )
    if not step or not step.data:
        raise HTTPException(status_code=404, detail="Step not found.")
    return step.data


@router.get("/steps/{step_id}/html-url")
async def get_step_html_url(
    step_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Signed URL for a reading step's HTML body."""
    step = (
        supabase_admin.table("project_steps")
        .select("html_file_path")
        .eq("id", step_id)
        .maybe_single()
        .execute()
    )
    if not step or not step.data or not step.data.get("html_file_path"):
        raise HTTPException(status_code=404, detail="No HTML for this step.")
    try:
        signed = supabase_admin.storage.from_(STORAGE_BUCKET).create_signed_url(
            step.data["html_file_path"], 60 * 60
        )
        return {"url": signed.get("signedURL") or signed.get("signedUrl")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate URL: {str(e)}")


# ============================================================
# PROJECT STEP COMPLETIONS
# ============================================================

class StepCompletion(BaseModel):
    response_text: Optional[str] = None
    code_snapshot: Optional[str] = None


@router.post("/steps/{step_id}/complete")
async def complete_step(
    step_id: str,
    body: StepCompletion,
    user: CurrentUser = Depends(get_current_user),
):
    """Marks a project step complete (upserts the completion row)."""
    existing = (
        supabase_admin.table("project_step_completions")
        .select("id")
        .eq("student_id", user.profile_id)
        .eq("step_id", step_id)
        .maybe_single()
        .execute()
    )
    row = {
        "student_id": user.profile_id,
        "step_id": step_id,
        "response_text": body.response_text,
        "code_snapshot": body.code_snapshot,
    }
    if existing and existing.data:
        supabase_admin.table("project_step_completions").update(row).eq("id", existing.data["id"]).execute()
    else:
        supabase_admin.table("project_step_completions").insert(row).execute()
    return {"completed": True}


@router.get("/projects/{project_id}/my-progress")
async def my_project_progress(
    project_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the current student's completion rows for a project's steps."""
    rows = (
        supabase_admin.table("project_step_completions")
        .select("step_id, response_text, code_snapshot, completed_at, project_steps!inner(project_id)")
        .eq("student_id", user.profile_id)
        .eq("project_steps.project_id", project_id)
        .execute()
    )
    return rows.data or []