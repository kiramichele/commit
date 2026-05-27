-- ============================================================
-- COMMIT PLATFORM — 012 Curriculum Order Numeric
-- ============================================================
-- Changes assignments.curriculum_order from integer to numeric so
-- teacher classroom assignments can slot between admin items
-- (whose order_index is a fixed integer) using half-steps.
--
-- Example: admin items at 1, 2, 3 — teacher item moves up to slot
-- between 1 and 2 by writing curriculum_order = 1.5. Subsequent
-- reorders keep using mid-points so we never need to renumber the
-- admin side.
-- ============================================================

alter table assignments
  alter column curriculum_order type numeric
  using curriculum_order::numeric;
