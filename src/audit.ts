/** Security log (docs/DESIGN.md §7): names of actions and IDs, never prompt or session content. */

export type AuditEvent =
  | 'prompt.created'
  | 'prompt.updated'
  | 'prompt.unpublished'
  | 'prompt.deleted'
  | 'prompt.copied'
  | 'prompt.shared'
  | 'prompt.unshared'
  | 'session.created'
  | 'session.entry_added'
  | 'session.entry_refused'
  | 'user.deleted';

export const AUDIT_RETENTION_SECONDS = 90 * 24 * 60 * 60;

export async function audit(
  db: D1Database,
  now: number,
  event: AuditEvent,
  fields: { actorUserId?: string; clientId?: string; detail?: Record<string, unknown> } = {},
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO audit_events (id, at, event, actor_user_id, client_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      crypto.randomUUID(),
      now,
      event,
      fields.actorUserId ?? null,
      fields.clientId ?? null,
      fields.detail ? JSON.stringify(fields.detail) : null,
    )
    .run();
}
