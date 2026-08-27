import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "./helpers/testApp.js";

describe("test harness", () => {
  test("the app boots and reaches the real test database", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("connected");
  });
});
