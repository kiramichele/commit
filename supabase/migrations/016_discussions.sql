-- ============================================================
-- COMMIT PLATFORM — 016 Discussion Boards
-- ============================================================
-- Adds 'discussion' as both a classroom-scoped assignment type and a
-- curriculum-level assignment type. Students post threads, comment on
-- others, and upvote (no downvotes). Completion is auto-computed:
-- when a student crosses both `discussion_min_posts` and
-- `discussion_min_comments` thresholds, a submission is created and
-- auto-graded 100.
--
-- The author-name visible in the board is governed by a classroom
-- setting (`discussion_name_display`) — first name only, first +
-- last initial, or full display name. Computed in the frontend from
-- profiles.display_name (split on whitespace).
-- ============================================================

-- ── Allow 'discussion' on both assignment tables ─────────────
alter table assignments
  drop constraint if exists assignments_assignment_type_check;
alter table assignments
  add constraint assignments_assignment_type_check
  check (assignment_type in ('code', 'activity', 'checkin', 'quiz', 'project', 'discussion'));

alter table curriculum_assignments
  drop constraint if exists curriculum_assignments_assignment_type_check;
alter table curriculum_assignments
  add constraint curriculum_assignments_assignment_type_check
  check (assignment_type in ('code', 'activity', 'checkin', 'quiz', 'project', 'code_review', 'discussion'));

-- ── Discussion settings columns on both assignment tables ────
alter table assignments
  add column if not exists discussion_min_posts    integer default 1,
  add column if not exists discussion_min_comments integer default 2;

alter table curriculum_assignments
  add column if not exists discussion_min_posts    integer default 1,
  add column if not exists discussion_min_comments integer default 2;

-- ── Per-classroom name display setting ───────────────────────
alter table classrooms
  add column if not exists discussion_name_display text default 'first_name';

update classrooms
  set discussion_name_display = 'first_name'
  where discussion_name_display is null;

alter table classrooms
  drop constraint if exists classrooms_discussion_name_display_check;
alter table classrooms
  add constraint classrooms_discussion_name_display_check
  check (discussion_name_display in ('first_name', 'first_last_initial', 'full_name'));

-- ── Add 'discussion' bucket to grade weights default ─────────
-- Backfill existing classrooms so their weights JSONB contains a
-- discussion key (starts at 0 so it doesn't disrupt existing totals).
update classrooms
  set grade_weights = grade_weights || '{"discussion": 0}'::jsonb
  where grade_weights is not null
    and not (grade_weights ? 'discussion');

-- ── discussion_posts: one row per top-level thread ───────────
-- Polymorphic: belongs to EITHER a classroom assignment or a
-- curriculum assignment. classroom_id is always set so we can scope
-- posts to a classroom even when the assignment is curriculum-level.
create table if not exists discussion_posts (
  id                        uuid primary key default gen_random_uuid(),
  assignment_id             uuid references assignments(id) on delete cascade,
  curriculum_assignment_id  uuid references curriculum_assignments(id) on delete cascade,
  classroom_id              uuid not null references classrooms(id) on delete cascade,
  author_id                 uuid not null references profiles(id) on delete cascade,
  body                      text not null,
  created_at                timestamptz not null default now(),
  constraint discussion_posts_target_check check (
    (assignment_id is not null and curriculum_assignment_id is null)
    or
    (assignment_id is null and curriculum_assignment_id is not null)
  )
);

create index if not exists discussion_posts_classroom_assignment_idx
  on discussion_posts(classroom_id, assignment_id);
create index if not exists discussion_posts_classroom_curric_idx
  on discussion_posts(classroom_id, curriculum_assignment_id);
create index if not exists discussion_posts_author_idx
  on discussion_posts(author_id);

-- ── discussion_comments: replies to a post ───────────────────
create table if not exists discussion_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references discussion_posts(id) on delete cascade,
  author_id   uuid not null references profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists discussion_comments_post_idx
  on discussion_comments(post_id, created_at);
create index if not exists discussion_comments_author_idx
  on discussion_comments(author_id);

-- ── discussion_upvotes: one row per (user, post). No downvotes. ─
create table if not exists discussion_upvotes (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references discussion_posts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists discussion_upvotes_post_idx
  on discussion_upvotes(post_id);
