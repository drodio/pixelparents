"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { IconHome, IconUsers, IconGradCap, IconCode } from "@/components/icons";

// The directory's condensed stat strip. Numbers tick up from 0 on mount (a
// count-up that makes the figures feel alive) and each stat carries an icon so
// the strip reads as a dashboard rather than a spreadsheet. Per the design
// direction the NUMBER is white with an amber icon/accent — amber is reserved
// for interactive/brand, so the saturated amber is only the small icon chip.
// Under prefers-reduced-motion the final value is shown immediately (no count).

type IconType = typeof IconHome;

const ITEMS: { key: string; label: string; Icon: IconType }[] = [
  { key: "families", label: "Families", Icon: IconHome },
  { key: "parents", label: "Parents", Icon: IconUsers },
  { key: "kids", label: "Kids at OHS", Icon: IconGradCap },
  { key: "builders", label: "Here to build", Icon: IconCode },
];

const COUNT_UP_MS = 750;

function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      // easeOutCubic for a quick start that settles gently on the final value.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, enabled]);

  return value;
}

function StatChip({ label, value, Icon, animate }: {
  label: string;
  value: number;
  Icon: IconType;
  animate: boolean;
}) {
  const shown = useCountUp(value, animate);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/25 bg-amber-400/10 text-amber-300">
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </span>
      <div className="flex flex-col">
        <span className="text-xl font-semibold tracking-tight tabular-nums text-white">
          {shown.toLocaleString()}
        </span>
        <span className="text-xs text-white/55">{label}</span>
      </div>
    </div>
  );
}

export function StatStrip({
  families,
  parents,
  kids,
  builders,
}: {
  families: number;
  parents: number;
  kids: number;
  builders: number;
}) {
  const reduce = useReducedMotion();
  const animate = !reduce;
  const values: Record<string, number> = { families, parents, kids, builders };
  return (
    <div className="grid grid-cols-2 gap-3">
      {ITEMS.map((it) => (
        <StatChip
          key={it.key}
          label={it.label}
          value={values[it.key] ?? 0}
          Icon={it.Icon}
          animate={animate}
        />
      ))}
    </div>
  );
}
