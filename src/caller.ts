/**
 * Who is calling, as the gateway tells `GatewayMcp` (2earl/mcp docs/UPSTREAM_CONTRACT.md §2).
 * Only `GatewayMcp` may call this: the public `fetch` never reads these headers.
 */

export const SCOPES = {
  read: 'mcp:promptshare.read',
  write: 'mcp:promptshare.write',
  state: 'mcp:promptshare.state',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export interface Caller {
  uid: string;
  clientId: string;
  scopes: ReadonlySet<string>;
}

export function callerFrom(headers: Headers): Caller | null {
  const uid = headers.get('X-2earl-User');
  const clientId = headers.get('X-2earl-Client');
  if (!uid || !clientId) return null;
  const scopes = new Set((headers.get('X-2earl-Scopes') ?? '').split(' ').filter(Boolean));
  return { uid, clientId, scopes };
}

/** The gateway already applies write ⊇ read; applied again so this service never depends on it. */
export function allows(caller: Caller, scope: Scope): boolean {
  if (caller.scopes.has(scope)) return true;
  return scope === SCOPES.read && caller.scopes.has(SCOPES.write);
}
