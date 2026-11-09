import { createMcpHandler } from '@modelcontextprotocol/server';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { deleteUserData, exportUserData } from './account';
import { AUDIT_RETENTION_SECONDS } from './audit';
import { callerFrom } from './caller';
import { moderationCleanup } from './moderation';
import { shareCleanup } from './shares';
import { remindOwner } from './notices';
import { buildServer } from './tools';
import { createApp } from './web/app';

/**
 * Prompt share's Worker (docs/DESIGN.md §3):
 * - `GatewayMcp`: the MCP tools, reachable only from the 2earl MCP gateway;
 * - `AccountEvents`: account deletion and export, reachable only from login;
 * - `fetch`: the website at promptshare.cc. It never reads `X-2earl-*` headers.
 */

const now = () => Math.floor(Date.now() / 1000);

/** wrangler.jsonc: every 10 minutes, the reminder; otherwise the daily clean-up. */
export const REMINDER_CRON = '*/10 * * * *';

/** MCP over a Service Binding from the gateway (2earl/mcp docs/UPSTREAM_CONTRACT.md). */
export class GatewayMcp extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const caller = callerFrom(request.headers);
    if (!caller) return new Response('missing caller', { status: 400 });
    // Stateless: a fresh server per request, built for this caller.
    return createMcpHandler(() => buildServer(this.env, caller, now)).fetch(request);
  }
}

/** Called by login only (2earl/login src/services.ts). */
export class AccountEvents extends WorkerEntrypoint<Env> {
  async deleteUser(userId: string): Promise<void> {
    await deleteUserData(this.env.DB, userId, now());
  }

  async exportUser(userId: string): Promise<Record<string, unknown>> {
    return exportUserData(this.env.DB, this.env.STATE_ENCRYPTION_KEY, userId);
  }
}

const website = createApp(now);

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return website.fetch(request, env, ctx);
  },

  async scheduled(controller, env): Promise<void> {
    if (controller.cron === REMINDER_CRON) {
      await remindOwner(env, now());
      return;
    }
    await moderationCleanup(env.DB, now());
    await shareCleanup(env.DB, now());
    await env.DB.prepare('DELETE FROM audit_events WHERE at < ?')
      .bind(now() - AUDIT_RETENTION_SECONDS)
      .run();
  },
} satisfies ExportedHandler<Env>;
