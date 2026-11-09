import type { AppContext, WebSession } from './http';

/**
 * Signing in to the website with login.2earl.com (docs/DESIGN.md §3): authorization code with
 * PKCE, the client identified by its metadata document (CIMD) at /oauth/client.json, the code
 * exchanged and the token validated over the Service Binding to login. The token is discarded;
 * the website keeps its own session.
 */

export const SIGNIN_TTL_SECONDS = 600;
export const SESSION_IDLE_SECONDS = 12 * 60 * 60;
export const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60;
const TOUCH_INTERVAL_SECONDS = 5 * 60;
export const SCOPE = 'promptshare:account';

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function hmac(key: string, value: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(
    new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value))),
  );
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const clientId = (env: Env) => `${env.SITE_ORIGIN}/oauth/client.json`;
export const redirectUri = (env: Env) => `${env.SITE_ORIGIN}/callback`;

/** The client metadata document login fetches to learn who this client is (CIMD). */
export function clientMetadata(env: Env) {
  return {
    client_id: clientId(env),
    client_name: 'Prompt share',
    client_uri: env.SITE_ORIGIN,
    redirect_uris: [redirectUri(env)],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: SCOPE,
  };
}

/** Starts a sign-in: returns the cookie value to set and the URL to send the browser to. */
export async function startSignIn(
  env: Env,
  now: number,
  returnTo: string | null,
): Promise<{ cookieValue: string; location: string }> {
  const cookieValue = randomToken();
  const state = randomToken();
  const verifier = randomToken(48);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM signin_tx WHERE expires_at < ?').bind(now),
    env.DB.prepare(
      'INSERT INTO signin_tx (id_hash, state, pkce_verifier, return_to, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(
      await hmac(env.SESSION_PEPPER, `signin:${cookieValue}`),
      state,
      verifier,
      returnTo,
      now + SIGNIN_TTL_SECONDS,
    ),
  ]);
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(env),
    redirect_uri: redirectUri(env),
    scope: SCOPE,
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    resource: env.SITE_ORIGIN,
  });
  return { cookieValue, location: `${env.AUTHORIZATION_SERVER}/authorize?${query.toString()}` };
}

/** What login's validateToken returns (2earl/login src/index.ts). */
interface Validated {
  audience: string | string[];
  scope: string[];
  props: { uid: string };
}
interface AuthServer {
  fetch(request: Request): Promise<Response>;
  validateToken(resource: string, token: string): Promise<Validated | null>;
}

export class SignInError extends Error {
  override name = 'SignInError';
}

/**
 * Finishes a sign-in. The transaction is used up whether or not the checks pass, so a callback
 * can't be replayed. Returns the user's 2earl ID and where to go next.
 */
export async function finishSignIn(
  env: Env,
  now: number,
  input: {
    cookieValue: string | undefined;
    state: string | null;
    code: string | null;
    iss: string | null;
  },
): Promise<{ uid: string; returnTo: string | null }> {
  if (!input.cookieValue || !input.state || !input.code) throw new SignInError('incomplete');
  // RFC 9207: the response says which server issued it.
  if (input.iss !== null && input.iss !== env.AUTHORIZATION_SERVER) throw new SignInError('issuer');
  const tx = await env.DB.prepare(
    'DELETE FROM signin_tx WHERE id_hash = ? RETURNING state, pkce_verifier, return_to, expires_at',
  )
    .bind(await hmac(env.SESSION_PEPPER, `signin:${input.cookieValue}`))
    .first<{
      state: string;
      pkce_verifier: string;
      return_to: string | null;
      expires_at: number;
    }>();
  if (!tx || tx.expires_at < now || !timingSafeEqual(tx.state, input.state)) {
    throw new SignInError('transaction');
  }

  const login = env.AUTH_SERVER as unknown as AuthServer;
  const response = await login.fetch(
    new Request(`${env.AUTHORIZATION_SERVER}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: redirectUri(env),
        client_id: clientId(env),
        code_verifier: tx.pkce_verifier,
        resource: env.SITE_ORIGIN,
      }),
    }),
  );
  if (!response.ok) throw new SignInError(`token ${String(response.status)}`);
  const { access_token: token } = await response.json<{ access_token?: string }>();
  if (!token) throw new SignInError('no token');
  const validated = await login.validateToken(env.SITE_ORIGIN, token);
  const audience = validated ? [validated.audience].flat() : [];
  if (!validated || !audience.includes(env.SITE_ORIGIN) || !validated.scope.includes(SCOPE)) {
    throw new SignInError('validation');
  }
  return { uid: validated.props.uid, returnTo: tx.return_to };
}

export async function createWebSession(env: Env, now: number, uid: string): Promise<string> {
  const cookieValue = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM web_sessions WHERE expires_at < ? OR last_seen_at < ?').bind(
      now,
      now - SESSION_IDLE_SECONDS,
    ),
    env.DB.prepare(
      'INSERT INTO web_sessions (id_hash, uid, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(
      await hmac(env.SESSION_PEPPER, `session:${cookieValue}`),
      uid,
      now,
      now,
      now + SESSION_ABSOLUTE_SECONDS,
    ),
  ]);
  return cookieValue;
}

export async function currentSession(
  env: Env,
  now: number,
  cookieValue: string | undefined,
): Promise<WebSession | null> {
  if (!cookieValue) return null;
  const idHash = await hmac(env.SESSION_PEPPER, `session:${cookieValue}`);
  const row = await env.DB.prepare(
    'SELECT uid, last_seen_at, expires_at FROM web_sessions WHERE id_hash = ?',
  )
    .bind(idHash)
    .first<{ uid: string; last_seen_at: number; expires_at: number }>();
  if (!row || row.expires_at < now || row.last_seen_at < now - SESSION_IDLE_SECONDS) return null;
  if (now - row.last_seen_at > TOUCH_INTERVAL_SECONDS) {
    await env.DB.prepare('UPDATE web_sessions SET last_seen_at = ? WHERE id_hash = ?')
      .bind(now, idHash)
      .run();
  }
  return { idHash, uid: row.uid };
}

export async function endWebSession(env: Env, session: WebSession): Promise<void> {
  await env.DB.prepare('DELETE FROM web_sessions WHERE id_hash = ?').bind(session.idHash).run();
}

/** Signs the user out of the website everywhere: used when the account is deleted. */
export async function endAllWebSessions(db: D1Database, uid: string): Promise<void> {
  await db.prepare('DELETE FROM web_sessions WHERE uid = ?').bind(uid).run();
}

export type { AppContext };
