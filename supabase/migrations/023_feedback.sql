-- ============================================================
-- COMMIT PLATFORM — 023 Feedback Inbox
-- ============================================================
-- Stores submissions from the floating feedback button. Accepts
-- anonymous submissions (no profile id) so logged-out visitors on
-- the marketing pages can also report bugs without bouncing
-- through auth.
-- ============================================================

create table if not exists feedback (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('bug', 'feature', 'general')),
  page         text not null default '',
  message      text not null,
  email        text,
  profile_id   uuid references profiles(id) on delete set null,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists feedback_kind_created_at_idx
  on feedback(kind, created_at desc);
