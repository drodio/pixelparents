"use client";

import { useCallback, useEffect, useState } from "react";
import { IconX } from "@/components/icons";
import { HelpMenu } from "@/components/help-menu";
import { FaqDialog } from "@/components/faq-dialog";
import { GithubDialog } from "@/components/github-dialog";
import { FeedbackComposer } from "@/components/feedback-widget";
import { startWalkthrough, MIN_WALKTHROUGH_WIDTH } from "@/components/walkthrough-tour";

type Overlay = null | "menu" | "faq" | "github" | "feedback";

// The floating "?" HELP button, fixed bottom-right on every authed page. Sits
// above the mobile bottom tab bar and is safe-area aware. Clicking toggles a
// stacked-strip help menu; the strips fan out to the walkthrough, FAQ, legal
// pages, changelog, feedback composer, and the GitHub/community dialog.
export function HelpButton() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  // The guided walkthrough only works on the md+ desktop layout (its spotlight
  // targets live in the `hidden md:flex` sidebar). Track viewport width so the
  // menu can hide the entry on mobile / narrow windows. Starts false so SSR and
  // first paint never flash the option before the client resolves the width.
  const [canWalkthrough, setCanWalkthrough] = useState(false);

  const close = useCallback(() => setOverlay(null), []);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MIN_WALKTHROUGH_WIDTH}px)`);
    const sync = () => setCanWalkthrough(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Escape closes whatever's open (menu or a sub-dialog).
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, close]);

  return (
    <>
      {/* The floating trigger. z below the walkthrough overlay (z-100) so the tour
          can cover it, but above page content + the mobile tab bar (z-30). The
          bottom offset clears the mobile bottom bar (~4rem) + the home-indicator
          inset; on md+ there's no bottom bar so it sits at the corner. */}
      <button
        type="button"
        onClick={() => setOverlay((o) => (o === "menu" ? null : "menu"))}
        aria-haspopup="dialog"
        aria-expanded={overlay === "menu"}
        aria-label="Help"
        className="fixed right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-amber-400 text-black shadow-lg shadow-black/40 transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 4.75rem)",
        }}
        data-help-button
      >
        {overlay === "menu" ? (
          <IconX className="h-5 w-5" />
        ) : (
          <span className="text-xl font-bold leading-none">?</span>
        )}
      </button>

      {/* On md+ there's no bottom tab bar — pull the button down to the corner via
          a style override in a media query is awkward inline, so we nudge with a
          class-based bottom on larger screens. */}
      <style>{`@media (min-width: 768px){[data-help-button]{bottom:1.25rem !important;}}`}</style>

      {/* The help menu popover (anchored above the button). */}
      {overlay === "menu" && (
        <>
          <button
            type="button"
            aria-label="Close help menu"
            onClick={close}
            className="fixed inset-0 z-40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Help menu"
            className="fixed right-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-zinc-900 p-3 shadow-2xl"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 8.5rem)" }}
            data-help-menu
          >
            <style>{`@media (min-width: 768px){[data-help-menu]{bottom:5rem !important;}}`}</style>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-white">Help &amp; resources</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>
            <HelpMenu
              onBeginWalkthrough={() => {
                close();
                startWalkthrough();
              }}
              onOpenFaq={() => setOverlay("faq")}
              onOpenFeedback={() => setOverlay("feedback")}
              onOpenGithub={() => setOverlay("github")}
              onNavigate={close}
              canWalkthrough={canWalkthrough}
            />
          </div>
        </>
      )}

      {overlay === "faq" && <FaqDialog onClose={close} />}
      {overlay === "github" && <GithubDialog onClose={close} />}

      {overlay === "feedback" && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Send feedback"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Send feedback</h2>
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
        </div>
      )}
    </>
  );
}
