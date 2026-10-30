import { createHash } from "node:crypto";

/**
 * Share-link tokens (spec 8.2, 9.1): 32 random bytes as 43 base64url characters. Only the SHA-256
 * hash names the `shares` doc, so a database read leak does not expose working links.
 */

export const SHARE_TOKEN_BYTES = 32;

export function newShareToken(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const shareUrl = (origin: string, token: string) => `${origin}/s/${token}`;
