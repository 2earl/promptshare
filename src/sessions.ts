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
} as const;

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
  updatedAt: string;
}

export interface Entry {
  id: string;
  /** Written by the caller (any of their assistants), or by another member. */
  mine: boolean;
  label: string;
  text: string;
  /** The assistant (OAuth client ID) that wrote it. */
  writtenWith: string;
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
              (SELECT COUNT(*) FROM session_entries e WHERE e.session_id = s.id) AS entries
       FROM session_members m JOIN shared_sessions s ON s.id = m.session_id
       WHERE m.uid = ? ORDER BY s.updated_at DESC`,
    )
    .bind(uid)
    .all<{
      id: string;
      title: string;
      role: Role;
      updated_at: number;
      members: number;
      entries: number;
    }>();
  return results.map((row) => ({
    id: row.id,
    title: row.title,
    role: row.role,
    members: row.members,
    entries: row.entries,
    updatedAt: iso(row.updated_at),
  }));
}

export async function createSession(
  db: D1Database,
  uid: string,
  now: number,
  title: string,
): Promise<SessionSummary> {
  const clean = title.trim();
  if (!clean) throw new SessionError('A session needs a title.');
  if (clean.length > SESSION_LIMITS.title) {
    throw new SessionError(`The title can be at most ${String(SESSION_LIMITS.title)} characters.`);
  }
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
  return { id, title: clean, role: 'owner', members: 1, entries: 0, updatedAt: iso(now) };
}

export async function loadSession(
  db: D1Database,
  secret: string,
  uid: string,
  sessionId: string,
  before?: string,
): Promise<{ title: string; role: Role; entries: Entry[]; more: boolean } | null> {
  const role = await roleOf(db, uid, sessionId);
  if (!role) return null;
  const session = await db
    .prepare('SELECT title FROM shared_sessions WHERE id = ?')
    .bind(sessionId)
    .first<{ title: string }>();
  if (!session) return null;

  let cutoff = Number.MAX_SAFE_INTEGER;
  let cutoffId = '';
  if (before) {
    const anchor = await db
      .prepare('SELECT created_at, id FROM session_entries WHERE id = ? AND session_id = ?')
      .bind(before, sessionId)
      .first<{ created_at: number; id: string }>();
    if (anchor) {
      cutoff = anchor.created_at;
      cutoffId = anchor.id;
    }
  }
  const { results } = await db
    .prepare(
      `SELECT id, author_uid, client_id, label, iv, ciphertext, size, created_at FROM session_entries
       WHERE session_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(sessionId, cutoff, cutoff, cutoffId || '￿', SESSION_LIMITS.loadEntries + 1)
    .all<{
      id: string;
      author_uid: string;
      client_id: string;
      label: string;
      iv: number[];
      ciphertext: number[];
      size: number;
      created_at: number;
    }>();

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
    entries.push({
      id: row.id,
      mine: row.author_uid === uid,
      label: row.label,
      text: await decryptEntry(secret, sessionId, row.id, row.iv, row.ciphertext),
      writtenWith: row.client_id,
      createdAt: iso(row.created_at),
    });
  }
  return { title: session.title, role, entries, more };
}

export async function saveToSession(
  db: D1Database,
  secret: string,
  caller: { uid: string; clientId: string },
  now: number,
  sessionId: string,
  text: string,
  label = '',
): Promise<Entry | null> {
  const role = await roleOf(db, caller.uid, sessionId);
  if (!role) return null;
  if (role === 'viewer') throw new SessionError('You can read this session but not add to it.');
  if (!text.trim()) throw new SessionError('Nothing to save.');
  const size = bytes(text);
  if (size > SESSION_LIMITS.entry) {
    throw new SessionError(`One entry can be at most ${String(SESSION_LIMITS.entry / 1024)} KB.`);
  }
  const cleanLabel = label.trim();
  if (cleanLabel.length > SESSION_LIMITS.label) {
    throw new SessionError(`The label can be at most ${String(SESSION_LIMITS.label)} characters.`);
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
  await db.batch([
    db
      .prepare(
        `INSERT INTO session_entries (id, session_id, author_uid, client_id, label, iv, ciphertext, size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, sessionId, caller.uid, caller.clientId, cleanLabel, iv, ciphertext, size, now),
    db.prepare('UPDATE shared_sessions SET updated_at = ? WHERE id = ?').bind(now, sessionId),
  ]);
  return {
    id,
    mine: true,
    label: cleanLabel,
    text,
    writtenWith: caller.clientId,
    createdAt: iso(now),
  };
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
