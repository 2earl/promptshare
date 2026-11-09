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
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});
