import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../utils/auth.js";
import { env } from "../config/env.js";
import { authRateLimiter } from "../middleware/rateLimit.middleware.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createAuthToken, consumeAuthToken } from "../services/authToken.service.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/email.service.js";
import { logger } from "../utils/logger.js";

export const authRouter = Router();

const COOKIE_NAME = "token";
const COOKIE_MAX_AGE_MS = env.JWT_EXPIRES_IN_SECONDS * 1000;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

/** POST /register — creates a new user account and sets the auth cookie. */
authRouter.post("/register", authRateLimiter, async (req, res, next) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }
    const { email, password } = parsed.data;

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Ya existe una cuenta con ese email" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email, historyRetentionDays: users.historyRetentionDays, emailVerified: users.emailVerified });

    try {
      const verificationToken = await createAuthToken(user!.id, "verify_email");
      await sendVerificationEmail(user!.email, verificationToken);
    } catch (emailErr) {
      logger.error("Failed to send verification email", {
        userId: user!.id,
        email: user!.email,
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }

    const token = signToken({ userId: user!.id });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.status(201).json({ id: user!.id, email: user!.email, historyRetentionDays: user!.historyRetentionDays, emailVerified: user!.emailVerified });
  } catch (err) {
    next(err);
  }
});

/** POST /login — authenticates a user and sets the auth cookie. */
authRouter.post("/login", authRateLimiter, async (req, res, next) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Email o contraseña inválidos" });
      return;
    }
    const { email, password } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: "Credenciales incorrectas" });
      return;
    }

    const token = signToken({ userId: user.id });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.json({ id: user.id, email: user.email, historyRetentionDays: user.historyRetentionDays, emailVerified: user.emailVerified });
  } catch (err) {
    next(err);
  }
});

/** POST /logout — clears the auth cookie. */
authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.status(204).send();
});

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
      try {
        const token = await createAuthToken(user.id, "reset_password");
        await sendPasswordResetEmail(user.email, token);
      } catch (emailErr) {
        // A Resend outage (or any failure here) must never change the caller-visible outcome —
        // otherwise a 500 only on requests for real accounts would leak account existence, the
        // exact thing this endpoint's generic response is meant to prevent.
        logger.error("Failed to send password reset email", {
          userId: user.id,
          email: user.email,
          error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        });
      }
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

/** GET /me — returns the currently authenticated user, including their history retention preference. */
authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  try {
    const payload = verifyToken(token);
    const [user] = await db
      .select({ id: users.id, email: users.email, historyRetentionDays: users.historyRetentionDays, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);
    if (!user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    res.json(user);
  } catch {
    res.status(401).json({ error: "Sesión inválida o expirada" });
  }
});

const ALLOWED_RETENTION_DAYS = [15, 30, 60, 90];

const updateMeSchema = z.object({
  historyRetentionDays: z
    .number()
    .int()
    .refine((v) => ALLOWED_RETENTION_DAYS.includes(v), { message: "Valor de retención no válido" }),
});

/** PATCH /me — updates the authenticated user's account settings (currently just history retention). */
authRouter.patch("/me", async (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  try {
    const payload = verifyToken(token);
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const [user] = await db
      .update(users)
      .set({ historyRetentionDays: parsed.data.historyRetentionDays })
      .where(eq(users.id, payload.userId))
      .returning({ id: users.id, email: users.email, historyRetentionDays: users.historyRetentionDays, emailVerified: users.emailVerified });

    res.json(user);
  } catch (err) {
    next(err);
  }
});

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
