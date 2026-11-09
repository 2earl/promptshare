-- Phase S2 (docs/DESIGN.md §5.1): entry kinds, replies, the session brief, new-entry counts.

-- `brief` entries are versions of the session's brief: the newest one not removed is current.
ALTER TABLE session_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'note'
  CHECK (kind IN ('note', 'decision', 'question', 'task', 'summary', 'artifact', 'brief'));
-- The entry this one answers, in the same session.
ALTER TABLE session_entries ADD COLUMN reply_to TEXT;
CREATE INDEX session_entries_kind ON session_entries (session_id, kind, created_at);

-- When the member last loaded the newest entries; what's newer counts as new for them.
ALTER TABLE session_members ADD COLUMN last_read_at INTEGER;
