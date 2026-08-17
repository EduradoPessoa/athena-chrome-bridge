// ====================================================================
// Athena Chrome Bridge — vault.js (WebCrypto; testável em Node 22+)
// Cofre de credenciais: PBKDF2-SHA256 (150k iterações) + AES-GCM 256.
// A chave NUNCA é persistida — fica só em memória enquanto desbloqueado.
// ====================================================================
export const ITERATIONS = 150000;
const VERIFIER_TEXT = 'athena-vault-ok';
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64(u8) { return btoa(String.fromCharCode(...u8)); }
export function b64ToBytes(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key, plain, iv) {
  return b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)));
}
async function open(key, blob) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(blob.iv) }, key, b64ToBytes(blob.data)));
}

export async function createVault(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const verifier = { iv: b64(iv), data: await seal(key, enc.encode(VERIFIER_TEXT), iv) };
  return { salt: b64(salt), iterations: ITERATIONS, verifier };
}

export async function unlock(password, meta) {
  try {
    const key = await deriveKey(password, b64ToBytes(meta.salt), meta.iterations || ITERATIONS);
    const plain = await open(key, meta.verifier);
    return dec.decode(plain) === VERIFIER_TEXT ? key : null;
  } catch (e) {
    return null;
  }
}

export async function encryptSecret(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), data: await seal(key, enc.encode(plaintext), iv) };
}

export async function decryptSecret(key, blob) {
  return dec.decode(await open(key, blob));
}
