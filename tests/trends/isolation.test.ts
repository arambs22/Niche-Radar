import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { keywords, trendSnapshots, relatedQueries } from "../../src/db/schema.js";

describe("GET /api/trends and /api/related — cross-user isolation", () => {
  test("never returns another user's snapshots or related queries, even for the same geo", async () => {
    const owner = await createTestUser({ email: "isolation-owner@example.com", password: "password123" });
    const [ownerKeyword] = await db.insert(keywords).values({ userId: owner.id, term: "owner keyword" }).returning();

    const other = await createTestUser({ email: "isolation-other@example.com", password: "password123" });
    const [otherKeyword] = await db.insert(keywords).values({ userId: other.id, term: "other keyword" }).returning();

    await db.insert(trendSnapshots).values([
      { keywordId: ownerKeyword!.id, geo: "US", date: "2026-08-01", value: 50 },
      { keywordId: otherKeyword!.id, geo: "US", date: "2026-08-01", value: 99 },
    ]);
    await db.insert(relatedQueries).values([
      { keywordId: ownerKeyword!.id, geo: "US", query: "owner rising query", growthValue: "+100%" },
      { keywordId: otherKeyword!.id, geo: "US", query: "other rising query", growthValue: "+200%" },
    ]);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "isolation-owner@example.com", password: "password123" });

    const trendsRes = await agent.get("/api/trends?geo=US");
    expect(trendsRes.status).toBe(200);
    expect(trendsRes.body.map((r: { id: number }) => r.id)).toEqual([ownerKeyword!.id]);
    expect(trendsRes.body[0].timeline).toEqual([{ date: "2026-08-01", value: 50 }]);

    const relatedRes = await agent.get("/api/related?geo=US");
    expect(relatedRes.status).toBe(200);
    expect(relatedRes.body.map((r: { id: number }) => r.id)).toEqual([ownerKeyword!.id]);
    expect(relatedRes.body[0].rising.map((r: { query: string }) => r.query)).toEqual(["owner rising query"]);
  });

  test("requires a session", async () => {
    const trendsRes = await request(app).get("/api/trends?geo=US");
    expect(trendsRes.status).toBe(401);

    const relatedRes = await request(app).get("/api/related?geo=US");
    expect(relatedRes.status).toBe(401);
  });

  test("returns an empty list, not an error, for a user with no keywords", async () => {
    await createTestUser({ email: "isolation-empty@example.com", password: "password123" });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "isolation-empty@example.com", password: "password123" });

    const trendsRes = await agent.get("/api/trends?geo=US");
    expect(trendsRes.status).toBe(200);
    expect(trendsRes.body).toEqual([]);

    const relatedRes = await agent.get("/api/related?geo=US");
    expect(relatedRes.status).toBe(200);
    expect(relatedRes.body).toEqual([]);
  });
});
