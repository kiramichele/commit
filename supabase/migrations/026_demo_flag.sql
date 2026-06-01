-- ============================================================
-- COMMIT PLATFORM — 026 Demo Sessions
-- ============================================================
-- The "try a live demo" button on the marketing pages spins up a
-- fresh classroom + fake roster + assigned unit per visitor so they
-- can poke around without affecting real classrooms. Both the
-- classroom and every profile we create (teacher + fake students)
-- are stamped with is_demo=true so:
--
--   - A scheduled cleanup can purge sessions older than N days.
--   - The frontend can render a "demo mode" banner.
--   - Demo classrooms never count toward the free-tier limit on
--     the real teacher account that created them (there isn't one
--     here, but it keeps the model clean).
-- ============================================================

alter table classrooms
  add column if not exists is_demo bool not null default false;

alter table profiles
  add column if not exists is_demo bool not null default false;

create index if not exists classrooms_is_demo_created_at_idx
  on classrooms(is_demo, created_at) where is_demo = true;

create index if not exists profiles_is_demo_created_at_idx
  on profiles(is_demo, created_at) where is_demo = true;
