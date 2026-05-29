# ============================================================
# COMMIT PLATFORM — Submissions & Commits Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
import asyncio
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


class RunTests(BaseModel):
    curriculum_assignment_id: str
    code: str


VALID_COMPARISONS = {"exact", "strip_trailing_whitespace", "case_insensitive"}


def _compare_outputs(actual: str, expected: str, mode: str) -> bool:
    """Applies the chosen comparison rule. Falls back to exact match if
    the mode string isn't recognized (defensive — admin write path
    already validates).
    """
    if mode == "exact":
        return actual == expected
    if mode == "case_insensitive":
        return actual.lower() == expected.lower()
    # strip_trailing_whitespace: line-by-line, strip trailing ws.
    a_lines = [ln.rstrip() for ln in actual.splitlines()]
    e_lines = [ln.rstrip() for ln in expected.splitlines()]
    # Trim trailing empty lines so a missing final \n doesn't flag.
    while a_lines and a_lines[-1] == "":
        a_lines.pop()
    while e_lines and e_lines[-1] == "":
        e_lines.pop()
    return a_lines == e_lines


async def _judge0_run_one(client: httpx.AsyncClient, api_key: str, code: str, stdin: str) -> dict:
    """Single Judge0 invocation. Returns the raw decoded result."""
    response = await client.post(
        "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true",
        headers={
            "x-rapidapi-key": api_key,
            "x-rapidapi-host": "judge0-ce.p.rapidapi.com",
            "Content-Type": "application/json",
        },
        json={
            "language_id": 71,
            "source_code": base64.b64encode(code.encode()).decode(),
            "stdin": base64.b64encode((stdin or "").encode()).decode(),
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

    return {
        "stdout": decode(result.get("stdout", "")),
        "stderr": decode(result.get("stderr", "")) or decode(result.get("compile_output", "")),
        "status": result.get("status", {}).get("description", ""),
    }


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


@router.post("/run-tests")
async def run_tests(
    body: RunTests,
    user: CurrentUser = Depends(get_current_user),
):
    """Runs the student's code against every test case on a curriculum
    coding assignment. Each case is executed in a separate Judge0
    submission (so stdin is isolated), gathered in parallel. Hidden
    cases that don't pass have their description + expected output
    blanked out before returning.
    """
    api_key = os.getenv("JUDGE0_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Code execution not configured.")

    assignment = (
        supabase_admin.table("curriculum_assignments")
        .select("id, assignment_type, test_cases, default_comparison, is_published")
        .eq("id", body.curriculum_assignment_id)
        .maybe_single()
        .execute()
    )
    if not assignment or not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    a = assignment.data
    if a.get("assignment_type") != "code":
        raise HTTPException(status_code=400, detail="Assignment is not a coding assignment.")
    if not a.get("is_published") and user.role not in ("teacher", "admin"):
        raise HTTPException(status_code=404, detail="Assignment not published.")

    cases = a.get("test_cases") or []
    if not cases:
        raise HTTPException(status_code=400, detail="No test cases defined for this assignment.")

    default_comparison = a.get("default_comparison") or "strip_trailing_whitespace"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            judge_results = await asyncio.gather(
                *[_judge0_run_one(client, api_key, body.code, tc.get("stdin", "")) for tc in cases],
                return_exceptions=True,
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="Code execution timed out.")

    results: List[dict] = []
    earned = 0
    total = 0
    for tc, raw in zip(cases, judge_results):
        weight = int(tc.get("weight", 1) or 0)
        hidden = bool(tc.get("hidden", False))
        comparison = tc.get("comparison") or default_comparison
        if isinstance(raw, Exception):
            actual = ""
            stderr = f"Execution error: {raw}"
            passed = False
        else:
            actual = raw.get("stdout", "")
            stderr = raw.get("stderr", "") or ""
            status_desc = raw.get("status", "")
            if stderr or (status_desc and status_desc not in ("Accepted", "")):
                # Compilation / runtime error → fail without checking output.
                passed = False
            else:
                passed = _compare_outputs(actual, tc["expected_stdout"], comparison)

        total += weight
        if passed:
            earned += weight

        entry = {
            "tc_id": tc["id"],
            "passed": passed,
            "weight": weight,
            "hidden": hidden,
            "actual_stdout": actual,
            "stderr": stderr,
            "comparison": comparison,
        }
        # Hidden + failing → conceal the description and expected output
        # so students can't reverse-engineer the edge case from the diff.
        if hidden and not passed:
            entry["description"] = None
            entry["expected_stdout"] = None
        else:
            entry["description"] = tc["description"]
            entry["expected_stdout"] = tc["expected_stdout"]
        results.append(entry)

    score = round(100 * earned / total, 1) if total > 0 else 0.0
    return {
        "score": score,
        "earned": earned,
        "total": total,
        "results": results,
    }


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

@router.post("/curriculum-open")
async def open_curriculum_submission(
    curriculum_assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Gets or creates a submission for a curriculum coding assignment so the
    student can use the same baby-git commit + run + submit flow as on
    classroom assignments. We bypass the get_or_create_submission stored
    proc here since it's scoped to assignments, and instead do a small
    upsert directly against the submissions table.
    """
    # Verify the curriculum assignment exists, is coding-type, and is published.
    assignment = (
        supabase_admin.table("curriculum_assignments")
        .select("id, title, instructions, starter_code, min_commits, scaffold_level, hints_enabled, hint_1, hint_2, assignment_type, is_published, html_file_path")
        .eq("id", curriculum_assignment_id)
        .maybe_single()
        .execute()
    )
    if not assignment or not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    a = assignment.data
    if not a.get("is_published"):
        raise HTTPException(status_code=404, detail="Assignment not published.")
    if a.get("assignment_type") not in ("code", "code_review"):
        # We only support the commit flow on code / code_review assignments.
        raise HTTPException(status_code=400, detail="Assignment is not a coding assignment.")

    # Look up an existing submission for this student.
    existing = (
        supabase_admin.table("submissions")
        .select("*")
        .eq("student_id", user.profile_id)
        .eq("curriculum_assignment_id", curriculum_assignment_id)
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        sub = existing.data
        if not sub.get("first_opened_at"):
            supabase_admin.table("submissions").update({
                "first_opened_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", sub["id"]).execute()
    else:
        result = (
            supabase_admin.table("submissions")
            .insert({
                "student_id": user.profile_id,
                "curriculum_assignment_id": curriculum_assignment_id,
                "final_code": a.get("starter_code") or "",
                "first_opened_at": datetime.now(timezone.utc).isoformat(),
            })
            .execute()
        )
        sub = result.data[0] if result.data else None
        if not sub:
            raise HTTPException(status_code=500, detail="Could not create submission.")

    commits = (
        supabase_admin.table("code_commits")
        .select("id, message, line_count, committed_at")
        .eq("submission_id", sub["id"])
        .order("committed_at", desc=False)
        .execute()
    )

    return {
        "submission": sub,
        "commits": commits.data or [],
        "assignment": {
            "id": a["id"],
            "title": a["title"],
            "instructions": a.get("instructions") or "",
            "min_commits": a.get("min_commits") or 1,
            "scaffold_level": a.get("scaffold_level") or "typed_python",
            "due_date": None,  # curriculum-level — teachers can layer dues later
            "starter_code": a.get("starter_code") or "",
            "hints_enabled": bool(a.get("hints_enabled")),
            "hint_1": a.get("hint_1"),
            "hint_2": a.get("hint_2"),
            "html_file_path": a.get("html_file_path"),
        },
    }


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

    # The legacy commit_code stored proc may join on the assignments table,
    # so for curriculum-scoped submissions we do the insert in Python.
    sub = (
        supabase_admin.table("submissions")
        .select("id, student_id, curriculum_assignment_id")
        .eq("id", body.submission_id)
        .single()
        .execute()
    )
    if not sub.data:
        raise HTTPException(status_code=404, detail="Submission not found.")
    if sub.data["student_id"] != user.profile_id:
        raise HTTPException(status_code=403, detail="Not your submission.")

    if sub.data.get("curriculum_assignment_id"):
        line_count = len(body.code.split("\n"))
        ins = (
            supabase_admin.table("code_commits")
            .insert({
                "submission_id": body.submission_id,
                "code_snapshot": body.code,
                "message": body.message.strip(),
                "line_count": line_count,
            })
            .execute()
        )
        commit_id = ins.data[0]["id"] if ins.data else None
        # Update the submission's working code.
        supabase_admin.table("submissions").update({"final_code": body.code}).eq("id", body.submission_id).execute()
    else:
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
    # Curriculum-scoped submissions bypass the legacy submit_assignment stored
    # procedure (which joins on assignments). We validate min_commits and
    # mark submitted in Python, and also mirror the final code into
    # exercise_responses so the curriculum gradebook + grading UI picks it up.
    existing_sub = (
        supabase_admin.table("submissions")
        .select("id, student_id, curriculum_assignment_id, final_code, submitted_at")
        .eq("id", body.submission_id)
        .single()
        .execute()
    )
    if not existing_sub.data:
        raise HTTPException(status_code=404, detail="Submission not found.")
    if existing_sub.data["student_id"] != user.profile_id:
        raise HTTPException(status_code=403, detail="Not your submission.")

    if existing_sub.data.get("curriculum_assignment_id"):
        # Validate min_commits.
        curric_id = existing_sub.data["curriculum_assignment_id"]
        curric = (
            supabase_admin.table("curriculum_assignments")
            .select("min_commits")
            .eq("id", curric_id)
            .single()
            .execute()
        )
        min_commits = (curric.data or {}).get("min_commits") or 1
        commits_count = (
            supabase_admin.table("code_commits")
            .select("id", count="exact")
            .eq("submission_id", body.submission_id)
            .execute()
        )
        if (commits_count.count or 0) < min_commits:
            raise HTTPException(status_code=400, detail=f"Need at least {min_commits} commit(s) before submitting.")
        supabase_admin.table("submissions").update({
            "submitted_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", body.submission_id).execute()

        # Mirror into exercise_responses for the curriculum grade flow.
        import json
        final_code = existing_sub.data.get("final_code") or ""
        payload = {"code": final_code}
        prior = (
            supabase_admin.table("exercise_responses")
            .select("id")
            .eq("student_id", user.profile_id)
            .eq("lesson_id", curric_id)
            .eq("exercise_type", "curriculum_assignment")
            .maybe_single()
            .execute()
        )
        row = {
            "student_id": user.profile_id,
            "lesson_id": curric_id,
            "exercise_index": 0,
            "exercise_type": "curriculum_assignment",
            "response_text": json.dumps(payload),
        }
        if prior and prior.data:
            supabase_admin.table("exercise_responses").update(row).eq("id", prior.data["id"]).execute()
        else:
            supabase_admin.table("exercise_responses").insert(row).execute()
    else:
        # Classroom assignment — legacy path.
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

    # Auto-grade hook — runs only when the assignment has test cases AND
    # at least one classroom the student belongs to has the auto-grade
    # toggle on. Failures here must never break the submit, so swallow
    # all exceptions and just skip auto-grading.
    if sub.get("curriculum_assignment_id"):
        try:
            await _maybe_autograde_curriculum_submission(
                submission_id=body.submission_id,
                student_id=user.profile_id,
                curriculum_assignment_id=sub["curriculum_assignment_id"],
                final_code=sub.get("final_code") or "",
            )
        except Exception as e:
            print(f"Auto-grade failed for submission {body.submission_id}: {e}")

    return updated.data[0] if updated.data else sub


async def _maybe_autograde_curriculum_submission(
    submission_id: str,
    student_id: str,
    curriculum_assignment_id: str,
    final_code: str,
):
    """If the student is in at least one classroom with
    auto_grade_test_cases=true, run the curriculum assignment's test
    cases against their final_code and persist the score onto both
    the submission row and the matching exercise_responses row.
    """
    assignment = (
        supabase_admin.table("curriculum_assignments")
        .select("test_cases, default_comparison")
        .eq("id", curriculum_assignment_id)
        .maybe_single()
        .execute()
    )
    cases = ((assignment.data if assignment else {}) or {}).get("test_cases") or []
    if not cases:
        return

    memberships = (
        supabase_admin.table("classroom_members")
        .select("classroom_id, classrooms(auto_grade_test_cases)")
        .eq("student_id", student_id)
        .execute()
    ).data or []
    auto_on = any(((m.get("classrooms") or {}).get("auto_grade_test_cases")) for m in memberships)
    if not auto_on:
        return

    api_key = os.getenv("JUDGE0_API_KEY")
    if not api_key:
        return

    default_comparison = assignment.data.get("default_comparison") or "strip_trailing_whitespace"
    async with httpx.AsyncClient(timeout=30.0) as client:
        judge_results = await asyncio.gather(
            *[_judge0_run_one(client, api_key, final_code, tc.get("stdin", "")) for tc in cases],
            return_exceptions=True,
        )

    earned = 0
    total = 0
    for tc, raw in zip(cases, judge_results):
        weight = int(tc.get("weight", 1) or 0)
        total += weight
        if isinstance(raw, Exception):
            continue
        if raw.get("stderr"):
            continue
        comparison = tc.get("comparison") or default_comparison
        if _compare_outputs(raw.get("stdout", ""), tc["expected_stdout"], comparison):
            earned += weight

    if total == 0:
        return
    score = round(100 * earned / total, 1)

    supabase_admin.table("submissions").update({"grade": score}).eq("id", submission_id).execute()

    existing = (
        supabase_admin.table("exercise_responses")
        .select("id")
        .eq("student_id", student_id)
        .eq("lesson_id", curriculum_assignment_id)
        .eq("exercise_type", "curriculum_assignment")
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        supabase_admin.table("exercise_responses").update({
            "score": score,
            "is_correct": score >= 100,
        }).eq("id", existing.data["id"]).execute()


# ============================================================
# HINT SYSTEM
# ============================================================

ANTHROPIC_CLIENT = None

def get_anthropic():
    global ANTHROPIC_CLIENT
    if not ANTHROPIC_CLIENT:
        import anthropic
        ANTHROPIC_CLIENT = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return ANTHROPIC_CLIENT


class TrackRun(BaseModel):
    submission_id: str
    code_changed: bool


@router.post("/track-run")
async def track_run(
    body: TrackRun,
    user: CurrentUser = Depends(get_current_user),
):
    """Tracks run count and whether student edited before running. Gates hint availability."""
    submission = (
        supabase_admin.table("submissions")
        .select("run_count, has_edited_since_last_run")
        .eq("id", body.submission_id)
        .single()
        .execute()
    )
    if not submission.data:
        raise HTTPException(status_code=404, detail="Submission not found.")

    current_runs = submission.data.get("run_count", 0)

    supabase_admin.table("submissions").update({
        "run_count": current_runs + 1,
        "has_edited_since_last_run": False,
    }).eq("id", body.submission_id).execute()

    hint_1_available = (current_runs + 1) >= 2 and body.code_changed

    return {
        "run_count": current_runs + 1,
        "hint_1_available": hint_1_available,
    }


@router.post("/track-edit")
async def track_edit(
    submission_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Called when student edits their code. Marks that they've edited since last run."""
    supabase_admin.table("submissions").update({
        "has_edited_since_last_run": True,
    }).eq("id", submission_id).execute()
    return {"ok": True}


@router.post("/{submission_id}/hint/{level}")
async def get_hint(
    submission_id: str,
    level: int,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a hint for a submission. Level 1: vague nudge. Level 2: targeted hint."""
    if level not in (1, 2):
        raise HTTPException(status_code=400, detail="Hint level must be 1 or 2.")

    submission = (
        supabase_admin.table("submissions")
        .select("*, assignments!submissions_assignment_id_fkey(title, instructions, scaffold_level, hint_1, hint_2, hints_enabled, starter_code)")
        .eq("id", submission_id)
        .eq("student_id", user.profile_id)
        .single()
        .execute()
    )

    if not submission.data:
        raise HTTPException(status_code=404, detail="Submission not found.")

    sub = submission.data
    assignment = sub.get("assignments") or {}

    # Curriculum-scoped submissions don't have an assignments row — pull the
    # equivalent fields from curriculum_assignments instead.
    if not assignment and sub.get("curriculum_assignment_id"):
        c = (
            supabase_admin.table("curriculum_assignments")
            .select("title, instructions, scaffold_level, hint_1, hint_2, hints_enabled, starter_code")
            .eq("id", sub["curriculum_assignment_id"])
            .maybe_single()
            .execute()
        )
        assignment = (c.data if c else None) or {}

    teacher_hint = (assignment.get(f"hint_{level}") or "").strip()

    if not assignment.get("hints_enabled", True):
        raise HTTPException(status_code=403, detail="Hints are disabled for this assignment.")

    run_count = sub.get("run_count", 0)

    if level == 1 and run_count < 2:
        raise HTTPException(status_code=403, detail="Run your code at least twice before getting a hint.")

    if level == 2 and not sub.get("hint_1_unlocked_at"):
        raise HTTPException(status_code=403, detail="Get hint 1 first.")

    hint_text = teacher_hint if teacher_hint else None

    if not hint_text:
        hint_text = await _generate_ai_hint(
            level=level,
            assignment_title=assignment.get("title", ""),
            instructions=assignment.get("instructions", ""),
            scaffold_level=assignment.get("scaffold_level", "typed_python"),
            student_code=sub.get("final_code", "") if level == 2 else None,
            starter_code=assignment.get("starter_code", ""),
        )

    now = datetime.now(timezone.utc).isoformat()
    update_data = {"hint_count": (sub.get("hint_count", 0) + 1)}
    if level == 1 and not sub.get("hint_1_unlocked_at"):
        update_data["hint_1_unlocked_at"] = now
    if level == 2 and not sub.get("hint_2_unlocked_at"):
        update_data["hint_2_unlocked_at"] = now

    supabase_admin.table("submissions").update(update_data).eq("id", submission_id).execute()

    return {
        "hint": hint_text,
        "level": level,
        "source": "teacher" if teacher_hint else "ai",
    }


async def _generate_ai_hint(
    level: int,
    assignment_title: str,
    instructions: str,
    scaffold_level: str,
    student_code: str | None,
    starter_code: str,
) -> str:
    """Generates a Socratic hint using the Anthropic API."""
    SCAFFOLD_DESCRIPTIONS = {
        "block_pseudo": "a beginner who is just learning programming concepts",
        "typed_pseudo": "a beginner learning to express algorithms in text",
        "block_python": "a student learning Python with significant support",
        "typed_python": "a student learning Python independently",
    }
    audience = SCAFFOLD_DESCRIPTIONS.get(scaffold_level, "a high school student")

    if level == 1:
        system = f"""You are a supportive CS teacher giving a hint to {audience}.
Give a SHORT, vague nudge (2-3 sentences max) that points them in the right direction WITHOUT revealing the answer.
Focus on the concept they might be missing, not the specific code.
Do NOT show any code. Do NOT solve the problem. Ask a guiding question if helpful.
Be encouraging and warm."""
        user_msg = f"""Assignment: {assignment_title}
Instructions: {instructions}

Give hint level 1 — a gentle conceptual nudge. Don't mention specific code."""
    else:
        system = f"""You are a supportive CS teacher giving a targeted hint to {audience}.
The student has already received a general hint and is still stuck.
Give a MORE SPECIFIC hint (3-4 sentences) that addresses what's wrong in their code WITHOUT fixing it for them.
You may reference their code but do NOT rewrite it. Point out the specific area that needs attention.
Be encouraging. Never say "the answer is" or directly solve it."""
        user_msg = f"""Assignment: {assignment_title}
Instructions: {instructions}

Student's current code:
```python
{student_code or '# no code written yet'}
```

Starter code was:
```python
{starter_code or '# no starter code'}
```

Give hint level 2 — more targeted, referencing their specific code."""

    try:
        client = get_anthropic()
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            system=system,
            messages=[{"role": "user", "content": user_msg}]
        )
        return response.content[0].text.strip()
    except Exception as e:
        print(f"AI hint generation failed: {e}")
        return "Think about the core concept behind this problem. What does the assignment ask you to produce? Start there and work step by step."


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