import { Resend } from "resend";
import { getBaseUrl } from "@/lib/url";
import type { ChangelogEntryRow } from "@/lib/db/schema/changelog";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;
const FROM = process.env.RESEND_FROM ?? "Pixel Parents <noreply@pixelparents.org>";

// Notify one subscriber about one new changelog entry. Best-effort.
export async function sendChangelogEmail(
  to: string,
  entry: ChangelogEntryRow,
  unsubscribeToken?: string,
): Promise<boolean> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping changelog email");
    return false;
  }
  const base = getBaseUrl();
  const url = `${base}/changelog#${entry.slug}`;
  // Prefer a per-subscriber token link (no email in the URL); fall back to email.
  const unsubscribeUrl = unsubscribeToken
    ? `${base}/api/changelog/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
    : `${base}/api/changelog/unsubscribe?email=${encodeURIComponent(to)}`;
  // Credit the shipper(s): "Name (login)" — login present only when linked to a
  // GH account. Empty for seeded/historical entries (no line rendered).
  const byline = entry.authors?.length
    ? entry.authors.map((a) => (a.login ? `${a.name} (${a.login})` : a.name)).join(", ")
    : "";
  const text = [
    `New on Pixel Parents:`,
    ``,
    entry.title,
    ...(byline ? [`by ${byline}`] : []),
    ``,
    entry.summary,
    ...(entry.bullets?.length ? ["", ...entry.bullets.map((b) => `• ${b}`)] : []),
    ``,
    `See it: ${url}`,
    ``,
    `You're getting this because you subscribed to the Pixel Parents changelog.`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Pixel Parents — ${entry.title}`,
      text,
    });
    return true;
  } catch (err) {
    console.error("changelog email failed:", err);
    return false;
  }
}
