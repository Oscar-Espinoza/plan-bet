import "server-only";

import { logEvent } from "@/lib/logger";

const SEND_TIMEOUT_MS = 5000;

export type SendEmailResult =
  { sent: true } | { sent: false; reason: "unconfigured" | "failed" };

/**
 * The origin links inside emails point at — the same resolution order as
 * layout.tsx's metadataBase, so an emailed link and a canonical URL never
 * disagree. No new env var: `NEXT_PUBLIC_SITE_URL` already names this.
 */
export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * Env-gated, never throws: an unconfigured or failing mail provider must
 * never fail the placement or settlement it was notifying about — the same
 * degrade-to-nothing rule missing DATABASE_URL/FOOTBALL_DATA_API_TOKEN get.
 *
 * ponytail: a plain fetch against Resend's REST API rather than the SDK —
 * one endpoint, one shape. Swap in the SDK only if batching or webhooks are
 * ever needed.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    logEvent("info", "email_skipped", { reason: "unconfigured" });
    return { sent: false, reason: "unconfigured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Status only — a provider error body can echo the recipient.
      logEvent("warn", "email_failed", { status: response.status });
      return { sent: false, reason: "failed" };
    }
    logEvent("info", "email_sent", {});
    return { sent: true };
  } catch (error) {
    logEvent("warn", "email_failed", { error });
    return { sent: false, reason: "failed" };
  }
}
