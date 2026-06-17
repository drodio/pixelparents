// Absolute base URL for building links in server-side contexts (emails, share
// URLs). Prefers an explicit override, then Vercel's deployment URLs, then the
// production domain. No trailing slash.
export function getBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "https://pixelparents.org";
}

// Full secret-share URL for a given token.
export function shareUrlFor(token: string): string {
  return `${getBaseUrl()}/p/${token}`;
}
