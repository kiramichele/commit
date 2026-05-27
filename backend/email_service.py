# ============================================================
# COMMIT PLATFORM — Email Service
# backend/email_service.py
# ============================================================
# Uses Resend API for all outgoing emails.
# Install: pip install resend
# Add to .env: RESEND_API_KEY=re_xxxx
# ============================================================

import os
import resend
from typing import Optional

resend.api_key = os.getenv("RESEND_API_KEY", "")

FROM_EMAIL = os.getenv("FROM_EMAIL", "notifications@commit.app")
FROM_NAME = "commit"
APP_URL = os.getenv("APP_URL", "http://localhost:3000")


# ── SHARED STYLES ─────────────────────────────────────────────

def _base_template(content: str, preheader: str = "") -> str:
    """Wraps content in the Commit branded email shell."""
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>commit</title>
</head>
<body style="margin:0;padding:0;background:#F8F7F5;font-family:'Helvetica Neue',Arial,sans-serif;">
  {f'<div style="display:none;max-height:0;overflow:hidden;color:#F8F7F5;">{preheader}</div>' if preheader else ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F7F5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- HEADER -->
        <tr><td style="padding-bottom:24px;text-align:center;">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="background:#1A56DB;border-radius:8px;padding:8px 14px;font-family:'Courier New',monospace;font-size:14px;font-weight:bold;color:white;letter-spacing:1px;">
                &gt;_
              </td>
              <td style="padding-left:10px;font-size:20px;font-weight:700;color:#0E2D6E;letter-spacing:-0.5px;">
                commit
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- CONTENT CARD -->
        <tr><td style="background:white;border-radius:14px;border:1px solid rgba(14,45,110,0.08);padding:36px 40px;box-shadow:0 4px 24px rgba(14,45,110,0.06);">
          {content}
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding-top:24px;text-align:center;font-size:12px;color:#888780;">
          commit platform &nbsp;·&nbsp; <a href="{APP_URL}" style="color:#1A56DB;text-decoration:none;">commit.app</a>
          <br/>
          <span style="font-size:11px;color:#aaa;">you're receiving this because you have a commit account.</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _button(text: str, url: str, color: str = "#1A56DB") -> str:
    return f"""
<table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
  <tr>
    <td style="background:{color};border-radius:8px;">
      <a href="{url}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:white;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif;">
        {text} →
      </a>
    </td>
  </tr>
</table>
"""


def _h1(text: str) -> str:
    return f'<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0E2D6E;letter-spacing:-0.5px;">{text}</h1>'


def _p(text: str, muted: bool = False) -> str:
    color = "#888780" if muted else "#333333"
    return f'<p style="margin:0 0 16px;font-size:14px;color:{color};line-height:1.7;">{text}</p>'


def _divider() -> str:
    return '<hr style="border:none;border-top:1px solid rgba(14,45,110,0.08);margin:24px 0;" />'


def _grade_badge(grade: float) -> str:
    if grade >= 90: color, bg = "#166534", "#DCFCE7"
    elif grade >= 80: color, bg = "#0C447C", "#EBF1FD"
    elif grade >= 70: color, bg = "#854D0E", "#FEF9C3"
    else: color, bg = "#991B1B", "#FEE2E2"
    return f'<span style="display:inline-block;font-size:28px;font-weight:700;color:{color};background:{bg};padding:8px 20px;border-radius:10px;font-family:\'Courier New\',monospace;">{grade}</span>'


# ── SEND HELPER ───────────────────────────────────────────────

def _send(to: str, subject: str, html: str) -> bool:
    """Sends an email via Resend. Returns True on success."""
    if not resend.api_key:
        print(f"[EMAIL] RESEND_API_KEY not set — skipping email to {to}")
        return False
    try:
        resend.Emails.send({
            "from": f"{FROM_NAME} <{FROM_EMAIL}>",
            "to": [to],
            "subject": subject,
            "html": html,
        })
        print(f"[EMAIL] Sent '{subject}' to {to}")
        return True
    except Exception as e:
        print(f"[EMAIL] Failed to send to {to}: {e}")
        return False


# ── EMAIL TEMPLATES ───────────────────────────────────────────

def send_grade_notification(
    student_email: str,
    student_name: str,
    assignment_title: str,
    classroom_name: str,
    grade: float,
    feedback: Optional[str],
    assignment_url: str,
):
    """Notifies a student that their assignment has been graded."""
    first_name = student_name.split(" ")[0]

    feedback_block = ""
    if feedback:
        feedback_block = f"""
        {_divider()}
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#888780;">teacher feedback</p>
        <p style="margin:0;font-size:14px;color:#333;line-height:1.7;font-style:italic;padding:12px 16px;background:#F8F7F5;border-radius:8px;border-left:3px solid #1A56DB;">"{feedback}"</p>
        """

    content = f"""
    {_h1(f"your grade is in, {first_name}!")}
    {_p(f"<strong>{assignment_title}</strong> has been graded in <strong>{classroom_name}</strong>.")}
    <div style="text-align:center;margin:24px 0;">
      {_grade_badge(grade)}
      <p style="margin:8px 0 0;font-size:13px;color:#888780;">out of 100</p>
    </div>
    {feedback_block}
    {_button("open assignment", assignment_url)}
    """

    _send(
        to=student_email,
        subject=f"📝 {assignment_title} — graded",
        html=_base_template(content, preheader=f"You scored {grade}/100 on {assignment_title}"),
    )


def send_help_request_notification(
    teacher_email: str,
    teacher_name: str,
    student_name: str,
    assignment_title: str,
    classroom_name: str,
    note: Optional[str],
    help_queue_url: str,
):
    """Notifies a teacher that a student has raised their hand."""
    first_name = teacher_name.split(" ")[0]

    note_block = ""
    if note:
        note_block = f"""
        {_divider()}
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#888780;">student's note</p>
        <p style="margin:0;font-size:14px;color:#333;line-height:1.7;font-style:italic;padding:12px 16px;background:#FEF9C3;border-radius:8px;border-left:3px solid #F59E0B;">"{note}"</p>
        """

    content = f"""
    {_h1(f"✋ {student_name} needs help")}
    {_p(f"<strong>{student_name}</strong> raised their hand on <strong>{assignment_title}</strong> in <strong>{classroom_name}</strong>.")}
    {note_block}
    {_button("view help queue", help_queue_url, color="#F59E0B")}
    """

    _send(
        to=teacher_email,
        subject=f"✋ {student_name} needs help — {assignment_title}",
        html=_base_template(content, preheader=f"{student_name} raised their hand on {assignment_title}"),
    )


def send_due_tomorrow_notification(
    student_email: str,
    student_name: str,
    assignment_title: str,
    classroom_name: str,
    commits_made: int,
    commits_needed: int,
    assignment_url: str,
):
    """Reminds a student that an assignment is due tomorrow."""
    first_name = student_name.split(" ")[0]
    commits_left = max(0, commits_needed - commits_made)

    progress_block = ""
    if commits_left > 0:
        progress_block = f"""
        {_divider()}
        <p style="margin:0 0 6px;font-size:13px;color:#888780;">commit progress</p>
        <p style="margin:0;font-size:14px;color:#854D0E;font-weight:600;">
          {commits_made} / {commits_needed} commits made &nbsp;—&nbsp; {commits_left} more needed before you can submit
        </p>
        """
    else:
        progress_block = f"""
        {_divider()}
        <p style="margin:0;font-size:14px;color:#166534;font-weight:600;">
          ✓ you have enough commits — just hit submit when you're ready!
        </p>
        """

    content = f"""
    {_h1(f"⏰ due tomorrow, {first_name}!")}
    {_p(f"<strong>{assignment_title}</strong> in <strong>{classroom_name}</strong> is due tomorrow. Don't forget to submit!")}
    {progress_block}
    {_button("open assignment", assignment_url)}
    """

    _send(
        to=student_email,
        subject=f"⏰ due tomorrow: {assignment_title}",
        html=_base_template(content, preheader=f"{assignment_title} is due tomorrow — don't forget to submit!"),
    )


def send_student_joined_notification(
    teacher_email: str,
    teacher_name: str,
    student_name: str,
    student_email: str,
    classroom_name: str,
    classroom_url: str,
):
    """Notifies a teacher that a student has joined their classroom."""
    first_name = teacher_name.split(" ")[0]

    content = f"""
    {_h1(f"new student joined!")}
    {_p(f"<strong>{student_name}</strong> ({student_email}) just joined <strong>{classroom_name}</strong> using the join code.")}
    {_button("view classroom", classroom_url)}
    """

    _send(
        to=teacher_email,
        subject=f"🎒 {student_name} joined {classroom_name}",
        html=_base_template(content, preheader=f"{student_name} joined {classroom_name}"),
    )


def send_password_reset_email(
    email: str,
    display_name: Optional[str],
    reset_url: str,
):
    """Sends a branded password-reset email with a recovery link."""
    greeting = f"hi {display_name.split(' ')[0]}," if display_name else "hi there,"

    content = f"""
    {_h1("reset your password")}
    {_p(greeting)}
    {_p("we got a request to reset the password on your commit account. click the button below to choose a new one.")}
    {_button("reset password", reset_url)}
    {_divider()}
    {_p("this link expires in 1 hour. if you didn't request a reset, you can safely ignore this email — your password won't change.", muted=True)}
    """

    _send(
        to=email,
        subject="reset your commit password",
        html=_base_template(content, preheader="reset the password on your commit account"),
    )


def send_new_assignment_notification(
    student_email: str,
    student_name: str,
    assignment_title: str,
    classroom_name: str,
    due_date: Optional[str],
    assignment_url: str,
):
    """Notifies a student that a new assignment has been created."""
    first_name = student_name.split(" ")[0]

    due_block = ""
    if due_date:
        from datetime import datetime
        try:
            due = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
            formatted = due.strftime("%B %d at %I:%M %p")
            due_block = f'<p style="margin:0 0 16px;font-size:13px;color:#888780;">due: <strong style="color:#0E2D6E;">{formatted}</strong></p>'
        except Exception:
            pass

    content = f"""
    {_h1(f"new assignment, {first_name}!")}
    {_p(f"Your teacher posted a new assignment in <strong>{classroom_name}</strong>:")}
    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0E2D6E;">{assignment_title}</p>
    {due_block}
    {_button("start assignment", assignment_url)}
    """

    _send(
        to=student_email,
        subject=f"📋 new assignment: {assignment_title}",
        html=_base_template(content, preheader=f"New assignment in {classroom_name}: {assignment_title}"),
    )