import { SESSION_LIMITS } from '../sessions';
import { PROMPT_LIMITS, type Prompt, type PromptSummary } from '../prompts';
import type { Entry, Invitation, Member, SessionSummary } from '../sessions';
import { SENSITIVE_CONSENT_TEXT, type ConsentDecision } from '../consent';
import { ACTIONS, type Decision, type Message, type ReportedContent } from '../moderation';
import { decisionText } from '../notices';
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
    ? `${nav('/explore', 'Explore')}${nav('/prompts', 'Prompts')}${nav('/sessions', 'Sessions')}${nav('/account', 'Account')}`
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
${mode.prompt.visibility === 'private' && mode.prompt.status === 'active' ? `<a class="button button-quiet" href="/prompts/${esc(mode.prompt.id)}/publish">Make public…</a>` : ''}
${mode.prompt.visibility === 'public' ? `<a class="text-link" href="/p/${esc(mode.prompt.id)}">See it as others do</a>` : ''}
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
<p class="lede">A shared session keeps where a conversation stands, so you can continue in another chat, another assistant, or with people you invite.</p>
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

export interface SessionPage {
  id: string;
  title: string;
  role: string;
  entries: Entry[];
  more: boolean;
  members: Member[];
  invitations: Invitation[] | null;
}

const who = (handle: string | null) => (handle ? `@${esc(handle)}` : 'a member without a handle');

export function sessionView(
  session: SessionPage,
  error: string | null,
  draft: { text: string; label: string },
  newLink: string | null = null,
): string {
  const entries = session.entries
    .map(
      (e) => `<article class="entry${e.mine ? '' : ' entry-other'}" id="entry-${esc(e.id)}">
<header><span>${e.label ? `<strong>${esc(e.label)}</strong> · ` : ''}${e.mine ? 'You' : who(e.author)} · ${esc(date(e.createdAt))}</span>
<span class="entry-actions">${e.mine ? '' : `<a class="text-link" href="/report?url=${encodeURIComponent(`https://promptshare.cc/sessions/${session.id}/entries/${e.id}`)}">Report</a>`}
${e.mine || session.role === 'owner' ? `<form method="post" action="/sessions/${esc(session.id)}/entries/${esc(e.id)}/delete"><button class="link-button danger" type="submit">Delete</button></form>` : ''}</span></header>
<pre>${esc(e.text)}</pre>
</article>`,
    )
    .join('');
  const last = session.entries.at(-1);
  const canWrite = session.role !== 'viewer';
  const owner = session.role === 'owner';
  const roleName = (role: string) =>
    role === 'owner' ? 'owner' : role === 'editor' ? 'can add entries' : 'can read';
  const members = session.members
    .map(
      (m) =>
        `<li><span>${m.you ? 'You' : who(m.handle)} · ${roleName(m.role)}</span>${
          owner && !m.you
            ? `<form method="post" action="/sessions/${esc(session.id)}/members/${esc(m.uid)}/remove"><button class="link-button danger" type="submit">Remove</button></form>`
            : ''
        }</li>`,
    )
    .join('');
  const invitations = (session.invitations ?? [])
    .map(
      (
        i,
      ) => `<li><span>Link for someone who ${i.role === 'editor' ? 'can add entries' : 'can read'} · valid until ${esc(date(i.expiresAt))}</span>
<form method="post" action="/sessions/${esc(session.id)}/invitations/${esc(i.id)}/revoke"><button class="link-button danger" type="submit">Revoke</button></form></li>`,
    )
    .join('');
  const sharing = `<section class="members" aria-labelledby="members-title">
<h2 id="members-title">People</h2>
<ul class="people">${members}</ul>
${
  owner
    ? `${newLink ? `<div class="slip"><p class="slip-label">New invitation link · works once, for 7 days</p><p class="slip-address"><code>${esc(newLink)}</code></p></div><p class="muted">Send it to one person you trust. Everything in this session will be visible to them, and what they write reaches your assistant.</p>` : ''}
<form class="inline-form" method="post" action="/sessions/${esc(session.id)}/invitations">
<label for="role">Invite someone</label>
<div class="search-row"><select id="role" name="role"><option value="editor">They can add entries</option><option value="viewer">They can only read</option></select><button class="button button-quiet" type="submit">Create link</button></div>
</form>
${invitations ? `<ul class="people">${invitations}</ul>` : ''}`
    : `<form method="post" action="/sessions/${esc(session.id)}/leave"><button class="button button-quiet" type="submit">Leave session</button></form>`
}
</section>`;
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
${sharing}
${owner ? `<div class="danger-zone"><a class="text-link danger" href="/sessions/${esc(session.id)}/delete">Delete session</a></div>` : ''}`,
    { signedIn: true },
    '/sessions',
  );
}

export function joinPage(
  invitation: {
    title: string;
    owner: string | null;
    role: 'editor' | 'viewer';
    alreadyMember: boolean;
  },
  token: string,
): string {
  return layout(
    'Join a shared session',
    `<h1>Join “${esc(invitation.title)}”?</h1>
<p>${who(invitation.owner)} invited you to their shared session. You ${invitation.role === 'editor' ? 'can read it and add entries' : 'can read it'}.</p>
<p class="muted">Only join sessions of people you trust. What they write there reaches your assistant when it loads the session.</p>
${
  invitation.alreadyMember
    ? '<p>You are already a member.</p>'
    : `<form method="post" action="/join/${esc(token)}" class="actions"><button class="button" type="submit">Join</button><a class="text-link" href="/sessions">Not now</a></form>`
}`,
    { signedIn: true },
  );
}

export function handlePage(
  current: string | null,
  value: string,
  error: string | null,
  returnTo: string | null,
): string {
  return layout(
    'Your handle',
    `<h1>${current ? 'Change your handle' : 'Choose a handle'}</h1>
<p>Your handle is the only thing other 2earl users see of you: as the author of your public prompts, and in shared sessions. It isn’t your name or email.</p>
${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
<form class="form" method="post" action="/welcome${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ''}">
<label for="handle">Handle <span class="optional">3–30 lowercase letters, digits or hyphens</span></label>
<input id="handle" name="handle" required maxlength="30" value="${esc(value)}" autocomplete="username" pattern="[a-z0-9-]{3,30}">
<p><button class="button" type="submit">Save handle</button></p>
</form>`,
    { signedIn: true },
    '/account',
  );
}

export function explore(prompts: PromptSummary[], query: string): string {
  const rows = prompts
    .map(
      (p) => `<li><a href="/p/${esc(p.id)}"><span class="item-title">${esc(p.title)}</span>
<span class="item-meta">${p.author ? `@${esc(p.author)}` : ''}${p.description ? ' · ' + esc(p.description) : ''}${p.models.length ? ' · for ' + esc(p.models.join(', ')) : ''}</span></a></li>`,
    )
    .join('');
  return layout(
    'Explore public prompts',
    `<h1>Public prompts</h1>
<p class="lede">Prompts other 2earl users chose to share. Copy one into your own prompts to use or change it.</p>
<form class="search" method="get" action="/explore" role="search">
<label for="q">Search public prompts</label>
<div class="search-row"><input id="q" name="q" type="search" value="${esc(query)}" maxlength="200"><button class="button button-quiet" type="submit">Search</button></div>
</form>
${prompts.length ? `<ul class="list">${rows}</ul>` : `<p class="empty">${query ? 'No public prompts match.' : 'No public prompts yet.'}</p>`}`,
    { signedIn: true },
    '/explore',
  );
}

export function publicPrompt(prompt: Prompt, origin: string): string {
  return layout(
    prompt.title,
    `<p class="crumb"><a href="/explore">Public prompts</a></p>
<h1>${esc(prompt.title)}</h1>
<p class="muted">${prompt.author ? `By @${esc(prompt.author)}` : 'By a 2earl user'}${prompt.models.length ? ` · for ${esc(prompt.models.join(', '))}` : ''} · changed ${esc(date(prompt.updatedAt))}</p>
${prompt.description ? `<p>${esc(prompt.description)}</p>` : ''}
<pre class="prompt-body">${esc(prompt.body)}</pre>
<div class="actions">
${prompt.mine ? `<a class="button button-quiet" href="/prompts/${esc(prompt.id)}">Edit your prompt</a>` : `<form method="post" action="/p/${esc(prompt.id)}/copy"><button class="button" type="submit">Copy to my prompts</button></form>`}
<a class="text-link" href="/report?url=${encodeURIComponent(`${origin}/p/${prompt.id}`)}">Report</a>
</div>`,
    { signedIn: true },
    '/explore',
  );
}

export function publishPreview(prompt: Prompt, handle: string): string {
  return layout(
    'Make public',
    `<p class="crumb"><a href="/prompts/${esc(prompt.id)}">${esc(prompt.title)}</a></p>
<h1>Make this prompt public?</h1>
<p>Every signed-in 2earl user will be able to find, read and copy it, shown exactly like this, with your handle <strong>@${esc(handle)}</strong>. Copies people make stay theirs, even if you make it private again later.</p>
<div class="preview">
<h2>${esc(prompt.title)}</h2>
<p class="muted">By @${esc(handle)}${prompt.models.length ? ` · for ${esc(prompt.models.join(', '))}` : ''}</p>
${prompt.description ? `<p>${esc(prompt.description)}</p>` : ''}
<pre class="prompt-body">${esc(prompt.body)}</pre>
</div>
<p class="muted">Check it holds nothing private: names, keys, internal details. Public prompts must follow the <a href="https://2earl.com/terms">terms of use</a>.</p>
<form method="post" action="/prompts/${esc(prompt.id)}/publish" class="actions">
<button class="button" type="submit">Make public</button>
<a class="text-link" href="/prompts/${esc(prompt.id)}">Keep it private</a>
</form>`,
    { signedIn: true },
    '/prompts',
  );
}

// ---- Account, contact, report -----------------------------------------------------------------

export function accountPage(
  handle: string | null,
  decisions: Decision[] = [],
  consent: ConsentDecision | null = null,
): string {
  return layout(
    'Account',
    `<h1>Account</h1>
<p>You are signed in with your 2earl account.</p>
<h2>Handle</h2>
<p>${handle ? `Others see you as <strong>@${esc(handle)}</strong>. <a href="/welcome">Change it</a>` : 'You haven’t chosen a handle. You need one to make prompts public or share sessions. <a href="/welcome">Choose a handle</a>'}</p>
<h2>Sensitive information</h2>
<p>${consent?.consented ? 'You consented to Prompt share storing sensitive information you save.' : 'You haven’t consented to Prompt share storing sensitive information, such as health details.'} <a href="/consent">${consent?.consented ? 'Withdraw consent' : 'Review'}</a></p>
<h2>Your data</h2>
<p>Download everything Prompt share holds about you, or delete your account, from <a href="https://login.2earl.com/account">your 2earl account</a>. Deleting it deletes your prompts, your sessions and your entries in other people’s sessions.</p>
${decisionsList(decisions)}
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
  receiptEmailed = false,
): string {
  const title = kind === 'report' ? 'Report received' : 'Message sent';
  const next =
    kind === 'report'
      ? `A person will review it${withEmail ? ' and email you the decision' : ''}. Reference: ${id}.${receiptEmailed ? ' We also emailed you this confirmation.' : ''}`
      : `We’ll answer by email. Reference: ${id}.`;
  return layout(
    title,
    `<h1>${title}</h1><p>${esc(next)}</p><p><a href="/">Go to the start page</a></p>`,
    viewer,
  );
}

// ---- Moderation (owner only) and statements of reasons --------------------------------------

const when = (seconds: number) => date(new Date(seconds * 1000).toISOString());

const categoryLabel = (category: string): string =>
  category in CATEGORIES ? CATEGORIES[category as keyof typeof CATEGORIES] : category;

const KIND_LABEL = { contact: 'Message', report: 'Report', appeal: 'Contest' } as const;

export function adminList(
  messages: Message[],
  open: boolean,
  settings: { emailReporters: boolean; testResult: string | null } = {
    emailReporters: false,
    testResult: null,
  },
): string {
  const rows = messages
    .map(
      (
        m,
      ) => `<li><a href="/admin/messages/${esc(m.id)}"><span class="item-title">${KIND_LABEL[m.kind]}${m.category ? ` · ${esc(categoryLabel(m.category))}` : ''}</span>
<span class="item-meta">${esc(when(m.createdAt))} · ${esc(m.body.slice(0, 140))}${m.body.length > 140 ? '…' : ''}</span></a></li>`,
    )
    .join('');
  return layout(
    'Moderation',
    `<h1>Moderation</h1>
<p class="lede">Reports, contests and messages, ${open ? 'oldest first. Reports need a decision without undue delay' : 'most recent first'}.</p>
<p class="actions">${open ? '<a class="text-link" href="/admin?closed=1">Closed</a>' : '<a class="text-link" href="/admin">Open</a>'}</p>
${messages.length ? `<ul class="list">${rows}</ul>` : `<p class="empty">${open ? 'Nothing open.' : 'Nothing closed yet.'}</p>`}
<section class="members" aria-labelledby="settings-title">
<h2 id="settings-title">Settings</h2>
<form class="form" method="post" action="/admin/settings">
<label class="choice"><input type="checkbox" name="emailReporters" value="on"${settings.emailReporters ? ' checked' : ''}> Email reporters a confirmation of receipt and the decision, from noreply@promptshare.cc</label>
<p class="hint">Before turning this on: enable the Cloudflare Workers Paid plan and onboard promptshare.cc in Email Service → Email Sending. Off: you send the decision yourself from the report’s page.</p>
<p><button class="button button-quiet" type="submit">Save settings</button></p>
</form>
${
  settings.emailReporters
    ? `<form class="inline-form" method="post" action="/admin/settings/test">
<label for="testTo">Send a test email</label>
<div class="search-row"><input id="testTo" name="to" type="email" required placeholder="an address that isn’t yours, to test sending to anyone"><button class="button button-quiet" type="submit">Send test</button></div>
</form>
${settings.testResult ? `<p class="${settings.testResult.startsWith('Sent') ? 'muted' : 'alert'}" role="status">${esc(settings.testResult)}</p>` : ''}
<p class="hint">If sending fails, reporters still see their confirmation on the page, and each report’s page offers the decision email for you to send, as when this is off.</p>`
    : ''
}
</section>`,
    { signedIn: true },
  );
}

export function consentPage(decision: ConsentDecision | null, returnTo: string | null): string {
  const action = `/consent${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ''}`;
  return layout(
    'Sensitive information',
    `<h1>Sensitive information</h1>
<p>Some people keep notes about their health, beliefs or similar private matters in their prompts or sessions. The law protects this kind of information specially, so Prompt share stores it only with your explicit consent.</p>
<div class="preview"><p>${esc(SENSITIVE_CONSENT_TEXT)}</p></div>
<p class="muted">Your answer doesn’t change anything else: you can use Prompt share either way. Without consent, please don’t save such information. ${
      decision
        ? `You last answered on ${esc(when(decision.decidedAt))}: ${decision.consented ? 'you consented' : 'you didn’t consent'}.`
        : ''
    }</p>
<div class="actions">
<form method="post" action="${esc(action)}"><input type="hidden" name="decision" value="yes"><button class="button" type="submit">I consent</button></form>
<form method="post" action="${esc(action)}"><input type="hidden" name="decision" value="no"><button class="button button-quiet" type="submit">${decision?.consented ? 'Withdraw consent' : 'I don’t consent'}</button></form>
</div>
<p class="muted">If you withdraw consent, Prompt share can’t find such information for you: delete the prompts and entries that hold it, or your whole account at <a href="https://login.2earl.com/account">login.2earl.com</a>.</p>`,
    { signedIn: true },
    '/account',
  );
}

export interface DecisionForm {
  action: string;
  ground: string;
  law: string;
  explanation: string;
  suspendDays: string;
}

function contentBlock(content: ReportedContent | null): string {
  if (!content)
    return '<p class="alert">The link doesn’t point at a prompt or session entry on Prompt share, or the content no longer exists.</p>';
  if (content.type === 'prompt') {
    return `<div class="preview"><h2>${esc(content.title)}</h2>
<p class="muted">Prompt by ${content.ownerHandle ? `@${esc(content.ownerHandle)}` : 'a user without a handle'} · ${esc(content.visibility)} · ${esc(content.status)}</p>
<pre class="prompt-body">${esc(content.body)}</pre></div>`;
  }
  return `<div class="preview"><h2>Entry in “${esc(content.sessionTitle)}”</h2>
<p class="muted">By ${content.authorHandle ? `@${esc(content.authorHandle)}` : 'a member without a handle'}${content.removed ? ' · removed' : ''}</p>
<pre class="prompt-body">${esc(content.text)}</pre></div>`;
}

/** Art. 16(5): the reporter is told the decision, automatically or by the owner's own email. */
function reporterNotice(message: Message, decision: Decision): string {
  if (!message.email) return '<p class="muted">The reporter gave no email address.</p>';
  if (message.decisionSentAt) {
    return `<p class="muted">The decision was emailed to the reporter automatically, ${esc(when(message.decisionSentAt))}.</p>`;
  }
  const href = `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent('Our decision on your report')}&body=${encodeURIComponent(decisionText(message, decision))}`;
  return `<p><a class="button button-quiet" href="${esc(href)}">Email the reporter the decision</a> <span class="muted">Required by the DSA (Art. 16(5)); opens your mail app.</span></p>`;
}

export function adminMessage(
  message: Message,
  content: ReportedContent | null,
  decision: Decision | null,
  contested: Decision | null,
  form: DecisionForm,
  error: string | null,
): string {
  const details = `<dl class="details">
<dt>Received</dt><dd>${esc(when(message.createdAt))}</dd>
${message.name ? `<dt>Name</dt><dd>${esc(message.name)}</dd>` : ''}
${message.email ? `<dt>Email</dt><dd><a href="mailto:${esc(message.email)}">${esc(message.email)}</a></dd>` : ''}
${message.contentUrl ? `<dt>Content</dt><dd><code>${esc(message.contentUrl)}</code></dd>` : ''}
${message.category ? `<dt>Reason</dt><dd>${esc(categoryLabel(message.category))}</dd>` : ''}
${message.kind === 'report' ? `<dt>Good faith</dt><dd>${message.goodFaith ? 'Confirmed' : 'Not confirmed'}</dd>` : ''}
<dt>Emailed to you</dt><dd>${message.notifiedAt ? 'Yes' : 'No'}</dd>
${message.kind === 'report' && message.email ? `<dt>Receipt to reporter</dt><dd>${message.receiptSentAt ? 'Emailed automatically' : 'Not emailed'}</dd>` : ''}
</dl>`;
  const options = (Object.keys(ACTIONS) as (keyof typeof ACTIONS)[])
    .filter((a) => (message.kind === 'appeal' ? true : a !== 'reverse'))
    .map(
      (a) =>
        `<label class="choice"><input type="radio" name="action" value="${a}"${form.action === a ? ' checked' : ''} required> ${esc(ACTIONS[a])}</label>`,
    )
    .join('');
  const decideForm =
    message.closedAt === null && message.kind !== 'contact'
      ? `<form class="form" method="post" action="/admin/messages/${esc(message.id)}/decide">
<fieldset><legend>Decision</legend>${options}</fieldset>
<fieldset><legend>Ground</legend>
<label class="choice"><input type="radio" name="ground" value="illegal"${form.ground === 'illegal' ? ' checked' : ''}> Illegal content</label>
<label class="choice"><input type="radio" name="ground" value="terms"${form.ground === 'terms' ? ' checked' : ''}> Against the terms of use</label>
</fieldset>
<label for="law">Law it breaks <span class="optional">for illegal content, e.g. § 186 StGB</span></label>
<input id="law" name="law" maxlength="300" value="${esc(form.law)}">
<label for="suspendDays">Suspension in days <span class="optional">for a suspension</span></label>
<input id="suspendDays" name="suspendDays" type="number" min="1" max="365" value="${esc(form.suspendDays)}">
<label for="explanation">Statement of reasons <span class="optional">the author reads this: facts, and why they lead to the decision</span></label>
<textarea id="explanation" name="explanation" rows="6" required maxlength="5000">${esc(form.explanation)}</textarea>
<p><button class="button" type="submit">Decide</button></p>
</form>`
      : '';
  const closeForm =
    message.closedAt === null
      ? `<form method="post" action="/admin/messages/${esc(message.id)}/close"><button class="button button-quiet" type="submit">${message.kind === 'contact' ? 'Mark answered' : 'Close without a decision'}</button></form>`
      : `<p class="muted">Closed ${esc(when(message.closedAt))}.</p>`;
  return layout(
    `${KIND_LABEL[message.kind]} ${message.id}`,
    `<p class="crumb"><a href="/admin">Moderation</a></p>
<h1>${KIND_LABEL[message.kind]}</h1>
${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
${details}
<h2>${message.kind === 'appeal' ? 'Their objection' : 'Message'}</h2>
<pre class="prompt-body">${esc(message.body)}</pre>
${contested ? `<h2>The decision contested</h2><p><strong>${esc(ACTIONS[contested.action])}</strong> · ${esc(when(contested.createdAt))}</p><pre class="prompt-body">${esc(contested.explanation)}</pre>` : ''}
${message.kind !== 'contact' ? `<h2>The content</h2>${contentBlock(content)}` : ''}
${form.action === 'threat' || decision?.action === 'threat' ? THREAT_PROCEDURE : ''}
${decision ? `<h2>Decision</h2><p><strong>${esc(ACTIONS[decision.action])}</strong> · ${esc(when(decision.createdAt))}</p><pre class="prompt-body">${esc(decision.explanation)}</pre>${message.kind === 'report' ? reporterNotice(message, decision) : ''}` : ''}
${decideForm}
<div class="danger-zone">${closeForm}</div>`,
    { signedIn: true },
  );
}

const THREAT_PROCEDURE = `<div class="alert"><p><strong>Threat to life or safety (DSA Art. 18).</strong> Inform the police at once: the online reporting portal of the police of the German state concerned, or 110 if it is urgent. If it isn’t clear which country is concerned: the German authorities, or Europol. The content is kept as evidence until they have it.</p></div>`;

export function decisionsList(decisions: Decision[]): string {
  if (!decisions.length) return '';
  const rows = decisions
    .map(
      (
        d,
      ) => `<li><a href="/decisions/${esc(d.id)}"><span class="item-title">${esc(d.contentTitle ?? 'Your account')}</span>
<span class="item-meta">${esc(ACTIONS[d.action])} · ${esc(when(d.createdAt))}</span></a></li>`,
    )
    .join('');
  return `<h2>Moderation decisions about your content</h2><ul class="list">${rows}</ul>`;
}

export function decisionPage(decision: Decision, contested: boolean): string {
  const ground =
    decision.ground === 'illegal'
      ? `Illegal content${decision.law ? `: ${esc(decision.law)}` : ''}`
      : decision.ground === 'terms'
        ? 'The <a href="https://2earl.com/terms">terms of use</a>'
        : '—';
  return layout(
    'Moderation decision',
    `<p class="crumb"><a href="/account">Account</a></p>
<h1>Moderation decision</h1>
<dl class="details">
<dt>About</dt><dd>${esc(decision.contentTitle ?? 'Your account')}</dd>
<dt>Decision</dt><dd>${esc(ACTIONS[decision.action])}</dd>
${decision.untilAt ? `<dt>Until</dt><dd>${esc(when(decision.untilAt))}</dd>` : ''}
<dt>Date</dt><dd>${esc(when(decision.createdAt))}</dd>
<dt>Ground</dt><dd>${ground}</dd>
<dt>Started by</dt><dd>${decision.reportBased ? 'A report from someone else' : 'Our own review'}</dd>
<dt>Automated?</dt><dd>No. A person reviewed the content and decided.</dd>
</dl>
<h2>Reasons</h2>
<pre class="prompt-body">${esc(decision.explanation)}</pre>
<h2>If you disagree</h2>
${
  contested
    ? '<p>You contested this decision. A person will review it and you’ll see the outcome here.</p>'
    : `<p>Tell us why, and a person will review the decision again. You can also turn to an out-of-court dispute settlement body or a court.</p>
<form class="form" method="post" action="/decisions/${esc(decision.id)}/contest">
<label for="body">Why the decision is wrong</label>
<textarea id="body" name="body" rows="6" required maxlength="10000"></textarea>
<p><button class="button" type="submit">Contest the decision</button></p>
</form>`
}`,
    { signedIn: true },
    '/account',
  );
}
