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
      `SELECT e.id, e.author_uid, e.client_id, e.label, e.iv, e.ciphertext, e.size, e.created_at,
              pr.handle AS author
       FROM session_entries e LEFT JOIN profiles pr ON pr.uid = e.author_uid
       WHERE e.session_id = ? AND (e.created_at < ? OR (e.created_at = ? AND e.id < ?))
       ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
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
      author: string | null;
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
      author: row.author,
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
    author: null,
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
