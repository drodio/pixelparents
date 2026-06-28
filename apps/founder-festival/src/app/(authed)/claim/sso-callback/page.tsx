import { SsoCallback } from "./SsoCallback";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// OAuth / email-link return target for the Claim flow. Clerk finishes the
// handshake here; we then forward to /claim/callback (which runs
// matchConfidence + inserts the claim row, then redirects to the user's
// profile). The eval id + return value travel in THIS page's query string
// (set by the caller's `redirectUrl`) so we can build an explicit forced
// destination — see SsoCallback for why force-redirect is required.
export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const e = typeof params.e === "string" ? params.e : null;
  const ret = typeof params.return === "string" ? params.return : "welcome";
  const dest = e
    ? `/claim/callback?e=${encodeURIComponent(e)}&return=${encodeURIComponent(ret)}`
    : "/claim";
  return <SsoCallback dest={dest} />;
}
