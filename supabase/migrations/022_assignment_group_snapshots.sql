-- ============================================================
-- COMMIT PLATFORM — 022 Group Code Snapshots
-- ============================================================
-- Persists the shared live document for each collab group so late
-- joiners can catch up without waiting for the next broadcast.
--
-- One row per group: the latest known code state plus who wrote it
-- and when. Realtime channels still carry deltas in real time; this
-- table is just the "last save" floor that anybody who joins later
-- can read to skip ahead.
-- ============================================================

create table if not exists assignment_group_snapshots (
  group_id    uuid primary key references assignment_groups(id) on delete cascade,
  code        text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id) on delete set null
);

create index if not exists assignment_group_snapshots_updated_at_idx
  on assignment_group_snapshots(updated_at);
