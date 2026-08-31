import sgMail from "@sendgrid/mail";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
    logger.info(`[email:disabled] Would send "${subject}" to ${to}`, { html });
    return;
  }
  await sgMail.send({ from: `NicheRadar <${env.SENDGRID_FROM_EMAIL}>`, to, subject, html });
}

/** Sends the "verify your email" link, valid for 24 hours (see TTL_MS in authToken.service.ts). */
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/verify-email?token=${token}`;
  await sendEmail(to, "Verify your NicheRadar email", `<p>Confirm your email: <a href="${link}">${link}</a></p>`);
}

/** Sends the password-reset link, valid for 45 minutes (see TTL_MS in authToken.service.ts). */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/reset-password?token=${token}`;
  await sendEmail(to, "Reset your NicheRadar password", `<p>Reset your password: <a href="${link}">${link}</a></p>`);
}
