# Account Management — Password Reset, Change Password, Delete Account, Email Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user recover a forgotten password, change their password while logged in, delete their account, and verify their email — plus stand up Vitest + Supertest so this (the most security-sensitive code added since initial auth) is the first part of the project with an automated test suite.

**Architecture:** A new `authTokens` table stores single-use, hashed, purpose-tagged tokens (`verify_email` | `reset_password`) shared by both flows. A new `src/services/authToken.service.ts` creates and consumes them; a new `src/services/email.service.ts` wraps Resend (falling back to logging the link when `RESEND_API_KEY` is unset, so dev/self-hosted/test never need a real account). Six new/changed endpoints live in the existing `src/routes/auth.route.ts`. `change-password` and `DELETE /me` need no token — the session cookie plus re-entering the current password is the confirmation. Frontend gets two new public pages (`/forgot-password`, `/reset-password`), one new protected page (`/verify-email`), a non-blocking verification banner, and an `AccountModal` for changing password / deleting the account.

**Tech Stack:** Express, Drizzle ORM, PostgreSQL, Zod, `resend` (new), `vitest` + `supertest` (new), React 19 + Vite + TypeScript, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-27-account-management-design.md`

## Global Constraints

- Comments in English, JSDoc-style, only where the *why* isn't obvious — matches every existing file in `src/` and `client/src/`.
- Every shell command below is written for whoever executes this plan to run and report the output back — per this project's workflow, commands like migrations, `npm test`, and especially `git commit` are run by a human, never assumed to run unsupervised.
- Password reset token TTL: 45 minutes. Email verification token TTL: 24 hours. Both from the spec, both must match exactly — later tasks' tests assert on these.
- `request-password-reset` and `resend-verification` always return the same generic response regardless of whether the account exists / is already verified — never leak account existence, matching the existing login error-message pattern in `src/routes/auth.route.ts`.
- A completed password reset also sets `emailVerified = true` — the two are equally strong proof of owning the inbox (see spec §2).
- The emailed link always points to a frontend page (`GET`, no side effect); the token is only consumed by an explicit user-triggered `POST` — never on page load via the link's own GET (see spec §2, the mail-scanner pre-fetch problem).
- Tests run against a real Postgres database (`nicheradar_test`), not mocks — the highest-value thing to verify here (ownership filters, cascades) is exactly what a mock can't check.
- `RESEND_API_KEY` is optional everywhere (dev, self-hosted, tests) — its absence must never throw, only log.

---

### Task 1: Schema, env config, and migration

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `src/routes/auth.route.ts` (existing `/register`, `/login`, `/me` GET/PATCH — add `emailVerified` to every response so the field is never `undefined` on the frontend)
- Create: a new file under `drizzle/` (name auto-assigned by `drizzle-kit generate`)

**Interfaces:**
- Produces: `users.emailVerified: boolean` (schema column), `authTokens` table (`id`, `userId`, `tokenHash`, `purpose`, `expiresAt`, `usedAt`, `createdAt`), `env.RESEND_API_KEY: string | undefined`, `env.EMAIL_FROM: string`, `env.APP_URL: string`. All later tasks import these.

- [ ] **Step 1: Add the schema changes**

In `src/db/schema.ts`, add `emailVerified` to the `users` table:

```ts
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  historyRetentionDays: integer("history_retention_days").notNull().default(15),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Add the new `authTokens` table anywhere after `users` (e.g. right before `keywords`):

```ts
/** Single-use, hashed tokens emailed for email verification and password reset. Only the hash is ever stored — same principle as passwordHash. */
export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  purpose: text("purpose").notNull(), // "verify_email" | "reset_password"
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Add the new env vars**

In `src/config/env.ts`, add three fields to `envSchema` (near `ETSY_API_KEY`, since `RESEND_API_KEY` follows the same optional-integration pattern):

```ts
  // Email (Resend) is optional: without a key, verification/reset links are
  // logged instead of sent — dev, self-hosted instances, and tests all work
  // with zero external dependency.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("NicheRadar <onboarding@resend.dev>"),
  APP_URL: z.string().url().default("http://localhost:5173"),
```

- [ ] **Step 3: Document the new env vars in `.env.example`**

Append to `.env.example`:

```
# ---------------------------------------------------------------------------
# Email (Resend) — OPTIONAL. Without RESEND_API_KEY, verification/reset
# links are logged to the console instead of emailed — useful for local dev.
# EMAIL_FROM must be an address on a domain you've verified in Resend once
# you have one; the default is Resend's shared sandbox sender.
# ---------------------------------------------------------------------------
RESEND_API_KEY=
EMAIL_FROM=NicheRadar <onboarding@resend.dev>
APP_URL=http://localhost:5173
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`

Expected: a new file appears under `drizzle/`, e.g. `drizzle/0003_<random-name>.sql`, containing an `ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL` statement and a `CREATE TABLE "auth_tokens" (...)` statement.

- [ ] **Step 5: Add the one-time backfill to the generated migration**

Open the new file from Step 4 and append this line at the very end (after the generated statements, so it runs last within the same migration):

```sql
UPDATE "users" SET "email_verified" = true;
```

This marks every user that existed *before* this migration as verified — anyone registering afterwards goes through `POST /register` normally and correctly starts at `false`.

- [ ] **Step 6: Run the migration**

Run: `npm run db:migrate`
Expected: "Migrations completed successfully." with no errors.

- [ ] **Step 7: Thread `emailVerified` through the existing auth responses**

In `src/routes/auth.route.ts`:

In `POST /register`, change the `.returning(...)` call and the final response. While touching these lines: `historyRetentionDays` was never included here either (only `GET /me` returned it) — a pre-existing gap, not something this plan introduced, but worth closing now since these exact lines are already being edited:

```ts
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email, historyRetentionDays: users.historyRetentionDays, emailVerified: users.emailVerified });
```

```ts
    res.status(201).json({ id: user!.id, email: user!.email, historyRetentionDays: user!.historyRetentionDays, emailVerified: user!.emailVerified });
```

In `POST /login`, change the final response (the `.select()` already returns the whole row, so both fields are already available — same pre-existing gap, same fix):

```ts
    res.json({ id: user.id, email: user.email, historyRetentionDays: user.historyRetentionDays, emailVerified: user.emailVerified });
```

In `GET /me`, add the field to the projection:

```ts
    const [user] = await db
      .select({ id: users.id, email: users.email, historyRetentionDays: users.historyRetentionDays, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);
```

In `PATCH /me`, add the field to the `.returning(...)` projection:

```ts
      .returning({ id: users.id, email: users.email, historyRetentionDays: users.historyRetentionDays, emailVerified: users.emailVerified });
```

- [ ] **Step 8: Typecheck and manually verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run dev`, then in another terminal:
```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"schema-check@example.com","password":"password123"}'
```
Expected: JSON response includes `"emailVerified":false`.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts src/config/env.ts .env.example src/routes/auth.route.ts drizzle/
git commit -m "add emailVerified + authTokens, thread emailVerified through existing auth responses"
```

---

### Task 2: Vitest + Supertest test harness

**Files:**
- Modify: `package.json` (root)
- Modify: `docker-compose.yml`
- Modify: `.gitignore`
- Modify: `src/middleware/rateLimit.middleware.ts`
- Create: `docker/init-test-db.sql`
- Create: `.env.test.example`
- Create: `vitest.config.ts`
- Create: `tsconfig.test.json`
- Create: `tests/globalSetup.ts`
- Create: `tests/setup.ts`
- Create: `tests/helpers/testApp.ts`
- Create: `tests/helpers/factories.ts`
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: `createApp()` from `src/app.ts` (existing), `hashPassword` from `src/utils/auth.ts` (existing), `users` from `src/db/schema.ts` (existing).
- Produces: `app` (Express instance) from `tests/helpers/testApp.ts`, `createTestUser(overrides?)` from `tests/helpers/factories.ts` — every later test-writing task imports both. `npm test` runs the suite.

- [ ] **Step 1: Add a second database to Docker Compose**

Create `docker/init-test-db.sql`:

```sql
CREATE DATABASE nicheradar_test;
```

In `docker-compose.yml`, mount it as a Postgres init script (runs automatically on a fresh volume):

```yaml
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql:ro
```

This only runs on a brand-new volume. If your local `postgres-data` volume already exists from before this change, create the database by hand instead:
```bash
docker compose exec postgres psql -U nicheradar -c "CREATE DATABASE nicheradar_test;"
```

- [ ] **Step 2: Add the test env file template**

Create `.env.test.example`:

```
NODE_ENV=test
PORT=3000
DATABASE_URL=postgresql://nicheradar:nicheradar@localhost:5432/nicheradar_test
JWT_SECRET=test-secret-32-characters-minimum-ok
JWT_EXPIRES_IN_SECONDS=604800
CRON_SECRET=cron-test-secret-32-characters-min-ok
APP_URL=http://localhost:5173
```

Copy it: `cp .env.test.example .env.test` (kept out of git — it's a template of fake local secrets, not real ones).

In `.gitignore`, add `.env.test` right below the existing `.env.*.local` line:
```
.env.test
```

- [ ] **Step 3: Skip rate limiting under `NODE_ENV=test`**

The auth-rate-limited endpoints being tested (register, login, reset, resend-verification) would otherwise trip the real 10-requests/15-minute limiter within a single test file, since every Supertest request shares the same loopback IP. In `src/middleware/rateLimit.middleware.ts`, add a `skip` to both limiters:

```ts
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const WINDOW_MS = 15 * 60 * 1000;

/** Applied to all /api routes: a generous ceiling so normal dashboard usage never trips it. */
export const apiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { error: "Demasiadas solicitudes, intentá de nuevo más tarde" },
});

/** Applied only to login/register: tight enough to blunt brute-force and credential-stuffing attempts. */
export const authRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { error: "Demasiados intentos, intentá de nuevo más tarde" },
});
```

- [ ] **Step 4: Install Vitest and Supertest**

Run: `npm install --save-dev vitest@^3.0.0 supertest@^7.0.0 @types/supertest@^6.0.0`

- [ ] **Step 5: Add the Vitest config**

Create `vitest.config.ts` at the repo root:

```ts
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
```

- [ ] **Step 6: Add global setup (runs migrations against the test DB once, before any test file)**

Create `tests/globalSetup.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env.test" });

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export default async function globalSetup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
}
```

- [ ] **Step 7: Add per-test setup (truncates every table before each test)**

Create `tests/setup.ts`:

```ts
import { beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE auth_tokens, keyword_collection_status, related_queries, trend_snapshots, keywords, user_regions, users RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  await pool.end();
});
```

- [ ] **Step 8: Add the shared test app and user factory**

Create `tests/helpers/testApp.ts`:

```ts
import { createApp } from "../../src/app.js";

export const app = createApp();
```

Create `tests/helpers/factories.ts`:

```ts
import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";
import { hashPassword } from "../../src/utils/auth.js";

interface TestUserOverrides {
  email?: string;
  password?: string;
  emailVerified?: boolean;
}

/** Inserts a user directly (bypassing the API) for tests that need one already logged in or already verified. Returns the plain-text password alongside the row, since only the hash is stored. */
export async function createTestUser(overrides: TestUserOverrides = {}) {
  const email = overrides.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = overrides.password ?? "password123";
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, emailVerified: overrides.emailVerified ?? false })
    .returning();
  return { ...user!, password };
}
```

- [ ] **Step 9: Write the smoke test**

Create `tests/smoke.test.ts`:

```ts
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
```

- [ ] **Step 10: Add the npm scripts and run the suite**

In `package.json`, add to `"scripts"`:
```json
    "test": "vitest run",
    "typecheck:test": "tsc --noEmit -p tsconfig.test.json",
```

Run: `npm test`
Expected: 1 passed (`tests/smoke.test.ts`).

- [ ] **Step 11: Add a separate tsconfig so `tests/` gets typechecked too**

The root `tsconfig.json` has `"include": ["src/**/*.ts"]` and `"rootDir": "src"` — deliberately, so `npm run build`'s `tsc` step only ever emits `dist/` from `src/`. Adding `tests/` to that same config would change `rootDir` and risk shifting the build output paths `npm start` depends on (`dist/server.js`). Instead, create a second, typecheck-only config — the same pattern the client already uses (`client/tsconfig.app.json`, driven by its own `typecheck` script).

Create `tsconfig.test.json` at the repo root:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Run: `npm run typecheck:test`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json docker-compose.yml .gitignore .env.test.example src/middleware/rateLimit.middleware.ts docker/ vitest.config.ts tsconfig.test.json tests/
git commit -m "add Vitest + Supertest test harness against a real test database"
```

---

### Task 3: Token generation and consumption

**Files:**
- Create: `src/utils/tokens.ts`
- Create: `src/services/authToken.service.ts`
- Test: `tests/services/authToken.test.ts`

**Interfaces:**
- Consumes: `authTokens` table from Task 1, `db` from `src/db/client.ts`, `app`/`createTestUser` from Task 2.
- Produces: `generateToken(): { token: string; tokenHash: string }` and `hashToken(token: string): string` from `src/utils/tokens.ts`. `type TokenPurpose = "verify_email" | "reset_password"`, `createAuthToken(userId: number, purpose: TokenPurpose): Promise<string>`, `consumeAuthToken(rawToken: string, purpose: TokenPurpose): Promise<number | null>` from `src/services/authToken.service.ts`. Tasks 5-9 all import from here.

- [ ] **Step 1: Write the failing tests**

Create `tests/services/authToken.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createAuthToken, consumeAuthToken } from "../../src/services/authToken.service.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { authTokens } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("authToken.service", () => {
  test("consumes a freshly created token and returns the owning userId", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "verify_email");

    const result = await consumeAuthToken(token, "verify_email");

    expect(result).toBe(user.id);
  });

  test("rejects a token used a second time", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "reset_password");
    await consumeAuthToken(token, "reset_password");

    const secondAttempt = await consumeAuthToken(token, "reset_password");

    expect(secondAttempt).toBeNull();
  });

  test("rejects a token used for the wrong purpose", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "verify_email");

    const result = await consumeAuthToken(token, "reset_password");

    expect(result).toBeNull();
  });

  test("rejects an expired token", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "reset_password");
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTokens.userId, user.id));

    const result = await consumeAuthToken(token, "reset_password");

    expect(result).toBeNull();
  });

  test("rejects a token that never existed", async () => {
    const result = await consumeAuthToken("not-a-real-token", "verify_email");

    expect(result).toBeNull();
  });

  test("never stores the raw token, only its hash", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "verify_email");

    const [row] = await db.select().from(authTokens).where(eq(authTokens.userId, user.id)).limit(1);

    expect(row!.tokenHash).not.toBe(token);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- authToken`
Expected: FAIL — `Cannot find module '../../src/services/authToken.service.js'`.

- [ ] **Step 3: Implement the token utilities**

Create `src/utils/tokens.ts`:

```ts
import { randomBytes, createHash } from "node:crypto";

/** Generates a random URL-safe token plus its SHA-256 hash. Only the hash is ever persisted — the raw token exists only in the emailed link and briefly in memory. */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

/** Hashes a token for lookup/storage. SHA-256 is sufficient here — unlike passwords, these are already high-entropy random values, not human-guessable. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 4: Implement the token service**

Create `src/services/authToken.service.ts`:

```ts
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { authTokens } from "../db/schema.js";
import { generateToken, hashToken } from "../utils/tokens.js";

export type TokenPurpose = "verify_email" | "reset_password";

const TTL_MS: Record<TokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 45 * 60 * 1000,
};

/** Creates a single-use token for the given user/purpose and returns the raw value to email — only its hash is persisted. */
export async function createAuthToken(userId: number, purpose: TokenPurpose): Promise<string> {
  const { token, tokenHash } = generateToken();
  await db.insert(authTokens).values({
    userId,
    tokenHash,
    purpose,
    expiresAt: new Date(Date.now() + TTL_MS[purpose]),
  });
  return token;
}

/**
 * Validates and consumes a single-use token: it must exist, match the
 * expected purpose, be unexpired, and unused. Returns the owning userId on
 * success, or null on any failure — callers respond identically either way,
 * so as not to leak which case failed.
 */
export async function consumeAuthToken(rawToken: string, purpose: TokenPurpose): Promise<number | null> {
  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)))
    .limit(1);

  if (!row || row.expiresAt < new Date()) {
    return null;
  }

  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  return row.userId;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- authToken`
Expected: 6 passed.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` and `npm run typecheck:test`
```bash
git add src/utils/tokens.ts src/services/authToken.service.ts tests/services/authToken.test.ts
git commit -m "add single-use token generation and consumption for verify/reset flows"
```

---

### Task 4: Email service (Resend)

**Files:**
- Create: `src/services/email.service.ts`
- Test: `tests/services/email.test.ts`

**Interfaces:**
- Consumes: `env.RESEND_API_KEY`, `env.EMAIL_FROM`, `env.APP_URL` from Task 1, `logger` from `src/utils/logger.ts` (existing).
- Produces: `sendVerificationEmail(to: string, token: string): Promise<void>`, `sendPasswordResetEmail(to: string, token: string): Promise<void>` from `src/services/email.service.ts`. Tasks 5-7 import these.

- [ ] **Step 1: Write the failing test**

Create `tests/services/email.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { logger } from "../../src/utils/logger.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../../src/services/email.service.js";

describe("email.service", () => {
  test("logs instead of sending when RESEND_API_KEY is unset", async () => {
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- email`
Expected: FAIL — `Cannot find module '../../src/services/email.service.js'`.

- [ ] **Step 3: Install the Resend SDK**

Run: `npm install resend@^4.0.0`

- [ ] **Step 4: Implement the email service**

Create `src/services/email.service.ts`:

```ts
import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    logger.info(`[email:disabled] Would send "${subject}" to ${to}`, { html });
    return;
  }
  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html });
  if (error) {
    throw new Error(`Resend failed to send email: ${error.message}`);
  }
}

/** Sends the "verify your email" link, valid for 24 hours (see TTL_MS in authToken.service.ts). */
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/verify-email?token=${token}`;
  await sendEmail(to, "Verify your NicheRadar email", `<p>Confirm your email: <a href="${link}">${link}</a></p>`);
}

/** Sends the password-reset link, valid for 45 minutes (see TTL_MS in authToken.service.ts). */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/reset-password?token=${token}`;
  await sendEmail(to, "Reset your NicheRadar password", `<p>Reset your password: <a href="${link}">${link}</a></p>`);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- email`
Expected: 2 passed. (`.env.test` has no `RESEND_API_KEY`, so both tests exercise the fallback path — the real Resend call path needs a live key and domain, and is verified manually once those exist.)

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` and `npm run typecheck:test`
```bash
git add package.json package-lock.json src/services/email.service.ts tests/services/email.test.ts
git commit -m "add Resend email service with a console-log fallback when no API key is set"
```

---

### Task 5: Register sends a verification email

**Files:**
- Modify: `src/routes/auth.route.ts`
- Test: `tests/auth/register.test.ts`

**Interfaces:**
- Consumes: `createAuthToken` from Task 3, `sendVerificationEmail` from Task 4.

- [ ] **Step 1: Write the failing test**

Create `tests/auth/register.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- register`
Expected: FAIL — no email was logged, since register doesn't send one yet.

- [ ] **Step 3: Wire the verification email into register**

In `src/routes/auth.route.ts`, add the imports:

```ts
import { createAuthToken } from "../services/authToken.service.js";
import { sendVerificationEmail } from "../services/email.service.js";
```

In `POST /register`, right after the `db.insert(users)...returning(...)` call and before signing the JWT, add:

```ts
    const verificationToken = await createAuthToken(user!.id, "verify_email");
    await sendVerificationEmail(user!.email, verificationToken);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- register`
Expected: 1 passed.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` and `npm run typecheck:test`
```bash
git add src/routes/auth.route.ts tests/auth/register.test.ts
git commit -m "send a verification email on register"
```

---

### Task 6: Password reset endpoints

**Files:**
- Modify: `src/routes/auth.route.ts`
- Test: `tests/auth/passwordReset.test.ts`

**Interfaces:**
- Consumes: `createAuthToken`, `consumeAuthToken` from Task 3, `sendPasswordResetEmail` from Task 4, `createTestUser` from Task 2.
- Produces: `POST /api/auth/request-password-reset`, `POST /api/auth/reset-password`.

- [ ] **Step 1: Write the failing tests**

Create `tests/auth/passwordReset.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { createAuthToken } from "../../src/services/authToken.service.js";
import { logger } from "../../src/utils/logger.js";
import { verifyPassword } from "../../src/utils/auth.js";
import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("POST /api/auth/request-password-reset", () => {
  test("returns the same response whether or not the email is registered", async () => {
    await createTestUser({ email: "exists@example.com" });

    const existing = await request(app).post("/api/auth/request-password-reset").send({ email: "exists@example.com" });
    const missing = await request(app).post("/api/auth/request-password-reset").send({ email: "nobody@example.com" });

    expect(existing.status).toBe(missing.status);
    expect(existing.body).toEqual(missing.body);
  });

  test("emails a reset link when the account exists", async () => {
    const spy = vi.spyOn(logger, "info").mockImplementation(() => {});
    await createTestUser({ email: "reset-me@example.com" });

    await request(app).post("/api/auth/request-password-reset").send({ email: "reset-me@example.com" });

    const resetCall = spy.mock.calls.find((call) => String(call[0]).includes("reset-me@example.com"));
    expect(resetCall).toBeDefined();
    spy.mockRestore();
  });
});

describe("POST /api/auth/reset-password", () => {
  test("updates the password, verifies the email, and logs the user in", async () => {
    const user = await createTestUser({ emailVerified: false });
    const token = await createAuthToken(user.id, "reset_password");

    const res = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "new-password-456" });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();

    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(updated!.emailVerified).toBe(true);
    expect(await verifyPassword("new-password-456", updated!.passwordHash)).toBe(true);
  });

  test("rejects a token that was already used", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "reset_password");
    await request(app).post("/api/auth/reset-password").send({ token, newPassword: "first-password-1" });

    const res = await request(app).post("/api/auth/reset-password").send({ token, newPassword: "second-password-2" });

    expect(res.status).toBe(400);
  });

  test("rejects an unknown token", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({ token: "not-real", newPassword: "whatever-123" });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- passwordReset`
Expected: FAIL — 404s, the routes don't exist yet.

- [ ] **Step 3: Implement the endpoints**

In `src/routes/auth.route.ts`, add the imports (extending the ones added in Task 5):

```ts
import { createAuthToken, consumeAuthToken } from "../services/authToken.service.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/email.service.js";
```

Add the two new route handlers (after `POST /logout`, before `GET /me`):

```ts
const requestResetSchema = z.object({ email: z.string().email() });

/** POST /request-password-reset — always responds identically whether or not the email is registered, so as not to leak account existence. */
authRouter.post("/request-password-reset", authRateLimiter, async (req, res, next) => {
  try {
    const parsed = requestResetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Email inválido" });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (user) {
      const token = await createAuthToken(user.id, "reset_password");
      await sendPasswordResetEmail(user.email, token);
    }

    res.json({ message: "Si el email existe, te enviamos un link para restablecer tu contraseña" });
  } catch (err) {
    next(err);
  }
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

/** POST /reset-password — consumes a reset token, sets the new password, marks the email verified (this is equally strong proof of ownership as a dedicated verification link), and logs the user in. */
authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const userId = await consumeAuthToken(parsed.data.token, "reset_password");
    if (!userId) {
      res.status(400).json({ error: "El link es inválido o venció" });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const [user] = await db
      .update(users)
      .set({ passwordHash, emailVerified: true })
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, historyRetentionDays: users.historyRetentionDays, emailVerified: users.emailVerified });

    const token = signToken({ userId: user!.id });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.json({ id: user!.id, email: user!.email, historyRetentionDays: user!.historyRetentionDays, emailVerified: user!.emailVerified });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- passwordReset`
Expected: 5 passed.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` and `npm run typecheck:test`
```bash
git add src/routes/auth.route.ts tests/auth/passwordReset.test.ts
git commit -m "add request-password-reset and reset-password endpoints"
```

---

### Task 7: Email verification endpoints

**Files:**
- Modify: `src/routes/auth.route.ts`
- Test: `tests/auth/emailVerification.test.ts`

**Interfaces:**
- Consumes: `createAuthToken`, `consumeAuthToken` from Task 3, `sendVerificationEmail` from Task 4, `requireAuth` from `src/middleware/auth.middleware.ts` (existing).
- Produces: `POST /api/auth/verify-email`, `POST /api/auth/resend-verification` (requireAuth).

- [ ] **Step 1: Write the failing tests**

Create `tests/auth/emailVerification.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { createAuthToken } from "../../src/services/authToken.service.js";
import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("POST /api/auth/verify-email", () => {
  test("marks the account verified", async () => {
    const user = await createTestUser({ emailVerified: false });
    const token = await createAuthToken(user.id, "verify_email");

    const res = await request(app).post("/api/auth/verify-email").send({ token });

    expect(res.status).toBe(200);
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(updated!.emailVerified).toBe(true);
  });

  test("rejects a reset_password token (wrong purpose)", async () => {
    const user = await createTestUser();
    const token = await createAuthToken(user.id, "reset_password");

    const res = await request(app).post("/api/auth/verify-email").send({ token });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/resend-verification", () => {
  test("requires a session", async () => {
    const res = await request(app).post("/api/auth/resend-verification").send({});

    expect(res.status).toBe(401);
  });

  test("sends a fresh verification email for the logged-in user", async () => {
    const agent = request.agent(app);
    await createTestUser({ email: "resend-me@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "resend-me@example.com", password: "password123" });

    const res = await agent.post("/api/auth/resend-verification").send({});

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- emailVerification`
Expected: FAIL — 404s, the routes don't exist yet.

- [ ] **Step 3: Implement the endpoints**

In `src/routes/auth.route.ts`, add the `requireAuth` import if not already present:

```ts
import { requireAuth } from "../middleware/auth.middleware.js";
```

Add the two new route handlers (after the password-reset endpoints from Task 6):

```ts
const verifyEmailSchema = z.object({ token: z.string().min(1) });

/** POST /verify-email — consumes a verification token. Non-blocking: this only clears the dashboard banner, nothing else depends on it. */
authRouter.post("/verify-email", async (req, res, next) => {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Token inválido" });
      return;
    }

    const userId = await consumeAuthToken(parsed.data.token, "verify_email");
    if (!userId) {
      res.status(400).json({ error: "El link es inválido o venció" });
      return;
    }

    const [user] = await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, historyRetentionDays: users.historyRetentionDays, emailVerified: users.emailVerified });

    res.json(user);
  } catch (err) {
    next(err);
  }
});

/** POST /resend-verification — issues a fresh verification token for the logged-in user; powers the dashboard banner's resend button. Rate-limited like request-password-reset, so it can't be used to bomb someone's inbox. */
authRouter.post("/resend-verification", authRateLimiter, requireAuth, async (req, res, next) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }

    const token = await createAuthToken(user.id, "verify_email");
    await sendVerificationEmail(user.email, token);

    res.json({ message: "Te reenviamos el email de verificación" });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- emailVerification`
Expected: 4 passed.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` and `npm run typecheck:test`
```bash
git add src/routes/auth.route.ts tests/auth/emailVerification.test.ts
git commit -m "add verify-email and resend-verification endpoints"
```

---

### Task 8: Change password

**Files:**
- Modify: `src/routes/auth.route.ts`
- Test: `tests/auth/changePassword.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `hashPassword`, `verifyPassword` (all existing), `createTestUser` from Task 2.
- Produces: `POST /api/auth/change-password` (requireAuth).

- [ ] **Step 1: Write the failing tests**

Create `tests/auth/changePassword.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { verifyPassword } from "../../src/utils/auth.js";
import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("POST /api/auth/change-password", () => {
  test("requires a session", async () => {
    const res = await request(app).post("/api/auth/change-password").send({ currentPassword: "a", newPassword: "b" });

    expect(res.status).toBe(401);
  });

  test("rejects an incorrect current password", async () => {
    const agent = request.agent(app);
    await createTestUser({ email: "change-me@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "change-me@example.com", password: "password123" });

    const res = await agent.post("/api/auth/change-password").send({ currentPassword: "wrong-password", newPassword: "new-password-456" });

    expect(res.status).toBe(401);
  });

  test("updates the password when the current password is correct", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "change-me-2@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "change-me-2@example.com", password: "password123" });

    const res = await agent.post("/api/auth/change-password").send({ currentPassword: "password123", newPassword: "new-password-456" });

    expect(res.status).toBe(204);
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(await verifyPassword("new-password-456", updated!.passwordHash)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- changePassword`
Expected: FAIL — 404, the route doesn't exist yet.

- [ ] **Step 3: Implement the endpoint**

In `src/routes/auth.route.ts`, add after the email-verification endpoints from Task 7:

```ts
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

/** POST /change-password — requires re-entering the current password even though the user already holds a valid session, as a second confirmation. */
authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      res.status(401).json({ error: "Contraseña actual incorrecta" });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- changePassword`
Expected: 3 passed.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` and `npm run typecheck:test`
```bash
git add src/routes/auth.route.ts tests/auth/changePassword.test.ts
git commit -m "add change-password endpoint"
```

---

### Task 9: Delete account

**Files:**
- Modify: `src/routes/auth.route.ts`
- Test: `tests/auth/deleteAccount.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `verifyPassword` (existing), `createTestUser` from Task 2, `keywords` from `src/db/schema.ts` (existing).
- Produces: `DELETE /api/auth/me` (requireAuth).

- [ ] **Step 1: Write the failing tests**

Create `tests/auth/deleteAccount.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../helpers/testApp.js";
import { createTestUser } from "../helpers/factories.js";
import { db } from "../../src/db/client.js";
import { users, keywords } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

describe("DELETE /api/auth/me", () => {
  test("requires a session", async () => {
    const res = await request(app).delete("/api/auth/me").send({ password: "whatever" });

    expect(res.status).toBe(401);
  });

  test("rejects an incorrect password and does not delete the account", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "keep-me@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "keep-me@example.com", password: "password123" });

    const res = await agent.delete("/api/auth/me").send({ password: "wrong-password" });

    expect(res.status).toBe(401);
    const [stillThere] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(stillThere).toBeDefined();
  });

  test("deletes the account and cascades to its keywords", async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ email: "delete-me@example.com", password: "password123" });
    await agent.post("/api/auth/login").send({ email: "delete-me@example.com", password: "password123" });
    const [keyword] = await db.insert(keywords).values({ userId: user.id, term: "test-term" }).returning();

    const res = await agent.delete("/api/auth/me").send({ password: "password123" });

    expect(res.status).toBe(204);
    const [deletedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    expect(deletedUser).toBeUndefined();
    const [deletedKeyword] = await db.select().from(keywords).where(eq(keywords.id, keyword!.id)).limit(1);
    expect(deletedKeyword).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- deleteAccount`
Expected: FAIL — 404, the route doesn't exist yet.

- [ ] **Step 3: Implement the endpoint**

In `src/routes/auth.route.ts`, add after the change-password endpoint from Task 8:

```ts
const deleteAccountSchema = z.object({ password: z.string().min(1) });

/** DELETE /me — requires re-entering the password. Deletes only the users row; every dependent table cascades via the onDelete: "cascade" foreign keys already in schema.ts. */
authRouter.delete("/me", requireAuth, async (req, res, next) => {
  try {
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Falta la contraseña" });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: "Contraseña incorrecta" });
      return;
    }

    await db.delete(users).where(eq(users.id, user.id));

    res.clearCookie(COOKIE_NAME);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- deleteAccount`
Expected: 3 passed.

- [ ] **Step 5: Run the full backend suite, typecheck, and commit**

Run: `npm test`
Expected: all tests across every task so far pass (smoke + authToken + email + register + passwordReset + emailVerification + changePassword + deleteAccount).

Run: `npm run typecheck` and `npm run typecheck:test`
```bash
git add src/routes/auth.route.ts tests/auth/deleteAccount.test.ts
git commit -m "add delete-account endpoint"
```

---

### Task 10: Frontend types, AuthContext, and i18n strings

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/context/AuthContext.tsx`
- Modify: `client/src/lib/i18n.ts`

**Interfaces:**
- Produces: `User.emailVerified: boolean`, `AuthContext.setUser(user: User): void`, `AuthContext.completePasswordReset(token: string, newPassword: string): Promise<void>`. New `Translations` keys: `auth.forgotPasswordLink`, `auth.forgotPassword.*`, `auth.resetPassword.*`, `auth.verifyEmail.*`, `auth.verificationBanner.*`, `account.*`. Tasks 11-13 all consume these.

- [ ] **Step 1: Add `emailVerified` to the `User` type**

In `client/src/lib/types.ts`:

```ts
export interface User {
  id: number;
  email: string;
  historyRetentionDays: number;
  emailVerified: boolean;
}
```

- [ ] **Step 2: Extend `AuthContext`**

In `client/src/context/AuthContext.tsx`, add to `AuthContextValue`:

```ts
interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  completePasswordReset: (token: string, newPassword: string) => Promise<void>;
}
```

Add the implementation and expose both from the provider:

```ts
  async function completePasswordReset(token: string, newPassword: string) {
    const updatedUser = await api.post<User>("/auth/reset-password", { token, newPassword });
    setUser(updatedUser);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser, completePasswordReset }}>
      {children}
    </AuthContext.Provider>
  );
```

- [ ] **Step 3: Add the new translation keys**

In `client/src/lib/i18n.ts`, extend the `Translations` interface — add `forgotPasswordLink` to the existing `auth.login` block, and three new blocks alongside `genericError` inside `auth`, plus a new top-level `account` block:

```ts
  auth: {
    login: {
      title: string;
      email: string;
      password: string;
      submit: string;
      submitting: string;
      noAccount: string;
      registerLink: string;
      forgotPasswordLink: string;
    };
    register: {
      title: string;
      email: string;
      password: string;
      passwordHint: string;
      submit: string;
      submitting: string;
      haveAccount: string;
      loginLink: string;
    };
    genericError: string;
    forgotPassword: {
      title: string;
      email: string;
      submit: string;
      submitting: string;
      success: string;
      backToLogin: string;
    };
    resetPassword: {
      title: string;
      newPassword: string;
      confirmPassword: string;
      submit: string;
      submitting: string;
      mismatch: string;
      invalidToken: string;
    };
    verifyEmail: {
      title: string;
      confirm: string;
      confirming: string;
      success: string;
      invalidToken: string;
    };
    verificationBanner: {
      message: string;
      resend: string;
      resent: string;
    };
  };
  account: {
    title: string;
    changePassword: {
      heading: string;
      current: string;
      new: string;
      confirm: string;
      submit: string;
      submitting: string;
      success: string;
      mismatch: string;
    };
    deleteAccount: {
      heading: string;
      warning: string;
      password: string;
      submit: string;
      submitting: string;
      confirmPrompt: string;
    };
  };
```

Add the matching values to the `es` object (inside `auth`, and a new sibling `account` block at the same level as `auth`):

```ts
    auth: {
      login: {
        title: "Iniciar sesión",
        email: "Email",
        password: "Contraseña",
        submit: "Entrar",
        submitting: "Entrando...",
        noAccount: "¿No tienes cuenta?",
        registerLink: "Regístrate",
        forgotPasswordLink: "¿Olvidaste tu contraseña?",
      },
      register: {
        title: "Crear cuenta",
        email: "Email",
        password: "Contraseña",
        passwordHint: "Mínimo 8 caracteres.",
        submit: "Crear cuenta",
        submitting: "Creando...",
        haveAccount: "¿Ya tienes cuenta?",
        loginLink: "Inicia sesión",
      },
      genericError: "Algo salió mal, intenta de nuevo",
      forgotPassword: {
        title: "Recuperar contraseña",
        email: "Email",
        submit: "Enviar link",
        submitting: "Enviando...",
        success: "Si el email existe, te enviamos un link para restablecer tu contraseña.",
        backToLogin: "Volver a iniciar sesión",
      },
      resetPassword: {
        title: "Elegir nueva contraseña",
        newPassword: "Contraseña nueva",
        confirmPassword: "Confirmar contraseña",
        submit: "Guardar contraseña",
        submitting: "Guardando...",
        mismatch: "Las contraseñas no coinciden",
        invalidToken: "El link es inválido o venció. Solicita uno nuevo.",
      },
      verifyEmail: {
        title: "Verificar tu email",
        confirm: "Confirmar verificación",
        confirming: "Verificando...",
        success: "Tu email quedó verificado.",
        invalidToken: "El link es inválido o venció.",
      },
      verificationBanner: {
        message: "Todavía no verificaste tu email.",
        resend: "Reenviar verificación",
        resent: "Te reenviamos el email.",
      },
    },
    account: {
      title: "Mi cuenta",
      changePassword: {
        heading: "Cambiar contraseña",
        current: "Contraseña actual",
        new: "Contraseña nueva",
        confirm: "Confirmar contraseña",
        submit: "Actualizar contraseña",
        submitting: "Actualizando...",
        success: "Contraseña actualizada.",
        mismatch: "Las contraseñas no coinciden",
      },
      deleteAccount: {
        heading: "Eliminar cuenta",
        warning: "Vas a perder todos tus datos: keywords, tendencias y related queries. Esta acción no se puede deshacer.",
        password: "Contraseña",
        submit: "Eliminar mi cuenta",
        submitting: "Eliminando...",
        confirmPrompt: "¿Estás totalmente seguro? Esta acción no se puede deshacer.",
      },
    },
```

Add the equivalent to the `en` object:

```ts
    auth: {
      login: {
        title: "Log in",
        email: "Email",
        password: "Password",
        submit: "Log in",
        submitting: "Logging in...",
        noAccount: "Don't have an account?",
        registerLink: "Sign up",
        forgotPasswordLink: "Forgot your password?",
      },
      register: {
        title: "Create account",
        email: "Email",
        password: "Password",
        passwordHint: "At least 8 characters.",
        submit: "Create account",
        submitting: "Creating...",
        haveAccount: "Already have an account?",
        loginLink: "Log in",
      },
      genericError: "Something went wrong, please try again",
      forgotPassword: {
        title: "Recover password",
        email: "Email",
        submit: "Send link",
        submitting: "Sending...",
        success: "If that email is registered, we sent a link to reset your password.",
        backToLogin: "Back to log in",
      },
      resetPassword: {
        title: "Choose a new password",
        newPassword: "New password",
        confirmPassword: "Confirm password",
        submit: "Save password",
        submitting: "Saving...",
        mismatch: "Passwords don't match",
        invalidToken: "This link is invalid or expired. Request a new one.",
      },
      verifyEmail: {
        title: "Verify your email",
        confirm: "Confirm verification",
        confirming: "Verifying...",
        success: "Your email is now verified.",
        invalidToken: "This link is invalid or expired.",
      },
      verificationBanner: {
        message: "You haven't verified your email yet.",
        resend: "Resend verification",
        resent: "We resent the email.",
      },
    },
    account: {
      title: "My account",
      changePassword: {
        heading: "Change password",
        current: "Current password",
        new: "New password",
        confirm: "Confirm password",
        submit: "Update password",
        submitting: "Updating...",
        success: "Password updated.",
        mismatch: "Passwords don't match",
      },
      deleteAccount: {
        heading: "Delete account",
        warning: "You'll lose all your data: keywords, trends, and related queries. This can't be undone.",
        password: "Password",
        submit: "Delete my account",
        submitting: "Deleting...",
        confirmPrompt: "Are you absolutely sure? This can't be undone.",
      },
    },
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --prefix client`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/types.ts client/src/context/AuthContext.tsx client/src/lib/i18n.ts
git commit -m "add emailVerified to User, AuthContext helpers, and account-management i18n strings"
```

---

### Task 11: Forgot/reset password pages

**Files:**
- Create: `client/src/pages/ForgotPasswordPage.tsx`
- Create: `client/src/pages/ResetPasswordPage.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `api` from `client/src/lib/api.ts`, `completePasswordReset` from `AuthContext` (Task 10), `t.auth.forgotPassword`/`t.auth.resetPassword`/`t.auth.login.forgotPasswordLink` from i18n (Task 10), `HeroWordmark`/`LanguageToggle`/`GridBackground` (existing).
- Produces: routes `/forgot-password`, `/reset-password`.

- [ ] **Step 1: Create the forgot-password page**

Create `client/src/pages/ForgotPasswordPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../lib/api";
import { HeroWordmark } from "../components/HeroWordmark";
import { LanguageToggle } from "../components/LanguageToggle";
import { GridBackground } from "../components/GridBackground";

/** Requests a password-reset email. Always shows the same success message, whether or not the email is registered. */
export function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/auth/request-password-reset", { email });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-bg px-4 py-12">
      <GridBackground />
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="relative">
        <HeroWordmark />
      </div>
      <div className="relative w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-text">{t.auth.forgotPassword.title}</h2>
        {sent ? (
          <p className="rounded border border-border bg-bg p-2 text-sm text-text">{t.auth.forgotPassword.success}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text" htmlFor="email">{t.auth.forgotPassword.email}</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-primary py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? t.auth.forgotPassword.submitting : t.auth.forgotPassword.submit}
            </button>
          </form>
        )}
        <p className="text-center text-sm text-text-muted">
          <Link to="/login" className="text-primary underline">{t.auth.forgotPassword.backToLogin}</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the reset-password page**

Create `client/src/pages/ResetPasswordPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { ApiError, formatApiError } from "../lib/api";
import { HeroWordmark } from "../components/HeroWordmark";
import { LanguageToggle } from "../components/LanguageToggle";
import { GridBackground } from "../components/GridBackground";

/** Reads the reset token from the URL; submitting the form is the explicit user action that consumes it (never the page's own GET). */
export function ResetPasswordPage() {
  const { completePasswordReset } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError(t.auth.resetPassword.mismatch);
      return;
    }
    setSubmitting(true);
    try {
      await completePasswordReset(token, newPassword);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.body.error) : t.auth.resetPassword.invalidToken);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-bg px-4 py-12">
      <GridBackground />
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="relative">
        <HeroWordmark />
      </div>
      <form onSubmit={handleSubmit} className="relative w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h2 className="font-display text-xl font-semibold text-text">{t.auth.resetPassword.title}</h2>
        {error && <p className="rounded border border-primary/30 bg-primary/10 p-2 text-sm text-primary">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-text" htmlFor="newPassword">{t.auth.resetPassword.newPassword}</label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text" htmlFor="confirmPassword">{t.auth.resetPassword.confirmPassword}</label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-primary py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
        >
          {submitting ? t.auth.resetPassword.submitting : t.auth.resetPassword.submit}
        </button>
        <p className="text-center text-sm text-text-muted">
          <Link to="/login" className="text-primary underline">{t.auth.forgotPassword.backToLogin}</Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Wire the new routes**

In `client/src/App.tsx`, add the two new public routes alongside `/login`/`/register`:

```tsx
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
```

```tsx
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
```

- [ ] **Step 4: Add the link from the login page**

In `client/src/pages/LoginPage.tsx`, add the link right after the password field's closing `</div>` (before the submit button):

```tsx
        <p className="text-right text-sm">
          <Link to="/forgot-password" className="text-primary underline">{t.auth.login.forgotPasswordLink}</Link>
        </p>
```

- [ ] **Step 5: Typecheck and manually verify**

Run: `npm run typecheck --prefix client`
Expected: no errors.

Run: `npm run dev` (backend) and `npm run dev --prefix client`, then in a browser:
1. Go to `/login`, click "¿Olvidaste tu contraseña?" — lands on `/forgot-password`.
2. Submit a registered email — see the success message. Check the backend terminal log for the `[email:disabled]` line containing the reset link (no `RESEND_API_KEY` set locally).
3. Copy the `token=` value from that logged link, go to `/reset-password?token=<value>`, submit a new password — redirected to `/dashboard`, logged in.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ForgotPasswordPage.tsx client/src/pages/ResetPasswordPage.tsx client/src/App.tsx client/src/pages/LoginPage.tsx
git commit -m "add forgot-password and reset-password pages"
```

---

### Task 12: Email verification page and dashboard banner

**Files:**
- Create: `client/src/pages/VerifyEmailPage.tsx`
- Create: `client/src/components/VerificationBanner.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `api` from `client/src/lib/api.ts`, `setUser`/`user` from `AuthContext` (Task 10), `t.auth.verifyEmail`/`t.auth.verificationBanner` from i18n (Task 10).
- Produces: route `/verify-email`, `<VerificationBanner />`.

- [ ] **Step 1: Create the verify-email page**

Create `client/src/pages/VerifyEmailPage.tsx`:

```tsx
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { ApiError, formatApiError } from "../lib/api";
import { api } from "../lib/api";
import type { User } from "../lib/types";

/**
 * Requires an explicit button click to consume the token — never fires on
 * page load — so a mail client's automatic link pre-fetch can't burn the
 * token before the user opens it themselves.
 */
export function VerifyEmailPage() {
  const { setUser } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus("confirming");
    setError(null);
    try {
      const user = await api.post<User>("/auth/verify-email", { token });
      setUser(user);
      setStatus("done");
    } catch (err) {
      setError(err instanceof ApiError ? formatApiError(err.body.error) : t.auth.verifyEmail.invalidToken);
      setStatus("error");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <h2 className="font-display text-xl font-semibold text-text">{t.auth.verifyEmail.title}</h2>
        {status === "done" ? (
          <p className="text-sm text-text">{t.auth.verifyEmail.success}</p>
        ) : (
          <>
            {error && <p className="rounded border border-primary/30 bg-primary/10 p-2 text-sm text-primary">{error}</p>}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={status === "confirming"}
              className="w-full rounded bg-primary py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
            >
              {status === "confirming" ? t.auth.verifyEmail.confirming : t.auth.verifyEmail.confirm}
            </button>
          </>
        )}
        <Link to="/dashboard" className="block text-sm text-primary underline">
          NicheRadar
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the verification banner**

Create `client/src/components/VerificationBanner.tsx`:

```tsx
import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../lib/api";

/** Non-blocking reminder shown while the logged-in user's email isn't verified yet. Never gates any functionality — see spec §2. */
export function VerificationBanner() {
  const { t } = useLanguage();
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleResend() {
    setSending(true);
    try {
      await api.post("/auth/resend-verification", {});
      setResent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/10 px-6 py-2 text-sm text-text">
      <span>{t.auth.verificationBanner.message}</span>
      {resent ? (
        <span className="text-text-muted">{t.auth.verificationBanner.resent}</span>
      ) : (
        <button type="button" onClick={handleResend} disabled={sending} className="text-primary underline disabled:opacity-50">
          {t.auth.verificationBanner.resend}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire the route**

In `client/src/App.tsx`, add the import and a protected route (needs a session, but must not block on `emailVerified`):

```tsx
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
```

```tsx
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
              </Route>
```

- [ ] **Step 4: Show the banner on the dashboard**

In `client/src/pages/DashboardPage.tsx`, add the import:

```tsx
import { VerificationBanner } from "../components/VerificationBanner";
import { useAuth } from "../context/AuthContext";
```

Inside `DashboardPage`, add `const { user } = useAuth();` near the top with the other hooks (e.g. right after the `useLanguage()` call). Then, in the JSX (`DashboardPage.tsx:178-180`), add the banner as the first child inside the root `<div>`, right before `<Navbar />`:

```tsx
  return (
    <div className="flex h-screen flex-col overflow-y-auto bg-bg">
      {user && !user.emailVerified && <VerificationBanner />}
      <Navbar />
```

- [ ] **Step 5: Typecheck and manually verify**

Run: `npm run typecheck --prefix client`

In the browser: register a new account, confirm the banner shows on `/dashboard`, click "Reenviar verificación", check the backend log for a fresh `[email:disabled]` line, copy its token into `/verify-email?token=<value>`, click "Confirmar verificación", confirm the banner disappears on returning to `/dashboard`.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/VerifyEmailPage.tsx client/src/components/VerificationBanner.tsx client/src/App.tsx client/src/pages/DashboardPage.tsx
git commit -m "add email verification page and non-blocking dashboard banner"
```

---

### Task 13: Account modal (change password, delete account)

**Files:**
- Create: `client/src/components/AccountModal.tsx`
- Modify: `client/src/components/Navbar.tsx`

**Interfaces:**
- Consumes: `Modal` from `client/src/components/Modal.tsx` (existing), `api`/`ApiError`/`formatApiError` from `client/src/lib/api.ts`, `logout` from `AuthContext`, `t.account` from i18n (Task 10).

- [ ] **Step 1: Create the account modal**

Create `client/src/components/AccountModal.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { ApiError, formatApiError, api } from "../lib/api";
import { Modal } from "./Modal";

interface AccountModalProps {
  onClose: () => void;
}

/** Modal with two independent sections: changing password and deleting the account. Both re-require the current password as a second confirmation, even though the user already holds a valid session. */
export function AccountModal({ onClose }: AccountModalProps) {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState(false);
  const [changing, setChanging] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setChangeError(null);
    setChangeSuccess(false);
    if (newPassword !== confirmPassword) {
      setChangeError(t.account.changePassword.mismatch);
      return;
    }
    setChanging(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setChangeSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setChangeError(err instanceof ApiError ? formatApiError(err.body.error) : t.auth.genericError);
    } finally {
      setChanging(false);
    }
  }

  async function handleDeleteAccount(event: FormEvent) {
    event.preventDefault();
    setDeleteError(null);
    if (!window.confirm(t.account.deleteAccount.confirmPrompt)) {
      return;
    }
    setDeleting(true);
    try {
      await api.delete("/auth/me", { password: deletePassword } as never);
      await logout();
      navigate("/login");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? formatApiError(err.body.error) : t.auth.genericError);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title={t.account.title} onClose={onClose}>
      <form onSubmit={handleChangePassword} className="space-y-3 border-b border-border pb-6">
        <h3 className="text-sm font-semibold text-text">{t.account.changePassword.heading}</h3>
        {changeError && <p className="rounded border border-primary/30 bg-primary/10 p-2 text-xs text-primary">{changeError}</p>}
        {changeSuccess && <p className="rounded border border-border bg-bg p-2 text-xs text-text">{t.account.changePassword.success}</p>}
        <input
          type="password"
          required
          placeholder={t.account.changePassword.current}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder={t.account.changePassword.new}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder={t.account.changePassword.confirm}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
        />
        <button
          type="submit"
          disabled={changing}
          className="w-full rounded bg-primary py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
        >
          {changing ? t.account.changePassword.submitting : t.account.changePassword.submit}
        </button>
      </form>

      <form onSubmit={handleDeleteAccount} className="space-y-3 pt-6">
        <h3 className="text-sm font-semibold text-text">{t.account.deleteAccount.heading}</h3>
        <p className="text-xs text-text-muted">{t.account.deleteAccount.warning}</p>
        {deleteError && <p className="rounded border border-primary/30 bg-primary/10 p-2 text-xs text-primary">{deleteError}</p>}
        <input
          type="password"
          required
          placeholder={t.account.deleteAccount.password}
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text"
        />
        <button
          type="submit"
          disabled={deleting}
          className="w-full rounded border border-primary py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {deleting ? t.account.deleteAccount.submitting : t.account.deleteAccount.submit}
        </button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Fix `api.delete`'s signature (it currently takes no body)**

`client/src/lib/api.ts`'s `delete` doesn't accept a body, but `DELETE /api/auth/me` needs one (the password). Change it in `client/src/lib/api.ts`:

```ts
  delete: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "DELETE", ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }),
```

Then in `AccountModal.tsx`, simplify the call from Step 1 (drop the `as never` cast, now unnecessary):

```ts
      await api.delete("/auth/me", { password: deletePassword });
```

- [ ] **Step 3: Add the account icon to the Navbar**

In `client/src/components/Navbar.tsx`, add the import and a small inline account icon next to `HistoryIcon`:

```tsx
import { AccountModal } from "./AccountModal";
```

```tsx
function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z"
        fill="currentColor"
      />
      <path
        d="M20.5 22C20.5 17.8579 16.6944 14.5 12 14.5C7.30558 14.5 3.5 17.8579 3.5 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

In `Navbar.tsx:34`, add the new state right after the existing `historyOpen` state:

```tsx
  const [historyOpen, setHistoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
```

In `Navbar.tsx:44-51`, add the account button right after the closing `</button>` of the existing history button (still inside the same wrapping `<span className="flex items-center gap-3 ...">`):

```tsx
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label={t.nav.history}
            className="flex items-center justify-center rounded p-1.5 text-text-muted hover:bg-bg hover:text-primary"
          >
            <HistoryIcon />
          </button>
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-label={t.account.title}
            className="flex items-center justify-center rounded p-1.5 text-text-muted hover:bg-bg hover:text-primary"
          >
            <AccountIcon />
          </button>
```

In `Navbar.tsx:79-81`, add the modal render right after the existing `{historyOpen && user && (...)}` block, still inside the same `<>...</>` fragment:

```tsx
      {historyOpen && user && (
        <HistoryModal initialRetentionDays={user.historyRetentionDays} onClose={() => setHistoryOpen(false)} />
      )}
      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
```

- [ ] **Step 4: Typecheck and manually verify**

Run: `npm run typecheck --prefix client`

In the browser, logged in: open the account modal from the Navbar icon.
1. Change password with the wrong current password — see the error, nothing changes.
2. Change password with the correct current password — see the success message; log out and back in with the new password to confirm it took.
3. Open the delete-account section, enter the correct password, confirm the `window.confirm` prompt — redirected to `/login`, and the account is gone (trying to log back in with the old credentials fails).

- [ ] **Step 5: Run the full test suite one last time**

Run: `npm test`, `npm run typecheck`, `npm run typecheck:test` (root `package.json`), and `npm run typecheck --prefix client`
Expected: everything green.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AccountModal.tsx client/src/components/Navbar.tsx client/src/lib/api.ts
git commit -m "add account modal for changing password and deleting the account"
```
