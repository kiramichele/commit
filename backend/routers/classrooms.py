# ============================================================
# COMMIT PLATFORM — Classrooms Router
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from typing import Optional
import random
import uuid

from auth_deps import CurrentUser, get_current_user, require_teacher
from db import supabase_admin, supabase_anon, get_user_client

router = APIRouter()

FREE_TIER_CLASSROOM_LIMIT = 3


# ============================================================
# SCHEMAS
# ============================================================

class ClassroomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sequential_unlock: bool = True
    collab_enabled: bool = False
    standup_enabled: bool = False
    standup_frequency_days: int = 7
    discussion_enabled: bool = True


class ClassroomUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sequential_unlock: Optional[bool] = None
    collab_enabled: Optional[bool] = None
    standup_enabled: Optional[bool] = None
    standup_frequency_days: Optional[int] = None
    discussion_enabled: Optional[bool] = None
    archived: Optional[bool] = None


class StudentCreate(BaseModel):
    display_name: str
    email: str
    password: str


# ============================================================
# HELPERS
# ============================================================

def generate_join_code() -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(chars, k=6))


def unique_join_code() -> str:
    for _ in range(10):
        code = generate_join_code()
        existing = (
            supabase_admin.table("classrooms")
            .select("id")
            .eq("join_code", code)
            .execute()
        )
        if not existing.data:
            return code
    raise HTTPException(status_code=500, detail="Could not generate a unique join code.")


# ============================================================
# PUBLIC — Join flow (no auth required)
# These must come BEFORE /{classroom_id} to avoid FastAPI
# matching "preview" or "join" as a classroom_id
# ============================================================

class StudentJoin(BaseModel):
    join_code: str
    display_name: str
    email: str
    password: str
    avatar_url: Optional[str] = None


@router.get("/preview/{join_code}")
async def preview_classroom(join_code: str):
    """Returns basic classroom info for the join page. No auth required."""
    response = (
        supabase_admin.table("classrooms")
        .select("id, name, teacher_id")
        .eq("join_code", join_code.upper())
        .eq("archived", False)
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")

    # Get teacher name
    teacher = (
        supabase_admin.table("profiles")
        .select("display_name")
        .eq("id", response.data["teacher_id"])
        .single()
        .execute()
    )

    # Get student count
    members = (
        supabase_admin.table("classroom_members")
        .select("id", count="exact")
        .eq("classroom_id", response.data["id"])
        .execute()
    )

    return {
        "id": response.data["id"],
        "name": response.data["name"],
        "teacher_name": teacher.data["display_name"] if teacher.data else "Unknown",
        "student_count": members.count or 0,
    }


@router.post("/join")
async def join_classroom(body: StudentJoin):
    """Student self-registers and joins a classroom. No auth required."""
    # Find classroom
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("join_code", body.join_code.upper())
        .eq("archived", False)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=404, detail="Invalid join code.")

    classroom_id = classroom.data["id"]

    # Check student limit
    members = (
        supabase_admin.table("classroom_members")
        .select("id", count="exact")
        .eq("classroom_id", classroom_id)
        .execute()
    )
    if (members.count or 0) >= 45:
        raise HTTPException(status_code=403, detail="This classroom is full.")

    # Create auth user
    try:
        auth_response = supabase_admin.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not create account: {str(e)}")

    auth_user = auth_response.user
    if not auth_user:
        raise HTTPException(status_code=500, detail="Failed to create account.")

    # Create profile
    profile_data = {
        "auth_user_id": str(auth_user.id),
        "role": "student",
        "display_name": body.display_name,
        "email": body.email,
        "approval_status": "approved",
    }

    profile_result = supabase_admin.table("profiles").insert(profile_data).execute()
    if not profile_result.data:
        raise HTTPException(status_code=500, detail="Failed to create profile.")

    profile_id = profile_result.data[0]["id"]

    # Add to classroom
    supabase_admin.table("classroom_members").insert({
        "classroom_id": classroom_id,
        "student_id": profile_id,
    }).execute()

    # Sign in to get tokens
    try:
        session = supabase_anon.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(status_code=500, detail="Account created but could not sign in.")

    return {
        "access_token": session.session.access_token,
        "refresh_token": session.session.refresh_token,
        "profile": {
            "id": profile_id,
            "display_name": body.display_name,
            "role": "student",
        },
    }

@router.post("/upload-avatar")
async def upload_avatar(file: UploadFile = File(...)):
    BUCKET = "avatars"
    if file.content_type not in ["image/jpeg","image/png","image/webp","image/gif"]:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, or GIF allowed.")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo must be under 5MB.")
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"avatars/{uuid.uuid4()}.{ext}"
    try:
        try:
            supabase_admin.storage.create_bucket(BUCKET, options={"public": True})
        except:
            pass
        supabase_admin.storage.from_(BUCKET).upload(filename, contents, file_options={"content-type": file.content_type})
        url = supabase_admin.storage.from_(BUCKET).get_public_url(filename)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not upload photo: {str(e)}")


# ============================================================
# ROUTES (authenticated)
# ============================================================

@router.get("/")
async def list_classrooms(user: CurrentUser = Depends(get_current_user)):
    """Returns classrooms for the current user."""
    client = get_user_client(user.access_token)

    if user.role in ("teacher", "admin"):
        response = (
            client.table("classrooms")
            .select("*, classroom_members(count)")
            .eq("teacher_id", user.profile_id)
            .eq("archived", False)
            .order("created_at", desc=True)
            .execute()
        )
    else:
        response = (
            client.table("classroom_members")
            .select("classroom_id, classrooms(*)")
            .eq("student_id", user.profile_id)
            .execute()
        )

    return response.data or []


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_classroom(
    body: ClassroomCreate,
    user: CurrentUser = Depends(require_teacher),
):
    """Creates a new classroom. Enforces free tier limit."""
    existing = (
        supabase_admin.table("classrooms")
        .select("id", count="exact")
        .eq("teacher_id", user.profile_id)
        .eq("archived", False)
        .execute()
    )
    current_count = existing.count or 0

    if current_count >= FREE_TIER_CLASSROOM_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Free tier allows up to {FREE_TIER_CLASSROOM_LIMIT} active classrooms. "
                   "Upgrade to Teacher Pro for unlimited classrooms.",
        )

    join_code = unique_join_code()

    result = (
        supabase_admin.table("classrooms")
        .insert({
            "teacher_id": user.profile_id,
            "name": body.name,
            "description": body.description,
            "join_code": join_code,
            "sequential_unlock": body.sequential_unlock,
            "collab_enabled": body.collab_enabled,
            "standup_enabled": body.standup_enabled,
            "standup_frequency_days": body.standup_frequency_days,
            "discussion_enabled": body.discussion_enabled,
        })
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create classroom.")

    return result.data[0]


@router.get("/{classroom_id}")
async def get_classroom(
    classroom_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns a single classroom."""
    client = get_user_client(user.access_token)
    response = (
        client.table("classrooms")
        .select("*")
        .eq("id", classroom_id)
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Classroom not found.")
    return response.data


@router.patch("/{classroom_id}")
async def update_classroom(
    classroom_id: str,
    body: ClassroomUpdate,
    user: CurrentUser = Depends(require_teacher),
):
    """Updates classroom settings."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    result = (
        supabase_admin.table("classrooms")
        .update(updates)
        .eq("id", classroom_id)
        .eq("teacher_id", user.profile_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Classroom not found or access denied.")
    return result.data[0]


@router.delete("/{classroom_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_classroom(
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Soft-deletes (archives) a classroom."""
    supabase_admin.table("classrooms").update({"archived": True}).eq(
        "id", classroom_id
    ).eq("teacher_id", user.profile_id).execute()


@router.get("/{classroom_id}/students")
async def list_students(
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns all students in a classroom with their progress summary."""
    response = supabase_admin.rpc(
        "classroom_progress_summary", {"p_classroom_id": classroom_id}
    ).execute()
    return response.data or []


@router.post("/{classroom_id}/students", status_code=status.HTTP_201_CREATED)
async def add_student(
    classroom_id: str,
    body: StudentCreate,
    user: CurrentUser = Depends(require_teacher),
):
    """Teacher creates a student account and adds them to the classroom."""

    # Verify teacher owns this classroom
    classroom = (
        supabase_admin.table("classrooms")
        .select("id")
        .eq("id", classroom_id)
        .eq("teacher_id", user.profile_id)
        .single()
        .execute()
    )
    if not classroom.data:
        raise HTTPException(status_code=404, detail="Classroom not found or access denied.")

    # Check student count limit
    members = (
        supabase_admin.table("classroom_members")
        .select("id", count="exact")
        .eq("classroom_id", classroom_id)
        .execute()
    )
    if (members.count or 0) >= 45:
        raise HTTPException(status_code=403, detail="Classroom is at the 45 student limit.")

    # Create auth user via Supabase Admin API
    try:
        auth_response = supabase_admin.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not create user: {str(e)}")

    auth_user = auth_response.user
    if not auth_user:
        raise HTTPException(status_code=500, detail="Failed to create auth user.")

    # Create profile
    profile_result = supabase_admin.table("profiles").insert({
        "auth_user_id": str(auth_user.id),
        "role": "student",
        "display_name": body.display_name,
        "email": body.email,
        "approval_status": "approved",
    }).execute()

    if not profile_result.data:
        raise HTTPException(status_code=500, detail="Failed to create profile.")

    profile_id = profile_result.data[0]["id"]

    # Add to classroom
    supabase_admin.table("classroom_members").insert({
        "classroom_id": classroom_id,
        "student_id": profile_id,
    }).execute()

    return {"profile_id": profile_id, "display_name": body.display_name}


@router.get("/{classroom_id}/suspicious-commits")
async def get_suspicious_commits(
    classroom_id: str,
    user: CurrentUser = Depends(require_teacher),
):
    """Returns commits flagged as potentially suspicious."""
    response = supabase_admin.rpc(
        "flag_suspicious_commits", {"p_classroom_id": classroom_id}
    ).execute()
    return response.data or []