/**
 * How Prompt share's emails look (LEGAL.md §2): the same design as login.2earl.com's
 * (2earl/login src/mail.ts) and as these web pages: the four-colour band, the wordmark, one
 * vermilion button, light and dark. Each message is written once, as a `Mail`, and rendered as
 * plain text and HTML. No images, no remote fonts or styles, nothing that tracks; only our own
 * addresses (promptshare.cc, 2earl.com) become links.
 */

const SITE = 'https://promptshare.cc';

/** The web pages' tokens (public/app.css), for clients that can't read a stylesheet. */
const C = {
  red: '#ed1c24',
  vermilion: '#f15a24',
  orange: '#f7931e',
  amber: '#fbb03b',
  bg: '#f7f7f8',
  surface: '#ffffff',
  fg: '#1c1b1f',
  muted: '#5c5a60',
  rule: '#e2e1e5',
  link: '#b23a0c',
  alert: '#c8141b',
};
const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export interface Mail {
  subject: string;
  /** The line inboxes show after the subject. */
  preview: string;
  heading: string;
  /** Paragraphs before the code or the button. */
  body: string[];
  /** A one-time code, set large. */
  code?: string;
  /** The one thing to do: a button in HTML, a labelled link in text. Our own addresses only. */
  action?: { label: string; url: string; showAddress?: boolean };
  /** What happened, when and from where: a small table. */
  facts?: [string, string][] | undefined;
  /** Paragraphs after it, in small print. */
  after?: string[];
  /** Highlight the heading as a warning (security changes). */
  alert?: boolean;
  /** Why this address got the email, for the footer. */
  reason: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const OWN_URL =
  /https:\/\/(?:[a-z0-9-]+\.)*(?:2earl\.com|promptshare\.cc)(?:\/(?:[^\s<>"']*[^\s<>"'.,;:!?)])?)?/g;

/** Our own https links become links; everything else is text. A full stop or comma after a
 * link ends the sentence, not the address. */
const linkify = (escaped: string) =>
  escaped.replace(
    OWN_URL,
    (url) =>
      `<a href="${url}" class="link" style="color:${C.link};text-decoration:underline">${url}</a>`,
  );

function isOwnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      ['2earl.com', 'promptshare.cc'].some(
        (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}

// ---- Text -------------------------------------------------------------------------------------

export function mailText(mail: Mail): string {
  const lines: string[] = [mail.heading, ''];
  for (const p of mail.body) lines.push(p, '');
  // The code on its own indented line, so it is easy to find and copy.
  if (mail.code) lines.push(`    ${mail.code}`, '');
  if (mail.action) lines.push(`${mail.action.label}:`, mail.action.url, '');
  if (mail.facts?.length) {
    for (const [label, value] of mail.facts) lines.push(`${label}: ${value}`);
    lines.push('');
  }
  for (const p of mail.after ?? []) lines.push(p, '');
  lines.push('—', `Prompt share by 2earl · ${SITE}`, mail.reason);
  return lines.join('\n');
}

// ---- HTML -------------------------------------------------------------------------------------

/** The band across the top of every page, in the mark's four colours. */
function band(): string {
  const cell = (color: string) =>
    `<td height="5" style="height:5px;line-height:5px;font-size:0;background:${color}">&nbsp;</td>`;
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">' +
    `<tr>${cell(C.red)}${cell(C.vermilion)}${cell(C.orange)}${cell(C.amber)}</tr></table>`
  );
}

/** The wordmark, as on the web pages' header; the band below carries the mark's colours. */
function wordmark(): string {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    `<td valign="middle" class="fg" style="font:700 22px/1 ${FONT};color:${C.fg};letter-spacing:-0.02em">Prompt share</td>` +
    `<td valign="middle" class="muted" style="padding:2px 0 0 10px;font:400 14px/1 ${FONT};color:${C.muted}">by 2earl</td>` +
    '</tr></table>'
  );
}

function paragraph(text: string, small = false): string {
  return `<p class="${small ? 'muted' : 'fg'}" style="margin:0 0 ${small ? '10' : '16'}px;font:${small ? '400 14px/1.55' : '400 16px/1.6'} ${FONT};color:${small ? C.muted : C.fg}">${linkify(escapeHtml(text))}</p>`;
}

function codeBlock(code: string): string {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px"><tr>' +
    `<td class="code" style="padding:14px 22px;background:${C.bg};border:1px solid ${C.rule};border-radius:10px;font:600 30px/1 ui-monospace,'SF Mono',Menlo,Consolas,monospace;letter-spacing:6px;color:${C.fg}">${escapeHtml(code)}</td>` +
    '</tr></table>'
  );
}

/** A button that works in Outlook too: the cell carries the colour, the link the click. */
function button(label: string, url: string, showAddress: boolean): string {
  if (!isOwnUrl(url)) return paragraph(`${label}: ${url}`);
  const href = escapeHtml(url);
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px"><tr>' +
    `<td bgcolor="${C.vermilion}" style="background:${C.vermilion};border-radius:10px">` +
    `<a href="${href}" style="display:inline-block;padding:13px 22px;font:600 15px/1 ${FONT};color:${C.fg};text-decoration:none;border-radius:10px">${escapeHtml(label)}</a>` +
    '</td></tr></table>' +
    (showAddress
      ? `<p class="muted" style="margin:0 0 24px;font:400 13px/1.5 ${FONT};color:${C.muted};word-break:break-all">Or paste this address into your browser: <a href="${href}" class="link" style="color:${C.link}">${href}</a></p>`
      : '<div style="height:12px;line-height:12px;font-size:0">&nbsp;</div>')
  );
}

function factsTable(facts: [string, string][]): string {
  const rows = facts
    .map(
      ([label, value], i) =>
        `<tr><td class="muted" style="padding:10px 16px 10px 0;${i ? `border-top:1px solid ${C.rule};` : ''}font:400 14px/1.4 ${FONT};color:${C.muted};white-space:nowrap;width:1%" valign="top">${escapeHtml(label)}</td>` +
        `<td class="fg" style="padding:10px 0;${i ? `border-top:1px solid ${C.rule};` : ''}font:600 14px/1.4 ${FONT};color:${C.fg}">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="facts" style="margin:4px 0 24px;border-collapse:collapse;border-top:1px solid ${C.rule};border-bottom:1px solid ${C.rule}">${rows}</table>`;
}

export function mailHtml(mail: Mail): string {
  const footerLinks = [
    `<a href="${SITE}" class="muted" style="color:${C.muted}">Prompt share</a>`,
    `<a href="https://2earl.com/privacy" class="muted" style="color:${C.muted}">Privacy</a>`,
    `<a href="https://2earl.com/imprint" class="muted" style="color:${C.muted}">Imprint</a>`,
  ]
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ');
  const content =
    `<h1 class="${mail.alert ? 'alert' : 'fg'}" style="margin:0 0 16px;font:600 22px/1.3 ${FONT};color:${mail.alert ? C.alert : C.fg};letter-spacing:-0.01em">${escapeHtml(mail.heading)}</h1>` +
    mail.body.map((p) => paragraph(p)).join('') +
    (mail.code ? codeBlock(mail.code) : '') +
    (mail.action
      ? button(mail.action.label, mail.action.url, mail.action.showAddress === true)
      : '') +
    (mail.facts?.length ? factsTable(mail.facts) : '') +
    (mail.after ?? []).map((p) => paragraph(p, true)).join('');
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">' +
    `<title>${escapeHtml(mail.subject)}</title>` +
    '<style>' +
    // Dark mode where the client supports it (Apple Mail, Outlook apps): the web pages' dark tokens.
    '@media (prefers-color-scheme: dark){' +
    '.bg{background:#141315!important}.card{background:#1c1b1f!important;border-color:#2c2a2f!important}' +
    '.fg{color:#f2f1f3!important}.muted{color:#a19fa6!important}.link{color:#fbb03b!important}' +
    '.alert{color:#ff7a6b!important}.code{background:#141315!important;border-color:#2c2a2f!important;color:#f2f1f3!important}' +
    '.facts,.facts td{border-color:#2c2a2f!important}}' +
    '@media (max-width:600px){.card-body{padding:24px 20px 12px!important}}' +
    '</style></head>' +
    `<body class="bg" style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">` +
    // What inboxes show after the subject; padded so they don't run into the body text.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(mail.preview)}${'&#8199;&#847;'.repeat(40)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px 32px">` +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">' +
    `<tr><td style="padding:0 4px 18px">${wordmark()}</td></tr>` +
    `<tr><td class="card" style="background:${C.surface};border:1px solid ${C.rule};border-radius:12px;overflow:hidden;padding:0">` +
    band() +
    `<div class="card card-body" style="padding:32px 32px 20px;background:${C.surface}">${content}</div>` +
    '</td></tr>' +
    `<tr><td style="padding:20px 4px 0;font:400 13px/1.6 ${FONT};color:${C.muted}" class="muted">` +
    `<p style="margin:0 0 6px">${escapeHtml(mail.reason)} Reply to this email to reach a person.</p>` +
    `<p style="margin:0">${footerLinks}</p>` +
    '</td></tr></table></td></tr></table></body></html>'
  );
}
