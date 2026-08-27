import { describe, expect, test } from "vitest";
import { createAuthToken, consumeAuthToken } from "../../src/services/authToken.service.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { authTokens } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("authToken.service", () => {
  test("consumes a freshly created token and returns the owning userId", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "verify_email");

    const result = await consumeAuthToken(token, "verify_email");

    expect(result).toBe(user.id);
  });

  test("rejects a token used a second time", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "reset_password");
    await consumeAuthToken(token, "reset_password");

    const secondAttempt = await consumeAuthToken(token, "reset_password");

    expect(secondAttempt).toBeNull();
  });

  test("rejects a token used for the wrong purpose", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "verify_email");

    const result = await consumeAuthToken(token, "reset_password");

    expect(result).toBeNull();
  });

  test("rejects an expired token", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "reset_password");
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTokens.userId, user.id));

    const result = await consumeAuthToken(token, "reset_password");

    expect(result).toBeNull();
  });

  test("rejects a token that never existed", async () => {
    const result = await consumeAuthToken("not-a-real-token", "verify_email");

    expect(result).toBeNull();
  });

  test("never stores the raw token, only its hash", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "verify_email");

    const [row] = await db.select().from(authTokens).where(eq(authTokens.userId, user.id)).limit(1);

    expect(row!.tokenHash).not.toBe(token);
  });
});
