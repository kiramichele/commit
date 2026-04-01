# ============================================================
# COMMIT PLATFORM — Auth Router
# ============================================================

from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional

from db import supabase_anon, supabase_admin
from auth_deps import CurrentUser, get_current_user

router = APIRouter()


# ============================================================
# SCHEMAS
# ============================================================

class TeacherSignup(BaseModel):
    email: str
    password: str
    display_name: str
    school_name: str
    state: str
    application_notes: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


# ============================================================
# ROUTES
# ============================================================

@router.post("/teacher/signup", status_code=status.HTTP_201_CREATED)
async def teacher_signup(body: TeacherSignup):
    """
    Teacher self-registration. Creates auth user + profile with
    approval_status = 'pending'. Admin must approve before they
    can create classrooms.
    """
    # Create the auth user
    try:
        auth_response = supabase_admin.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    auth_user = auth_response.user
    if not auth_user:
        raise HTTPException(status_code=500, detail="Failed to create user.")

    # Create the profile — pending approval
    supabase_admin.table("profiles").insert({
        "auth_user_id": str(auth_user.id),
        "role": "teacher",
        "display_name": body.display_name,
        "email": body.email,
        "school_name": body.school_name,
        "state": body.state,
        "application_notes": body.application_notes,
        "approval_status": "pending",
    }).execute()

    return {
        "message": "Application submitted. You will receive an email when your account is approved.",
        "email": body.email,
    }


@router.post("/login")
async def login(body: LoginRequest):
    """
    Authenticates a user and returns a Supabase session.
    The frontend stores the access_token and sends it as
    Authorization: Bearer <token> on subsequent requests.
    """
    try:
        response = supabase_anon.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not response.session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Fetch profile
    profile = (
        supabase_admin.table("profiles")
        .select("id, role, display_name, email, approval_status")
        .eq("auth_user_id", str(response.user.id))
        .single()
        .execute()
    )

    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found.")

    # Block pending teachers at login
    if profile.data["role"] == "teacher" and profile.data["approval_status"] == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending approval. You will receive an email when it is approved.",
        )

    if profile.data["role"] == "teacher" and profile.data["approval_status"] == "rejected":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your application was not approved.",
        )

    return {
        "access_token": response.session.access_token,
        "refresh_token": response.session.refresh_token,
        "profile": profile.data,
    }


@router.post("/logout")
async def logout(user: CurrentUser = Depends(get_current_user)):
    """Signs out the current user."""
    supabase_anon.auth.sign_out()
    return {"message": "Logged out."}


@router.get("/me")
async def get_me(user: CurrentUser = Depends(get_current_user)):
    """Returns the current user's profile."""
    return {
        "profile_id": user.profile_id,
        "role": user.role,
        "display_name": user.display_name,
        "email": user.email,
        "approval_status": user.approval_status,
    }

# ============================================================
# STREAK
# ============================================================

@router.get("/streak")
async def get_streak(user: CurrentUser = Depends(get_current_user)):
    """Returns the current student's streak data."""
    profile = (
        supabase_admin.table("profiles")
        .select("current_streak, longest_streak, last_activity_date")
        .eq("id", user.profile_id)
        .single()
        .execute()
    )
    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return profile.data


# ============================================================
# CHANGE PASSWORD
# ============================================================

class ChangePassword(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    body: ChangePassword,
    user: CurrentUser = Depends(get_current_user),
):
    """Changes password for the currently logged in user."""

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password.")

    # Verify current password by attempting sign in
    profile = (
        supabase_admin.table("profiles")
        .select("email")
        .eq("id", user.profile_id)
        .single()
        .execute()
    )
    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found.")

    try:
        supabase_anon.auth.sign_in_with_password({
            "email": profile.data["email"],
            "password": body.current_password,
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    # Update password
    try:
        supabase_admin.auth.admin.update_user_by_id(
            user.auth_user_id,
            {"password": body.new_password}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not update password: {str(e)}")

    return {"message": "Password updated successfully."}