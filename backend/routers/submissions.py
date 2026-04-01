# ============================================================
# COMMIT PLATFORM — Submissions & Commits Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import httpx
import base64
import os
from datetime import datetime, timezone

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin, get_user_client
from email_service import send_grade_notification

router = APIRouter()


async def update_streak(profile_id: str):
    """Updates the student's streak via the Supabase function."""
    try:
        supabase_admin.rpc(
            "update_student_streak",
            {"p_student_id": profile_id}
        ).execute()
    except Exception as e:
        # Streak update failing should never break the main action
        print(f"Streak update failed for {profile_id}: {e}")


# ============================================================
# SCHEMAS
# ============================================================

class RunCode(BaseModel):
    code: str


class CommitCode(BaseModel):
    submission_id: str
    code: str
    message: str


class SubmitAssignment(BaseModel):
    submission_id: str


class GradeSubmission(BaseModel):
    grade: float
    feedback: Optional[str] = None


# ============================================================
# CODE EXECUTION — Judge0
# ============================================================

@router.post("/run")
async def run_code(
    body: RunCode,
    user: CurrentUser = Depends(get_current_user),
):
    """Executes Python code via Judge0 API."""
    api_key = os.getenv("JUDGE0_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Code execution not configured.")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true",
                headers={
                    "x-rapidapi-key": api_key,
                    "x-rapidapi-host": "judge0-ce.p.rapidapi.com",
                    "Content-Type": "application/json",
                },
                json={
                    "language_id": 71,
                    "source_code": base64.b64encode(body.code.encode()).decode(),
                    "stdin": "",
                },
            )
            result = response.json()

        def decode(val):
            if not val:
                return ""
            try:
                return base64.b64decode(val).decode("utf-8")
            except Exception:
                return str(val)

        stdout = decode(result.get("stdout", ""))
        stderr = decode(result.get("stderr", ""))
        compile_output = decode(result.get("compile_output", ""))
        status_desc = result.get("status", {}).get("description", "")

        error_output = stderr or compile_output or ""
        if status_desc not in ("Accepted", ""):
            error_output = error_output or status_desc

        return {
            "stdout": stdout,
            "stderr": error_output,
            "exit_code": result.get("exit_code") or 0,
            "output": stdout or error_output,
        }

    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Code execution timed out.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Execution error: {str(e)}")


# ============================================================
# TEACHER — VIEW SUBMISSIONS
# These must come BEFORE /{submission_id} routes to avoid
# FastAPI matching "assignment" as a submission_id
# ============================================================

@router.patch("/grade-viewed/{submission_id}")
async def mark_grade_viewed(
    submission_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Student has opened their graded assignment — mark as viewed."""
    from datetime import datetime, timezone
 
    # Only mark if this submission belongs to this student
    submission = (
        supabase_admin.table("submissions")
        .select("id, student_id, grade, grade_viewed_at")
        .eq("id", submission_id)
        .eq("student_id", user.profile_id)
        .single()
        .execute()
    )
 
    if not submission.data:
        raise HTTPException(status_code=404, detail="Submission not found.")
 
    # Only update if grade exists and hasn't been viewed yet
    if submission.data.get("grade") is not None and not submission.data.get("grade_viewed_at"):
        supabase_admin.table("submissions").update({
            "grade_viewed_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", submission_id).execute()
 
    return {"ok": True}
 
 
@router.get("/assignment/{assignment_id}")
async def list_assignment_submissions(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns all submissions for an assignment (teacher only)."""
    submissions = (
        supabase_admin.table("submissions")
        .select("*, profiles!submissions_student_id_fkey(display_name, email)")
        .eq("assignment_id", assignment_id)
        .order("submitted_at", desc=True)
        .execute()
    )

    result = []
    for s in (submissions.data or []):
        commit_count = (
            supabase_admin.table("code_commits")
            .select("id", count="exact")
            .eq("submission_id", s["id"])
            .execute()
        )
        s["commit_count"] = commit_count.count or 0
        result.append(s)

    return result



@router.patch("/grade/{submission_id}")
async def grade_submission(
    submission_id: str,
    body: GradeSubmission,
    user: CurrentUser = Depends(get_current_user),
):
    """Teacher grades a submission. Calculates late penalty if applicable."""
    from math import ceil

    # Get submission with assignment and classroom settings
    submission = (
        supabase_admin.table("submissions")
        .select("*, assignments(title, due_date, classroom_id, classrooms(late_penalty_per_day, late_penalty_max, late_submissions_allowed))")
        .eq("id", submission_id)
        .single()
        .execute()
    )

    if not submission.data:
        raise HTTPException(status_code=404, detail="Submission not found.")

    sub = submission.data
    assignment = sub.get("assignments", {})
    classroom = assignment.get("classrooms", {}) or {}

    penalty_per_day = classroom.get("late_penalty_per_day", 0) or 0
    penalty_max = classroom.get("late_penalty_max", 0) or 0

    # Calculate late penalty
    penalty_applied = 0.0
    penalized_grade = body.grade

    if sub.get("is_late") and penalty_per_day > 0 and sub.get("submitted_at") and assignment.get("due_date"):
        submitted = datetime.fromisoformat(sub["submitted_at"].replace("Z", "+00:00"))
        due = datetime.fromisoformat(assignment["due_date"].replace("Z", "+00:00"))
        days_late = ceil((submitted - due).total_seconds() / 86400)
        penalty_applied = days_late * penalty_per_day
        if penalty_max > 0:
            penalty_applied = min(penalty_applied, penalty_max)
        penalized_grade = max(0, body.grade - penalty_applied)

    result = (
        supabase_admin.table("submissions")
        .update({
            "grade": body.grade,
            "penalized_grade": penalized_grade if penalty_applied > 0 else None,
            "late_penalty_applied": penalty_applied if penalty_applied > 0 else None,
            "teacher_feedback": body.feedback,
            "graded_at": datetime.now(timezone.utc).isoformat(),
            "graded_by": user.profile_id,
        })
        .eq("id", submission_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Submission not found.")

    # Notify student of grade
    try:
        sub_data = result.data[0]
        student = supabase_admin.table("profiles").select("display_name, email").eq("id", sub_data["student_id"]).single().execute()
        if student.data and assignment:
            send_grade_notification(
                student_email=student.data["email"],
                student_name=student.data["display_name"],
                assignment_title=assignment.get("title", "Assignment"),
                classroom_name=classroom.get("name", "your classroom") if classroom else "your classroom",
                grade=penalized_grade if penalty_applied > 0 else body.grade,
                feedback=body.feedback,
                assignment_url=f"{os.getenv('APP_URL', 'http://localhost:3000')}/classroom/{assignment.get('classroom_id')}/assignment/{sub_data['assignment_id']}",
            )
    except Exception as e:
        print(f"Grade email failed: {e}")

    return result.data[0]


# ============================================================
# SUBMISSIONS
# ============================================================

@router.post("/open")
async def open_submission(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Gets or creates a submission for the current student."""
    result = supabase_admin.rpc(
        "get_or_create_submission",
        {
            "p_assignment_id": assignment_id,
            "p_student_id": user.profile_id,
        }
    ).execute()

    submission_id = result.data

    submission = (
        supabase_admin.table("submissions")
        .select("*")
        .eq("id", submission_id)
        .single()
        .execute()
    )

    # Record first_opened_at if not already set
    if submission.data and not submission.data.get("first_opened_at"):
        supabase_admin.table("submissions").update({
            "first_opened_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", submission_id).execute()

    commits = (
        supabase_admin.table("code_commits")
        .select("id, message, line_count, committed_at")
        .eq("submission_id", submission_id)
        .order("committed_at", desc=False)
        .execute()
    )

    assignment = (
        supabase_admin.table("assignments")
        .select("id, title, instructions, min_commits, scaffold_level, due_date, starter_code")
        .eq("id", assignment_id)
        .single()
        .execute()
    )

    return {
        "submission": submission.data,
        "commits": commits.data or [],
        "assignment": assignment.data,
    }


@router.post("/commit")
async def commit_code(
    body: CommitCode,
    user: CurrentUser = Depends(get_current_user),
):
    """Saves a code snapshot as a commit."""
    if len(body.message.strip()) < 3:
        raise HTTPException(status_code=400, detail="Commit message must be at least 3 characters.")

    result = supabase_admin.rpc(
        "commit_code",
        {
            "p_submission_id": body.submission_id,
            "p_student_id": user.profile_id,
            "p_code": body.code,
            "p_message": body.message,
        }
    ).execute()

    commit_id = result.data

    commit = (
        supabase_admin.table("code_commits")
        .select("*")
        .eq("id", commit_id)
        .single()
        .execute()
    )

    all_commits = (
        supabase_admin.table("code_commits")
        .select("id, message, line_count, committed_at")
        .eq("submission_id", body.submission_id)
        .order("committed_at", desc=False)
        .execute()
    )

    await update_streak(user.profile_id)

    return {
        "commit": commit.data,
        "all_commits": all_commits.data or [],
    }


@router.post("/submit")
async def submit_assignment(
    body: SubmitAssignment,
    user: CurrentUser = Depends(get_current_user),
):
    """Marks a submission as submitted. Validates min_commits. Flags fast submits."""
    try:
        supabase_admin.rpc(
            "submit_assignment",
            {
                "p_submission_id": body.submission_id,
                "p_student_id": user.profile_id,
            }
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Fetch the submission to check timing
    submission = (
        supabase_admin.table("submissions")
        .select("*")
        .eq("id", body.submission_id)
        .single()
        .execute()
    )

    if not submission.data:
        raise HTTPException(status_code=404, detail="Submission not found.")

    sub = submission.data
    now = datetime.now(timezone.utc)

    # Calculate time on task
    time_on_task = None
    fast_flag = False

    if sub.get("first_opened_at"):
        opened_at = datetime.fromisoformat(
            sub["first_opened_at"].replace("Z", "+00:00")
        )
        time_on_task = int((now - opened_at).total_seconds())

        # Flag if submitted in under 60 seconds
        if time_on_task < 60:
            fast_flag = True

    # Update with timing data
    updated = (
        supabase_admin.table("submissions")
        .update({
            "time_on_task_seconds": time_on_task,
            "fast_submit_flag": fast_flag,
        })
        .eq("id", body.submission_id)
        .execute()
    )

    await update_streak(user.profile_id)

    return updated.data[0] if updated.data else sub


# ============================================================
# COMMIT DIFF
# Must come before the wildcard /{submission_id}/commits routes
# ============================================================

@router.get("/{submission_id}/diff")
async def get_commit_diff(
    submission_id: str,
    from_commit: str,
    to_commit: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a structured diff between two commits."""
    from difflib import SequenceMatcher

    from_data = (
        supabase_admin.table("code_commits")
        .select("code_snapshot, message")
        .eq("id", from_commit)
        .eq("submission_id", submission_id)
        .single()
        .execute()
    )
    to_data = (
        supabase_admin.table("code_commits")
        .select("code_snapshot, message")
        .eq("id", to_commit)
        .eq("submission_id", submission_id)
        .single()
        .execute()
    )

    if not from_data.data or not to_data.data:
        raise HTTPException(status_code=404, detail="Commit not found.")

    a_lines = (from_data.data["code_snapshot"] or "").splitlines()
    b_lines = (to_data.data["code_snapshot"] or "").splitlines()

    matcher = SequenceMatcher(None, a_lines, b_lines)
    hunks = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        hunks.append({
            "tag": tag,
            "old_lines": a_lines[i1:i2],
            "new_lines": b_lines[j1:j2],
            "old_start": i1 + 1,
            "new_start": j1 + 1,
        })

    lines_added = sum(len(h["new_lines"]) for h in hunks if h["tag"] in ("insert", "replace"))
    lines_removed = sum(len(h["old_lines"]) for h in hunks if h["tag"] in ("delete", "replace"))

    return {
        "from_commit": {"id": from_commit, "message": from_data.data["message"]},
        "to_commit": {"id": to_commit, "message": to_data.data["message"]},
        "hunks": hunks,
        "lines_added": lines_added,
        "lines_removed": lines_removed,
    }


# ============================================================
# COMMIT HISTORY
# These wildcard routes must come LAST
# ============================================================

@router.get("/{submission_id}/commits")
async def get_commit_history(
    submission_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns full commit history for a submission."""
    commits = (
        supabase_admin.table("code_commits")
        .select("*")
        .eq("submission_id", submission_id)
        .order("committed_at", desc=False)
        .execute()
    )
    return commits.data or []


@router.get("/{submission_id}/commits/{commit_id}/code")
async def get_commit_code(
    submission_id: str,
    commit_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the code snapshot for a specific commit."""
    commit = (
        supabase_admin.table("code_commits")
        .select("code_snapshot, message, committed_at, line_count")
        .eq("id", commit_id)
        .eq("submission_id", submission_id)
        .single()
        .execute()
    )
    if not commit.data:
        raise HTTPException(status_code=404, detail="Commit not found.")
    return commit.data