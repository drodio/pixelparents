// Best-effort notification to DROdio when someone self-serves an API key, so he
// can decide whether to upgrade them to the 'approved' tier. Uses Resend's REST
// API directly (no SDK dependency — keeps this feature from colliding with the
// signup agent's package.json). Absence of RESEND_API_KEY or any failure is
// swallowed: notifying must never block key issuance.

export type KeyRequestNotice = {
  name: string;
  email: string;
  intendedUse: string;
  prefix: string;
};

export async function notifyKeyRequest(notice: KeyRequestNotice): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // best-effort; fine to skip in dev / when unconfigured

  const to = process.env.NOTIFY_TO ?? "DROdio@chief.bot";
  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";
  const text = [
    `A new Pixel Parents API key was just issued (tier: public).`,
    ``,
    `Name:         ${notice.name}`,
    `Email:        ${notice.email}`,
    `Key prefix:   ${notice.prefix}`,
    `Intended use: ${notice.intendedUse}`,
    ``,
    `Approve in /admin to unlock the 'approved' (non-PII detail) tier.`,
  ].join("\n");

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `New Pixel Parents API key request: ${notice.name}`,
        text,
      }),
    });
  } catch {
    // ignore — notification is non-critical and must not block issuance
  }
}
