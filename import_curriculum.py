#!/usr/bin/env python3
# ============================================================
# COMMIT PLATFORM — Curriculum Import Script
# ============================================================
# Usage:
#   python import_curriculum.py
#   python import_curriculum.py --unit 1
#   python import_curriculum.py --dry-run
#
# Folder structure expected:
#   curriculum/
#   └── unit-01-digital-information/
#       ├── unit.json
#       └── lesson-01-what-is-data/
#           ├── lesson.html
#           ├── activity.html   (optional)
#           └── meta.json
#
# unit.json format:
#   {
#     "order": 1,
#     "title": "Digital Information",
#     "description": "How computers represent data"
#   }
#
# meta.json format:
#   {
#     "order": 1,
#     "title": "What is Data?",
#     "scaffold_level": "typed_python",
#     "estimated_minutes": 20,
#     "has_coding_exercise": false,
#     "coding_instructions": "",
#     "coding_starter_code": ""
#   }
# ============================================================

import os
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent / "backend" / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
CURRICULUM_DIR = Path(__file__).parent / "curriculum"
STORAGE_BUCKET = "lesson-content"

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def ensure_bucket():
    """Create storage bucket if it doesn't exist."""
    try:
        buckets = supabase.storage.list_buckets()
        bucket_names = [b.name for b in buckets]
        if STORAGE_BUCKET not in bucket_names:
            supabase.storage.create_bucket(STORAGE_BUCKET, options={"public": False})
            print(f"✓ Created storage bucket: {STORAGE_BUCKET}")
        else:
            print(f"✓ Storage bucket exists: {STORAGE_BUCKET}")
    except Exception as e:
        print(f"❌ Could not create bucket: {e}")
        exit(1)


def upload_file(local_path: Path, storage_path: str, dry_run: bool = False) -> str:
    """Upload a file to Supabase Storage. Returns the storage path."""
    if dry_run:
        print(f"  [DRY RUN] Would upload: {local_path} → {storage_path}")
        return storage_path

    with open(local_path, "rb") as f:
        content = f.read()

    try:
        # Try to update first, then insert if it doesn't exist
        try:
            supabase.storage.from_(STORAGE_BUCKET).update(
                storage_path, content,
                file_options={"content-type": "text/html", "upsert": "true"}
            )
        except Exception:
            supabase.storage.from_(STORAGE_BUCKET).upload(
                storage_path, content,
                file_options={"content-type": "text/html"}
            )
        print(f"  ✓ Uploaded: {storage_path}")
        return storage_path
    except Exception as e:
        print(f"  ❌ Failed to upload {storage_path}: {e}")
        return None


def get_or_create_unit(unit_data: dict, dry_run: bool = False) -> str:
    """Get existing unit or create new one. Returns unit ID."""
    existing = (
        supabase.table("units")
        .select("id")
        .eq("order_index", unit_data["order"])
        .execute()
    )
    if existing.data:
        unit_id = existing.data[0]["id"]
        print(f"  → Unit exists (id: {unit_id[:8]}...)")
        return unit_id

    if dry_run:
        print(f"  [DRY RUN] Would create unit: {unit_data['title']}")
        return "dry-run-unit-id"

    result = supabase.table("units").insert({
        "order_index": unit_data["order"],
        "title": unit_data["title"],
        "description": unit_data.get("description", ""),
        "is_published": True,
    }).execute()

    unit_id = result.data[0]["id"]
    print(f"  ✓ Created unit: {unit_data['title']} (id: {unit_id[:8]}...)")
    return unit_id


def get_or_create_lesson(unit_id: str, lesson_data: dict, dry_run: bool = False) -> str:
    """Get existing lesson or create new one. Returns lesson ID."""
    existing = (
        supabase.table("lessons")
        .select("id")
        .eq("unit_id", unit_id)
        .eq("order_index", lesson_data["order"])
        .execute()
    )
    if existing.data:
        lesson_id = existing.data[0]["id"]
        print(f"    → Lesson exists (id: {lesson_id[:8]}...)")
        return lesson_id

    if dry_run:
        print(f"    [DRY RUN] Would create lesson: {lesson_data['title']}")
        return "dry-run-lesson-id"

    result = supabase.table("lessons").insert({
        "unit_id": unit_id,
        "order_index": lesson_data["order"],
        "title": lesson_data["title"],
        "scaffold_level": lesson_data.get("scaffold_level", "typed_python"),
        "is_published": True,
        "content_json": {"blocks": []},
    }).execute()

    lesson_id = result.data[0]["id"]
    print(f"    ✓ Created lesson: {lesson_data['title']} (id: {lesson_id[:8]}...)")
    return lesson_id


def upsert_lesson_content(lesson_id: str, unit_id: str, content_data: dict, dry_run: bool = False):
    """Insert or update lesson_content row."""
    if dry_run:
        print(f"    [DRY RUN] Would upsert lesson_content for lesson {lesson_id[:8]}...")
        return

    existing = (
        supabase.table("lesson_content")
        .select("id")
        .eq("lesson_id", lesson_id)
        .execute()
    )

    if existing.data:
        supabase.table("lesson_content").update(content_data).eq("lesson_id", lesson_id).execute()
        print(f"    ✓ Updated lesson_content")
    else:
        supabase.table("lesson_content").insert({
            "lesson_id": lesson_id,
            "unit_id": unit_id,
            **content_data
        }).execute()
        print(f"    ✓ Created lesson_content")


def import_unit(unit_dir: Path, dry_run: bool = False):
    """Import a single unit directory."""
    unit_json_path = unit_dir / "unit.json"
    if not unit_json_path.exists():
        print(f"  ⚠️  Skipping {unit_dir.name} — no unit.json found")
        return

    with open(unit_json_path) as f:
        unit_data = json.load(f)

    print(f"\n📦 Unit {unit_data['order']}: {unit_data['title']}")
    unit_id = get_or_create_unit(unit_data, dry_run)

    # Find all lesson directories
    lesson_dirs = sorted([
        d for d in unit_dir.iterdir()
        if d.is_dir() and (d / "meta.json").exists()
    ])

    if not lesson_dirs:
        print(f"  ⚠️  No lesson directories found in {unit_dir.name}")
        return

    for lesson_dir in lesson_dirs:
        print(f"\n  📄 Lesson: {lesson_dir.name}")

        with open(lesson_dir / "meta.json") as f:
            meta = json.load(f)

        lesson_id = get_or_create_lesson(unit_id, meta, dry_run)

        # Build storage paths
        storage_base = f"units/unit-{unit_data['order']:02d}/{lesson_dir.name}"
        html_path = None
        activity_path = None

        # Upload lesson.html
        lesson_html = lesson_dir / "lesson.html"
        if lesson_html.exists():
            html_path = upload_file(lesson_html, f"{storage_base}/lesson.html", dry_run)
        else:
            print(f"    ⚠️  No lesson.html found")

        # Upload activity.html if present
        activity_html = lesson_dir / "activity.html"
        if activity_html.exists():
            activity_path = upload_file(activity_html, f"{storage_base}/activity.html", dry_run)

        # Upsert lesson_content
        content_data = {
            "html_file_path": html_path,
            "activity_file_path": activity_path,
            "estimated_minutes": meta.get("estimated_minutes", 20),
            "has_coding_exercise": meta.get("has_coding_exercise", False),
            "coding_instructions": meta.get("coding_instructions", ""),
            "coding_starter_code": meta.get("coding_starter_code", ""),
        }
        upsert_lesson_content(lesson_id, unit_id, content_data, dry_run)

    print(f"\n  ✅ Unit {unit_data['order']} complete")


def main():
    parser = argparse.ArgumentParser(description="Import AP CSP curriculum into Commit")
    parser.add_argument("--unit", type=int, help="Import only this unit number")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen without making changes")
    args = parser.parse_args()

    print("🚀 Commit Curriculum Importer")
    print(f"   Curriculum dir: {CURRICULUM_DIR}")
    print(f"   Dry run: {args.dry_run}")
    print()

    if not CURRICULUM_DIR.exists():
        print(f"❌ Curriculum directory not found: {CURRICULUM_DIR}")
        print("   Create a 'curriculum' folder next to this script")
        exit(1)

    if not args.dry_run:
        ensure_bucket()

    # Find unit directories
    unit_dirs = sorted([
        d for d in CURRICULUM_DIR.iterdir()
        if d.is_dir() and (d / "unit.json").exists()
    ])

    if not unit_dirs:
        print("❌ No unit directories found (each needs a unit.json)")
        exit(1)

    for unit_dir in unit_dirs:
        with open(unit_dir / "unit.json") as f:
            unit_data = json.load(f)

        if args.unit and unit_data.get("order") != args.unit:
            continue

        import_unit(unit_dir, dry_run=args.dry_run)

    print("\n✅ Import complete!")


if __name__ == "__main__":
    main()