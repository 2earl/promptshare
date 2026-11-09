import { decryptEntry } from './crypto';

/**
 * Moderation (docs/DESIGN.md §8, LEGAL.md §2–§4): the owner reviews reports and messages,
 * decides, and the affected user gets a statement of reasons (DSA Art. 17). Decisions are made by
 * a person; nothing here acts on a report automatically.
 */

export const RETENTION_SECONDS = 183 * 24 * 60 * 60; // about 6 months (LEGAL.md §4)
export const MODERATION_LIMITS = { explanation: 5_000, law: 300, suspendDaysMax: 365 } as const;

export type Action = 'none' | 'restrict' | 'remove' | 'suspend' | 'threat' | 'reverse';
export type Ground = 'illegal' | 'terms';

export const ACTIONS: Record<Action, string> = {
  none: 'No action',
  restrict: 'Restrict: make it private; it can’t be made public again',
  remove: 'Remove: hide it from everyone',
  suspend: 'Suspend the author’s publishing, and restrict this content',
  threat: 'Threat to life or safety: remove, keep as evidence, inform the police (Art. 18)',
  reverse: 'Reverse an earlier decision: restore the content, lift a suspension',
};

export class ModerationError extends Error {
  override name = 'ModerationError';
}

// ---- Messages and reports ---------------------------------------------------------------------

export interface Message {
  id: string;
  kind: 'contact' | 'report' | 'appeal';
  uid: string | null;
  name: string | null;
  email: string | null;
  contentUrl: string | null;
  category: string | null;
  body: string;
  goodFaith: boolean;
  createdAt: number;
  notifiedAt: number | null;
  decisionId: string | null;
  closedAt: number | null;
}

interface MessageRow {
  id: string;
  kind: Message['kind'];
  uid: string | null;
  name: string | null;
  email: string | null;
  content_url: string | null;
  category: string | null;
  body: string;
  good_faith: number;
  created_at: number;
  notified_at: number | null;
  decision_id: string | null;
  closed_at: number | null;
}

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  kind: row.kind,
  uid: row.uid,
  name: row.name,
  email: row.email,
  contentUrl: row.content_url,
  category: row.category,
  body: row.body,
  goodFaith: row.good_faith === 1,
  createdAt: row.created_at,
  notifiedAt: row.notified_at,
  decisionId: row.decision_id,
  closedAt: row.closed_at,
});

export async function listMessages(db: D1Database, open: boolean): Promise<Message[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM messages WHERE closed_at IS ${open ? 'NULL' : 'NOT NULL'}
       ORDER BY created_at ${open ? 'ASC' : 'DESC'} LIMIT 200`,
    )
    .all<MessageRow>();
  return results.map(toMessage);
}

export async function getMessage(db: D1Database, id: string): Promise<Message | null> {
  const row = await db.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<MessageRow>();
  return row ? toMessage(row) : null;
}

export async function closeMessage(db: D1Database, now: number, id: string): Promise<void> {
  await db
    .prepare('UPDATE messages SET closed_at = ? WHERE id = ? AND closed_at IS NULL')
    .bind(now, id)
    .run();
}

// ---- The content a report points at -----------------------------------------------------------

export type ReportedContent =
  | {
      type: 'prompt';
      id: string;
      title: string;
      body: string;
      ownerUid: string;
      ownerHandle: string | null;
      visibility: string;
      status: string;
    }
  | {
      type: 'entry';
      id: string;
      sessionId: string;
      sessionTitle: string;
      text: string;
      authorUid: string;
      authorHandle: string | null;
      removed: boolean;
    };

/** Finds what a report's link points at: `/p/<id>`, `/prompts/<id>`, or a session entry. */
export async function resolveContent(
  db: D1Database,
  secret: string,
  origin: string,
  link: string | null,
): Promise<ReportedContent | null> {
  if (!link || !URL.canParse(link)) return null;
  const url = new URL(link);
  if (url.origin !== origin) return null;
  const prompt = /^\/(?:p|prompts)\/([0-9a-f-]{36})\/?$/.exec(url.pathname);
  if (prompt) {
    const row = await db
      .prepare(
        `SELECT p.id, p.title, p.body, p.owner_uid, p.visibility, p.status, pr.handle
         FROM prompts p LEFT JOIN profiles pr ON pr.uid = p.owner_uid WHERE p.id = ?`,
      )
      .bind(prompt[1])
      .first<{
        id: string;
        title: string;
        body: string;
        owner_uid: string;
        visibility: string;
        status: string;
        handle: string | null;
      }>();
    return row
      ? {
          type: 'prompt',
          id: row.id,
          title: row.title,
          body: row.body,
          ownerUid: row.owner_uid,
          ownerHandle: row.handle,
          visibility: row.visibility,
          status: row.status,
        }
      : null;
  }
  const entry = /^\/sessions\/([0-9a-f-]{36})\/entries\/([0-9a-f-]{36})\/?$/.exec(url.pathname);
  if (entry) {
    const row = await db
      .prepare(
        `SELECT e.id, e.session_id, e.author_uid, e.iv, e.ciphertext, e.removed_at, s.title, pr.handle
         FROM session_entries e JOIN shared_sessions s ON s.id = e.session_id
         LEFT JOIN profiles pr ON pr.uid = e.author_uid
         WHERE e.id = ? AND e.session_id = ?`,
      )
      .bind(entry[2], entry[1])
      .first<{
        id: string;
        session_id: string;
        author_uid: string;
        iv: number[];
        ciphertext: number[];
        removed_at: number | null;
        title: string;
        handle: string | null;
      }>();
    if (!row) return null;
    return {
      type: 'entry',
      id: row.id,
      sessionId: row.session_id,
      sessionTitle: row.title,
      text: await decryptEntry(secret, row.session_id, row.id, row.iv, row.ciphertext),
      authorUid: row.author_uid,
      authorHandle: row.handle,
      removed: row.removed_at !== null,
    };
  }
  return null;
}

// ---- Decisions --------------------------------------------------------------------------------

export interface DecisionInput {
  messageId: string | null;
  content: ReportedContent | null;
  action: Action;
  ground: Ground | null;
  law: string;
  explanation: string;
  suspendDays: number;
}

export interface Decision {
  id: string;
  createdAt: number;
  contentType: 'prompt' | 'entry' | 'account' | 'none';
  contentId: string | null;
  sessionId: string | null;
  action: Action;
  ground: Ground | null;
  law: string | null;
  explanation: string;
  untilAt: number | null;
  contentTitle: string | null;
  reportBased: boolean;
}

function validate(input: DecisionInput): void {
  if (!(input.action in ACTIONS)) throw new ModerationError('Choose a decision.');
  if (!input.explanation.trim()) {
    throw new ModerationError(
      'Explain the decision: the author reads this as the statement of reasons.',
    );
  }
  if (input.explanation.length > MODERATION_LIMITS.explanation)
    throw new ModerationError('Shorten the explanation.');
  if (input.action !== 'none' && !input.content) {
    throw new ModerationError('This report’s link doesn’t point at content on Prompt share.');
  }
  // A reversal needs reasons, not a ground: it undoes a decision.
  if (input.action !== 'none' && input.action !== 'reverse') {
    if (!input.ground)
      throw new ModerationError('Choose the ground: illegal content, or the terms of use.');
    if (input.ground === 'illegal' && !input.law.trim()) {
      throw new ModerationError('Name the law the content breaks.');
    }
  }
  if (
    input.action === 'suspend' &&
    !(input.suspendDays >= 1 && input.suspendDays <= MODERATION_LIMITS.suspendDaysMax)
  ) {
    throw new ModerationError(`Suspend for 1 to ${String(MODERATION_LIMITS.suspendDaysMax)} days.`);
  }
}

const affectedOf = (content: ReportedContent | null) =>
  content ? (content.type === 'prompt' ? content.ownerUid : content.authorUid) : null;

/** Applies a decision, records its statement of reasons, and closes the report. */
export async function decide(db: D1Database, now: number, input: DecisionInput): Promise<string> {
  validate(input);
  const content = input.content;
  const affected = content
    ? content.type === 'prompt'
      ? content.ownerUid
      : content.authorUid
    : null;
  const id = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];

  const changes = input.action !== 'none' && input.action !== 'reverse';
  if (input.action === 'reverse' && content) {
    // Back to how it was before moderation; a prompt stays private until its owner republishes.
    statements.push(
      content.type === 'prompt'
        ? db
            .prepare("UPDATE prompts SET status = 'active', updated_at = ? WHERE id = ?")
            .bind(now, content.id)
        : db.prepare('UPDATE session_entries SET removed_at = NULL WHERE id = ?').bind(content.id),
    );
  }
  if (input.action === 'reverse' && affectedOf(content)) {
    statements.push(
      db
        .prepare('UPDATE profiles SET publishing_suspended_until = NULL WHERE uid = ?')
        .bind(affectedOf(content)),
    );
  }
  if (content?.type === 'prompt' && changes) {
    // restrict: private, never public again; remove and threat: hidden from everyone but kept.
    const status =
      input.action === 'restrict' || input.action === 'suspend' ? 'restricted' : 'removed';
    statements.push(
      db
        .prepare(
          "UPDATE prompts SET status = ?, visibility = 'private', published_at = NULL, updated_at = ? WHERE id = ?",
        )
        .bind(status, now, content.id),
    );
  }
  if (content?.type === 'entry' && changes) {
    statements.push(
      db.prepare('UPDATE session_entries SET removed_at = ? WHERE id = ?').bind(now, content.id),
    );
  }
  const untilAt = input.action === 'suspend' ? now + input.suspendDays * 24 * 60 * 60 : null;
  if (untilAt && affected) {
    statements.push(
      db
        .prepare('UPDATE profiles SET publishing_suspended_until = ? WHERE uid = ?')
        .bind(untilAt, affected),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO moderation_decisions
           (id, created_at, report_id, content_type, content_id, session_id, affected_uid, action, ground, law, explanation, until_at, content_title)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        now,
        input.messageId,
        content?.type ?? 'none',
        content?.id ?? null,
        content?.type === 'entry' ? content.sessionId : null,
        affected,
        input.action,
        input.action === 'none' || input.action === 'reverse' ? null : input.ground,
        input.ground === 'illegal' ? input.law.trim() : null,
        input.explanation.trim(),
        untilAt,
        content
          ? content.type === 'prompt'
            ? content.title
            : `Entry in “${content.sessionTitle}”`
          : null,
      ),
  );
  if (input.messageId) {
    statements.push(
      db.prepare('UPDATE messages SET closed_at = ? WHERE id = ?').bind(now, input.messageId),
    );
  }
  await db.batch(statements);
  return id;
}

interface DecisionRow {
  id: string;
  created_at: number;
  report_id: string | null;
  content_type: Decision['contentType'];
  content_id: string | null;
  session_id: string | null;
  action: Action;
  ground: Ground | null;
  law: string | null;
  explanation: string;
  until_at: number | null;
  content_title: string | null;
}

const toDecision = (row: DecisionRow): Decision => ({
  id: row.id,
  createdAt: row.created_at,
  contentType: row.content_type,
  contentId: row.content_id,
  sessionId: row.session_id,
  action: row.action,
  ground: row.ground,
  law: row.law,
  explanation: row.explanation,
  untilAt: row.until_at,
  contentTitle: row.content_title,
  reportBased: row.report_id !== null,
});

/** Decisions about the user's content: their statements of reasons. "No action" isn't shown. */
export async function decisionsAbout(db: D1Database, uid: string): Promise<Decision[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM moderation_decisions WHERE affected_uid = ? AND action != 'none' ORDER BY created_at DESC",
    )
    .bind(uid)
    .all<DecisionRow>();
  return results.map(toDecision);
}

export async function decisionAbout(
  db: D1Database,
  uid: string,
  id: string,
): Promise<Decision | null> {
  const row = await db
    .prepare(
      "SELECT * FROM moderation_decisions WHERE id = ? AND affected_uid = ? AND action != 'none'",
    )
    .bind(id, uid)
    .first<DecisionRow>();
  return row ? toDecision(row) : null;
}

export async function decisionById(db: D1Database, id: string): Promise<Decision | null> {
  const row = await db
    .prepare('SELECT * FROM moderation_decisions WHERE id = ?')
    .bind(id)
    .first<DecisionRow>();
  return row ? toDecision(row) : null;
}

/** Whether moderation suspended the user's publishing, and until when. */
export async function publishingSuspendedUntil(
  db: D1Database,
  uid: string,
  now: number,
): Promise<number | null> {
  const row = await db
    .prepare('SELECT publishing_suspended_until AS until FROM profiles WHERE uid = ?')
    .bind(uid)
    .first<{ until: number | null }>();
  return row?.until && row.until > now ? row.until : null;
}

/**
 * Daily retention (LEGAL.md §4): removed content, reports and decisions after about 6 months.
 * Content kept for a threat to life or safety is deleted only by hand, once the police have it.
 */
export async function moderationCleanup(db: D1Database, now: number): Promise<void> {
  const cutoff = now - RETENTION_SECONDS;
  await db.batch([
    db
      .prepare(
        `DELETE FROM prompts WHERE status = 'removed' AND updated_at < ? AND id NOT IN
           (SELECT content_id FROM moderation_decisions WHERE action = 'threat' AND content_id IS NOT NULL)`,
      )
      .bind(cutoff),
    db
      .prepare(
        `DELETE FROM session_entries WHERE removed_at IS NOT NULL AND removed_at < ? AND id NOT IN
           (SELECT content_id FROM moderation_decisions WHERE action = 'threat' AND content_id IS NOT NULL)`,
      )
      .bind(cutoff),
    db
      .prepare("DELETE FROM moderation_decisions WHERE created_at < ? AND action != 'threat'")
      .bind(cutoff),
    db.prepare('DELETE FROM messages WHERE COALESCE(closed_at, created_at) < ?').bind(cutoff),
  ]);
}

/** The decision that answered a report, if any. */
export async function decisionForMessage(
  db: D1Database,
  messageId: string,
): Promise<Decision | null> {
  const row = await db
    .prepare(
      'SELECT * FROM moderation_decisions WHERE report_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .bind(messageId)
    .first<DecisionRow>();
  return row ? toDecision(row) : null;
}

/** The content a decision was about, for an appeal against it. */
export async function contentOfDecision(
  db: D1Database,
  secret: string,
  origin: string,
  decision: Decision,
): Promise<ReportedContent | null> {
  if (decision.contentType === 'prompt' && decision.contentId) {
    return resolveContent(db, secret, origin, `${origin}/prompts/${decision.contentId}`);
  }
  if (decision.contentType === 'entry' && decision.contentId && decision.sessionId) {
    return resolveContent(
      db,
      secret,
      origin,
      `${origin}/sessions/${decision.sessionId}/entries/${decision.contentId}`,
    );
  }
  return null;
}
