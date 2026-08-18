import rateLimit from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

/** Applied to all /api routes: a generous ceiling so normal dashboard usage never trips it. */
export const apiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes, intentá de nuevo más tarde" },
});

/** Applied only to login/register: tight enough to blunt brute-force and credential-stuffing attempts. */
export const authRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos, intentá de nuevo más tarde" },
});
