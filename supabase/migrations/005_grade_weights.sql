-- ============================================================
-- COMMIT PLATFORM — 005 Grade Weights
-- ============================================================
-- Adds a per-classroom grade weighting config so teachers can
-- decide how much each assignment type counts toward the final
-- grade. Also expands the allowed assignment_type values to
-- match: code, activity, checkin, quiz, project.
-- ============================================================

-- ── PER-CLASSROOM WEIGHTS ────────────────────────────────────
-- JSONB with keys: code, activity, checkin, quiz, project.
-- Each value is a percentage 0-100 (UI is responsible for
-- showing/enforcing that they sum to 100).
alter table classrooms
  add column if not exists grade_weights jsonb
  default '{"code": 35, "project": 35, "quiz": 15, "activity": 10, "checkin": 5}'::jsonb;

-- Backfill any rows that already exist with NULL.
update classrooms
set grade_weights = '{"code": 35, "project": 35, "quiz": 15, "activity": 10, "checkin": 5}'::jsonb
where grade_weights is null;

-- ── EXPAND ASSIGNMENT TYPES ──────────────────────────────────
-- Drop any old check constraint that might restrict assignment_type,
-- then add the canonical one allowing the 5 supported types.
alter table assignments drop constraint if exists assignments_assignment_type_check;
alter table assignments
  add constraint assignments_assignment_type_check
  check (assignment_type in ('code', 'activity', 'checkin', 'quiz', 'project'));
