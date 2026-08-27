# Account Management — Password Reset, Change Password, Delete Account, Email Verification — Design

**Goal:** Close the account-recovery gap identified in the project security/architecture review: today there is no way to recover a forgotten password, change a password while logged in, delete an account, or confirm that a registered email address is real. This design adds all four, plus the test infrastructure (Vitest + Supertest) to verify them, since this is the most security-sensitive code the project has added since initial auth.

**Non-goals:** No change to the existing session model (JWT in an httpOnly cookie, stateless, no revocation list — accepted trade-off, documented elsewhere). No password complexity rules beyond the existing 8-character minimum. No account lockout beyond the existing IP rate limiting. No admin panel. Etsy/Fase 6 and beyond are untouched.

## 1. Data model

One new column on `users`:

```ts
emailVerified: boolean("email_verified").notNull().default(false)
```

One new table, shared by both token purposes:

```ts
export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  purpose: text("purpose").notNull(), // "verify_email" | "reset_password"
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Tokens are generated as random bytes (`crypto.randomBytes(32).toString("hex")`), only the SHA-256 hash of the token is stored — same principle as password hashing: a stolen database can't be used to mint valid tokens. The raw token only ever exists in the emailed link and briefly in server memory.

`change-password` and `delete-account` need no token — the user already holds a valid session cookie; re-entering their current password is the confirmation step.

## 2. Backend endpoints

All in `src/routes/auth.route.ts`, following the existing Zod-validate → Drizzle-query → `next(err)` pattern.

| Endpoint | Auth | Body | Behavior |
|---|---|---|---|
| `POST /register` | — | *(unchanged)* | Now also generates a `verify_email` token and calls `sendVerificationEmail`. Login-on-register behavior is unchanged. |
| `POST /request-password-reset` | — | `{ email }` | Always returns the same generic success response, whether or not the email is registered — matches the existing login error-message pattern (don't leak which emails exist). If the user exists, generates a `reset_password` token (45 min TTL) and sends the email. |
| `POST /reset-password` | — | `{ token, newPassword }` | Validates the token (correct purpose, not expired, not used). On success: updates `passwordHash`, sets `emailVerified = true` (completing a reset is equally strong proof of email ownership as clicking a dedicated verification link), marks the token used, and signs a fresh session cookie (same as login) so the user lands directly in the dashboard. |
| `POST /verify-email` | — | `{ token }` | Same token validation, sets `emailVerified = true` only — no password change. |
| `POST /resend-verification` | requireAuth | — | Generates a fresh `verify_email` token and re-sends the email. Powers the dashboard banner's resend action. |
| `POST /change-password` | requireAuth | `{ currentPassword, newPassword }` | Rejects unless `currentPassword` matches the stored hash. |
| `DELETE /me` | requireAuth | `{ password }` | Rejects unless `password` matches the stored hash. Deletes the `users` row; every dependent table (`keywords`, `trendSnapshots`, `relatedQueries`, `userRegions`, `keywordCollectionStatus`, `authTokens`) cascades via the existing `onDelete: "cascade"` foreign keys — no manual cleanup needed. |

**Single-use token consumption must not happen on the emailed link's own GET request.** Some mail clients and corporate security scanners pre-fetch links before the user opens them; if that automatic GET consumed a single-use token, the real user's link would already be dead by the time they clicked it. The emailed link always points to a frontend page (`GET`, side-effect-free, renders a form). The token is only consumed by an explicit `POST` triggered by user action — naturally satisfied by `/reset-password` (the user must type a new password first) and enforced deliberately on `/verify-email` (an explicit "Confirm" button rather than auto-firing on page load).

## 3. Email service

New file `src/services/email.service.ts`, wrapping the Resend SDK:

```ts
sendVerificationEmail(to: string, token: string): Promise<void>
sendPasswordResetEmail(to: string, token: string): Promise<void>
```

Two new env vars in `src/config/env.ts`, following the existing `ETSY_API_KEY` optional-integration pattern:

- `RESEND_API_KEY` — optional. If unset, the service does not call Resend; it logs the fully-formed link via `logger.info` instead. This keeps `npm run dev`, self-hosted instances without a Resend account, and Vitest runs fully functional with zero external dependency.
- `APP_URL` — base URL used to build the emailed links (`http://localhost:5173` in dev, the production domain once verified in Resend).

## 4. Frontend

Two new public routes (no session required):
- `/forgot-password` — email input, "Send link" button. Always shows the same success message, matching the backend's non-leaking response.
- `/reset-password?token=...` — new-password + confirm form. On success, the response includes the session cookie (already set server-side), so the app redirects straight to `/dashboard`.

One new route (session required, does not block on `emailVerified`):
- `/verify-email?token=...` — shows a "Confirm verification" button; on click, calls the backend and updates `AuthContext`.

One new component, `AccountModal.tsx` (same pattern as the existing `HistoryModal.tsx`, opened via a new `Navbar` icon), with two sections:
- Change password (current + new + confirm).
- Delete account (password + explicit warning + `window.confirm`, matching the existing "delete permanently" confirmation pattern already used for archived keywords).

A small, non-blocking banner in the dashboard layout, shown only while `user.emailVerified === false`, with a "Resend verification email" link. It disappears the moment verification completes, via either path (direct verification or a completed password reset).

`LoginPage` gets a "Forgot your password?" link to `/forgot-password`. `AuthContext` and `lib/types.ts`'s `User` type gain `emailVerified: boolean`.

## 5. Testing (new: Vitest + Supertest)

Two new devDependencies: `vitest` (test runner) and `supertest` (drives HTTP requests against the Express app in-process, no real port needed).

Tests run against a real Postgres database (`nicheradar_test`, a second database in the existing `docker-compose.yml` — no new infrastructure), migrated before the run, with relevant tables truncated between tests. Mocking Drizzle was considered and rejected: the highest-value thing to test here is exactly what a mock can't verify — that ownership filters and cascades behave correctly against a real database.

Written test-first (TDD), driving the implementation:
- An expired or already-used token is rejected, for both token purposes.
- `request-password-reset` returns an identical response whether or not the email is registered.
- A completed reset updates the password hash, sets `emailVerified = true`, and the same token is rejected on a second use.
- `change-password` rejects an incorrect `currentPassword`.
- `DELETE /me` rejects an incorrect password; on success, the user row and their keywords are both gone (proving the cascade, not just asserting it exists in the schema file).
- With `RESEND_API_KEY` unset, the email service does not throw — it logs instead.

## 6. Migration for existing users

One Drizzle migration, two steps in order:
1. `ALTER TABLE users ADD COLUMN email_verified boolean NOT NULL DEFAULT false;` plus `CREATE TABLE auth_tokens (...)`.
2. `UPDATE users SET email_verified = true;` — a one-time backfill applied only to rows that exist at migration time. Any user registering after this migration runs goes through `POST /register` normally and correctly starts at `false`.

## 7. Error handling & edge cases

- **Email-bombing:** `request-password-reset` and `resend-verification` are both mounted behind the existing `authRateLimiter` (10 requests/15min/IP) — same limiter already protecting login/register.
- **Token TTLs:** 45 minutes for `reset_password` (short — it's a door into the account), 24 hours for `verify_email` (low-stakes, non-blocking, and trivially re-requestable).
- **No orphaned data to clean up by hand:** the existing `onDelete: "cascade"` foreign keys on `keywords`, `trendSnapshots`, `relatedQueries`, `userRegions`, and `keywordCollectionStatus` already handle full cleanup when a `users` row is deleted.
