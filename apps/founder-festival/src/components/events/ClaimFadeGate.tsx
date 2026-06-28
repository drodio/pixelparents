"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Wraps long recap content (Luma description, learnings) for UNCLAIMED visitors:
// clamps it to ~10 lines, fades the cut-off to the page background, and overlays
// a "Claim your profile" CTA. Only kicks in when the content actually overflows
// the clamp, so short blurbs render normally. The CTA sends visitors to "/" to
// score/claim — the same fallback the Events nav uses for no-profile visitors.
//
// Render this only for unclaimed viewers; claimed viewers should get the raw
// children with no clamp.

const MAX_HEIGHT_PX = 256; // ~10–11 lines at leading-relaxed

export function ClaimFadeGate({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // "pending" keeps it clamped pre-measure (no flash of full content); after
  // measuring we settle to "clamp" (overflows → fade+CTA) or "full" (fits).
  const [state, setState] = useState<"pending" | "clamp" | "full">("pending");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setState(el.scrollHeight > MAX_HEIGHT_PX + 8 ? "clamp" : "full");
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clamped = state !== "full";

  return (
    <div className="relative">
      <div ref={ref} className={clamped ? "overflow-hidden" : ""} style={clamped ? { maxHeight: MAX_HEIGHT_PX } : undefined}>
        {children}
      </div>
      {state === "clamp" && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#151515]" />
          <div className="absolute inset-x-0 bottom-0 flex justify-center">
            <a
              href="/?find=1"
              className="rounded-md bg-[#dfa43a] px-6 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Become a Festival member to read more
            </a>
          </div>
        </>
      )}
    </div>
  );
}
