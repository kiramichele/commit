-- ============================================================
-- COMMIT PLATFORM — 021 Collaboration Groups
-- ============================================================
-- Phase 1 of the live-collaboration feature: data model + settings
-- only. Live editing / cursor / mouse sync is a future migration.
--
-- A "group" ties N students together for one assignment. Polymorphic
-- over the two assignment tables via an XOR check, mirroring how
-- submissions and discussions are wired.
--
-- Settings hierarchy:
--   per-assignment column (nullable) → classroom default → hardcoded
-- The frontend resolves the effective value top-down so teachers can
-- override per assignment but don't have to.
-- ============================================================

-- ── Classroom-level collab defaults ──────────────────────────
alter table classrooms
  add column if not exists collab_default_group_size    integer not null default 2,
  add column if not exists collab_default_strategy      text    not null default 'random',
  add column if not exists collab_allow_student_choice  bool    not null default true,
  add column if not exists collab_allow_solo            bool    not null default false;

alter table classrooms
  drop constraint if exists classrooms_collab_default_strategy_check;
alter table classrooms
  add constraint classrooms_collab_default_strategy_check
  check (collab_default_strategy in ('random', 'similar_grade', 'opposite_grade', 'manual', 'student_choice'));

alter table classrooms
  drop constraint if exists classrooms_collab_default_group_size_check;
alter table classrooms
  add constraint classrooms_collab_default_group_size_check
  check (collab_default_group_size between 1 and 6);

-- ── Per-assignment overrides (classroom assignments) ─────────
alter table assignments
  add column if not exists collab_enabled            bool default false,
  add column if not exists collab_group_size         integer,
  add column if not exists collab_strategy           text,
  add column if not exists collab_allow_student_choice  bool,
  add column if not exists collab_allow_solo            bool;

alter table assignments
  drop constraint if exists assignments_collab_strategy_check;
alter table assignments
  add constraint assignments_collab_strategy_check
  check (collab_strategy is null
         or collab_strategy in ('random', 'similar_grade', 'opposite_grade', 'manual', 'student_choice'));

alter table assignments
  drop constraint if exists assignments_collab_group_size_check;
alter table assignments
  add constraint assignments_collab_group_size_check
  check (collab_group_size is null or collab_group_size between 1 and 6);

-- ── Per-assignment overrides (curriculum assignments) ────────
alter table curriculum_assignments
  add column if not exists collab_enabled            bool default false,
  add column if not exists collab_group_size         integer,
  add column if not exists collab_strategy           text,
  add column if not exists collab_allow_student_choice  bool,
  add column if not exists collab_allow_solo            bool;

alter table curriculum_assignments
  drop constraint if exists curriculum_assignments_collab_strategy_check;
alter table curriculum_assignments
  add constraint curriculum_assignments_collab_strategy_check
  check (collab_strategy is null
         or collab_strategy in ('random', 'similar_grade', 'opposite_grade', 'manual', 'student_choice'));

alter table curriculum_assignments
  drop constraint if exists curriculum_assignments_collab_group_size_check;
alter table curriculum_assignments
  add constraint curriculum_assignments_collab_group_size_check
  check (collab_group_size is null or collab_group_size between 1 and 6);

-- ── Groups ──────────────────────────────────────────────────
create table if not exists assignment_groups (
  id                        uuid primary key default gen_random_uuid(),
  classroom_id              uuid not null references classrooms(id) on delete cascade,
  assignment_id             uuid references assignments(id) on delete cascade,
  curriculum_assignment_id  uuid references curriculum_assignments(id) on delete cascade,
  name                      text,
  formed_by                 uuid references profiles(id) on delete set null,
  formed_at                 timestamptz not null default now(),
  constraint assignment_groups_target_check check (
    (assignment_id is not null and curriculum_assignment_id is null)
    or
    (assignment_id is null and curriculum_assignment_id is not null)
  )
);

create index if not exists assignment_groups_classroom_assignment_idx
  on assignment_groups(classroom_id, assignment_id);
create index if not exists assignment_groups_classroom_curric_idx
  on assignment_groups(classroom_id, curriculum_assignment_id);

create table if not exists assignment_group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references assignment_groups(id) on delete cascade,
  student_id  uuid not null references profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  unique (group_id, student_id)
);

create index if not exists assignment_group_members_group_idx
  on assignment_group_members(group_id);
create index if not exists assignment_group_members_student_idx
  on assignment_group_members(student_id);
