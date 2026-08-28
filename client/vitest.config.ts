import { defineConfig } from "vitest/config";

/** Scoped to pure logic in client/src (no DOM/React rendering yet — no jsdom or Testing Library installed). */
export default defineConfig({
  test: {
    environment: "node",
  },
});
