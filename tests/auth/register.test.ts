import { describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { logger } from "../../src/utils/logger.js";

describe("POST /api/auth/register", () => {
  test("creates the user unverified and sends a verification email", async () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => {});

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new-user@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.emailVerified).toBe(false);
    const verificationCall = spy.mock.calls.find((call) => String(call[0]).includes("new-user@example.com"));
    expect(verificationCall).toBeDefined();
    spy.mockRestore();
  });
});
