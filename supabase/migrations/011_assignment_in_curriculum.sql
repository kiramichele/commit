-- ============================================================
-- COMMIT PLATFORM — 011 Assignments In Curriculum
-- ============================================================
-- Lets a teacher attach their own classroom assignment to a
-- curriculum unit at a specific position so it appears in the
-- merged curriculum tab of THEIR classroom only.
--
-- When unit_id is null, the assignment behaves like before — it
-- shows up only in the classic 'assignments' tab. When unit_id
-- is set, the assignment is also rendered in the curriculum tab
-- under that unit, sorted by curriculum_order.
-- ============================================================

alter table assignments
  add column if not exists curriculum_unit_id uuid references units(id) on delete set null,
  add column if not exists curriculum_order int;

create index if not exists assignments_curriculum_idx
  on assignments(curriculum_unit_id, curriculum_order)
  where curriculum_unit_id is not null;
