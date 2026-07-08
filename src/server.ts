import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`NicheRadar API listening on port ${env.PORT}`, {
    env: env.NODE_ENV,
  });
});
