"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

// PostHog product analytics, wired per PostHog's official Next.js App Router
// guide. Config comes from env ONLY — the key is never hardcoded.
//
//   NEXT_PUBLIC_POSTHOG_KEY   project key (required to enable analytics)
//   NEXT_PUBLIC_POSTHOG_HOST  ingestion host (defaults to US cloud)
//
// Guard: if the key is absent (local/dev without analytics), this is a complete
// no-op — posthog is never initialized and nothing is captured.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let initialized = false;

function initPostHog(): boolean {
  if (typeof window === "undefined") return false;
  if (!POSTHOG_KEY) return false; // no key → no-op
  if (!initialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // We capture pageviews manually below (App Router client navigations don't
      // trigger a full page load), so disable the automatic one to avoid dupes.
      capture_pageview: false,
      // Capture when a user leaves a page — needed for accurate bounce/time.
      capture_pageleave: true,
      // Autocapture clicks / form interactions out of the box.
      autocapture: true,
      // Respect Do Not Track.
      respect_dnt: true,
    });
    initialized = true;
  }
  return true;
}

// Captures a `$pageview` on every App Router navigation. usePathname +
// useSearchParams change on client-side route transitions, so the effect fires
// for each new URL.
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!initPostHog()) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider() {
  // Initialize once on mount (also covers the first paint before the tracker
  // effect runs). No-ops without a key.
  useEffect(() => {
    initPostHog();
  }, []);

  // useSearchParams() must sit under a Suspense boundary so it doesn't force the
  // whole app to client-side rendering (per the PostHog Next.js App Router guide).
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}
