# Prompt share: design

Status: **P1, C1 and C2a deployed**; **C2b built** (moderation).

Related:
- [2earl/login](https://github.com/2earl/login), the authorization server;
- [2earl/mcp](https://github.com/2earl/mcp), the gateway assistants reach this service through.
  Its [UPSTREAM_CONTRACT.md](https://github.com/2earl/mcp/blob/main/docs/UPSTREAM_CONTRACT.md) is
  what this service implements;
- [THREAT_MODEL.md](THREAT_MODEL.md);
- [LEGAL.md](LEGAL.md): what the law requires of a service that hosts users' content, and where
  each requirement is met.

## 1. What it does

Two things, for people with a 2earl account:

- **Prompts.** Save prompts once and use them from any assistant: Claude, ChatGPT, Cursor, any
  MCP client. A prompt is **private** (only its owner) or **public** (every signed-in 2earl
  user can find and copy it).
- **Shared sessions.** A shared session holds conversation state that assistants save and load,
  so work can continue:
  - in another session of the same assistant;
  - in a different assistant;
  - with other people.

  A shared session is always private. Others join only by an invitation from its owner; it is
  never public.

There are two ways in:
- **Assistants** use MCP tools through `https://mcp.2earl.com/mcp`.
- **People** use the website at `https://promptshare.cc`. It manages prompts, sessions,
  invitations, publishing and reports.

## 2. Decisions

| # | Decision | By |
|---|---|---|
| D1 | Repository `2earl/promptshare`, public, AGPL-3.0, same protections as login and mcp | Owner, 2026-11-09 |
| D2 | Website on `promptshare.cc` (registered) | Owner, 2026-11-09 |
| D3 | Prompts are private or public; public means visible to signed-in 2earl users only | Owner, 2026-11-09 |
| D4 | Shared sessions are always private; people join by invitation only | Owner, 2026-11-09 |
| D5 | Meet the legal duties of hosting users' content (LEGAL.md) | Owner, 2026-11-09 |
| D6 | One Worker serving the website, `GatewayMcp` and `AccountEvents` | Proposed |
| D7 | Publishing a prompt and inviting people happen only on the website, never through an assistant (§6) | Proposed |
| D8 | Session contents are encrypted in the application, with a key only the Worker holds (§7.1) | Proposed |
| D9 | Assistants first (phase P1), website second (P2) | Proposed |
| D10 | A private prompt can be shared with chosen people by email, only on the website. An address without an account is refused, with limits on tries (§4.1) | Owner, 2026-11-09 |
| D11 | login tells Prompt share, and only Prompt share, which account has a verified address (§4.1) | Owner, 2026-11-09 |

## 3. Architecture

```
assistant ─▶ mcp.2earl.com/mcp ── Service Binding (X-2earl-User/-Client/-Scopes) ──▶ ┐
                                                                                    │
browser ───▶ promptshare.cc ── sign in with 2earl (OAuth, PKCE) ──▶ login.2earl.com │
                │                                                                   ▼
                └──────────────────────────────▶ Worker "promptshare"
                                                   ├─ fetch: website, report form
                                                   ├─ GatewayMcp: MCP tools (gateway only)
                                                   └─ AccountEvents: deleteUser, exportUser (login only)
                                                   │
                                                   └─ D1 "promptshare" (EU)
```

- **One Worker, three entry points.** Only the default `fetch` is public. `GatewayMcp` and
  `AccountEvents` are named entrypoints that only Workers in the 2earl Cloudflare account can
  bind to.
- **Who the user is:**
  - on `GatewayMcp`, from the gateway's `X-2earl-User` header (UPSTREAM_CONTRACT §2);
  - on the website, from its own session cookie, set after signing in with login.

  The website never reads `X-2earl-*` headers.
- **Website sign-in** (phase P2):
  - promptshare.cc is an OAuth client of login (authorization code, PKCE), registered in login's
    `/admin`;
  - its resource is `https://promptshare.cc`;
  - it validates the token over a binding to login, keeps the `uid`, discards the token, and sets
    `__Host-session` on promptshare.cc.

  It is the same pattern as the gateway's planned web sign-in.
- **Storage:** D1 `promptshare`, EU jurisdiction, read replication off. Full-text search with
  SQLite FTS5 on prompt titles, descriptions, tags and bodies.

## 4. Prompts

| Field | Notes |
|---|---|
| title, description | Short text |
| body | The prompt. Up to 32 KB |
| tags | Up to 10 |
| models | Which assistants or models it was written for. Free text, e.g. "Claude", "GPT-5". Informational |
| visibility | `private` (default) or `public` |
| status | `active`; `restricted` or `removed` by moderation (§8) |

- **Copying:** anyone who can see a public prompt can copy it into their own private prompts.
  The copy is theirs and records where it came from.
- **Authorship:** public prompts show the author's **handle**, which the user picks on
  promptshare.cc. login doesn't give services names or emails, and the handle is the only
  identity other users see.
- **Publishing:** only on the website, after a preview that shows exactly what becomes visible
  (D7). Unpublishing is immediate and also available to assistants.

### 4.1 Sharing a prompt with people (phase S1)

A private prompt can be shared with up to 50 people by their email address. They can read it
and copy it; only the author changes it, and they see changes at once.

**Who sees what:**
- **The author** sees the addresses they typed and removes any of them at once.
- **A recipient** sees the prompt under "Shared with you" on promptshare.cc and through their
  assistant, with the author's handle. They can remove it from their list.
- **An address without a 2earl account is refused** (the owner's decision, 2026-11-09). This
  tells the author whether an address has an account, so tries are limited:
  - 3 unknown addresses within an hour lock sharing for 10 minutes;
  - each further lock doubles (20, 40 minutes…), at most a day, and a quiet day starts again at
    10 minutes;
  - 20 unknown addresses in a day lock it until a day after the first of them.

  While locked, every address is refused, known or not. The limits stop checking many addresses,
  not checking a few; the privacy policy says that sharing shows whether an address has an
  account.

**Matching an address to an account.** Prompt share doesn't know anyone's email (§4); login
does. login has a named entrypoint, `PromptshareDirectory`, bound only by Prompt share (the
`DIRECTORY` binding). `uidForEmail(email)` returns the one active account with that verified
address, or none, and never an address or a name. `prompt_shares` keeps the address the author
typed, shown only to them, with the account found for it.

**Assistants:**
- `search_prompts` and `get_prompt` also return prompts shared with you, labelled "shared by
  @handle" inside the same untrusted-content boundary as public prompts.
- `copy_prompt` works on them.
- **Sharing and unsharing happen only on the website (D7).** Text an assistant reads could
  otherwise tell it to share your private prompts with an attacker's address.

**Email:** none for now. On the free plan Cloudflare sends only to verified destination addresses.
That includes promptshare@2earl.com as a sender: emailing users needs Workers Paid and the sending
domain onboarded in Email Sending, the same as reporter emails. Later, a second switch on `/admin`
("Email people when a prompt is shared with them") can add it, at most 20 shares a day per author.

**Limits:**
- 50 recipients per prompt;
- 200 new shares per author per day;
- public prompts aren't shared, since every user sees them already.

**Legally**, a prompt shared with chosen people is hosting, like a session, not dissemination to
the public (LEGAL.md §1). Recipients can report it like a session entry.

**Account deletion:**
- an author's shares go with their prompts;
- a recipient's shares are deleted.

### 4.2 Variables (phase P4)

Most saved prompts are templates: the same instructions around a part that changes ("release
notes for {{diff}}"). Without help, the assistant gets the placeholder text and has to guess.

- A variable is `{{name}}`, or `{{name=default}}` with a default. Names are letters, digits, `_`
  and `-`, starting with a letter; a default has no braces or line breaks and at most 200
  characters. Anything else between braces (code, other template languages) is left alone.
- Every prompt result has `variables`, worked out from the body. Nothing new is stored.
- `get_prompt` takes `fill`: values by name, at most 20, 8 KB each. The result is the body with
  the values inserted as given, defaults for the rest, and `unfilled` for variables that are still
  open. The values are used for that one answer and never stored. The tool description asks the
  assistant to take values from the conversation or ask the user.
- Someone else's prompt stays wrapped as theirs after filling (THREAT_MODEL.md): the user's values
  are inside text another user wrote.
- The website shows the variables under a prompt, and the editor says how to write them.

### 4.3 Earlier versions (phase P5)

A prompt gets better by trying changes, and a change that made it worse had no way back.

- Each change to a prompt's content (title, description, body, tags or models) keeps what it
  replaced in `prompt_versions`, in the same batch as the change. Changing nothing keeps nothing.
- The newest 10 versions per prompt are kept.
- Only the owner sees them: `list_prompt_versions`, `get_prompt` with `version`, and on the
  website "N earlier versions" under the prompt. The website shows what restoring a version would
  change, line by line.
- `restore_prompt_version` (and the website's "Restore this version") makes a version current
  through the same change path, so what it replaces is kept and restoring can be undone. A public
  prompt changes for everyone at once, as with any change.
- Copies don't carry versions. Deleting a prompt deletes its versions; account deletion deletes
  them all; "Download your data" includes them (§7.2).

### 4.4 The prompt menu (phase P6)

Assistants that support MCP prompts (Claude does, for remote connectors) show them in a menu, and
what the user picks is sent as their message. That is the most direct way to use a saved prompt.

- `GatewayMcp` declares the `prompts` capability. `prompts/list` has, by the app's permissions:
  - `resume_session` (needs `state`), with one argument, the session's title or ID;
  - the user's 50 newest **own** prompts (needs `read`), named `<slug of the title>-<first 8
    characters of the ID>`, titled with the prompt's title, with its variables (§4.2) as
    arguments, required unless they have a default.
- `prompts/get` for a prompt returns one user message: the body, filled in. Empty arguments use
  the default, as in §4.2.
- `prompts/get` for `resume_session` returns one user message: an instruction to summarise where
  things stand, then the same summary, brief and entries as `load_session` with `since: "brief"`.
  Other members' entries stay wrapped as theirs (THREAT_MODEL.md).
- **Only the user's own prompts.** A menu prompt is sent as the user's own message, outside the
  wrapping a tool result gets. Public and shared prompts would put another user's text in the
  user's mouth, so they stay tools only.
- The gateway passes prompts through only from first-party services (2earl/mcp DESIGN).

## 5. Shared sessions

A shared session has a title, an owner and members. Its content is a list of **entries** that
assistants (or people on the website) add. Each entry records:
- its text, up to 64 KB;
- an optional label ("summary after step 3");
- the author's handle;
- the assistant that wrote it (the gateway's client ID);
- the time.

Entries are added and deleted, never edited, so it stays clear who wrote what. Each has a kind
(note, decision, question, task, summary, artifact) and can reply to another entry. A session also
has a **brief** (§5.1). Loading a session returns the brief, then its newest entries first, up to
a size limit, with the author of each.

| Role | Can |
|---|---|
| owner | everything, including inviting, removing members and deleting the session |
| editor | read and add entries; delete their own |
| viewer | read |

Limits [proposed]:
- 50 sessions per user;
- 20 members per session;
- 5 MB per session.

**Invitations** (phase P2, website only):
- The owner creates an invitation link for a role. It is single use, valid for 7 days, and stored
  as a hash.
- The invitee opens it, signs in with 2earl, sees the session's title, owner and role, and
  presses **Join**.
- There is no user directory, so nobody can find other users by searching.

Before the website exists, sessions work between one person's own assistants and sessions only.

### 5.1 What session users need next (phases S2, S3)

The tools today: create, list, load, add, delete an entry, delete the session. Thinking through
real use:

| Use | What's missing | Proposal | Phase |
|---|---|---|---|
| "Continue in ChatGPT what I did in Claude" | The next assistant reads the whole log, newest first, and has to work out the current state | A **brief** per session: one editable text (goal, decisions, open questions, next steps) that `load_session` returns first. `update_session_brief` replaces it; earlier versions and who wrote them are kept | S2 |
| Coming back to a team session | No way to see only what's new | `load_session` takes `since` (an entry ID). `list_sessions` shows the number of entries newer than your last load | S2 |
| Telling a decision from a note | Every entry is free text with an optional label | Entry `kind`: `note`, `decision`, `question`, `task`, `summary`, `artifact` (code or a document). `load_session` filters by kind | S2 |
| Answering a member's question | Entries don't refer to each other | `reply_to` on an entry; `load_session` shows threads | S2 |
| Renaming, or starting from a prompt | Title is fixed; sessions start empty | `update_session` (title, owner only); `create_session` with `fromPromptId` puts the prompt in the brief | S2 |
| "What did we decide about X?" | No search inside a session | `search_session`: decrypts and searches one session (at most 5 MB). Search across all sessions isn't offered, because entries are encrypted (§7.1) | S3 |
| Tasks between members | A task is text | `task` entries with status and an assignee handle; `update_task` | S3 |
| Keeping a copy | No export of one session | Markdown download on the website | S3 |

How S2 is built:
- **The brief is stored as entries of kind `brief`:** each change is a new one, and the newest
  not removed is current. So the brief gets entries' encryption, size limit, credential check,
  reporting, moderation, deletion and export unchanged. The last 20 versions are kept; at most
  16 KB each. A version by another member reaches assistants inside the untrusted-content
  boundary.
- **Order is insertion order** (SQLite's rowid), not time: two entries saved in the same second
  keep their order for `since` and `before`.
- **New for you:** each member's `last_read_at` is set when they load the newest entries (not
  when paging back). `list_sessions` counts other members' entries after it.
- **Starting from a prompt** works with the user's own prompts only: the brief would show
  another user's text as the user's. Copy it first.

How S3 is built:
- **CPU budget.** The free plan allows 10 ms of CPU per request. Decrypting a full 5 MB session
  took about 110 ms locally, after two changes: ciphertext is read as `hex()` and decoded with
  `Uint8Array.fromHex` (D1's default, an array of numbers per BLOB, took 390 ms), and the derived
  key is cached per isolate. So search and export read at most 512 KB per request, by stored
  size: search goes newest first and says where to continue (`continueBefore`); export comes in
  numbered parts, oldest first, with the brief in part 1. On Workers Paid the budget can grow.
- **Tasks** are entries of kind `task` with `task_status` and `assignee_uid`. Changing them doesn't
  change the text. An assignee must be a member with a handle; leaving the session or deleting the
  account clears the assignment.

Kept as they are:
- **Entries are never edited** (it stays clear who wrote what). The brief is the part that is
  meant to change, and it has a history.
- **Inviting, roles and leaving stay on the website (D7).** An assistant that reads others'
  entries must not be able to add members.

### 5.2 Staying current (phase S4)

Found by using a session the way assistants do: loading "Core" an hour after its brief was
written. The brief no longer matched what had happened since, nothing in the load said so, and a
second assistant updating it would have replaced the first one's version without either knowing.

| Problem | Change |
|---|---|
| "Load my Core session" took two calls: list, then load by ID | `load_session` also takes the exact title (case ignored). Several sessions with that title: the tool names their IDs instead of picking one |
| Nothing says whether the brief is out of date | The load summary has `brief`: its version, when and by whom it was written, and `entriesSince`, the entries saved after it. When that is above 0, a `note` asks the assistant to offer the user an updated brief. The tool description asks the same when work in the conversation changes where things stand. Only an offer: nothing is saved unless the user agrees (directory policy on stored conversation content) |
| Open items are kept twice, as prose in the brief and as tasks, and drift apart | The summary lists open tasks (up to 20): the label, or the first line of a task up to 2 KB. Longer unlabelled tasks aren't decrypted, for the CPU budget |
| Coming back to a session whose brief someone else rewrote means rereading 16 KB | `briefChangedSinceYourLastLoad`: lines removed and added since the version current at the user's last load, at most 40, for a brief another member wrote. Briefs over 400 lines aren't compared |
| Two writers of the brief silently overwrite each other | `update_session_brief` takes `basedOn`, the version that was read (empty: there was none). The check and the insert are one SQL statement, so two writers can't both pass. Without `basedOn` it saves as before. The website's form always sends it, and on a conflict shows the newer version with the user's text still in the box |
| An entry doesn't say which assistant wrote it | The user's own entries say "written by you with claude.ai" (the client ID's host, or "on promptshare.cc"). Other members' entries don't: which assistant someone uses is theirs to tell. The client ID was already stored (§7); nothing new is stored |

**Resuming a long session** (phase P4): `load_session` takes `since: "brief"`, the entries saved
after the current brief (all of them if there is none). The brief summarises everything before it,
so this is the brief plus what it may not cover yet, without paging through the rest.

Considered and not done:
- **Summaries written by a model on the server.** A new processor of session content, cost, and
  CPU; the assistant reading the session can summarise it.
- **Search across all sessions.** Still blocked by per-session encryption (§7.1).
- **Linking entries to pull requests or other outside state.** A new integration and data flow.

## 6. MCP tools (through the gateway)

Gateway service entry: `{ id: 'promptshare', name: 'Prompt share', binding: 'PROMPTSHARE',
trust: 'first-party' }`. Tools appear to assistants as `promptshare__<tool>`.

| Tool | Does | Permission |
|---|---|---|
| `search_prompts` | Search your prompts, prompts shared with you, and public prompts | `mcp:promptshare.read` |
| `get_prompt` | One prompt, by ID; with `fill`, its variables filled in (§4.2); with `version`, an earlier version of yours (§4.3) | `read` |
| `list_prompt_versions` | Earlier versions of one of your prompts (§4.3) | `read` |
| `save_prompt` | Create a private prompt | `mcp:promptshare.write` |
| `update_prompt` | Change your prompt (a public one stays public; the change is visible at once) | `write` |
| `restore_prompt_version` | Make an earlier version current; what it replaces is kept (§4.3) | `write` |
| `unpublish_prompt` | Make your public prompt private | `write` |
| `delete_prompt` | Delete your prompt | `write` |
| `copy_prompt` | Copy a public or shared prompt into your own | `write` |
| `list_sessions` | Sessions you own or belong to | `mcp:promptshare.state` |
| `create_session` | A new session, owned by you | `state` |
| `load_session` | Read a session's brief and entries (`since`, `before`, `kind`), by ID or exact title; the summary says how current the brief is, lists open tasks and what another member changed in the brief (§5.2) | `state` |
| `save_to_session` | Add an entry of a kind, optionally as a reply | `state` |
| `update_session_brief` | Replace the session's brief; earlier versions stay. With `basedOn`, refused if the brief changed since it was read (§5.2) | `state` |
| `rename_session` | Rename a session you own | `state` |
| `update_task` | Mark a task open or done, or assign it to a member | `state` |
| `search_session` | Find entries holding all given words in one session | `state` |
| `delete_session_entry` | Delete an entry you wrote (the owner: any entry) | `state` |
| `delete_session` | Delete a session you own, for every member | `state` |

The gateway enforces these permissions, and the service checks them again. They are declared in
login's registry with this consent wording:

| Permission | Consent wording |
|---|---|
| `mcp:promptshare.read` | Read your prompts and public prompts in Prompt share |
| `mcp:promptshare.write` | Create, change and delete your prompts in Prompt share |
| `mcp:promptshare.state` | Save to and read your shared sessions in Prompt share, including ones other people can see |

`state` is separate from `read` and `write` because sessions hold whole conversations: letting an
assistant read your prompts must not let it read or write those.

**Not available to assistants** (D7):
- publishing a prompt;
- inviting people;
- changing members.

These are the actions that make your content visible to others. An assistant can be steered by
text it reads (THREAT_MODEL), so they need a person on the website. If assistants should publish
later, that gets its own permission (`mcp:promptshare.publish`).

**Content written by someone else** (public prompts, other members' entries) is returned:
- inside a clearly delimited block;
- labelled with its author;
- with a note that it is someone else's text and not instructions from the user.

That doesn't make injection impossible (THREAT_MODEL), but it gives the assistant what it needs
to tell the two apart.

MCP's own **prompts** primitive (`prompts/list`, `prompts/get`) offers the user's own prompts and
resuming a session in the assistant's prompt menu (§4.4); the gateway passes it through.

## 7. Data (D1 `promptshare`, EU)

| Table | Holds | Kept |
|---|---|---|
| `profiles` | `uid`, handle, display name | Until account deletion |
| `prompts` (+ FTS index) | §4 fields, `owner_uid`, copied-from | Until deleted by the owner or account deletion |
| `prompt_versions` | earlier content of a prompt (title, description, body, tags, models), owner, when saved and replaced | The newest 10 per prompt; until the prompt is deleted or account deletion |
| `prompt_shares` | prompt, author, recipient's `uid`, the address the author typed | Until the author stops sharing, the recipient removes it, or either account is deleted |
| `share_misses`, `share_locks` | when an author tried an address without an account; their lock | 1 day |
| `shared_sessions`, `session_members` | title, owner, members and roles, when each member last loaded the newest entries | Until deleted |
| `session_entries` | **encrypted** text, kind (including brief versions), the entry it replies to, task status and assignee, label, author `uid`, client ID, size, time | Until deleted |
| `invitations` | hash of the link token, session, role, creator, expiry, use | 7 days, single use |
| `web_sessions` | hash of the website session cookie, `uid`, times | 12 h idle / 7 days |
| `reports`, `moderation_decisions` | §8 | LEGAL.md §4 |
| `audit_events` | security log: names of actions, never content | 90 days |

### 7.1 Encrypting session content (D8)

Entries are encrypted with AES-256-GCM before they reach D1:
- the key is derived per session (HKDF) from `STATE_ENCRYPTION_KEY`, a Worker secret;
- the associated data is the session and entry IDs.

D1 is already encrypted at rest by Cloudflare. This protects against something else: anyone who
can read the database **through the Cloudflare API** with a leaked API token (for example the
deploy token) gets ciphertext. A Worker secret can't be read back through the API.

Prompts are not encrypted, because they need full-text search. Private prompts are personal data
and are protected like the rest of the database.

### 7.2 Account deletion and export

**`AccountEvents.deleteUser(uid)`** is idempotent and throws if anything remains. It deletes:
- the profile;
- all the user's prompts, public ones included. Copies others made are theirs and stay;
- sessions they own, for every member;
- entries they wrote in other people's sessions;
- their memberships and invitations they created.

Reports and moderation decisions keep only what LEGAL.md §4 requires, with the user's ID
replaced.

**`AccountEvents.exportUser(uid)`** returns:
- the profile and the user's prompts;
- sessions they own with all entries, decrypted;
- entries they wrote elsewhere;
- memberships;
- reports they filed, and decisions about their content.

login's "Download your data" includes it.

## 8. Reports and moderation (LEGAL.md)

- **Report:** every public prompt and every session entry has a **Report** link. A public form
  at `promptshare.cc/report` also works without an account, as the law requires. It asks for:
  - the content's link;
  - why it is illegal or against the terms;
  - name and email (optional where the law allows);
  - a good-faith confirmation.

  Reporters who give an email get a confirmation and the decision.
- **Decide:** the owner sees reports in an admin view, signed in with 2earl and the second
  factor, like login's `/admin`. The possible decisions:
  - no action;
  - restrict (the prompt becomes private and can't be republished);
  - remove;
  - suspend the account's publishing.
- **Explain:** the affected user gets a statement of reasons on the prompt's page and in their
  account: what was decided, why, on which ground (illegal content or terms), and how to contest
  it.
- **Contest:** a reply link sends the objection to the same queue.
- **Threats to life or safety:** the procedure for informing the authorities is in LEGAL.md §3.

## 9. Infrastructure

- **Terraform** in `infra/`, HCP workspace `2earl-promptshare` (to be created by the owner):
  - D1 `promptshare` in the EU, protected from destroy;
  - from phase P2: the `promptshare.cc` zone's settings and the custom domain.

  The zone must be in the same Cloudflare account as 2earl.com, because the gateway can bind only
  to Workers in its own account.
- **Secrets** (GitHub `production` environment, set by the owner):
  - `CLOUDFLARE_API_TOKEN`;
  - `STATE_ENCRYPTION_KEY`;
  - from P2: `SESSION_PEPPER` and the OAuth client secret.
- **CI and deploys** as in mcp:
  - required `verify` check;
  - deploys only from `main`, through `production` with the owner's approval;
  - SHA-pinned actions, release-age delay, Dependabot, CodeQL.

## 10. Phases

| Phase | Deliverable | State |
|---|---|---|
| P0 | This design, the threat model, LEGAL.md | Done |
| P1 | Worker with `GatewayMcp` (§6 tools: private prompts, own sessions) and `AccountEvents`; D1; CI, deploy, Terraform; the gateway's entry and binding; login's scopes and registry entry. **An assistant can save and reuse prompts and continue across sessions** | Done, deployed |
| P2 / C1 | Website on promptshare.cc: sign-in with login (CIMD client, PKCE), managing your own prompts and sessions, how-to-connect page, contact form (the imprint's second channel), report form (DSA Art. 16), owner notified by email | Built |
| P2 / C2a | Handle; publishing after a preview; public prompts to explore, read, copy and report; invitation links (single use, 7 days, HMAC only), members, leaving; assistants see authors' handles | Built |
| P2 / C2b | Moderation view at `/admin`: the owner's account (`OWNER_UID`) with a second factor verified through login in the last 15 minutes (`acr_values=urn:2earl:aal2`). Restrict, remove, suspend publishing, threat to life or safety, reverse; statements of reasons at `/decisions/:id`; contest once per decision; report links on entries; ~6-month retention, threat evidence kept | Built |
| P2 / D | Terms and privacy policy on 2earl.com cover Prompt share; the imprint links the contact form | Open: 2earl/website#6 |
| P2 / C2c | Explicit consent for sensitive data (asked once, withdrawable); owner reminded of messages open 30 minutes; reporters emailed receipt and decision when the owner turns it on (Workers Paid) | Built |
| S1 | Sharing a private prompt with people by email (§4.1): login's `PromptshareDirectory`, `prompt_shares`, "Shared with you" on the website and through assistants; privacy policy | Built |
| S2 | Sessions: brief with history, `since` and new-entry counts, entry kinds, replies, renaming, starting from a prompt (§5.1) | Built |
| S3 | Sessions: search within a session, tasks with status and assignee, Markdown export (§5.1) | Built |
| S4 | Sessions: load by title, brief freshness, open tasks and brief changes on load, brief updates that can't overwrite a newer version (§5.2) | Built |
| P4 | Prompt variables with defaults, filled by `get_prompt` (§4.2); resuming a session from its brief (`since: "brief"`, §5.2) | Built |
| P5 | Earlier versions of a prompt: kept on change, listed, read and restored, by the owner only (§4.3) | Built |
| P6 | The prompt menu: own prompts and resuming a session as MCP prompts, through the gateway (§4.4) | Built |

Public prompts can't exist before C2, because publishing is a website action. So nothing public
is hosted before the legal items are done.

## 11. Decisions after review

1. **Limits (§5):** 50 sessions per user, 20 members, 5 MB per session, 64 KB per entry,
   32 KB per prompt. Accepted by the owner, 2026-11-09. Added: 2,000 prompts per user.
2. **Session owner deletes their account (§7.2):** the session is deleted for every member.
   Proposed, not yet confirmed.
3. **HCP workspace** `2earl-promptshare`, working directory `infra`: created by the owner,
   2026-11-09.
4. **promptshare.cc** is a zone in the 2earl Cloudflare account: confirmed by the owner,
   2026-11-09. Before C2: the
   LEGAL.md §6 items.
