"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// PURE eligibility + platform detection (no React, no side effects) so it can be
// unit-tested in a node environment. `InstallEnv` is the minimal snapshot of the
// runtime the prompt needs; the component builds it from real browser globals,
// tests build it by hand.
// ---------------------------------------------------------------------------

export type InstallEnv = {
  /** navigator.userAgent */
  userAgent: string;
  /** true when the page is running standalone (already installed) */
  isStandalone: boolean;
  /** true for narrow/touch viewports (the only place we surface the prompt) */
  isMobile: boolean;
  /** localStorage flag — user previously dismissed the prompt */
  dismissed: boolean;
  /** a beforeinstallprompt event was captured (Chromium/Android) */
  hasBeforeInstall: boolean;
};

export type InstallDecision =
  | { show: false }
  | { show: true; platform: "android" }
  | { show: true; platform: "ios" };

/** iOS Safari has no beforeinstallprompt; we detect it to show manual steps. */
export function isIosSafari(userAgent: string): boolean {
  const ua = userAgent || "";
  const isIos = /iPad|iPhone|iPod/.test(ua) || /iPad|Macintosh/.test(ua); // iPadOS reports as Mac
  if (!isIos) return false;
  // Exclude in-app / other browsers that aren't Safari's install-capable shell.
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
  // Must actually be touch-capable iOS (guards the Macintosh/iPad ambiguity).
  const looksTouchIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && isSafari);
  return isSafari && looksTouchIos;
}

/**
 * Decide whether — and in what form — to show the install prompt.
 * PURE: given the same InstallEnv it always returns the same decision.
 */
export function decideInstallPrompt(env: InstallEnv): InstallDecision {
  // Never on desktop, when already installed, or after a prior dismissal.
  if (!env.isMobile) return { show: false };
  if (env.isStandalone) return { show: false };
  if (env.dismissed) return { show: false };

  // Android/Chromium: only once we've captured the native prompt event.
  if (env.hasBeforeInstall) return { show: true, platform: "android" };

  // iOS Safari: no event, so fall back to manual "Add to Home Screen" steps.
  if (isIosSafari(env.userAgent)) return { show: true, platform: "ios" };

  return { show: false };
}

export const INSTALL_DISMISSED_KEY = "pp-install-dismissed";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Minimal shape of the beforeinstallprompt event (not in lib.dom yet).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function detectStandalone(): boolean {
  try {
    const mm = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
    const iosStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return mm || iosStandalone;
  } catch {
    return false;
  }
}

function detectMobile(): boolean {
  try {
    const narrow = window.matchMedia?.("(max-width: 640px)").matches ?? false;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return narrow || coarse;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [decision, setDecision] = useState<InstallDecision>({ show: false });
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Re-evaluate eligibility from the current runtime + captured event.
    const evaluate = (hasBeforeInstall: boolean) => {
      setDecision(
        decideInstallPrompt({
          userAgent: window.navigator.userAgent,
          isStandalone: detectStandalone(),
          isMobile: detectMobile(),
          dismissed: readDismissed(),
          hasBeforeInstall,
        }),
      );
    };

    const onBeforeInstall = (e: Event) => {
      // Stop Chrome's mini-infobar; stash the event so our button can trigger it.
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      setDeferred(evt);
      evaluate(true);
    };

    const onInstalled = () => {
      // Once installed, hide immediately.
      setDeferred(null);
      setDecision({ show: false });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Initial pass (covers iOS Safari, where no event fires).
    evaluate(false);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      /* private mode / storage disabled — just hide for this session */
    }
    setDecision({ show: false });
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user gesture expired or prompt unavailable — no-op */
    }
    setDeferred(null);
    setDecision({ show: false });
  };

  if (!decision.show) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Pixel Parents"
      className="pp-install fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2"
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-amber-400/25 bg-[#0A0A0B]/95 p-3 shadow-xl shadow-black/40 backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            Add Pixel Parents to your home screen
          </p>
          {decision.platform === "ios" ? (
            <p className="mt-0.5 text-xs leading-snug text-white/60">
              Tap the{" "}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
                className="mx-0.5 inline-block h-4 w-4 -translate-y-px align-text-bottom text-sky-300"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3.75m0 0L8.75 7M12 3.75 15.25 7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9.5H6.5A1.5 1.5 0 0 0 5 11v7.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V11a1.5 1.5 0 0 0-1.5-1.5H16" />
              </svg>{" "}
              Share icon, then <span className="text-amber-300">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-snug text-white/60">
              Install the app for a full-screen, one-tap experience.
            </p>
          )}
        </div>

        {decision.platform === "android" && (
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
          >
            Install
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
