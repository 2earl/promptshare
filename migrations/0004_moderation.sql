-- Phase C2b: moderation (docs/DESIGN.md §8, LEGAL.md §2–§4).

-- Removed by moderation: hidden from everyone, deleted after 6 months (LEGAL.md §4).
ALTER TABLE session_entries ADD COLUMN removed_at INTEGER;

-- Moderation can suspend someone's publishing until a time.
ALTER TABLE profiles ADD COLUMN publishing_suspended_until INTEGER;

-- The moderation view requires a second factor verified through login (acr_values).
ALTER TABLE web_sessions ADD COLUMN aal2_at INTEGER;

-- Statements of reasons (DSA Art. 17): one per decision, shown to the affected user.
CREATE TABLE moderation_decisions (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  report_id     TEXT,                 -- the report it answers, if any
  content_type  TEXT NOT NULL CHECK (content_type IN ('prompt', 'entry', 'account', 'none')),
  content_id    TEXT,
  session_id    TEXT,
  affected_uid  TEXT,                 -- NULL after the account is deleted
  action        TEXT NOT NULL CHECK (action IN ('none', 'restrict', 'remove', 'suspend', 'threat', 'reverse')),
  ground        TEXT CHECK (ground IN ('illegal', 'terms')),
  law           TEXT,                 -- for illegal content: the law it breaks
  explanation   TEXT NOT NULL,        -- facts and reasons, in plain words
  until_at      INTEGER,              -- end of a suspension
  content_title TEXT                  -- what the user will recognise, kept after deletion
) STRICT;
CREATE INDEX moderation_decisions_affected ON moderation_decisions (affected_uid, created_at);
CREATE INDEX moderation_decisions_created ON moderation_decisions (created_at);

-- Messages gain appeals against decisions and a review status. SQLite can't change a CHECK
-- constraint in place, so the table is rebuilt with its rows.
CREATE TABLE messages_new (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('contact', 'report', 'appeal')),
  uid          TEXT,
  name         TEXT,
  email        TEXT,
  content_url  TEXT,
  category     TEXT,
  body         TEXT NOT NULL,
  good_faith   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  notified_at  INTEGER,
  decision_id  TEXT,                 -- appeals: the decision contested
  closed_at    INTEGER               -- reviewed by the owner
) STRICT;
INSERT INTO messages_new (id, kind, uid, name, email, content_url, category, body, good_faith, created_at, notified_at)
  SELECT id, kind, uid, name, email, content_url, category, body, good_faith, created_at, notified_at FROM messages;
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;
CREATE INDEX messages_created ON messages (created_at);
CREATE INDEX messages_open ON messages (closed_at, created_at);
