"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";

// Ties PostHog events/errors to the signed-in Clerk user. Renders nothing.
// Mounted inside the Clerk provider so useUser() is available. No-ops when
// PostHog isn't configured or the visitor is signed out.
export function PostHogIdentify() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !isLoaded) return;
    if (isSignedIn && user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? undefined,
      });
    } else {
      // Signed out (e.g. after logout): drop the identified person.
      posthog.reset();
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}
