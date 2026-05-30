# ============================================================
# COMMIT PLATFORM — Feedback Router
# backend/routers/feedback.py
# ============================================================
# Accepts submissions from the floating feedback button. Auth is
# optional — logged-out visitors can also submit. Logged-in users
# get their profile id stamped on the row so we can match feedback
# to context if we follow up.
#
# Inserts to the `feedback` table AND fires a one-shot Resend email
# to whoever's listed in FEEDBACK_NOTIFY_EMAIL. The email is best-
# effort: if Resend errors, the row still saves.
# ============================================================

import os
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from typing import Optional

from db import supabase_admin
from email_service import send_feedback_notification

router = APIRouter()

VALID_KINDS = {"bug", "feature", "general"}
bearer_scheme = HTTPBearer(auto_error=False)


class FeedbackCreate(BaseModel):
    kind: str
    page: Optional[str] = None
    message: str
    email: Optional[str] = None


@router.post("/")
async def submit_feedback(
    body: FeedbackCreate,
    request: Request,
):
    """Accepts a feedback submission. Auth is optional — we read the
    Authorization header if present to attach the profile, but missing
    auth doesn't reject the request.
    """
    if body.kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="Invalid feedback kind.")
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Feedback message can't be empty.")
    if len(message) > 5000:
        raise HTTPException(status_code=400, detail="Feedback is too long (5000 char max).")

    # Try to attach the submitter's profile id when they're logged in.
    profile_id: Optional[str] = None
    display_name: Optional[str] = None
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1]
        try:
            auth_user = supabase_admin.auth.get_user(token).user
            if auth_user:
                profile = (
                    supabase_admin.table("profiles")
                    .select("id, display_name, email")
                    .eq("auth_user_id", str(auth_user.id))
                    .maybe_single()
                    .execute()
                )
                if profile and profile.data:
                    profile_id = profile.data["id"]
                    display_name = profile.data.get("display_name")
                    # Prefer the profile email over whatever was typed
                    # in the form — keeps anonymous_email pings honest.
                    if not body.email:
                        body.email = profile.data.get("email")
        except Exception:
            # Invalid/expired token — proceed as anonymous.
            pass

    page = (body.page or "")[:500]
    user_agent = (request.headers.get("user-agent") or "")[:500]

    row = {
        "kind": body.kind,
        "page": page,
        "message": message,
        "email": body.email,
        "profile_id": profile_id,
        "user_agent": user_agent,
    }
    supabase_admin.table("feedback").insert(row).execute()

    # Fire-and-forget notification to whoever owns the platform.
    notify_to = os.getenv("FEEDBACK_NOTIFY_EMAIL", "").strip()
    if notify_to:
        try:
            send_feedback_notification(
                to_email=notify_to,
                kind=body.kind,
                page=page,
                message=message,
                from_email=body.email,
                from_name=display_name,
            )
        except Exception as e:
            print(f"Feedback email failed: {e}")

    return {"ok": True}
