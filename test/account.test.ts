import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUDIT_RETENTION_SECONDS } from '../src/audit';
import worker from '../src/index';
import { addMember, connect, count, parsed, publicPrompt, resetDatabase, tool } from './helpers';

beforeEach(resetDatabase);

/** user-1 with a prompt, an own session, and an entry in user-2's session; user-2 with their own. */
async function fixture() {
  const one = await connect('user-1');
  const two = await connect('user-2');
  await tool(one, 'save_prompt', { title: 'Mine', body: 'my prompt' });
  const own = parsed<{ id: string }>(
    (await tool(one, 'create_session', { title: 'Own' })).texts,
  ).id;
  await tool(one, 'save_to_session', { id: own, text: 'in my session' });
  const theirs = parsed<{ id: string }>(
    (await tool(two, 'create_session', { title: 'Theirs' })).texts,
  ).id;
  await addMember(theirs, 'user-1', 'editor');
  await addMember(own, 'user-2', 'editor');
  await tool(one, 'save_to_session', { id: theirs, text: 'my entry in their session' });
  await tool(two, 'save_to_session', { id: theirs, text: 'their entry' });
  await tool(two, 'save_to_session', { id: own, text: 'their entry in my session' });
  await publicPrompt('user-2', 'Theirs', 'their prompt');
  return { own, theirs };
}

describe('AccountEvents (called by login)', () => {
  it('exports the user’s prompts, sessions and entries, decrypted, and nothing of others’', async () => {
    const { own, theirs } = await fixture();
    // The RPC stub's type doesn't show the promise it returns at runtime.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const data = (await exports.AccountEvents.exportUser('user-1')) as {
      prompts: { body: string }[];
      sharedSessions: { id: string; yourRole: string }[];
      sessionEntries: { session: string; text: string; writtenBy: string }[];
      securityLog: unknown[];
    };
    expect(data.prompts.map((p) => p.body)).toEqual(['my prompt']);
    expect(data.sharedSessions).toEqual([
      expect.objectContaining({ id: own, yourRole: 'owner' }),
      expect.objectContaining({ id: theirs, yourRole: 'editor' }),
    ]);
    const texts = data.sessionEntries.map((e) => `${e.writtenBy}: ${e.text}`).sort();
    expect(texts).toEqual([
      'another member: their entry in my session',
      'you: in my session',
      'you: my entry in their session',
    ]);
    expect(JSON.stringify(data)).not.toContain('their prompt');
    expect(JSON.stringify(data)).not.toContain('"their entry"');
    expect(data.securityLog.length).toBeGreaterThan(0);
  });

  it('deletes everything about the user, keeps other users’ data, and is idempotent', async () => {
    const { own, theirs } = await fixture();
    await exports.AccountEvents.deleteUser('user-1');

    expect(await count('prompts', "owner_uid = 'user-1'")).toBe(0);
    expect(await count('shared_sessions', 'id = ?', own)).toBe(0);
    expect(await count('session_entries', "author_uid = 'user-1'")).toBe(0);
    expect(await count('session_entries', 'session_id = ?', own)).toBe(0);
    expect(await count('session_members', "uid = 'user-1'")).toBe(0);
    expect(await count('audit_events', "actor_user_id = 'user-1'")).toBe(0);
    expect(await count('audit_events', "event = 'user.deleted'")).toBe(1);

    // user-2 keeps their session, their entry there, and their public prompt.
    expect(await count('shared_sessions', 'id = ?', theirs)).toBe(1);
    expect(await count('session_entries', "author_uid = 'user-2' AND session_id = ?", theirs)).toBe(
      1,
    );
    expect(await count('prompts', "owner_uid = 'user-2'")).toBe(1);

    await exports.AccountEvents.deleteUser('user-1');
    await exports.AccountEvents.deleteUser('never-seen');
  });

  it('forgets security-log entries after 90 days', async () => {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO audit_events (id, at, event) VALUES ('old', ?, 'prompt.created')",
      ).bind(now - AUDIT_RETENTION_SECONDS - 60),
      env.DB.prepare(
        "INSERT INTO audit_events (id, at, event) VALUES ('new', ?, 'prompt.created')",
      ).bind(now),
    ]);
    await worker.scheduled(
      { cron: '53 3 * * *', scheduledTime: Date.now(), noRetry: () => undefined },
      env,
    );
    expect(await count('audit_events', "id = 'old'")).toBe(0);
    expect(await count('audit_events', "id = 'new'")).toBe(1);
  });
});
