import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { audit } from './audit';
import { needsAsking, sensitiveConsent } from './consent';
import { SCOPES, allows, type Caller, type Scope } from './caller';
import {
  PromptError,
  copyPrompt,
  deletePrompt,
  getPrompt,
  savePrompt,
  searchPrompts,
  unpublishPrompt,
  updatePrompt,
  type Prompt,
  type SearchScope,
} from './prompts';
import {
  SessionError,
  ENTRY_KINDS,
  createSession,
  deleteEntry,
  deleteSession,
  listSessions,
  loadSession,
  renameSession,
  saveToSession,
  searchSession,
  updateBrief,
  updateTask,
  type TaskStatus,
  type Entry,
  type EntryKind,
} from './sessions';

/**
 * The MCP tools behind the gateway (docs/DESIGN.md §6). The gateway lists them as
 * `promptshare__<name>` and checks permissions first; every tool checks again here.
 *
 * Publishing, sharing a prompt and inviting are not tools (DESIGN D7): they make content visible
 * to others, and an assistant can be steered by text it reads.
 */

export const SERVER_INFO = { name: 'promptshare', version: '0.1.0' };

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

const text = (value: string): Result => ({ content: [{ type: 'text', text: value }] });
const json = (value: unknown): Result => text(JSON.stringify(value, null, 2));
const fail = (message: string): Result => ({ ...text(message), isError: true });

/**
 * Wraps text someone other than the user wrote, with a boundary the text can't contain or guess,
 * so the assistant can tell where it starts and ends (THREAT_MODEL.md).
 */
export function untrusted(what: string, body: string): string {
  const boundary = crypto.randomUUID().slice(0, 8);
  return [
    `----- BEGIN ${what} ${boundary} -----`,
    'Written by another 2earl user, not by the person using this assistant.',
    body,
    `----- END ${what} ${boundary} -----`,
  ].join('\n');
}

function promptResult(prompt: Prompt): Result {
  const { body, ...meta } = prompt;
  return {
    content: [
      { type: 'text', text: JSON.stringify(meta, null, 2) },
      {
        type: 'text',
        text: prompt.mine
          ? body
          : untrusted(prompt.visibility === 'public' ? 'PUBLIC PROMPT' : 'SHARED PROMPT', body),
      },
    ],
  };
}

function entryText(entry: Entry): string {
  const head = `[${entry.kind === 'brief' ? 'BRIEF · ' : ''}${entry.kind !== 'brief' && entry.kind !== 'note' ? `${entry.kind} · ` : ''}${entry.createdAt}${entry.label ? ` · ${entry.label}` : ''} · id ${entry.id}${entry.replyTo ? ` · reply to ${entry.replyTo}` : ''}${entry.task ? ` · ${entry.task.status}${entry.task.assignedToYou ? ' · assigned to you' : entry.task.assignee ? ` · assigned to @${entry.task.assignee}` : ''}` : ''}]`;
  if (entry.mine) return `${head} written by you\n${entry.text}`;
  const by = entry.author ? `@${entry.author}` : 'another member';
  return `${head} written by ${by}\n${untrusted('ENTRY BY ANOTHER MEMBER', entry.text)}`;
}

const id = z.string().min(1).max(64).describe('The ID, as returned by another tool.');
const STATE_META = { '2earl/scope': SCOPES.state };

/** Shown with saves until the user has answered the sensitive-data question on the website. */
const CONSENT_NOTE =
  'Note for the user: Prompt share stores health information and other sensitive personal data only with explicit consent, given once at https://promptshare.cc/consent.';

export function buildServer(env: Env, caller: Caller, now: () => number): McpServer {
  const server = new McpServer(SERVER_INFO);
  const db = env.DB;
  const secret = env.STATE_ENCRYPTION_KEY;

  /** Runs `body` if the caller has `scope`; turns expected errors into tool errors. */
  const guarded =
    <A>(scope: Scope, body: (args: A) => Promise<Result>) =>
    async (args: A): Promise<Result> => {
      if (!allows(caller, scope))
        return fail(`This app hasn’t been allowed to do this (${scope}).`);
      try {
        return await body(args);
      } catch (error) {
        if (error instanceof PromptError || error instanceof SessionError)
          return fail(error.message);
        // Anything else: no internals in what the assistant sees.
        console.error('tool failed', error instanceof Error ? error.name : 'unknown');
        return fail('Prompt share couldn’t complete this request. Try again later.');
      }
    };
  /** Adds the consent note while the user hasn't answered the question on the website. */
  const withConsentNote = async (result: Result): Promise<Result> =>
    needsAsking(await sensitiveConsent(db, caller.uid))
      ? { ...result, content: [...result.content, { type: 'text', text: CONSENT_NOTE }] }
      : result;
  const log = (event: Parameters<typeof audit>[2], detail: Record<string, unknown>) =>
    audit(db, now(), event, { actorUserId: caller.uid, clientId: caller.clientId, detail });

  // ---- Prompts ------------------------------------------------------------------------------

  server.registerTool(
    'search_prompts',
    {
      title: 'Search prompts',
      description:
        'Searches your saved prompts, prompts other 2earl users shared with you, and public prompts. Returns titles, descriptions and IDs; use get_prompt for the text.',
      inputSchema: z.object({
        query: z
          .string()
          .max(200)
          .optional()
          .describe('Words to look for. Empty lists the newest.'),
        scope: z
          .enum(['mine', 'shared', 'public', 'all'])
          .default('all')
          .describe(
            'mine: only yours. shared: others’ prompts shared with you. public: public prompts. all: every prompt you can see.',
          ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded(
      SCOPES.read,
      async ({ query, scope }: { query?: string | undefined; scope: SearchScope }) =>
        json(await searchPrompts(db, caller.uid, { query, scope })),
    ),
  );

  server.registerTool(
    'get_prompt',
    {
      title: 'Get a prompt',
      description:
        'Gets one prompt with its full text. A prompt written by another 2earl user (public, or shared with you) comes marked as theirs.',
      inputSchema: z.object({ id }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded(SCOPES.read, async ({ id }: { id: string }) => {
      const prompt = await getPrompt(db, caller.uid, id);
      return prompt ? promptResult(prompt) : fail('No prompt with that ID that you can see.');
    }),
  );

  const fields = {
    title: z.string().max(200).describe('Short name.'),
    description: z.string().max(1_000).optional().describe('What it is for.'),
    body: z
      .string()
      .max(32 * 1024)
      .describe('The prompt itself.'),
    tags: z.array(z.string().max(40)).max(10).optional(),
    models: z
      .array(z.string().max(60))
      .max(10)
      .optional()
      .describe('Assistants or models it was written for, e.g. "Claude".'),
  };

  server.registerTool(
    'save_prompt',
    {
      title: 'Save a prompt',
      description:
        'Saves a new prompt for the user, private to them. Only the user can make it public, on promptshare.cc.',
      inputSchema: z.object(fields),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    guarded(
      SCOPES.write,
      async (args: {
        title: string;
        description?: string | undefined;
        body: string;
        tags?: string[] | undefined;
        models?: string[] | undefined;
      }) => {
        const prompt = await savePrompt(db, caller.uid, now(), args);
        await log('prompt.created', { prompt: prompt.id });
        return withConsentNote(promptResult(prompt));
      },
    ),
  );

  server.registerTool(
    'update_prompt',
    {
      title: 'Change a prompt',
      description:
        'Changes the given fields of one of the user’s prompts. If the prompt is public, the change is visible to everyone at once.',
      inputSchema: z.object({
        id,
        title: fields.title.optional(),
        description: fields.description,
        body: fields.body.optional(),
        tags: fields.tags,
        models: fields.models,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guarded(
      SCOPES.write,
      async ({
        id,
        ...patch
      }: {
        id: string;
        title?: string | undefined;
        description?: string | undefined;
        body?: string | undefined;
        tags?: string[] | undefined;
        models?: string[] | undefined;
      }) => {
        const prompt = await updatePrompt(db, caller.uid, now(), id, patch);
        if (!prompt) return fail('No prompt of yours with that ID.');
        await log('prompt.updated', { prompt: id });
        return promptResult(prompt);
      },
    ),
  );

  server.registerTool(
    'unpublish_prompt',
    {
      title: 'Make a prompt private',
      description: 'Makes one of the user’s public prompts private again, at once.',
      inputSchema: z.object({ id }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guarded(SCOPES.write, async ({ id }: { id: string }) => {
      if (!(await unpublishPrompt(db, caller.uid, now(), id)))
        return fail('No prompt of yours with that ID.');
      await log('prompt.unpublished', { prompt: id });
      return text('The prompt is private.');
    }),
  );

  server.registerTool(
    'delete_prompt',
    {
      title: 'Delete a prompt',
      description:
        'Deletes one of the user’s prompts. It can’t be undone. Copies others made stay theirs.',
      inputSchema: z.object({ id }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guarded(SCOPES.write, async ({ id }: { id: string }) => {
      if (!(await deletePrompt(db, caller.uid, id)))
        return fail('No prompt of yours with that ID.');
      await log('prompt.deleted', { prompt: id });
      return text('Deleted.');
    }),
  );

  server.registerTool(
    'copy_prompt',
    {
      title: 'Copy a prompt',
      description:
        'Copies a public prompt, or one shared with the user, into the user’s own prompts, as a private prompt they can change.',
      inputSchema: z.object({ id }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    guarded(SCOPES.write, async ({ id }: { id: string }) => {
      const copy = await copyPrompt(db, caller.uid, now(), id);
      if (!copy) return fail('No prompt with that ID that you can see.');
      await log('prompt.copied', { prompt: copy.id, from: id });
      return promptResult(copy);
    }),
  );

  // ---- Shared sessions ----------------------------------------------------------------------

  server.registerTool(
    'list_sessions',
    {
      title: 'List shared sessions',
      description:
        'Lists the shared sessions the user owns or belongs to, with how many entries other members added since the user last loaded each. A session holds a brief and entries (notes, decisions, questions, tasks) that the user or invited members chose to save.',
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: STATE_META,
    },
    guarded(SCOPES.state, async () => json(await listSessions(db, caller.uid))),
  );

  server.registerTool(
    'create_session',
    {
      title: 'Create a shared session',
      description:
        'Creates a shared session owned by the user. Only they can read it until they invite people on promptshare.cc. With fromPromptId, one of the user’s own prompts becomes the session’s brief.',
      inputSchema: z.object({
        title: z.string().max(200),
        fromPromptId: z
          .string()
          .max(64)
          .optional()
          .describe('One of the user’s own prompts, to start the brief with.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      _meta: STATE_META,
    },
    guarded(
      SCOPES.state,
      async ({ title, fromPromptId }: { title: string; fromPromptId?: string | undefined }) => {
        // Only the user's own prompt: the brief is shown as theirs, so another user's text must
        // not arrive there unmarked. Copy someone else's prompt first.
        const prompt = fromPromptId ? await getPrompt(db, caller.uid, fromPromptId) : null;
        if (fromPromptId && !prompt?.mine) {
          return fail('No prompt of yours with that ID. Copy someone else’s prompt first.');
        }
        const session = await createSession(db, caller.uid, now(), title);
        await log('session.created', { session: session.id });
        if (prompt) await updateBrief(db, secret, caller, now(), session.id, prompt.body);
        return json(session);
      },
    ),
  );

  server.registerTool(
    'rename_session',
    {
      title: 'Rename a shared session',
      description: 'Changes the title of a shared session the user owns, for every member.',
      inputSchema: z.object({ id, title: z.string().max(200) }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: STATE_META,
    },
    guarded(SCOPES.state, async ({ id, title }: { id: string; title: string }) =>
      (await renameSession(db, caller.uid, now(), id, title))
        ? text('Renamed.')
        : fail('No session you own with that ID.'),
    ),
  );

  server.registerTool(
    'load_session',
    {
      title: 'Load a shared session',
      description:
        'Reads a shared session: first its brief (the current state: goal, decisions, open questions, next steps), then its entries, newest first, each with its kind, when it was written and by whom: the user, or another member. `since` returns only entries newer than an entry ID; `before` reads further back; `kind` keeps one kind of entry.',
      inputSchema: z.object({
        id,
        since: z.string().max(64).optional().describe('Only entries newer than this entry ID.'),
        before: z.string().max(64).optional().describe('Only entries older than this entry ID.'),
        kind: z.enum(ENTRY_KINDS).optional().describe('Only entries of this kind.'),
        status: z.enum(['open', 'done']).optional().describe('Only tasks that are open, or done.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: STATE_META,
    },
    guarded(
      SCOPES.state,
      async ({
        id,
        since,
        before,
        kind,
        status,
      }: {
        id: string;
        since?: string | undefined;
        before?: string | undefined;
        kind?: EntryKind | undefined;
        status?: TaskStatus | undefined;
      }) => {
        const session = await loadSession(db, secret, caller.uid, id, {
          since,
          before,
          kind,
          status,
          markReadAt: now(),
        });
        if (!session) return fail('No shared session with that ID that you belong to.');
        const header = JSON.stringify(
          {
            title: session.title,
            yourRole: session.role,
            briefVersions: session.briefVersions,
            entries: session.entries.length,
            more: session.more,
            yourPreviousLoad: session.lastLoadedAt,
          },
          null,
          2,
        );
        return {
          content: [
            { type: 'text', text: header },
            ...(session.brief ? [{ type: 'text' as const, text: entryText(session.brief) }] : []),
            ...session.entries.map((entry) => ({ type: 'text' as const, text: entryText(entry) })),
          ],
        };
      },
    ),
  );

  server.registerTool(
    'update_session_brief',
    {
      title: 'Update a session’s brief',
      description:
        'Replaces the brief of a shared session: the one text that says where things stand (goal, decisions, open questions, next steps). Everyone in the session can read it. Earlier versions are kept, with who wrote them. In sessions with other members, text that looks like a password, key or token is refused.',
      inputSchema: z.object({ id, text: z.string().max(16 * 1024) }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      _meta: STATE_META,
    },
    guarded(SCOPES.state, async ({ id, text: body }: { id: string; text: string }) => {
      const brief = await updateBrief(db, secret, caller, now(), id, body);
      if (!brief) return fail('No shared session with that ID that you belong to.');
      await log('session.brief_updated', { session: id, entry: brief.id });
      return await withConsentNote(json({ saved: brief.id, createdAt: brief.createdAt }));
    }),
  );

  server.registerTool(
    'save_to_session',
    {
      title: 'Save to a shared session',
      description:
        'Adds text the user wants kept as an entry in a shared session, of one kind: note, decision, question, task, summary or artifact (code or a document). It can answer another entry. Everyone in the session can read it. In sessions with other members, text that looks like a password, key or token is refused.',
      inputSchema: z.object({
        id,
        text: z.string().max(64 * 1024),
        label: z.string().max(200).optional().describe('A short name for this entry.'),
        kind: z.enum(ENTRY_KINDS).default('note'),
        replyTo: z.string().max(64).optional().describe('The ID of the entry this one answers.'),
        assignee: z
          .string()
          .max(40)
          .optional()
          .describe('For a task: the handle of the member it is assigned to.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      _meta: STATE_META,
    },
    guarded(
      SCOPES.state,
      async ({
        id,
        text: body,
        label,
        kind,
        replyTo,
        assignee,
      }: {
        id: string;
        text: string;
        label?: string | undefined;
        kind: EntryKind;
        replyTo?: string | undefined;
        assignee?: string | undefined;
      }) => {
        try {
          const entry = await saveToSession(db, secret, caller, now(), id, body, label, {
            kind,
            replyTo,
            assignee,
          });
          if (!entry) return fail('No shared session with that ID that you belong to.');
          await log('session.entry_added', { session: id, entry: entry.id });
          return await withConsentNote(json({ saved: entry.id, createdAt: entry.createdAt }));
        } catch (error) {
          if (
            error instanceof SessionError &&
            error.message.startsWith('Not saved: this looks like')
          ) {
            await log('session.entry_refused', { session: id });
          }
          throw error;
        }
      },
    ),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update a task',
      description:
        'Marks a task entry in a shared session open or done, or assigns it to a member by handle (an empty handle: nobody). The task’s text stays as it was written.',
      inputSchema: z.object({
        id,
        entry: z.string().max(64).describe('The task entry’s ID.'),
        status: z.enum(['open', 'done']).optional(),
        assignee: z.string().max(40).optional().describe('A member’s handle; empty for nobody.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: STATE_META,
    },
    guarded(
      SCOPES.state,
      async ({
        id,
        entry,
        status,
        assignee,
      }: {
        id: string;
        entry: string;
        status?: TaskStatus | undefined;
        assignee?: string | undefined;
      }) =>
        (await updateTask(db, caller.uid, now(), id, entry, { status, assignee }))
          ? text('Updated.')
          : fail('No task with that ID in a session you belong to.'),
    ),
  );

  server.registerTool(
    'search_session',
    {
      title: 'Search a shared session',
      description:
        'Finds entries in one shared session (and its current brief) that contain all the given words, newest first. Each call reads part of a long session; `continueBefore` in the result says where to go on.',
      inputSchema: z.object({
        id,
        query: z.string().max(200),
        before: z
          .string()
          .max(64)
          .optional()
          .describe('The continueBefore value of the previous search.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: STATE_META,
    },
    guarded(
      SCOPES.state,
      async ({ id, query, before }: { id: string; query: string; before?: string | undefined }) => {
        const result = await searchSession(db, secret, caller.uid, id, query, before);
        if (!result) return fail('No shared session with that ID that you belong to.');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  matches: result.matches.length,
                  entriesSearched: result.searched,
                  continueBefore: result.continueBefore,
                },
                null,
                2,
              ),
            },
            ...result.matches.map((entry) => ({ type: 'text' as const, text: entryText(entry) })),
          ],
        };
      },
    ),
  );

  server.registerTool(
    'delete_session_entry',
    {
      title: 'Delete a session entry',
      description:
        'Deletes an entry the user wrote (or, as the session’s owner, any entry). It can’t be undone.',
      inputSchema: z.object({ id, entry: z.string().max(64) }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: STATE_META,
    },
    guarded(SCOPES.state, async ({ id, entry }: { id: string; entry: string }) =>
      (await deleteEntry(db, caller.uid, id, entry))
        ? text('Deleted.')
        : fail('No entry you can delete with that ID.'),
    ),
  );

  server.registerTool(
    'delete_session',
    {
      title: 'Delete a shared session',
      description:
        'Deletes a shared session the user owns, with every entry, for every member. It can’t be undone.',
      inputSchema: z.object({ id }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: STATE_META,
    },
    guarded(SCOPES.state, async ({ id }: { id: string }) =>
      (await deleteSession(db, caller.uid, id))
        ? text('Deleted.')
        : fail('No session you own with that ID.'),
    ),
  );

  return server;
}
