import { describe, expect, test } from "vitest";
import { ApiError, isUnauthorized, getErrorMessage } from "./api";

describe("isUnauthorized", () => {
  test("true for a 401 ApiError", () => {
    expect(isUnauthorized(new ApiError(401, { error: "No autenticado" }))).toBe(true);
  });

  test("false for a 429 ApiError (rate limited) — must not be treated as logged out", () => {
    expect(isUnauthorized(new ApiError(429, { error: "Demasiadas solicitudes, intenta de nuevo más tarde" }))).toBe(
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

describe("getErrorMessage", () => {
  test("uses the backend's own message for an ApiError with a string error", () => {
    expect(getErrorMessage(new ApiError(400, { error: "Email inválido" }), "fallback")).toBe("Email inválido");
  });

  test("flattens a Zod fieldErrors object for an ApiError", () => {
    const err = new ApiError(400, { error: { password: ["La contraseña debe tener al menos 8 caracteres"] } });
    expect(getErrorMessage(err, "fallback")).toBe("La contraseña debe tener al menos 8 caracteres");
  });

  test("uses the fallback for a non-ApiError value (e.g. a network failure)", () => {
    expect(getErrorMessage(new Error("network failure"), "Algo salió mal")).toBe("Algo salió mal");
  });
});
