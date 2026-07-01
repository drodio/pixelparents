"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { submitFeedbackAction } from "@/app/(authed)/feedback-actions";
import { MAX_FEEDBACK_MESSAGE } from "@/lib/db/feedback";
import { IconX } from "@/components/icons";

// A speech-bubble glyph for the "Send feedback" affordance. Kept local so the
// widget stays self-contained (matches the app's 24×24 stroke icon language).
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 16.5H9l-4 3.5V16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5Z" />
      <path d="M7 10h10M7 13h6" />
    </svg>
  );
}

// The feedback COMPOSER: the textarea + Send + confirmation. Pure form logic,
// reused by both the sidebar popover (FeedbackWidget) and the help menu's
// feedback sheet. Resolves the current page path at submit time
// (window.location.pathname) so admins know which surface a note is about.
export function FeedbackComposer({ onDone }: { onDone?: () => void }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const pagePath =
        typeof window !== "undefined" ? window.location.pathname : null;
      const res = await submitFeedbackAction({ message, pagePath });
      if (res.ok) {
        setSent(true);
        setMessage("");
      } else {
        setError(res.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
          <svg
            viewBox="0 0 24 24"
            width="1em"
            height="1em"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-5 w-5"
          >
            <path d="M5 12.5 10 17.5 19 6.5" />
          </svg>
        </span>
        <p className="text-sm font-semibold text-white">Thanks — sent!</p>
        <p className="text-xs text-white/55">
          We read every note. We may follow up if we need more detail.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            onDone?.();
          }}
          className="mt-1 rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-xs font-medium text-white/60">
        What&apos;s working, what isn&apos;t, or what you&apos;d love to see?
      </label>
      <textarea
        id={fieldId}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={MAX_FEEDBACK_MESSAGE}
        rows={4}
        autoFocus
        placeholder="Your feedback…"
        className="w-full resize-none rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-amber-400/60 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-white/35">
          {message.length}/{MAX_FEEDBACK_MESSAGE}
        </span>
        <button
          type="submit"
          disabled={pending || message.trim().length < 3}
          className="rounded-full bg-amber-400 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}

// The pinned "Send feedback" ENTRY for the sidebar (directly above the account
// chip) and the mobile More drawer. Renders a compact trigger; clicking opens a
// small popover/sheet with the composer. Escape + outside-click dismiss.
//
// `variant`:
//   - "sidebar": on the desktop rail — icon-only when collapsed (<md), labelled
//     at md+. The popover anchors just above the trigger.
//   - "drawer":  inside the mobile More drawer — always labelled, full-width row;
//     the composer opens as a centered sheet over the drawer.
export function FeedbackWidget({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "drawer";
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Escape-to-close + click-outside dismiss while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    // Defer the click listener a tick so the opening click doesn't immediately
    // close the popover.
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, close]);

  const drawer = variant === "drawer";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-tour="feedback"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Send feedback"
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white ${
          open ? "bg-white/5 text-white" : ""
        }`}
      >
        <ChatIcon className="h-5 w-5 shrink-0" />
        <span className={drawer ? "inline" : "hidden md:inline"}>Send feedback</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Send feedback"
          className={
            drawer
              ? "absolute bottom-full left-0 z-50 mb-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-2xl"
              : "absolute bottom-full left-0 z-50 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-2xl"
          }
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Send feedback</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
          <FeedbackComposer onDone={close} />
        </div>
      )}
    </div>
  );
}
