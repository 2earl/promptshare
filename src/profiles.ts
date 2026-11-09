/**
 * Handles (docs/DESIGN.md §4): the only identity other 2earl users see. login gives services no
 * names or emails, so a user picks one here before publishing, inviting or joining.
 */

export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

/** Handles that could be mistaken for the service, its operator or staff. */
const RESERVED = new Set([
  'admin',
  'administrator',
  'anthropic',
  'claude',
  'help',
  'legal',
  'mod',
  'moderator',
  'official',
  'promptshare',
  'prompt-share',
  'root',
  'security',
  'staff',
  'support',
  'system',
  '2earl',
]);

export class ProfileError extends Error {
  override name = 'ProfileError';
}

export async function handleOf(db: D1Database, uid: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT handle FROM profiles WHERE uid = ?')
    .bind(uid)
    .first<{ handle: string }>();
  return row?.handle ?? null;
}

export function validateHandle(raw: string): string {
  const handle = raw.trim().toLowerCase().replace(/^@/, '');
  if (!HANDLE_PATTERN.test(handle)) {
    throw new ProfileError(
      'Use 3 to 30 lowercase letters, digits or hyphens, starting and ending with a letter or digit.',
    );
  }
  if (RESERVED.has(handle) || handle.includes('2earl') || handle.includes('promptshare')) {
    throw new ProfileError('That handle is reserved. Choose another.');
  }
  return handle;
}

/** Sets or changes the caller's handle. */
export async function setHandle(
  db: D1Database,
  uid: string,
  now: number,
  raw: string,
): Promise<string> {
  const handle = validateHandle(raw);
  const taken = await db
    .prepare('SELECT uid FROM profiles WHERE handle = ? AND uid != ?')
    .bind(handle, uid)
    .first<{ uid: string }>();
  if (taken) throw new ProfileError('That handle is taken. Choose another.');
  try {
    await db
      .prepare(
        `INSERT INTO profiles (uid, handle, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (uid) DO UPDATE SET handle = excluded.handle, updated_at = excluded.updated_at`,
      )
      .bind(uid, handle, now, now)
      .run();
  } catch (error) {
    // Someone took it between the check and the write.
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw new ProfileError('That handle is taken. Choose another.');
    }
    throw error;
  }
  return handle;
}
