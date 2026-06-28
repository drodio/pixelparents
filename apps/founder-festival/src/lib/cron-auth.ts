// Verify a request came from Vercel Cron (or a holder of CRON_SECRET). Vercel
// sets `Authorization: Bearer <CRON_SECRET>` automatically. SECURITY: the Host
// header is client-controllable, so the localhost convenience bypass (for the
// admin UI's local auto-driver, where there's no scheduled trigger and no real
// spend) is restricted to non-production. In production the secret is required.
export function isAuthorizedCron(req: Request): boolean {
  if (process.env.VERCEL_ENV !== "production") {
    const host = req.headers.get("host") ?? "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}
