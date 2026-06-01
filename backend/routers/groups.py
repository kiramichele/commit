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
    idea: Optional[str] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    idea: Optional[str] = None  # set to "" to clear; None leaves it


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
        "id, classroom_id, assignment_id, curriculum_assignment_id, name, idea, formed_at, "
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


@router.get("")
@router.get("/")
async def list_groups(
    classroom_id: str,
    assignment_id: Optional[str] = None,
    curriculum_assignment_id: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns every group for this assignment in this classroom, with
    members + display name + avatar so the picker can render them.

    Implemented as three small selects (groups → members → profiles)
    instead of one PostgREST join. That keeps the query path robust
    against the FK-name + nested-resource pitfalls supabase-py has
    intermittently with deeply nested selects, and it makes failures
    easier to diagnose because each step is its own roundtrip.
    """
    classroom = _load_classroom(classroom_id)
    _assert_member_or_teacher(classroom, user)
    if bool(assignment_id) == bool(curriculum_assignment_id):
        raise HTTPException(
            status_code=400,
            detail="Pass exactly one of assignment_id or curriculum_assignment_id.",
        )

    q = supabase_admin.table("assignment_groups").select(
        "id, classroom_id, assignment_id, curriculum_assignment_id, name, idea, formed_at"
    ).eq("classroom_id", classroom_id)
    if assignment_id:
        q = q.eq("assignment_id", assignment_id)
    else:
        q = q.eq("curriculum_assignment_id", curriculum_assignment_id)
    groups = (q.order("formed_at").execute()).data or []
    if not groups:
        return []

    group_ids = [g["id"] for g in groups]
    member_rows = (
        supabase_admin.table("assignment_group_members")
        .select("group_id, student_id, joined_at")
        .in_("group_id", group_ids)
        .execute()
    ).data or []

    profile_ids = list({m["student_id"] for m in member_rows})
    profiles_by_id: dict = {}
    if profile_ids:
        profile_rows = (
            supabase_admin.table("profiles")
            .select("id, display_name, avatar_url")
            .in_("id", profile_ids)
            .execute()
        ).data or []
        profiles_by_id = {p["id"]: p for p in profile_rows}

    members_by_group: dict = {gid: [] for gid in group_ids}
    for m in member_rows:
        p = profiles_by_id.get(m["student_id"]) or {}
        members_by_group[m["group_id"]].append({
            "student_id": m["student_id"],
            "display_name": p.get("display_name"),
            "avatar_url": p.get("avatar_url"),
            "joined_at": m.get("joined_at"),
        })

    return [
        {
            "id": g["id"],
            "name": g.get("name"),
            "idea": g.get("idea"),
            "formed_at": g.get("formed_at"),
            "members": members_by_group.get(g["id"], []),
        }
        for g in groups
    ]


@router.get("/my-group")
async def get_my_group(
    classroom_id: str,
    assignment_id: Optional[str] = None,
    curriculum_assignment_id: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the group the current user is in for this assignment.

    For teacher-driven strategies (random / similar_grade / opposite_grade)
    we auto-place the student here so they don't sit on "waiting on your
    teacher" forever — fill the first non-full existing group, otherwise
    spin up a new one. Manual + student_choice strategies still return
    null so the picker / waiting state shows.
    """
    classroom = _load_classroom(classroom_id)
    _assert_member_or_teacher(classroom, user)
    if bool(assignment_id) == bool(curriculum_assignment_id):
        raise HTTPException(
            status_code=400,
            detail="Pass exactly one of assignment_id or curriculum_assignment_id.",
        )

    def _format(g: dict) -> dict:
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
            "idea": g.get("idea"),
            "formed_at": g.get("formed_at"),
            "members": members,
        }

    gid = _find_existing_membership(
        user.profile_id, classroom_id, assignment_id, curriculum_assignment_id
    )
    if gid:
        res = (
            _groups_query(assignment_id, curriculum_assignment_id, classroom_id)
            .eq("id", gid)
            .single()
            .execute()
        )
        return _format(res.data)

    # Not in a group yet. Only auto-place actual students; teachers /
    # admins viewing the page should still see null so they can
    # observe what students will experience.
    if user.role != "student":
        return None

    _, assignment_row = _resolve_assignment(assignment_id, curriculum_assignment_id)
    cfg = _resolve_collab_config(assignment_row, classroom)
    if not cfg["enabled"]:
        return None
    if cfg["strategy"] in ("manual", "student_choice"):
        return None

    target_group_id = _autoplace_student(
        student_id=user.profile_id,
        classroom_id=classroom_id,
        assignment_id=assignment_id,
        curriculum_assignment_id=curriculum_assignment_id,
        group_size=int(cfg["group_size"] or 2),
    )
    res = (
        _groups_query(assignment_id, curriculum_assignment_id, classroom_id)
        .eq("id", target_group_id)
        .single()
        .execute()
    )
    return _format(res.data)


def _autoplace_student(
    student_id: str,
    classroom_id: str,
    assignment_id: Optional[str],
    curriculum_assignment_id: Optional[str],
    group_size: int,
) -> str:
    """Slots a student into a group with vacancy, or creates a new one.
    Returns the group_id they ended up in. Idempotent — safe to call
    even if they were already a member.
    """
    q = supabase_admin.table("assignment_groups").select(
        "id, assignment_group_members(student_id)"
    ).eq("classroom_id", classroom_id)
    if assignment_id:
        q = q.eq("assignment_id", assignment_id)
    else:
        q = q.eq("curriculum_assignment_id", curriculum_assignment_id)
    existing = q.execute().data or []

    target = None
    for g in existing:
        members = g.get("assignment_group_members") or []
        if len(members) < group_size:
            target = g["id"]
            break

    if not target:
        created = supabase_admin.table("assignment_groups").insert({
            "classroom_id": classroom_id,
            "assignment_id": assignment_id,
            "curriculum_assignment_id": curriculum_assignment_id,
            "name": f"Group {len(existing) + 1}",
            "formed_by": student_id,
        }).execute()
        target = created.data[0]["id"]

    supabase_admin.table("assignment_group_members").upsert(
        {"group_id": target, "student_id": student_id},
        on_conflict="group_id,student_id",
    ).execute()
    return target


# ============================================================
# WRITE ROUTES — STUDENT
# ============================================================

@router.post("")
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
        "idea": (body.idea or "").strip() or None,
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


@router.patch("/{group_id}")
async def update_group(
    group_id: str,
    body: GroupUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """Updates a group's name + idea. Any group member can edit
    (not just the founder), and the classroom teacher can edit any
    group in their classroom. Empty string clears a field; None
    leaves it untouched.
    """
    group = (
        supabase_admin.table("assignment_groups")
        .select("id, classroom_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not group or not group.data:
        raise HTTPException(status_code=404, detail="Group not found.")
    g = group.data
    # Membership / teacher check.
    is_teacher = False
    if user.role in ("teacher", "admin"):
        cls = (
            supabase_admin.table("classrooms")
            .select("teacher_id")
            .eq("id", g["classroom_id"])
            .maybe_single()
            .execute()
        )
        if cls and cls.data and (cls.data.get("teacher_id") == user.profile_id or user.role == "admin"):
            is_teacher = True
    if not is_teacher:
        member = (
            supabase_admin.table("assignment_group_members")
            .select("student_id")
            .eq("group_id", group_id)
            .eq("student_id", user.profile_id)
            .maybe_single()
            .execute()
        )
        if not member or not member.data:
            raise HTTPException(status_code=403, detail="Only group members can edit this.")

    updates: dict = {}
    if body.name is not None:
        cleaned = body.name.strip()
        updates["name"] = cleaned or None
    if body.idea is not None:
        # Allow empty-string to clear; null means "not sure".
        cleaned = body.idea.strip()
        updates["idea"] = cleaned or None
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    supabase_admin.table("assignment_groups").update(updates).eq("id", group_id).execute()
    return {"updated": True}


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

@router.post("/fill-remaining")
async def fill_remaining(
    body: GenerateGroups,
    user: CurrentUser = Depends(require_teacher),
):
    """Drops every still-unassigned student into a group, randomly.
    Existing groups + members are preserved — this is the "pick up
    the stragglers" button for student_choice assignments after the
    teacher has given students a chance to self-form. Reuses the
    same auto-place helper students hit when they open the
    assignment, just batched.
    """
    classroom = _load_classroom(body.classroom_id)
    if classroom["teacher_id"] != user.profile_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your classroom.")
    if body.group_size < 1 or body.group_size > 6:
        raise HTTPException(status_code=400, detail="group_size must be 1-6.")
    _, _assignment_row = _resolve_assignment(body.assignment_id, body.curriculum_assignment_id)

    # Find who's already in a group for this assignment.
    q = supabase_admin.table("assignment_groups").select(
        "id, assignment_group_members(student_id)"
    ).eq("classroom_id", body.classroom_id)
    if body.assignment_id:
        q = q.eq("assignment_id", body.assignment_id)
    else:
        q = q.eq("curriculum_assignment_id", body.curriculum_assignment_id)
    existing = q.execute().data or []
    assigned: set = set()
    for g in existing:
        for m in (g.get("assignment_group_members") or []):
            assigned.add(m["student_id"])

    all_members = set(_classroom_member_ids(body.classroom_id))
    unassigned = list(all_members - assigned)

    if not unassigned:
        return {"placed": 0, "remaining": 0}

    _rand.shuffle(unassigned)
    for sid in unassigned:
        _autoplace_student(
            student_id=sid,
            classroom_id=body.classroom_id,
            assignment_id=body.assignment_id,
            curriculum_assignment_id=body.curriculum_assignment_id,
            group_size=int(body.group_size),
        )

    return {"placed": len(unassigned), "remaining": 0}


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


# ============================================================
# SNAPSHOTS — persistent shared document for late joiners
# ============================================================

class SnapshotWrite(BaseModel):
    code: str


def _assert_member_of_group(group_id: str, user: CurrentUser) -> dict:
    """Loads the group + checks the caller is a member, the teacher
    of the owning classroom, or an admin.
    """
    group = (
        supabase_admin.table("assignment_groups")
        .select("id, classroom_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not group or not group.data:
        raise HTTPException(status_code=404, detail="Group not found.")
    g = group.data
    if user.role == "admin":
        return g
    classroom = (
        supabase_admin.table("classrooms")
        .select("teacher_id")
        .eq("id", g["classroom_id"])
        .maybe_single()
        .execute()
    )
    if classroom and classroom.data and classroom.data["teacher_id"] == user.profile_id:
        return g
    member = (
        supabase_admin.table("assignment_group_members")
        .select("student_id")
        .eq("group_id", group_id)
        .eq("student_id", user.profile_id)
        .maybe_single()
        .execute()
    )
    if not member or not member.data:
        raise HTTPException(status_code=403, detail="Not a member of this group.")
    return g


@router.get("/{group_id}/snapshot")
async def get_snapshot(
    group_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the latest saved shared document for this group.
    Returns null `code` when no snapshot exists yet — the caller
    should fall back to the assignment's starter code in that case.
    """
    _assert_member_of_group(group_id, user)
    row = (
        supabase_admin.table("assignment_group_snapshots")
        .select("code, updated_at, updated_by")
        .eq("group_id", group_id)
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        return {"code": None, "updated_at": None, "updated_by": None}
    return row.data


@router.put("/{group_id}/snapshot")
async def put_snapshot(
    group_id: str,
    body: SnapshotWrite,
    user: CurrentUser = Depends(get_current_user),
):
    """Upserts the shared document. Last write wins — the realtime
    channel keeps members in sync, so the saved snapshot only needs
    to be approximately current. Frontend debounces ~2-3s between
    writes from each member.
    """
    _assert_member_of_group(group_id, user)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    supabase_admin.table("assignment_group_snapshots").upsert(
        {
            "group_id": group_id,
            "code": body.code,
            "updated_at": now,
            "updated_by": user.profile_id,
        },
        on_conflict="group_id",
    ).execute()
    return {"saved": True, "updated_at": now}
