"use client";

import { useState, useTransition } from "react";
import { SHARE_VISIBILITY, type ShareVisibility } from "@/lib/share";
import { setShareVisibility, setShareVisibilityByToken } from "@/lib/share-actions";

// A "Privacy: [OHS Families | Just me]" segmented slider.
// - editable (owner): clicking a segment changes it live.
// - read-only (signed-in non-owner): shows all segments with the active one lit.
// - signed-out: no segments are shown — with no publicly-viewable tier, a
//   signed-out visitor can never be looking at a share page.
export function VisibilityControl({
  id,
  mode,
  value,
  editable,
  loggedIn,
}: {
  id: string; // token (mode="token") or signupId (mode="signup")
  mode: "token" | "signup";
  value: ShareVisibility;
  editable: boolean;
  loggedIn: boolean;
}) {
  const [v, setV] = useState<ShareVisibility>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // No publicly-viewable tier remains, so a signed-out visitor sees no segments.
  const options = loggedIn ? SHARE_VISIBILITY : [];

  function choose(next: ShareVisibility) {
    if (!editable || next === v || pending) return;
    const prev = v;
    setV(next); // optimistic
    start(async () => {
      const r =
        mode === "token"
          ? await setShareVisibilityByToken(id, next)
          : await setShareVisibility(id, next);
      if (r.error) {
        setError(r.error);
        setV(prev); // revert
      } else {
        setError(null);
        setV(r.visibility);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
          Privacy
        </span>
        <div className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-0.5 text-xs">
          {options.map((o) => {
            const active = o.value === v;
            return (
              <button
                key={o.value}
                type="button"
                disabled={!editable || pending}
                onClick={() => choose(o.value)}
                aria-pressed={active}
                title={editable ? `Set to "${o.label}"` : o.label}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  active ? "bg-amber-400 text-black" : "text-white/55"
                } ${editable ? "hover:text-white disabled:opacity-100" : "cursor-default"}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
