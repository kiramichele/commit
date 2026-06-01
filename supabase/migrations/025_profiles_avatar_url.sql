-- ============================================================
-- COMMIT PLATFORM — 025 Profiles Avatar URL
-- ============================================================
-- The student profile editor + avatar upload assume profiles has
-- an `avatar_url` column. The dev database had it (added by hand
-- during early development), but it never made it into a tracked
-- migration so prod was missing it — surfaced as
--   "column profiles.avatar_url does not exist"
-- when the group picker tried to join profiles for member chips.
-- This migration backfills it so every environment is consistent.
-- ============================================================

alter table profiles
  add column if not exists avatar_url text;
