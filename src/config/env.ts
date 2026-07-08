import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),

  // Etsy integration is optional: if either is missing, Etsy-backed
  // features are disabled rather than the app failing to start.
  ETSY_API_KEY: z.string().optional(),
  ETSY_API_SECRET: z.string().optional(),
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
