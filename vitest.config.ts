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
  },
});
