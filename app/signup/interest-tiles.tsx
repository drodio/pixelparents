"use client";

import { useEffect, useState } from "react";
import { iconForInterest } from "@/lib/interest-icons";

// --- Voronoi mosaic ---------------------------------------------------------
// Seed points on a jittered grid; each cell is the Voronoi region (convex
// polygon) of its seed. This tiles the plane with NO gaps and produces varied
// shapes — triangles, quads, pentagons, hexagons — that look random/energetic.
const GX = 10;
const GY = 6;
const S = 192;
const W = GX * S;
const H = GY * S;
const JIT = 0.4; // seed wander as a fraction of a cell (more = more energy)

function rnd(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Pt = { x: number; y: number };

// Seeds (deterministic → SSR-safe).
const SITES: { x: number; y: number; gx: number; gy: number }[] = [];
for (let gy = 0; gy < GY; gy++) {
  for (let gx = 0; gx < GX; gx++) {
    const jx = (rnd(gx * 7 + gy * 13, 1) - 0.5) * 2 * JIT * S;
    const jy = (rnd(gx * 5 + gy * 17, 2) - 0.5) * 2 * JIT * S;
    SITES.push({ x: gx * S + S / 2 + jx, y: gy * S + S / 2 + jy, gx, gy });
  }
}

// Clip a polygon to the half-plane of points closer to P than to Q (Sutherland–
// Hodgman against the perpendicular bisector).
function clipHalf(poly: Pt[], P: Pt, Q: Pt): Pt[] {
  const mx = (P.x + Q.x) / 2;
  const my = (P.y + Q.y) / 2;
  const nx = Q.x - P.x;
  const ny = Q.y - P.y;
  const f = (p: Pt) => (p.x - mx) * nx + (p.y - my) * ny; // <= 0 keeps (closer to P)
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i];
    const B = poly[(i + 1) % poly.length];
    const fa = f(A);
    const fb = f(B);
    if (fa <= 0) out.push(A);
    if (fa < 0 !== fb < 0) {
      const t = fa / (fa - fb);
      out.push({ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) });
    }
  }
  return out;
}

// Build every Voronoi cell once.
const CELLS = SITES.map((P, i) => {
  let poly: Pt[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  for (let j = 0; j < SITES.length && poly.length; j++) {
    if (j !== i) poly = clipHalf(poly, P, SITES[j]);
  }
  const d = "M " + poly.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ") + " Z";
  return {
    d,
    x: P.x,
    y: P.y,
    fill: (P.gx + P.gy) % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
  };
});

export default function InterestTiles({
  interests,
  variant = "fade",
}: {
  interests: string[];
  variant?: "fade" | "strip" | "full";
}) {
  const n = interests.length;
  const count = CELLS.length;

  const [idxs, setIdxs] = useState<number[]>(() =>
    Array.from({ length: count }, (_, i) => i % Math.max(1, n)),
  );
  const [nonce, setNonce] = useState<number[]>(() => Array(count).fill(0));

  useEffect(() => {
    if (n === 0) return;
    const id = setInterval(() => {
      const cells = [0, 1].map(() => Math.floor(Math.random() * count));
      const vals = cells.map(() => Math.floor(Math.random() * n));
      setIdxs((prev) => {
        const next = [...prev];
        cells.forEach((cl, i) => (next[cl] = vals[i]));
        return next;
      });
      setNonce((prev) => {
        const next = [...prev];
        cells.forEach((cl) => (next[cl] += 1));
        return next;
      });
    }, 900);
    return () => clearInterval(id);
  }, [count, n]);

  if (n === 0) return null;

  const overlay =
    variant === "strip"
      ? "bg-[linear-gradient(to_bottom,transparent_0px,rgba(0,0,0,0.5)_120px,#000_260px)]"
      : variant === "fade"
        ? "bg-[linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.55)_30%,#000_55%)]"
        : "";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <style>{`
        @keyframes snapIn {
          0%   { opacity: 0; transform: scale(1.3) rotate(6deg); }
          55%  { opacity: 1; }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @media (prefers-reduced-motion: reduce) { [data-jig] { animation: none !important; } }
      `}</style>

      <div
        className="absolute left-1/2 top-0 -translate-x-1/2 opacity-[0.42] grayscale"
        style={{ width: W, height: H }}
      >
        {/* Polygon tiles: filled (checkerboard) with grout lines, zero gaps. */}
        <svg width={W} height={H} className="absolute left-0 top-0">
          {CELLS.map((c, i) => (
            <path
              key={i}
              d={c.d}
              fill={c.fill}
              stroke="rgba(255,255,255,0.32)"
              strokeWidth={1.25}
            />
          ))}
        </svg>

        {/* One interest per tile, centered on its seed, flipping over time. */}
        {CELLS.map((c, i) => {
          const interest = interests[idxs[i] % n];
          const Icon = iconForInterest(interest);
          return (
            <div
              key={i}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 text-center"
              // Explicit px STRINGS, not raw numbers. c.x/c.y come out of the
              // Voronoi clip as long floats (e.g. 611.610851749219). React's
              // server renderer serializes those to a rounded style attribute
              // ("611.611px") while the client keeps full precision, so every
              // tile logged a hydration mismatch on the landing + signup pages.
              // Fixing the precision here makes both sides emit identical CSS.
              style={{ left: `${c.x.toFixed(2)}px`, top: `${c.y.toFixed(2)}px`, width: "134px" }}
            >
              <div
                key={nonce[i]}
                data-jig
                className="flex flex-col items-center justify-center gap-1"
                style={{ animation: nonce[i] ? "snapIn 0.5s ease-out" : undefined }}
              >
                <Icon className="h-7 w-7 text-white/70" strokeWidth={1.5} />
                <span className="text-base font-bold leading-tight text-white/70">
                  {interest}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {overlay && <div className={`absolute inset-0 ${overlay}`} />}
    </div>
  );
}
