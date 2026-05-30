# ============================================================
# COMMIT PLATFORM — Collaboration Groups Router
# backend/routers/groups.py
# ============================================================
# Phase 1: data + REST. Phase 2 will add the realtime channel for
# live editing + cursor + mouse presence.
#
# A group ties N students to one assignment (classroom-scoped OR
# curriculum-scoped). The effective collab config is resolved
# top-down: per-assignment override → classroom default → hard-
# coded fallback. Most endpoints take both a classroom_id and an
# assignment ref so we can scope to the right roster + config.
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import random as _rand

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin

router = APIRouter()

VALID_STRATEGIES = {"random", "similar_grade", "opposite_grade", "manual", "student_choice"}


# ============================================================
# SCHEMAS
# ============================================================

class GroupCreate(BaseModel):
    classroom_id: str
    assignment_id: Optional[str] = None
    curriculum_assignment_id: Optional[str] = None
    name: Optional[str] = None


class GenerateGroups(BaseModel):
    classroom_id: str
    assignment_id: Optional[str] = None
    curriculum_assignment_id: Optional[str] = None
    strategy: str
    group_size: int


# ============================================================
# HELPERS
# ============================================================

def _resolve_assignment(
    assignment_id: Optional[str],
    curriculum_assignment_id: Optional[str],
):
    """Returns (kind, row) for the referenced assignment, or raises."""
    if bool(assignment_id) == bool(curriculum_assignment_id):
        raise HTTPException(
            status_code=400,
            detail="Pass exactly one of assignment_id or curriculum_assignment_id.",
        )
    if assignment_id:
        r = (
            supabase_admin.table("assignments")
            .select(
                "id, classroom_id, title, collab_enabled, collab_group_size, collab_strategy, "
                "collab_allow_student_choice, collab_allow_solo"
            )
            .eq("id", assignment_id)
            .maybe_single()
            .execute()
        )
        if not r or not r.data:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        return ("classroom", r.data)
    r = (
        supabase_admin.table("curriculum_assignments")
        .select(
            "id, title, collab_enabled, collab_group_size, collab_strategy, "
            "collab_allow_student_choice, collab_allow_solo, is_published"
        )
        .eq("id", curriculum_assignment_id)
        .maybe_single()
        .execute()
    )
    if not r or not r.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return ("curriculum", r.data)


def _resolve_collab_config(assignment_row: dict, classroom_row: dict) -> dict:
    """Per-assignment override wins; otherwise classroom default; otherwise
    hardcoded fallback. Returns the resolved settings as a plain dict.
    """
    return {
        "enabled": bool(assignment_row.get("collab_enabled")),
        "group_size": (
            assignment_row.get("collab_group_size")
            or classroom_row.get("collab_default_group_size")
            or 2
        ),
        "strategy": (
            assignment_row.get("collab_strategy")
            or classroom_row.get("collab_default_strategy")
            or "random"
        ),
        "allow_student_choice": (
            assignment_row["collab_allow_student_choice"]
            if assignment_row.get("collab_allow_student_choice") is not None
            else (
                classroom_row["collab_allow_student_choice"]
                if classroom_row.get("collab_allow_student_choice") is not None
                else True
            )
        ),
        "allow_solo": (
            assignment_row["collab_allow_solo"]
            if assignment_row.get("collab_allow_solo") is not None
            else (
                classroom_row["collab_allow_solo"]
                if classroom_row.get("collab_allow_solo") is not None
                else False
            )
        ),
    }


def _load_classroom(classroom_id: str) -> dict:
    cls = (
        supabase_admin.table("classrooms")
        .select(
            "id, teacher_id, collab_default_group_size, collab_default_strategy, "
            "collab_allow_student_choice, collab_allow_solo"
        )
        .eq("id", classroom_id)
        .maybe_single()
        .execute()
    )
    if not cls or not cls.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")
    return cls.data


def _assert_member_or_teacher(classroom_row: dict, user: CurrentUser):
    if user.role == "admin":
        return
    if classroom_row["teacher_id"] == user.profile_id:
        return
    member = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_row["id"])
        .eq("student_id", user.profile_id)
        .maybe_single()
        .execute()
    )
    if not member or not member.data:
        raise HTTPException(status_code=403, detail="Not a member of this classroom.")


def _groups_query(assignment_id: Optional[str], curriculum_assignment_id: Optional[str], classroom_id: str):
    q = supabase_admin.table("assignment_groups").select(
        "id, classroom_id, assignment_id, curriculum_assignment_id, name, formed_at, "
        "members:assignment_group_members(student_id, joined_at, "
        "profile:profiles!assignment_group_members_student_id_fkey(display_name, avatar_url))"
    ).eq("classroom_id", classroom_id)
    if assignment_id:
        q = q.eq("assignment_id", assignment_id)
    else:
        q = q.eq("curriculum_assignment_id", curriculum_assignment_id)
    return q


def _find_existing_membership(
    student_id: str,
    classroom_id: str,
    assignment_id: Optional[str],
    curriculum_assignment_id: Optional[str],
):
    """Returns the group_id this student is already a member of for the
    given (classroom, assignment) tuple, or None.
    """
    q = supabase_admin.table("assignment_groups").select(
        "id, assignment_group_members!inner(student_id)"
    ).eq("classroom_id", classroom_id).eq("assignment_group_members.student_id", student_id)
    if assignment_id:
        q = q.eq("assignment_id", assignment_id)
    else:
        q = q.eq("curriculum_assignment_id", curriculum_assignment_id)
    res = q.execute()
    rows = res.data or []
    return rows[0]["id"] if rows else None


def _classroom_member_ids(classroom_id: str) -> List[str]:
    rows = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_id)
        .execute()
    ).data or []
    return [r["student_id"] for r in rows]


def _build_groups_for_strategy(
    student_ids: List[str],
    grades_by_student: dict,
    strategy: str,
    group_size: int,
) -> List[List[str]]:
    """Generalized version of the peer-review pairing logic — works for
    any group size, not just pairs. Returns a list of groups, each a
    list of profile ids. The final group may be smaller than
    group_size if the roster doesn't divide evenly.
    """
    if not student_ids:
        return []
    ids = list(student_ids)
    if strategy == "manual":
        return []
    if strategy == "student_choice":
        return []
    if strategy == "random":
        _rand.shuffle(ids)
    elif strategy in ("similar_grade", "opposite_grade"):
        ids.sort(key=lambda s: grades_by_student.get(s, 0.0))
        if strategy == "opposite_grade":
            # Interleave high/low so groups mix top + bottom performers.
            half = len(ids) // 2
            low, high = ids[:half], list(reversed(ids[half:]))
            mixed = []
            for a, b in zip(high, low):
                mixed.extend([a, b])
            # Anyone left over from an odd-length roster goes at the end.
            mixed.extend(ids[2 * half:])
            ids = mixed
    # Now split into groups of `group_size`.
    if group_size < 1:
        group_size = 2
    return [ids[i : i + group_size] for i in range(0, len(ids), group_size)]


def _student_grade_map(classroom_id: str) -> dict:
    """For grade-based strategies — average submission grade per
    student in the classroom. Returns 0 for students with no graded
    submissions.
    """
    members = _classroom_member_ids(classroom_id)
    if not members:
        return {}
    grades_by_student: dict = {s: [] for s in members}
    subs = (
        supabase_admin.table("submissions")
        .select("student_id, grade, penalized_grade")
        .in_("student_id", members)
        .execute()
    ).data or []
    for s in subs:
        g = s.get("penalized_grade") if s.get("penalized_grade") is not None else s.get("grade")
        if g is None:
            continue
        grades_by_student.setdefault(s["student_id"], []).append(float(g))
    return {sid: (sum(v) / len(v) if v else 0.0) for sid, v in grades_by_student.items()}


# ============================================================
# READ ROUTES
# ============================================================

@router.get("/config")
async def get_collab_config(
    classroom_id: str,
    assignment_id: Optional[str] = None,
    curriculum_assignment_id: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the resolved collab config for this (classroom, assignment) pair."""
    classroom = _load_classroom(classroom_id)
    _assert_member_or_teacher(classroom, user)
    _, assignment_row = _resolve_assignment(assignment_id, curriculum_assignment_id)
    return _resolve_collab_config(assignment_row, classroom)


@router.get("/")
async def list_groups(
    classroom_id: str,
    assignment_id: Optional[str] = None,
    curriculum_assignment_id: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns every group for this assignment in this classroom, with
    members + display name + avatar so the picker can render them.
    """
    classroom = _load_classroom(classroom_id)
    _assert_member_or_teacher(classroom, user)
    if bool(assignment_id) == bool(curriculum_assignment_id):
        raise HTTPException(
            status_code=400,
            detail="Pass exactly one of assignment_id or curriculum_assignment_id.",
        )
    res = _groups_query(assignment_id, curriculum_assignment_id, classroom_id).order("formed_at").execute()
    out = []
    for g in (res.data or []):
        members = []
        for m in (g.get("members") or []):
            p = m.get("profile") or {}
            members.append({
                "student_id": m["student_id"],
                "display_name": p.get("display_name"),
                "avatar_url": p.get("avatar_url"),
                "joined_at": m.get("joined_at"),
            })
        out.append({
            "id": g["id"],
            "name": g.get("name"),
            "formed_at": g.get("formed_at"),
            "members": members,
        })
    return out


@router.get("/my-group")
async def get_my_group(
    classroom_id: str,
    assignment_id: Optional[str] = None,
    curriculum_assignment_id: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the group the current user is in for this assignment,
    or null. Students hit this on assignment open to decide whether to
    show the picker or the editor.
    """
    classroom = _load_classroom(classroom_id)
    _assert_member_or_teacher(classroom, user)
    if bool(assignment_id) == bool(curriculum_assignment_id):
        raise HTTPException(
            status_code=400,
            detail="Pass exactly one of assignment_id or curriculum_assignment_id.",
        )
    gid = _find_existing_membership(
        user.profile_id, classroom_id, assignment_id, curriculum_assignment_id
    )
    if not gid:
        return None
    res = (
        _groups_query(assignment_id, curriculum_assignment_id, classroom_id)
        .eq("id", gid)
        .single()
        .execute()
    )
    g = res.data
    members = []
    for m in (g.get("members") or []):
        p = m.get("profile") or {}
        members.append({
            "student_id": m["student_id"],
            "display_name": p.get("display_name"),
            "avatar_url": p.get("avatar_url"),
            "joined_at": m.get("joined_at"),
        })
    return {
        "id": g["id"],
        "name": g.get("name"),
        "formed_at": g.get("formed_at"),
        "members": members,
    }


# ============================================================
# WRITE ROUTES — STUDENT
# ============================================================

@router.post("/")
async def create_group(
    body: GroupCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Student self-forms a group (when student_choice is enabled).
    Auto-joins the creator. Fails if they're already in a group for
    this assignment.
    """
    classroom = _load_classroom(body.classroom_id)
    _assert_member_or_teacher(classroom, user)
    _, assignment_row = _resolve_assignment(body.assignment_id, body.curriculum_assignment_id)
    cfg = _resolve_collab_config(assignment_row, classroom)
    if not cfg["enabled"]:
        raise HTTPException(status_code=400, detail="Collab is not enabled for this assignment.")
    if not cfg["allow_student_choice"]:
        raise HTTPException(status_code=403, detail="Your teacher hasn't enabled student-chosen groups.")
    existing = _find_existing_membership(
        user.profile_id, body.classroom_id, body.assignment_id, body.curriculum_assignment_id
    )
    if existing:
        raise HTTPException(status_code=409, detail="You're already in a group for this assignment.")

    row = {
        "classroom_id": body.classroom_id,
        "assignment_id": body.assignment_id,
        "curriculum_assignment_id": body.curriculum_assignment_id,
        "name": (body.name or "").strip() or None,
        "formed_by": user.profile_id,
    }
    created = supabase_admin.table("assignment_groups").insert(row).execute().data[0]
    supabase_admin.table("assignment_group_members").insert(
        {"group_id": created["id"], "student_id": user.profile_id}
    ).execute()
    return {"id": created["id"]}


@router.post("/{group_id}/join")
async def join_group(
    group_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    group = (
        supabase_admin.table("assignment_groups")
        .select("id, classroom_id, assignment_id, curriculum_assignment_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not group or not group.data:
        raise HTTPException(status_code=404, detail="Group not found.")
    g = group.data
    classroom = _load_classroom(g["classroom_id"])
    _assert_member_or_teacher(classroom, user)
    _, assignment_row = _resolve_assignment(g["assignment_id"], g["curriculum_assignment_id"])
    cfg = _resolve_collab_config(assignment_row, classroom)
    if not cfg["enabled"]:
        raise HTTPException(status_code=400, detail="Collab is not enabled for this assignment.")
    if not cfg["allow_student_choice"]:
        raise HTTPException(status_code=403, detail="Your teacher hasn't enabled student-chosen groups.")

    # Check current size against the resolved cap.
    members = (
        supabase_admin.table("assignment_group_members")
        .select("student_id", count="exact")
        .eq("group_id", group_id)
        .execute()
    )
    if (members.count or 0) >= cfg["group_size"]:
        raise HTTPException(status_code=409, detail="That group is full.")

    # Disallow being in multiple groups for the same assignment.
    existing = _find_existing_membership(
        user.profile_id, g["classroom_id"], g["assignment_id"], g["curriculum_assignment_id"]
    )
    if existing == group_id:
        return {"joined": True}
    if existing:
        raise HTTPException(status_code=409, detail="You're already in a different group for this assignment.")

    supabase_admin.table("assignment_group_members").insert(
        {"group_id": group_id, "student_id": user.profile_id}
    ).execute()
    return {"joined": True}


@router.post("/{group_id}/leave", status_code=204)
async def leave_group(
    group_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Student leaves their group. Teachers can use the dedicated
    delete endpoint to remove others. Groups that drop to zero members
    are cleaned up so they don't litter the picker.
    """
    supabase_admin.table("assignment_group_members").delete().eq(
        "group_id", group_id
    ).eq("student_id", user.profile_id).execute()
    remaining = (
        supabase_admin.table("assignment_group_members")
        .select("student_id", count="exact")
        .eq("group_id", group_id)
        .execute()
    )
    if (remaining.count or 0) == 0:
        supabase_admin.table("assignment_groups").delete().eq("id", group_id).execute()


@router.post("/solo")
async def go_solo(
    body: GroupCreate,
    user: CurrentUser = Depends(get_current_user),
):
    """Student opts to work alone — creates a 1-member group with the
    only member being them. Only allowed when the resolved config has
    `allow_solo` true.
    """
    classroom = _load_classroom(body.classroom_id)
    _assert_member_or_teacher(classroom, user)
    _, assignment_row = _resolve_assignment(body.assignment_id, body.curriculum_assignment_id)
    cfg = _resolve_collab_config(assignment_row, classroom)
    if not cfg["enabled"]:
        raise HTTPException(status_code=400, detail="Collab is not enabled for this assignment.")
    if not cfg["allow_solo"]:
        raise HTTPException(status_code=403, detail="Solo mode isn't allowed on this assignment.")
    existing = _find_existing_membership(
        user.profile_id, body.classroom_id, body.assignment_id, body.curriculum_assignment_id
    )
    if existing:
        raise HTTPException(status_code=409, detail="You're already in a group for this assignment.")

    created = supabase_admin.table("assignment_groups").insert(
        {
            "classroom_id": body.classroom_id,
            "assignment_id": body.assignment_id,
            "curriculum_assignment_id": body.curriculum_assignment_id,
            "name": "Solo",
            "formed_by": user.profile_id,
        }
    ).execute().data[0]
    supabase_admin.table("assignment_group_members").insert(
        {"group_id": created["id"], "student_id": user.profile_id}
    ).execute()
    return {"id": created["id"]}


# ============================================================
# WRITE ROUTES — TEACHER
# ============================================================

@router.post("/generate")
async def generate_groups(
    body: GenerateGroups,
    user: CurrentUser = Depends(require_teacher),
):
    """Teacher generates (or regenerates) groups using a strategy.
    Wipes any existing groups for this assignment first so reruns are
    deterministic and don't pile up stale groups.
    """
    classroom = _load_classroom(body.classroom_id)
    if classroom["teacher_id"] != user.profile_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your classroom.")
    if body.strategy not in VALID_STRATEGIES:
        raise HTTPException(status_code=400, detail="Invalid strategy.")
    if body.group_size < 1 or body.group_size > 6:
        raise HTTPException(status_code=400, detail="group_size must be 1-6.")
    _, _assignment_row = _resolve_assignment(body.assignment_id, body.curriculum_assignment_id)

    # Wipe existing groups so the new generation is the source of truth.
    q = supabase_admin.table("assignment_groups").delete().eq("classroom_id", body.classroom_id)
    if body.assignment_id:
        q = q.eq("assignment_id", body.assignment_id)
    else:
        q = q.eq("curriculum_assignment_id", body.curriculum_assignment_id)
    q.execute()

    if body.strategy in ("manual", "student_choice"):
        # Nothing to generate; teacher will add manually or students self-pick.
        return {"created": 0, "strategy": body.strategy}

    student_ids = _classroom_member_ids(body.classroom_id)
    grades_by_student = _student_grade_map(body.classroom_id) if body.strategy in ("similar_grade", "opposite_grade") else {}
    groups = _build_groups_for_strategy(student_ids, grades_by_student, body.strategy, body.group_size)

    created_count = 0
    for i, members in enumerate(groups):
        if not members:
            continue
        created = supabase_admin.table("assignment_groups").insert(
            {
                "classroom_id": body.classroom_id,
                "assignment_id": body.assignment_id,
                "curriculum_assignment_id": body.curriculum_assignment_id,
                "name": f"Group {i + 1}",
                "formed_by": user.profile_id,
            }
        ).execute().data[0]
        supabase_admin.table("assignment_group_members").insert(
            [{"group_id": created["id"], "student_id": s} for s in members]
        ).execute()
        created_count += 1

    return {"created": created_count, "strategy": body.strategy}


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Teacher removes a group entirely. Cascades to memberships."""
    group = (
        supabase_admin.table("assignment_groups")
        .select("id, classroom_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not group or not group.data:
        raise HTTPException(status_code=404, detail="Group not found.")
    classroom = _load_classroom(group.data["classroom_id"])
    if classroom["teacher_id"] != user.profile_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your classroom.")
    supabase_admin.table("assignment_groups").delete().eq("id", group_id).execute()


@router.post("/{group_id}/members/{student_id}")
async def add_member(
    group_id: str,
    student_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Teacher adds a specific student to a specific group (manual
    strategy + ad-hoc corrections).
    """
    group = (
        supabase_admin.table("assignment_groups")
        .select("id, classroom_id, assignment_id, curriculum_assignment_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not group or not group.data:
        raise HTTPException(status_code=404, detail="Group not found.")
    g = group.data
    classroom = _load_classroom(g["classroom_id"])
    if classroom["teacher_id"] != user.profile_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your classroom.")

    # Pull the student out of any other group for this assignment first.
    other = _find_existing_membership(
        student_id, g["classroom_id"], g["assignment_id"], g["curriculum_assignment_id"]
    )
    if other and other != group_id:
        supabase_admin.table("assignment_group_members").delete().eq(
            "group_id", other
        ).eq("student_id", student_id).execute()
        # Clean up empties.
        remaining = (
            supabase_admin.table("assignment_group_members")
            .select("student_id", count="exact")
            .eq("group_id", other)
            .execute()
        )
        if (remaining.count or 0) == 0:
            supabase_admin.table("assignment_groups").delete().eq("id", other).execute()

    supabase_admin.table("assignment_group_members").upsert(
        {"group_id": group_id, "student_id": student_id},
        on_conflict="group_id,student_id",
    ).execute()
    return {"added": True}


@router.delete("/{group_id}/members/{student_id}", status_code=204)
async def remove_member(
    group_id: str,
    student_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    group = (
        supabase_admin.table("assignment_groups")
        .select("id, classroom_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not group or not group.data:
        raise HTTPException(status_code=404, detail="Group not found.")
    classroom = _load_classroom(group.data["classroom_id"])
    if classroom["teacher_id"] != user.profile_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your classroom.")
    supabase_admin.table("assignment_group_members").delete().eq(
        "group_id", group_id
    ).eq("student_id", student_id).execute()
