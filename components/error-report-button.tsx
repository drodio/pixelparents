"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

// One-tap "Report this bug" button + confirmation dialog for the error screens.
//
// This deliberately depends on NOTHING external: no app providers, no Clerk, no
// server action, no shared UI kit, no globals.css. It must render inside the
// bare app/global-error.tsx tree (which replaces the root layout and therefore
// has none of those). So: plain fetch to /api/report-error, inline styles for a
// self-contained on-theme (black/amber) look, and hand-rolled accessibility
// (labelled dialog, Escape to close, focus moved into the dialog and restored on
// close). The endpoint is best-effort and never throws back, so the UX only ever
// moves forward: idle → confirming → sending → done.

type Phase = "idle" | "confirming" | "sending" | "done";

const AMBER = "#fbbf24";
const AMBER_HOVER = "#fcd34d";

export function ErrorReportButton({
  error,
}: {
  error?: (Error & { digest?: string }) | null;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const sendBtnRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const open = useCallback(() => setPhase("confirming"), []);
  const close = useCallback(() => {
    setPhase("idle");
    // Restore focus to the button that opened the dialog.
    openerRef.current?.focus();
  }, []);

  const send = useCallback(async () => {
    setPhase("sending");
    try {
      await fetch("/api/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: typeof window !== "undefined" ? window.location.href : "",
          message: error?.message ?? "",
          digest: error?.digest ?? "",
        }),
      });
    } catch {
      // Best-effort: the endpoint never reports failure, and we don't want to
      // dead-end the user on an already-broken page. Show the thank-you either
      // way — the important signal (they tried to tell us) is captured.
    }
    setPhase("done");
  }, [error]);

  // Escape closes the confirmation dialog; move focus to the primary action
  // when it opens so keyboard users land inside the dialog.
  useEffect(() => {
    if (phase !== "confirming") return;
    sendBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, close]);

  // Rudimentary focus containment: keep Tab within the dialog while it's open.
  const onDialogKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>("button");
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (phase === "done") {
    return (
      <p
        role="status"
        style={{
          margin: 0,
          fontSize: "0.875rem",
          fontWeight: 600,
          color: AMBER,
        }}
      >
        Thanks — reported.
      </p>
    );
  }

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={open}
        style={{
          borderRadius: 999,
          background: "transparent",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.2)",
          padding: "0.65rem 1.5rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        Report this bug to the team
      </button>

      {(phase === "confirming" || phase === "sending") && (
        <div
          // Backdrop
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            background: "rgba(0,0,0,0.7)",
          }}
          onClick={(e) => {
            // Click on the backdrop (not the dialog) cancels.
            if (e.target === e.currentTarget && phase === "confirming") close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            onKeyDown={onDialogKeyDown}
            style={{
              maxWidth: 420,
              width: "100%",
              boxSizing: "border-box",
              background: "#0a0a0a",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 16,
              padding: "1.5rem",
              textAlign: "left",
              color: "#fff",
              fontFamily: "inherit",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            <h2
              id={titleId}
              style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 600 }}
            >
              Report this bug?
            </h2>
            <p
              id={descId}
              style={{
                margin: "0 0 1.25rem",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              This will share the page URL, basic error info, and your account
              with the site&rsquo;s administrators.
            </p>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={close}
                disabled={phase === "sending"}
                style={{
                  borderRadius: 999,
                  background: "transparent",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.2)",
                  padding: "0.55rem 1.25rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: phase === "sending" ? "default" : "pointer",
                  opacity: phase === "sending" ? 0.5 : 1,
                  fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                ref={sendBtnRef}
                type="button"
                onClick={send}
                disabled={phase === "sending"}
                style={{
                  borderRadius: 999,
                  background: AMBER,
                  color: "#000",
                  border: "none",
                  padding: "0.55rem 1.25rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: phase === "sending" ? "default" : "pointer",
                  opacity: phase === "sending" ? 0.7 : 1,
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (phase !== "sending") e.currentTarget.style.background = AMBER_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = AMBER;
                }}
              >
                {phase === "sending" ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ErrorReportButton;
