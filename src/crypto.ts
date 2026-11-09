/**
 * Encryption of shared-session entries (docs/DESIGN.md §7.1): AES-256-GCM with a key derived per
 * session (HKDF-SHA-256) from STATE_ENCRYPTION_KEY, and the session and entry IDs as associated
 * data, so a ciphertext moved to another row or session doesn't decrypt.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SALT = encoder.encode('2earl/promptshare/session-entry/v1');

async function sessionKey(secret: string, sessionId: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('STATE_ENCRYPTION_KEY must be at least 32 characters');
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

const bytes = (value: ArrayBuffer | ArrayLike<number>): Uint8Array<ArrayBuffer> =>
  value instanceof ArrayBuffer ? new Uint8Array(value) : Uint8Array.from(value);

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
  // D1 returns BLOB columns as arrays of byte values.
  iv: ArrayBuffer | ArrayLike<number>,
  ciphertext: ArrayBuffer | ArrayLike<number>,
): Promise<string> {
  const key = await sessionKey(secret, sessionId);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes(iv), additionalData: aad(sessionId, entryId) },
    key,
    bytes(ciphertext),
  );
  return decoder.decode(plaintext);
}
