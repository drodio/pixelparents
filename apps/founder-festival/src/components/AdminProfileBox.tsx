"use client";

import { Children, Fragment, useSyncExternalStore, type ReactNode } from "react";
import { readMinimized, writeMinimized } from "@/lib/admin-box-state";

// Floating super-admin toolbar on a profile page: "Admin: [Score Detail]
// [Re-Score]", fixed BOTTOM-LEFT. It lives bottom-left because the whole top row
// is already taken — the logo + site nav on the left, the "Admin" link + account
// avatar on the right — so a top-anchored pill overlapped that "Admin" button.
// The × minimizes it to an INVISIBLE bottom-left hotspot (no border/background/
// text/cursor cue) that restores on click — a super-admin knows it's there;
// nobody else sees anything. The minimized choice is a single global preference
// persisted across reloads and every profile.
//
// Presentation-only: the two actions are passed as children (the page hands in
// <ScoreDetailButton/> and an admin-direct <ReScoreButton/>), so this shell
// owns only the chrome + minimize behavior.

// useSyncExternalStore reads localStorage SSR-safely (server snapshot = expanded)
// without setState-in-effect. localStorage writes don't fire a same-tab "storage"
// event, so we keep a local listener set and notify it on write; the window
// "storage" event keeps other tabs in sync.
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function getSnapshot(): boolean {
  return readMinimized(window.localStorage);
}
function getServerSnapshot(): boolean {
  return false; // expanded by default before the client preference is read
}
function setMinimized(next: boolean): void {
  writeMinimized(window.localStorage, next);
  for (const l of listeners) l();
}

export function AdminProfileBox({ children }: { children: ReactNode }) {
  const minimized = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (minimized) {
    return (
      <button
        type="button"
        aria-label="Restore admin tools"
        onClick={() => setMinimized(false)}
        // Invisible, but clickable. No cursor change so there's no hover cue.
        className="fixed bottom-0 left-0 z-50"
        style={{ height: 52, width: 52, background: "transparent", border: "none", cursor: "default" }}
      />
    );
  }

  // Each action is passed as a child; render them inline as hyperlinks separated
  // by a subtle " | " so the pill reads "Admin: Scoring Log | Re-Score | Hide |
  // Delete". Falsy children (e.g. Hide/Delete omitted for non-superadmins) are
  // dropped so there's no dangling separator.
  const items = Children.toArray(children).filter(Boolean);

  return (
    <div className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-lg border border-white/15 bg-black/80 px-3 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
      <span className="font-medium text-white/50">Admin:</span>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="text-white/20" aria-hidden>
              |
            </span>
          )}
          {child}
        </Fragment>
      ))}
      <button
        type="button"
        aria-label="Minimize admin tools"
        onClick={() => setMinimized(true)}
        className="ml-1 text-white/40 hover:text-white transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
