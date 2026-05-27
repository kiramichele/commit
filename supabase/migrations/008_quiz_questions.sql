-- ============================================================
-- COMMIT PLATFORM — 008 Quiz Questions
-- ============================================================
-- Per-question rows for quiz-type curriculum assignments.
-- Authors upload a CSV via the admin curriculum editor when
-- a curriculum_assignment has assignment_type='quiz'.
--
-- CSV columns (and matching DB fields):
--   question_type    -> question_type ('multiple_choice' | 'constructed_response')
--   question         -> question_text
--   code             -> code_block          (optional)
--   a                -> choice_a            (multiple_choice only)
--   b                -> choice_b            (multiple_choice only)
--   c                -> choice_c            (multiple_choice only)
--   d                -> choice_d            (multiple_choice only)
--   correct_answer   -> correct_answer      ('a' | 'b' | 'c' | 'd', nullable for constructed)
-- ============================================================

create table if not exists quiz_questions (
  id                        uuid primary key default gen_random_uuid(),
  curriculum_assignment_id  uuid not null references curriculum_assignments(id) on delete cascade,
  order_index               int  not null,
  question_type             text not null
                            check (question_type in ('multiple_choice', 'constructed_response')),
  question_text             text not null,
  code_block                text,
  choice_a                  text,
  choice_b                  text,
  choice_c                  text,
  choice_d                  text,
  correct_answer            text check (correct_answer is null or correct_answer in ('a', 'b', 'c', 'd')),
  created_at                timestamptz not null default now()
);

create index if not exists quiz_questions_assignment_idx
  on quiz_questions(curriculum_assignment_id, order_index);
