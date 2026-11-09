import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteUserData, exportUserData } from '../src/account';
import { safeReturnTo } from '../src/web/http';
import { mimeMessage, notifyOwner } from '../src/web/messages';
import { addMember, count, resetDatabase } from './helpers';

const ORIGIN = 'https://promptshare.cc';
const SAME_ORIGIN = { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' };

beforeEach(async () => {
  await resetDatabase();
  await env.DB.batch(
    ['signin_tx', 'web_sessions', 'messages'].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
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
    expect(done.headers.get('Location')).toBe('/sessions');
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
    expect(await (await get(path, owner.cookie)).text()).toContain('Another member');

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
