import { describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { createAuthToken } from "../../src/services/authToken.service.js";
import { logger } from "../../src/utils/logger.js";
import { verifyPassword } from "../../src/utils/auth.js";
import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";
import * as emailService from "../../src/services/email.service.js";

describe("POST /api/auth/request-password-reset", () => {
  test("returns the same response whether or not the email is registered", async () => {
    await createTestUser({ email: "exists@example.com" });

    const existing = await request(app).post("/api/auth/request-password-reset").send({ email: "exists@example.com" });
    const missing = await request(app).post("/api/auth/request-password-reset").send({ email: "nobody@example.com" });

    expect(existing.status).toBe(missing.status);
    expect(existing.body).toEqual(missing.body);
  });

  test("emails a reset link when the account exists", async () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => {});
    await createTestUser({ email: "reset-me@example.com" });

    await request(app).post("/api/auth/request-password-reset").send({ email: "reset-me@example.com" });

    const resetCall = spy.mock.calls.find((call) => String(call[0]).includes("reset-me@example.com"));
    expect(resetCall).toBeDefined();
    spy.mockRestore();
  });

  test("still returns the generic response for an existing account even if sending the email throws", async () => {
    const spy = vi.spyOn(emailService, "sendPasswordResetEmail").mockRejectedValue(new Error("SMTP is down"));
    await createTestUser({ email: "flaky-email@example.com" });

    const existing = await request(app).post("/api/auth/request-password-reset").send({ email: "flaky-email@example.com" });
    const missing = await request(app).post("/api/auth/request-password-reset").send({ email: "nobody-else@example.com" });

    expect(existing.status).toBe(missing.status);
    expect(existing.body).toEqual(missing.body);
    spy.mockRestore();
  });
});

describe("POST /api/auth/reset-password", () => {
  test("updates the password, verifies the email, and logs the user in", async () => {
    const user = await createTestUser({ emailVerified: false });
    const token = await createAuthToken(user.id, "reset_password");

    const res = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "new-password-456" });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();

    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(updated!.emailVerified).toBe(true);
    expect(await verifyPassword("new-password-456", updated!.passwordHash)).toBe(true);
  });

  test("rejects a token that was already used", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "reset_password");
    await request(app).post("/api/auth/reset-password").send({ token, newPassword: "first-password-1" });

    const res = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "second-password-2" });

    expect(res.status).toBe(400);
  });

  test("rejects an unknown token", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({ token: "not-real", newPassword: "whatever-123" });

    expect(res.status).toBe(400);
  });
});
