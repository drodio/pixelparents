"use client";

import { useMemo, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import worldData from "@/lib/data/world-110m.json";
import type { Marker } from "@/lib/community-map";

// A real (Natural-Earth 110m) world map with amber pins. The country paths are
// projected once at module load (the geometry never changes); markers are
// projected per render. Rendered as a client island so pins can animate in
// (staggered drop, largest clusters first) and reveal a hover/tap tooltip
// ("California — N families"). All motion is gated on prefers-reduced-motion.

const W = 800;
const H = 412;

const topo = worldData as unknown as {
  objects: { countries: unknown };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fc = feature(topo as any, topo.objects.countries as any) as any;
const projection = geoEqualEarth().fitExtent(
  [
    [12, 12],
    [W - 12, H - 12],
  ],
  fc,
);
const pathGen = geoPath(projection);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COUNTRY_PATHS: string[] = (fc.features as any[]).map((f) => pathGen(f) ?? "");

type ProjectedMarker = {
  name: string;
  count: number;
  x: number;
  y: number;
  r: number;
};

export function WorldMap({ markers, accent = "#fbbf24" }: { markers: Marker[]; accent?: string }) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  // Project once; drop markers that fall outside the projection. Sort largest
  // first so the biggest clusters land first in the staggered drop-in.
  const projected = useMemo<ProjectedMarker[]>(() => {
    const max = Math.max(1, ...markers.map((m) => m.count));
    return markers
      .map((m) => {
        const p = projection([m.lon, m.lat]);
        if (!p) return null;
        const r = 3 + 4 * Math.sqrt(m.count / max);
        return { name: m.name, count: m.count, x: p[0], y: p[1], r };
      })
      .filter((m): m is ProjectedMarker => m !== null)
      .sort((a, b) => b.count - a.count);
  }, [markers]);

  const active = projected.find((m) => m.name === hovered) ?? null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0d]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="World map of where Pixel Parents families are"
      >
        <g>
          {COUNTRY_PATHS.map((d, i) => (
            <path key={i} d={d} fill="#16161c" stroke="#2c2c35" strokeWidth={0.4} />
          ))}
        </g>
        {projected.map((m, i) => {
          const isActive = m.name === hovered;
          // Largest clusters get a slow pulsing glow to draw the eye; the rest
          // sit static. Pulse and drop-in are both disabled under reduced motion.
          const pulse = !reduce && i < 3;
          return (
            <motion.g
              key={m.name}
              initial={reduce ? false : { opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      type: "spring",
                      stiffness: 500,
                      damping: 24,
                      delay: 0.04 * i,
                    }
              }
              style={{ transformOrigin: `${m.x}px ${m.y}px`, cursor: "pointer" }}
              onHoverStart={() => setHovered(m.name)}
              onHoverEnd={() => setHovered((h) => (h === m.name ? null : h))}
              onTap={() => setHovered((h) => (h === m.name ? null : m.name))}
            >
              {/* halo — pulses on the largest clusters */}
              <motion.circle
                cx={m.x}
                cy={m.y}
                r={m.r + 2}
                fill={accent}
                fillOpacity={0.22}
                animate={
                  pulse
                    ? { scale: [1, 1.35, 1], opacity: [0.22, 0.42, 0.22] }
                    : { scale: 1, opacity: 0.22 }
                }
                transition={
                  pulse
                    ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0 }
                }
                style={{ transformOrigin: `${m.x}px ${m.y}px` }}
              />
              <circle
                cx={m.x}
                cy={m.y}
                r={isActive ? m.r + 1 : m.r}
                fill={accent}
                stroke="#0a0a0d"
                strokeWidth={0.7}
              />
            </motion.g>
          );
        })}
      </svg>

      {/* Hover/tap tooltip — positioned over the active pin. High-latitude pins
          (Canada, UK, Norway, Alaska…) sit only ~12px from the top edge, so a
          tooltip rendered ABOVE the pin gets cropped by the wrapper's
          overflow-hidden. When the pin is near the top, flip the tooltip to
          render BELOW the marker instead so its label always stays visible. */}
      <AnimatePresence>
        {active &&
          (() => {
            const flipBelow = active.y < 40;
            return (
              <motion.div
                key={active.name}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.95 }}
                transition={{ duration: 0.14 }}
                className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-[#1d1d21] px-2.5 py-1.5 text-xs shadow-lg shadow-black/40 ${
                  flipBelow ? "" : "-translate-y-full"
                }`}
                style={{
                  left: `${(active.x / W) * 100}%`,
                  top: `${(active.y / H) * 100}%`,
                  // Above: nudge up off the pin. Below: nudge down past its radius.
                  marginTop: flipBelow ? active.r + 8 : -8,
                }}
              >
                <span className="font-semibold text-white">{active.name}</span>
                <span className="text-white/55">
                  {" "}
                  — {active.count.toLocaleString()}{" "}
                  {active.count === 1 ? "family" : "families"}
                </span>
              </motion.div>
            );
          })()}
      </AnimatePresence>
    </div>
  );
}
