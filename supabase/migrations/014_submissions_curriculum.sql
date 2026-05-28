-- ============================================================
-- COMMIT PLATFORM — 014 Submissions support curriculum assignments
-- ============================================================
-- The submissions table previously hardcoded assignment_id (FK to the
-- classroom-scoped assignments table). To give curriculum coding
-- assignments the same baby-git commit + submit flow, we make
-- submissions polymorphic: a submission belongs to EITHER a classroom
-- assignment OR a curriculum assignment, not both.
--
-- Existing rows keep their assignment_id; new curriculum coding
-- submissions get curriculum_assignment_id instead.
-- ============================================================

-- Make the existing assignment_id nullable so we can omit it.
alter table submissions
  alter column assignment_id drop not null;

-- Add the curriculum link.
alter table submissions
  add column if not exists curriculum_assignment_id uuid
  references curriculum_assignments(id) on delete cascade;

-- Exactly one of the two must be set per row.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'submissions_target_check'
  ) then
    alter table submissions
      add constraint submissions_target_check
      check (
        (assignment_id is not null and curriculum_assignment_id is null)
        or
        (assignment_id is null and curriculum_assignment_id is not null)
      );
  end if;
end $$;

create index if not exists submissions_curriculum_assignment_idx
  on submissions(curriculum_assignment_id, student_id)
  where curriculum_assignment_id is not null;
