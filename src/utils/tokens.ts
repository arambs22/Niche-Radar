import { randomBytes, createHash } from "node:crypto";

/**
 * Generates a random URL-safe token plus its SHA-256 hash. Only the hash is
 * ever persisted — the raw token exists only in the emailed link and briefly
 * in memory.
 */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

/**
 * Hashes a token for lookup/storage. SHA-256 is sufficient here — unlike
 * passwords, these are already high-entropy random values, not human-guessable.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
