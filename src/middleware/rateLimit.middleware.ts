import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Applied to all /api routes: a generous ceiling so normal dashboard usage
 * never trips it. 100/15min turned out too low in practice — a single full
 * dashboard load fires 5-9 requests (auth check, keywords, regions, plus
 * trends+related per active region), so a couple of reloads or a normal
 * session of switching regions/editing keywords could exhaust it.
 */
export const apiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 300,
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
