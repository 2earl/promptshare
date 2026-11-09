# Prompt share: threat model

Status: proposal (phase P0), with [DESIGN.md](DESIGN.md). Sign-in, consent and tokens are
login's ([threat model](https://github.com/2earl/login/blob/main/docs/THREAT_MODEL.md)). The
assistant path is the gateway's
([threat model](https://github.com/2earl/mcp/blob/main/docs/THREAT_MODEL.md)).

## Assets

1. **Session content:** whole conversations users chose to save, possibly with health data,
   other people's data or credentials. The most sensitive data in 2earl.
2. **Private prompts.**
3. **Integrity of public prompts and session entries**, which other users' assistants read.
4. **Users' choices about visibility:** what is private stays private.
5. **Moderation records:** reports and reporters' contact details.

## Trust boundaries

- Gateway → `GatewayMcp`: same Cloudflare account. The `X-2earl-*` headers are trusted.
- Browser → website: an untrusted browser with a promptshare.cc session.
- Anyone → report form: untrusted, unauthenticated.
- **Content → assistants:** public prompts and other members' entries are untrusted input for
  every assistant that reads them.

## Threats and controls

| Threat | Control | Verified by (planned) |
|---|---|---|
| **Cross-user prompt injection:** a member writes an entry, or an author a public prompt, telling the reader's assistant to save secrets into the session or delete the reader's prompts | Others' content is returned delimited, attributed and labelled as not the user's instructions. Publishing, inviting and member changes are website-only, so injected text can't make anything public. `state` is a separate permission from `read`. A save into a session with other members is refused when the text looks like credentials | Tests: labelling, secret detection, no publish tool. Residual risk below |
| Reading or changing another user's prompts or sessions (IDOR) | Every query is keyed by the caller's `uid` and membership; IDs are random (128 bits); "not found" for both missing and forbidden | Tests per tool and page |
| Forged `X-2earl-*` headers on public routes | Only `GatewayMcp` reads them; the website's `fetch` never does | Test: headers on `fetch` are ignored |
| Database read through a leaked Cloudflare API token | Session entries encrypted with a key held only as a Worker secret (DESIGN §7.1) | Test: rows hold no plaintext |
| Accidental publication | Private by default; publishing only on the website after a preview; unpublish at once | Browser test |
| Handle impersonation (`admin`, `promptshare`, `2earl…`) | Reserved handles; unique regardless of case | Test |
| Joining a session without an invitation | Single-use, hashed, 7-day links; joining needs a signed-in person pressing **Join** (CSRF-protected); the owner sees and removes members | Tests |
| An invitation link leaks | Single use; the owner sees who joined and can remove them and revoke unused links | Tests |
| User enumeration | No directory or search of users; handles appear only on public prompts | Review |
| Enumeration through sharing by email (S1): "does this address have an account?" | Accepted in part (owner, 2026-11-09): unknown addresses are refused. 3 within an hour lock sharing for 10 minutes, doubling; 20 a day lock it for the day; while locked every address is refused; 200 shares a day. Checking a few addresses stays possible | Tests: lock, doubling, daily lock, refusal while locked |
| Injected text makes an assistant share a private prompt with an attacker | Sharing is website-only (D7); no MCP tool shares | Test: no share tool |
| A member rewrites the session brief to steer others' assistants (S2) | The brief is an entry: versions by others reach assistants inside the untrusted-content boundary, with who wrote them; every version is kept (20) and reportable; viewers can't change it; credential check applies | Tests |
| Another user's prompt text presented as the user's own brief (`create_session` with `fromPromptId`) | Only the user's own prompts | Test |
| Abuse of the report form (spam, fake reports) | Rate limits per network; no account needed by law, so reports are queued, never acted on automatically | Tests |
| Unlawful public content | Notice and action, statements of reasons, Art. 18 procedure (LEGAL.md) | Tests: report → decision → statement → contest → reversal |
| Someone else uses the moderation view | Only `OWNER_UID`, and only with a second factor verified through login in the last 15 minutes; 404 for everyone else; forms refuse a stale second factor | Tests; each check broken on purpose is caught |
| Reading another user's statement of reasons | Decisions are looked up by ID and the affected user together | Test |
| Size and cost abuse | Limits per prompt, entry, session and user (DESIGN §5); gateway rate limit | Tests |
| Data left after account deletion | `AccountEvents.deleteUser`, retried by login | Tests |
| XSS through prompt or entry text on the website | Output escaped; CSP `default-src 'none'`, no scripts at all; text never rendered as HTML | Rendering and header tests |
| Website sign-in: forged callback, replay, code interception, mix-up | `state` bound to a `__Host-` cookie, used once, 10 minutes; PKCE S256; `iss` checked (RFC 9207); code exchanged and token validated over the binding to login, never the public Internet; token discarded after | Tests: replay, wrong state, missing cookie, wrong issuer, wrong verifier |
| Session theft or fixation on the website | New random session at each sign-in; only its HMAC stored; `__Host-`, Secure, HttpOnly, SameSite=Lax; 12 h idle, 7 days absolute; ended on sign-out and account deletion | Tests |
| CSRF on website forms | Every POST must carry Origin `https://promptshare.cc` (and same-origin `Sec-Fetch-Site`); SameSite=Lax | Tests: cross-site and missing Origin refused |
| Open redirect after sign-in | Only same-site paths (`/…`, not `//` or `\`) | Test |
| Header injection in the owner's notification email | Control characters stripped from headers; Reply-To only for a valid address; subject encoded | Test |
| The report form used to email a stranger (receipt to an address the reporter typed) | Receipts only when the owner turned them on; fixed text; at most 3 per address a day | Test |
| Spam through the contact and report forms | Per-network rate limit (10 a minute); length limits; reports stored and read by a person, never acted on automatically | Tests |
| Supply chain | Exact versions, release delay, Dependabot, CodeQL, lockfile | CI |

## Residual risks

- **Prompt injection between users stays possible.** A member of your session, or the author of a
  public prompt you load, can write text that steers your assistant within the permissions you
  gave it. The controls above keep it from publishing or inviting, and make it visible who wrote
  what. They can't stop an assistant that follows the text from, for example, adding an entry to
  that same session. Mitigations for the user:
  - invite only people you trust;
  - don't let an assistant write to sessions automatically after reading others' entries.

  The website and the tool descriptions say so.
- **Moderators read reported content,** including private session entries a member reported.
- **Sharing a prompt shows whether an address has a 2earl account,** within the limits above.
- **Members can copy what they read.** Removing someone from a session doesn't remove what they
  saw.
