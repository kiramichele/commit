-- ============================================================
-- COMMIT PLATFORM — 017 Test Cases for Curriculum Coding Assignments
-- ============================================================
-- Stores Judge0-runnable test cases on the existing
-- curriculum_assignments row (no new table — matches how hints
-- are stored as bare columns). Per-case `comparison` overrides
-- the assignment's `default_comparison`. Schema for each entry
-- in test_cases:
--   { id, description, stdin, expected_stdout, weight, hidden, comparison? }
--
-- Per-classroom toggle decides whether passing test cases auto-
-- set the submission's grade on submit. Default off; teachers
-- opt in.
-- ============================================================

alter table curriculum_assignments
  add column if not exists test_cases jsonb,
  add column if not exists default_comparison text default 'strip_trailing_whitespace';

alter table curriculum_assignments
  drop constraint if exists curriculum_assignments_default_comparison_check;
alter table curriculum_assignments
  add constraint curriculum_assignments_default_comparison_check
  check (default_comparison in ('exact', 'strip_trailing_whitespace', 'case_insensitive'));

alter table classrooms
  add column if not exists auto_grade_test_cases bool not null default false;
