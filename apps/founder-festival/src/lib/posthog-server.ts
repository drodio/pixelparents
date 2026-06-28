import { PostHog } from "posthog-node";

// Server-side PostHog client (singleton). Used by instrumentation.ts's
// onRequestError to capture server exceptions — the alarm that was missing when
// the Neon data-transfer quota took prod down. Serverless-friendly: flush
// immediately (flushAt 1 / flushInterval 0) so events aren't lost when the
// function freezes. Returns null when PostHog isn't configured so nothing in the
// app ever crashes on a missing key.
let client: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}
