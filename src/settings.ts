/** Switches the owner manages on the moderation page (docs/DESIGN.md §8). */

export const SETTINGS = {
  /**
   * Email reporters a confirmation of receipt and the decision (DSA Art. 16(4), 16(5)) from
   * noreply@promptshare.cc. Needs the Workers Paid plan and promptshare.cc onboarded to Email
   * Sending; off until the owner turns it on.
   */
  emailReporters: 'email_reporters',
} as const;

export async function isOn(db: D1Database, key: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value === 'on';
}

export async function setSwitch(
  db: D1Database,
  key: string,
  on: boolean,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, on ? 'on' : 'off', now)
    .run();
}
