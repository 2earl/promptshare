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
    db.prepare('UPDATE session_entries SET assignee_uid = NULL WHERE assignee_uid = ?').bind(uid),
    db.prepare('DELETE FROM prompt_shares WHERE owner_uid = ?1 OR recipient_uid = ?1').bind(uid),
    db.prepare('DELETE FROM share_misses WHERE uid = ?').bind(uid),
    db.prepare('DELETE FROM share_locks WHERE uid = ?').bind(uid),
    db.prepare('DELETE FROM prompts WHERE owner_uid = ?').bind(uid),
    db.prepare('DELETE FROM web_sessions WHERE uid = ?').bind(uid),
    db.prepare('DELETE FROM profiles WHERE uid = ?').bind(uid),
    db.prepare('DELETE FROM consents WHERE uid = ?').bind(uid),
    // Statements of reasons stay for their retention period (LEGAL.md §4), no longer saying who.
    db
      .prepare('UPDATE moderation_decisions SET affected_uid = NULL WHERE affected_uid = ?')
      .bind(uid),
    db.prepare('DELETE FROM invitations WHERE created_by = ?').bind(uid),
    db.prepare('UPDATE invitations SET used_by = NULL WHERE used_by = ?').bind(uid),
    // Messages and reports stay for their retention period (LEGAL.md §4), no longer saying who.
    db.prepare('UPDATE messages SET uid = NULL WHERE uid = ?').bind(uid),
    db
      .prepare('UPDATE audit_events SET actor_user_id = ? WHERE actor_user_id = ?')
      .bind(replacement, uid),
  ]);
  const left = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM prompts WHERE owner_uid = ?1)
            + (SELECT COUNT(*) FROM shared_sessions WHERE owner_uid = ?1)
            + (SELECT COUNT(*) FROM session_members WHERE uid = ?1)
            + (SELECT COUNT(*) FROM session_entries WHERE author_uid = ?1 OR assignee_uid = ?1)
            + (SELECT COUNT(*) FROM audit_events WHERE actor_user_id = ?1)
            + (SELECT COUNT(*) FROM web_sessions WHERE uid = ?1)
            + (SELECT COUNT(*) FROM profiles WHERE uid = ?1)
            + (SELECT COUNT(*) FROM consents WHERE uid = ?1)
            + (SELECT COUNT(*) FROM prompt_shares WHERE owner_uid = ?1 OR recipient_uid = ?1)
            + (SELECT COUNT(*) FROM share_misses WHERE uid = ?1)
            + (SELECT COUNT(*) FROM share_locks WHERE uid = ?1)
            + (SELECT COUNT(*) FROM moderation_decisions WHERE affected_uid = ?1)
            + (SELECT COUNT(*) FROM invitations WHERE created_by = ?1 OR used_by = ?1)
            + (SELECT COUNT(*) FROM messages WHERE uid = ?1) AS n`,
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
  const [prompts, memberships, entries, events, messages] = await db.batch<Record<string, unknown>>(
    [
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
          `SELECT e.id, e.session_id, e.author_uid, e.client_id, e.kind, e.reply_to, e.task_status, e.label, e.iv, e.ciphertext, e.created_at
         FROM session_entries e JOIN shared_sessions s ON s.id = e.session_id
         WHERE s.owner_uid = ?1 OR e.author_uid = ?1 ORDER BY e.created_at`,
        )
        .bind(uid),
      db
        .prepare(
          'SELECT at, event, client_id, detail FROM audit_events WHERE actor_user_id = ? ORDER BY at',
        )
        .bind(uid),
      // Contact messages and reports sent while signed in.
      db
        .prepare(
          'SELECT kind, name, email, content_url, category, body, created_at FROM messages WHERE uid = ? ORDER BY created_at',
        )
        .bind(uid),
    ],
  );

  const decrypted = [];
  for (const row of entries?.results ?? []) {
    decrypted.push({
      session: row.session_id,
      id: row.id,
      writtenBy: row.author_uid === uid ? 'you' : 'another member',
      writtenWith: row.client_id,
      kind: row.kind,
      replyTo: row.reply_to,
      taskStatus: row.task_status,
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
    handle:
      (
        await db
          .prepare('SELECT handle FROM profiles WHERE uid = ?')
          .bind(uid)
          .first<{ handle: string }>()
      )?.handle ?? null,
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
    messages: (messages?.results ?? []).map((row) => ({
      kind: row.kind,
      name: row.name,
      email: row.email,
      contentUrl: row.content_url,
      category: row.category,
      text: row.body,
      sentAt: iso(row.created_at as number),
    })),
    // The addresses you shared your prompts with, and prompts others shared with you.
    promptShares: (
      await db
        .prepare(
          'SELECT prompt_id, email, created_at FROM prompt_shares WHERE owner_uid = ? ORDER BY created_at',
        )
        .bind(uid)
        .all()
    ).results.map((row) => ({
      prompt: row.prompt_id,
      sharedWith: row.email,
      sharedAt: iso(row.created_at as number),
    })),
    promptsSharedWithYou: (
      await db
        .prepare(
          'SELECT prompt_id, created_at FROM prompt_shares WHERE recipient_uid = ? ORDER BY created_at',
        )
        .bind(uid)
        .all()
    ).results.map((row) => ({ prompt: row.prompt_id, sharedAt: iso(row.created_at as number) })),
    consents: (
      await db
        .prepare('SELECT kind, consented, version, decided_at FROM consents WHERE uid = ?')
        .bind(uid)
        .all()
    ).results,
    moderationDecisions: (
      await db
        .prepare(
          `SELECT created_at, content_type, content_title, action, ground, law, explanation, until_at
           FROM moderation_decisions WHERE affected_uid = ? ORDER BY created_at`,
        )
        .bind(uid)
        .all()
    ).results,
    notes: [
      'sessionEntries has every entry in the sessions you own, and the entries you wrote in other people’s sessions. Entries of kind "brief" are versions of a session’s brief.',
      'Other members are not named: Prompt share shows you only what you can already see.',
      'Security log entries are kept for 90 days and never contain prompt or session text.',
    ],
  };
}
