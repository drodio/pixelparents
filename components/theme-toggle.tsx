"use client";

import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "@/components/icons";

// Light / dark toggle.
//
// Exists because parents told us plainly they couldn't read the dark UI ("they're
// old ppl and cant see with the dark mode"). That's an accessibility report, not
// a taste preference, so the control is a visible button rather than something
// buried in settings.
//
// Two states, not three. A "system" option sounds thorough but adds a mode whose
// effect isn't visible from the control itself, and the person who needs this
// most is the least likely to reason about what "system" resolved to. The stored
// value still starts unset, so the OS preference decides the FIRST paint (see the
// no-flash script in the layout) — after that, the member's explicit choice wins.

export type Theme = "light" | "dark";

export const THEME_KEY = "gopixel-theme";

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // Private browsing / storage disabled. The theme still applies for this
    // page; it just won't be remembered. Not worth failing over.
  }
}

// The <html data-theme> attribute is the source of truth — it's set before paint
// by the inline script in the layout, so reading it is how the button learns the
// real theme without duplicating that logic or guessing.
//
// useSyncExternalStore rather than useState + useEffect: the attribute is
// external state that React doesn't own, and subscribing means the button also
// stays correct if the theme is changed by anything other than this button (a
// second toggle, another tab, devtools).
function subscribe(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

const getSnapshot = (): Theme =>
  document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

// Server render assumes dark, matching the attribute in the layout, so the first
// client render agrees with the HTML and hydration stays quiet. The inline script
// has already corrected the real DOM by then.
const getServerSnapshot = (): Theme => "dark";

export function ThemeToggle({
  className = "",
  variant = "pill",
}: {
  className?: string;
  // "pill": bordered button with a label (public landing). "icon": compact
  // icon-only button — V2 round 2 asked for the sidebar control to be tucked
  // into the account row rather than a full-width pill, and for an icon rather
  // than an emoji. Both render the same SVG glyphs.
  variant?: "pill" | "icon";
}) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next: Theme = theme === "light" ? "dark" : "light";
  // aria-hidden on the glyph: the button already has an accessible label, and a
  // screen reader announcing "sun" adds nothing.
  const glyph =
    theme === "light" ? (
      <IconMoon aria-hidden className="h-4 w-4" />
    ) : (
      <IconSun aria-hidden className="h-4 w-4" />
    );

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => applyTheme(next)}
        aria-label={`Switch to ${next} mode`}
        title={`Switch to ${next} mode`}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white ${className}`}
      >
        {glyph}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 ${className}`}
    >
      {glyph}
      <span>{theme === "light" ? "Dark" : "Light"}</span>
    </button>
  );
}
