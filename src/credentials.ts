/**
 * Text that looks like a credential (docs/THREAT_MODEL.md: cross-user prompt injection). Saving
 * such text into a session other people can read is refused: it is the likeliest thing an
 * injected instruction would try to make an assistant write there. Patterns are specific on
 * purpose, so ordinary text isn't refused.
 */

const PATTERNS: readonly [name: string, pattern: RegExp][] = [
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe secret key', /\b[rs]k_live_[0-9A-Za-z]{20,}\b/],
  ['Cloudflare API token', /\bcf(?:at|ut)_[A-Za-z0-9]{40,}\b/],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['password assignment', /\b(?:password|passwd|pwd|secret|api[_-]?key)\s*[:=]\s*\S{8,}/i],
];

/** The kind of credential found, or null. */
export function credentialIn(text: string): string | null {
  for (const [name, pattern] of PATTERNS) if (pattern.test(text)) return name;
  return null;
}
