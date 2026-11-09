-- Phase S3 (docs/DESIGN.md §5.1): tasks between members.

-- Set on entries of kind 'task' only: open or done, and the member it is assigned to.
ALTER TABLE session_entries ADD COLUMN task_status TEXT CHECK (task_status IN ('open', 'done'));
ALTER TABLE session_entries ADD COLUMN assignee_uid TEXT;
CREATE INDEX session_entries_assignee ON session_entries (assignee_uid);
