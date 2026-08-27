import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    logger.info(`[email:disabled] Would send "${subject}" to ${to}`, { html });
    return;
  }
  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html });
  if (error) {
    throw new Error(`Resend failed to send email: ${error.message}`);
  }
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
