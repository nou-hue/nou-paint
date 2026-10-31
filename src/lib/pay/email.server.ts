/**
 * Transactional email (restore links, purchase confirmation).
 *
 * PROVIDER: Resend, over its REST API (no SDK). Configured when RESEND_API_KEY
 * and EMAIL_FROM are set. With neither set, nothing is sent and callers
 * degrade gracefully. A sending domain with SPF/DKIM is required first
 * (DNS is on hold until nou decides the domain).
 */

export function restoreConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** sent: delivered to provider; skipped: not configured; retry: transient, try again; failed: permanent. */
export type SendResult = "sent" | "skipped" | "retry" | "failed";

export async function sendEmail(msg: {
  to: string;
  subject: string;
  text: string;
  /** Provider-side de-duplication (Resend `Idempotency-Key`, 24h). */
  idempotencyKey?: string;
}): Promise<SendResult> {
  if (!restoreConfigured()) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
      }),
    });
    if (res.ok) return "sent";
    console.error("[nou-paint] email provider status", res.status);
    // 429 and 5xx are worth retrying; other 4xx will not get better.
    return res.status === 429 || res.status >= 500 ? "retry" : "failed";
  } catch (e) {
    console.error("[nou-paint] email send failed", (e as Error)?.message);
    return "retry";
  }
}

export async function sendRestoreEmail(to: string, link: string): Promise<boolean> {
  const r = await sendEmail({
    to,
    subject: "Restore your Nou Paint purchase",
    text:
      "A grown-up asked to restore a Nou Paint pack on this device. " +
      "Use this link to restore it. It works once and expires in 30 minutes.\n\n" +
      `${link}\n\nIf you did not ask for this, you can ignore this email.`,
  });
  return r === "sent";
}
