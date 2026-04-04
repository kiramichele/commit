#!/usr/bin/env python3
# ============================================================
# COMMIT PLATFORM — Curriculum Importer
# commit/import_curriculum.py
# ============================================================
# Supports three folder types inside each unit:
#
#   lesson-XX-name/
#     lesson.html     ← main lesson content
#     meta.json       ← { order, title, scaffold_level, estimated_minutes,
#                         exercises: [...] }
#
#   activity-XX-name/
#     activity.html   ← full-page interactive activity (renders in activity viewer)
#     meta.json       ← { order, title, estimated_minutes }
#
#   exercise-XX-name/
#     exercise.html   ← standalone exercise page (renders in lesson viewer practice tab)
#     meta.json       ← { order, title, estimated_minutes, exercises: [...] }
#
# Run:
#   python import_curriculum.py              → import all units
#   python import_curriculum.py --dry-run    → preview without changes
#   python import_curriculum.py --unit 1     → import unit 1 only
#   python import_curriculum.py --force      → re-upload all files even if unchanged
# ============================================================

import os
import sys
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=Path(__file__).parent / "backend" / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = "lesson-content"
CURRICULUM_DIR = Path(__file__).parent / "curriculum"

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# ── HELPERS ───────────────────────────────────────────────────

def log(msg, indent=0):
    print("  " * indent + msg)


def upload_file(local_path: Path, storage_path: str, dry_run: bool) -> bool:
    """Uploads a file to Supabase Storage. Returns True on success."""
    if dry_run:
        log(f"[dry-run] would upload: {storage_path}", 2)
        return True
    try:
        with open(local_path, "rb") as f:
            content = f.read()
        supabase.storage.from_(BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": "text/html", "upsert": "true"},
        )
        log(f"✓ Uploaded: {storage_path}", 2)
        return True
    except Exception as e:
        log(f"✗ Upload failed: {storage_path} — {e}", 2)
        return False


def get_or_create_unit(unit_dir: Path, dry_run: bool) -> str | None:
    """Gets or creates a unit record. Returns unit id."""
    unit_json_path = unit_dir / "unit.json"
    if not unit_json_path.exists():
        log(f"⚠ No unit.json found in {unit_dir.name} — skipping", 1)
        return None

    with open(unit_json_path) as f:
        unit_data = json.load(f)

    order = unit_data.get("order", 99)
    title = unit_data.get("title", unit_dir.name)
    description = unit_data.get("description", "")

    log(f"Unit {order}: {title}")

    if dry_run:
        return "dry-run-unit-id"

    # Upsert unit by order_index
    existing = supabase.table("units").select("id").eq("order_index", order).execute()
    if existing.data:
        unit_id = existing.data[0]["id"]
        supabase.table("units").update({
            "title": title,
            "description": description,
            "is_published": True,
        }).eq("id", unit_id).execute()
    else:
        result = supabase.table("units").insert({
            "order_index": order,
            "title": title,
            "description": description,
            "is_published": True,
        }).execute()
        unit_id = result.data[0]["id"]

    return unit_id


def import_lesson(lesson_dir: Path, unit_id: str, dry_run: bool):
    """Imports a lesson-XX folder."""
    meta_path = lesson_dir / "meta.json"
    html_path = lesson_dir / "lesson.html"
    activity_path = lesson_dir / "activity.html"

    if not meta_path.exists():
        log(f"⚠ No meta.json in {lesson_dir.name} — skipping", 2)
        return

    with open(meta_path) as f:
        meta = json.load(f)

    order = meta.get("order", 99)
    title = meta.get("title", lesson_dir.name)
    scaffold_level = meta.get("scaffold_level", "typed_python")
    estimated_minutes = meta.get("estimated_minutes", 20)
    exercises = meta.get("exercises", [])
    standards = meta.get("standards", [])

    # Infer has_coding_exercise from exercises array or legacy field
    has_coding = (
        meta.get("has_coding_exercise", False)
        or any(e.get("type") == "coding" for e in exercises)
    )
    coding_instructions = meta.get("coding_instructions", "")
    coding_starter_code = meta.get("coding_starter_code", "")
    example_code = meta.get("example_code", "")
    example_explanation = meta.get("example_explanation", "")

    log(f"  Lesson {order}: {title}", 1)

    if dry_run:
        if html_path.exists(): log(f"[dry-run] would upload lesson.html", 2)
        if activity_path.exists(): log(f"[dry-run] would upload activity.html", 2)
        return

    # Upsert lesson
    existing = supabase.table("lessons").select("id").eq("unit_id", unit_id).eq("order_index", order).execute()
    if existing.data:
        lesson_id = existing.data[0]["id"]
        supabase.table("lessons").update({
            "title": title,
            "scaffold_level": scaffold_level,
            "standards_tags": standards if standards else None,
            "is_published": True,
        }).eq("id", lesson_id).execute()
    else:
        result = supabase.table("lessons").insert({
            "unit_id": unit_id,
            "order_index": order,
            "title": title,
            "scaffold_level": scaffold_level,
            "standards_tags": standards if standards else None,
            "is_published": True,
        }).execute()
        lesson_id = result.data[0]["id"]

    # Upload HTML files
    html_storage_path = None
    activity_storage_path = None

    if html_path.exists():
        storage_path = f"units/{unit_id}/lessons/{lesson_id}/lesson.html"
        if upload_file(html_path, storage_path, dry_run):
            html_storage_path = storage_path

    if activity_path.exists():
        storage_path = f"units/{unit_id}/lessons/{lesson_id}/activity.html"
        if upload_file(activity_path, storage_path, dry_run):
            activity_storage_path = storage_path

    # Upsert lesson_content
    existing_content = supabase.table("lesson_content").select("id").eq("lesson_id", lesson_id).execute()
    content_data = {
        "lesson_id": lesson_id,
        "html_file_path": html_storage_path,
        "activity_file_path": activity_storage_path,
        "estimated_minutes": estimated_minutes,
        "has_coding_exercise": has_coding,
        "coding_instructions": coding_instructions,
        "coding_starter_code": coding_starter_code,
        "example_code": example_code,
        "example_explanation": example_explanation,
        "exercises": exercises if exercises else None,
    }

    if existing_content.data:
        supabase.table("lesson_content").update(content_data).eq("lesson_id", lesson_id).execute()
    else:
        supabase.table("lesson_content").insert(content_data).execute()

    log(f"✓ Lesson imported: {title}", 2)


def import_activity(activity_dir: Path, unit_id: str, dry_run: bool):
    """
    Imports an activity-XX folder as a standalone lesson
    with assignment_type='activity'. The activity.html renders
    full-screen in the activity viewer.
    """
    meta_path = activity_dir / "meta.json"
    html_path = activity_dir / "activity.html"

    # Also accept lesson.html if activity.html doesn't exist
    if not html_path.exists():
        html_path = activity_dir / "lesson.html"

    if not meta_path.exists():
        log(f"⚠ No meta.json in {activity_dir.name} — skipping", 2)
        return

    with open(meta_path) as f:
        meta = json.load(f)

    order = meta.get("order", 99)
    title = meta.get("title", activity_dir.name)
    estimated_minutes = meta.get("estimated_minutes", 20)
    standards = meta.get("standards", [])

    log(f"  Activity {order}: {title}", 1)

    if not html_path.exists():
        log(f"⚠ No activity.html or lesson.html in {activity_dir.name} — skipping", 2)
        return

    if dry_run:
        log(f"[dry-run] would upload activity.html for: {title}", 2)
        return

    existing = supabase.table("lessons").select("id").eq("unit_id", unit_id).eq("order_index", order).execute()
    if existing.data:
        lesson_id = existing.data[0]["id"]
        supabase.table("lessons").update({
            "title": title,
            "scaffold_level": "typed_python",
            "standards_tags": standards if standards else None,
            "is_published": True,
        }).eq("id", lesson_id).execute()
    else:
        result = supabase.table("lessons").insert({
            "unit_id": unit_id,
            "order_index": order,
            "title": title,
            "scaffold_level": "typed_python",
            "standards_tags": standards if standards else None,
            "is_published": True,
        }).execute()
        lesson_id = result.data[0]["id"]

    # Upload the HTML as activity_file_path (not html_file_path)
    storage_path = f"units/{unit_id}/lessons/{lesson_id}/activity.html"
    upload_file(html_path, storage_path, dry_run)

    # Upsert lesson_content — activity_file_path set, html_file_path null
    existing_content = supabase.table("lesson_content").select("id").eq("lesson_id", lesson_id).execute()
    content_data = {
        "lesson_id": lesson_id,
        "html_file_path": None,
        "activity_file_path": storage_path,
        "estimated_minutes": estimated_minutes,
        "has_coding_exercise": False,
    }

    if existing_content.data:
        supabase.table("lesson_content").update(content_data).eq("lesson_id", lesson_id).execute()
    else:
        supabase.table("lesson_content").insert(content_data).execute()

    log(f"✓ Activity imported: {title}", 2)


def import_exercise(exercise_dir: Path, unit_id: str, dry_run: bool):
    """
    Imports an exercise-XX folder as a lesson
    with exercises defined in meta.json.
    The exercise.html (or lesson.html) renders in the practice tab.
    """
    meta_path = exercise_dir / "meta.json"
    html_path = exercise_dir / "exercise.html"

    # Accept lesson.html as fallback
    if not html_path.exists():
        html_path = exercise_dir / "lesson.html"

    if not meta_path.exists():
        log(f"⚠ No meta.json in {exercise_dir.name} — skipping", 2)
        return

    with open(meta_path) as f:
        meta = json.load(f)

    order = meta.get("order", 99)
    title = meta.get("title", exercise_dir.name)
    estimated_minutes = meta.get("estimated_minutes", 20)
    exercises = meta.get("exercises", [])
    scaffold_level = meta.get("scaffold_level", "typed_python")
    standards = meta.get("standards", [])

    has_coding = any(e.get("type") == "coding" for e in exercises)

    log(f"  Exercise {order}: {title} ({len(exercises)} exercise(s))", 1)

    if dry_run:
        log(f"[dry-run] would import exercise: {title}", 2)
        return

    existing = supabase.table("lessons").select("id").eq("unit_id", unit_id).eq("order_index", order).execute()
    if existing.data:
        lesson_id = existing.data[0]["id"]
        supabase.table("lessons").update({
            "title": title,
            "scaffold_level": scaffold_level,
            "standards_tags": standards if standards else None,
            "is_published": True,
        }).eq("id", lesson_id).execute()
    else:
        result = supabase.table("lessons").insert({
            "unit_id": unit_id,
            "order_index": order,
            "title": title,
            "scaffold_level": scaffold_level,
            "standards_tags": standards if standards else None,
            "is_published": True,
        }).execute()
        lesson_id = result.data[0]["id"]

    # Upload HTML if it exists (optional for exercise folders)
    html_storage_path = None
    if html_path.exists():
        storage_path = f"units/{unit_id}/lessons/{lesson_id}/lesson.html"
        if upload_file(html_path, storage_path, dry_run):
            html_storage_path = storage_path

    # Upsert lesson_content with exercises array
    existing_content = supabase.table("lesson_content").select("id").eq("lesson_id", lesson_id).execute()
    content_data = {
        "lesson_id": lesson_id,
        "html_file_path": html_storage_path,
        "activity_file_path": None,
        "estimated_minutes": estimated_minutes,
        "has_coding_exercise": has_coding,
        "exercises": exercises if exercises else None,
    }

    if existing_content.data:
        supabase.table("lesson_content").update(content_data).eq("lesson_id", lesson_id).execute()
    else:
        supabase.table("lesson_content").insert(content_data).execute()

    log(f"✓ Exercise imported: {title}", 2)


def import_unit(unit_dir: Path, dry_run: bool):
    """Imports a full unit directory."""
    unit_id = get_or_create_unit(unit_dir, dry_run)
    if not unit_id:
        return

    # Collect all lesson/activity/exercise folders, sort by order in meta.json
    subfolders = []
    for item in unit_dir.iterdir():
        if not item.is_dir():
            continue
        name = item.name.lower()
        if name.startswith("lesson-"):
            folder_type = "lesson"
        elif name.startswith("activity-") or name.startswith("algorithm-"):
            folder_type = "activity"
        elif name.startswith("exercise-"):
            folder_type = "exercise"
        else:
            continue

        meta_path = item / "meta.json"
        order = 99
        if meta_path.exists():
            try:
                with open(meta_path) as f:
                    order = json.load(f).get("order", 99)
            except Exception:
                pass

        subfolders.append((order, folder_type, item))

    # Sort by order number
    subfolders.sort(key=lambda x: x[0])

    for order, folder_type, folder in subfolders:
        if folder_type == "lesson":
            import_lesson(folder, unit_id, dry_run)
        elif folder_type == "activity":
            import_activity(folder, unit_id, dry_run)
        elif folder_type == "exercise":
            import_exercise(folder, unit_id, dry_run)


def main():
    parser = argparse.ArgumentParser(description="Commit curriculum importer")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    parser.add_argument("--unit", type=int, help="Import only this unit number")
    parser.add_argument("--force", action="store_true", help="Re-upload all files even if unchanged")
    args = parser.parse_args()

    if args.dry_run:
        print("🔍 DRY RUN — no changes will be made\n")

    if not CURRICULUM_DIR.exists():
        print(f"✗ curriculum/ directory not found at {CURRICULUM_DIR}")
        sys.exit(1)

    # Find unit directories
    unit_dirs = sorted([
        d for d in CURRICULUM_DIR.iterdir()
        if d.is_dir() and d.name.startswith("unit-")
    ], key=lambda d: d.name)

    if not unit_dirs:
        print("✗ No unit directories found. Expected folders named unit-01-name/")
        sys.exit(1)

    for unit_dir in unit_dirs:
        # Filter by --unit flag if provided
        if args.unit:
            try:
                unit_num = int(unit_dir.name.split("-")[1])
                if unit_num != args.unit:
                    continue
            except (IndexError, ValueError):
                continue

        import_unit(unit_dir, args.dry_run)
        print()

    print("✅ Import complete!")


if __name__ == "__main__":
    main()