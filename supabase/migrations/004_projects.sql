-- ============================================================
-- COMMIT PLATFORM — 004 Projects
-- ============================================================
-- Projects are admin-authored curriculum entities that sit
-- under a unit (peer of lessons). Each project contains an
-- ordered list of steps, each of which can be a coding task,
-- a reading explainer, or a free-response prompt.
-- ============================================================

-- ── PROJECTS ─────────────────────────────────────────────────
create table if not exists projects (
  id                  uuid primary key default gen_random_uuid(),
  unit_id             uuid not null references units(id) on delete cascade,
  order_index         int  not null,
  title               text not null,
  description         text default '',
  estimated_minutes   int  default 60,
  scaffold_level      text default 'typed_python',
  standards_tags      text[],
  is_published        bool not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists projects_unit_id_idx on projects(unit_id, order_index);

-- ── PROJECT STEPS ────────────────────────────────────────────
create table if not exists project_steps (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  order_index         int  not null,
  title               text not null,
  step_type           text not null check (step_type in ('coding', 'reading', 'free_response')),

  -- shared
  instructions        text default '',

  -- coding fields
  starter_code        text default '',
  example_code        text default '',
  example_explanation text default '',

  -- reading fields (HTML body lives in Supabase Storage, path stored here)
  html_file_path      text,

  -- free_response fields
  prompt              text default '',
  min_words           int default 0,
  max_words           int default 0,

  is_published        bool not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists project_steps_project_id_idx on project_steps(project_id, order_index);

-- ── PROJECT STEP COMPLETIONS ─────────────────────────────────
-- Parallel to lesson_completions — tracks per-student progress.
create table if not exists project_step_completions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references profiles(id) on delete cascade,
  step_id       uuid not null references project_steps(id) on delete cascade,
  response_text text,
  code_snapshot text,
  completed_at  timestamptz not null default now(),
  unique (student_id, step_id)
);

create index if not exists project_step_completions_student_idx on project_step_completions(student_id);
create index if not exists project_step_completions_step_idx    on project_step_completions(step_id);
