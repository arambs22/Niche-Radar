import { Router } from "express";
import { requireCronSecret } from "../middleware/cronAuth.middleware.js";
import { collectTrendsForAllRegions } from "../services/trendCollector.service.js";
import { logger } from "../utils/logger.js";

export const internalRouter = Router();

/**
 * POST /collect — triggers a full collection run across every region
 * tracked by any user. Protected by CRON_SECRET; called by the scheduled
 * GitHub Actions workflow (see .github/workflows/collect-trends.yml).
 */
internalRouter.post("/collect", requireCronSecret, async (_req, res, next) => {
  try {
    await collectTrendsForAllRegions();
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error("Scheduled collection run failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
});
