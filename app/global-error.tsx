"use client";

// Last-resort boundary: catches errors in the ROOT layout itself, so it must
// render its own <html>/<body> and cannot rely on globals.css or shared
// components (the failure may be in that very pipeline). Everything here is
// self-contained: inline styles + an inline <style> for the animation. Still
// on-brand: black background, amber accent.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          background: "#000",
          color: "#fff",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <style>{`
          @keyframes pp-ge-pulse {
            0%, 100% { transform: scale(0.82); opacity: 0.5; }
            50% { transform: scale(1); opacity: 1; }
          }
          @keyframes pp-ge-spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) {
            .pp-ge-block, .pp-ge-ring { animation: none !important; }
          }
        `}</style>

        {/* Animated emblem: a spinning amber ring with a pulsing pixel core */}
        <div style={{ position: "relative", width: 96, height: 96 }}>
          <div
            className="pp-ge-ring"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.12)",
              borderTopColor: "#fbbf24",
              animation: "pp-ge-spin 1.1s linear infinite",
            }}
          />
          <div
            className="pp-ge-block"
            style={{
              position: "absolute",
              inset: 30,
              borderRadius: 8,
              background: "#fbbf24",
              animation: "pp-ge-pulse 1.8s ease-in-out infinite",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ maxWidth: 460, margin: 0, color: "rgba(255,255,255,0.55)" }}>
            Pixel Parents hit an unexpected error. Try reloading — if it keeps
            happening, please let us know.
          </p>
        </div>

        <button
          type="button"
          onClick={() => reset()}
          style={{
            borderRadius: 999,
            background: "#fbbf24",
            color: "#000",
            border: "none",
            padding: "0.65rem 1.5rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload
        </button>

        {error?.digest && (
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.3)",
              margin: 0,
            }}
          >
            Reference: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
