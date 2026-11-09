import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { env, exports } from 'cloudflare:workers';
import { SCOPES } from '../src/caller';

export const ALL = [SCOPES.read, SCOPES.write, SCOPES.state];
export const CLIENT_ID = 'https://assistant.example/client.json';

/** The headers the gateway sets (2earl/mcp src/gateway.ts). */
export function gatewayHeaders(uid: string, scopes: readonly string[], clientId = CLIENT_ID) {
  return { 'X-2earl-User': uid, 'X-2earl-Client': clientId, 'X-2earl-Scopes': scopes.join(' ') };
}

/** A real MCP client talking to the GatewayMcp entrypoint, as the gateway does. */
export async function connect(uid: string, scopes: readonly string[] = ALL, clientId = CLIENT_ID) {
  const transport = new StreamableHTTPClientTransport(new URL('https://promptshare.internal/mcp'), {
    fetch: (url, init) =>
      exports.GatewayMcp.fetch(
        new Request(url, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            ...gatewayHeaders(uid, scopes, clientId),
          },
        }),
      ),
  });
  const client = new Client({ name: 'test-gateway', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

/** Calls a tool and returns its text blocks. */
export async function tool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  return { error: result.isError === true, texts: result.content.map((c) => c.text) };
}

// The caller names the shape it expects from the tool's JSON text.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function parsed<T>(texts: string[], index = 0): T {
  return JSON.parse(texts[index] ?? 'null') as T;
}

export async function count(table: string, where = '1 = 1', ...params: unknown[]): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
    .bind(...params)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function resetDatabase(): Promise<void> {
  await env.DB.batch(
    [
      'prompt_shares',
      'share_misses',
      'share_locks',
      'invitations',
      'moderation_decisions',
      'messages',
      'session_entries',
      'session_members',
      'shared_sessions',
      'prompts',
      'profiles',
      'audit_events',
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
}

/** A public prompt by another user, as the website will create in phase P2. */
export async function publicPrompt(owner: string, title: string, body: string, status = 'active') {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO prompts (id, owner_uid, title, body, visibility, status, created_at, updated_at, published_at)
     VALUES (?, ?, ?, ?, 'public', ?, 1, 1, 1)`,
  )
    .bind(id, owner, title, body, status)
    .run();
  return id;
}

/** Adds a member to a session, as invitations will in phase P2. */
export async function addMember(sessionId: string, uid: string, role: 'editor' | 'viewer') {
  await env.DB.prepare(
    'INSERT INTO session_members (session_id, uid, role, added_at) VALUES (?, ?, ?, 1)',
  )
    .bind(sessionId, uid, role)
    .run();
}
