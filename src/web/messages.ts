import { EmailMessage } from 'cloudflare:email';
import type { WebEnv } from './http';

/**
 * The contact form (the imprint's second fast channel, LEGAL.md §6) and reports of content
 * (DSA Art. 16, LEGAL.md §2). Stored first, then emailed to the owner when CONTACT_TO is set.
 */

export const MESSAGE_LIMITS = { name: 200, email: 254, url: 2_000, body: 10_000 } as const;
export const CATEGORIES = {
  illegal: 'It is illegal',
  terms: 'It breaks the terms of use',
  csam: 'It involves child sexual abuse',
} as const;
export type Category = keyof typeof CATEGORIES;

/** Deliberately plain: one @, a dot in the domain, no spaces or line breaks. */
const EMAIL = /^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]+$/;

export interface ContactInput {
  name: string;
  email: string;
  body: string;
}

export interface ReportInput {
  contentUrl: string;
  category: string;
  body: string;
  name: string;
  email: string;
  goodFaith: boolean;
}

export type Errors = Record<string, string>;

const tooLong = (value: string, max: number) => value.length > max;

export function validateContact(input: ContactInput): Errors {
  const errors: Errors = {};
  if (!EMAIL.test(input.email) || tooLong(input.email, MESSAGE_LIMITS.email)) {
    errors.email = 'Enter an email address we can answer.';
  }
  if (tooLong(input.name, MESSAGE_LIMITS.name)) errors.name = 'Shorten the name.';
  if (!input.body.trim()) errors.body = 'Write your message.';
  else if (tooLong(input.body, MESSAGE_LIMITS.body))
    errors.body = 'Shorten the message to 10,000 characters.';
  return errors;
}

/** DSA Art. 16(2): location, explanation, name and email (except for child sexual abuse), good faith. */
export function validateReport(input: ReportInput, siteOrigin: string): Errors {
  const errors: Errors = {};
  const url = URL.canParse(input.contentUrl) ? new URL(input.contentUrl) : null;
  if (!url || url.origin !== siteOrigin || tooLong(input.contentUrl, MESSAGE_LIMITS.url)) {
    errors.contentUrl = `Paste the link to the content, starting with ${siteOrigin}/.`;
  }
  if (!(input.category in CATEGORIES)) errors.category = 'Choose why you are reporting it.';
  if (!input.body.trim()) errors.body = 'Explain why the content is illegal or breaks the terms.';
  else if (tooLong(input.body, MESSAGE_LIMITS.body))
    errors.body = 'Shorten the explanation to 10,000 characters.';
  const anonymousAllowed = input.category === 'csam';
  if (!anonymousAllowed || input.email) {
    if (!EMAIL.test(input.email) || tooLong(input.email, MESSAGE_LIMITS.email)) {
      errors.email = anonymousAllowed
        ? 'Leave this empty, or enter an email address we can answer.'
        : 'Enter your email address, so we can tell you what we decided.';
    }
  }
  if (!anonymousAllowed && !input.name.trim()) errors.name = 'Enter your name.';
  if (tooLong(input.name, MESSAGE_LIMITS.name)) errors.name = 'Shorten the name.';
  if (!input.goodFaith)
    errors.goodFaith = 'Confirm that the report is accurate and made in good faith.';
  return errors;
}

export async function storeMessage(
  db: D1Database,
  now: number,
  message: {
    kind: 'contact' | 'report';
    uid: string | null;
    name: string;
    email: string;
    body: string;
    contentUrl?: string;
    category?: string;
    goodFaith?: boolean;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO messages (id, kind, uid, name, email, content_url, category, body, good_faith, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      message.kind,
      message.uid,
      message.name.trim() || null,
      message.email.trim() || null,
      message.contentUrl ?? null,
      message.category ?? null,
      message.body,
      message.goodFaith ? 1 : 0,
      now,
    )
    .run();
  return id;
}

/** No line breaks or control characters in a header value (header injection). */
function headerValue(value: string): string {
  // Control characters, CR and LF above all, can't reach a header.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}

/** A plain-text email as RFC 5322 text, the form Cloudflare's send_email binding takes. */
export function mimeMessage(input: {
  from: string;
  to: string;
  replyTo: string | null;
  subject: string;
  text: string;
  messageId: string;
  date: Date;
}): string {
  const subject = `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(headerValue(input.subject))))}?=`;
  const headers = [
    `From: Prompt share <${headerValue(input.from)}>`,
    `To: <${headerValue(input.to)}>`,
    ...(input.replyTo && EMAIL.test(input.replyTo)
      ? [`Reply-To: <${headerValue(input.replyTo)}>`]
      : []),
    `Subject: ${subject}`,
    `Message-ID: <${input.messageId}@promptshare.cc>`,
    `Date: ${input.date.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  // Normalise line endings; a lone "." line is fine over the binding (no SMTP dot-stuffing).
  return `${headers.join('\r\n')}\r\n\r\n${input.text.replace(/\r?\n/g, '\r\n')}\r\n`;
}

/** Emails the owner about a stored message. Failure leaves the message stored, unsent. */
export async function notifyOwner(
  env: WebEnv,
  now: number,
  id: string,
  message: {
    kind: 'contact' | 'report';
    name: string;
    email: string;
    body: string;
    contentUrl?: string;
    category?: string;
  },
): Promise<boolean> {
  if (!env.CONTACT_TO) return false;
  const from = 'promptshare@2earl.com';
  const lines =
    message.kind === 'report'
      ? [
          `Report ${id}`,
          `Content: ${message.contentUrl ?? ''}`,
          `Reason: ${message.category && message.category in CATEGORIES ? CATEGORIES[message.category as Category] : (message.category ?? '')}`,
          `From: ${message.name || '(no name)'} <${message.email || 'no email'}>`,
          '',
          message.body,
        ]
      : [
          `Message ${id}`,
          `From: ${message.name || '(no name)'} <${message.email}>`,
          '',
          message.body,
        ];
  try {
    await env.MAILER.send(
      new EmailMessage(
        from,
        env.CONTACT_TO,
        mimeMessage({
          from,
          to: env.CONTACT_TO,
          replyTo: message.email || null,
          subject:
            message.kind === 'report' ? 'Prompt share: new report' : 'Prompt share: new message',
          text: lines.join('\n'),
          messageId: id,
          date: new Date(now * 1000),
        }),
      ),
    );
    await env.DB.prepare('UPDATE messages SET notified_at = ? WHERE id = ?').bind(now, id).run();
    return true;
  } catch (error) {
    console.error('owner notification failed', error instanceof Error ? error.name : 'unknown');
    return false;
  }
}
