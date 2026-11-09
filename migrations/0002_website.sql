-- Phase C1: the website at promptshare.cc (docs/DESIGN.md §3, §8).

-- A sign-in with login in progress: at most 10 minutes, used once. Only an HMAC of the
-- browser's cookie is stored.
CREATE TABLE signin_tx (
  id_hash       TEXT PRIMARY KEY,
  state         TEXT NOT NULL,
  pkce_verifier TEXT NOT NULL,
  return_to     TEXT,
  expires_at    INTEGER NOT NULL
) STRICT;

-- Website sessions: 12 h idle, 7 days absolute. Only an HMAC of the cookie is stored.
CREATE TABLE web_sessions (
  id_hash      TEXT PRIMARY KEY,
  uid          TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
) STRICT;
CREATE INDEX web_sessions_uid ON web_sessions (uid);

-- The contact form (the imprint's second fast channel) and reports of content (DSA Art. 16).
-- Kept as LEGAL.md §4 says; never shown to other users.
CREATE TABLE messages (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('contact', 'report')),
  uid          TEXT,                 -- the signed-in sender, if any
  name         TEXT,
  email        TEXT,
  content_url  TEXT,                 -- reports: the exact location of the content
  category     TEXT,                 -- reports: 'illegal', 'terms' or 'csam'
  body         TEXT NOT NULL,
  good_faith   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  notified_at  INTEGER               -- when the owner was emailed
) STRICT;
CREATE INDEX messages_created ON messages (created_at);
