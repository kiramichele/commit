-- ============================================================
-- COMMIT PLATFORM — 013 Code Review
-- ============================================================
-- Adds 'code_review' as a curriculum assignment type. A code-review
-- assignment points at another curriculum assignment (the source —
-- the one whose submissions students will review), and a pairing
-- strategy decides who reviews whose code in each classroom.
-- ============================================================

-- ── Update assignment_type check to allow 'code_review' ──────
alter table curriculum_assignments
  drop constraint if exists curriculum_assignments_assignment_type_check;
alter table curriculum_assignments
  add constraint curriculum_assignments_assignment_type_check
  check (assignment_type in ('code', 'activity', 'checkin', 'quiz', 'project', 'code_review'));

-- ── Code-review-specific columns on curriculum_assignments ───
alter table curriculum_assignments
  add column if not exists source_curriculum_assignment_id uuid references curriculum_assignments(id) on delete set null,
  add column if not exists pairing_strategy text default 'random'
    check (pairing_strategy in ('random', 'similar_grade', 'opposite_grade', 'manual'));

-- ── Pairings table — one row per (reviewer, code_review_id, classroom) ──
-- Pairings are per-classroom because rosters differ. The reviewee is the
-- student whose code the reviewer will look at; both ids are profile ids.
create table if not exists code_review_pairings (
  id                        uuid primary key default gen_random_uuid(),
  code_review_assignment_id uuid not null references curriculum_assignments(id) on delete cascade,
  classroom_id              uuid not null references classrooms(id) on delete cascade,
  reviewer_id               uuid not null references profiles(id) on delete cascade,
  reviewee_id               uuid not null references profiles(id) on delete cascade,
  created_at                timestamptz not null default now(),
  unique (code_review_assignment_id, classroom_id, reviewer_id)
);

create index if not exists code_review_pairings_lookup_idx
  on code_review_pairings(code_review_assignment_id, classroom_id);
