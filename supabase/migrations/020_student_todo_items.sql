-- ============================================================
-- COMMIT PLATFORM — 020 Student To-Do Items
-- ============================================================
-- Per-student, per-classroom list of curriculum items the student
-- wants on their kanban board on /learn. Items are polymorphic by
-- `kind` so a single row can point at a lesson, a curriculum
-- assignment, a project, or a classroom assignment.
--
-- Classroom assignments are still implicitly shown on the kanban
-- (existing behavior — teachers create them deliberately). Lessons
-- and curriculum assignments only show up when the student adds
-- them, OR when the teacher flips the auto-add classroom toggle
-- introduced here.
-- ============================================================

create table if not exists student_todo_items (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references profiles(id) on delete cascade,
  classroom_id  uuid not null references classrooms(id) on delete cascade,
  kind          text not null check (kind in ('lesson', 'project', 'curriculum_assignment', 'assignment')),
  target_id     uuid not null,
  added_at      timestamptz not null default now(),
  unique (student_id, classroom_id, kind, target_id)
);

create index if not exists student_todo_items_student_classroom_idx
  on student_todo_items(student_id, classroom_id);

-- Per-classroom flag — when true, whenever the teacher unlocks
-- (assigns) content for the classroom, the backend inserts todo
-- rows for every current member. Existing items are not touched
-- when the flag is toggled; this only affects future unlocks.
alter table classrooms
  add column if not exists auto_add_assigned_to_todo bool not null default false;
