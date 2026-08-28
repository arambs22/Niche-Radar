import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { keywords, relatedQueries } from "../../src/db/schema.js";

describe("GET /api/related", () => {
  test("only returns related queries from the most recent collection, not every past run", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "related-accum@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "related-accum@example.com", password: "password123" });
    const [keyword] = await db.insert(keywords).values({ userId: user.id, term: "clip art" }).returning();

    // Simulate two separate collection runs on different days for the same keyword+geo.
    await db.insert(relatedQueries).values({
      keywordId: keyword!.id,
      geo: "US",
      query: "old rising query",
      growthValue: "+250%",
      collectedAt: new Date("2026-08-20T10:00:00Z"),
    });
    await db.insert(relatedQueries).values({
      keywordId: keyword!.id,
      geo: "US",
      query: "new rising query",
      growthValue: "+500%",
      collectedAt: new Date("2026-08-27T10:00:00Z"),
    });

    const res = await agent.get("/api/related?geo=US");

    expect(res.status).toBe(200);
    const kwResult = res.body.find((r: { id: number }) => r.id === keyword!.id);
    const queries = kwResult.rising.map((r: { query: string }) => r.query);
    expect(queries).toContain("new rising query");
    expect(queries).not.toContain("old rising query");
  });
});
