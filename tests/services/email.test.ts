import { describe, expect, test, vi } from "vitest";
import { logger } from "../../src/utils/logger.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../../src/services/email.service.js";

describe("email.service", () => {
  test("logs instead of sending when SENDGRID_API_KEY/SENDGRID_FROM_EMAIL are unset", async () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => {});

    await sendVerificationEmail("someone@example.com", "abc123");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toContain("someone@example.com");
    spy.mockRestore();
  });

  test("builds the reset link with the token as a query param", async () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => {});

    await sendPasswordResetEmail("someone@example.com", "xyz789");

    const loggedMeta = spy.mock.calls[0]![1] as { html: string };
    expect(loggedMeta.html).toContain("token=xyz789");
    spy.mockRestore();
  });
});
