# Prompt share: legal requirements

**Not legal advice.** This is an engineering checklist: what the law appears to require of a
service that hosts its users' content, and where each item is met. It was written from public
sources by someone who is not a lawyer. No lawyer reviews it (§6 item 4): before public prompts
go live (phase P2), it is reviewed again against its sources.

Facts it relies on:
- the operator is an individual in Germany;
- the service is free;
- it qualifies as a **micro or small enterprise**: fewer than 50 people and under EUR 10 million
  turnover or balance sheet (Commission Recommendation 2003/361/EC).

## 1. What Prompt share is, legally

- **Hosting service** under the Digital Services Act (DSA, Regulation (EU) 2022/2065): it stores
  content at its users' request. This covers prompts (private and public) and session entries.
- **Online platform** as well, as long as public prompts are visible to any signed-in user and
  sign-up is open: that is very likely "dissemination to the public", even behind sign-in. Shared
  sessions, closed groups joined by invitation, are not.

  Whether a sign-in requirement changes the classification is not settled in the sources used
  here; this document assumes the stricter reading.
- **German digital service** under the Digitale-Dienste-Gesetz (DDG). The national authority for
  the DSA is the Bundesnetzagentur.

## 2. DSA duties and where they are met

| Article | Duty | Applies | Met by |
|---|---|---|---|
| 11 | Electronic point of contact for authorities, published, with languages | Yes | Contact page (§6 item 1) |
| 12 | Point of contact for users, not only automated | Yes | Contact page; the report form |
| 13 | Legal representative in the EU | No: established in the EU | |
| 14 | Terms that state content rules, moderation procedures and how decisions can be contested, in plain language | Yes | Terms (§5); enforced diligently and proportionately |
| 15 | Yearly transparency report | **No:** micro and small enterprises are exempt (Art. 15(2)) | Records kept anyway, so it can start if the exemption ends |
| 16 | Notice and action: an easy electronic way for **anyone** to report illegal content | Yes | DESIGN §8: report link and public form |
| 16(2) | The form collects the exact URL, a substantiated explanation, the reporter's name and email (not required for child sexual abuse offences), and a good-faith statement | Yes | Report form fields |
| 16(4)–(6) | Confirm receipt; decide timely, diligently and objectively; tell the reporter the decision and the redress options; say whether automated means were used | Yes | Emails to reporters who give an address; decisions by a person, no automated moderation |
| 17 | A statement of reasons to the affected user for every restriction: what, how long, facts, notice-based or not, automation, legal or contractual ground, redress | Yes | `moderation_decisions` → shown on the content's page and in the account |
| 18 | Report suspected crimes threatening someone's life or safety to the authorities | Yes | §3 |
| 20–28 | Online-platform duties: internal complaint system, out-of-court settlement, trusted flaggers, misuse measures, interface transparency, statements to the Commission's database | **No** for micro and small enterprises (Art. 19), except Art. 24(3): give user numbers on request | A contest link anyway (DESIGN §8), as good practice |

## 3. Threats to life or safety (Art. 18)

If any content gives reason to suspect a criminal offence involving a threat to someone's life
or safety:
1. restrict the content at once;
2. inform the police at once. In Germany, the online reporting portal of the police of the state
   concerned, or `110` if it is urgent;
3. where the country concerned is unclear: the authorities in Germany (where Prompt share is
   established), or Europol.

The moderation view has a "threat to life or safety" decision. It keeps the content as evidence
and shows this procedure.

## 4. Records and retention

These periods are an assumption, chosen to support contesting and authorities' requests [to be
confirmed by a lawyer]:

| Record | Kept |
|---|---|
| Reports | 6 months after the decision |
| Moderation decisions (statement of reasons) | 6 months after the decision; then only counts by type |
| Content removed by moderation | Hidden at once; kept 6 months for contest and authorities, then deleted. Content under §3: until the authorities have it |
| Reporter's name and email | With the report; deleted with it |

When an account is deleted, its reports and decisions stay for these periods with the user's ID
replaced (DESIGN §7.2).

## 5. Texts the website needs before public prompts

| Text | Required by | Content |
|---|---|---|
| **Imprint** (Impressum) | § 5 DDG | Name; postal address for service (a P.O. box is not enough); email; a second fast way to contact (usually a phone number). It must be reachable from every page |
| **Terms** | DSA Art. 14 | Who may use it (minimum age); what may not be posted; what moderation does and how decisions are contested; that public prompts are visible to all signed-in 2earl users; licence users grant for public prompts (copying by others) |
| **Privacy policy** | GDPR Art. 13 | Controller; data (DESIGN §7); purposes and legal basis (performance of the contract, Art. 6(1)(b)); processors (Cloudflare); EU storage; retention; rights; that session content is encrypted; the authority to complain to |
| **Content rules** (part of the terms) | DSA Art. 14 | Plain list: illegal content, others' personal data without consent, credentials, malware, prompts made to attack systems or people |

Drafts are written in phase P2 and reviewed before launch.

## 6. Owner items

| # | Item | State |
|---|---|---|
| 1 | Contact address for DSA Art. 11 and 12 | **Done:** `legal@2earl.com` (Cloudflare Email Routing to the owner's mailbox). It goes on promptshare.cc's contact page in phase P2 |
| 2 | Imprint | **Exists** at `2earl.com/imprint`. Its scope covers "every other 2earl service that links to it", so promptshare.cc links to it from every page |
| 3 | Imprint gap: a second fast contact channel besides email | **Decided** by the owner: a contact form, not a phone number. Built in phase P2 and linked from the 2earl imprint. An electronic form answered quickly is generally accepted as the alternative to a phone number, but this is not settled beyond doubt |
| 4 | Review of this list and the §5 texts | **Decided** by the owner, 2026-11-09: no lawyer is available; Claude reviews them before phase P2 launches. That review checks the texts against the sources and this list; it is not legal advice, and the owner carries the legal risk |
| 5 | Cloudflare data processing agreement | **Open:** confirm it applies to the account (it is part of Cloudflare's self-serve terms) |
| 6 | Records of processing (GDPR Art. 30) | **Open:** a short document for login, the gateway and Prompt share, written with phase P2 |
| 7 | Terms and privacy policy on 2earl.com cover Prompt share | **Open:** a 2earl/website PR in phase P2 |

## 7. Sources

- Regulation (EU) 2022/2065 (Digital Services Act), Arts. 11–28.
- BIPT, "Providers of online intermediary services":
  https://bipt.be/consumers/digital/the-digital-services-act-dsa/providers-of-online-intermediary-services
- IHK Aachen, "Impressumspflicht im Internet" (§ 5 DDG):
  https://www.ihk.de/aachen/recht/rechtsinformationen/aktuelle-dokumente-zum-thema-recht/impressumspflicht-im-internet-607352
- Commission Recommendation 2003/361/EC (micro and small enterprises).
