-- ============================================================
-- COMMIT PLATFORM — 006 Curriculum Assignments
-- ============================================================
-- Admin-authored assignment templates that sit under a unit
-- (peer of lessons and projects). Mirrors the assignments
-- table but is curriculum-scoped (no classroom_id).
--
-- Phase 2 will add a per-classroom override / hide table so
-- teachers can edit or delete these in their own classroom
-- without affecting other classrooms.
-- ============================================================

create table if not exists curriculum_assignments (
  id                  uuid primary key default gen_random_uuid(),
  unit_id             uuid not null references units(id) on delete cascade,
  order_index         int  not null,
  title               text not null,
  instructions        text default '',
  starter_code        text default '',
  assignment_type     text not null default 'code'
                      check (assignment_type in ('code', 'activity', 'checkin', 'quiz', 'project')),
  min_commits         int  not null default 1,
  scaffold_level      text not null default 'typed_python',
  allow_collab        bool not null default false,
  standards_tags      text[],
  hints_enabled       bool not null default true,
  hint_1              text,
  hint_2              text,
  is_published        bool not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists curriculum_assignments_unit_id_idx
  on curriculum_assignments(unit_id, order_index);
