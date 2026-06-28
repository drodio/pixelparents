import posthog from "posthog-js";

// Client-side PostHog init. Runs once, before React hydration (Next 16
// instrumentation-client convention). No-ops cleanly when the key is unset so
// local/dev without PostHog configured doesn't error.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (key) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // Analytics: autocapture clicks + SPA pageviews.
    autocapture: true,
    capture_pageview: true,
    // Error tracking: capture uncaught client exceptions.
    capture_exceptions: true,
    // Only create person profiles for identified (signed-in) users — keeps
    // anonymous-visitor volume (and cost) down.
    person_profiles: "identified_only",
    // Session replay OFF by default — flip on + configure sampling when ready.
    disable_session_recording: true,
  });
}
