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
