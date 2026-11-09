import { audit } from './audit';
import { decryptEntry } from './crypto';

/**
 * What login calls when an account is deleted or exported (docs/DESIGN.md §7.2), through the
 * `AccountEvents` entrypoint.
 */

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Deletes everything about `uid`. Idempotent; throws if anything remains, so login retries. */
export async function deleteUserData(db: D1Database, uid: string, now: number): Promise<void> {
  const owned = 'SELECT id FROM shared_sessions WHERE owner_uid = ?';
  // Security-log entries stay for their 90 days, no longer saying who.
  const replacement = `deleted:${crypto.randomUUID()}`;
  await db.batch([
    db.prepare(`DELETE FROM session_entries WHERE session_id IN (${owned})`).bind(uid),
    db.prepare(`DELETE FROM session_members WHERE session_id IN (${owned})`).bind(uid),
    db.prepare('DELETE FROM shared_sessions WHERE owner_uid = ?').bind(uid),
    db.prepare('DELETE FROM session_entries WHERE author_uid = ?').bind(uid),
    db.prepare('DELETE FROM session_members WHERE uid = ?').bind(uid),
    db.prepare('DELETE FROM prompts WHERE owner_uid = ?').bind(uid),
    db
      .prepare('UPDATE audit_events SET actor_user_id = ? WHERE actor_user_id = ?')
      .bind(replacement, uid),
  ]);
  const left = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM prompts WHERE owner_uid = ?1)
            + (SELECT COUNT(*) FROM shared_sessions WHERE owner_uid = ?1)
            + (SELECT COUNT(*) FROM session_members WHERE uid = ?1)
            + (SELECT COUNT(*) FROM session_entries WHERE author_uid = ?1)
            + (SELECT COUNT(*) FROM audit_events WHERE actor_user_id = ?1) AS n`,
    )
    .bind(uid)
    .first<{ n: number }>();
  if ((left?.n ?? 0) > 0) throw new Error('user data remains after deletion');
  await audit(db, now, 'user.deleted', { actorUserId: replacement });
}

/** Everything about `uid`, for "Download your data". Session entries are decrypted. */
export async function exportUserData(
  db: D1Database,
  secret: string,
  uid: string,
): Promise<Record<string, unknown>> {
  const [prompts, memberships, entries, events] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT id, title, description, body, tags, models, visibility, status, copied_from,
                created_at, updated_at, published_at
         FROM prompts WHERE owner_uid = ? ORDER BY created_at`,
      )
      .bind(uid),
    db
      .prepare(
        `SELECT s.id, s.title, m.role, m.added_at, s.created_at FROM session_members m
         JOIN shared_sessions s ON s.id = m.session_id WHERE m.uid = ? ORDER BY s.created_at`,
      )
      .bind(uid),
    // Every entry in sessions the user owns, and the user's own entries everywhere else.
    db
      .prepare(
        `SELECT e.id, e.session_id, e.author_uid, e.client_id, e.label, e.iv, e.ciphertext, e.created_at
         FROM session_entries e JOIN shared_sessions s ON s.id = e.session_id
         WHERE s.owner_uid = ?1 OR e.author_uid = ?1 ORDER BY e.created_at`,
      )
      .bind(uid),
    db
      .prepare(
        'SELECT at, event, client_id, detail FROM audit_events WHERE actor_user_id = ? ORDER BY at',
      )
      .bind(uid),
  ]);

  const decrypted = [];
  for (const row of entries?.results ?? []) {
    decrypted.push({
      session: row.session_id,
      id: row.id,
      writtenBy: row.author_uid === uid ? 'you' : 'another member',
      writtenWith: row.client_id,
      label: row.label,
      text: await decryptEntry(
        secret,
        row.session_id as string,
        row.id as string,
        row.iv as number[],
        row.ciphertext as number[],
      ),
      createdAt: iso(row.created_at as number),
    });
  }

  return {
    service: 'Prompt share',
    prompts: (prompts?.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      body: row.body,
      tags: JSON.parse(row.tags as string) as unknown,
      models: JSON.parse(row.models as string) as unknown,
      visibility: row.visibility,
      status: row.status,
      copiedFrom: row.copied_from,
      createdAt: iso(row.created_at as number),
      updatedAt: iso(row.updated_at as number),
    })),
    sharedSessions: (memberships?.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      yourRole: row.role,
      joinedAt: iso(row.added_at as number),
    })),
    sessionEntries: decrypted,
    securityLog: (events?.results ?? []).map((row) => ({
      at: iso(row.at as number),
      event: row.event,
      clientId: row.client_id,
      detail: typeof row.detail === 'string' ? (JSON.parse(row.detail) as unknown) : null,
    })),
    notes: [
      'sessionEntries has every entry in the sessions you own, and the entries you wrote in other people’s sessions.',
      'Other members are not named: Prompt share shows you only what you can already see.',
      'Security log entries are kept for 90 days and never contain prompt or session text.',
    ],
  };
}
