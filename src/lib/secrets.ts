import "server-only";

import crypto from "crypto";

const WA_TOKEN_PREFIX = "enc:v1:";

function encryptionKey(): Buffer {
  const raw = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY is required to store WhatsApp tokens");
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32) {
    return base64;
  }

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === 32) {
    return utf8;
  }

  throw new Error(
    "WHATSAPP_TOKEN_ENCRYPTION_KEY must be 32 bytes as base64, hex, or raw UTF-8"
  );
}

export function isEncryptedWaToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(WA_TOKEN_PREFIX);
}

export function encryptWaToken(token: string): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${WA_TOKEN_PREFIX}${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

export function decryptWaToken(value: string | null | undefined): string {
  if (!value) return "";

  // Legacy rows may still contain plaintext. They remain readable until the
  // tenant re-saves Settings, at which point the token is encrypted.
  if (!isEncryptedWaToken(value)) {
    return value;
  }

  const payload = Buffer.from(value.slice(WA_TOKEN_PREFIX.length), "base64");
  if (payload.length <= 28) {
    throw new Error("Stored WhatsApp token ciphertext is malformed");
  }

  const key = encryptionKey();
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function waTokenHint(value: string | null | undefined) {
  const token = decryptWaToken(value);
  return token ? { length: token.length, last4: token.slice(-4) } : null;
}
