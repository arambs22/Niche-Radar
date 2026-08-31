import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const transporter =
  env.GMAIL_USER && env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
      })
    : null;

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    logger.info(`[email:disabled] Would send "${subject}" to ${to}`, { html });
    return;
  }
  // Gmail's SMTP relay rejects a From address that doesn't match the
  // authenticated account, so only the display name is customizable here.
  await transporter.sendMail({ from: `NicheRadar <${env.GMAIL_USER}>`, to, subject, html });
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
