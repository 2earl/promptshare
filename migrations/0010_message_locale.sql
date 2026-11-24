-- The language a contact, report or appeal was sent in, so emails back use it
-- (docs/DESIGN.md "Languages"). No CHECK: a new language needs no table rebuild.
ALTER TABLE messages ADD COLUMN locale TEXT;
