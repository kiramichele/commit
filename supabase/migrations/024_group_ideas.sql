-- ============================================================
-- COMMIT PLATFORM — 024 Group Ideas
-- ============================================================
-- When students self-form their groups (student_choice strategy),
-- each group can advertise a topic / "idea" so other students can
-- pick the group whose idea sounds best to them. Any member can
-- update the idea after creation — not just the founder.
-- Empty / null is fine; the UI renders "not sure yet" for those.
-- ============================================================

alter table assignment_groups
  add column if not exists idea text;
