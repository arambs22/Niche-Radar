import { Router, type Request, type Response } from "express";
import { checkDatabaseConnection } from "../db/client.js";
import { isEtsyEnabled } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req: Request, res: Response) => {
  const databaseConnected = await checkDatabaseConnection();

  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "degraded",
    database: databaseConnected ? "connected" : "unreachable",
    etsyIntegration: isEtsyEnabled ? "enabled" : "disabled",
    timestamp: new Date().toISOString(),
  });
});
