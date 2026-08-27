import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { authTokens } from "../db/schema.js";
import { generateToken, hashToken } from "../utils/tokens.js";

export type TokenPurpose = "verify_email" | "reset_password";

const TTL_MS: Record<TokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 45 * 60 * 1000,
};

/**
 * Creates a single-use token for the given user/purpose and returns the raw
 * value to email — only its hash is persisted.
 */
export async function createAuthToken(userId: number, purpose: TokenPurpose): Promise<string> {
  const { token, tokenHash } = generateToken();
  await db.insert(authTokens).values({
    userId,
    tokenHash,
    purpose,
    expiresAt: new Date(Date.now() + TTL_MS[purpose]),
  });
  return token;
}

/**
 * Validates and consumes a single-use token: it must exist, match the
 * expected purpose, be unexpired, and unused. Returns the owning userId on
 * success, or null on any failure — callers respond identically either way,
 * so as not to leak which case failed.
 */
export async function consumeAuthToken(rawToken: string, purpose: TokenPurpose): Promise<number | null> {
  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)))
    .limit(1);

  if (!row || row.expiresAt < new Date()) {
    return null;
  }

  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  return row.userId;
}
