-- Explicit consent for special categories of data (GDPR Art. 9(2)(a)), reminders for unanswered
-- messages, and the switch for emailing reporters (DSA Art. 16(4), 16(5)).

-- One decision per user and kind. `consented` 0 records "no": the user was asked and declined,
-- so the website doesn't ask again. `version` is the wording they answered.
CREATE TABLE consents (
  uid        TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('sensitive_data')),
  consented  INTEGER NOT NULL CHECK (consented IN (0, 1)),
  version    INTEGER NOT NULL,
  decided_at INTEGER NOT NULL,
  PRIMARY KEY (uid, kind)
) STRICT;

-- The owner was reminded that a message is still open (30 minutes after it arrived).
ALTER TABLE messages ADD COLUMN reminded_at INTEGER;
-- The reporter was emailed automatically: confirmation of receipt, and the decision.
ALTER TABLE messages ADD COLUMN receipt_sent_at INTEGER;
ALTER TABLE messages ADD COLUMN decision_sent_at INTEGER;

-- Switches the owner manages on the moderation page.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
