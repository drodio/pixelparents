"use client";

import { useEffect, useRef, useState } from "react";

// Lightweight count-up: animates 0 → value over ~700ms with an ease-out curve.
// No animation libraries — a single rAF loop. Honors prefers-reduced-motion by
// leaving the value at its final position (no animation). The number is
// locale-formatted so it matches the server-rendered fallback exactly.
//
// State is seeded to the final value so SSR + reduced-motion render correctly
// with no synchronous setState in the effect; the rAF loop (async) is the only
// thing that updates state, which keeps React's cascading-render lint happy.
export function CountUp({
  value,
  durationMs = 700,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value <= 0) return; // leave display at the seeded final value

    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    // Kick off from 0 on the next frame (async — not a synchronous effect set).
    frame.current = requestAnimationFrame((ts) => {
      setDisplay(0);
      tick(ts);
    });
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
