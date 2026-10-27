// ============================================================
//  Encryption for provider API keys stored in D1 (ai_provider_keys.cipher).
//  AES-256-GCM with a key derived (HKDF-SHA-256) from KEY_ENCRYPTION_SECRET, or JWT_SECRET when
//  that is not set. Rotating the secret makes stored keys unreadable — they must be re-entered.
//  Format: "v1:" + base64(iv[12] | ciphertext+tag).
// ============================================================
import type { Bindings } from "../env";

const PREFIX = "v1:";
const enc = new TextEncoder();

const b64 = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let cached: { secret: string; key: CryptoKey } | null = null;

async function aesKey(env: Bindings): Promise<CryptoKey> {
  const secret = env.KEY_ENCRYPTION_SECRET || env.JWT_SECRET;
  if (!secret) throw new Error("Thiếu JWT_SECRET — không mã hoá được key");
  if (cached?.secret === secret) return cached.key;
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("ai-provider-keys"), info: enc.encode("v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  cached = { secret, key };
  return key;
}

export async function encryptSecret(env: Bindings, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return PREFIX + b64(out);
}

/** Returns null when the value cannot be decrypted (secret rotated, corrupt row). */
export async function decryptSecret(env: Bindings, cipher: string): Promise<string | null> {
  if (!cipher.startsWith(PREFIX)) return null;
  try {
    const raw = unb64(cipher.slice(PREFIX.length));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await aesKey(env), raw.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Last characters of a key, for display only. */
export const keyHint = (key: string): string => `…${key.slice(-4)}`;
