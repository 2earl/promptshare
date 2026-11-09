/**
 * Explicit consent for special categories of personal data (GDPR Art. 9(2)(a)): health, beliefs,
 * sexual orientation and the like, which people may choose to keep in their own prompts and
 * sessions. Asked once on the website, optional, withdrawable at any time.
 */

/** Bump when the wording below changes: users are asked again. */
export const SENSITIVE_CONSENT_VERSION = 1;

export const SENSITIVE_CONSENT_TEXT =
  'I explicitly consent to Prompt share storing health information and other special categories of personal data (Art. 9 GDPR) that I choose to save in my prompts and shared sessions, only to keep them for me and show them to the people I share them with. I can withdraw this consent at any time on my account page.';

export interface ConsentDecision {
  consented: boolean;
  version: number;
  decidedAt: number;
}

export async function sensitiveConsent(
  db: D1Database,
  uid: string,
): Promise<ConsentDecision | null> {
  const row = await db
    .prepare(
      "SELECT consented, version, decided_at FROM consents WHERE uid = ? AND kind = 'sensitive_data'",
    )
    .bind(uid)
    .first<{ consented: number; version: number; decided_at: number }>();
  return row
    ? { consented: row.consented === 1, version: row.version, decidedAt: row.decided_at }
    : null;
}

/** Whether the user still needs to be asked: never decided, or decided on older wording. */
export function needsAsking(decision: ConsentDecision | null): boolean {
  return decision === null || decision.version < SENSITIVE_CONSENT_VERSION;
}

export async function recordSensitiveConsent(
  db: D1Database,
  uid: string,
  now: number,
  consented: boolean,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO consents (uid, kind, consented, version, decided_at) VALUES (?, 'sensitive_data', ?, ?, ?)
       ON CONFLICT (uid, kind) DO UPDATE SET consented = excluded.consented, version = excluded.version,
         decided_at = excluded.decided_at`,
    )
    .bind(uid, consented ? 1 : 0, SENSITIVE_CONSENT_VERSION, now)
    .run();
}
