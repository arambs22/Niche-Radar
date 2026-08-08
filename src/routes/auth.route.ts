import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../utils/auth.js";
import { env } from "../config/env.js";

export const authRouter = Router();

const COOKIE_NAME = "token";
const COOKIE_MAX_AGE_MS = env.JWT_EXPIRES_IN_SECONDS * 1000;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

/** POST /register — creates a new user account and sets the auth cookie. */
authRouter.post("/register", async (req, res, next) => {
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
      .returning({ id: users.id, email: users.email });

    const token = signToken({ userId: user!.id });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.status(201).json({ id: user!.id, email: user!.email });
  } catch (err) {
    next(err);
  }
});

/** POST /login — authenticates a user and sets the auth cookie. */
authRouter.post("/login", async (req, res, next) => {
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

    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

/** POST /logout — clears the auth cookie. */
authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.status(204).send();
});

/** GET /me — returns the currently authenticated user. */
authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  try {
    const payload = verifyToken(token);
    const [user] = await db
      .select({ id: users.id, email: users.email })
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