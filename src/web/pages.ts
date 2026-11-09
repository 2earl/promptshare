import { SESSION_LIMITS } from '../sessions';
import { PROMPT_LIMITS, type Prompt, type PromptSummary } from '../prompts';
import type { Entry, SessionSummary } from '../sessions';
import { CATEGORIES, MESSAGE_LIMITS, type Errors } from './messages';

/**
 * Server-rendered pages for promptshare.cc. Every dynamic value goes through `esc`. No scripts
 * at all (CSP in http.ts); forms post to this origin.
 */

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MARK =
  '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
  '<path fill="#F15A24" d="M0 0 50 50V100L0 50Z"/>' +
  '<path fill="#F7931E" d="M100 0 50 50V100L100 50Z"/>' +
  '<path fill="#ED1C24" d="M0 50 50 100H15A15 15 0 0 1 0 85Z"/>' +
  '<path fill="#FBB03B" d="M100 50V85A15 15 0 0 1 85 100H50Z"/>' +
  '</svg>';

export interface Viewer {
  signedIn: boolean;
}

const date = (iso: string) => iso.slice(0, 16).replace('T', ' ') + ' UTC';

export function layout(title: string, main: string, viewer: Viewer, current = ''): string {
  const nav = (href: string, label: string) =>
    `<a href="${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`;
  const account = viewer.signedIn
    ? `${nav('/prompts', 'Prompts')}${nav('/sessions', 'Sessions')}${nav('/account', 'Account')}`
    : `<a class="button button-small" href="/signin">Sign in</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Prompt share</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/app.css?v=1">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
<a class="brand" href="/">${MARK}<span>Prompt share</span></a>
<nav aria-label="Main">${nav('/connect', 'Connect')}${account}</nav>
</header>
<main id="main">
${main}
</main>
<footer class="foot">
<nav aria-label="About">
<a href="/connect">How to connect</a>
<a href="/contact">Contact</a>
<a href="/report">Report content</a>
<a href="https://2earl.com/privacy">Privacy</a>
<a href="https://2earl.com/terms">Terms</a>
<a href="https://2earl.com/imprint">Imprint</a>
</nav>
<p>A 2earl service. Sign-in by <a href="https://login.2earl.com">login.2earl.com</a>.</p>
</footer>
</body>
</html>`;
}

function errorText(errors: Errors, field: string): string {
  const message = errors[field];
  return message ? `<p class="field-error" id="${field}-error">${esc(message)}</p>` : '';
}

const invalid = (errors: Errors, field: string) =>
  errors[field] ? ` aria-invalid="true" aria-describedby="${field}-error"` : '';

/** The address assistants connect to, set like a slip of paper: the page's one bold element. */
function addressSlip(address: string): string {
  return `<div class="slip">
<p class="slip-label">Add this address to your assistant</p>
<p class="slip-address"><code>${esc(address)}</code></p>
</div>`;
}

export function home(address: string, viewer: Viewer): string {
  return layout(
    'Your prompts, in every assistant',
    `<section class="hero">
<h1>Write a prompt once.<br>Use it in every assistant.</h1>
<p class="lede">Prompt share keeps your prompts and the state of your conversations, so you can pick them up in Claude, ChatGPT, Cursor or any MCP client, in a new chat, or with people you invite.</p>
${addressSlip(address)}
<p class="actions">${viewer.signedIn ? '<a class="button" href="/prompts">Open your prompts</a>' : '<a class="button" href="/signin">Sign in with 2earl</a>'}<a class="text-link" href="/connect">How to connect</a></p>
</section>
<section class="cards" aria-label="What you can do">
<article><h2>Prompts</h2><p>Save the prompts you reuse. Ask your assistant to find one, use it, or change it. Your prompts stay private.</p></article>
<article><h2>Shared sessions</h2><p>Save where a conversation stands — decisions, summaries, next steps — and continue from there in another chat or another assistant.</p></article>
<article><h2>Your data</h2><p>Session text is encrypted. Nothing is saved unless you or your assistant save it. Download or delete everything from your 2earl account.</p></article>
</section>`,
    viewer,
  );
}

export function connect(address: string, viewer: Viewer): string {
  return layout(
    'How to connect',
    `<h1>How to connect</h1>
${addressSlip(address)}
<ol class="steps">
<li><h2>Add the address</h2><p>In your assistant, add a custom connector (or "MCP server") with the address above. In Claude, that is a custom connector.</p></li>
<li><h2>Sign in with 2earl</h2><p>Your assistant opens login.2earl.com. Sign in and choose what it may do. You can change this later by connecting again.</p></li>
<li><h2>Ask for what you need</h2><p>"Save this as a prompt called Code review." "Find my prompt for meeting notes." "Save where we are to my session Trip planning."</p></li>
</ol>
<h2>What your assistant can be allowed to do</h2>
<table class="table">
<thead><tr><th scope="col">Permission</th><th scope="col">Tools</th></tr></thead>
<tbody>
<tr><td>Read your prompts and public prompts</td><td><code>search_prompts</code>, <code>get_prompt</code></td></tr>
<tr><td>Create, change and delete your prompts</td><td><code>save_prompt</code>, <code>update_prompt</code>, <code>copy_prompt</code>, <code>unpublish_prompt</code>, <code>delete_prompt</code></td></tr>
<tr><td>Save to and read your shared sessions</td><td><code>list_sessions</code>, <code>create_session</code>, <code>load_session</code>, <code>save_to_session</code>, <code>delete_session_entry</code>, <code>delete_session</code></td></tr>
</tbody>
</table>
<p>Assistants ask you before every tool that changes something. Making a prompt public and inviting people are only possible here on the website, never through an assistant.</p>
<h2>What is stored</h2>
<ul class="plain">
<li>Your prompts, as you or your assistant saved them.</li>
<li>Session entries: only text you or your assistant chose to save, encrypted, with who wrote it and when. Prompt share never records your conversations on its own.</li>
<li>A security log of actions (never their text), kept for 90 days.</li>
</ul>
<p>Download or delete everything from your <a href="https://login.2earl.com/account">2earl account</a>. Details: <a href="https://2earl.com/privacy">privacy policy</a>.</p>
<h2>Limits</h2>
<p>Prompts up to ${String(PROMPT_LIMITS.body / 1024)} KB, ${PROMPT_LIMITS.perUser.toLocaleString('en')} per account. Session entries up to ${String(SESSION_LIMITS.entry / 1024)} KB, ${String(SESSION_LIMITS.perSession / 1024 / 1024)} MB per session, ${String(SESSION_LIMITS.ownedPerUser)} sessions per account.</p>`,
    viewer,
    '/connect',
  );
}

export function signedOutNotice(viewer: Viewer, message: string): string {
  return layout(
    'Sign in',
    `<h1>Sign in</h1><p>${esc(message)}</p><p><a class="button" href="/signin">Sign in with 2earl</a></p>`,
    viewer,
  );
}

export function problem(viewer: Viewer, title: string, message: string, status = ''): string {
  return layout(
    title,
    `<h1>${esc(title)}</h1><p>${esc(message)}</p>${status ? `<p class="muted">${esc(status)}</p>` : ''}<p><a href="/">Go to the start page</a></p>`,
    viewer,
  );
}

// ---- Prompts ----------------------------------------------------------------------------------

export function promptList(prompts: PromptSummary[], query: string): string {
  const rows = prompts
    .map(
      (p) => `<li><a href="/prompts/${esc(p.id)}"><span class="item-title">${esc(p.title)}</span>
<span class="item-meta">${p.visibility === 'public' ? '<span class="tag">Public</span> ' : ''}${p.description ? esc(p.description) + ' · ' : ''}changed ${esc(date(p.updatedAt))}</span></a></li>`,
    )
    .join('');
  return layout(
    'Your prompts',
    `<div class="title-row"><h1>Your prompts</h1><a class="button" href="/prompts/new">New prompt</a></div>
<form class="search" method="get" action="/prompts" role="search">
<label for="q">Search your prompts</label>
<div class="search-row"><input id="q" name="q" type="search" value="${esc(query)}" maxlength="200"><button class="button button-quiet" type="submit">Search</button></div>
</form>
${prompts.length ? `<ul class="list">${rows}</ul>` : `<p class="empty">${query ? 'No prompts match.' : 'No prompts yet. Save one here, or ask your assistant to save one.'}</p>`}`,
    { signedIn: true },
    '/prompts',
  );
}

export interface PromptForm {
  title: string;
  description: string;
  body: string;
  tags: string;
  models: string;
}

export function promptEditor(
  mode: { kind: 'new' } | { kind: 'edit'; prompt: Prompt },
  form: PromptForm,
  error: string | null,
): string {
  const action = mode.kind === 'new' ? '/prompts' : `/prompts/${esc(mode.prompt.id)}`;
  const heading = mode.kind === 'new' ? 'New prompt' : form.title || 'Prompt';
  const status =
    mode.kind === 'edit'
      ? `<p class="muted">${mode.prompt.visibility === 'public' ? '<span class="tag">Public</span> Every 2earl user can see this prompt. ' : 'Private: only you can see it. '}Changed ${esc(date(mode.prompt.updatedAt))}.${mode.prompt.copiedFrom ? ' Copied from a public prompt.' : ''}</p>`
      : '';
  const after =
    mode.kind === 'edit'
      ? `<div class="danger-zone">
${mode.prompt.visibility === 'public' ? `<form method="post" action="/prompts/${esc(mode.prompt.id)}/unpublish"><button class="button button-quiet" type="submit">Make private</button></form>` : ''}
<a class="text-link danger" href="/prompts/${esc(mode.prompt.id)}/delete">Delete prompt</a>
</div>`
      : '';
  return layout(
    heading,
    `<p class="crumb"><a href="/prompts">Your prompts</a></p>
<h1>${esc(heading)}</h1>
${status}
${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
<form class="form" method="post" action="${action}">
<label for="title">Title</label>
<input id="title" name="title" required maxlength="${String(PROMPT_LIMITS.title)}" value="${esc(form.title)}">
<label for="description">What it is for <span class="optional">optional</span></label>
<input id="description" name="description" maxlength="${String(PROMPT_LIMITS.description)}" value="${esc(form.description)}">
<label for="body">Prompt</label>
<textarea id="body" name="body" required rows="14" class="mono">${esc(form.body)}</textarea>
<label for="tags">Tags <span class="optional">optional, separated by commas</span></label>
<input id="tags" name="tags" value="${esc(form.tags)}">
<label for="models">Written for <span class="optional">optional, e.g. Claude, GPT-5</span></label>
<input id="models" name="models" value="${esc(form.models)}">
<p><button class="button" type="submit">${mode.kind === 'new' ? 'Save prompt' : 'Save changes'}</button></p>
</form>
${after}`,
    { signedIn: true },
    '/prompts',
  );
}

export function confirmDelete(
  what: string,
  name: string,
  action: string,
  back: string,
  consequence: string,
): string {
  return layout(
    `Delete ${what}`,
    `<h1>Delete ${esc(what)} “${esc(name)}”?</h1>
<p>${esc(consequence)} This can’t be undone.</p>
<form method="post" action="${esc(action)}" class="actions">
<button class="button button-danger" type="submit">Delete ${esc(what)}</button>
<a class="text-link" href="${esc(back)}">Keep it</a>
</form>`,
    { signedIn: true },
  );
}

// ---- Shared sessions -------------------------------------------------------------------------

export function sessionList(sessions: SessionSummary[], error: string | null): string {
  const rows = sessions
    .map(
      (s) => `<li><a href="/sessions/${esc(s.id)}"><span class="item-title">${esc(s.title)}</span>
<span class="item-meta">${s.role === 'owner' ? 'Yours' : s.role === 'editor' ? 'You can add to it' : 'You can read it'} · ${String(s.entries)} ${s.entries === 1 ? 'entry' : 'entries'} · ${String(s.members)} ${s.members === 1 ? 'member' : 'members'} · changed ${esc(date(s.updatedAt))}</span></a></li>`,
    )
    .join('');
  return layout(
    'Shared sessions',
    `<h1>Shared sessions</h1>
<p class="lede">A shared session keeps where a conversation stands, so you can continue in another chat or another assistant. Only you can see your sessions; inviting people comes soon.</p>
${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
<form class="inline-form" method="post" action="/sessions">
<label for="title">New session</label>
<div class="search-row"><input id="title" name="title" required maxlength="${String(SESSION_LIMITS.title)}" placeholder="e.g. Trip planning"><button class="button" type="submit">Create</button></div>
</form>
${sessions.length ? `<ul class="list">${rows}</ul>` : '<p class="empty">No sessions yet.</p>'}`,
    { signedIn: true },
    '/sessions',
  );
}

export function sessionView(
  session: { id: string; title: string; role: string; entries: Entry[]; more: boolean },
  error: string | null,
  draft: { text: string; label: string },
): string {
  const entries = session.entries
    .map(
      (e) => `<article class="entry${e.mine ? '' : ' entry-other'}" id="entry-${esc(e.id)}">
<header><span>${e.label ? `<strong>${esc(e.label)}</strong> · ` : ''}${e.mine ? 'You' : 'Another member'} · ${esc(date(e.createdAt))}</span>
${e.mine || session.role === 'owner' ? `<form method="post" action="/sessions/${esc(session.id)}/entries/${esc(e.id)}/delete"><button class="link-button danger" type="submit">Delete</button></form>` : ''}</header>
<pre>${esc(e.text)}</pre>
</article>`,
    )
    .join('');
  const last = session.entries.at(-1);
  const canWrite = session.role !== 'viewer';
  return layout(
    session.title,
    `<p class="crumb"><a href="/sessions">Shared sessions</a></p>
<h1>${esc(session.title)}</h1>
${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
${
  canWrite
    ? `<form class="form" method="post" action="/sessions/${esc(session.id)}/entries">
<label for="text">Add an entry</label>
<textarea id="text" name="text" rows="6" required class="mono">${esc(draft.text)}</textarea>
<label for="label">Label <span class="optional">optional</span></label>
<input id="label" name="label" maxlength="${String(SESSION_LIMITS.label)}" value="${esc(draft.label)}">
<p><button class="button" type="submit">Add entry</button></p>
</form>`
    : ''
}
${entries || '<p class="empty">No entries yet. Ask your assistant to save where your conversation stands, or add one above.</p>'}
${session.more && last ? `<p><a href="/sessions/${esc(session.id)}?before=${esc(last.id)}">Older entries</a></p>` : ''}
${session.role === 'owner' ? `<div class="danger-zone"><a class="text-link danger" href="/sessions/${esc(session.id)}/delete">Delete session</a></div>` : ''}`,
    { signedIn: true },
    '/sessions',
  );
}

// ---- Account, contact, report -----------------------------------------------------------------

export function accountPage(): string {
  return layout(
    'Account',
    `<h1>Account</h1>
<p>You are signed in with your 2earl account.</p>
<h2>Your data</h2>
<p>Download everything Prompt share holds about you, or delete your account, from <a href="https://login.2earl.com/account">your 2earl account</a>. Deleting it deletes your prompts, your sessions and your entries in other people’s sessions.</p>
<form method="post" action="/signout"><button class="button button-quiet" type="submit">Sign out</button></form>`,
    { signedIn: true },
    '/account',
  );
}

export interface ContactForm {
  name: string;
  email: string;
  body: string;
}

export function contactPage(viewer: Viewer, form: ContactForm, errors: Errors): string {
  return layout(
    'Contact',
    `<h1>Contact</h1>
<p>Questions, problems, or anything about your data. You can also write to <a href="mailto:legal@2earl.com">legal@2earl.com</a>. To report content, use <a href="/report">Report content</a>.</p>
<form class="form" method="post" action="/contact" novalidate>
<label for="name">Name <span class="optional">optional</span></label>
<input id="name" name="name" maxlength="${String(MESSAGE_LIMITS.name)}" value="${esc(form.name)}" autocomplete="name"${invalid(errors, 'name')}>
${errorText(errors, 'name')}
<label for="email">Email, for the answer</label>
<input id="email" name="email" type="email" required maxlength="${String(MESSAGE_LIMITS.email)}" value="${esc(form.email)}" autocomplete="email"${invalid(errors, 'email')}>
${errorText(errors, 'email')}
<label for="body">Message</label>
<textarea id="body" name="body" rows="8" required maxlength="${String(MESSAGE_LIMITS.body)}"${invalid(errors, 'body')}>${esc(form.body)}</textarea>
${errorText(errors, 'body')}
<p><button class="button" type="submit">Send message</button></p>
</form>`,
    viewer,
    '/contact',
  );
}

export interface ReportForm {
  contentUrl: string;
  category: string;
  body: string;
  name: string;
  email: string;
  goodFaith: boolean;
}

export function reportPage(
  viewer: Viewer,
  form: ReportForm,
  errors: Errors,
  origin: string,
): string {
  const options = Object.entries(CATEGORIES)
    .map(
      ([value, label]) =>
        `<label class="choice"><input type="radio" name="category" value="${value}"${form.category === value ? ' checked' : ''} required> ${esc(label)}</label>`,
    )
    .join('');
  return layout(
    'Report content',
    `<h1>Report content</h1>
<p>Tell us about a prompt or session entry on Prompt share that is illegal or breaks the <a href="https://2earl.com/terms">terms of use</a>. Anyone can report, with or without an account. A person reads every report.</p>
<form class="form" method="post" action="/report" novalidate>
<label for="contentUrl">Link to the content</label>
<input id="contentUrl" name="contentUrl" type="url" required placeholder="${esc(origin)}/…" value="${esc(form.contentUrl)}"${invalid(errors, 'contentUrl')}>
${errorText(errors, 'contentUrl')}
<fieldset${invalid(errors, 'category')}><legend>Why are you reporting it?</legend>${options}</fieldset>
${errorText(errors, 'category')}
<label for="body">Explain why</label>
<textarea id="body" name="body" rows="7" required maxlength="${String(MESSAGE_LIMITS.body)}"${invalid(errors, 'body')}>${esc(form.body)}</textarea>
${errorText(errors, 'body')}
<label for="name">Your name</label>
<input id="name" name="name" maxlength="${String(MESSAGE_LIMITS.name)}" value="${esc(form.name)}" autocomplete="name"${invalid(errors, 'name')}>
${errorText(errors, 'name')}
<label for="email">Your email, for our decision</label>
<input id="email" name="email" type="email" maxlength="${String(MESSAGE_LIMITS.email)}" value="${esc(form.email)}" autocomplete="email"${invalid(errors, 'email')}>
${errorText(errors, 'email')}
<p class="hint">Name and email are needed unless the report concerns child sexual abuse.</p>
<label class="choice"><input type="checkbox" name="goodFaith" value="yes"${form.goodFaith ? ' checked' : ''}${invalid(errors, 'goodFaith')}> I believe what I am reporting is accurate and complete, and I report it in good faith.</label>
${errorText(errors, 'goodFaith')}
<p><button class="button" type="submit">Send report</button></p>
</form>`,
    viewer,
    '/report',
  );
}

export function thanks(
  viewer: Viewer,
  kind: 'contact' | 'report',
  id: string,
  withEmail: boolean,
): string {
  const title = kind === 'report' ? 'Report received' : 'Message sent';
  const next =
    kind === 'report'
      ? `A person will review it${withEmail ? ' and email you the decision' : ''}. Reference: ${id}.`
      : `We’ll answer by email. Reference: ${id}.`;
  return layout(
    title,
    `<h1>${title}</h1><p>${esc(next)}</p><p><a href="/">Go to the start page</a></p>`,
    viewer,
  );
}
