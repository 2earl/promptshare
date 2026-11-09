import { credentialIn } from './credentials';
import { decryptEntry, encryptEntry } from './crypto';

/**
 * Shared sessions (docs/DESIGN.md §5). Membership decides everything: a session that exists but
 * that the caller doesn't belong to is "not found", like one that doesn't exist.
 */

export const SESSION_LIMITS = {
  title: 200,
  label: 200,
  entry: 64 * 1024,
  perSession: 5 * 1024 * 1024,
  ownedPerUser: 50,
  membersPerSession: 20,
  /** One load returns at most this much, newest first; `before` pages back. */
  loadBytes: 256 * 1024,
  loadEntries: 50,
  /** The brief: one text that changes; each change is a new version (§5.1). */
  brief: 16 * 1024,
  briefVersions: 20,
  /**
   * Search and export read at most this much per request, by stored size. Decrypting a whole
   * 5 MB session takes about 110 ms of CPU (measured locally); the free plan allows 10 ms.
   */
  scanBytes: 512 * 1024,
  searchResults: 20,
} as const;

export type TaskStatus = 'open' | 'done';

/** What an entry is, so assistants can tell a decision from a note (§5.1). */
export const ENTRY_KINDS = ['note', 'decision', 'question', 'task', 'summary', 'artifact'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export type Role = 'owner' | 'editor' | 'viewer';

export class SessionError extends Error {
  override name = 'SessionError';
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const bytes = (text: string) => new TextEncoder().encode(text).length;

export interface SessionSummary {
  id: string;
  title: string;
  role: Role;
  members: number;
  entries: number;
  /** Entries by others since you last loaded the newest ones. */
  newForYou: number;
  updatedAt: string;
}

export interface Entry {
  id: string;
  kind: EntryKind | 'brief';
  /** The entry this one answers. */
  replyTo: string | null;
  /** Entries of kind task: open or done, and the member's handle it is assigned to. */
  task: { status: TaskStatus; assignee: string | null; assignedToYou: boolean } | null;
  /** Written by the caller (any of their assistants), or by another member. */
  mine: boolean;
  label: string;
  text: string;
  /** The assistant (OAuth client ID) that wrote it. */
  writtenWith: string;
  /** The author's handle, if they chose one. */
  author: string | null;
  createdAt: string;
}

async function roleOf(db: D1Database, uid: string, sessionId: string): Promise<Role | null> {
  const row = await db
    .prepare('SELECT role FROM session_members WHERE session_id = ? AND uid = ?')
    .bind(sessionId, uid)
    .first<{ role: Role }>();
  return row?.role ?? null;
}

export async function listSessions(db: D1Database, uid: string): Promise<SessionSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.title, m.role, s.updated_at,
              (SELECT COUNT(*) FROM session_members x WHERE x.session_id = s.id) AS members,
              (SELECT COUNT(*) FROM session_entries e
                 WHERE e.session_id = s.id AND e.kind <> 'brief' AND e.removed_at IS NULL) AS entries,
              (SELECT COUNT(*) FROM session_entries e
                 WHERE e.session_id = s.id AND e.removed_at IS NULL AND e.author_uid <> ?1
                   AND e.created_at > COALESCE(m.last_read_at, m.added_at)) AS fresh
       FROM session_members m JOIN shared_sessions s ON s.id = m.session_id
       WHERE m.uid = ?1 ORDER BY s.updated_at DESC`,
    )
    .bind(uid)
    .all<{
      id: string;
      title: string;
      role: Role;
      updated_at: number;
      members: number;
      entries: number;
      fresh: number;
    }>();
  return results.map((row) => ({
    id: row.id,
    title: row.title,
    role: row.role,
    members: row.members,
    entries: row.entries,
    newForYou: row.fresh,
    updatedAt: iso(row.updated_at),
  }));
}

export async function createSession(
  db: D1Database,
  uid: string,
  now: number,
  title: string,
): Promise<SessionSummary> {
  const clean = cleanTitle(title);
  const owned = await db
    .prepare('SELECT COUNT(*) AS n FROM shared_sessions WHERE owner_uid = ?')
    .bind(uid)
    .first<{ n: number }>();
  if ((owned?.n ?? 0) >= SESSION_LIMITS.ownedPerUser) {
    throw new SessionError(
      `You own ${String(SESSION_LIMITS.ownedPerUser)} sessions, the most one account can. Delete one first.`,
    );
  }
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        'INSERT INTO shared_sessions (id, owner_uid, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(id, uid, clean, now, now),
    db
      .prepare(
        "INSERT INTO session_members (session_id, uid, role, added_at) VALUES (?, ?, 'owner', ?)",
      )
      .bind(id, uid, now),
  ]);
  return {
    id,
    title: clean,
    role: 'owner',
    members: 1,
    entries: 0,
    newForYou: 0,
    updatedAt: iso(now),
  };
}

function cleanTitle(title: string): string {
  const clean = title.trim();
  if (!clean) throw new SessionError('A session needs a title.');
  if (clean.length > SESSION_LIMITS.title) {
    throw new SessionError(`The title can be at most ${String(SESSION_LIMITS.title)} characters.`);
  }
  return clean;
}

/** Only the owner renames a session. */
export async function renameSession(
  db: D1Database,
  uid: string,
  now: number,
  sessionId: string,
  title: string,
): Promise<boolean> {
  const clean = cleanTitle(title);
  const { meta } = await db
    .prepare('UPDATE shared_sessions SET title = ?, updated_at = ? WHERE id = ? AND owner_uid = ?')
    .bind(clean, now, sessionId, uid)
    .run();
  return meta.changes > 0;
}

interface EntryRow {
  id: string;
  author_uid: string;
  client_id: string;
  kind: EntryKind | 'brief';
  reply_to: string | null;
  label: string;
  iv: string;
  ciphertext: string;
  size: number;
  created_at: number;
  author: string | null;
  task_status: TaskStatus | null;
  assignee_uid: string | null;
  assignee: string | null;
}

const ENTRY_COLUMNS = `e.id, e.author_uid, e.client_id, e.kind, e.reply_to, e.label,
  hex(e.iv) AS iv, hex(e.ciphertext) AS ciphertext, e.size, e.created_at, pr.handle AS author,
  e.task_status, e.assignee_uid, pa.handle AS assignee`;

/** Entries with their author's and assignee's handles. */
const ENTRY_FROM = `FROM session_entries e LEFT JOIN profiles pr ON pr.uid = e.author_uid
  LEFT JOIN profiles pa ON pa.uid = e.assignee_uid`;

async function toEntry(
  secret: string,
  sessionId: string,
  uid: string,
  row: EntryRow,
): Promise<Entry> {
  return {
    id: row.id,
    kind: row.kind,
    replyTo: row.reply_to,
    task:
      row.kind === 'task'
        ? {
            status: row.task_status ?? 'open',
            assignee: row.assignee,
            assignedToYou: row.assignee_uid === uid,
          }
        : null,
    mine: row.author_uid === uid,
    label: row.label,
    text: await decryptEntry(secret, sessionId, row.id, row.iv, row.ciphertext),
    writtenWith: row.client_id,
    author: row.author,
    createdAt: iso(row.created_at),
  };
}

/**
 * An entry's place in its session: insertion order (rowid), which a clock tie can't reorder.
 * Rowids are never stored or shown, only compared at query time, so a renumbering VACUUM (which
 * keeps their order) doesn't matter.
 */
async function anchorOf(db: D1Database, sessionId: string, entryId: string | undefined) {
  if (!entryId) return null;
  const row = await db
    .prepare('SELECT rowid AS position FROM session_entries WHERE id = ? AND session_id = ?')
    .bind(entryId, sessionId)
    .first<{ position: number }>();
  return row?.position ?? null;
}

export interface LoadOptions {
  /** Entries older than this entry. */
  before?: string | undefined;
  /** Entries newer than this entry. */
  since?: string | undefined;
  kind?: EntryKind | undefined;
  /** Tasks that are open, or done. */
  status?: TaskStatus | undefined;
  /** When set, and the newest entries are loaded, they stop counting as new for the caller. */
  markReadAt?: number | undefined;
}

export interface LoadedSession {
  title: string;
  role: Role;
  /** The current brief, if anyone wrote one. */
  brief: Entry | null;
  briefVersions: number;
  entries: Entry[];
  more: boolean;
  /** When the caller last loaded the newest entries before this load. */
  lastLoadedAt: string | null;
}

export async function loadSession(
  db: D1Database,
  secret: string,
  uid: string,
  sessionId: string,
  options: LoadOptions = {},
): Promise<LoadedSession | null> {
  const member = await db
    .prepare(
      `SELECT m.role, m.last_read_at, s.title FROM session_members m
       JOIN shared_sessions s ON s.id = m.session_id WHERE m.session_id = ? AND m.uid = ?`,
    )
    .bind(sessionId, uid)
    .first<{ role: Role; last_read_at: number | null; title: string }>();
  if (!member) return null;

  const before = await anchorOf(db, sessionId, options.before);
  const since = await anchorOf(db, sessionId, options.since);
  const { results } = await db
    .prepare(
      `SELECT ${ENTRY_COLUMNS}
       ${ENTRY_FROM}
       WHERE e.session_id = ?1 AND e.removed_at IS NULL AND e.kind <> 'brief'
         AND (?2 IS NULL OR e.kind = ?2)
         AND e.rowid < ?3 AND e.rowid > ?4
         AND (?6 IS NULL OR e.task_status = ?6)
       ORDER BY e.rowid DESC LIMIT ?5`,
    )
    .bind(
      sessionId,
      options.kind ?? null,
      before ?? Number.MAX_SAFE_INTEGER,
      since ?? 0,
      SESSION_LIMITS.loadEntries + 1,
      options.status ?? null,
    )
    .all<EntryRow>();

  const entries: Entry[] = [];
  let used = 0;
  let more = false;
  for (const row of results) {
    if (
      entries.length === SESSION_LIMITS.loadEntries ||
      used + row.size > SESSION_LIMITS.loadBytes
    ) {
      more = true;
      break;
    }
    used += row.size;
    entries.push(await toEntry(secret, sessionId, uid, row));
  }

  const current = await currentBrief(db, secret, uid, sessionId);

  // Loading the newest entries (not paging back) means the caller has seen what's new.
  if (options.markReadAt !== undefined && !options.before) {
    await db
      .prepare('UPDATE session_members SET last_read_at = ? WHERE session_id = ? AND uid = ?')
      .bind(options.markReadAt, sessionId, uid)
      .run();
  }
  return {
    title: member.title,
    role: member.role,
    brief: current.brief,
    briefVersions: current.versions,
    entries,
    more,
    lastLoadedAt: member.last_read_at === null ? null : iso(member.last_read_at),
  };
}

/** The newest brief not removed, and how many versions there are. Callers check membership. */
async function currentBrief(
  db: D1Database,
  secret: string,
  uid: string,
  sessionId: string,
): Promise<{ brief: Entry | null; versions: number }> {
  const row = await db
    .prepare(
      `SELECT ${ENTRY_COLUMNS}, (SELECT COUNT(*) FROM session_entries b
                                 WHERE b.session_id = ?1 AND b.kind = 'brief' AND b.removed_at IS NULL) AS versions
       ${ENTRY_FROM}
       WHERE e.session_id = ?1 AND e.kind = 'brief' AND e.removed_at IS NULL
       ORDER BY e.rowid DESC LIMIT 1`,
    )
    .bind(sessionId)
    .first<EntryRow & { versions: number }>();
  return {
    brief: row ? await toEntry(secret, sessionId, uid, row) : null,
    versions: row?.versions ?? 0,
  };
}

/** Earlier versions of the brief, newest first (the website's history page). */
export async function briefHistory(
  db: D1Database,
  secret: string,
  uid: string,
  sessionId: string,
): Promise<Entry[] | null> {
  if (!(await roleOf(db, uid, sessionId))) return null;
  const { results } = await db
    .prepare(
      `SELECT ${ENTRY_COLUMNS}
       ${ENTRY_FROM}
       WHERE e.session_id = ? AND e.kind = 'brief' AND e.removed_at IS NULL
       ORDER BY e.rowid DESC LIMIT ?`,
    )
    .bind(sessionId, SESSION_LIMITS.briefVersions)
    .all<EntryRow>();
  const versions: Entry[] = [];
  for (const row of results) versions.push(await toEntry(secret, sessionId, uid, row));
  return versions;
}

async function addEntry(
  db: D1Database,
  secret: string,
  caller: { uid: string; clientId: string },
  now: number,
  sessionId: string,
  text: string,
  fields: {
    label: string;
    kind: EntryKind | 'brief';
    replyTo: string | null;
    assignee?: string | undefined;
  },
): Promise<Entry | null> {
  const role = await roleOf(db, caller.uid, sessionId);
  if (!role) return null;
  if (role === 'viewer') throw new SessionError('You can read this session but not add to it.');
  if (!text.trim()) throw new SessionError('Nothing to save.');
  const size = bytes(text);
  const max = fields.kind === 'brief' ? SESSION_LIMITS.brief : SESSION_LIMITS.entry;
  if (size > max) {
    throw new SessionError(
      `${fields.kind === 'brief' ? 'The brief' : 'One entry'} can be at most ${String(max / 1024)} KB.`,
    );
  }
  const cleanLabel = fields.label.trim();
  if (cleanLabel.length > SESSION_LIMITS.label) {
    throw new SessionError(`The label can be at most ${String(SESSION_LIMITS.label)} characters.`);
  }
  if (fields.replyTo) {
    const target = await db
      .prepare(
        "SELECT 1 AS ok FROM session_entries WHERE id = ? AND session_id = ? AND removed_at IS NULL AND kind <> 'brief'",
      )
      .bind(fields.replyTo, sessionId)
      .first<{ ok: number }>();
    if (!target)
      throw new SessionError('There is no entry with that ID in this session to reply to.');
  }

  const assignee = fields.assignee?.trim()
    ? await memberByHandle(db, sessionId, fields.assignee)
    : null;
  if (fields.assignee?.trim() && fields.kind !== 'task') {
    throw new SessionError('Only a task can be assigned.');
  }

  const stats = await db
    .prepare(
      `SELECT (SELECT COALESCE(SUM(size), 0) FROM session_entries WHERE session_id = ?1) AS used,
              (SELECT COUNT(*) FROM session_members WHERE session_id = ?1) AS members`,
    )
    .bind(sessionId)
    .first<{ used: number; members: number }>();
  if ((stats?.used ?? 0) + size > SESSION_LIMITS.perSession) {
    throw new SessionError(
      `This session is full (${String(SESSION_LIMITS.perSession / 1024 / 1024)} MB). Delete older entries or start a new session.`,
    );
  }
  // Others can read this session: refuse what looks like a credential (THREAT_MODEL.md).
  if ((stats?.members ?? 1) > 1) {
    const found = credentialIn(text);
    if (found) {
      throw new SessionError(
        `Not saved: this looks like a ${found}, and other people can read this session. Remove it and save again.`,
      );
    }
  }

  const id = crypto.randomUUID();
  const { iv, ciphertext } = await encryptEntry(secret, sessionId, id, text);
  const statements = [
    db
      .prepare(
        `INSERT INTO session_entries (id, session_id, author_uid, client_id, kind, reply_to, label, iv, ciphertext, size, created_at, task_status, assignee_uid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        sessionId,
        caller.uid,
        caller.clientId,
        fields.kind,
        fields.replyTo,
        cleanLabel,
        iv,
        ciphertext,
        size,
        now,
        fields.kind === 'task' ? 'open' : null,
        assignee?.uid ?? null,
      ),
    db.prepare('UPDATE shared_sessions SET updated_at = ? WHERE id = ?').bind(now, sessionId),
  ];
  if (fields.kind === 'brief') {
    // Keeps the newest versions; one removed by moderation stays as evidence (LEGAL.md §4).
    statements.push(
      db
        .prepare(
          `DELETE FROM session_entries WHERE session_id = ?1 AND kind = 'brief' AND removed_at IS NULL
             AND id NOT IN (SELECT id FROM session_entries WHERE session_id = ?1 AND kind = 'brief'
                              AND removed_at IS NULL ORDER BY rowid DESC LIMIT ?2)`,
        )
        .bind(sessionId, SESSION_LIMITS.briefVersions),
    );
  }
  await db.batch(statements);
  return {
    id,
    kind: fields.kind,
    replyTo: fields.replyTo,
    task:
      fields.kind === 'task'
        ? {
            status: 'open',
            assignee: assignee?.handle ?? null,
            assignedToYou: assignee?.uid === caller.uid,
          }
        : null,
    mine: true,
    label: cleanLabel,
    text,
    writtenWith: caller.clientId,
    author: null,
    createdAt: iso(now),
  };
}

export async function saveToSession(
  db: D1Database,
  secret: string,
  caller: { uid: string; clientId: string },
  now: number,
  sessionId: string,
  text: string,
  label = '',
  options: {
    kind?: EntryKind | undefined;
    replyTo?: string | undefined;
    /** A member's handle, for a task. */
    assignee?: string | undefined;
  } = {},
): Promise<Entry | null> {
  const kind = options.kind ?? 'note';
  if (!(ENTRY_KINDS as readonly string[]).includes(kind)) {
    throw new SessionError(`An entry is one of: ${ENTRY_KINDS.join(', ')}.`);
  }
  return addEntry(db, secret, caller, now, sessionId, text, {
    label,
    kind,
    replyTo: options.replyTo?.trim() || null,
    assignee: options.assignee,
  });
}

/** Replaces the session's brief with a new version; earlier versions stay (at most 20). */
export async function updateBrief(
  db: D1Database,
  secret: string,
  caller: { uid: string; clientId: string },
  now: number,
  sessionId: string,
  text: string,
): Promise<Entry | null> {
  return addEntry(db, secret, caller, now, sessionId, text, {
    label: '',
    kind: 'brief',
    replyTo: null,
  });
}

async function memberByHandle(
  db: D1Database,
  sessionId: string,
  handle: string,
): Promise<{ uid: string; handle: string }> {
  const row = await db
    .prepare(
      `SELECT m.uid, pr.handle FROM session_members m JOIN profiles pr ON pr.uid = m.uid
       WHERE m.session_id = ? AND pr.handle = ? COLLATE NOCASE`,
    )
    .bind(sessionId, handle.trim().replace(/^@/, ''))
    .first<{ uid: string; handle: string }>();
  if (!row) throw new SessionError('No member of this session has that handle.');
  return row;
}

/**
 * Marks a task open or done, or assigns it to a member ('' or null: nobody). Editors and the
 * owner; the task's text doesn't change, so it stays clear who wrote it.
 */
export async function updateTask(
  db: D1Database,
  uid: string,
  now: number,
  sessionId: string,
  entryId: string,
  change: { status?: TaskStatus | undefined; assignee?: string | null | undefined },
): Promise<boolean> {
  const role = await roleOf(db, uid, sessionId);
  if (!role) return false;
  if (role === 'viewer') throw new SessionError('You can read this session but not change it.');
  const assignee =
    change.assignee === undefined
      ? undefined
      : change.assignee === null || !change.assignee.trim()
        ? null
        : (await memberByHandle(db, sessionId, change.assignee)).uid;
  const { meta } = await db
    .prepare(
      `UPDATE session_entries
       SET task_status = COALESCE(?1, task_status),
           assignee_uid = CASE WHEN ?2 = 1 THEN ?3 ELSE assignee_uid END
       WHERE id = ?4 AND session_id = ?5 AND kind = 'task' AND removed_at IS NULL`,
    )
    .bind(
      change.status ?? null,
      assignee === undefined ? 0 : 1,
      assignee ?? null,
      entryId,
      sessionId,
    )
    .run();
  if (meta.changes === 0) return false;
  await db
    .prepare('UPDATE shared_sessions SET updated_at = ? WHERE id = ?')
    .bind(now, sessionId)
    .run();
  return true;
}

/** Entries (and, without `before`, the current brief) newest first, within `scanBytes`. */
async function scanWindow(db: D1Database, sessionId: string, beforeEntry: string | undefined) {
  const before = await anchorOf(db, sessionId, beforeEntry);
  // Sizes first (no ciphertext), so only rows within the budget are fetched and decrypted.
  const { results } = await db
    .prepare(
      `SELECT e.rowid AS position, e.id, e.size FROM session_entries e
       WHERE e.session_id = ?1 AND e.removed_at IS NULL AND e.rowid < ?2
         AND (e.kind <> 'brief' OR (?3 = 1 AND e.rowid = (SELECT MAX(b.rowid) FROM session_entries b
                WHERE b.session_id = ?1 AND b.kind = 'brief' AND b.removed_at IS NULL)))
       ORDER BY e.rowid DESC`,
    )
    .bind(sessionId, before ?? Number.MAX_SAFE_INTEGER, beforeEntry ? 0 : 1)
    .all<{ position: number; id: string; size: number }>();
  let used = 0;
  let count = 0;
  for (const row of results) {
    if (count > 0 && used + row.size > SESSION_LIMITS.scanBytes) break;
    used += row.size;
    count++;
  }
  const window = results.slice(0, count);
  const oldest = window.at(-1);
  return {
    first: window[0]?.position ?? 0,
    last: oldest?.position ?? 0,
    count,
    continueBefore: count < results.length && oldest ? oldest.id : null,
  };
}

/** Lower-cased words of a query: an entry matches when its text holds all of them. */
function queryWords(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])].slice(0, 12);
}

/**
 * Searches one session, newest first, reading at most `scanBytes` per call; `continueBefore`
 * says where to go on. Entries are encrypted, so this decrypts them; there is no search across
 * sessions (§7.1).
 */
export async function searchSession(
  db: D1Database,
  secret: string,
  uid: string,
  sessionId: string,
  query: string,
  beforeEntry?: string,
): Promise<{ matches: Entry[]; searched: number; continueBefore: string | null } | null> {
  if (!(await roleOf(db, uid, sessionId))) return null;
  const words = queryWords(query);
  if (words.length === 0) throw new SessionError('Give words to search for.');
  const window = await scanWindow(db, sessionId, beforeEntry);
  const matches: Entry[] = [];
  if (window.count > 0) {
    const { results } = await db
      .prepare(
        `SELECT ${ENTRY_COLUMNS} ${ENTRY_FROM}
         WHERE e.session_id = ?1 AND e.removed_at IS NULL AND e.rowid <= ?2 AND e.rowid >= ?3
           AND (e.kind <> 'brief' OR (?4 = 1 AND e.rowid = (SELECT MAX(b.rowid) FROM session_entries b
                  WHERE b.session_id = ?1 AND b.kind = 'brief' AND b.removed_at IS NULL)))
         ORDER BY e.rowid DESC`,
      )
      .bind(sessionId, window.first, window.last, beforeEntry ? 0 : 1)
      .all<EntryRow>();
    for (const row of results) {
      const entry = await toEntry(secret, sessionId, uid, row);
      const haystack = `${entry.label}\n${entry.text}`.toLocaleLowerCase();
      if (words.every((word) => haystack.includes(word))) matches.push(entry);
      if (matches.length === SESSION_LIMITS.searchResults) break;
    }
  }
  return { matches, searched: window.count, continueBefore: window.continueBefore };
}

/**
 * The session as Markdown, oldest entry first, in parts of at most `scanBytes` (the brief leads
 * part 1). Parts are counted from stored sizes, without decrypting.
 */
export async function exportSession(
  db: D1Database,
  secret: string,
  uid: string,
  sessionId: string,
  part: number,
  now: number,
): Promise<{ markdown: string; part: number; parts: number; title: string } | null> {
  const member = await db
    .prepare(
      `SELECT s.title FROM session_members m JOIN shared_sessions s ON s.id = m.session_id
       WHERE m.session_id = ? AND m.uid = ?`,
    )
    .bind(sessionId, uid)
    .first<{ title: string }>();
  if (!member) return null;
  const { results: sizes } = await db
    .prepare(
      `SELECT rowid AS position, size FROM session_entries
       WHERE session_id = ? AND removed_at IS NULL AND kind <> 'brief' ORDER BY rowid`,
    )
    .bind(sessionId)
    .all<{ position: number; size: number }>();
  const ranges: { from: number; to: number }[] = [];
  let used = 0;
  for (const row of sizes) {
    const current = ranges.at(-1);
    if (!current || used + row.size > SESSION_LIMITS.scanBytes) {
      ranges.push({ from: row.position, to: row.position });
      used = row.size;
    } else {
      current.to = row.position;
      used += row.size;
    }
  }
  const parts = Math.max(ranges.length, 1);
  if (!Number.isInteger(part) || part < 1 || part > parts) return null;
  const range = ranges[part - 1];
  const entries: Entry[] = [];
  if (range) {
    const { results } = await db
      .prepare(
        `SELECT ${ENTRY_COLUMNS} ${ENTRY_FROM}
         WHERE e.session_id = ? AND e.removed_at IS NULL AND e.kind <> 'brief'
           AND e.rowid >= ? AND e.rowid <= ? ORDER BY e.rowid`,
      )
      .bind(sessionId, range.from, range.to)
      .all<EntryRow>();
    for (const row of results) entries.push(await toEntry(secret, sessionId, uid, row));
  }
  const brief = part === 1 ? (await currentBrief(db, secret, uid, sessionId)).brief : null;
  const who = (e: Entry) => (e.mine ? 'you' : e.author ? `@${e.author}` : 'a member');
  const lines = [
    `# ${member.title}`,
    '',
    `Exported from Prompt share on ${iso(now).slice(0, 10)}${parts > 1 ? `, part ${String(part)} of ${String(parts)}` : ''}.`,
    '',
  ];
  if (brief) {
    lines.push('## Brief', '', `_By ${who(brief)}, ${brief.createdAt}_`, '', brief.text, '');
  }
  if (entries.length) lines.push('## Entries', '');
  for (const e of entries) {
    const heading = [
      e.kind === 'note' ? '' : e.kind.charAt(0).toUpperCase() + e.kind.slice(1),
      e.label,
      `${who(e)}, ${e.createdAt}`,
    ]
      .filter(Boolean)
      .join(' · ');
    lines.push(`### ${heading}`, '');
    const meta = [
      `id ${e.id}`,
      e.replyTo ? `reply to ${e.replyTo}` : '',
      e.task ? `${e.task.status}${e.task.assignee ? `, assigned to @${e.task.assignee}` : ''}` : '',
    ].filter(Boolean);
    lines.push(`_${meta.join(' · ')}_`, '', e.text, '');
  }
  return { markdown: lines.join('\n'), part, parts, title: member.title };
}

/** Only the owner deletes a session, with every entry, for every member. */
export async function deleteSession(
  db: D1Database,
  uid: string,
  sessionId: string,
): Promise<boolean> {
  if ((await roleOf(db, uid, sessionId)) !== 'owner') return false;
  await db.batch([
    db.prepare('DELETE FROM session_entries WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM session_members WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM shared_sessions WHERE id = ? AND owner_uid = ?').bind(sessionId, uid),
  ]);
  return true;
}

/** A member deletes an entry they wrote; the owner deletes any entry in their session. */
export async function deleteEntry(
  db: D1Database,
  uid: string,
  sessionId: string,
  entryId: string,
): Promise<boolean> {
  const role = await roleOf(db, uid, sessionId);
  if (!role) return false;
  const { meta } = await db
    .prepare(
      `DELETE FROM session_entries WHERE id = ? AND session_id = ? AND (author_uid = ? OR ? = 'owner')`,
    )
    .bind(entryId, sessionId, uid, role)
    .run();
  return meta.changes > 0;
}

// ---- Members and invitations (phase C2, website only: DESIGN D7) ------------------------------

export interface Member {
  uid: string;
  handle: string | null;
  role: Role;
  you: boolean;
}

export async function listMembers(
  db: D1Database,
  uid: string,
  sessionId: string,
): Promise<Member[] | null> {
  if (!(await roleOf(db, uid, sessionId))) return null;
  const { results } = await db
    .prepare(
      `SELECT m.uid, m.role, pr.handle FROM session_members m LEFT JOIN profiles pr ON pr.uid = m.uid
       WHERE m.session_id = ? ORDER BY m.role = 'owner' DESC, m.added_at`,
    )
    .bind(sessionId)
    .all<{ uid: string; role: Role; handle: string | null }>();
  return results.map((row) => ({
    uid: row.uid,
    handle: row.handle,
    role: row.role,
    you: row.uid === uid,
  }));
}

/** The owner removes someone; anyone but the owner can remove themselves (leave). */
export async function removeMember(
  db: D1Database,
  uid: string,
  sessionId: string,
  memberUid: string,
): Promise<boolean> {
  const role = await roleOf(db, uid, sessionId);
  if (!role) return false;
  const allowed = memberUid === uid ? role !== 'owner' : role === 'owner';
  if (!allowed) return false;
  const { meta } = await db
    .prepare("DELETE FROM session_members WHERE session_id = ? AND uid = ? AND role != 'owner'")
    .bind(sessionId, memberUid)
    .run();
  if (meta.changes > 0) {
    // Someone who left can't be assigned anything any more.
    await db
      .prepare(
        'UPDATE session_entries SET assignee_uid = NULL WHERE session_id = ? AND assignee_uid = ?',
      )
      .bind(sessionId, memberUid)
      .run();
  }
  return meta.changes > 0;
}

export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

async function tokenHash(pepper: string, token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`invitation:${token}`)),
  );
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface Invitation {
  id: string;
  role: 'editor' | 'viewer';
  expiresAt: string;
}

/** The owner creates a single-use link; the token is returned once and only its HMAC is kept. */
export async function createInvitation(
  db: D1Database,
  pepper: string,
  uid: string,
  now: number,
  sessionId: string,
  role: 'editor' | 'viewer',
): Promise<{ token: string; invitation: Invitation } | null> {
  if ((await roleOf(db, uid, sessionId)) !== 'owner') return null;
  const pending = await db
    .prepare(
      'SELECT COUNT(*) AS n FROM invitations WHERE session_id = ? AND used_at IS NULL AND expires_at > ?',
    )
    .bind(sessionId, now)
    .first<{ n: number }>();
  const members = await db
    .prepare('SELECT COUNT(*) AS n FROM session_members WHERE session_id = ?')
    .bind(sessionId)
    .first<{ n: number }>();
  if ((members?.n ?? 0) + (pending?.n ?? 0) >= SESSION_LIMITS.membersPerSession) {
    throw new SessionError(
      `A session can have ${String(SESSION_LIMITS.membersPerSession)} members, counting open invitations. Remove someone or revoke a link first.`,
    );
  }
  const token = randomToken();
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare('DELETE FROM invitations WHERE expires_at < ? AND used_at IS NULL').bind(now),
    db
      .prepare(
        `INSERT INTO invitations (id, token_hash, session_id, role, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        await tokenHash(pepper, token),
        sessionId,
        role,
        uid,
        now,
        now + INVITATION_TTL_SECONDS,
      ),
  ]);
  return { token, invitation: { id, role, expiresAt: iso(now + INVITATION_TTL_SECONDS) } };
}

export async function listInvitations(
  db: D1Database,
  uid: string,
  now: number,
  sessionId: string,
): Promise<Invitation[] | null> {
  if ((await roleOf(db, uid, sessionId)) !== 'owner') return null;
  const { results } = await db
    .prepare(
      `SELECT id, role, expires_at FROM invitations
       WHERE session_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at`,
    )
    .bind(sessionId, now)
    .all<{ id: string; role: 'editor' | 'viewer'; expires_at: number }>();
  return results.map((row) => ({ id: row.id, role: row.role, expiresAt: iso(row.expires_at) }));
}

export async function revokeInvitation(
  db: D1Database,
  uid: string,
  sessionId: string,
  invitationId: string,
): Promise<boolean> {
  if ((await roleOf(db, uid, sessionId)) !== 'owner') return false;
  const { meta } = await db
    .prepare('DELETE FROM invitations WHERE id = ? AND session_id = ? AND used_at IS NULL')
    .bind(invitationId, sessionId)
    .run();
  return meta.changes > 0;
}

export interface InvitationPreview {
  sessionId: string;
  title: string;
  owner: string | null;
  role: 'editor' | 'viewer';
  alreadyMember: boolean;
}

/** What the invitee sees before joining. Null for an unknown, used or expired link. */
export async function previewInvitation(
  db: D1Database,
  pepper: string,
  uid: string,
  now: number,
  token: string,
): Promise<InvitationPreview | null> {
  const row = await db
    .prepare(
      `SELECT i.session_id, i.role, s.title, pr.handle AS owner FROM invitations i
       JOIN shared_sessions s ON s.id = i.session_id
       LEFT JOIN profiles pr ON pr.uid = s.owner_uid
       WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`,
    )
    .bind(await tokenHash(pepper, token), now)
    .first<{
      session_id: string;
      role: 'editor' | 'viewer';
      title: string;
      owner: string | null;
    }>();
  if (!row) return null;
  return {
    sessionId: row.session_id,
    title: row.title,
    owner: row.owner,
    role: row.role,
    alreadyMember: (await roleOf(db, uid, row.session_id)) !== null,
  };
}

/** Uses the link: once, by a signed-in person pressing Join on the website. */
export async function acceptInvitation(
  db: D1Database,
  pepper: string,
  uid: string,
  now: number,
  token: string,
): Promise<string | null> {
  const preview = await previewInvitation(db, pepper, uid, now, token);
  if (!preview) return null;
  if (preview.alreadyMember) return preview.sessionId;
  const hash = await tokenHash(pepper, token);
  // Claim the link first, so two people can't both use it.
  const { meta } = await db
    .prepare(
      'UPDATE invitations SET used_at = ?, used_by = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
    )
    .bind(now, uid, hash, now)
    .run();
  if (meta.changes === 0) return null;
  await db
    .prepare(
      'INSERT OR IGNORE INTO session_members (session_id, uid, role, added_at) VALUES (?, ?, ?, ?)',
    )
    .bind(preview.sessionId, uid, preview.role, now)
    .run();
  return preview.sessionId;
}
