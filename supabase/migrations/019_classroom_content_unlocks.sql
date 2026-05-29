-- ============================================================
-- COMMIT PLATFORM — 019 Per-Classroom Project & Assignment Unlocks
-- ============================================================
-- Teachers can now hide/show whole units (or individual lessons,
-- projects, and curriculum assignments) for their classroom. Lessons
-- already had per-classroom unlocks via classroom_lesson_unlocks; this
-- migration adds the same model for projects and curriculum
-- assignments, then backfills every existing classroom so they keep
-- seeing whatever they currently see (i.e. all published items).
-- ============================================================

create table if not exists classroom_project_unlocks (
  id            uuid primary key default gen_random_uuid(),
  classroom_id  uuid not null references classrooms(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  unlocked_by   uuid references profiles(id) on delete set null,
  unlocked_at   timestamptz not null default now(),
  unique (classroom_id, project_id)
);

create index if not exists classroom_project_unlocks_lookup_idx
  on classroom_project_unlocks(classroom_id);

create table if not exists classroom_curric_assignment_unlocks (
  id                        uuid primary key default gen_random_uuid(),
  classroom_id              uuid not null references classrooms(id) on delete cascade,
  curriculum_assignment_id  uuid not null references curriculum_assignments(id) on delete cascade,
  unlocked_by               uuid references profiles(id) on delete set null,
  unlocked_at               timestamptz not null default now(),
  unique (classroom_id, curriculum_assignment_id)
);

create index if not exists classroom_curric_assignment_unlocks_lookup_idx
  on classroom_curric_assignment_unlocks(classroom_id);

-- ── Backfill ─────────────────────────────────────────────────
-- Every existing classroom gets an unlock row for every currently
-- published project / curriculum assignment, so the new visibility
-- filter is a no-op for existing classrooms. Newly created
-- classrooms start empty and the teacher chooses what to assign.
insert into classroom_project_unlocks (classroom_id, project_id)
select c.id, p.id
  from classrooms c
  cross join projects p
  where p.is_published = true
on conflict do nothing;

insert into classroom_curric_assignment_unlocks (classroom_id, curriculum_assignment_id)
select c.id, a.id
  from classrooms c
  cross join curriculum_assignments a
  where a.is_published = true
on conflict do nothing;

-- Also backfill classroom_lesson_unlocks so the existing model is
-- consistent — currently it's opt-in only, but teachers using the new
-- "assign unit" button will expect parity with the other two.
insert into classroom_lesson_unlocks (classroom_id, lesson_id, unlocked_by)
select c.id, l.id, c.teacher_id
  from classrooms c
  cross join lessons l
  where l.is_published = true
on conflict do nothing;
