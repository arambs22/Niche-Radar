import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth.js";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

/** Rejects the request with 401 unless it carries a valid auth token; attaches `req.userId` otherwise. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida o expirada" });
  }
}