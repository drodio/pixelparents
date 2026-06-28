"use client";

import { useState } from "react";
import type { RadarVector } from "@/lib/credibility";

// Founder-credibility radar (FEAT-02), Option A "Classic": a gold percentile
// polygon over a dashed "typical founder" pentagon (the 50th-percentile ring —
// the median is 50 on every axis by construction). Click any vector to drill
// into the raw evidence behind it ("five levels deep").

const GOLD = "#dfa43a";
// Highlight color used wherever a vector is the currently-selected one:
// the SVG axis label, the list-row label, and the drill-down box header.
const GREEN = "#10b981";

// Evidence weight bar: a perceptual (sqrt) fill so a small signal still shows a
// sliver and a big one clearly dominates, WITHOUT exposing the raw point value.
// CAP matches the per-row clamp ceiling in the rubric.
function weightPct(points: number): number {
  const p = Math.max(0, points);
  if (p === 0) return 0;
  return Math.min(100, Math.max(10, Math.round(Math.sqrt(p / 200) * 100)));
}

export function CredibilityRadar({
  vectors,
  peerLabel = "founder",
  stacked = false,
  chartOnly = false,
}: {
  vectors: RadarVector[];
  peerLabel?: string;
  // When true, the chart and its legend/value list stack vertically instead of
  // sitting side-by-side. Use in narrow containers (e.g. the two-up event
  // composition charts), where a side-by-side legend gets crushed and overlaps.
  stacked?: boolean;
  // When true, render ONLY the chart — no per-vector value list and no
  // drill-down evidence panel. Used for the event-page cohort AVERAGES, where
  // "N signals / 0/100" per-vector evidence doesn't apply.
  chartOnly?: boolean;
}) {
  // Default to the highest-scoring vector so the page loads with the
  // strongest signal already drilled into (no extra click required).
  // Falls back to null if vectors is empty.
  const initialKey = vectors.length > 0
    ? vectors.reduce<RadarVector>((a, b) => (b.score > a.score ? b : a), vectors[0]!).key
    : null;
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const selected = vectors.find((v) => v.key === selectedKey) ?? null;

  const n = vectors.length;
  const cx = 190;
  const cy = 140;
  const R = 95;

  const polar = (r: number, i: number): [number, number] => {
    const a = ((i * 360) / n - 90) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ring = (frac: number) => vectors.map((_, i) => polar(frac * R, i).join(",")).join(" ");
  const shape = (pick: (v: RadarVector) => number) =>
    vectors.map((v, i) => polar((pick(v) / 100) * R, i).join(",")).join(" ");

  // When a vector is selected, render the "this founder" polygon with a
  // radial gradient centered on the active vertex: green at that vertex,
  // fading to gold by radius R (so adjacent axes are warmer, opposite axes
  // stay gold). When nothing is selected, fall back to solid gold.
  const activeIdx = selected ? vectors.findIndex((v) => v.key === selectedKey) : -1;
  const activeVertex: [number, number] | null =
    activeIdx >= 0 ? polar((vectors[activeIdx].score / 100) * R, activeIdx) : null;
  const polyFillStroke = activeVertex ? "url(#radar-fade)" : GOLD;

  return (
    <div className="flex flex-col gap-4">
      <div className={`flex gap-6 ${stacked ? "flex-col" : "flex-col sm:flex-row sm:items-center"}`}>
        <svg viewBox="0 0 380 300" className={`w-full max-w-[380px] ${stacked ? "mx-auto" : "shrink-0"}`} role="img" aria-label="Founder credibility radar">
          {activeVertex && (
            <defs>
              <radialGradient
                id="radar-fade"
                cx={activeVertex[0]}
                cy={activeVertex[1]}
                r={R}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={GREEN} />
                <stop offset="100%" stopColor={GOLD} />
              </radialGradient>
            </defs>
          )}
          {/* faint grid */}
          {[0.25, 0.75, 1].map((f) => (
            <polygon key={f} points={ring(f)} fill="none" stroke="#2f2f2f" strokeWidth={1} />
          ))}
          {/* spokes */}
          {vectors.map((_, i) => {
            const [x, y] = polar(R, i);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#262626" strokeWidth={1} />;
          })}
          {/* "typical founder" median ring (50th pct) — dashed */}
          <polygon points={ring(0.5)} fill="none" stroke="#8a8a8a" strokeWidth={1.5} strokeDasharray="4 3" />
          {/* this founder */}
          <polygon points={shape((v) => v.score)} fill={polyFillStroke} fillOpacity={0.22} stroke={polyFillStroke} strokeWidth={2} />
          {/* vertices + clickable axis labels */}
          {vectors.map((v, i) => {
            const [vx, vy] = polar((v.score / 100) * R, i);
            const [lx, ly] = polar(R + 20, i);
            const anchor = lx < cx - 5 ? "end" : lx > cx + 5 ? "start" : "middle";
            const active = v.key === selectedKey;
            return (
              <g key={v.key} className="cursor-pointer" onClick={() => setSelectedKey(active ? null : v.key)}>
                <circle cx={vx} cy={vy} r={active ? 4.5 : 3} fill={active ? GREEN : GOLD} stroke="#151515" strokeWidth={1} />
                <text
                  x={lx}
                  y={ly}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill={active ? GREEN : "#a1a1aa"}
                  fontWeight={active ? 700 : 400}
                >
                  {v.axisLabel}{" "}
                  <tspan fill={active ? GREEN : GOLD} fontWeight={700}>
                    {v.score}
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>

        {/* legend + clickable vector chips */}
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <div className={`text-xs text-zinc-500 ${chartOnly ? "flex flex-col gap-1" : "flex items-center gap-4"}`}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded-sm" style={{ background: GOLD }} />{" "}
              {chartOnly ? "Event attendee average" : "this founder"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 border-t border-dashed border-zinc-500" /> typical {peerLabel} (50th pct)
            </span>
          </div>
          {!chartOnly && (
          <ul className="flex flex-col divide-y divide-zinc-800/70">
            {vectors.map((v) => {
              const active = v.key === selectedKey;
              return (
                <li key={v.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(active ? null : v.key)}
                    className={`w-full flex items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm cursor-pointer transition-colors ${
                      active ? "bg-zinc-800/60" : "hover:bg-zinc-800/40"
                    }`}
                    style={active ? { color: GREEN } : undefined}
                  >
                    <span className={`flex items-center gap-2 min-w-0 ${
                      active ? "" : "text-zinc-300"
                    }`}>
                      <span className="truncate">{v.label}</span>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-600 shrink-0">
                        {v.evidence.length} {v.evidence.length === 1 ? "signal" : "signals"}
                      </span>
                    </span>
                    <span className="tabular-nums font-semibold shrink-0" style={{ color: active ? GREEN : GOLD }}>
                      {v.score}
                      <span className="text-zinc-600 font-normal">/100</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          )}
        </div>
      </div>

      {/* drill-down evidence panel */}
      {!chartOnly && selected && (
        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold" style={{ color: GREEN }}>
              {selected.label}{" "}
              <span className="text-zinc-500 font-normal">· {selected.score}th percentile</span>
            </h4>
            <button type="button" onClick={() => setSelectedKey(null)} className="text-xs text-zinc-500 hover:text-white">
              close ✕
            </button>
          </div>
          {selected.evidence.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No public signals fed this vector yet. As we add sources (or this founder claims and connects their
              accounts), it will fill in.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {selected.evidence.map((e, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span
                    className="shrink-0 w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden"
                    aria-hidden
                    title="relative weight"
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${weightPct(e.points)}%`, background: GOLD }}
                    />
                  </span>
                  <span className="text-zinc-300">{e.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
