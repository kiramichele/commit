-- ============================================================
-- COMMIT PLATFORM — 010 Check-in Format
-- ============================================================
-- Check-ins now support multiple response formats: short text,
-- 1-5 rating, code snippet, or a rich HTML prompt with a text
-- response below. The format is stored on the curriculum_assignment
-- and only meaningful when assignment_type = 'checkin'.
-- ============================================================

alter table curriculum_assignments
  add column if not exists checkin_format text
  check (checkin_format is null or checkin_format in ('html', 'short_answer', 'rating', 'coding'));

-- Backfill any existing check-ins to short_answer (current behavior).
update curriculum_assignments
set checkin_format = 'short_answer'
where assignment_type = 'checkin' and checkin_format is null;
