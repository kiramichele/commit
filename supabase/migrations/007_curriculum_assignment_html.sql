-- ============================================================
-- COMMIT PLATFORM — 007 Curriculum Assignment HTML
-- ============================================================
-- Adds html_file_path to curriculum_assignments so activity-type
-- assignments can store a reading body in Supabase Storage. The
-- body is rendered like a lesson and the activity uses the
-- Commit SDK to submit responses from embedded form inputs.
-- ============================================================

alter table curriculum_assignments
  add column if not exists html_file_path text;
