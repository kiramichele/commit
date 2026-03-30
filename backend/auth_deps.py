# ============================================================
# COMMIT PLATFORM — Auth Dependency
# ============================================================
# FastAPI dependency that extracts the current user from the
# Supabase JWT in the Authorization header.
#
# Usage in a route:
#   @router.get("/something")
#   async def my_route(user: CurrentUser = Depends(get_current_user)):
#       print(user.profile_id, user.role)
# ============================================================

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from db import supabase_admin

bearer_scheme = HTTPBearer()


class CurrentUser(BaseModel):
    auth_user_id: str
    profile_id: str
    role: str
    display_name: str
    email: str
    approval_status: str
    access_token: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    """
    Validates the Bearer token and returns the current user's profile.
    Raises 401 if the token is invalid or expired.
    Raises 403 if the teacher account is not yet approved.
    """
    token = credentials.credentials

    try:
        # Verify the JWT with Supabase
        user_response = supabase_admin.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token.",
            )
        auth_user = user_response.user
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    # Fetch the profile
    profile_response = (
        supabase_admin.table("profiles")
        .select("id, role, display_name, email, approval_status")
        .eq("auth_user_id", auth_user.id)
        .single()
        .execute()
    )

    if not profile_response.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User profile not found.",
        )

    profile = profile_response.data

    # Block unapproved teachers
    if profile["role"] == "teacher" and profile["approval_status"] != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your teacher account is pending approval.",
        )

    return CurrentUser(
        auth_user_id=str(auth_user.id),
        profile_id=profile["id"],
        role=profile["role"],
        display_name=profile["display_name"],
        email=profile["email"],
        approval_status=profile["approval_status"],
        access_token=token,
    )


async def require_teacher(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency that additionally requires the user to be a teacher."""
    if user.role not in ("teacher", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher access required.",
        )
    return user


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency that additionally requires the user to be an admin."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user