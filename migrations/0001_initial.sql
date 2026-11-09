-- Prompt share, phase P1 (docs/DESIGN.md §7). IDs are random UUIDs; times are Unix seconds.

-- Prompts (§4). Private by default; public ones are visible to every signed-in 2earl user.
CREATE TABLE prompts (
  id           TEXT PRIMARY KEY,
  owner_uid    TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  models       TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  visibility   TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  -- Moderation (§8): 'restricted' can't be public; 'removed' is hidden from everyone but the owner.
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restricted', 'removed')),
  copied_from  TEXT,                          -- the public prompt this one was copied from
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  published_at INTEGER
) STRICT;
CREATE INDEX prompts_owner ON prompts (owner_uid, updated_at);
CREATE INDEX prompts_public ON prompts (visibility, status, updated_at);

-- Full-text search over the fields people search by. Kept in step by the triggers below.
CREATE VIRTUAL TABLE prompts_fts USING fts5 (
  title, description, tags, body,
  content = 'prompts', content_rowid = 'rowid', tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER prompts_ai AFTER INSERT ON prompts BEGIN
  INSERT INTO prompts_fts (rowid, title, description, tags, body)
  VALUES (new.rowid, new.title, new.description, new.tags, new.body);
END;
CREATE TRIGGER prompts_ad AFTER DELETE ON prompts BEGIN
  INSERT INTO prompts_fts (prompts_fts, rowid, title, description, tags, body)
  VALUES ('delete', old.rowid, old.title, old.description, old.tags, old.body);
END;
CREATE TRIGGER prompts_au AFTER UPDATE ON prompts BEGIN
  INSERT INTO prompts_fts (prompts_fts, rowid, title, description, tags, body)
  VALUES ('delete', old.rowid, old.title, old.description, old.tags, old.body);
  INSERT INTO prompts_fts (rowid, title, description, tags, body)
  VALUES (new.rowid, new.title, new.description, new.tags, new.body);
END;

-- Shared sessions (§5). Always private; members join by invitation (phase P2).
CREATE TABLE shared_sessions (
  id         TEXT PRIMARY KEY,
  owner_uid  TEXT NOT NULL,
  title      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX shared_sessions_owner ON shared_sessions (owner_uid);

CREATE TABLE session_members (
  session_id TEXT NOT NULL REFERENCES shared_sessions (id) ON DELETE CASCADE,
  uid        TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  added_at   INTEGER NOT NULL,
  PRIMARY KEY (session_id, uid)
) STRICT;
CREATE INDEX session_members_uid ON session_members (uid);

-- Entries are added and deleted, never edited. Text is AES-256-GCM encrypted (§7.1).
CREATE TABLE session_entries (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES shared_sessions (id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL,
  client_id  TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  iv         BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  size       INTEGER NOT NULL,                -- plaintext bytes, for limits
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX session_entries_session ON session_entries (session_id, created_at);
CREATE INDEX session_entries_author ON session_entries (author_uid);

-- Security log: names of actions, never content. 90 days.
CREATE TABLE audit_events (
  id            TEXT PRIMARY KEY,
  at            INTEGER NOT NULL,
  event         TEXT NOT NULL,
  actor_user_id TEXT,
  client_id     TEXT,
  detail        TEXT
) STRICT;
CREATE INDEX audit_events_actor ON audit_events (actor_user_id, at);
CREATE INDEX audit_events_at ON audit_events (at);
