# ============================================================
# COMMIT PLATFORM — Student To-Do Router
# backend/routers/todo.py
# ============================================================
# Per-student, per-classroom to-do list backing the kanban on
# /learn. Students manually add lessons or curriculum assignments,
# or the teacher can flip a classroom toggle so every unlock auto-
# adds the item to every member's todo.
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from auth_deps import CurrentUser, get_current_user
from db import supabase_admin

router = APIRouter()

VALID_KINDS = {"lesson", "project", "curriculum_assignment", "assignment"}


class TodoItem(BaseModel):
    classroom_id: str
    kind: str
    target_id: str


class TodoBulkItem(BaseModel):
    kind: str
    target_id: str


class TodoBulk(BaseModel):
    classroom_id: str
    items: List[TodoBulkItem]


def _assert_member(classroom_id: str, profile_id: str):
    member = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_id)
        .eq("student_id", profile_id)
        .maybe_single()
        .execute()
    )
    if not member or not member.data:
        raise HTTPException(status_code=403, detail="Not a member of this classroom.")


@router.get("/me")
async def list_my_todos(
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns the current student's todo items for the classroom as
    id sets keyed by kind. Lighter than full rows; the frontend just
    needs to know which items are on the list to render the toggles.
    """
    rows = (
        supabase_admin.table("student_todo_items")
        .select("kind, target_id")
        .eq("student_id", user.profile_id)
        .eq("classroom_id", classroom_id)
        .execute()
    ).data or []

    out: dict = {kind: [] for kind in VALID_KINDS}
    for r in rows:
        k = r.get("kind")
        if k in out:
            out[k].append(r["target_id"])
    return out


@router.post("/me", status_code=201)
async def add_todo(
    body: TodoItem,
    user: CurrentUser = Depends(get_current_user),
):
    if body.kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"Invalid kind: {body.kind!r}.")
    _assert_member(body.classroom_id, user.profile_id)
    supabase_admin.table("student_todo_items").upsert(
        {
            "student_id": user.profile_id,
            "classroom_id": body.classroom_id,
            "kind": body.kind,
            "target_id": body.target_id,
        },
        on_conflict="student_id,classroom_id,kind,target_id",
    ).execute()
    return {"added": True}


@router.delete("/me", status_code=204)
async def remove_todo(
    classroom_id: str,
    kind: str,
    target_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    if kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"Invalid kind: {kind!r}.")
    supabase_admin.table("student_todo_items").delete().eq(
        "student_id", user.profile_id
    ).eq("classroom_id", classroom_id).eq("kind", kind).eq("target_id", target_id).execute()


@router.post("/me/bulk")
async def add_todo_bulk(
    body: TodoBulk,
    user: CurrentUser = Depends(get_current_user),
):
    """Adds many items at once — used when the student bulk-adds a unit
    from their classroom view. Items with unknown kinds are skipped.
    """
    _assert_member(body.classroom_id, user.profile_id)
    rows = [
        {
            "student_id": user.profile_id,
            "classroom_id": body.classroom_id,
            "kind": it.kind,
            "target_id": it.target_id,
        }
        for it in body.items
        if it.kind in VALID_KINDS
    ]
    if not rows:
        return {"added": 0}
    supabase_admin.table("student_todo_items").upsert(
        rows, on_conflict="student_id,classroom_id,kind,target_id"
    ).execute()
    return {"added": len(rows)}


# ============================================================
# AUTO-ADD HELPER (called from curriculum.py unlock endpoints)
# ============================================================

def auto_add_for_classroom(
    classroom_id: str,
    items: List[dict],
):
    """Inserts todo rows for every current member of the classroom for
    every (kind, target_id) tuple in `items`, but only when the
    classroom has the auto-add toggle on. Safe to call unconditionally;
    bails out cleanly when the toggle is off, the classroom is missing,
    or the items list is empty.

    items: list of {"kind": str, "target_id": str}
    """
    if not items:
        return
    classroom = (
        supabase_admin.table("classrooms")
        .select("auto_add_assigned_to_todo")
        .eq("id", classroom_id)
        .maybe_single()
        .execute()
    )
    if not classroom or not classroom.data:
        return
    if not classroom.data.get("auto_add_assigned_to_todo"):
        return

    members = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_id)
        .execute()
    ).data or []
    if not members:
        return

    rows = []
    for m in members:
        for it in items:
            kind = it.get("kind")
            target_id = it.get("target_id")
            if kind not in VALID_KINDS or not target_id:
                continue
            rows.append(
                {
                    "student_id": m["student_id"],
                    "classroom_id": classroom_id,
                    "kind": kind,
                    "target_id": target_id,
                }
            )
    if not rows:
        return
    supabase_admin.table("student_todo_items").upsert(
        rows, on_conflict="student_id,classroom_id,kind,target_id"
    ).execute()
