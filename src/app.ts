import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { healthRouter } from "./routes/health.route.js";
import { authRouter } from "./routes/auth.route.js";
import { keywordsRouter } from "./routes/keywords.route.js";
import { regionsRouter } from "./routes/regions.route.js";
import { trendsRouter } from "./routes/trends.route.js";
import { internalRouter } from "./routes/internalCollect.route.js";
import { AppError } from "./utils/errors.js";
import { logger } from "./utils/logger.js";
import { apiRateLimiter } from "./middleware/rateLimit.middleware.js";

/** Builds and configures the Express application instance. */
export function createApp() {
  const app = express();

  // CSP allows Google Fonts (loaded by client/index.html) and inline style
  // attributes (React/Recharts set these constantly via style={{...}}); the
  // theme-flash-prevention script is an external file specifically so
  // script-src can stay at 'self' with no inline-script exception.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
        },
      },
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.use(healthRouter);
  app.use("/api", apiRateLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/keywords", keywordsRouter);
  app.use("/api/regions", regionsRouter);
  // Mount /api/internal before /api: trendsRouter's requireAuth middleware is path-unrestricted,
  // so it would intercept /api/internal/* if registered first (Express matches in order).
  app.use("/api/internal", internalRouter);
  app.use("/api", trendsRouter);

  // 404 handler, reached when no route above matched.
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  });

  // Centralized error handler; must be declared last, with 4 params,
  // for Express to recognize it as error-handling middleware.
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