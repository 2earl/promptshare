/**
 * Encryption of shared-session entries (docs/DESIGN.md §7.1): AES-256-GCM with a key derived per
 * session (HKDF-SHA-256) from STATE_ENCRYPTION_KEY, and the session and entry IDs as associated
 * data, so a ciphertext moved to another row or session doesn't decrypt.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SALT = encoder.encode('2earl/promptshare/session-entry/v1');

/**
 * Derived keys, per isolate: loading or searching a session decrypts many entries with one key.
 * Bounded, oldest out first. Non-extractable keys; the secret they come from is in memory anyway.
 */
const keys = new Map<string, Promise<CryptoKey>>();
const MAX_KEYS = 100;

function sessionKey(secret: string, sessionId: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('STATE_ENCRYPTION_KEY must be at least 32 characters');
  const cacheKey = `${String(secret.length)}:${secret}\u0000${sessionId}`;
  let key = keys.get(cacheKey);
  if (!key) {
    key = deriveSessionKey(secret, sessionId);
    // A failed derivation isn't kept.
    key.catch(() => keys.delete(cacheKey));
    keys.set(cacheKey, key);
    if (keys.size > MAX_KEYS) keys.delete(keys.keys().next().value ?? '');
  }
  return key;
}

async function deriveSessionKey(secret: string, sessionId: string): Promise<CryptoKey> {
  const master = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: encoder.encode(sessionId) },
    master,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Bytes from D1. Selecting `hex(column)` and decoding it with the built-in `Uint8Array.fromHex`
 * costs a quarter of the CPU of D1's default (an array of numbers per BLOB), which matters on the
 * free plan's 10 ms (measured locally: 5 MB in 110 ms instead of 390 ms).
 */
const fromHex = (Uint8Array as unknown as { fromHex: (hex: string) => Uint8Array<ArrayBuffer> })
  .fromHex;

const bytes = (value: string | ArrayBuffer | ArrayLike<number>): Uint8Array<ArrayBuffer> =>
  typeof value === 'string'
    ? fromHex(value)
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : Uint8Array.from(value);

const aad = (sessionId: string, entryId: string) => encoder.encode(`${sessionId}/${entryId}`);

export async function encryptEntry(
  secret: string,
  sessionId: string,
  entryId: string,
  text: string,
): Promise<{ iv: Uint8Array<ArrayBuffer>; ciphertext: Uint8Array<ArrayBuffer> }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sessionKey(secret, sessionId);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(sessionId, entryId) },
    key,
    encoder.encode(text),
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function decryptEntry(
  secret: string,
  sessionId: string,
  entryId: string,
  // D1 returns BLOB columns as arrays of byte values, or `hex(column)` as text.
  iv: string | ArrayBuffer | ArrayLike<number>,
  ciphertext: string | ArrayBuffer | ArrayLike<number>,
): Promise<string> {
  const key = await sessionKey(secret, sessionId);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes(iv), additionalData: aad(sessionId, entryId) },
    key,
    bytes(ciphertext),
  );
  return decoder.decode(plaintext);
}
