import express, { type NextFunction, type Request, type Response } from "express";
import { healthRouter } from "./routes/health.route.js";
import { AppError } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.use(healthRouter);

  // 404 handler — reached when no route above matched.
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  });

  // Centralized error handler — must be declared last, with 4 params,
  // for Express to recognize it as an error-handling middleware.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      logger.warn(err.message, { statusCode: err.statusCode });
      res.status(err.statusCode).json({ error: err.message });
      return;
    }

    logger.error("Unhandled error", { err });
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
