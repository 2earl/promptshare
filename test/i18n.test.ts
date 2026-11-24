import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { collectMissing } from '../src/web/i18n';
import { resetDatabase } from './helpers';

/** Languages: promptshare.cc in English and Turkish (docs/DESIGN.md "Languages"). */

const ORIGIN = 'https://promptshare.cc';
const ip = () => `198.51.100.${String(Math.floor(Math.random() * 250))}`;

function get(path: string, headers: Record<string, string> = {}) {
  return exports.default.fetch(
    new Request(`${ORIGIN}${path}`, {
      headers: { 'CF-Connecting-IP': ip(), ...headers },
      redirect: 'manual',
    }),
  );
}

beforeEach(async () => {
  await resetDatabase();
  await env.DB.batch(
    ['signin_tx', 'web_sessions', 'messages'].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
});

describe('languages', () => {
  it('serves Turkish to a Turkish browser, and English otherwise', async () => {
    const turkish = await get('/', { 'Accept-Language': 'tr-TR,tr;q=0.9' });
    const html = await turkish.text();
    expect(turkish.headers.get('Content-Language')).toBe('tr');
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain('Her asistanda kullanın.');
    expect(html).toContain('href="https://2earl.com/tr/privacy"');
    const english = await (await get('/')).text();
    expect(english).toContain('<html lang="en">');
    expect(english).toContain('Use it in every assistant.');
  });

  it('remembers ?lang= and passes it to login.2earl.com', async () => {
    const chosen = await get('/?lang=tr');
    expect(chosen.headers.getSetCookie().join()).toContain('__Host-lang=tr');
    const signIn = await get('/signin', { Cookie: '__Host-lang=tr' });
    expect(signIn.headers.get('Location')).toContain('ui_locales=tr');
  });

  it('is not for search engines', async () => {
    const response = await get('/');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('has every sentence of the public pages', async () => {
    const missing = collectMissing();
    for (const path of ['/', '/connect', '/contact', '/report', '/release-notes', '/nope']) {
      await get(path, { 'Accept-Language': 'tr' });
    }
    expect([...missing]).toEqual([]);
  });
});
