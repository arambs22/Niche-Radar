import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { users, keywords } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("DELETE /api/auth/me", () => {
  test("requires a session", async () => {
    const res = await request(app).delete("/api/auth/me").send({ password: "whatever" });

    expect(res.status).toBe(401);
  });

  test("rejects an incorrect password and does not delete the account", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "keep-me@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "keep-me@example.com", password: "password123" });

    const res = await agent.delete("/api/auth/me").send({ password: "wrong-password" });

    expect(res.status).toBe(401);
    const [stillThere] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(stillThere).toBeDefined();
  });

  test("deletes the account and cascades to its keywords", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "delete-me@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "delete-me@example.com", password: "password123" });
    const [keyword] = await db.insert(keywords).values({ userId: user.id, term: "test-term" }).returning();

    const res = await agent.delete("/api/auth/me").send({ password: "password123" });

    expect(res.status).toBe(204);
    const [deletedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(deletedUser).toBeUndefined();
    const [deletedKeyword] = await db.select().from(keywords).where(eq(keywords.id, keyword!.id)).limit(1);
    expect(deletedKeyword).toBeUndefined();
  });
});
