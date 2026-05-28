-- ============================================================
-- COMMIT PLATFORM — 015 Lesson Annotations
-- ============================================================
-- Per-student highlights + sidebar notes on lesson reading pages.
-- A row is either:
--   - a pure highlight (selected_text set, note_text null)
--   - a pure note    (note_text set, selected_text null)
--   - a highlight + note pair (both set, links via linked_annotation_id)
--
-- The annotation lives inside an iframe so we don't trust DOM offsets;
-- we save the literal selected_text and a small context window so a
-- re-render can find the same spot via text search.
-- ============================================================

create table if not exists lesson_annotations (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references profiles(id) on delete cascade,
  lesson_id             uuid not null references lessons(id) on delete cascade,
  kind                  text not null check (kind in ('highlight', 'note')),

  -- For highlights: the actual selected text + the surrounding context so
  -- we can re-anchor it on a reload even if the DOM changes a bit.
  selected_text         text,
  quote_before          text,
  quote_after           text,

  -- For notes: the body of the note.
  note_text             text,

  -- Optional link from a note to a highlight (or vice-versa).
  linked_annotation_id  uuid references lesson_annotations(id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists lesson_annotations_lookup_idx
  on lesson_annotations(student_id, lesson_id);
