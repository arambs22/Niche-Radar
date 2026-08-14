import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

/**
 * Rejects the request with 401 unless it carries the shared cron secret
 * as a bearer token. Used only by the internal collection-trigger
 * endpoint — separate from the user-session JWT auth in
 * auth.middleware.ts.
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token || token !== env.CRON_SECRET) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  next();
}
