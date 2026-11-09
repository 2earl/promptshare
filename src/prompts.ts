/**
 * Prompts (docs/DESIGN.md §4). Every query is keyed by the caller: a prompt is visible to its
 * owner always, including after moderation; while it is active, to every 2earl user if it is
 * public, and to the people it is shared with (§4.1). "Not found" covers both missing and not
 * visible.
 */

export const PROMPT_LIMITS = {
  title: 200,
  description: 1_000,
  body: 32 * 1024,
  tags: 10,
  tagLength: 40,
  models: 10,
  modelLength: 60,
  perUser: 2_000,
  searchResults: 20,
  /** Values given to fill a prompt's variables (§4.2). */
  fillValues: 20,
  fillValue: 8 * 1024,
} as const;

export interface PromptInput {
  title: string;
  description?: string | undefined;
  body: string;
  tags?: string[] | undefined;
  models?: string[] | undefined;
}

interface PromptRow {
  id: string;
  owner_uid: string;
  title: string;
  description: string;
  body: string;
  tags: string;
  models: string;
  visibility: 'private' | 'public';
  status: 'active' | 'restricted' | 'removed';
  copied_from: string | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  /** The owner's handle, if they chose one (profiles). */
  author: string | null;
  /** 1 when the owner shared it with the caller. */
  shared: number;
  /** How many people the caller shared it with; 0 unless the caller is the owner. */
  share_count: number;
}

export interface Prompt {
  id: string;
  mine: boolean;
  title: string;
  description: string;
  body: string;
  tags: string[];
  models: string[];
  visibility: 'private' | 'public';
  status: 'active' | 'restricted' | 'removed';
  copiedFrom: string | null;
  /** The owner's handle: what other users see as the author. */
  author: string | null;
  /** Someone else's prompt they shared with you (§4.1). */
  sharedWithYou: boolean;
  /** Your own prompt: how many people you shared it with. */
  shareCount: number;
  /** Placeholders in the body, `{{name}}` or `{{name=default}}`, in order of first use (§4.2). */
  variables: PromptVariable[];
  createdAt: string;
  updatedAt: string;
}

export type PromptSummary = Omit<Prompt, 'body'>;

export interface PromptVariable {
  name: string;
  /** Used when no value is given; absent when the variable has none. */
  default?: string;
}

/**
 * `{{name}}` or `{{name=default}}`: a name of letters, digits, `_` and `-` starting with a letter,
 * and a default of up to 200 characters without braces or line breaks. Anything else between
 * braces (code, templates for other tools) is left alone.
 */
const VARIABLE = /\{\{\s*([A-Za-z][A-Za-z0-9_-]{0,39})\s*(?:=([^{}\n]{0,200}))?\}\}/g;

/** The variables a prompt body uses, each once, in order of first use. */
export function variablesOf(body: string): PromptVariable[] {
  const seen = new Map<string, PromptVariable>();
  for (const match of body.matchAll(VARIABLE)) {
    const name = match[1] ?? '';
    if (seen.has(name)) continue;
    const fallback = match[2]?.trim();
    seen.set(name, fallback ? { name, default: fallback } : { name });
  }
  return [...seen.values()];
}

export interface FilledPrompt {
  body: string;
  /** Variables left as `{{name}}`: no value given and no default. */
  unfilled: string[];
  /** Given names the prompt doesn't use. */
  unknown: string[];
}

/**
 * Puts values into a prompt's variables, or their defaults. Nothing is stored: the values are the
 * user's, for this one use. Values are inserted as given, never interpreted as patterns.
 */
export function fillPrompt(body: string, values: Record<string, string>): FilledPrompt {
  const names = Object.keys(values);
  if (names.length > PROMPT_LIMITS.fillValues) {
    throw new PromptError(`At most ${String(PROMPT_LIMITS.fillValues)} values.`);
  }
  if (names.some((name) => (values[name] ?? '').length > PROMPT_LIMITS.fillValue)) {
    throw new PromptError(
      `Each value can be at most ${String(PROMPT_LIMITS.fillValue)} characters.`,
    );
  }
  const used = new Set(variablesOf(body).map((v) => v.name));
  const unfilled = new Set<string>();
  const filled = body.replace(VARIABLE, (whole, name: string, fallback: string | undefined) => {
    if (Object.hasOwn(values, name)) return values[name] ?? '';
    if (fallback?.trim()) return fallback.trim();
    unfilled.add(name);
    return whole;
  });
  return {
    body: filled,
    unfilled: [...unfilled],
    unknown: names.filter((name) => !used.has(name)),
  };
}

export class PromptError extends Error {
  override name = 'PromptError';
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

const SHARED_WITH_CALLER =
  'EXISTS (SELECT 1 FROM prompt_shares s WHERE s.prompt_id = p.id AND s.recipient_uid = ?1)';

/** Visible to `uid` (?1): their own, or active and either public or shared with them. */
const VISIBLE = `(p.owner_uid = ?1 OR (p.status = 'active' AND (p.visibility = 'public' OR ${SHARED_WITH_CALLER})))`;

/** Every prompt query: the prompt, its author's handle, and whether it is shared with ?1. */
const COLUMNS = `p.*, pr.handle AS author, ${SHARED_WITH_CALLER} AS shared,
  (SELECT COUNT(*) FROM prompt_shares c WHERE c.prompt_id = p.id AND p.owner_uid = ?1) AS share_count`;
const SELECT = `SELECT ${COLUMNS} FROM prompts p LEFT JOIN profiles pr ON pr.uid = p.owner_uid`;

function toPrompt(row: PromptRow, uid: string): Prompt {
  return {
    id: row.id,
    mine: row.owner_uid === uid,
    title: row.title,
    description: row.description,
    body: row.body,
    tags: JSON.parse(row.tags) as string[],
    models: JSON.parse(row.models) as string[],
    visibility: row.visibility,
    status: row.status,
    copiedFrom: row.copied_from,
    author: row.author,
    sharedWithYou: row.owner_uid !== uid && row.shared === 1,
    shareCount: row.owner_uid === uid ? row.share_count : 0,
    variables: variablesOf(row.body),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function summary(prompt: Prompt): PromptSummary {
  const rest: Partial<Prompt> = { ...prompt };
  delete rest.body;
  return rest as PromptSummary;
}

function cleanList(values: string[] | undefined, max: number, length: number, what: string) {
  const list = [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
  if (list.length > max) throw new PromptError(`At most ${String(max)} ${what}.`);
  if (list.some((v) => v.length > length)) {
    throw new PromptError(`Each of the ${what} can be at most ${String(length)} characters.`);
  }
  return list;
}

function validate(input: PromptInput) {
  const title = input.title.trim();
  if (!title) throw new PromptError('A prompt needs a title.');
  if (title.length > PROMPT_LIMITS.title) {
    throw new PromptError(`The title can be at most ${String(PROMPT_LIMITS.title)} characters.`);
  }
  const description = (input.description ?? '').trim();
  if (description.length > PROMPT_LIMITS.description) {
    throw new PromptError(
      `The description can be at most ${String(PROMPT_LIMITS.description)} characters.`,
    );
  }
  if (!input.body.trim()) throw new PromptError('The prompt is empty.');
  if (new TextEncoder().encode(input.body).length > PROMPT_LIMITS.body) {
    throw new PromptError(`A prompt can be at most ${String(PROMPT_LIMITS.body / 1024)} KB.`);
  }
  return {
    title,
    description,
    body: input.body,
    tags: cleanList(input.tags, PROMPT_LIMITS.tags, PROMPT_LIMITS.tagLength, 'tags'),
    models: cleanList(input.models, PROMPT_LIMITS.models, PROMPT_LIMITS.modelLength, 'models'),
  };
}

/** Words → an FTS5 query that matches all of them, with no FTS syntax from the user. */
export function ftsQuery(text: string): string | null {
  const words = text.match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (words.length === 0) return null;
  return words
    .slice(0, 12)
    .map((word) => `"${word}"*`)
    .join(' ');
}

/** mine: your own. public: public prompts. shared: others' prompts shared with you. all. */
export type SearchScope = 'mine' | 'public' | 'shared' | 'all';

export async function searchPrompts(
  db: D1Database,
  uid: string,
  options: { query?: string | undefined; scope: SearchScope },
): Promise<PromptSummary[]> {
  const where = [VISIBLE];
  if (options.scope === 'mine') where.push('p.owner_uid = ?1');
  if (options.scope === 'public') where.push(`p.visibility = 'public' AND p.status = 'active'`);
  if (options.scope === 'shared') where.push(`p.owner_uid <> ?1 AND ${SHARED_WITH_CALLER}`);
  const match = options.query ? ftsQuery(options.query) : null;
  const sql = match
    ? `SELECT ${COLUMNS} FROM prompts_fts f JOIN prompts p ON p.rowid = f.rowid
       LEFT JOIN profiles pr ON pr.uid = p.owner_uid
       WHERE prompts_fts MATCH ?2 AND ${where.join(' AND ')}
       ORDER BY bm25(prompts_fts), p.updated_at DESC LIMIT ${String(PROMPT_LIMITS.searchResults)}`
    : `${SELECT} WHERE ${where.join(' AND ')}
       ORDER BY p.updated_at DESC LIMIT ${String(PROMPT_LIMITS.searchResults)}`;
  const statement = db.prepare(sql);
  const { results } = await (
    match ? statement.bind(uid, match) : statement.bind(uid)
  ).all<PromptRow>();
  return results.map((row) => summary(toPrompt(row, uid)));
}

export async function getPrompt(db: D1Database, uid: string, id: string): Promise<Prompt | null> {
  const row = await db
    .prepare(`${SELECT} WHERE p.id = ?2 AND ${VISIBLE}`)
    .bind(uid, id)
    .first<PromptRow>();
  return row ? toPrompt(row, uid) : null;
}

async function ownCount(db: D1Database, uid: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM prompts WHERE owner_uid = ?')
    .bind(uid)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function savePrompt(
  db: D1Database,
  uid: string,
  now: number,
  input: PromptInput,
  copiedFrom: string | null = null,
): Promise<Prompt> {
  const clean = validate(input);
  if ((await ownCount(db, uid)) >= PROMPT_LIMITS.perUser) {
    throw new PromptError(
      `You have ${String(PROMPT_LIMITS.perUser)} prompts, the most one account can keep. Delete some first.`,
    );
  }
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO prompts (id, owner_uid, title, description, body, tags, models, copied_from, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      uid,
      clean.title,
      clean.description,
      clean.body,
      JSON.stringify(clean.tags),
      JSON.stringify(clean.models),
      copiedFrom,
      now,
      now,
    )
    .run();
  const saved = await getPrompt(db, uid, id);
  if (!saved) throw new Error('prompt vanished after insert');
  return saved;
}

/** Changes only the fields given. Only the owner can change a prompt. */
export async function updatePrompt(
  db: D1Database,
  uid: string,
  now: number,
  id: string,
  patch: { [K in keyof PromptInput]?: PromptInput[K] | undefined },
): Promise<Prompt | null> {
  const current = await getPrompt(db, uid, id);
  if (!current?.mine) return null;
  const clean = validate({
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    body: patch.body ?? current.body,
    tags: patch.tags ?? current.tags,
    models: patch.models ?? current.models,
  });
  await db
    .prepare(
      `UPDATE prompts SET title = ?, description = ?, body = ?, tags = ?, models = ?, updated_at = ?
       WHERE id = ? AND owner_uid = ?`,
    )
    .bind(
      clean.title,
      clean.description,
      clean.body,
      JSON.stringify(clean.tags),
      JSON.stringify(clean.models),
      now,
      id,
      uid,
    )
    .run();
  return getPrompt(db, uid, id);
}

export async function unpublishPrompt(
  db: D1Database,
  uid: string,
  now: number,
  id: string,
): Promise<boolean> {
  const { meta } = await db
    .prepare(
      `UPDATE prompts SET visibility = 'private', published_at = NULL, updated_at = ?
       WHERE id = ? AND owner_uid = ?`,
    )
    .bind(now, id, uid)
    .run();
  return meta.changes > 0;
}

export async function deletePrompt(db: D1Database, uid: string, id: string): Promise<boolean> {
  const [, deleted] = await db.batch([
    db.prepare('DELETE FROM prompt_shares WHERE prompt_id = ? AND owner_uid = ?').bind(id, uid),
    db.prepare('DELETE FROM prompts WHERE id = ? AND owner_uid = ?').bind(id, uid),
  ]);
  return (deleted?.meta.changes ?? 0) > 0;
}

/** A private copy of a prompt the caller can see (public or shared), owned by the caller. */
export async function copyPrompt(
  db: D1Database,
  uid: string,
  now: number,
  id: string,
): Promise<Prompt | null> {
  const source = await getPrompt(db, uid, id);
  if (!source) return null;
  return savePrompt(db, uid, now, source, source.id);
}

export class PublishError extends PromptError {
  override name = 'PublishError';
}

/**
 * Makes one of the caller's prompts visible to every signed-in 2earl user. Only from the website,
 * after a preview (DESIGN D7); never offered to assistants. Needs a handle, an active prompt, and
 * publishing not suspended by moderation.
 */
export async function publishPrompt(
  db: D1Database,
  uid: string,
  now: number,
  id: string,
): Promise<Prompt | null> {
  const prompt = await getPrompt(db, uid, id);
  if (!prompt?.mine) return null;
  if (!prompt.author) throw new PublishError('Choose a handle first: it is shown as the author.');
  const suspended = await db
    .prepare('SELECT publishing_suspended_until AS until FROM profiles WHERE uid = ?')
    .bind(uid)
    .first<{ until: number | null }>();
  if (suspended?.until && suspended.until > now) {
    throw new PublishError(
      `Moderation suspended your publishing until ${new Date(suspended.until * 1000).toISOString().slice(0, 10)}. See your account page for the reasons.`,
    );
  }
  if (prompt.status !== 'active') {
    throw new PublishError('This prompt was restricted by moderation and can’t be made public.');
  }
  await db
    .prepare(
      `UPDATE prompts SET visibility = 'public', published_at = ?, updated_at = ?
       WHERE id = ? AND owner_uid = ? AND status = 'active'`,
    )
    .bind(now, now, id, uid)
    .run();
  return getPrompt(db, uid, id);
}
