import { config } from "dotenv";
config({ path: ".env.test" });

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false, // sequential — every test file shares one real Postgres database
    testTimeout: 10000,
    // Excludes nested git worktrees (e.g. .claude/worktrees/*) from test
    // discovery — without this, Vitest's default recursive glob picks up
    // any worktree's own tests/ directory and runs every test twice.
    // client/ is excluded too — it has its own vitest.config.ts (no
    // Postgres globalSetup) so its tests run via `npm test --prefix client`.
    exclude: ["**/node_modules/**", "**/.claude/**", "**/client/**"],
  },
});
