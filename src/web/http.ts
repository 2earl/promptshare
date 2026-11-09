import type { Context } from 'hono';

/** Request plumbing for the website (docs/DESIGN.md §3). Patterns from 2earl/login src/http.ts. */

export interface WebSession {
  idHash: string;
  uid: string;
}

export type WebEnv = Env & {
  /** Optional secret: where contact messages and reports are emailed. */
  CONTACT_TO?: string;
};

export type AppEnv = { Bindings: WebEnv; Variables: { session: WebSession | null; now: number } };
export type AppContext = Context<AppEnv>;

export const SESSION_COOKIE = '__Host-session';
export const SIGNIN_COOKIE = '__Host-signin';

export function setCookie(c: AppContext, name: string, value: string, maxAge: number): void {
  c.header(
    'Set-Cookie',
    `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}`,
    { append: true },
  );
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/**
 * Requests that change state must come from our own pages: the Origin must match, and if the
 * browser reports Sec-Fetch-Site it must say same-origin.
 */
export function isSameOrigin(c: AppContext): boolean {
  const fetchSite = c.req.header('Sec-Fetch-Site');
  if (fetchSite !== undefined && fetchSite !== 'same-origin') return false;
  return c.req.header('Origin') === c.env.SITE_ORIGIN;
}

export async function underRateLimit(c: AppContext, route: string): Promise<boolean> {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const { success } = await c.env.FORM_RATE_LIMITER.limit({ key: `${route}:${ip}` });
  return success;
}

/** Only paths on this site, never another origin or a protocol-relative URL. */
export function safeReturnTo(value: string | undefined | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  return value.length > 512 ? null : value;
}

/** Strict CSP: no scripts at all, no framing, forms post only to this origin. */
export const CSP = [
  "default-src 'none'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "form-action 'self' https://login.2earl.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': CSP,
};
