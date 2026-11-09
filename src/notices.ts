import { EmailMessage } from 'cloudflare:email';
import { ACTIONS, type Decision, type Message } from './moderation';
import { mimeMessage, type ReportInput } from './web/messages';

/**
 * Emails about reports and messages (LEGAL.md §2):
 * - to reporters, when the owner has turned it on (needs Workers Paid; settings.ts): the
 *   confirmation of receipt (DSA Art. 16(4)) and the decision (Art. 16(5));
 * - to the owner, a reminder when a message is still open after 30 minutes (the imprint's
 *   second channel must be answered quickly). The owner's address is a verified destination, so
 *   this works on the free plan.
 */

const SENDER = { email: 'noreply@promptshare.cc', name: 'Prompt share' };
const REPLY_TO = 'legal@2earl.com';
export const REMINDER_AFTER_SECONDS = 30 * 60;
export const RECEIPTS_PER_ADDRESS_PER_DAY = 3;

/** The decision as the reporter reads it. Also the body of the owner's prepared email. */
export function decisionText(
  message: Pick<Message, 'id' | 'name' | 'contentUrl'>,
  decision: Decision,
): string {
  return [
    `Hello${message.name ? ` ${message.name}` : ''},`,
    '',
    `thank you for your report of ${message.contentUrl ?? 'content on Prompt share'} (reference ${message.id}).`,
    '',
    `Our decision: ${ACTIONS[decision.action]}.`,
    decision.explanation,
    '',
    'The decision was made by a person, not by automated means. If you disagree, reply to this email.',
    'You can also turn to an out-of-court dispute settlement body or a court.',
    '',
    'Prompt share (2earl)',
  ].join('\n');
}

export function receiptText(id: string, report: Pick<ReportInput, 'name' | 'contentUrl'>): string {
  return [
    `Hello${report.name ? ` ${report.name}` : ''},`,
    '',
    `we received your report of ${report.contentUrl} (reference ${id}).`,
    'A person will review it, and we will email you our decision.',
    '',
    'Prompt share (2earl)',
  ].join('\n');
}

/** Sends one email to a reporter. Failures are logged and leave the report as it is. */
async function toReporter(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  try {
    await env.MAILER.send({ to, from: SENDER, replyTo: REPLY_TO, subject, text });
    return true;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    console.error('reporter email failed', typeof code === 'string' ? code : 'unknown');
    return false;
  }
}

export async function sendReceipt(
  env: Env,
  now: number,
  id: string,
  report: Pick<ReportInput, 'name' | 'email' | 'contentUrl'>,
): Promise<boolean> {
  if (!report.email) return false;
  // The form takes any address, so it could be used to mail a stranger: at most a few receipts
  // per address a day.
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM messages WHERE email = ? AND receipt_sent_at > ?',
  )
    .bind(report.email, now - 24 * 60 * 60)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= RECEIPTS_PER_ADDRESS_PER_DAY) return false;
  const sent = await toReporter(
    env,
    report.email,
    'Your report to Prompt share',
    receiptText(id, report),
  );
  if (sent)
    await env.DB.prepare('UPDATE messages SET receipt_sent_at = ? WHERE id = ?')
      .bind(now, id)
      .run();
  return sent;
}

export async function sendDecision(
  env: Env,
  now: number,
  message: Message,
  decision: Decision,
): Promise<boolean> {
  if (!message.email) return false;
  const sent = await toReporter(
    env,
    message.email,
    'Our decision on your report',
    decisionText(message, decision),
  );
  if (sent)
    await env.DB.prepare('UPDATE messages SET decision_sent_at = ? WHERE id = ?')
      .bind(now, message.id)
      .run();
  return sent;
}

/**
 * Every few minutes (cron): one email to the owner listing messages still open 30 minutes after
 * they arrived. Each message is reminded about once.
 */
export async function remindOwner(
  env: Env & { CONTACT_TO?: string },
  now: number,
): Promise<number> {
  if (!env.CONTACT_TO) return 0;
  const { results } = await env.DB.prepare(
    `SELECT id, kind, created_at FROM messages
     WHERE closed_at IS NULL AND reminded_at IS NULL AND created_at <= ? ORDER BY created_at LIMIT 50`,
  )
    .bind(now - REMINDER_AFTER_SECONDS)
    .all<{ id: string; kind: string; created_at: number }>();
  if (results.length === 0) return 0;
  const lines = results.map(
    (m) =>
      `- ${m.kind} ${m.id}, received ${new Date(m.created_at * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  );
  const from = 'promptshare@2earl.com';
  try {
    await env.MAILER.send(
      new EmailMessage(
        from,
        env.CONTACT_TO,
        mimeMessage({
          from,
          to: env.CONTACT_TO,
          replyTo: null,
          subject: `Prompt share: ${String(results.length)} unanswered for 30 minutes`,
          text: [
            'These are still open. Answer or close them at https://promptshare.cc/admin',
            '',
            ...lines,
          ].join('\n'),
          messageId: crypto.randomUUID(),
          date: new Date(now * 1000),
        }),
      ),
    );
  } catch (error) {
    console.error('reminder failed', error instanceof Error ? error.name : 'unknown');
    return 0;
  }
  await env.DB.batch(
    results.map((m) =>
      env.DB.prepare('UPDATE messages SET reminded_at = ? WHERE id = ?').bind(now, m.id),
    ),
  );
  return results.length;
}
