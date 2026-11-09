import { Hono } from 'hono';
import {
  ModerationError,
  closeMessage,
  contentOfDecision,
  decide,
  decisionAbout,
  decisionById,
  decisionForMessage,
  decisionsAbout,
  getMessage,
  listMessages,
  resolveContent,
  type Action,
} from '../moderation';
import { ProfileError, handleOf, setHandle } from '../profiles';
import {
  PromptError,
  copyPrompt,
  deletePrompt,
  getPrompt,
  publishPrompt,
  savePrompt,
  searchPrompts,
  unpublishPrompt,
  updatePrompt,
} from '../prompts';
import {
  SessionError,
  acceptInvitation,
  createInvitation,
  createSession,
  deleteEntry,
  deleteSession,
  listInvitations,
  listMembers,
  listSessions,
  loadSession,
  previewInvitation,
  removeMember,
  revokeInvitation,
  saveToSession,
} from '../sessions';
import {
  SignInError,
  clientMetadata,
  createWebSession,
  currentSession,
  endWebSession,
  finishSignIn,
  startSignIn,
  SESSION_ABSOLUTE_SECONDS,
  SIGNIN_TTL_SECONDS,
} from './auth';
import {
  SECURITY_HEADERS,
  SESSION_COOKIE,
  SIGNIN_COOKIE,
  isSameOrigin,
  readCookie,
  safeReturnTo,
  setCookie,
  underRateLimit,
  type AppContext,
  type AppEnv,
} from './http';
import { notifyOwner, storeMessage, validateContact, validateReport } from './messages';
import * as pages from './pages';

/** The website at promptshare.cc (docs/DESIGN.md §3, phase C1). */

/** Entries written on the website say so, where assistants' entries name their client ID. */
export const WEBSITE_CLIENT = 'promptshare.cc';

const list = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const text = (value: unknown) => (typeof value === 'string' ? value : '');

function html(c: AppContext, body: string, status: 200 | 400 | 403 | 404 | 429 | 500 = 200) {
  return c.html(body, status);
}

export function createApp(now: () => number) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c: AppContext, next) => {
    c.set('now', now());
    c.set(
      'session',
      await currentSession(c.env, c.get('now'), readCookie(c.req.header('Cookie'), SESSION_COOKIE)),
    );
    // State changes only from our own pages.
    if (c.req.method === 'POST' && !isSameOrigin(c)) {
      return html(
        c,
        pages.problem(
          { signedIn: false },
          'Not allowed',
          'This form must be sent from promptshare.cc.',
        ),
        403,
      );
    }
    await next();
    // Responses from the assets binding have immutable headers.
    c.res = new Response(c.res.body, c.res);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });

  const viewer = (c: AppContext) => ({ signedIn: c.get('session') !== null });

  /** Pages that need a signed-in user: the uid, or a redirect to sign in. */
  const requireUser = (c: AppContext): string | Response => {
    const session = c.get('session');
    if (session) return session.uid;
    return c.redirect(`/signin?return=${encodeURIComponent(c.req.path)}`, 302);
  };

  // ---- Public pages ---------------------------------------------------------------------------

  app.get('/', (c) => html(c, pages.home(c.env.MCP_ADDRESS, viewer(c))));
  app.get('/connect', (c) => html(c, pages.connect(c.env.MCP_ADDRESS, viewer(c))));

  app.get('/oauth/client.json', (c) => {
    const response = c.json(clientMetadata(c.env));
    response.headers.set('Cache-Control', 'public, max-age=300');
    return response;
  });

  // ---- Sign-in ----------------------------------------------------------------------------------

  app.get('/signin', async (c) => {
    if (!(await underRateLimit(c, 'signin'))) {
      return html(
        c,
        pages.problem(viewer(c), 'Too many attempts', 'Wait a minute and try again.'),
        429,
      );
    }
    const returnTo = safeReturnTo(c.req.query('return'));
    const secondFactor = c.req.query('admin') === '1';
    if (c.get('session') && !secondFactor) return c.redirect(returnTo ?? '/prompts', 302);
    const { cookieValue, location } = await startSignIn(c.env, c.get('now'), returnTo, {
      secondFactor,
    });
    setCookie(c, SIGNIN_COOKIE, cookieValue, SIGNIN_TTL_SECONDS);
    return c.redirect(location, 302);
  });

  app.get('/callback', async (c) => {
    setCookie(c, SIGNIN_COOKIE, '', 0);
    if (c.req.query('error')) {
      return html(
        c,
        pages.problem(viewer(c), 'Not signed in', 'Sign-in was cancelled or not allowed.'),
        400,
      );
    }
    try {
      const { uid, aal2At, returnTo } = await finishSignIn(c.env, c.get('now'), {
        cookieValue: readCookie(c.req.header('Cookie'), SIGNIN_COOKIE),
        state: c.req.query('state') ?? null,
        code: c.req.query('code') ?? null,
        iss: c.req.query('iss') ?? null,
      });
      // A new sign-in replaces the old session (e.g. signing in again for moderation).
      const previous = c.get('session');
      if (previous) await endWebSession(c.env, previous);
      const cookieValue = await createWebSession(c.env, c.get('now'), uid, aal2At);
      setCookie(c, SESSION_COOKIE, cookieValue, SESSION_ABSOLUTE_SECONDS);
      return c.redirect(safeReturnTo(returnTo) ?? '/prompts', 302);
    } catch (error) {
      if (!(error instanceof SignInError)) throw error;
      console.error('sign-in failed', error.message);
      return html(
        c,
        pages.problem(viewer(c), 'Not signed in', 'Sign-in didn’t complete. Start again.'),
        400,
      );
    }
  });

  app.post('/signout', async (c) => {
    const session = c.get('session');
    if (session) await endWebSession(c.env, session);
    setCookie(c, SESSION_COOKIE, '', 0);
    return c.redirect('/', 303);
  });

  app.get('/account', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    return html(
      c,
      pages.accountPage(await handleOf(c.env.DB, uid), await decisionsAbout(c.env.DB, uid)),
    );
  });

  // ---- Prompts ----------------------------------------------------------------------------------

  const emptyForm = { title: '', description: '', body: '', tags: '', models: '' };

  async function readPromptForm(c: AppContext) {
    const form = await c.req.parseBody();
    return {
      title: text(form.title),
      description: text(form.description),
      body: text(form.body),
      tags: text(form.tags),
      models: text(form.models),
    };
  }

  app.get('/prompts', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const query = c.req.query('q') ?? '';
    return html(
      c,
      pages.promptList(await searchPrompts(c.env.DB, uid, { query, scope: 'mine' }), query),
    );
  });

  app.get('/prompts/new', (c) => {
    const uid = requireUser(c);
    return typeof uid === 'string'
      ? html(c, pages.promptEditor({ kind: 'new' }, emptyForm, null))
      : uid;
  });

  app.post('/prompts', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const form = await readPromptForm(c);
    try {
      const prompt = await savePrompt(c.env.DB, uid, c.get('now'), {
        ...form,
        tags: list(form.tags),
        models: list(form.models),
      });
      return c.redirect(`/prompts/${prompt.id}`, 303);
    } catch (error) {
      if (!(error instanceof PromptError)) throw error;
      return html(c, pages.promptEditor({ kind: 'new' }, form, error.message), 400);
    }
  });

  /** One of the user's own prompts. The website shows only your own (public ones by others: C2). */
  async function ownPrompt(c: AppContext, uid: string) {
    const prompt = await getPrompt(c.env.DB, uid, c.req.param('id') ?? '');
    return prompt?.mine ? prompt : null;
  }

  const notFound = (c: AppContext, what = 'page') =>
    html(
      c,
      pages.problem(viewer(c), 'Not found', `There is no such ${what}, or you can’t see it.`),
      404,
    );

  app.get('/prompts/:id', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const prompt = await ownPrompt(c, uid);
    if (!prompt) return notFound(c, 'prompt');
    return html(
      c,
      pages.promptEditor(
        { kind: 'edit', prompt },
        { ...prompt, tags: prompt.tags.join(', '), models: prompt.models.join(', ') },
        null,
      ),
    );
  });

  app.post('/prompts/:id', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const prompt = await ownPrompt(c, uid);
    if (!prompt) return notFound(c, 'prompt');
    const form = await readPromptForm(c);
    try {
      await updatePrompt(c.env.DB, uid, c.get('now'), prompt.id, {
        ...form,
        tags: list(form.tags),
        models: list(form.models),
      });
      return c.redirect(`/prompts/${prompt.id}`, 303);
    } catch (error) {
      if (!(error instanceof PromptError)) throw error;
      return html(c, pages.promptEditor({ kind: 'edit', prompt }, form, error.message), 400);
    }
  });

  app.post('/prompts/:id/unpublish', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    if (!(await unpublishPrompt(c.env.DB, uid, c.get('now'), c.req.param('id'))))
      return notFound(c, 'prompt');
    return c.redirect(`/prompts/${c.req.param('id')}`, 303);
  });

  app.get('/prompts/:id/delete', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const prompt = await ownPrompt(c, uid);
    if (!prompt) return notFound(c, 'prompt');
    return html(
      c,
      pages.confirmDelete(
        'prompt',
        prompt.title,
        `/prompts/${prompt.id}/delete`,
        `/prompts/${prompt.id}`,
        'Copies other people made stay theirs.',
      ),
    );
  });

  app.post('/prompts/:id/delete', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    if (!(await deletePrompt(c.env.DB, uid, c.req.param('id')))) return notFound(c, 'prompt');
    return c.redirect('/prompts', 303);
  });

  // ---- Shared sessions ------------------------------------------------------------------------

  app.get('/sessions', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    return html(c, pages.sessionList(await listSessions(c.env.DB, uid), null));
  });

  app.post('/sessions', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const form = await c.req.parseBody();
    try {
      const session = await createSession(c.env.DB, uid, c.get('now'), text(form.title));
      return c.redirect(`/sessions/${session.id}`, 303);
    } catch (error) {
      if (!(error instanceof SessionError)) throw error;
      return html(c, pages.sessionList(await listSessions(c.env.DB, uid), error.message), 400);
    }
  });

  async function showSession(
    c: AppContext,
    uid: string,
    error: string | null,
    draft = { text: '', label: '' },
    newLink: string | null = null,
  ) {
    const id = c.req.param('id') ?? '';
    const session = await loadSession(
      c.env.DB,
      c.env.STATE_ENCRYPTION_KEY,
      uid,
      id,
      c.req.query('before'),
    );
    if (!session) return notFound(c, 'session');
    const members = (await listMembers(c.env.DB, uid, id)) ?? [];
    const invitations = await listInvitations(c.env.DB, uid, c.get('now'), id);
    return html(
      c,
      pages.sessionView({ id, ...session, members, invitations }, error, draft, newLink),
      error ? 400 : 200,
    );
  }

  /** Sharing needs a handle: send the user to choose one, then back. */
  async function requireHandle(
    c: AppContext,
    uid: string,
    returnTo: string,
  ): Promise<Response | null> {
    if (await handleOf(c.env.DB, uid)) return null;
    return c.redirect(`/welcome?return=${encodeURIComponent(returnTo)}`, 303);
  }

  app.get('/sessions/:id', async (c) => {
    const uid = requireUser(c);
    return typeof uid === 'string' ? showSession(c, uid, null) : uid;
  });

  app.post('/sessions/:id/entries', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const form = await c.req.parseBody();
    const draft = { text: text(form.text), label: text(form.label) };
    try {
      const entry = await saveToSession(
        c.env.DB,
        c.env.STATE_ENCRYPTION_KEY,
        { uid, clientId: WEBSITE_CLIENT },
        c.get('now'),
        c.req.param('id'),
        draft.text,
        draft.label,
      );
      if (!entry) return notFound(c, 'session');
      return c.redirect(`/sessions/${c.req.param('id')}`, 303);
    } catch (error) {
      if (!(error instanceof SessionError)) throw error;
      return showSession(c, uid, error.message, draft);
    }
  });

  app.post('/sessions/:id/entries/:entry/delete', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    if (!(await deleteEntry(c.env.DB, uid, c.req.param('id'), c.req.param('entry'))))
      return notFound(c, 'entry');
    return c.redirect(`/sessions/${c.req.param('id')}`, 303);
  });

  app.get('/sessions/:id/delete', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const session = (await listSessions(c.env.DB, uid)).find(
      (s) => s.id === c.req.param('id') && s.role === 'owner',
    );
    if (!session) return notFound(c, 'session');
    return html(
      c,
      pages.confirmDelete(
        'session',
        session.title,
        `/sessions/${session.id}/delete`,
        `/sessions/${session.id}`,
        'Every entry is deleted, for every member.',
      ),
    );
  });

  app.post('/sessions/:id/delete', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    if (!(await deleteSession(c.env.DB, uid, c.req.param('id')))) return notFound(c, 'session');
    return c.redirect('/sessions', 303);
  });

  // ---- Members and invitations (website only: DESIGN D7) ------------------------------------

  app.post('/sessions/:id/invitations', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const id = c.req.param('id');
    const needsHandle = await requireHandle(c, uid, `/sessions/${id}`);
    if (needsHandle) return needsHandle;
    const role = (await c.req.parseBody()).role === 'viewer' ? 'viewer' : 'editor';
    try {
      const created = await createInvitation(
        c.env.DB,
        c.env.SESSION_PEPPER,
        uid,
        c.get('now'),
        id,
        role,
      );
      if (!created) return notFound(c, 'session');
      return await showSession(
        c,
        uid,
        null,
        undefined,
        `${c.env.SITE_ORIGIN}/join/${created.token}`,
      );
    } catch (error) {
      if (!(error instanceof SessionError)) throw error;
      return showSession(c, uid, error.message);
    }
  });

  app.post('/sessions/:id/invitations/:invitation/revoke', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    if (!(await revokeInvitation(c.env.DB, uid, c.req.param('id'), c.req.param('invitation')))) {
      return notFound(c, 'invitation');
    }
    return c.redirect(`/sessions/${c.req.param('id')}`, 303);
  });

  app.post('/sessions/:id/members/:member/remove', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    if (!(await removeMember(c.env.DB, uid, c.req.param('id'), c.req.param('member')))) {
      return notFound(c, 'member');
    }
    return c.redirect(`/sessions/${c.req.param('id')}`, 303);
  });

  app.post('/sessions/:id/leave', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    if (!(await removeMember(c.env.DB, uid, c.req.param('id'), uid))) return notFound(c, 'session');
    return c.redirect('/sessions', 303);
  });

  app.get('/join/:token', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const token = c.req.param('token');
    const needsHandle = await requireHandle(c, uid, `/join/${token}`);
    if (needsHandle) return needsHandle;
    const invitation = await previewInvitation(
      c.env.DB,
      c.env.SESSION_PEPPER,
      uid,
      c.get('now'),
      token,
    );
    if (!invitation) {
      return html(
        c,
        pages.problem(
          viewer(c),
          'Link not valid',
          'This invitation link was used, revoked or has expired. Ask for a new one.',
        ),
        404,
      );
    }
    return html(c, pages.joinPage(invitation, token));
  });

  app.post('/join/:token', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const token = c.req.param('token');
    const needsHandle = await requireHandle(c, uid, `/join/${token}`);
    if (needsHandle) return needsHandle;
    const sessionId = await acceptInvitation(
      c.env.DB,
      c.env.SESSION_PEPPER,
      uid,
      c.get('now'),
      token,
    );
    if (!sessionId) {
      return html(
        c,
        pages.problem(
          viewer(c),
          'Link not valid',
          'This invitation link was used, revoked or has expired.',
        ),
        404,
      );
    }
    return c.redirect(`/sessions/${sessionId}`, 303);
  });

  // ---- Handle, explore, publishing --------------------------------------------------------------

  app.get('/welcome', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const current = await handleOf(c.env.DB, uid);
    return html(
      c,
      pages.handlePage(current, current ?? '', null, safeReturnTo(c.req.query('return'))),
    );
  });

  app.post('/welcome', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const returnTo = safeReturnTo(c.req.query('return'));
    const value = text((await c.req.parseBody()).handle);
    try {
      await setHandle(c.env.DB, uid, c.get('now'), value);
      return c.redirect(returnTo ?? '/account', 303);
    } catch (error) {
      if (!(error instanceof ProfileError)) throw error;
      return html(
        c,
        pages.handlePage(await handleOf(c.env.DB, uid), value, error.message, returnTo),
        400,
      );
    }
  });

  app.get('/explore', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const query = c.req.query('q') ?? '';
    return html(
      c,
      pages.explore(await searchPrompts(c.env.DB, uid, { query, scope: 'public' }), query),
    );
  });

  app.get('/p/:id', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const prompt = await getPrompt(c.env.DB, uid, c.req.param('id'));
    if (!prompt) return notFound(c, 'prompt');
    return html(c, pages.publicPrompt(prompt, c.env.SITE_ORIGIN));
  });

  app.post('/p/:id/copy', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    try {
      const copy = await copyPrompt(c.env.DB, uid, c.get('now'), c.req.param('id'));
      if (!copy) return notFound(c, 'prompt');
      return c.redirect(`/prompts/${copy.id}`, 303);
    } catch (error) {
      if (!(error instanceof PromptError)) throw error;
      return html(c, pages.problem(viewer(c), 'Not copied', error.message), 400);
    }
  });

  app.get('/prompts/:id/publish', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const prompt = await ownPrompt(c, uid);
    if (!prompt) return notFound(c, 'prompt');
    const handle = await handleOf(c.env.DB, uid);
    if (!handle)
      return c.redirect(
        `/welcome?return=${encodeURIComponent(`/prompts/${prompt.id}/publish`)}`,
        303,
      );
    return html(c, pages.publishPreview(prompt, handle));
  });

  app.post('/prompts/:id/publish', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    try {
      const prompt = await publishPrompt(c.env.DB, uid, c.get('now'), c.req.param('id'));
      if (!prompt) return notFound(c, 'prompt');
      return c.redirect(`/p/${prompt.id}`, 303);
    } catch (error) {
      if (!(error instanceof PromptError)) throw error;
      return html(c, pages.problem(viewer(c), 'Not made public', error.message), 400);
    }
  });

  // ---- Statements of reasons and contesting them ----------------------------------------------

  async function alreadyContested(c: AppContext, uid: string, decisionId: string) {
    const row = await c.env.DB.prepare(
      "SELECT 1 AS yes FROM messages WHERE kind = 'appeal' AND uid = ? AND decision_id = ?",
    )
      .bind(uid, decisionId)
      .first<{ yes: number }>();
    return row !== null;
  }

  app.get('/decisions/:id', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const decision = await decisionAbout(c.env.DB, uid, c.req.param('id'));
    if (!decision) return notFound(c, 'decision');
    return html(c, pages.decisionPage(decision, await alreadyContested(c, uid, decision.id)));
  });

  app.post('/decisions/:id/contest', async (c) => {
    const uid = requireUser(c);
    if (typeof uid !== 'string') return uid;
    const decision = await decisionAbout(c.env.DB, uid, c.req.param('id'));
    if (!decision) return notFound(c, 'decision');
    if (await alreadyContested(c, uid, decision.id))
      return c.redirect(`/decisions/${decision.id}`, 303);
    const body = text((await c.req.parseBody()).body).slice(0, 10_000);
    if (!body.trim()) return html(c, pages.decisionPage(decision, false), 400);
    const message = { kind: 'appeal' as const, name: '', email: '', body };
    const id = await storeMessage(c.env.DB, c.get('now'), {
      ...message,
      uid,
      decisionId: decision.id,
    });
    c.executionCtx.waitUntil(notifyOwner(c.env, c.get('now'), id, message));
    return c.redirect(`/decisions/${decision.id}`, 303);
  });

  // ---- Moderation: the owner only, after a second factor verified through login ------------

  /** Moderation needs the owner's account and a second factor verified in the last 15 minutes. */
  const ADMIN_FRESHNESS_SECONDS = 15 * 60;
  function requireOwner(c: AppContext): true | Response {
    const session = c.get('session');
    if (!session || session.uid !== c.env.OWNER_UID) {
      if (!session)
        return c.redirect(`/signin?admin=1&return=${encodeURIComponent(c.req.path)}`, 302);
      return notFound(c);
    }
    if (session.aal2At === null || c.get('now') - session.aal2At > ADMIN_FRESHNESS_SECONDS) {
      if (c.req.method !== 'GET') return notFound(c);
      return c.redirect(`/signin?admin=1&return=${encodeURIComponent(c.req.path)}`, 302);
    }
    return true;
  }

  const emptyDecision = { action: '', ground: '', law: '', explanation: '', suspendDays: '' };

  async function showMessage(
    c: AppContext,
    id: string,
    form = emptyDecision,
    error: string | null = null,
  ) {
    const message = await getMessage(c.env.DB, id);
    if (!message) return notFound(c);
    const contested = message.decisionId ? await decisionById(c.env.DB, message.decisionId) : null;
    const content = contested
      ? await contentOfDecision(c.env.DB, c.env.STATE_ENCRYPTION_KEY, c.env.SITE_ORIGIN, contested)
      : await resolveContent(
          c.env.DB,
          c.env.STATE_ENCRYPTION_KEY,
          c.env.SITE_ORIGIN,
          message.contentUrl,
        );
    const decision = await decisionForMessage(c.env.DB, message.id);
    return html(
      c,
      pages.adminMessage(message, content, decision, contested, form, error),
      error ? 400 : 200,
    );
  }

  app.get('/admin', async (c) => {
    const owner = requireOwner(c);
    if (owner !== true) return owner;
    const open = c.req.query('closed') !== '1';
    return html(c, pages.adminList(await listMessages(c.env.DB, open), open));
  });

  app.get('/admin/messages/:id', async (c) => {
    const owner = requireOwner(c);
    if (owner !== true) return owner;
    return showMessage(c, c.req.param('id'));
  });

  app.post('/admin/messages/:id/decide', async (c) => {
    const owner = requireOwner(c);
    if (owner !== true) return owner;
    const id = c.req.param('id');
    const message = await getMessage(c.env.DB, id);
    if (!message || message.kind === 'contact' || message.closedAt !== null) return notFound(c);
    const raw = await c.req.parseBody();
    const form = {
      action: text(raw.action),
      ground: text(raw.ground),
      law: text(raw.law),
      explanation: text(raw.explanation),
      suspendDays: text(raw.suspendDays),
    };
    const contested = message.decisionId ? await decisionById(c.env.DB, message.decisionId) : null;
    const content = contested
      ? await contentOfDecision(c.env.DB, c.env.STATE_ENCRYPTION_KEY, c.env.SITE_ORIGIN, contested)
      : await resolveContent(
          c.env.DB,
          c.env.STATE_ENCRYPTION_KEY,
          c.env.SITE_ORIGIN,
          message.contentUrl,
        );
    try {
      await decide(c.env.DB, c.get('now'), {
        messageId: id,
        content,
        action: form.action as Action,
        ground: form.ground === 'illegal' || form.ground === 'terms' ? form.ground : null,
        law: form.law,
        explanation: form.explanation,
        suspendDays: Number.parseInt(form.suspendDays, 10),
      });
      return c.redirect(`/admin/messages/${id}`, 303);
    } catch (error) {
      if (!(error instanceof ModerationError)) throw error;
      return showMessage(c, id, form, error.message);
    }
  });

  app.post('/admin/messages/:id/close', async (c) => {
    const owner = requireOwner(c);
    if (owner !== true) return owner;
    await closeMessage(c.env.DB, c.get('now'), c.req.param('id'));
    return c.redirect('/admin', 303);
  });

  // ---- Contact and reports ------------------------------------------------------------------

  app.get('/contact', (c) =>
    html(c, pages.contactPage(viewer(c), { name: '', email: '', body: '' }, {})),
  );

  app.post('/contact', async (c) => {
    const form = await c.req.parseBody();
    const input = { name: text(form.name), email: text(form.email).trim(), body: text(form.body) };
    const errors = validateContact(input);
    if (Object.keys(errors).length)
      return html(c, pages.contactPage(viewer(c), input, errors), 400);
    if (!(await underRateLimit(c, 'contact'))) {
      return html(
        c,
        pages.problem(viewer(c), 'Too many messages', 'Wait a minute and send it again.'),
        429,
      );
    }
    const id = await storeMessage(c.env.DB, c.get('now'), {
      kind: 'contact',
      uid: c.get('session')?.uid ?? null,
      ...input,
    });
    c.executionCtx.waitUntil(notifyOwner(c.env, c.get('now'), id, { kind: 'contact', ...input }));
    return html(c, pages.thanks(viewer(c), 'contact', id, true));
  });

  app.get('/report', (c) =>
    html(
      c,
      pages.reportPage(
        viewer(c),
        {
          contentUrl: c.req.query('url') ?? '',
          category: '',
          body: '',
          name: '',
          email: '',
          goodFaith: false,
        },
        {},
        c.env.SITE_ORIGIN,
      ),
    ),
  );

  app.post('/report', async (c) => {
    const form = await c.req.parseBody();
    const input = {
      contentUrl: text(form.contentUrl).trim(),
      category: text(form.category),
      body: text(form.body),
      name: text(form.name),
      email: text(form.email).trim(),
      goodFaith: form.goodFaith === 'yes',
    };
    const errors = validateReport(input, c.env.SITE_ORIGIN);
    if (Object.keys(errors).length)
      return html(c, pages.reportPage(viewer(c), input, errors, c.env.SITE_ORIGIN), 400);
    if (!(await underRateLimit(c, 'report'))) {
      return html(
        c,
        pages.problem(viewer(c), 'Too many reports', 'Wait a minute and send it again.'),
        429,
      );
    }
    const id = await storeMessage(c.env.DB, c.get('now'), {
      kind: 'report',
      uid: c.get('session')?.uid ?? null,
      ...input,
    });
    c.executionCtx.waitUntil(notifyOwner(c.env, c.get('now'), id, { kind: 'report', ...input }));
    return html(c, pages.thanks(viewer(c), 'report', id, input.email !== ''));
  });

  // ---- Static files and everything else ------------------------------------------------------

  app.get('/app.css', (c) => c.env.ASSETS.fetch(c.req.raw));
  app.get('/favicon.svg', (c) => c.env.ASSETS.fetch(c.req.raw));
  app.get('/fonts/*', (c) => c.env.ASSETS.fetch(c.req.raw));

  app.notFound((c) => notFound(c));
  app.onError((error, c) => {
    console.error('website error', error.name);
    return html(c, pages.problem(viewer(c), 'Something went wrong', 'Try again in a moment.'), 500);
  });

  return app;
}
