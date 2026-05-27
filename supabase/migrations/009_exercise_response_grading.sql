-- ============================================================
-- COMMIT PLATFORM — 009 Exercise Response Grading
-- ============================================================
-- Adds teacher-grading columns to exercise_responses so that
-- constructed-response quiz answers (and other submissions that
-- require human review) can carry an overall score, free-text
-- feedback, and an audit trail of who graded them when.
--
-- Per-question feedback for quizzes is stored inside the
-- response_text JSON under a `feedback` map and `grades` map.
-- ============================================================

alter table exercise_responses
  add column if not exists score numeric,
  add column if not exists teacher_feedback text,
  add column if not exists graded_at timestamptz,
  add column if not exists graded_by uuid references profiles(id);

create index if not exists exercise_responses_lesson_idx
  on exercise_responses(lesson_id);
