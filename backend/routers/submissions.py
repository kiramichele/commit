# ============================================================
# COMMIT PLATFORM — Submissions & Commits Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import httpx
import base64
import os

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin, get_user_client

router = APIRouter()


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
# SUBMISSIONS
# ============================================================

@router.post("/open")
async def open_submission(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Gets or creates a submission for the current student.
    Called when a student opens an assignment.
    """
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

    return {
        "commit": commit.data,
        "all_commits": all_commits.data or [],
    }


@router.post("/submit")
async def submit_assignment(
    body: SubmitAssignment,
    user: CurrentUser = Depends(get_current_user),
):
    """Marks a submission as submitted. Validates min_commits requirement."""
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

    submission = (
        supabase_admin.table("submissions")
        .select("*")
        .eq("id", body.submission_id)
        .single()
        .execute()
    )

    return submission.data


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


# ============================================================
# TEACHER — VIEW SUBMISSIONS
# ============================================================

@router.get("/assignment/{assignment_id}")
async def list_assignment_submissions(
    assignment_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns all submissions for an assignment (teacher only)."""
    submissions = (
        supabase_admin.table("submissions")
        .select("*, profiles!submissions_student_id_fkey(display_name, email)")
        .eq("assignment_id", assignment_id)
        .order("submitted_at", desc=True, nulls_first=False)
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


@router.patch("/{submission_id}/grade")
async def grade_submission(
    submission_id: str,
    body: GradeSubmission,
    user: CurrentUser = Depends(require_teacher),
):
    """Teacher grades a submission."""
    from datetime import datetime, timezone
    result = (
        supabase_admin.table("submissions")
        .update({
            "grade": body.grade,
            "teacher_feedback": body.feedback,
            "graded_at": datetime.now(timezone.utc).isoformat(),
            "graded_by": user.profile_id,
        })
        .eq("id", submission_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return result.data[0]