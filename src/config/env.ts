import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),

  // JWT_SECRET must be at least 32 characters; a short or guessable
  // value allows session forgery for any user.
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7), // 7 days

  // Shared secret for the internal collection-trigger endpoint. Not tied
  // to any user — it authenticates the scheduled GitHub Actions workflow.
  CRON_SECRET: z.string().min(32, "CRON_SECRET debe tener al menos 32 caracteres"),

  // Etsy integration is optional: if either is missing, Etsy-backed
  // features are disabled rather than the app failing to start.
  ETSY_API_KEY: z.string().optional(),
  ETSY_API_SECRET: z.string().optional(),

  // Email (Resend) is optional: without a key, verification/reset
  // links are logged instead of sent — dev, self-hosted instances, and tests all work
  // with zero external dependency.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("NicheRadar <onboarding@resend.dev>"),
  APP_URL: z.string().url().default("http://localhost:5173"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isEtsyEnabled = Boolean(env.ETSY_API_KEY && env.ETSY_API_SECRET);