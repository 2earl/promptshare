-- Phase C2: handles, publishing, invitations (docs/DESIGN.md §4, §5).

-- The only identity other users see: on public prompts and in shared sessions.
CREATE TABLE profiles (
  uid        TEXT PRIMARY KEY,
  handle     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

-- Invitation links to a shared session: single use, 7 days. Only an HMAC of the link's token
-- is stored; `id` lets the owner see and revoke pending links.
CREATE TABLE invitations (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL REFERENCES shared_sessions (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  used_by    TEXT
) STRICT;
CREATE INDEX invitations_session ON invitations (session_id);
CREATE INDEX invitations_created_by ON invitations (created_by);
