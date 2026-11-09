import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  // Tests run against exactly the schema production gets.
  const migrations = await readD1Migrations('./migrations');

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Test-only value for the Worker secret declared in wrangler.jsonc.
            STATE_ENCRYPTION_KEY: 'test-state-encryption-key-of-at-least-32-chars',
            SESSION_PEPPER: 'test-session-pepper',
            OWNER_UID: 'owner-uid',
          },
          // Stand-in for login (the AUTH_SERVER binding): a token endpoint that checks PKCE, and
          // validateToken. A code is "<uid>.<code_challenge>", so the stand-in can verify the
          // verifier the website sends belongs to the challenge it sent to /authorize.
          workers: [
            {
              name: 'login',
              modules: true,
              compatibilityDate: '2026-11-01',
              script: `
                import { WorkerEntrypoint } from 'cloudflare:workers';
                const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
                  .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
                // An address "<uid>@users.test" belongs to the account <uid>; others have none.
                export class PromptshareDirectory extends WorkerEntrypoint {
                  async uidForEmail(email) {
                    const m = /^([a-z0-9-]+)@users\\.test$/.exec(email.trim().toLowerCase());
                    return m ? m[1] : null;
                  }
                }
                export default class extends WorkerEntrypoint {
                  async fetch(request) {
                    const url = new URL(request.url);
                    if (url.pathname !== '/oauth/token') return new Response('no', { status: 404 });
                    const form = await request.formData();
                    const [uid, challenge] = String(form.get('code')).split('.');
                    const digest = await crypto.subtle.digest('SHA-256',
                      new TextEncoder().encode(String(form.get('code_verifier'))));
                    const ok = form.get('grant_type') === 'authorization_code'
                      && form.get('resource') === 'https://promptshare.cc'
                      && form.get('client_id') === 'https://promptshare.cc/oauth/client.json'
                      && form.get('redirect_uri') === 'https://promptshare.cc/callback'
                      && b64(digest) === challenge;
                    if (!ok) return Response.json({ error: 'invalid_grant' }, { status: 400 });
                    return Response.json({ access_token: 'token-' + uid, token_type: 'Bearer' });
                  }
                  async validateToken(resource, token) {
                    if (!token.startsWith('token-')) return null;
                    // "<uid>!aal2": a sign-in where login verified the second factor a minute ago.
                    const [uid, aal2] = token.slice(6).split('!');
                    return { audience: resource, scope: ['promptshare:account'],
                      props: { uid, authTime: 0,
                        aal2At: aal2 === 'aal2' ? Math.floor(Date.now() / 1000) - 60 : null } };
                  }
                }
              `,
            },
          ],
        },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});
