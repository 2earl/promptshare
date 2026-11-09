import { audit } from './audit';
import { PromptError, getPrompt } from './prompts';

/**
 * Sharing a private prompt with chosen people by email (docs/DESIGN.md §4.1). Only on the
 * website (D7): no tool shares, so text an assistant reads can't send a prompt to anyone.
 *
 * login finds the account for an address (`PromptshareDirectory`). An address without one is
 * refused (the owner's decision), which tells the author that the address has no account. So
 * misses are limited: 3 within an hour lock sharing for 10 minutes, each further lock doubles
 * (at most a day), and 20 misses in a day lock it for the rest of that day.
 */

export const SHARE_LIMITS = {
  recipientsPerPrompt: 50,
  sharesPerDay: 200,
  missesPerHour: 3,
  missesPerDay: 20,
  firstLockSeconds: 10 * 60,
  longestLockSeconds: 24 * 60 * 60,
} as const;

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export class ShareError extends PromptError {
  override name = 'ShareError';
}

export interface Share {
  id: string;
  email: string;
  createdAt: number;
}

interface Directory {
  uidForEmail(email: string): Promise<string | null>;
}

export function normaliseEmail(email: string): string | null {
  const address = email.trim().toLowerCase();
  if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  return address;
}

function minutes(seconds: number): string {
  const m = Math.ceil(seconds / 60);
  return m >= 120 ? `${String(Math.ceil(m / 60))} hours` : `${String(m)} minutes`;
}

/** When the author may share again, if sharing is locked now. */
export async function lockedUntil(
  db: D1Database,
  uid: string,
  now: number,
): Promise<number | null> {
  const lock = await db
    .prepare('SELECT locked_until FROM share_locks WHERE uid = ?')
    .bind(uid)
    .first<{ locked_until: number }>();
  return lock && lock.locked_until > now ? lock.locked_until : null;
}

/** Records an address without an account; locks sharing when there were too many. */
async function recordMiss(db: D1Database, uid: string, now: number): Promise<number | null> {
  await db.prepare('INSERT INTO share_misses (uid, at) VALUES (?, ?)').bind(uid, now).run();
  const lock = await db
    .prepare('SELECT level, locked_until FROM share_locks WHERE uid = ?')
    .bind(uid)
    .first<{ level: number; locked_until: number }>();
  // Misses since the last lock ended count towards the next one, within the hour.
  const from = Math.max(now - HOUR, lock?.locked_until ?? 0);
  const counts = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM share_misses WHERE uid = ?1 AND at >= ?2) AS hour,
              (SELECT COUNT(*) FROM share_misses WHERE uid = ?1 AND at > ?3) AS day,
              (SELECT MIN(at) FROM share_misses WHERE uid = ?1 AND at > ?3) AS first`,
    )
    .bind(uid, from, now - DAY)
    .first<{ hour: number; day: number; first: number | null }>();
  // A quiet day since the last lock starts the doubling again.
  const level = lock && lock.locked_until > now - DAY ? lock.level : 0;
  let until: number;
  let nextLevel = level;
  if ((counts?.day ?? 0) >= SHARE_LIMITS.missesPerDay) {
    until = (counts?.first ?? now) + DAY;
  } else if ((counts?.hour ?? 0) >= SHARE_LIMITS.missesPerHour) {
    nextLevel = level + 1;
    until =
      now + Math.min(SHARE_LIMITS.firstLockSeconds * 2 ** level, SHARE_LIMITS.longestLockSeconds);
  } else {
    return null;
  }
  await db
    .prepare(
      `INSERT INTO share_locks (uid, level, locked_until) VALUES (?1, ?2, ?3)
       ON CONFLICT (uid) DO UPDATE SET level = ?2, locked_until = ?3`,
    )
    .bind(uid, nextLevel, until)
    .run();
  return until;
}

/** The people the author shared this prompt with: the addresses they typed. */
export async function listShares(db: D1Database, uid: string, promptId: string): Promise<Share[]> {
  const { results } = await db
    .prepare(
      `SELECT id, email, created_at FROM prompt_shares WHERE prompt_id = ? AND owner_uid = ?
       ORDER BY created_at`,
    )
    .bind(promptId, uid)
    .all<{ id: string; email: string; created_at: number }>();
  return results.map((r) => ({ id: r.id, email: r.email, createdAt: r.created_at }));
}

export async function sharePrompt(
  env: Env,
  uid: string,
  now: number,
  promptId: string,
  email: string,
): Promise<Share | null> {
  const db = env.DB;
  const prompt = await getPrompt(db, uid, promptId);
  if (!prompt?.mine) return null;
  if (prompt.visibility === 'public') {
    throw new ShareError('This prompt is public: every 2earl user can see it already.');
  }
  if (prompt.status !== 'active') {
    throw new ShareError('This prompt was restricted by moderation and can’t be shared.');
  }
  if (!prompt.author) throw new ShareError('Choose a handle first: it is shown as who shared it.');
  const address = normaliseEmail(email);
  if (!address) throw new ShareError('Enter one email address.');

  const locked = await lockedUntil(db, uid, now);
  if (locked) {
    throw new ShareError(
      `Too many addresses without a 2earl account. You can share again in ${minutes(locked - now)}.`,
    );
  }
  const counts = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM prompt_shares WHERE prompt_id = ?1) AS recipients,
              (SELECT COUNT(*) FROM prompt_shares WHERE owner_uid = ?2 AND created_at > ?3) AS today`,
    )
    .bind(promptId, uid, now - DAY)
    .first<{ recipients: number; today: number }>();
  if ((counts?.recipients ?? 0) >= SHARE_LIMITS.recipientsPerPrompt) {
    throw new ShareError(
      `A prompt can be shared with at most ${String(SHARE_LIMITS.recipientsPerPrompt)} people.`,
    );
  }
  if ((counts?.today ?? 0) >= SHARE_LIMITS.sharesPerDay) {
    throw new ShareError(
      `You shared ${String(SHARE_LIMITS.sharesPerDay)} times today, the most in a day. Try again tomorrow.`,
    );
  }

  const recipient = await (env.DIRECTORY as unknown as Directory).uidForEmail(address);
  if (!recipient) {
    const lock = await recordMiss(db, uid, now);
    throw new ShareError(
      lock
        ? `No 2earl account uses this address. Too many addresses without an account: you can share again in ${minutes(lock - now)}.`
        : 'No 2earl account uses this address. Check it, or ask which address they sign in with.',
    );
  }
  if (recipient === uid) throw new ShareError('That’s your own address.');

  const share = { id: crypto.randomUUID(), email: address, createdAt: now };
  const { meta } = await db
    .prepare(
      `INSERT INTO prompt_shares (id, prompt_id, owner_uid, recipient_uid, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (prompt_id, recipient_uid) DO NOTHING`,
    )
    .bind(share.id, promptId, uid, recipient, address, now)
    .run();
  if (meta.changes === 0) throw new ShareError('It’s already shared with this person.');
  await audit(db, now, 'prompt.shared', { actorUserId: uid, detail: { prompt: promptId } });
  return share;
}

/** The author stops sharing with one person. */
export async function unsharePrompt(
  db: D1Database,
  uid: string,
  now: number,
  promptId: string,
  shareId: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare('DELETE FROM prompt_shares WHERE id = ? AND prompt_id = ? AND owner_uid = ?')
    .bind(shareId, promptId, uid)
    .run();
  if (meta.changes > 0) {
    await audit(db, now, 'prompt.unshared', { actorUserId: uid, detail: { prompt: promptId } });
  }
  return meta.changes > 0;
}

/** A recipient removes a prompt shared with them from their list. */
export async function dismissShare(
  db: D1Database,
  uid: string,
  promptId: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare('DELETE FROM prompt_shares WHERE prompt_id = ? AND recipient_uid = ?')
    .bind(promptId, uid)
    .run();
  return meta.changes > 0;
}

/** Daily: misses older than a day no longer count. */
export async function shareCleanup(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM share_misses WHERE at <= ?').bind(now - DAY),
    db.prepare('DELETE FROM share_locks WHERE locked_until <= ?').bind(now - DAY),
  ]);
}
