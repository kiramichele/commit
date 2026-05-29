-- ============================================================
-- COMMIT PLATFORM — 018 'contains' Comparison Mode
-- ============================================================
-- Adds 'contains' to the allowed default_comparison values for
-- curriculum_assignments. A 'contains' comparison succeeds when the
-- expected_stdout (trimmed) appears anywhere in the actual stdout —
-- useful when the prompt asks students to print specific lines
-- somewhere in their output without dictating order or surrounding
-- text.
-- ============================================================

alter table curriculum_assignments
  drop constraint if exists curriculum_assignments_default_comparison_check;
alter table curriculum_assignments
  add constraint curriculum_assignments_default_comparison_check
  check (default_comparison in ('exact', 'strip_trailing_whitespace', 'case_insensitive', 'contains'));
