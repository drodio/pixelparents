"use client";

import { useState } from "react";
import { VISIBILITY_OPTIONS, type Visibility } from "@/lib/endorsement-constants";

// Reusable 3-way visibility control: Public | Members Only | Private. Styled to
// match the original recommendations PrivacySlider (bordered segmented control,
// uppercase, selected = filled). `allowed` disables options outside the set
// (used to constrain points visibility to ≤ the endorsement's visibility).
// A hover hint line explains each option.
export function VisibilitySlider({
  value,
  onChange,
  allowed,
  disabled,
  ariaLabel = "Visibility",
}: {
  value: Visibility;
  onChange: (next: Visibility) => void;
  allowed?: Visibility[];
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [hovered, setHovered] = useState<Visibility | null>(null);
  const isAllowed = (v: Visibility) => !allowed || allowed.includes(v);
  const hint = hovered ? VISIBILITY_OPTIONS.find((o) => o.value === hovered)?.hint ?? "" : "";

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="inline-flex border border-zinc-700 rounded-md overflow-hidden text-xs sm:text-[10px] uppercase tracking-[0.15em] font-medium"
      >
        {VISIBILITY_OPTIONS.map((o, i) => {
          const blocked = disabled || !isAllowed(o.value);
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={blocked}
              onClick={() => !blocked && onChange(o.value)}
              onMouseEnter={() => setHovered(o.value)}
              onMouseLeave={() => setHovered(null)}
              title={!isAllowed(o.value) && !disabled ? "Not available at this endorsement visibility" : o.hint}
              className={`px-3 py-2 sm:px-2 sm:py-1 transition-colors ${i > 0 ? "border-l border-zinc-700" : ""} ${
                selected
                  ? "bg-zinc-600 text-zinc-100"
                  : blocked
                    ? "text-zinc-600 cursor-not-allowed"
                    : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <span className="h-3 text-[10px] text-zinc-500">{hint}</span>
    </div>
  );
}
