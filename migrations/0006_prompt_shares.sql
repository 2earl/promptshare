-- Phase S1: a private prompt shared with chosen people by email (docs/DESIGN.md §4.1).

-- `email` is the address the author typed, shown only to the author. `recipient_uid` is the
-- account login found for it.
CREATE TABLE prompt_shares (
  id            TEXT PRIMARY KEY,
  prompt_id     TEXT NOT NULL REFERENCES prompts (id) ON DELETE CASCADE,
  owner_uid     TEXT NOT NULL,
  recipient_uid TEXT NOT NULL,
  email         TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (prompt_id, recipient_uid)
) STRICT;
CREATE INDEX prompt_shares_recipient ON prompt_shares (recipient_uid);
CREATE INDEX prompt_shares_owner ON prompt_shares (owner_uid, created_at);

-- Addresses an author tried that have no account: the answer shows whether an address has one,
-- so repeated misses lock sharing for a while. Kept 24 hours.
CREATE TABLE share_misses (
  uid TEXT NOT NULL,
  at  INTEGER NOT NULL
) STRICT;
CREATE INDEX share_misses_uid ON share_misses (uid, at);

CREATE TABLE share_locks (
  uid          TEXT PRIMARY KEY,
  level        INTEGER NOT NULL,
  locked_until INTEGER NOT NULL
) STRICT;
