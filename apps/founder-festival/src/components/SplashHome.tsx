"use client";

import { useState } from "react";
import { SplashForm } from "@/components/SplashForm";

// The interactive splash content: logo, tagline, LinkedIn-handle input form.
// Lives in a client component so the parent server page can short-circuit
// signed-in claimed users to their /profile page before this renders.
export function SplashHome() {
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative flex flex-col flex-1 items-center justify-center bg-[#151515] text-zinc-100 px-6 py-12 gap-12 overflow-hidden">
      <a
        href="/developers"
        className="fixed top-3 left-4 z-50 text-sm text-zinc-300 hover:text-white px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-500 bg-zinc-900/70 backdrop-blur-sm"
      >
        Developers
      </a>
      {/* Full-width event-tent photo behind content; shown on LinkedIn input focus,
          fades into the page bg before reaching the text below. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-[60vh] transition-opacity duration-700 ${focused ? "opacity-100" : "opacity-0"}`}
      >
        <img
          src="/images/founder-festival-outside.png"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#151515]/70 to-[#151515]" />
      </div>

      <div className="relative flex flex-col items-center gap-6 text-center max-w-3xl w-full">
        <img
          src="/images/founder-festival-logo.png"
          alt="Founder Festival"
          width={498}
          height={444}
          className={`w-40 sm:w-56 h-auto transition-opacity duration-700 ${focused ? "opacity-0" : "opacity-100"}`}
        />
        <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight">Founder Festival</h1>
        {/* Tagline. Until the user clicks/types in the handle box (or clicks
            the tagline itself), only the first line shows and its right edge
            fades to transparent (the CSS mask). On focus, the full three-line
            tagline expands + the cover image fades in. The tagline is its own
            click target so a curious visitor can reveal the full pitch
            without having to touch the input first. SR users get the full
            text either way. */}
        <p
          // Click-to-reveal is a desktop nicety; on mobile there's no hover
          // affordance so most visitors miss it. We render the full three-line
          // tagline by default on mobile and keep the click-to-reveal mechanic
          // on desktop only.
          role={focused ? undefined : "button"}
          tabIndex={focused ? undefined : 0}
          onClick={focused ? undefined : () => setFocused(true)}
          onKeyDown={
            focused
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFocused(true);
                  }
                }
          }
          className={`text-lg sm:text-xl leading-relaxed max-w-3xl ${focused ? "" : "sm:cursor-pointer"}`}
          style={{
            color: "#dfa43a",
            // Reserve the full 3-line height ALWAYS so the input form below
            // doesn't jump down when lines 2-3 reveal. Line 1 stays put; the
            // empty space below it fades in lines 2-3 on focus.
            minHeight: "5em",
          }}
        >
          Intimate pop-up IRL events
          {/* On mobile: opacity 1 always (`opacity-100`).
              On desktop: opacity is driven by a CSS variable wired to the
              focused state — Tailwind's `sm:opacity-[var(--fade)]` lets the
              breakpoint pick which value applies. */}
          <span
            className="block opacity-100 sm:opacity-[var(--fade)] sm:transition-opacity sm:duration-700"
            style={{ ["--fade" as string]: focused ? 1 : 0 }}
            aria-hidden={!focused}
          >
            for venture-backed founders and investors
            <br />
            to learn faster, foster connection, self-discovery and fun.
          </span>
        </p>
      </div>
      <SplashForm
        onUrlFocus={() => setFocused(true)}
        onUrlBlur={() => setFocused(false)}
      />
    </div>
  );
}
