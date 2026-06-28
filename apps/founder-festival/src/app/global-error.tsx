"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Root error boundary. Catches React render crashes that escape the page-level
// boundaries (the "This page couldn't load" class). Reports them to PostHog and
// shows a minimal recovery UI. global-error MUST render its own <html>/<body>
// because it replaces the root layout when it fires.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          background: "#151515",
          color: "#e4e4e7",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h2>
        <p style={{ color: "#a1a1aa", maxWidth: "28rem" }}>
          We hit an unexpected error and have been notified. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: "1px solid #dfa43a",
            color: "#dfa43a",
            background: "transparent",
            borderRadius: "9999px",
            padding: "0.4rem 1.1rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
