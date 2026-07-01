"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  clampStep,
  isFirstStep,
  isLastStep,
  primaryLabel,
} from "@/components/walkthrough-steps";
import { IconX } from "@/components/icons";

// The custom window event the help menu (and anything else) dispatches to kick
// off the tour. Exported so callers import the exact string.
export const START_WALKTHROUGH_EVENT = "pp:start-walkthrough";

// Minimum viewport width (px) at/above which the walkthrough is offered and can
// run. Every spotlight target lives in the md+ desktop sidebar (`hidden md:flex`),
// so below this width the tour has nothing to point at and just skips every step.
// Matches Tailwind's `md` breakpoint — the exact width the sidebar appears at.
export const MIN_WALKTHROUGH_WIDTH = 768;

// Whether the current viewport can actually run the guided tour. SSR-safe:
// returns false on the server (no window); the client re-checks after mount.
export function canRunWalkthrough(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= MIN_WALKTHROUGH_WIDTH;
}

// Fire the tour from anywhere on the client (the help menu's "Begin walkthrough").
// No-ops on mobile / narrow windows where the tour has no targets — belt-and-
// suspenders alongside the help menu hiding the entry below this width.
export function startWalkthrough(): void {
  if (!canRunWalkthrough()) return;
  window.dispatchEvent(new CustomEvent(START_WALKTHROUGH_EVENT));
}

type Rect = { top: number; left: number; width: number; height: number };

// Padding around the spotlighted element (px) so the ring doesn't hug the target.
const PAD = 8;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

// The guided walkthrough overlay. Renders NOTHING until started (via
// startWalkthrough / the custom event), so it's a zero-cost passenger in the
// shell otherwise. On start it navigates to /dashboard, then spotlights each step
// target one at a time. Robust to missing targets (skips them), scrolls the
// target into view, honors prefers-reduced-motion, and persists a completed flag.
export function WalkthroughTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  // Bumped to force a rect recompute (resize / scroll / step change / route settle).
  const [tick, setTick] = useState(0);
  // Resolved once at start; drives whether we animate (blur / smooth-scroll).
  const [noMotion, setNoMotion] = useState(false);

  const finish = useCallback((completed: boolean) => {
    setActive(false);
    setStep(0);
    setRect(null);
    if (completed) {
      try {
        window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
      } catch {
        /* private mode / storage disabled — non-fatal */
      }
    }
  }, []);

  // Listen for the start event. On start: reset to step 0, mark active, and route
  // to /dashboard (the tour's home surface) so every target exists.
  useEffect(() => {
    const onStart = () => {
      // Guard directly-dispatched events too: no targets exist below the desktop
      // breakpoint, so starting the tour there would just skip every step.
      if (!canRunWalkthrough()) return;
      setNoMotion(reducedMotion());
      setStep(0);
      setRect(null);
      setActive(true);
      router.push("/dashboard");
    };
    window.addEventListener(START_WALKTHROUGH_EVENT, onStart);
    return () => window.removeEventListener(START_WALKTHROUGH_EVENT, onStart);
  }, [router]);

  // Escape exits the tour (treated as Skip — not completed).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  // Lock body scroll while the tour is active (we manage scrolling targets into
  // view ourselves) — restore on exit.
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  // Recompute the highlight rect on resize/scroll while active. If the window
  // shrinks below the desktop breakpoint mid-tour, the spotlight targets vanish
  // (they're `hidden md:flex`), so end the tour gracefully rather than spotlight
  // nothing.
  useEffect(() => {
    if (!active) return;
    const bump = () => {
      if (!canRunWalkthrough()) {
        finish(false);
        return;
      }
      setTick((t) => t + 1);
    };
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
    };
  }, [active, finish]);

  // Resolve the current step's target rect. Runs whenever the step, route, or a
  // tick changes. Untargeted steps (intro/outro) → centered card (rect = null).
  // Missing target element → auto-advance past it so a removed control can't wedge
  // the tour. Scrolls the target into view before measuring.
  useEffect(() => {
    if (!active) return;
    const current = TOUR_STEPS[step];
    if (!current) return;

    let cancelled = false;

    if (current.target === null) {
      // Untargeted (intro/outro) → centered card. Clear any prior rect on a
      // microtask so we never call setState synchronously inside the effect body.
      queueMicrotask(() => {
        if (!cancelled) setRect(null);
      });
      return () => {
        cancelled = true;
      };
    }

    const target = current.target;
    // Wait a frame so a just-pushed route (/dashboard) has painted its targets.
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (!el) {
        // Target not present (e.g. still navigating, or control hidden on this
        // viewport) — skip this step gracefully rather than blocking. Deferred to
        // a microtask so we never call setState synchronously inside the effect.
        queueMicrotask(() => {
          if (cancelled) return;
          setStep((s) => {
            const next = clampStep(s + 1);
            // If we're already at the last step and it's missing, just end.
            if (next === s) {
              finish(true);
              return s;
            }
            return next;
          });
        });
        return;
      }
      el.scrollIntoView({
        behavior: noMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
      // Measure after the scroll settles (a short delay for smooth scroll).
      const measure = () => {
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        // A zero-size rect means the target is present but not laid out (e.g. a
        // control hidden on this viewport — the sidebar feedback/account entries
        // are `hidden md:flex` on phones). Treat it like a missing target and skip
        // the step gracefully rather than spotlighting an invisible 0×0 box.
        if (r.width === 0 && r.height === 0) {
          setStep((s) => {
            const next = clampStep(s + 1);
            if (next === s) {
              finish(true);
              return s;
            }
            return next;
          });
          return;
        }
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      };
      if (noMotion) {
        measure();
      } else {
        setTimeout(measure, 220);
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [active, step, pathname, tick, noMotion, finish]);

  if (!active) return null;

  const current = TOUR_STEPS[step];
  if (!current) return null;

  const total = TOUR_STEPS.length;
  const first = isFirstStep(step);
  const last = isLastStep(step, total);

  const advance = () => {
    if (last) {
      finish(true);
    } else {
      setStep((s) => clampStep(s + 1));
    }
  };
  const back = () => setStep((s) => clampStep(s - 1));

  // The spotlight ring: a padded box over the target with a giant outer box-shadow
  // that dims (and optionally blurs) everything else. When there's no target
  // (intro/outro) we dim the whole screen and center the card.
  const spotlight = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label="Guided walkthrough"
    >
      {/* Dimmer. With a target: a transparent spotlight box whose enormous
          box-shadow paints the dim everywhere else (a clean "hole"). Without a
          target: a plain full-screen scrim. Blur is dropped under reduced motion. */}
      {spotlight ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-xl ring-2 ring-amber-400/80 transition-all ${
            noMotion ? "" : "duration-200"
          }`}
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
            backdropFilter: noMotion ? undefined : "blur(1px)",
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-black/72 ${noMotion ? "" : "backdrop-blur-[2px]"}`}
        />
      )}

      {/* Click-catcher so clicks outside the card don't hit the page underneath.
          It sits under the card but over the page. */}
      <button
        type="button"
        aria-label="Skip walkthrough"
        onClick={() => finish(false)}
        className="absolute inset-0 h-full w-full cursor-default"
        tabIndex={-1}
      />

      {/* Instructional card. Anchored near the target when there's room; centered
          for intro/outro (or when a rect isn't resolved yet). */}
      <div
        className="absolute left-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl"
        style={cardPosition(spotlight)}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-white">{current.title}</h2>
          <button
            type="button"
            onClick={() => finish(false)}
            aria-label="Skip walkthrough"
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-white/65">{current.body}</p>

        {/* Progress dots */}
        <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
          {TOUR_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-4 bg-amber-400" : "w-1.5 bg-white/25"
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => finish(false)}
            className="text-xs font-medium text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {!first && (
              <button
                type="button"
                onClick={back}
                className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={advance}
              className="rounded-full bg-amber-400 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-amber-300"
            >
              {primaryLabel(step, total)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Position the instructional card relative to the spotlight: below the target
// when it fits, otherwise above; centered vertically when there's no target.
// Returns inline style (top only — horizontal centering is a CSS transform).
function cardPosition(spot: Rect | null): React.CSSProperties {
  if (typeof window === "undefined" || !spot) {
    return { top: "50%", transform: "translate(-50%, -50%)" };
  }
  const vh = window.innerHeight;
  const CARD_EST = 220; // rough card height for placement decisions
  const below = spot.top + spot.height + 16;
  const fitsBelow = below + CARD_EST < vh;
  if (fitsBelow) {
    return { top: below, transform: "translateX(-50%)" };
  }
  const above = spot.top - 16 - CARD_EST;
  if (above > 8) {
    return { top: Math.max(8, above), transform: "translateX(-50%)" };
  }
  // No room either side — center it.
  return { top: "50%", transform: "translate(-50%, -50%)" };
}
