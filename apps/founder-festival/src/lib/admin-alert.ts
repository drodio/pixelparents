import { Resend } from "resend";
import { appendSignature } from "@/lib/email";

// Lightweight operator-alert email sender (e.g. "your NFX token is about to
// expire"). Deliberately a SEPARATE file from the events-v1 `email.ts` (which
// has event-specific templates) so the two don't collide at merge; they can be
// consolidated later. Reuses the same RESEND_API_KEY / RESEND_FROM env + sender.

const FROM = process.env.RESEND_FROM ?? "Founder Festival <hello@festival.so>";
// Where operator alerts go. Overridable, defaults to the address DROdio asked for.
const ALERT_TO = process.env.ADMIN_ALERT_EMAIL ?? "drodio@festival.so";

// Lazy init: `new Resend("")` throws in resend@6, so defer until first send.
let _resend: Resend | null = null;
function client(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY ?? "");
  return _resend;
}

export function alertConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// Sends an operator alert. Returns the message id, or null (with a warning) when
// RESEND_API_KEY isn't configured — so callers never crash on a missing key.
export async function sendAdminAlert(opts: {
  subject: string;
  html: string;
  to?: string;
}): Promise<{ id: string } | null> {
  if (!alertConfigured()) {
    console.warn("[admin-alert] RESEND_API_KEY unset — skipping:", opts.subject);
    return null;
  }
  const { data, error } = await client().emails.send({
    from: FROM,
    to: opts.to ?? ALERT_TO,
    subject: opts.subject,
    html: await appendSignature(opts.html),
  });
  if (error) throw new Error(`resend: ${error.message}`);
  return { id: data?.id ?? "" };
}
