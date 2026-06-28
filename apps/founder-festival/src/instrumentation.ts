import type { Instrumentation } from "next";

export function register() {
  // No-op. The server PostHog client is created lazily in onRequestError so we
  // don't pay for it on cold starts that never error.
}

// Capture EVERY server-side error to PostHog. This is the alarm that was missing
// when the Neon data-transfer quota took prod down with a 500-storm: every
// server exception (DB failure, Server Components render error, route handler
// throw) now lands in PostHog error tracking, where you can alert on the spike.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // posthog-node is Node-only; skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getPostHogServer } = await import("@/lib/posthog-server");
  const posthog = getPostHogServer();
  if (!posthog) return;

  // Best-effort: pull the distinct_id from the PostHog cookie so a server error
  // ties back to the same person as their client-side events.
  let distinctId: string | undefined;
  const cookie = request.headers.cookie;
  const cookieStr = Array.isArray(cookie) ? cookie.join("; ") : cookie;
  const match = cookieStr?.match(/ph_phc_.*?_posthog=([^;]+)/);
  if (match?.[1]) {
    try {
      distinctId = JSON.parse(decodeURIComponent(match[1]))?.distinct_id;
    } catch {
      /* malformed cookie — capture without a distinct_id */
    }
  }

  try {
    posthog.captureException(err as Error, distinctId, {
      path: request.path,
      method: request.method,
      router_kind: context.routerKind,
      route_path: context.routePath,
      route_type: context.routeType,
    });
    await posthog.flush();
  } catch {
    /* never let error reporting throw inside the error path */
  }
};
