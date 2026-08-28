import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { createAuthToken } from "../../src/services/authToken.service.js";
import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("POST /api/auth/verify-email", () => {
  test("marks the account verified", async () => {
    const user = await createTestUser({ emailVerified: false });
    const token = await createAuthToken(user.id, "verify_email");

    const res = await request(app).post("/api/auth/verify-email").send({ token });

    expect(res.status).toBe(200);
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(updated!.emailVerified).toBe(true);
  });

  test("rejects a reset_password token (wrong purpose)", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "reset_password");

    const res = await request(app).post("/api/auth/verify-email").send({ token });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/resend-verification", () => {
  test("requires a session", async () => {
    const res = await request(app).post("/api/auth/resend-verification").send({});

    expect(res.status).toBe(401);
  });

  test("sends a fresh verification email for the logged-in user", async () => {
    const agent = request.agent(app);
    await createTestUser({ email: "resend-me@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "resend-me@example.com", password: "password123" });

    const res = await agent.post("/api/auth/resend-verification").send({});

    expect(res.status).toBe(200);
  });
});
