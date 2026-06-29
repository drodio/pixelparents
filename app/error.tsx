"use client";

// Route-level error boundary. Catches errors thrown while rendering a segment
// below the root layout. Must be a client component (Next.js requirement).
import { useEffect } from "react";
import { ErrorScreen } from "@/components/screens/error-screen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for observability; the user only sees the friendly screen.
    console.error(error);
  }, [error]);

  return <ErrorScreen reset={reset} digest={error.digest} />;
}
