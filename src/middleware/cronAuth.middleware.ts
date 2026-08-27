import type { Request, Response, NextFunction } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Constant-time string comparison via fixed-length SHA-256 digests, so
 * neither the match/mismatch timing nor the raw input length can leak
 * information about the secret being compared against.
 */
function safeCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Rejects the request with 401 unless it carries the shared cron secret
 * as a bearer token. Used only by the internal collection-trigger
 * endpoint — separate from the user-session JWT auth in
 * auth.middleware.ts.
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token || !safeCompare(token, env.CRON_SECRET)) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  next();
}
