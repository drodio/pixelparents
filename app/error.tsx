"use client";

// Route-level error boundary. Catches errors thrown while rendering a segment
// below the root layout. Must be a client component (Next.js requirement).
import { useEffect } from "react";
import { ErrorScreen } from "@/components/screens/error-screen";
import { ErrorReportButton } from "@/components/error-report-button";

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

  return (
    <>
      <ErrorScreen reset={reset} digest={error.digest} />
      {/* One-tap bug report, floated at the bottom so we don't have to modify the
          shared ErrorScreen. The button + its confirmation dialog are fully
          self-contained (plain fetch to /api/report-error). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
        <div className="pointer-events-auto">
          <ErrorReportButton error={error} />
        </div>
      </div>
    </>
  );
}
