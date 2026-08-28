import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { createAuthToken } from "../../src/services/authToken.service.js";
import { verifyPassword } from "../../src/utils/auth.js";
import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("POST /api/auth/change-password", () => {
  test("requires a session", async () => {
    const res = await request(app).post("/api/auth/change-password").send({ currentPassword: "a", newPassword: "b" });

    expect(res.status).toBe(401);
  });

  test("rejects an incorrect current password", async () => {
    const agent = request.agent(app);
    await createTestUser({ email: "change-me@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "change-me@example.com", password: "password123" });

    const res = await agent.post("/api/auth/change-password").send({ currentPassword: "wrong-password", newPassword: "new-password-456" });

    expect(res.status).toBe(401);
  });

  test("updates the password when the current password is correct", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "change-me-2@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "change-me-2@example.com", password: "password123" });

    const res = await agent.post("/api/auth/change-password").send({ currentPassword: "password123", newPassword: "new-password-456" });

    expect(res.status).toBe(204);
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(await verifyPassword("new-password-456", updated!.passwordHash)).toBe(true);
  });

  test("invalidates an outstanding reset-password token once the password is changed this way", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "change-me-3@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "change-me-3@example.com", password: "password123" });
    const staleResetToken = await createAuthToken(user.id, "reset_password");

    const changeRes = await agent.post("/api/auth/change-password").send({ currentPassword: "password123", newPassword: "new-password-456" });
    expect(changeRes.status).toBe(204);

    const resetRes = await request(app).post("/api/auth/reset-password").send({ token: staleResetToken, newPassword: "hijacked-789" });

    expect(resetRes.status).toBe(400);
  });
});
