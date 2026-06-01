# ============================================================
# COMMIT PLATFORM — Demo Router
# backend/routers/demo.py
# ============================================================
# Spins up an ephemeral demo classroom for a prospect-facing
# preview. No auth required (anyone on the marketing page can hit
# it), but everything we create is stamped `is_demo=true` so a
# scheduled job can purge sessions older than N days and so the
# UI can render a sandbox banner.
#
# /demo/start does the heavy lifting:
#   - creates an auth user for the demo viewer (teacher or student)
#   - if teacher: builds a classroom, fills it with fake students,
#     auto-unlocks one unit of curriculum, seeds varied progress
#   - if student: builds a teacher + classroom + 4 other fake
#     students, joins the viewer to the classroom, seeds some
#     realistic personal progress
#   - returns access + refresh tokens so the frontend can drop
#     straight into either /dashboard or /learn
# ============================================================

import os
import random
import string
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from db import supabase_admin, supabase_anon

router = APIRouter()

DEMO_PASSWORD = "demo-account-not-for-login"  # password isn't surfaced
DEMO_EMAIL_DOMAIN = "demo.committocode.app"


FAKE_STUDENTS = [
    "Maya Patel",
    "Jordan Lee",
    "Sam Rodriguez",
    "Alex Chen",
    "Riley Kim",
    "Jamie O'Connor",
    "Taylor Brooks",
    "Morgan Davis",
]

FAKE_TEACHER = "Ms. Chen"


class DemoStart(BaseModel):
    role: str  # 'teacher' | 'student'


def _rand_token(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def _demo_email(suffix: str) -> str:
    return f"demo-{_rand_token(6)}-{suffix}@{DEMO_EMAIL_DOMAIN}"


def _create_auth_user(email: str) -> str:
    """Creates an auth user with a random password and returns the
    auth_user_id. Email is auto-confirmed so the next sign-in works.
    """
    resp = supabase_admin.auth.admin.create_user({
        "email": email,
        "password": DEMO_PASSWORD + _rand_token(8),  # random per-user
        "email_confirm": True,
    })
    if not resp or not resp.user:
        raise HTTPException(status_code=500, detail="Could not create demo auth user.")
    return str(resp.user.id)


def _create_profile(auth_user_id: str, display_name: str, role: str, email: str) -> str:
    """Inserts the profile row and returns its id."""
    result = supabase_admin.table("profiles").insert({
        "auth_user_id": auth_user_id,
        "role": role,
        "display_name": display_name,
        "email": email,
        "approval_status": "approved",
        "is_demo": True,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not create demo profile.")
    return result.data[0]["id"]


def _pick_unit() -> Optional[dict]:
    """Picks the first published unit that actually has published
    content under it. Falls back to the first published unit if
    none have published children — the demo will look sparse but
    not blank.
    """
    units = (
        supabase_admin.table("units")
        .select("id, title, order_index, is_published")
        .eq("is_published", True)
        .order("order_index")
        .execute()
    ).data or []
    if not units:
        return None
    for u in units:
        lessons = (
            supabase_admin.table("lessons")
            .select("id", count="exact")
            .eq("unit_id", u["id"])
            .eq("is_published", True)
            .execute()
        )
        if (lessons.count or 0) > 0:
            return u
    return units[0]


def _unlock_unit_for_classroom(classroom_id: str, unit_id: str, teacher_id: str):
    """Mirrors `/curriculum/classroom/{id}/unlock-unit/{unit_id}` —
    flips every published lesson / project / curriculum assignment
    in the unit on for the classroom.
    """
    lessons = (
        supabase_admin.table("lessons").select("id")
        .eq("unit_id", unit_id).eq("is_published", True).execute()
    ).data or []
    projects = (
        supabase_admin.table("projects").select("id")
        .eq("unit_id", unit_id).eq("is_published", True).execute()
    ).data or []
    assignments = (
        supabase_admin.table("curriculum_assignments").select("id")
        .eq("unit_id", unit_id).eq("is_published", True).execute()
    ).data or []

    if lessons:
        supabase_admin.table("classroom_lesson_unlocks").upsert(
            [{"classroom_id": classroom_id, "lesson_id": l["id"], "unlocked_by": teacher_id} for l in lessons],
            on_conflict="classroom_id,lesson_id",
        ).execute()
    if projects:
        supabase_admin.table("classroom_project_unlocks").upsert(
            [{"classroom_id": classroom_id, "project_id": p["id"], "unlocked_by": teacher_id} for p in projects],
            on_conflict="classroom_id,project_id",
        ).execute()
    if assignments:
        supabase_admin.table("classroom_curric_assignment_unlocks").upsert(
            [{"classroom_id": classroom_id, "curriculum_assignment_id": a["id"], "unlocked_by": teacher_id} for a in assignments],
            on_conflict="classroom_id,curriculum_assignment_id",
        ).execute()

    return {"lessons": lessons, "projects": projects, "assignments": assignments}


def _seed_lesson_completions(student_ids: List[str], lesson_ids: List[str], rng: random.Random):
    """Marks a random subset of (student, lesson) pairs as completed
    so the teacher's roster + gradebook look lived-in.
    """
    if not student_ids or not lesson_ids:
        return
    rows = []
    for sid in student_ids:
        # ~60% of students finish the first lesson, ~30% finish the
        # second, dropping off from there. Gives the demo class a
        # realistic "some kids ahead, some behind" feel.
        for i, lid in enumerate(lesson_ids):
            chance = max(0.0, 0.75 - (i * 0.25))
            if rng.random() < chance:
                rows.append({"student_id": sid, "lesson_id": lid})
    if rows:
        supabase_admin.table("lesson_completions").upsert(
            rows, on_conflict="student_id,lesson_id",
        ).execute()


def _sign_in(email: str, password: str) -> dict:
    """Returns the tokens we hand back to the frontend so it can drop
    the viewer straight into the app.
    """
    try:
        session = supabase_anon.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })
        return {
            "access_token": session.session.access_token,
            "refresh_token": session.session.refresh_token,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not sign in demo user: {e}")


def _build_classroom(teacher_profile_id: str, name: str) -> str:
    """Creates a demo classroom and returns its id."""
    code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    result = supabase_admin.table("classrooms").insert({
        "teacher_id": teacher_profile_id,
        "name": name,
        "description": "Live demo of the Commit platform.",
        "join_code": code,
        "sequential_unlock": False,
        "is_demo": True,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not create demo classroom.")
    return result.data[0]["id"]


def _seed_fake_students(classroom_id: str, count: int, rng: random.Random) -> List[str]:
    """Creates `count` fake students, joins them to the classroom,
    returns their profile ids in roster order.
    """
    chosen = rng.sample(FAKE_STUDENTS, k=min(count, len(FAKE_STUDENTS)))
    ids: List[str] = []
    for name in chosen:
        email = _demo_email(_rand_token(4))
        auth_id = _create_auth_user(email)
        pid = _create_profile(auth_id, name, "student", email)
        supabase_admin.table("classroom_members").insert({
            "classroom_id": classroom_id,
            "student_id": pid,
        }).execute()
        ids.append(pid)
    return ids


# ============================================================
# ROUTES
# ============================================================

@router.post("/start")
async def start_demo(body: DemoStart):
    """Builds a fresh demo classroom and returns sign-in tokens for
    whichever side the visitor picked.
    """
    role = (body.role or "").strip().lower()
    if role not in ("teacher", "student"):
        raise HTTPException(status_code=400, detail="role must be 'teacher' or 'student'.")

    unit = _pick_unit()
    if not unit:
        raise HTTPException(
            status_code=503,
            detail="No published curriculum is available yet — the demo needs at least one published unit.",
        )

    # Use a fresh RNG per request so two visitors hitting it at the
    # same time get distinct rosters.
    rng = random.Random()

    if role == "teacher":
        # Teacher viewer — they ARE the teacher; the fake students
        # populate the roster + gradebook.
        teacher_email = _demo_email("teacher")
        teacher_pw = DEMO_PASSWORD + _rand_token(10)
        teacher_resp = supabase_admin.auth.admin.create_user({
            "email": teacher_email,
            "password": teacher_pw,
            "email_confirm": True,
        })
        if not teacher_resp or not teacher_resp.user:
            raise HTTPException(status_code=500, detail="Could not create demo teacher.")
        teacher_pid = _create_profile(
            str(teacher_resp.user.id), FAKE_TEACHER, "teacher", teacher_email,
        )
        classroom_id = _build_classroom(teacher_pid, "AP CSP — Demo Class")
        student_ids = _seed_fake_students(classroom_id, count=6, rng=rng)
        content = _unlock_unit_for_classroom(classroom_id, unit["id"], teacher_pid)
        _seed_lesson_completions(student_ids, [l["id"] for l in content["lessons"]], rng)

        tokens = _sign_in(teacher_email, teacher_pw)
        return {
            "role": "teacher",
            "classroom_id": classroom_id,
            "redirect_to": f"/classroom/{classroom_id}",
            **tokens,
        }

    # ── Student viewer ──────────────────────────────────────────
    # The viewer is the student; we still need a teacher + a few
    # classmates so the experience feels populated.
    teacher_email = _demo_email("teacher")
    teacher_pw = DEMO_PASSWORD + _rand_token(10)
    teacher_resp = supabase_admin.auth.admin.create_user({
        "email": teacher_email,
        "password": teacher_pw,
        "email_confirm": True,
    })
    teacher_pid = _create_profile(
        str(teacher_resp.user.id), FAKE_TEACHER, "teacher", teacher_email,
    )
    classroom_id = _build_classroom(teacher_pid, "AP CSP — Demo Class")

    # 4 classmates for the demo student.
    classmate_ids = _seed_fake_students(classroom_id, count=4, rng=rng)

    # The demo student themselves.
    student_email = _demo_email("student")
    student_pw = DEMO_PASSWORD + _rand_token(10)
    student_auth = supabase_admin.auth.admin.create_user({
        "email": student_email,
        "password": student_pw,
        "email_confirm": True,
    })
    student_pid = _create_profile(
        str(student_auth.user.id), "Demo Student", "student", student_email,
    )
    supabase_admin.table("classroom_members").insert({
        "classroom_id": classroom_id,
        "student_id": student_pid,
    }).execute()

    content = _unlock_unit_for_classroom(classroom_id, unit["id"], teacher_pid)
    lesson_ids = [l["id"] for l in content["lessons"]]
    # Realistic personal progress: classmates ahead of them on
    # earlier lessons, demo student has finished the first one.
    _seed_lesson_completions(classmate_ids, lesson_ids, rng)
    if lesson_ids:
        supabase_admin.table("lesson_completions").upsert(
            [{"student_id": student_pid, "lesson_id": lesson_ids[0]}],
            on_conflict="student_id,lesson_id",
        ).execute()

    tokens = _sign_in(student_email, student_pw)
    return {
        "role": "student",
        "classroom_id": classroom_id,
        "redirect_to": f"/learn/{classroom_id}",
        **tokens,
    }
