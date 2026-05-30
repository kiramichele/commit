# ============================================================
# COMMIT PLATFORM — Assignments Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from pydantic import BaseModel
from typing import Optional, List
import uuid

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin, get_user_client

router = APIRouter()


# ============================================================
# SCHEMAS
# ============================================================

class AssignmentCreate(BaseModel):
    classroom_id: str
    lesson_id: Optional[str] = None
    title: str
    instructions: Optional[str] = None
    starter_code: str = ''
    min_commits: int = 1
    scaffold_level: str = 'typed_python'
    due_date: Optional[str] = None
    allow_collab: bool = False
    assignment_type: str = 'code'  # code | activity | checkin | quiz | project | discussion
    is_graded: bool = True
    standards_tags: Optional[List[str]] = []
    hints_enabled: bool = True
    hint_1: Optional[str] = None
    hint_2: Optional[str] = None
    curriculum_unit_id: Optional[str] = None  # if set, this assignment shows in the curriculum tab of the teacher's classroom
    curriculum_order: Optional[float] = None  # numeric so we can slot between admin items via half-steps
    discussion_min_posts: Optional[int] = None
    discussion_min_comments: Optional[int] = None
    collab_enabled: Optional[bool] = None
    collab_group_size: Optional[int] = None
    collab_strategy: Optional[str] = None
    collab_allow_student_choice: Optional[bool] = None
    collab_allow_solo: Optional[bool] = None


class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    instructions: Optional[str] = None
    starter_code: Optional[str] = None
    min_commits: Optional[int] = None
    scaffold_level: Optional[str] = None
    due_date: Optional[str] = None
    allow_collab: Optional[bool] = None
    hints_enabled: Optional[bool] = None
    hint_1: Optional[str] = None
    hint_2: Optional[str] = None
    curriculum_unit_id: Optional[str] = None
    curriculum_order: Optional[float] = None
    discussion_min_posts: Optional[int] = None
    discussion_min_comments: Optional[int] = None
    collab_enabled: Optional[bool] = None
    collab_group_size: Optional[int] = None
    collab_strategy: Optional[str] = None
    collab_allow_student_choice: Optional[bool] = None
    collab_allow_solo: Optional[bool] = None


# ============================================================
# ROUTES
# ============================================================

@router.get("/ungraded-queue")
async def get_ungraded_queue(
    user: CurrentUser = Depends(require_teacher),
):
    """Returns all assignments with ungraded submitted submissions for the teacher's classrooms."""
    classrooms = (
        supabase_admin.table("classrooms")
        .select("id, name")
        .eq("teacher_id", user.profile_id)
        .eq("archived", False)
        .execute()
    )
    if not classrooms.data:
        return []

    classroom_ids = [c["id"] for c in classrooms.data]
    classroom_map = {c["id"]: c["name"] for c in classrooms.data}

    assignments = (
        supabase_admin.table("assignments")
        .select("id, title, classroom_id, assignment_type")
        .in_("classroom_id", classroom_ids)
        .execute()
    )
    if not assignments.data:
        return []

    results = []
    for assignment in assignments.data:
        ungraded = (
            supabase_admin.table("submissions")
            .select("id", count="exact")
            .eq("assignment_id", assignment["id"])
            .not_.is_("submitted_at", "null")
            .is_("grade", "null")
            .execute()
        )
        count = ungraded.count or 0
        if count > 0:
            results.append({
                "assignment_id": assignment["id"],
                "assignment_title": assignment["title"],
                "classroom_id": assignment["classroom_id"],
                "classroom_name": classroom_map.get(assignment["classroom_id"], "Unknown"),
                "ungraded_count": count,
                "assignment_type": assignment.get("assignment_type", "code"),
            })

    results.sort(key=lambda x: x["ungraded_count"], reverse=True)
    return results


@router.get("/")
async def list_assignments(
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns all assignments for a classroom."""
    client = get_user_client(user.access_token)
    response = (
        client.table("assignments")
        .select("*")
        .eq("classroom_id", classroom_id)
        .order("created_at", desc=False)
        .execute()
    )
    return response.data or []


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate,
    user: CurrentUser = Depends(require_teacher),
):
    """Creates a new assignment in a classroom."""
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", body.classroom_id)
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found or access denied.")

    if body.scaffold_level not in ('block_pseudo', 'typed_pseudo', 'block_python', 'typed_python'):
        raise HTTPException(status_code=400, detail="Invalid scaffold level.")

    if body.assignment_type not in ('code', 'activity', 'checkin', 'quiz', 'project', 'discussion'):
        raise HTTPException(status_code=400, detail="Invalid assignment type.")

    row = {
        "classroom_id": body.classroom_id,
        "lesson_id": body.lesson_id or None,
        "title": body.title,
        "instructions": body.instructions,
        "starter_code": body.starter_code,
        "min_commits": max(0, body.min_commits) if body.assignment_type != 'code' else max(1, body.min_commits),
        "scaffold_level": body.scaffold_level,
        "due_date": body.due_date or None,
        "allow_collab": body.allow_collab,
        "assignment_type": body.assignment_type,
        "is_graded": body.is_graded,
        "standards_tags": body.standards_tags or [],
        "hints_enabled": body.hints_enabled,
        "hint_1": body.hint_1,
        "hint_2": body.hint_2,
        "curriculum_unit_id": body.curriculum_unit_id,
        "curriculum_order": body.curriculum_order,
    }
    if body.assignment_type == 'discussion':
        row["discussion_min_posts"] = body.discussion_min_posts if body.discussion_min_posts is not None else 1
        row["discussion_min_comments"] = body.discussion_min_comments if body.discussion_min_comments is not None else 2

    # Collab fields are optional and inherit classroom defaults at read
    # time. Persist only what the teacher set so NULL overrides mean
    # "use classroom default".
    for key in ("collab_enabled", "collab_group_size", "collab_strategy",
                "collab_allow_student_choice", "collab_allow_solo"):
        val = getattr(body, key, None)
        if val is not None:
            row[key] = val
    if body.collab_strategy is not None and body.collab_strategy not in (
        "random", "similar_grade", "opposite_grade", "manual", "student_choice"
    ):
        raise HTTPException(status_code=400, detail="Invalid collab_strategy.")
    if body.collab_group_size is not None and (body.collab_group_size < 1 or body.collab_group_size > 6):
        raise HTTPException(status_code=400, detail="collab_group_size must be 1–6.")

    result = (
        supabase_admin.table("assignments")
        .insert(row)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment.")

    created = result.data[0]

    # If collab is enabled on the new assignment AND the strategy is
    # teacher-driven (random / similar_grade / opposite_grade), generate
    # the initial groups up front so the teacher sees them immediately
    # in the GroupsManager + every existing student has a placement
    # the moment they open the assignment. Manual + student_choice
    # strategies skip this — manual is hand-set, student_choice waits
    # on the picker.
    if created.get("collab_enabled"):
        try:
            from routers.groups import (
                _classroom_member_ids,
                _student_grade_map,
                _build_groups_for_strategy,
            )
            classroom_row = (
                supabase_admin.table("classrooms")
                .select("collab_default_group_size, collab_default_strategy")
                .eq("id", body.classroom_id)
                .maybe_single()
                .execute()
            ).data or {}
            strategy = created.get("collab_strategy") or classroom_row.get("collab_default_strategy") or "random"
            group_size = created.get("collab_group_size") or classroom_row.get("collab_default_group_size") or 2
            if strategy in ("random", "similar_grade", "opposite_grade"):
                student_ids = _classroom_member_ids(body.classroom_id)
                grades_by_student = _student_grade_map(body.classroom_id) if strategy != "random" else {}
                groups = _build_groups_for_strategy(student_ids, grades_by_student, strategy, int(group_size))
                for i, members in enumerate(groups):
                    if not members:
                        continue
                    g = supabase_admin.table("assignment_groups").insert({
                        "classroom_id": body.classroom_id,
                        "assignment_id": created["id"],
                        "curriculum_assignment_id": None,
                        "name": f"Group {i + 1}",
                        "formed_by": user.profile_id,
                    }).execute().data[0]
                    supabase_admin.table("assignment_group_members").insert(
                        [{"group_id": g["id"], "student_id": s} for s in members]
                    ).execute()
        except Exception as e:
            # Auto-generation is a nice-to-have, not load-bearing — if
            # something goes wrong, the lazy auto-place in
            # /groups/my-group still catches students on first open.
            print(f"Auto-generate groups failed for assignment {created.get('id')}: {e}")

    return created


@router.get("/{assignment_id}/analytics")
async def get_assignment_analytics(
    assignment_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns analytics for a single assignment."""
    from datetime import datetime, timezone

    assignment = (
        supabase_admin.table("assignments")
        .select("id, classroom_id, title, min_commits")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom_id = assignment.data["classroom_id"]

    members = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_id)
        .execute()
    )
    total_students = len(members.data or [])

    if total_students == 0:
        return {
            "total_students": 0, "submitted_count": 0, "submission_rate": 0,
            "graded_count": 0, "avg_grade": None, "avg_commits": None,
            "avg_time_to_submit_minutes": None,
            "grade_distribution": {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0},
            "hint_usage": {"none": 0, "hint1_only": 0, "hint2": 0},
        }

    submissions = (
        supabase_admin.table("submissions")
        .select("id, submitted_at, grade, first_opened_at, hint_count, hint_1_unlocked_at, hint_2_unlocked_at")
        .eq("assignment_id", assignment_id)
        .execute()
    )
    subs = submissions.data or []

    submitted_subs = [s for s in subs if s.get("submitted_at")]
    graded_subs = [s for s in subs if s.get("grade") is not None]

    grades = [s["grade"] for s in graded_subs]
    avg_grade = round(sum(grades) / len(grades), 1) if grades else None

    dist = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for g in grades:
        if g >= 90: dist["A"] += 1
        elif g >= 80: dist["B"] += 1
        elif g >= 70: dist["C"] += 1
        elif g >= 60: dist["D"] += 1
        else: dist["F"] += 1

    commit_counts = []
    for s in submitted_subs:
        count = supabase_admin.table("code_commits").select("id", count="exact").eq("submission_id", s["id"]).execute()
        commit_counts.append(count.count or 0)
    avg_commits = round(sum(commit_counts) / len(commit_counts), 1) if commit_counts else None

    times = []
    for s in submitted_subs:
        if s.get("first_opened_at") and s.get("submitted_at"):
            try:
                opened = datetime.fromisoformat(s["first_opened_at"].replace("Z", "+00:00"))
                submitted = datetime.fromisoformat(s["submitted_at"].replace("Z", "+00:00"))
                minutes = (submitted - opened).total_seconds() / 60
                if minutes > 0:
                    times.append(minutes)
            except Exception:
                pass
    avg_time = round(sum(times) / len(times), 0) if times else None

    hint_usage = {
        "none": sum(1 for s in subs if not s.get("hint_1_unlocked_at")),
        "hint1_only": sum(1 for s in subs if s.get("hint_1_unlocked_at") and not s.get("hint_2_unlocked_at")),
        "hint2": sum(1 for s in subs if s.get("hint_2_unlocked_at")),
    }

    return {
        "total_students": total_students,
        "submitted_count": len(submitted_subs),
        "submission_rate": round(len(submitted_subs) / total_students * 100),
        "graded_count": len(graded_subs),
        "avg_grade": avg_grade,
        "avg_commits": avg_commits,
        "avg_time_to_submit_minutes": int(avg_time) if avg_time else None,
        "grade_distribution": dist,
        "hint_usage": hint_usage,
    }


@router.get("/{assignment_id}")
async def get_assignment(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a single assignment."""
    client = get_user_client(user.access_token)
    response = (
        client.table("assignments")
        .select("*")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return response.data


@router.patch("/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    body: AssignmentUpdate,
    user: CurrentUser = Depends(require_teacher),
):
    """Updates an assignment."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    if "collab_strategy" in updates and updates["collab_strategy"] not in (
        "random", "similar_grade", "opposite_grade", "manual", "student_choice"
    ):
        raise HTTPException(status_code=400, detail="Invalid collab_strategy.")
    if "collab_group_size" in updates:
        gs = updates["collab_group_size"]
        if not isinstance(gs, int) or gs < 1 or gs > 6:
            raise HTTPException(status_code=400, detail="collab_group_size must be 1–6.")

    existing = (
        supabase_admin.table("assignments")
        .select("classroom_id")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", existing.data["classroom_id"])
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=403, detail="Access denied.")

    result = (
        supabase_admin.table("assignments")
        .update(updates)
        .eq("id", assignment_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update assignment.")
    return result.data[0]


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Deletes an assignment."""
    existing = (
        supabase_admin.table("assignments")
        .select("classroom_id")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", existing.data["classroom_id"])
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=403, detail="Access denied.")

    supabase_admin.table("assignments").delete().eq("id", assignment_id).execute()


# ============================================================
# INSTRUCTIONS HTML UPLOAD
# ============================================================

@router.post("/{assignment_id}/upload-instructions")
async def upload_instructions_html(
    assignment_id: str,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
):
    """Uploads an HTML file as the rich instructions for an assignment."""
    existing = (
        supabase_admin.table("assignments")
        .select("classroom_id, instructions_html_path")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", existing.data["classroom_id"])
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=403, detail="Access denied.")

    if not file.filename.endswith(".html"):
        raise HTTPException(status_code=400, detail="Only .html files are accepted.")

    contents = await file.read()

    old_path = existing.data.get("instructions_html_path")
    if old_path:
        try:
            supabase_admin.storage.from_("assignment-instructions").remove([old_path])
        except Exception:
            pass

    file_path = f"{assignment_id}/instructions.html"
    supabase_admin.storage.from_("assignment-instructions").upload(
        path=file_path,
        file=contents,
        file_options={"content-type": "text/html", "upsert": "true"},
    )

    supabase_admin.table("assignments").update({
        "instructions_html_path": file_path
    }).eq("id", assignment_id).execute()

    return {"instructions_html_path": file_path}


@router.get("/{assignment_id}/instructions-url")
async def get_instructions_url(
    assignment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a signed URL for the assignment's HTML instructions file."""
    assignment = (
        supabase_admin.table("assignments")
        .select("instructions_html_path")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not assignment.data or not assignment.data.get("instructions_html_path"):
        return {"url": None}

    signed = supabase_admin.storage.from_("assignment-instructions").create_signed_url(
        assignment.data["instructions_html_path"],
        expires_in=3600,
    )
    return {"url": signed.get("signedURL") or signed.get("signed_url")}


@router.delete("/{assignment_id}/upload-instructions")
async def delete_instructions_html(
    assignment_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Removes the HTML instructions file and reverts to plain text only."""
    existing = (
        supabase_admin.table("assignments")
        .select("classroom_id, instructions_html_path")
        .eq("id", assignment_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", existing.data["classroom_id"])
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=403, detail="Access denied.")

    path = existing.data.get("instructions_html_path")
    if path:
        try:
            supabase_admin.storage.from_("assignment-instructions").remove([path])
        except Exception:
            pass
        supabase_admin.table("assignments").update({
            "instructions_html_path": None
        }).eq("id", assignment_id).execute()

    return {"ok": True}