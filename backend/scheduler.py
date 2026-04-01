#!/usr/bin/env python3
# ============================================================
# COMMIT PLATFORM — Due Tomorrow Notification Scheduler
# backend/scheduler.py
# ============================================================
# Run this daily at ~6pm student time via:
#   - A cron job on your server
#   - Railway cron (when deployed)
#   - GitHub Actions scheduled workflow
#
# Usage:
#   python scheduler.py
# ============================================================

import os
import sys
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from db import supabase_admin
from email_service import send_due_tomorrow_notification

APP_URL = os.getenv("APP_URL", "http://localhost:3000")


def run_due_tomorrow_notifications():
    """
    Sends due-tomorrow reminders to students whose assignments
    are due within the next 24 hours and haven't been submitted yet.
    """
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).date()
    tomorrow_start = datetime(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, 0, tzinfo=timezone.utc)
    tomorrow_end = datetime(tomorrow.year, tomorrow.month, tomorrow.day, 23, 59, 59, tzinfo=timezone.utc)

    print(f"[SCHEDULER] Running due-tomorrow notifications at {now.isoformat()}")
    print(f"[SCHEDULER] Looking for assignments due between {tomorrow_start.isoformat()} and {tomorrow_end.isoformat()}")

    # Find assignments due tomorrow (full calendar day in UTC)
    assignments = (
        supabase_admin.table("assignments")
        .select("id, title, due_date, min_commits, classroom_id, classrooms(name, classroom_members(student_id, profiles!classroom_members_student_id_fkey(display_name, email)))")
        .gte("due_date", tomorrow_start.isoformat())
        .lte("due_date", tomorrow_end.isoformat())
        .execute()
    )

    if not assignments.data:
        print("[SCHEDULER] No assignments due tomorrow.")
        return

    sent_count = 0

    for assignment in assignments.data:
        classroom = assignment.get("classrooms", {})
        members = classroom.get("classroom_members", [])

        for member in members:
            profile = member.get("profiles")
            if not profile:
                continue

            student_id = member.get("student_id")
            student_name = profile.get("display_name", "Student")
            student_email = profile.get("email")

            if not student_email:
                continue

            # Check if already submitted
            submission = (
                supabase_admin.table("submissions")
                .select("id, submitted_at")
                .eq("assignment_id", assignment["id"])
                .eq("student_id", student_id)
                .execute()
            )

            sub = submission.data[0] if submission.data else None

            # Skip if already submitted
            if sub and sub.get("submitted_at"):
                continue

            # Count commits separately
            commits_made = 0
            if sub:
                commit_count = (
                    supabase_admin.table("code_commits")
                    .select("id", count="exact")
                    .eq("submission_id", sub["id"])
                    .execute()
                )
                commits_made = commit_count.count or 0

            assignment_url = f"{APP_URL}/classroom/{assignment['classroom_id']}/assignment/{assignment['id']}"

            send_due_tomorrow_notification(
                student_email=student_email,
                student_name=student_name,
                assignment_title=assignment["title"],
                classroom_name=classroom.get("name", "your classroom"),
                commits_made=commits_made,
                commits_needed=assignment.get("min_commits", 1),
                assignment_url=assignment_url,
            )
            sent_count += 1

    print(f"[SCHEDULER] Done — sent {sent_count} due-tomorrow notifications.")


if __name__ == "__main__":
    run_due_tomorrow_notifications()