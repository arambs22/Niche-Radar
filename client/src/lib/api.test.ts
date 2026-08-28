import { describe, expect, test } from "vitest";
import { ApiError, isUnauthorized } from "./api";

describe("isUnauthorized", () => {
  test("true for a 401 ApiError", () => {
    expect(isUnauthorized(new ApiError(401, { error: "No autenticado" }))).toBe(true);
  });

  test("false for a 429 ApiError (rate limited) — must not be treated as logged out", () => {
    expect(isUnauthorized(new ApiError(429, { error: "Demasiadas solicitudes, intentá de nuevo más tarde" }))).toBe(
      false
    );
  });

  test("false for a 500 ApiError", () => {
    expect(isUnauthorized(new ApiError(500, { error: "Internal server error" }))).toBe(false);
  });

  test("false for a non-ApiError value", () => {
    expect(isUnauthorized(new Error("network failure"))).toBe(false);
  });
});
