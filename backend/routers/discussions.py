# ============================================================
# COMMIT PLATFORM — Discussions Router
# backend/routers/discussions.py
# ============================================================
# Discussion-board endpoints. Posts and comments are scoped to a
# (classroom, assignment) pair so curriculum-level discussions still
# show only classmates. Upvotes are toggle-on-toggle-off, no downvotes.
#
# When a student crosses both `discussion_min_posts` and
# `discussion_min_comments`, we mirror a completion into the right
# grading store:
#   - classroom assignment → `submissions` row, grade=100
#   - curriculum assignment → `exercise_responses` row, score=100
# Re-runs are idempotent.
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
import json

from auth_deps import CurrentUser, get_current_user
from db import supabase_admin

router = APIRouter()


# ============================================================
# SCHEMAS
# ============================================================

class PostCreate(BaseModel):
    classroom_id: str
    body: str


class CommentCreate(BaseModel):
    body: str


# ============================================================
# HELPERS
# ============================================================

def _load_assignment(assignment_id: str) -> dict:
    """Resolves a discussion assignment regardless of which table owns it.
    Returns a dict with: id, kind ('classroom'|'curriculum'), classroom_id (for
    classroom kind), discussion_min_posts, discussion_min_comments, title.
    """
    a = (
        supabase_admin.table("assignments")
        .select("id, classroom_id, assignment_type, discussion_min_posts, discussion_min_comments, title")
        .eq("id", assignment_id)
        .maybe_single()
        .execute()
    )
    if a and a.data and a.data.get("assignment_type") == "discussion":
        return {**a.data, "kind": "classroom"}

    c = (
        supabase_admin.table("curriculum_assignments")
        .select("id, assignment_type, discussion_min_posts, discussion_min_comments, title, is_published")
        .eq("id", assignment_id)
        .maybe_single()
        .execute()
    )
    if c and c.data and c.data.get("assignment_type") == "discussion":
        return {**c.data, "kind": "curriculum"}

    raise HTTPException(status_code=404, detail="Discussion assignment not found.")


def _ensure_member(classroom_id: str, profile_id: str, role: str):
    """Allow: admin, the classroom's teacher, or a current member student."""
    if role == "admin":
        return
    cls = (
        supabase_admin.table("classrooms")
        .select("teacher_id")
        .eq("id", classroom_id)
        .maybe_single()
        .execute()
    )
    if not cls or not cls.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")
    if cls.data["teacher_id"] == profile_id:
        return
    membership = (
        supabase_admin.table("classroom_members")
        .select("student_id")
        .eq("classroom_id", classroom_id)
        .eq("student_id", profile_id)
        .maybe_single()
        .execute()
    )
    if not membership or not membership.data:
        raise HTTPException(status_code=403, detail="Not a member of this classroom.")


def _posts_query(assignment: dict, classroom_id: str):
    q = supabase_admin.table("discussion_posts").select(
        "id, author_id, body, created_at, "
        "author:profiles!discussion_posts_author_id_fkey(display_name, avatar_url, role), "
        "comments:discussion_comments(count), "
        "upvotes:discussion_upvotes(count)"
    ).eq("classroom_id", classroom_id)
    if assignment["kind"] == "classroom":
        q = q.eq("assignment_id", assignment["id"])
    else:
        q = q.eq("curriculum_assignment_id", assignment["id"])
    return q


def _student_counts(assignment: dict, classroom_id: str, student_id: str) -> tuple[int, int]:
    """Returns (posts_made_in_this_assignment, comments_made_on_OTHERS posts in this assignment)."""
    if assignment["kind"] == "classroom":
        post_filter = ("assignment_id", assignment["id"])
    else:
        post_filter = ("curriculum_assignment_id", assignment["id"])

    own_posts = (
        supabase_admin.table("discussion_posts")
        .select("id")
        .eq("classroom_id", classroom_id)
        .eq(post_filter[0], post_filter[1])
        .eq("author_id", student_id)
        .execute()
    ).data or []
    posts_made = len(own_posts)

    # All posts in this assignment within this classroom.
    all_posts = (
        supabase_admin.table("discussion_posts")
        .select("id, author_id")
        .eq("classroom_id", classroom_id)
        .eq(post_filter[0], post_filter[1])
        .execute()
    ).data or []
    other_post_ids = [p["id"] for p in all_posts if p["author_id"] != student_id]
    if not other_post_ids:
        return posts_made, 0

    # Distinct posts that this student has commented on (count once per thread).
    my_comments = (
        supabase_admin.table("discussion_comments")
        .select("post_id")
        .in_("post_id", other_post_ids)
        .eq("author_id", student_id)
        .execute()
    ).data or []
    distinct_threads = {c["post_id"] for c in my_comments}
    return posts_made, len(distinct_threads)


def _maybe_mark_complete(
    assignment: dict,
    classroom_id: str,
    student_id: str,
):
    """If the student has met both thresholds, write a completion record.
    Auto-graded 100. Idempotent — won't downgrade an existing higher grade.
    """
    min_posts = int(assignment.get("discussion_min_posts") or 1)
    min_comments = int(assignment.get("discussion_min_comments") or 2)
    posts, comments = _student_counts(assignment, classroom_id, student_id)
    if posts < min_posts or comments < min_comments:
        return

    if assignment["kind"] == "classroom":
        existing = (
            supabase_admin.table("submissions")
            .select("id, grade")
            .eq("assignment_id", assignment["id"])
            .eq("student_id", student_id)
            .maybe_single()
            .execute()
        )
        if existing and existing.data:
            current = existing.data.get("grade")
            if current is None or float(current) < 100:
                supabase_admin.table("submissions").update({
                    "grade": 100,
                    "submitted_at": "now()",
                }).eq("id", existing.data["id"]).execute()
        else:
            supabase_admin.table("submissions").insert({
                "assignment_id": assignment["id"],
                "student_id": student_id,
                "final_code": "",
                "submitted_at": "now()",
                "grade": 100,
            }).execute()
        return

    # Curriculum assignment → mirror into exercise_responses.
    existing = (
        supabase_admin.table("exercise_responses")
        .select("id, score")
        .eq("student_id", student_id)
        .eq("lesson_id", assignment["id"])
        .eq("exercise_index", 0)
        .maybe_single()
        .execute()
    )
    row = {
        "student_id": student_id,
        "lesson_id": assignment["id"],
        "exercise_index": 0,
        "exercise_type": "curriculum_assignment",
        "response_text": json.dumps({"posts": posts, "comments": comments}),
        "is_correct": True,
        "score": 100,
    }
    if existing and existing.data:
        supabase_admin.table("exercise_responses").update(row).eq("id", existing.data["id"]).execute()
    else:
        supabase_admin.table("exercise_responses").insert(row).execute()


# ============================================================
# ROUTES — POSTS
# ============================================================

@router.get("/{assignment_id}")
async def get_discussion_meta(
    assignment_id: str,
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns assignment metadata + the classroom's name-display setting.
    classroom_id is required because curriculum-level discussions don't
    encode it themselves but we still need to scope posts.
    """
    assignment = _load_assignment(assignment_id)
    _ensure_member(classroom_id, user.profile_id, user.role)

    cls = (
        supabase_admin.table("classrooms")
        .select("id, name, discussion_name_display")
        .eq("id", classroom_id)
        .maybe_single()
        .execute()
    )
    if not cls or not cls.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")

    return {
        "assignment": {
            "id": assignment["id"],
            "title": assignment.get("title"),
            "kind": assignment["kind"],
            "discussion_min_posts": assignment.get("discussion_min_posts") or 1,
            "discussion_min_comments": assignment.get("discussion_min_comments") or 2,
        },
        "classroom": {
            "id": cls.data["id"],
            "name": cls.data["name"],
            "name_display": cls.data.get("discussion_name_display") or "first_name",
        },
    }


@router.get("/{assignment_id}/posts")
async def list_posts(
    assignment_id: str,
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns all posts in this (assignment, classroom) with author info,
    comment count, upvote count, and whether the current user upvoted each.
    """
    assignment = _load_assignment(assignment_id)
    _ensure_member(classroom_id, user.profile_id, user.role)

    res = _posts_query(assignment, classroom_id).order("created_at", desc=True).execute()
    posts = res.data or []

    # Which posts did the viewer upvote?
    post_ids = [p["id"] for p in posts]
    my_upvotes: set[str] = set()
    if post_ids:
        up = (
            supabase_admin.table("discussion_upvotes")
            .select("post_id")
            .eq("user_id", user.profile_id)
            .in_("post_id", post_ids)
            .execute()
        ).data or []
        my_upvotes = {r["post_id"] for r in up}

    def _flatten_count(field):
        if isinstance(field, list) and field:
            return int(field[0].get("count") or 0)
        if isinstance(field, dict):
            return int(field.get("count") or 0)
        return 0

    out = []
    for p in posts:
        author = p.get("author") or {}
        out.append({
            "id": p["id"],
            "author_id": p["author_id"],
            "author_display_name": author.get("display_name"),
            "author_avatar_url": author.get("avatar_url"),
            "author_role": author.get("role"),
            "body": p["body"],
            "created_at": p["created_at"],
            "comment_count": _flatten_count(p.get("comments")),
            "upvote_count": _flatten_count(p.get("upvotes")),
            "upvoted_by_me": p["id"] in my_upvotes,
            "is_mine": p["author_id"] == user.profile_id,
        })

    # Caller's progress.
    if user.role == "student":
        posts_made, comments_made = _student_counts(assignment, classroom_id, user.profile_id)
    else:
        posts_made, comments_made = 0, 0

    return {
        "posts": out,
        "my_progress": {
            "posts": posts_made,
            "comments": comments_made,
            "required_posts": int(assignment.get("discussion_min_posts") or 1),
            "required_comments": int(assignment.get("discussion_min_comments") or 2),
        },
    }


@router.post("/{assignment_id}/posts", status_code=201)
async def create_post(
    assignment_id: str,
    body: PostCreate,
    user: CurrentUser = Depends(get_current_user),
):
    assignment = _load_assignment(assignment_id)
    _ensure_member(body.classroom_id, user.profile_id, user.role)
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Post body cannot be empty.")

    row = {
        "classroom_id": body.classroom_id,
        "author_id": user.profile_id,
        "body": text,
    }
    if assignment["kind"] == "classroom":
        row["assignment_id"] = assignment["id"]
    else:
        row["curriculum_assignment_id"] = assignment["id"]

    result = supabase_admin.table("discussion_posts").insert(row).execute()
    created = result.data[0] if result.data else None

    if user.role == "student":
        _maybe_mark_complete(assignment, body.classroom_id, user.profile_id)

    return created


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(
    post_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Author can delete their own post; teachers/admins can moderate."""
    post = (
        supabase_admin.table("discussion_posts")
        .select("author_id, classroom_id")
        .eq("id", post_id)
        .maybe_single()
        .execute()
    )
    if not post or not post.data:
        raise HTTPException(status_code=404, detail="Post not found.")
    if post.data["author_id"] != user.profile_id and user.role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Not permitted.")
    supabase_admin.table("discussion_posts").delete().eq("id", post_id).execute()


# ============================================================
# ROUTES — COMMENTS
# ============================================================

@router.get("/posts/{post_id}/comments")
async def list_comments(
    post_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    post = (
        supabase_admin.table("discussion_posts")
        .select("classroom_id")
        .eq("id", post_id)
        .maybe_single()
        .execute()
    )
    if not post or not post.data:
        raise HTTPException(status_code=404, detail="Post not found.")
    _ensure_member(post.data["classroom_id"], user.profile_id, user.role)

    res = (
        supabase_admin.table("discussion_comments")
        .select(
            "id, author_id, body, created_at, "
            "author:profiles!discussion_comments_author_id_fkey(display_name, avatar_url, role)"
        )
        .eq("post_id", post_id)
        .order("created_at")
        .execute()
    )
    out = []
    for c in (res.data or []):
        author = c.get("author") or {}
        out.append({
            "id": c["id"],
            "author_id": c["author_id"],
            "author_display_name": author.get("display_name"),
            "author_avatar_url": author.get("avatar_url"),
            "author_role": author.get("role"),
            "body": c["body"],
            "created_at": c["created_at"],
            "is_mine": c["author_id"] == user.profile_id,
        })
    return out


@router.post("/posts/{post_id}/comments", status_code=201)
async def create_comment(
    post_id: str,
    body: CommentCreate,
    user: CurrentUser = Depends(get_current_user),
):
    post = (
        supabase_admin.table("discussion_posts")
        .select("id, classroom_id, assignment_id, curriculum_assignment_id")
        .eq("id", post_id)
        .maybe_single()
        .execute()
    )
    if not post or not post.data:
        raise HTTPException(status_code=404, detail="Post not found.")
    _ensure_member(post.data["classroom_id"], user.profile_id, user.role)
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment body cannot be empty.")

    result = (
        supabase_admin.table("discussion_comments")
        .insert({"post_id": post_id, "author_id": user.profile_id, "body": text})
        .execute()
    )
    created = result.data[0] if result.data else None

    if user.role == "student":
        # Resolve the assignment from the post and re-check completion.
        target_id = post.data["assignment_id"] or post.data["curriculum_assignment_id"]
        if target_id:
            try:
                assignment = _load_assignment(target_id)
                _maybe_mark_complete(assignment, post.data["classroom_id"], user.profile_id)
            except HTTPException:
                pass

    return created


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    comment = (
        supabase_admin.table("discussion_comments")
        .select("author_id, post_id")
        .eq("id", comment_id)
        .maybe_single()
        .execute()
    )
    if not comment or not comment.data:
        raise HTTPException(status_code=404, detail="Comment not found.")
    if comment.data["author_id"] != user.profile_id and user.role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Not permitted.")
    supabase_admin.table("discussion_comments").delete().eq("id", comment_id).execute()


# ============================================================
# ROUTES — UPVOTES
# ============================================================

@router.post("/posts/{post_id}/upvote")
async def toggle_upvote(
    post_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Toggles the caller's upvote on a post. Returns the new state."""
    post = (
        supabase_admin.table("discussion_posts")
        .select("id, classroom_id")
        .eq("id", post_id)
        .maybe_single()
        .execute()
    )
    if not post or not post.data:
        raise HTTPException(status_code=404, detail="Post not found.")
    _ensure_member(post.data["classroom_id"], user.profile_id, user.role)

    existing = (
        supabase_admin.table("discussion_upvotes")
        .select("id")
        .eq("post_id", post_id)
        .eq("user_id", user.profile_id)
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        supabase_admin.table("discussion_upvotes").delete().eq("id", existing.data["id"]).execute()
        upvoted = False
    else:
        supabase_admin.table("discussion_upvotes").insert(
            {"post_id": post_id, "user_id": user.profile_id}
        ).execute()
        upvoted = True

    count = (
        supabase_admin.table("discussion_upvotes")
        .select("id", count="exact")
        .eq("post_id", post_id)
        .execute()
    )
    return {"upvoted": upvoted, "upvote_count": count.count or 0}
