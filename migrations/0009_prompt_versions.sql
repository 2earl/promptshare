-- Phase P5 (docs/DESIGN.md §4.3): earlier versions of a prompt, for its owner only.

-- A copy of a prompt's content as it was before a change. The newest 10 per prompt are kept.
CREATE TABLE prompt_versions (
  id          TEXT PRIMARY KEY,
  prompt_id   TEXT NOT NULL,
  owner_uid   TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  body        TEXT NOT NULL,
  tags        TEXT NOT NULL,   -- JSON array of strings
  models      TEXT NOT NULL,   -- JSON array of strings
  saved_at    INTEGER NOT NULL, -- when this content was saved (the prompt's updated_at then)
  replaced_at INTEGER NOT NULL  -- when a change replaced it
) STRICT;
CREATE INDEX prompt_versions_prompt ON prompt_versions (prompt_id, replaced_at);
CREATE INDEX prompt_versions_owner ON prompt_versions (owner_uid);
