"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FeedbackComposer } from "@/components/feedback-widget";
import { IconX } from "@/components/icons";

// ---------------------------------------------------------------------------
// Ambient "share feedback" PROMPT.
//
// A small, dismissible, NON-modal pill pinned to the bottom of the authed shell
// that gently invites users to send a note. It reuses the existing
// FeedbackComposer (no new feedback backend) and never nags:
//   - shows at most once per browser session (sessionStorage flag), and
//   - re-surfaces at most ~once a week (localStorage last-dismissed timestamp).
//
// It deliberately carries NO builder/team photos — the product owner excluded
// them. The copy is text-only and humanized ("A real person on our team reads
// every note.").
//
// Positioned to clear BOTH the mobile bottom tab bar and the floating Help (?)
// button: on mobile it's a centered bar sitting above the tab bar (safe-area
// aware) with right padding so it never slides under the Help button; on md+ it
// anchors bottom-LEFT (the Help button lives bottom-right), so the two never
// collide.
// ---------------------------------------------------------------------------

// PURE eligibility logic (no React, no browser globals) so it can be unit-tested
// in a node environment. `FeedbackPromptEnv` is the minimal runtime snapshot the
// decision needs; the component builds it from real storage, tests build it by
// hand. Mirrors the decideInstallPrompt pattern in install-prompt.tsx.
export type FeedbackPromptEnv = {
  /** Wall-clock "now" in ms (Date.now()) — the cadence anchor. */
  now: number;
  /** Last-dismissed / last-sent timestamp in ms, or null if never. */
  lastSeenAt: number | null;
  /** True when the prompt was already shown this browser session. */
  shownThisSession: boolean;
};

// Re-surface cadence: once shown-and-dismissed, stay quiet for ~a week.
export const FEEDBACK_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Decide whether the ambient prompt is eligible to show.
 * PURE: same env in → same answer out. The component layers a short mount delay
 * and "composer open / just sent" checks on top of this; those are ephemeral UI
 * state, not eligibility, so they stay out of here.
 */
export function decideFeedbackPrompt(env: FeedbackPromptEnv): boolean {
  // At most once per browser session.
  if (env.shownThisSession) return false;
  // First time ever → eligible.
  if (env.lastSeenAt === null) return true;
  // Otherwise only after the cooldown has fully elapsed. A lastSeenAt in the
  // future (clock skew / tampering) reads as "recently seen" → stay quiet.
  return env.now - env.lastSeenAt >= FEEDBACK_PROMPT_COOLDOWN_MS;
}

// localStorage: last time the user dismissed or sent from the ambient prompt.
export const FEEDBACK_PROMPT_LAST_SEEN_KEY = "pp-feedback-prompt-last-seen";
// sessionStorage: the prompt already appeared this browser session.
export const FEEDBACK_PROMPT_SESSION_KEY = "pp-feedback-prompt-shown";

function readLastSeen(): number | null {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_PROMPT_LAST_SEEN_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function readShownThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(FEEDBACK_PROMPT_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markShownThisSession(): void {
  try {
    window.sessionStorage.setItem(FEEDBACK_PROMPT_SESSION_KEY, "1");
  } catch {
    /* private mode / storage disabled — the in-memory guard still holds for the
       life of this mount, so we won't re-surface mid-session. */
  }
}

function markLastSeen(now: number): void {
  try {
    window.localStorage.setItem(FEEDBACK_PROMPT_LAST_SEEN_KEY, String(now));
  } catch {
    /* storage disabled — cadence resets next session; acceptable degradation. */
  }
}

export function FeedbackPrompt() {
  // `show` gates the pill; `composerOpen` swaps the pill for the composer popover.
  const [show, setShow] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Decide eligibility once on mount, then reveal after a short, gentle delay so
  // the prompt eases in a beat after the page settles (never competes with the
  // first paint). Marking "shown this session" happens the moment we decide to
  // show, so a route change that remounts us won't surface a second pill.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const eligible = decideFeedbackPrompt({
      now: Date.now(),
      lastSeenAt: readLastSeen(),
      shownThisSession: readShownThisSession(),
    });
    if (!eligible) return;
    markShownThisSession();
    const t = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Persist the cadence anchor and hide. Used by both dismiss (✕) and a
  // successful send, so the prompt won't reappear for a week either way.
  const remember = useCallback(() => {
    markLastSeen(Date.now());
    setShow(false);
    setComposerOpen(false);
  }, []);

  // Escape + click-outside close the composer popover back to the pill (mirrors
  // FeedbackWidget). Only wired while the composer is open.
  useEffect(() => {
    if (!composerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setComposerOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setComposerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(
      () => document.addEventListener("mousedown", onClick),
      0,
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
    };
  }, [composerOpen]);

  if (!show) return null;

  return (
    <div
      ref={containerRef}
      // Bottom-left on md+ (Help button is bottom-right); a centered bar on
      // mobile that sits ABOVE the bottom tab bar (~4rem) + the home-indicator
      // inset, with right padding so it clears the floating Help button.
      className="fixed inset-x-0 z-40 flex justify-center px-4 pr-20 md:inset-x-auto md:bottom-5 md:left-5 md:justify-start md:px-0 md:pr-0"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.75rem)" }}
    >
      {composerOpen ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Send feedback"
          className="w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              Send feedback
            </span>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
          <FeedbackComposer
            sent={sent}
            onSentChange={(v) => {
              setSent(v);
              // A successful send silences the prompt for the cooldown window —
              // we don't ask again from someone who just wrote in.
              if (v) markLastSeen(Date.now());
            }}
            onDone={remember}
          />
        </div>
      ) : (
        <div
          role="region"
          aria-label="Share feedback"
          className="flex max-w-md items-center gap-3 rounded-full border border-white/10 bg-zinc-900/95 py-2 pl-4 pr-2 shadow-xl shadow-black/40 backdrop-blur"
        >
          <p className="min-w-0 text-xs leading-snug text-white/70">
            Enjoying Pixel Parents?{" "}
            <span className="text-white/90">
              A real person on our team reads every note.
            </span>
          </p>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="shrink-0 rounded-full bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          >
            Send feedback
          </button>
          <button
            type="button"
            onClick={remember}
            aria-label="Dismiss feedback prompt"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
