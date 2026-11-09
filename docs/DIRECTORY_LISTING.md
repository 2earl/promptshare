# Prompt share: Claude connector directory listing

What to enter at [claude.ai/directory/manage](https://claude.ai/directory/manage) → **Submit
new** → **MCP connector**, step by step. The owner submits. Requirements checked against
Anthropic's docs on 2026-11-09:
- [Submit a connector](https://claude.com/docs/connectors/building/submission)
- [Review criteria](https://claude.com/docs/connectors/building/review-criteria)
- [Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)

## Before submitting

| Requirement | State |
|---|---|
| Remote server over HTTPS | ✓ `https://mcp.2earl.com/promptshare` |
| OAuth 2.0 | ✓ login.2earl.com; Claude registers itself (no client ID to enter) |
| Every tool has a `title` and `readOnlyHint` or `destructiveHint` | ✓ checked by a test (`tools.test.ts`) |
| Tool descriptions say what the tool does, never how Claude should behave | ✓ reviewed 2026-11-09 |
| Tested as a custom connector in Claude | ✓ by the owner; **call every tool once more before submitting**, including the S2 and S3 tools |
| Public documentation with ≥ 3 working examples and troubleshooting (policy 3C, 3E) | ✓ https://promptshare.cc/connect; a test checks every tool is on it |
| Privacy policy | ✓ https://2earl.com/privacy |
| **Anyone can sign up** | ✗ login is invite-only (`LOGIN_LOCKED`). A listed connector nobody can sign in to fails the users and likely the review. **Owner's decision** |
| **Test account with sample data for reviewers** (policy 3D) | ✗ promptshare issue #5. **Owner's decision** |
| Paid Claude plan for the submitting account | Owner to confirm |

## 1. Connection

- URL: `https://mcp.2earl.com/promptshare`
- Users connect to different URLs: **no**

## 2. Tools

Synced from the server: 17 tools. Read-only: `search_prompts`, `get_prompt`, `list_sessions`,
`load_session`, `search_session`. The rest are marked destructive, so Claude asks before each.

## 3. Listing

**Server name** (12/100)

```
Prompt share
```

**One-liner** (126/200)

```
Keep the prompts you reuse and the notes you want to keep, use them from any assistant, and share them with people you choose.
```

**Description** (1463/2,000)

```
Prompt share keeps two things for you: prompts you reuse, and shared sessions: notes, decisions, questions and tasks you choose to keep, alone or with people you invite.

Prompts
- Save a prompt from the conversation, find it later by words, and use it in any assistant that connects to Prompt share.
- Read public prompts other 2earl users published, and copy one into your own to change it.
- Read prompts someone shared with you by email.

Shared sessions
- A session has a brief, one text saying where things stand (goal, decisions, open questions, next steps), and entries, each a note, decision, question, task, summary or artifact.
- Load a session in another chat or another assistant, or only what changed since you last looked.
- Assign tasks to members and mark them done; search a session for what was decided.

What it doesn't do
- It stores only what you or your assistant explicitly save. It never reads your chat history, and it keeps no profile of you.
- Making a prompt public, sharing it, and inviting people happen only on promptshare.cc, never through Claude, so text Claude reads can't make it share your things.
- Text written by other people (public or shared prompts, other members' entries) reaches Claude clearly marked as theirs.

Your data
- Session entries are encrypted. You can download or delete everything from your 2earl account.
- Hosted on Cloudflare in the EU.

You need a 2earl account: sign in with Google when you connect.
```

| Field | Value |
|---|---|
| Categories (1–5) | Productivity, Collaboration (pick the closest the portal offers) |
| Documentation URL | https://promptshare.cc/connect |
| Privacy policy URL | https://2earl.com/privacy |
| Support contact | promptshare@2earl.com (routes to the owner) |
| Icon | [`docs/listing/icon-512.png`](listing/icon-512.png): the 2earl mark, 512 × 512 PNG |
| URL slug | `prompt-share`. **Permanent once published** |

## 4. Use cases

Primary use cases:
1. Save a prompt from a conversation and reuse it later, in Claude or another assistant.
2. Keep a project's brief, decisions and open questions in a shared session, and pick it up in a
   new chat or another assistant.
3. Work on a shared session with invited people: each person's assistant adds entries, answers
   questions and marks tasks done.
4. Find and copy prompts other users published or shared with you.

Before connecting, users need: a 2earl account (sign in with Google at login.2earl.com; free).

Reads and writes: **both**.

## 5. Company

| Field | Value |
|---|---|
| Company name | 2earl |
| Website | https://2earl.com |
| Primary contact | The owner's name and email (not in this public repository) |

## 6. Authentication

- Authentication requirement: **required**.
- Method: OAuth 2.0 through the server's own authorization server (login.2earl.com), with
  Protected Resource Metadata. Claude registers itself; there is **no client ID or secret to
  enter**.

## 7. Data handling

| Question | Answer |
|---|---|
| Whose API | Our own (first-party): Prompt share and the gateway run on 2earl's Cloudflare account, on 2earl's domains |
| Personal health data | Not designed for it. Users may choose to save it; promptshare.cc asks for explicit consent (GDPR Art. 9(2)(a)) and assistants show a note until the user answers. Say so if the portal has a free-text field; otherwise answer **no** only if the portal's question is about the connector's purpose |
| Sponsored content | No |

## 8. Test & launch

Reviewer instructions, to complete once issue #5 is decided:

```
1. In Claude, add the connector https://mcp.2earl.com/promptshare and sign in with
   Google as <reviewer account>. Password and second factor: in the credentials field.
2. On the consent page, tick all three permissions.
3. The account holds: several private prompts, one public prompt, one prompt shared with it by
   another account, and the session "Reviewer demo" with a brief, entries of each kind, an open
   task assigned to the reviewer, and a second member.
4. Try: "Find my prompt about code review", "Load my Reviewer demo session and tell me what's
   open", "Add a decision to Reviewer demo: ship on Friday", "Mark the open task done",
   "Search Reviewer demo for flights".
5. The website https://promptshare.cc shows the same account (Sign in with 2earl).
```

Confirm you ran every tool as a custom connector in Claude.

## 9. Compliance

All seven acknowledgments are required. How Prompt share meets each, for answers or reviewer
notes:

| Acknowledgment | Prompt share |
|---|---|
| Directory guidelines | This page; annotations and descriptions are tested |
| First-party API usage | Only 2earl's own services, on 2earl's domains |
| Financial transactions | None |
| AI media generation | None |
| Prompt injection | Descriptions only describe. Text by other users reaches Claude inside a random-boundary block marked "written by another 2earl user". Publishing, sharing and inviting are not tools |
| Conversation data collection | Stores only what the user or their assistant explicitly saves with a tool call. No chat history, memory or files are read; no profiles are built. Policy 1G is the closest rule: Prompt share is user-directed storage, like a notes app, and the listing says so |
| Public documentation | https://promptshare.cc/connect |

## Risks for the review

1. **Policy 1G** ("must not persistently store or use conversation content to build user
   profiles, or attempt to make any changes to Claude's behavior across sessions"). Prompt share
   stores what users ask it to store, across sessions, by design. The listing, the docs and the
   tool descriptions say "only what you save" and avoid "memory". A reviewer could still read
   1G strictly. If rejected for it, the answer is the user-directed storage argument, through
   `mcp-review@anthropic.com`.
2. **Invite-only sign-up** (above).
3. **Free-plan CPU limit (10 ms)**: a reviewer running `search_session` or loading a large session
   may hit "exceeded resource limits". The reviewer demo session should stay small.
