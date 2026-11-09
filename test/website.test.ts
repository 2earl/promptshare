import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteUserData, exportUserData } from '../src/account';
import { acceptInvitation } from '../src/sessions';
import { safeReturnTo } from '../src/web/http';
import { getMessage, moderationCleanup } from '../src/moderation';
import { remindOwner, sendDecision, sendReceipt } from '../src/notices';
import { mimeMessage, notifyOwner } from '../src/web/messages';
import { shareCleanup, sharePrompt } from '../src/shares';
import { addMember, connect, count, parsed, publicPrompt, resetDatabase, tool } from './helpers';

const ORIGIN = 'https://promptshare.cc';
const SAME_ORIGIN = { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' };

beforeEach(async () => {
  await resetDatabase();
  await env.DB.batch(
    ['signin_tx', 'web_sessions', 'messages', 'moderation_decisions', 'consents', 'settings'].map(
      (t) => env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

/** A fresh network per request, so the per-network rate limit doesn't interfere. */
const ip = () => `198.51.100.${String(Math.floor(Math.random() * 250))}`;

function get(path: string, cookie = '') {
  return exports.default.fetch(
    new Request(`${ORIGIN}${path}`, {
      headers: { Cookie: cookie, 'CF-Connecting-IP': ip() },
      redirect: 'manual',
    }),
  );
}

function post(path: string, fields: Record<string, string>, cookie = '', headers = SAME_ORIGIN) {
  return exports.default.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        ...headers,
        Cookie: cookie,
        'CF-Connecting-IP': ip(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields),
      redirect: 'manual',
    }),
  );
}

function cookieFrom(response: Response, name: string): string {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    if (pair?.startsWith(`${name}=`)) return pair;
  }
  return '';
}

/** Signs in through the real flow, with login replaced by the stand-in in vitest.config.ts. */
async function signIn(uid = 'user-1', returnTo = '/prompts') {
  const start = await get(`/signin?return=${encodeURIComponent(returnTo)}`);
  const authorize = new URL(start.headers.get('Location') ?? '');
  const tx = cookieFrom(start, '__Host-signin');
  const code = `${uid}.${authorize.searchParams.get('code_challenge') ?? ''}`;
  const state = authorize.searchParams.get('state') ?? '';
  const done = await get(
    `/callback?code=${encodeURIComponent(code)}&state=${state}&iss=${encodeURIComponent('https://login.2earl.com')}`,
    tx,
  );
  return { done, cookie: cookieFrom(done, '__Host-session'), authorize, tx, code, state };
}

describe('pages and headers', () => {
  it('serves the start page with strict security headers and no scripts', async () => {
    const response = await get('/');
    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain('https://mcp.2earl.com/promptshare');
    expect(page).not.toContain('<script');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=63072000');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('publishes its client metadata document for login (CIMD)', async () => {
    const response = await get('/oauth/client.json');
    expect(await response.json()).toEqual({
      client_id: 'https://promptshare.cc/oauth/client.json',
      client_name: 'Prompt share',
      client_uri: 'https://promptshare.cc',
      redirect_uris: ['https://promptshare.cc/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'promptshare:account',
    });
  });

  it('serves the stylesheet with the security headers', async () => {
    const response = await get('/app.css');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('.slip');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('answers unknown paths with a 404 page', async () => {
    expect((await get('/nope')).status).toBe(404);
  });
});

describe('signing in with 2earl', () => {
  it('sends the browser to login with PKCE, its client ID and its own resource', async () => {
    const { authorize } = await signIn();
    expect(`${authorize.origin}${authorize.pathname}`).toBe('https://login.2earl.com/authorize');
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'https://promptshare.cc/oauth/client.json',
      redirect_uri: 'https://promptshare.cc/callback',
      scope: 'promptshare:account',
      code_challenge_method: 'S256',
      resource: 'https://promptshare.cc',
    });
  });

  it('signs in, goes back where the user was, and stores only a hash of the cookie', async () => {
    const { done, cookie } = await signIn('user-1', '/sessions');
    expect(done.status).toBe(302);
    // Asked once about sensitive data, then back where the user was going.
    expect(done.headers.get('Location')).toBe('/consent?return=%2Fsessions');
    expect(done.headers.getSetCookie().join()).toContain('HttpOnly; SameSite=Lax');
    expect(cookie).toMatch(/^__Host-session=/);
    const value = cookie.split('=')[1] ?? '';
    expect(await count('web_sessions', 'id_hash = ?', value)).toBe(0);
    expect(await count('web_sessions', "uid = 'user-1'")).toBe(1);
    expect((await get('/prompts', cookie)).status).toBe(200);
  });

  it('refuses a replayed callback, a wrong state, a missing cookie and another issuer', async () => {
    const { tx, code, state } = await signIn();
    expect((await get(`/callback?code=${code}&state=${state}`, tx)).status).toBe(400); // used up
    const fresh = await get('/signin');
    const freshTx = cookieFrom(fresh, '__Host-signin');
    const params = new URL(fresh.headers.get('Location') ?? '').searchParams;
    const goodCode = `u.${params.get('code_challenge') ?? ''}`;
    expect((await get(`/callback?code=${goodCode}&state=wrong`, freshTx)).status).toBe(400);
    expect(
      (await get(`/callback?code=${goodCode}&state=${params.get('state') ?? ''}`)).status,
    ).toBe(400);
    const again = await get('/signin');
    const againParams = new URL(again.headers.get('Location') ?? '').searchParams;
    const evil = await get(
      `/callback?code=u.${againParams.get('code_challenge') ?? ''}&state=${againParams.get('state') ?? ''}&iss=https://evil.example`,
      cookieFrom(again, '__Host-signin'),
    );
    expect(evil.status).toBe(400);
    expect(await count('web_sessions')).toBe(1); // only the first sign-in
  });

  it('refuses a code whose verifier doesn’t match (PKCE)', async () => {
    const start = await get('/signin');
    const params = new URL(start.headers.get('Location') ?? '').searchParams;
    const response = await get(
      `/callback?code=user-1.not-the-challenge&state=${params.get('state') ?? ''}`,
      cookieFrom(start, '__Host-signin'),
    );
    expect(response.status).toBe(400);
    expect(await count('web_sessions')).toBe(0);
  });

  it('returns only to paths on this site', () => {
    expect(safeReturnTo('/prompts?q=x')).toBe('/prompts?q=x');
    expect(safeReturnTo('//evil.example')).toBeNull();
    expect(safeReturnTo('https://evil.example')).toBeNull();
    expect(safeReturnTo('/\\evil.example')).toBeNull();
  });

  it('sends signed-out visitors to sign in, and signs out', async () => {
    const response = await get('/sessions');
    expect(response.headers.get('Location')).toBe('/signin?return=%2Fsessions');
    const { cookie } = await signIn();
    const out = await post('/signout', {}, cookie);
    expect(out.status).toBe(303);
    expect(await count('web_sessions')).toBe(0);
    expect((await get('/prompts', cookie)).status).toBe(302);
  });
});

describe('prompts on the website', () => {
  it('creates, shows (escaped), changes and deletes a prompt', async () => {
    const { cookie } = await signIn();
    const created = await post(
      '/prompts',
      {
        title: '<script>alert(1)</script>',
        body: 'Hello {{name}}',
        tags: 'a, b, a',
        models: 'Claude',
      },
      cookie,
    );
    expect(created.status).toBe(303);
    const path = created.headers.get('Location') ?? '';
    const page = await (await get(path, cookie)).text();
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(page).not.toContain('<script>alert(1)');
    expect(page).toContain('value="a, b"');

    await post(path, { title: 'Greeting', body: 'Hi', tags: '', models: '' }, cookie);
    expect(await (await get('/prompts?q=greet', cookie)).text()).toContain('Greeting');

    expect((await get(`${path}/delete`, cookie)).status).toBe(200);
    expect((await post(`${path}/delete`, {}, cookie)).status).toBe(303);
    expect(await count('prompts')).toBe(0);
  });

  it('shows the form again with the reason when a prompt is invalid', async () => {
    const { cookie } = await signIn();
    const response = await post('/prompts', { title: '', body: 'x' }, cookie);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('A prompt needs a title.');
  });

  it('keeps other people’s prompts out of reach', async () => {
    const one = await signIn('user-1');
    const created = await post('/prompts', { title: 'Mine', body: 'secret' }, one.cookie);
    const path = created.headers.get('Location') ?? '';
    const two = await signIn('user-2');
    expect((await get(path, two.cookie)).status).toBe(404);
    expect((await post(path, { title: 'x', body: 'y' }, two.cookie)).status).toBe(404);
    expect((await post(`${path}/delete`, {}, two.cookie)).status).toBe(404);
    expect(await count('prompts', "body = 'secret'")).toBe(1);
  });

  it('refuses form posts from other sites', async () => {
    const { cookie } = await signIn();
    const cross = await post('/prompts', { title: 't', body: 'b' }, cookie, {
      Origin: 'https://evil.example',
      'Sec-Fetch-Site': 'cross-site',
    });
    expect(cross.status).toBe(403);
    const noOrigin = await post(
      '/prompts',
      { title: 't', body: 'b' },
      cookie,
      {} as typeof SAME_ORIGIN,
    );
    expect(noOrigin.status).toBe(403);
    expect(await count('prompts')).toBe(0);
  });
});

describe('shared sessions on the website', () => {
  it('creates a session, adds and deletes entries, and deletes the session', async () => {
    const { cookie } = await signIn();
    const created = await post('/sessions', { title: 'Trip' }, cookie);
    const path = created.headers.get('Location') ?? '';
    await post(`${path}/entries`, { text: 'Decided: <b>Lisbon</b>', label: 'decision' }, cookie);
    const page = await (await get(path, cookie)).text();
    expect(page).toContain('Decided: &lt;b&gt;Lisbon&lt;/b&gt;');
    expect(page).toContain('<strong>decision</strong> · You');

    const entry = await env.DB.prepare('SELECT id, client_id FROM session_entries').first<{
      id: string;
      client_id: string;
    }>();
    expect(entry?.client_id).toBe('promptshare.cc');
    await post(`${path}/entries/${entry?.id ?? ''}/delete`, {}, cookie);
    expect(await count('session_entries')).toBe(0);

    expect((await get(`${path}/delete`, cookie)).status).toBe(200);
    await post(`${path}/delete`, {}, cookie);
    expect(await count('shared_sessions')).toBe(0);
  });

  it('marks other members’ entries and refuses credentials where others can read', async () => {
    const owner = await signIn('user-1');
    const path =
      (await post('/sessions', { title: 'Shared' }, owner.cookie)).headers.get('Location') ?? '';
    const id = path.split('/').at(-1) ?? '';
    await addMember(id, 'user-2', 'editor');
    const member = await signIn('user-2');
    await post(`${path}/entries`, { text: 'from the member' }, member.cookie);
    expect(await (await get(path, owner.cookie)).text()).toContain('a member without a handle');

    const refused = await post(`${path}/entries`, { text: 'AKIAIOSFODNN7EXAMPLE' }, owner.cookie);
    expect(refused.status).toBe(400);
    const page = await refused.text();
    expect(page).toContain('looks like a AWS access key');
    // The draft is kept, so nothing typed is lost.
    expect(page).toContain('AKIAIOSFODNN7EXAMPLE</textarea>');
    expect((await get(path, (await signIn('user-3')).cookie)).status).toBe(404);
  });
});

describe('contact and reports', () => {
  it('stores a contact message and shows a reference', async () => {
    const response = await post('/contact', {
      name: 'Ada',
      email: 'ada@example.com',
      body: 'Hello',
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Reference:');
    expect(await count('messages', "kind = 'contact' AND email = 'ada@example.com'")).toBe(1);
  });

  it('asks again with reasons when the contact form is incomplete', async () => {
    const response = await post('/contact', { name: '', email: 'not an email', body: '' });
    expect(response.status).toBe(400);
    const page = await response.text();
    expect(page).toContain('Enter an email address we can answer.');
    expect(page).toContain('aria-invalid="true"');
    expect(await count('messages')).toBe(0);
  });

  it('takes reports with what the DSA requires, and without name and email only for abuse material', async () => {
    const base = {
      contentUrl: 'https://promptshare.cc/prompts/x',
      category: 'illegal',
      body: 'It is defamatory.',
      goodFaith: 'yes',
    };
    const anonymous = await post('/report', { ...base, name: '', email: '' });
    expect(anonymous.status).toBe(400);
    expect(await anonymous.text()).toContain('Enter your email address');

    const elsewhere = await post('/report', {
      ...base,
      contentUrl: 'https://evil.example/x',
      name: 'A',
      email: 'a@example.com',
    });
    expect(await elsewhere.text()).toContain('Paste the link to the content');

    const noGoodFaith = await post('/report', {
      ...base,
      goodFaith: '',
      name: 'A',
      email: 'a@example.com',
    });
    expect(await noGoodFaith.text()).toContain('Confirm that the report is accurate');

    expect((await post('/report', { ...base, name: 'A', email: 'a@example.com' })).status).toBe(
      200,
    );
    expect((await post('/report', { ...base, category: 'csam', name: '', email: '' })).status).toBe(
      200,
    );
    expect(await count('messages', "kind = 'report'")).toBe(2);
    expect(await count('messages', "kind = 'report' AND good_faith = 1")).toBe(2);
  });

  it('emails the owner when CONTACT_TO is set, and builds the email safely', async () => {
    const sent: unknown[] = [];
    const mailEnv = Object.create(env) as Env & { CONTACT_TO?: string };
    Object.defineProperty(mailEnv, 'CONTACT_TO', { value: 'owner@example.com' });
    Object.defineProperty(mailEnv, 'MAILER', {
      value: {
        send: (message: unknown) => {
          sent.push(message);
          return Promise.resolve();
        },
      },
    });
    await env.DB.prepare(
      "INSERT INTO messages (id, kind, email, body, created_at) VALUES ('m1', 'contact', 'a@example.com', 'hi', 1)",
    ).run();
    expect(
      await notifyOwner(mailEnv, 2, 'm1', {
        kind: 'contact',
        name: '',
        email: 'a@example.com',
        body: 'hi',
      }),
    ).toBe(true);
    expect(sent).toHaveLength(1);
    expect(await count('messages', 'notified_at = 2')).toBe(1);
    // Without the secret, nothing is sent.
    expect(
      await notifyOwner(env, 2, 'm1', {
        kind: 'contact',
        name: '',
        email: 'a@example.com',
        body: 'hi',
      }),
    ).toBe(false);

    const raw = mimeMessage({
      from: 'promptshare@2earl.com',
      to: 'owner@example.com',
      replyTo: 'x@example.com\r\nBcc: victim@example.com',
      subject: 'Hello\r\nBcc: victim@example.com',
      text: 'line one\nline two',
      messageId: 'id',
      date: new Date(0),
    });
    const headers = raw.split('\r\n\r\n')[0] ?? '';
    expect(headers).not.toMatch(/^Bcc:/m);
    expect(headers).not.toContain('Reply-To'); // an invalid address is left out
  });
});

describe('account deletion covers the website', () => {
  it('ends the user’s website sessions and keeps their messages without saying who', async () => {
    const { cookie } = await signIn('user-1');
    await post('/contact', { email: 'a@example.com', body: 'hi', name: '' }, cookie);
    const exported = await exportUserData(env.DB, env.STATE_ENCRYPTION_KEY, 'user-1');
    expect(exported.messages).toEqual([expect.objectContaining({ kind: 'contact', text: 'hi' })]);
    await deleteUserData(env.DB, 'user-1', 10);
    expect(await count('web_sessions')).toBe(0);
    expect(await count('messages', "uid = 'user-1'")).toBe(0);
    expect(await count('messages')).toBe(1);
    expect((await get('/prompts', cookie)).status).toBe(302);
  });
});

// ---- Phase C2: handles, publishing, invitations ------------------------------------------------

async function withHandle(uid: string, handle: string) {
  const session = await signIn(uid);
  const saved = await post('/welcome', { handle }, session.cookie);
  expect(saved.status).toBe(303);
  return session.cookie;
}

describe('handles', () => {
  it('validates, reserves and keeps handles unique regardless of case', async () => {
    const { cookie } = await signIn('user-1');
    expect(await (await post('/welcome', { handle: 'A' }, cookie)).text()).toContain('Use 3 to 30');
    expect(await (await post('/welcome', { handle: 'support' }, cookie)).text()).toContain(
      'reserved',
    );
    expect(await (await post('/welcome', { handle: 'my-2earl-team' }, cookie)).text()).toContain(
      'reserved',
    );
    expect((await post('/welcome', { handle: '@Ada' }, cookie)).status).toBe(303);
    expect(await (await get('/account', cookie)).text()).toContain('@ada');

    const other = await signIn('user-2');
    expect(await (await post('/welcome', { handle: 'ADA' }, other.cookie)).text()).toContain(
      'taken',
    );
  });
});

describe('publishing and public prompts', () => {
  it('asks for a handle, previews, publishes; others find, read and copy it', async () => {
    const { cookie } = await signIn('user-1');
    const path =
      (
        await post(
          '/prompts',
          { title: 'Release notes', body: 'Write release notes for {{diff}}' },
          cookie,
        )
      ).headers.get('Location') ?? '';
    const id = path.split('/').at(-1) ?? '';
    expect((await get(`${path}/publish`, cookie)).headers.get('Location')).toBe(
      `/welcome?return=${encodeURIComponent(`${path}/publish`)}`,
    );
    // Not public without a handle, even when posted directly.
    expect((await post(`${path}/publish`, {}, cookie)).status).toBe(400);

    await post('/welcome', { handle: 'ada' }, cookie);
    const preview = await (await get(`${path}/publish`, cookie)).text();
    expect(preview).toContain('Write release notes for {{diff}}');
    expect(preview).toContain('@ada');
    expect((await post(`${path}/publish`, {}, cookie)).headers.get('Location')).toBe(`/p/${id}`);

    const reader = await signIn('user-2');
    const explore = await (await get('/explore?q=release', reader.cookie)).text();
    expect(explore).toContain('Release notes');
    expect(explore).toContain('@ada');
    const page = await (await get(`/p/${id}`, reader.cookie)).text();
    expect(page).toContain('Copy to my prompts');
    expect(page).toContain(`/report?url=${encodeURIComponent(`https://promptshare.cc/p/${id}`)}`);
    const copied = await post(`/p/${id}/copy`, {}, reader.cookie);
    expect(
      await count(
        'prompts',
        "owner_uid = 'user-2' AND copied_from = ? AND visibility = 'private'",
        id,
      ),
    ).toBe(1);
    expect(copied.status).toBe(303);
    // The reader can't change or publish the original.
    expect((await post(`/prompts/${id}/publish`, {}, reader.cookie)).status).toBe(404);
    expect((await post(`/prompts/${id}`, { title: 'x', body: 'y' }, reader.cookie)).status).toBe(
      404,
    );

    // Private again: gone for others at once.
    await post(`${path}/unpublish`, {}, cookie);
    expect((await get(`/p/${id}`, reader.cookie)).status).toBe(404);
  });

  it('never publishes a prompt moderation restricted', async () => {
    const cookie = await withHandle('user-1', 'ada');
    const path =
      (await post('/prompts', { title: 'T', body: 'B' }, cookie)).headers.get('Location') ?? '';
    await env.DB.prepare("UPDATE prompts SET status = 'restricted'").run();
    const response = await post(`${path}/publish`, {}, cookie);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('restricted by moderation');
    expect(await count('prompts', "visibility = 'public'")).toBe(0);
  });
});

describe('invitations and members', () => {
  async function sessionWithLink(role: 'editor' | 'viewer' = 'editor') {
    const owner = await withHandle('user-1', 'owner-one');
    const path =
      (await post('/sessions', { title: 'Team notes' }, owner)).headers.get('Location') ?? '';
    const page = await (await post(`${path}/invitations`, { role }, owner)).text();
    const link = /https:\/\/promptshare\.cc\/join\/([A-Za-z0-9_-]+)/.exec(page);
    expect(link).not.toBeNull();
    return { owner, path, sessionId: path.split('/').at(-1) ?? '', token: link?.[1] ?? '' };
  }

  it('stores only a hash of the link, and joins once by a signed-in person with a handle', async () => {
    const { owner, path, token } = await sessionWithLink();
    expect(await count('invitations', 'token_hash = ?', token)).toBe(0);

    expect((await get(`/join/${token}`)).headers.get('Location')).toBe(
      `/signin?return=${encodeURIComponent(`/join/${token}`)}`,
    );
    const guest = await signIn('user-2');
    expect((await get(`/join/${token}`, guest.cookie)).headers.get('Location')).toBe(
      `/welcome?return=${encodeURIComponent(`/join/${token}`)}`,
    );
    await post('/welcome', { handle: 'guest' }, guest.cookie);
    const join = await (await get(`/join/${token}`, guest.cookie)).text();
    expect(join).toContain('Join “Team notes”?');
    expect(join).toContain('@owner-one');
    // Joining is a form post: an assistant following a link can't join.
    expect(await count('session_members', "uid = 'user-2'")).toBe(0);
    expect((await post(`/join/${token}`, {}, guest.cookie)).headers.get('Location')).toBe(path);

    await post(`${path}/entries`, { text: 'from the guest' }, guest.cookie);
    expect(await (await get(path, owner)).text()).toContain('@guest');

    // Used up.
    const third = await withHandle('user-3', 'third');
    expect((await get(`/join/${token}`, third)).status).toBe(404);
    expect((await post(`/join/${token}`, {}, third)).status).toBe(404);
    expect(await count('session_members', "uid = 'user-3'")).toBe(0);
  });

  it('lets the owner revoke links and remove people, and members leave', async () => {
    const { owner, path, sessionId, token } = await sessionWithLink('viewer');
    const invitation = await env.DB.prepare('SELECT id FROM invitations').first<{ id: string }>();
    await post(`${path}/invitations/${invitation?.id ?? ''}/revoke`, {}, owner);
    const guest = await withHandle('user-2', 'guest');
    expect((await post(`/join/${token}`, {}, guest)).status).toBe(404);

    await addMember(sessionId, 'user-2', 'viewer');
    // A viewer can't add entries, invite, or remove others.
    expect((await post(`${path}/entries`, { text: 'x' }, guest)).status).toBe(400);
    expect((await post(`${path}/invitations`, { role: 'editor' }, guest)).status).toBe(404);
    expect((await post(`${path}/members/user-1/remove`, {}, guest)).status).toBe(404);

    await post(`${path}/members/user-2/remove`, {}, owner);
    expect(await count('session_members', "uid = 'user-2'")).toBe(0);
    await addMember(sessionId, 'user-2', 'editor');
    expect((await post(`${path}/leave`, {}, guest)).headers.get('Location')).toBe('/sessions');
    expect(await count('session_members', "uid = 'user-2'")).toBe(0);
    // The owner can't leave their own session.
    expect((await post(`${path}/leave`, {}, owner)).status).toBe(404);
  });

  it('lets only one of two simultaneous joins use a link', async () => {
    const { sessionId, token } = await sessionWithLink();
    const [a, b] = await Promise.all([
      acceptInvitation(env.DB, env.SESSION_PEPPER, 'user-2', 100, token),
      acceptInvitation(env.DB, env.SESSION_PEPPER, 'user-3', 100, token),
    ]);
    expect([a, b].filter((x) => x === sessionId)).toHaveLength(1);
    expect(await count('session_members', "uid IN ('user-2', 'user-3')")).toBe(1);
  });

  it('doesn’t let one member remove another', async () => {
    const { path, sessionId } = await sessionWithLink();
    await addMember(sessionId, 'user-2', 'editor');
    await addMember(sessionId, 'user-3', 'editor');
    const two = await withHandle('user-2', 'two');
    expect((await post(`${path}/members/user-3/remove`, {}, two)).status).toBe(404);
    expect(await count('session_members', "uid = 'user-3'")).toBe(1);
  });

  it('refuses expired links and caps members, counting open links', async () => {
    const { owner, path, sessionId, token } = await sessionWithLink();
    await env.DB.prepare('UPDATE invitations SET expires_at = 1').run();
    expect((await get(`/join/${token}`, await withHandle('user-2', 'guest'))).status).toBe(404);

    for (let i = 0; i < 19; i++) await addMember(sessionId, `member-${String(i)}`, 'viewer');
    const full = await post(`${path}/invitations`, { role: 'viewer' }, owner);
    expect(await full.text()).toContain('20 members');
  });

  it('deletes the user’s handle and links with the account', async () => {
    await sessionWithLink();
    await deleteUserData(env.DB, 'user-1', 10);
    expect(await count('profiles')).toBe(0);
    expect(await count('invitations')).toBe(0);
  });
});

// ---- Phase C2b: moderation ------------------------------------------------------------------

describe('moderation', () => {
  /** The owner (OWNER_UID in vitest.config.ts) after a second factor verified through login. */
  const ownerCookie = async () => (await signIn('owner-uid!aal2')).cookie;

  async function reportedPrompt() {
    const author = await withHandle('user-2', 'author');
    const path =
      (
        await post('/prompts', { title: 'Bad prompt', body: 'Something against the terms' }, author)
      ).headers.get('Location') ?? '';
    const id = path.split('/').at(-1) ?? '';
    await post(`${path}/publish`, {}, author);
    await post('/report', {
      contentUrl: `https://promptshare.cc/p/${id}`,
      category: 'terms',
      body: 'It breaks the rules.',
      name: 'Rita Reporter',
      email: 'rita@example.com',
      goodFaith: 'yes',
    });
    const report = await env.DB.prepare("SELECT id FROM messages WHERE kind = 'report'").first<{
      id: string;
    }>();
    return { author, id, reportId: report?.id ?? '' };
  }

  it('is only for the owner, after a recent second factor verified through login', async () => {
    expect((await get('/admin')).headers.get('Location')).toBe('/signin?admin=1&return=%2Fadmin');
    const start = await get('/signin?admin=1&return=%2Fadmin');
    expect(start.headers.get('Location')).toContain('acr_values=urn%3A2earl%3Aaal2');

    expect((await get('/admin', (await signIn('user-2!aal2')).cookie)).status).toBe(404);
    // The owner without a second factor: sent to sign in again, asking for it.
    expect((await get('/admin', (await signIn('owner-uid')).cookie)).headers.get('Location')).toBe(
      '/signin?admin=1&return=%2Fadmin',
    );
    const owner = await ownerCookie();
    expect((await get('/admin', owner)).status).toBe(200);

    // Too long ago: asked again, and forms refuse.
    await env.DB.prepare("UPDATE web_sessions SET aal2_at = 1 WHERE uid = 'owner-uid'").run();
    expect((await get('/admin', owner)).status).toBe(302);
    expect(
      (await post('/admin/messages/x/decide', { action: 'none', explanation: 'x' }, owner)).status,
    ).toBe(404);
  });

  it('decides on a report: the content goes, the author gets reasons, the reporter an email to send', async () => {
    const { author, id, reportId } = await reportedPrompt();
    const owner = await ownerCookie();
    expect(await (await get('/admin', owner)).text()).toContain('It breaks the rules.');
    const page = await (await get(`/admin/messages/${reportId}`, owner)).text();
    expect(page).toContain('Something against the terms');
    expect(page).toContain('@author');

    const missingLaw = await post(
      `/admin/messages/${reportId}/decide`,
      { action: 'remove', ground: 'illegal', law: '', explanation: 'x' },
      owner,
    );
    expect(await missingLaw.text()).toContain('Name the law');

    await post(
      `/admin/messages/${reportId}/decide`,
      {
        action: 'remove',
        ground: 'terms',
        explanation: 'The prompt asks for something the terms forbid.',
      },
      owner,
    );
    expect(
      await count('prompts', "id = ? AND status = 'removed' AND visibility = 'private'", id),
    ).toBe(1);
    expect(await count('messages', 'id = ? AND closed_at IS NOT NULL', reportId)).toBe(1);
    expect((await get(`/p/${id}`, (await signIn('user-3')).cookie)).status).toBe(404);

    const decided = await (await get(`/admin/messages/${reportId}`, owner)).text();
    expect(decided).toContain('mailto:rita%40example.com');

    const account = await (await get('/account', author)).text();
    const decisionPath = /href="(\/decisions\/[0-9a-f-]+)"/.exec(account)?.[1] ?? '';
    const statement = await (await get(decisionPath, author)).text();
    expect(statement).toContain('The prompt asks for something the terms forbid.');
    expect(statement).toContain('A report from someone else');
    expect(statement).toContain('No. A person reviewed the content');
    expect((await get(decisionPath, (await signIn('user-3')).cookie)).status).toBe(404);
  });

  it('takes a contest once, and a reversal restores the content', async () => {
    const { author, id, reportId } = await reportedPrompt();
    const owner = await ownerCookie();
    await post(
      `/admin/messages/${reportId}/decide`,
      { action: 'restrict', ground: 'terms', explanation: 'Restricted.' },
      owner,
    );
    const decision = await env.DB.prepare('SELECT id FROM moderation_decisions').first<{
      id: string;
    }>();
    const path = `/decisions/${decision?.id ?? ''}`;
    await post(`${path}/contest`, { body: 'It was satire.' }, author);
    await post(`${path}/contest`, { body: 'Again.' }, author);
    expect(await count('messages', "kind = 'appeal'")).toBe(1);
    expect(await (await get(path, author)).text()).toContain('You contested this decision');

    const appeal = await env.DB.prepare("SELECT id FROM messages WHERE kind = 'appeal'").first<{
      id: string;
    }>();
    const page = await (await get(`/admin/messages/${appeal?.id ?? ''}`, owner)).text();
    expect(page).toContain('It was satire.');
    expect(page).toContain('The decision contested');
    await post(
      `/admin/messages/${appeal?.id ?? ''}/decide`,
      { action: 'reverse', explanation: 'On review, it is satire.' },
      owner,
    );
    expect(
      await count('prompts', "id = ? AND status = 'active' AND visibility = 'private'", id),
    ).toBe(1);
    expect(await (await get('/account', author)).text()).toContain('Reverse an earlier decision');
  });

  it('removes a reported session entry for everyone, assistants included', async () => {
    const owner = await withHandle('user-1', 'ses-owner');
    const path = (await post('/sessions', { title: 'S' }, owner)).headers.get('Location') ?? '';
    const sessionId = path.split('/').at(-1) ?? '';
    await addMember(sessionId, 'user-2', 'editor');
    const member = await withHandle('user-2', 'member');
    await post(`${path}/entries`, { text: 'abusive text' }, member);
    const entry = await env.DB.prepare('SELECT id FROM session_entries').first<{ id: string }>();
    const ownerPage = await (await get(path, owner)).text();
    expect(ownerPage).toContain(
      encodeURIComponent(`https://promptshare.cc/sessions/${sessionId}/entries/${entry?.id ?? ''}`),
    );

    await post('/report', {
      contentUrl: `https://promptshare.cc/sessions/${sessionId}/entries/${entry?.id ?? ''}`,
      category: 'illegal',
      body: 'Insult.',
      name: 'Ses Owner',
      email: 'o@example.com',
      goodFaith: 'yes',
    });
    const report = await env.DB.prepare("SELECT id FROM messages WHERE kind = 'report'").first<{
      id: string;
    }>();
    const admin = await ownerCookie();
    expect(await (await get(`/admin/messages/${report?.id ?? ''}`, admin)).text()).toContain(
      'abusive text',
    );
    await post(
      `/admin/messages/${report?.id ?? ''}/decide`,
      { action: 'remove', ground: 'illegal', law: '§ 185 StGB', explanation: 'An insult.' },
      admin,
    );
    expect(await (await get(path, owner)).text()).not.toContain('abusive text');
    expect(await (await get('/account', member)).text()).toContain('Entry in “S”');
  });

  it('suspends publishing until the date, and keeps threat evidence past retention', async () => {
    const { author, reportId } = await reportedPrompt();
    const owner = await ownerCookie();
    await post(
      `/admin/messages/${reportId}/decide`,
      { action: 'suspend', ground: 'terms', explanation: 'Repeated.', suspendDays: '30' },
      owner,
    );
    const path =
      (await post('/prompts', { title: 'New', body: 'B' }, author)).headers.get('Location') ?? '';
    const blocked = await post(`${path}/publish`, {}, author);
    expect(blocked.status).toBe(400);
    expect(await blocked.text()).toContain('suspended your publishing');

    // Retention: removed content and decisions go after 6 months, threat evidence stays.
    const threat = crypto.randomUUID();
    const removed = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO prompts (id, owner_uid, title, body, status, created_at, updated_at) VALUES (?, 'u', 't', 'b', 'removed', 1, 1)",
      ).bind(threat),
      env.DB.prepare(
        "INSERT INTO prompts (id, owner_uid, title, body, status, created_at, updated_at) VALUES (?, 'u', 't', 'b', 'removed', 1, 1)",
      ).bind(removed),
      env.DB.prepare(
        "INSERT INTO moderation_decisions (id, created_at, content_type, content_id, action, explanation) VALUES ('d-threat', 1, 'prompt', ?, 'threat', 'x')",
      ).bind(threat),
    ]);
    await moderationCleanup(env.DB, Math.floor(Date.now() / 1000));
    expect(await count('prompts', 'id = ?', threat)).toBe(1);
    expect(await count('prompts', 'id = ?', removed)).toBe(0);
    expect(await count('moderation_decisions', "id = 'd-threat'")).toBe(1);
  });

  it('keeps decisions after account deletion without saying who', async () => {
    const { reportId } = await reportedPrompt();
    await post(
      `/admin/messages/${reportId}/decide`,
      { action: 'restrict', ground: 'terms', explanation: 'R.' },
      await ownerCookie(),
    );
    await deleteUserData(env.DB, 'user-2', 10);
    expect(await count('moderation_decisions')).toBe(1);
    expect(await count('moderation_decisions', "affected_uid = 'user-2'")).toBe(0);
  });
});

// ---- Consent, reminders, reporter emails ---------------------------------------------------------

describe('explicit consent for sensitive data', () => {
  it('asks once after sign-in, records either answer, and can be withdrawn', async () => {
    const first = await signIn('user-1', '/sessions');
    expect(first.done.headers.get('Location')).toBe('/consent?return=%2Fsessions');
    const page = await (await get('/consent?return=%2Fsessions', first.cookie)).text();
    expect(page).toContain('I explicitly consent');
    const yes = await post('/consent?return=%2Fsessions', { decision: 'yes' }, first.cookie);
    expect(yes.headers.get('Location')).toBe('/sessions');
    expect(await count('consents', "uid = 'user-1' AND consented = 1 AND version = 1")).toBe(1);

    // Not asked again.
    expect((await signIn('user-1', '/sessions')).done.headers.get('Location')).toBe('/sessions');
    expect(await (await get('/account', first.cookie)).text()).toContain('Withdraw consent');

    await post('/consent', { decision: 'no' }, first.cookie);
    expect(await count('consents', "uid = 'user-1' AND consented = 0")).toBe(1);
    // "No" is an answer too: not asked again.
    expect((await signIn('user-1', '/sessions')).done.headers.get('Location')).toBe('/sessions');
    expect((await post('/consent', { decision: 'maybe' }, first.cookie)).status).toBe(400);
  });

  it('notes the question to assistants until it is answered', async () => {
    const { connect, tool } = await import('./helpers');
    const client = await connect('user-1');
    const before = await tool(client, 'save_prompt', { title: 'T', body: 'B' });
    expect(before.texts.at(-1)).toContain('https://promptshare.cc/consent');
    await env.DB.prepare("INSERT INTO consents VALUES ('user-1', 'sensitive_data', 0, 1, 1)").run();
    const after = await tool(client, 'save_prompt', { title: 'T2', body: 'B' });
    expect(after.texts.join()).not.toContain('/consent');
  });

  it('is deleted with the account', async () => {
    await env.DB.prepare("INSERT INTO consents VALUES ('user-1', 'sensitive_data', 1, 1, 1)").run();
    await deleteUserData(env.DB, 'user-1', 10);
    expect(await count('consents')).toBe(0);
  });
});

describe('reminders for unanswered messages', () => {
  it('reminds the owner once, 30 minutes after a message arrives, until it is closed', async () => {
    const sent: unknown[] = [];
    const mailEnv = Object.create(env) as Env & { CONTACT_TO?: string };
    Object.defineProperty(mailEnv, 'CONTACT_TO', { value: 'owner@example.com' });
    Object.defineProperty(mailEnv, 'MAILER', {
      value: { send: (m: unknown) => (sent.push(m), Promise.resolve({ messageId: 'x' })) },
    });
    const now = 100_000;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO messages (id, kind, body, created_at) VALUES ('old', 'contact', 'a', ?)",
      ).bind(now - 1801),
      env.DB.prepare(
        "INSERT INTO messages (id, kind, body, created_at) VALUES ('new', 'contact', 'b', ?)",
      ).bind(now - 60),
      env.DB.prepare(
        "INSERT INTO messages (id, kind, body, created_at, closed_at) VALUES ('done', 'report', 'c', ?, ?)",
      ).bind(now - 5000, now - 4000),
    ]);
    expect(await remindOwner(mailEnv, now)).toBe(1);
    expect(await remindOwner(mailEnv, now + 600)).toBe(0); // reminded once
    expect(sent).toHaveLength(1);
    expect(await count('messages', "id = 'old' AND reminded_at IS NOT NULL")).toBe(1);
    expect(await count('messages', "id = 'new' AND reminded_at IS NULL")).toBe(1);
  });
});

describe('emailing reporters (switch on the moderation page)', () => {
  const ownerCookie = async () => (await signIn('owner-uid!aal2')).cookie;
  const report = {
    contentUrl: 'https://promptshare.cc/p/00000000-0000-4000-8000-000000000000',
    category: 'terms',
    body: 'Spam.',
    name: 'Rita',
    email: 'rita@example.com',
    goodFaith: 'yes',
  };

  it('is off by default: no automatic email, and the owner gets the prepared one', async () => {
    const page = await (await post('/report', report)).text();
    expect(page).not.toContain('We also emailed you');
    expect(await count('messages', 'receipt_sent_at IS NOT NULL')).toBe(0);
  });

  it('is switched only by the owner, and then confirms receipt automatically', async () => {
    expect(
      (
        await post(
          '/admin/settings',
          { emailReporters: 'on' },
          (await signIn('user-2!aal2')).cookie,
        )
      ).status,
    ).toBe(404);
    const owner = await ownerCookie();
    await post('/admin/settings', { emailReporters: 'on' }, owner);
    expect(await count('settings', "key = 'email_reporters' AND value = 'on'")).toBe(1);
    expect(await (await get('/admin', owner)).text()).toMatch(
      /name="emailReporters" value="on" checked/,
    );

    // The local binding may or may not deliver; the page claims an email only when one was sent.
    const page = await (await post('/report', report)).text();
    const sent = await count('messages', 'receipt_sent_at IS NOT NULL');
    expect(page.includes('We also emailed you this confirmation.')).toBe(sent === 1);

    await post('/admin/settings', {}, owner);
    expect(await count('settings', "key = 'email_reporters' AND value = 'off'")).toBe(1);
  });

  it('offers the test email only while automatic emails are on', async () => {
    const owner = await ownerCookie();
    expect(await (await get('/admin', owner)).text()).not.toContain('/admin/settings/test');
    expect((await post('/admin/settings/test', { to: 'someone@example.com' }, owner)).status).toBe(
      404,
    );

    await post('/admin/settings', { emailReporters: 'on' }, owner);
    expect(await (await get('/admin', owner)).text()).toContain('/admin/settings/test');
    const result = await (
      await post('/admin/settings/test', { to: 'someone@example.com' }, owner)
    ).text();
    // In tests the binding is local: either outcome is reported, never an error page.
    expect(result).toMatch(/Sent to someone@example\.com|Not sent \(/);
  });

  it('doesn’t tell a reporter it emailed them when sending failed', async () => {
    await env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('email_reporters', 'on', 1)",
    ).run();
    const failing = Object.create(env) as Env;
    Object.defineProperty(failing, 'MAILER', {
      value: {
        send: () =>
          Promise.reject(Object.assign(new Error('x'), { code: 'E_SENDER_DOMAIN_NOT_CONFIGURED' })),
      },
    });
    const id = 'f';
    await env.DB.prepare(
      "INSERT INTO messages (id, kind, email, body, created_at) VALUES ('f', 'report', 'r@example.com', 'b', 1)",
    ).run();
    expect(
      await sendReceipt(failing, 2, id, { name: '', email: 'r@example.com', contentUrl: 'u' }),
    ).toBe(false);
    expect(await count('messages', "id = 'f' AND receipt_sent_at IS NULL")).toBe(1);
  });
});

describe('the decision email to a reporter', () => {
  it('goes to the reporter from noreply@promptshare.cc, replies to legal@, and is recorded', async () => {
    const sent: { to: string; from: { email: string }; replyTo: string; text: string }[] = [];
    const mailEnv = Object.create(env) as Env;
    Object.defineProperty(mailEnv, 'MAILER', {
      value: {
        send: (m: (typeof sent)[number]) => (sent.push(m), Promise.resolve({ messageId: 'x' })),
      },
    });
    await env.DB.prepare(
      "INSERT INTO messages (id, kind, name, email, content_url, body, created_at) VALUES ('r', 'report', 'Rita', 'rita@example.com', 'https://promptshare.cc/p/x', 'b', 1)",
    ).run();
    const message = await getMessage(env.DB, 'r');
    const decision = {
      id: 'd',
      createdAt: 2,
      contentType: 'prompt' as const,
      contentId: 'x',
      sessionId: null,
      action: 'remove' as const,
      ground: 'terms' as const,
      law: null,
      explanation: 'Spam is against the terms.',
      untilAt: null,
      contentTitle: 'T',
      reportBased: true,
    };
    expect(message && (await sendDecision(mailEnv, 5, message, decision))).toBe(true);
    expect(sent[0]).toMatchObject({
      to: 'rita@example.com',
      from: { email: 'noreply@promptshare.cc' },
      replyTo: 'legal@2earl.com',
    });
    expect(sent[0]?.text).toContain('Spam is against the terms.');
    expect(sent[0]?.text).toContain('not by automated means');
    expect(await count('messages', "id = 'r' AND decision_sent_at = 5")).toBe(1);
  });
});

describe('receipt emails', () => {
  it('sends at most 3 a day to one address, so the form can’t be used to mail a stranger', async () => {
    const sent: unknown[] = [];
    const mailEnv = Object.create(env) as Env;
    Object.defineProperty(mailEnv, 'MAILER', {
      value: { send: (m: unknown) => (sent.push(m), Promise.resolve({ messageId: 'x' })) },
    });
    for (let i = 0; i < 5; i++) {
      await env.DB.prepare(
        "INSERT INTO messages (id, kind, email, body, created_at) VALUES (?, 'report', 'victim@example.com', 'b', 1)",
      )
        .bind(`m${String(i)}`)
        .run();
      await sendReceipt(mailEnv, 1000 + i, `m${String(i)}`, {
        name: '',
        email: 'victim@example.com',
        contentUrl: 'https://promptshare.cc/p/x',
      });
    }
    expect(sent).toHaveLength(3);
  });
});

describe('sharing a prompt with people (DESIGN §4.1)', () => {
  const T = 1_800_000_000;

  async function setup() {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO profiles (uid, handle, created_at, updated_at) VALUES ('user-1', 'ada', 1, 1)",
      ),
      env.DB.prepare(
        `INSERT INTO prompts (id, owner_uid, title, body, created_at, updated_at)
         VALUES ('p1', 'user-1', 'Release notes', 'Write release notes from this diff.', 1, 1)`,
      ),
    ]);
  }

  it('shares by address on the website; the recipient reads and copies it, also through an assistant', async () => {
    await setup();
    const author = (await signIn('user-1')).cookie;
    const shared = await post('/prompts/p1/shares', { email: ' User-2@Users.test ' }, author);
    expect(shared.status).toBe(200);
    const page = await shared.text();
    expect(page).toContain('Shared with user-2@users.test.');
    expect(page).toContain('Stop sharing');
    expect(await count('prompt_shares', "prompt_id = 'p1' AND recipient_uid = 'user-2'")).toBe(1);

    const reader = (await signIn('user-2')).cookie;
    expect(await (await get('/shared', reader)).text()).toContain('Release notes');
    const view = await (await get('/p/p1', reader)).text();
    expect(view).toContain('Shared with you by @ada');
    expect(view).toContain('Remove from my list');

    const client = await connect('user-2');
    const found = parsed<{ id: string; sharedWithYou: boolean }[]>(
      (await tool(client, 'search_prompts', { scope: 'shared' })).texts,
    );
    expect(found).toMatchObject([{ id: 'p1', sharedWithYou: true }]);
    const got = await tool(client, 'get_prompt', { id: 'p1' });
    expect(got.texts[1]).toMatch(/^----- BEGIN SHARED PROMPT [0-9a-f]{8} -----/);
    expect((await tool(client, 'copy_prompt', { id: 'p1' })).error).toBe(false);
    expect(await count('prompts', "owner_uid = 'user-2' AND copied_from = 'p1'")).toBe(1);

    // Nobody else sees it; the recipient can't change it.
    expect((await get('/p/p1', (await signIn('user-3')).cookie)).status).toBe(404);
    expect((await tool(client, 'update_prompt', { id: 'p1', title: 'x' })).error).toBe(true);
    expect((await post('/prompts/p1', { title: 'x', body: 'y' }, reader)).status).toBe(404);
  });

  it('has no assistant tool that shares', async () => {
    const { tools } = await (await connect('user-1')).listTools();
    expect(tools.map((t) => t.name).filter((n) => /share/.test(n))).toEqual([]);
  });

  it('refuses unknown addresses, then locks sharing for 10 minutes, then 20', async () => {
    await setup();
    const miss = (n: number, at: number) =>
      sharePrompt(env, 'user-1', at, 'p1', `nobody${String(n)}@example.com`);
    await expect(miss(1, T)).rejects.toThrow('No 2earl account uses this address.');
    await expect(miss(2, T + 1)).rejects.toThrow('No 2earl account');
    await expect(miss(3, T + 2)).rejects.toThrow('you can share again in 10 minutes');
    // Locked: even a known address waits, so the lock can't be used to probe.
    await expect(sharePrompt(env, 'user-1', T + 60, 'p1', 'user-2@users.test')).rejects.toThrow(
      'You can share again in 10 minutes.',
    );
    expect(await count('prompt_shares')).toBe(0);
    const after = T + 2 + 600;
    expect(await sharePrompt(env, 'user-1', after, 'p1', 'user-2@users.test')).not.toBeNull();
    await expect(miss(4, after + 1)).rejects.toThrow('No 2earl account');
    await expect(miss(5, after + 2)).rejects.toThrow('No 2earl account');
    await expect(miss(6, after + 3)).rejects.toThrow('in 20 minutes');
  });

  it('locks for the rest of the day after 20 unknown addresses', async () => {
    await setup();
    for (let i = 0; i < 20; i++) {
      await env.DB.prepare("INSERT INTO share_misses (uid, at) VALUES ('user-1', ?)")
        .bind(T - 3 * 3600 + i * 360)
        .run();
    }
    await expect(sharePrompt(env, 'user-1', T, 'p1', 'x@example.com')).rejects.toThrow(
      'in 21 hours',
    );
  });

  it('refuses your own address, a second time, public prompts, no handle, and other people’s prompts', async () => {
    await setup();
    await expect(sharePrompt(env, 'user-1', T, 'p1', 'user-1@users.test')).rejects.toThrow(
      'your own address',
    );
    await sharePrompt(env, 'user-1', T, 'p1', 'user-2@users.test');
    await expect(sharePrompt(env, 'user-1', T, 'p1', 'USER-2@users.test')).rejects.toThrow(
      'already shared',
    );
    expect(await sharePrompt(env, 'user-2', T, 'p1', 'user-3@users.test')).toBeNull();
    await expect(sharePrompt(env, 'user-1', T, 'p1', 'not an address')).rejects.toThrow(
      'Enter one email address.',
    );
    await env.DB.prepare("DELETE FROM profiles WHERE uid = 'user-1'").run();
    await expect(sharePrompt(env, 'user-1', T, 'p1', 'user-3@users.test')).rejects.toThrow(
      'Choose a handle first',
    );
    const pub = await publicPrompt('user-1', 'Open', 'b');
    await expect(sharePrompt(env, 'user-1', T, pub, 'user-3@users.test')).rejects.toThrow('public');
    // A miss caused by a mistake other than the address doesn't count towards the lock.
    expect(await count('share_misses')).toBe(0);
  });

  it('allows 50 people per prompt', async () => {
    await setup();
    for (let i = 0; i < 50; i++) {
      await env.DB.prepare(
        "INSERT INTO prompt_shares (id, prompt_id, owner_uid, recipient_uid, email, created_at) VALUES (?, 'p1', 'user-1', ?, ?, 1)",
      )
        .bind(`s${String(i)}`, `r${String(i)}`, `r${String(i)}@users.test`)
        .run();
    }
    await expect(sharePrompt(env, 'user-1', T, 'p1', 'user-2@users.test')).rejects.toThrow(
      'at most 50 people',
    );
  });

  it('stops sharing, or the recipient removes it; only the author can stop it', async () => {
    await setup();
    const share = await sharePrompt(env, 'user-1', T, 'p1', 'user-2@users.test');
    await sharePrompt(env, 'user-1', T, 'p1', 'user-3@users.test');
    const reader = (await signIn('user-2')).cookie;
    expect((await post(`/prompts/p1/shares/${share?.id ?? ''}/remove`, {}, reader)).status).toBe(
      404,
    );
    const author = (await signIn('user-1')).cookie;
    expect((await post(`/prompts/p1/shares/${share?.id ?? ''}/remove`, {}, author)).status).toBe(
      303,
    );
    expect((await get('/p/p1', reader)).status).toBe(404);

    const other = (await signIn('user-3')).cookie;
    expect((await post('/p/p1/dismiss', {}, other)).status).toBe(303);
    expect((await get('/p/p1', other)).status).toBe(404);
    expect(await count('prompt_shares')).toBe(0);
  });

  it('hides a prompt restricted by moderation from the people it is shared with', async () => {
    await setup();
    await sharePrompt(env, 'user-1', T, 'p1', 'user-2@users.test');
    await env.DB.prepare("UPDATE prompts SET status = 'restricted' WHERE id = 'p1'").run();
    expect((await get('/p/p1', (await signIn('user-2')).cookie)).status).toBe(404);
  });

  it('goes with the prompt, and with either account; the export lists it', async () => {
    await setup();
    await sharePrompt(env, 'user-1', T, 'p1', 'user-2@users.test');
    const exported = await exportUserData(env.DB, env.STATE_ENCRYPTION_KEY, 'user-1');
    expect(exported.promptShares).toMatchObject([
      { prompt: 'p1', sharedWith: 'user-2@users.test' },
    ]);
    expect(
      (await exportUserData(env.DB, env.STATE_ENCRYPTION_KEY, 'user-2')).promptsSharedWithYou,
    ).toMatchObject([{ prompt: 'p1' }]);

    await deleteUserData(env.DB, 'user-2', T);
    expect(await count('prompt_shares')).toBe(0);
    await sharePrompt(env, 'user-1', T, 'p1', 'user-3@users.test');
    expect((await post('/prompts/p1/delete', {}, (await signIn('user-1')).cookie)).status).toBe(
      303,
    );
    expect(await count('prompt_shares')).toBe(0);
    await env.DB.prepare("INSERT INTO share_misses (uid, at) VALUES ('user-1', 1)").run();
    await deleteUserData(env.DB, 'user-1', T);
    expect(await count('share_misses')).toBe(0);
  });

  it('forgets misses after a day', async () => {
    await env.DB.prepare("INSERT INTO share_misses (uid, at) VALUES ('user-1', ?), ('user-1', ?)")
      .bind(T - 2 * 86400, T - 60)
      .run();
    await shareCleanup(env.DB, T);
    expect(await count('share_misses')).toBe(1);
  });
});
