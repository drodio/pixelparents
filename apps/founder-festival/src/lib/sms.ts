import { fetchWithTimeout } from "@/lib/fetch-timeout";
// Thin Twilio SMS sender for operator alerts — the SMS sibling of admin-alert.ts.
// No Twilio SDK: a single fetch to Twilio's REST API with HTTP Basic auth
// (Account SID + Auth Token), matching the codebase's lean, dependency-light
// style. We commit to basic auth here, so the stray TWILIO_API_KEY_SID var can
// be pruned.
//
// Safe no-op unless FULLY configured (creds + a from-number + a recipient), so
// dev / preview — which carry Twilio TEST credentials and no ADMIN_ALERT_PHONE
// — never attempt a real send and never crash. In practice this only sends from
// Production, exactly like the email alert only sends when RESEND_API_KEY is set.
//
// Env is read at call time (not module load) so config checks reflect the
// current process.env — mirrors alertConfigured() in admin-alert.ts and keeps
// the helper unit-testable.

export function smsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER &&
    process.env.ADMIN_ALERT_PHONE
  );
}

// Sends an operator SMS. Returns the Twilio message sid, or null (with a
// warning) when not fully configured — so callers never crash on missing env.
// Throws on a non-2xx Twilio response so a misconfiguration (bad creds, bad
// number) surfaces loudly to the caller's try/catch + logs.
export async function sendAdminSms(
  body: string,
  opts?: { to?: string },
): Promise<{ sid: string } | null> {
  if (!smsConfigured()) {
    console.warn("[admin-sms] Twilio not fully configured — skipping SMS");
    return null;
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;
  const to = opts?.to ?? process.env.ADMIN_ALERT_PHONE!;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const form = new URLSearchParams({ To: to, From: from, Body: body });

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`twilio ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => ({}))) as { sid?: string };
  return { sid: data.sid ?? "" };
}
