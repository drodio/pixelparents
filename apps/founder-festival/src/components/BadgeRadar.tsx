import type { RadarVector } from "@/lib/credibility";
import { radarRing, radarShape, radarVertex } from "@/lib/event-badges";

// Static, print-only mini spider chart for event badges. A stripped-down,
// non-interactive cousin of CredibilityRadar: faint grid + dashed median ring
// in black, the person's polygon in RED. The red prints on the red channel of
// the QL-800's two-color DK-2251 label. No axis labels — illegible at badge
// scale; the shape is the at-a-glance signal.

// A pure, bright red that the Brother QL-800 + DK-2251 maps to its red ink.
const RED = "#e2231a";
const GRID = "#c8c8c8";

export function BadgeRadar({ vectors, size = 120 }: { vectors: RadarVector[]; size?: number }) {
  const n = vectors.length;
  if (n < 3) return null; // a polygon needs >=3 axes
  const cx = 60;
  const cy = 60;
  const R = 50;
  const fracs = vectors.map((v) => Math.max(0, Math.min(100, v.score)) / 100);

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="Credibility radar"
      style={{ display: "block" }}
    >
      {/* outer + median grid */}
      <polygon points={radarRing(n, 1, R, cx, cy)} fill="none" stroke={GRID} strokeWidth={1} />
      <polygon
        points={radarRing(n, 0.5, R, cx, cy)}
        fill="none"
        stroke={GRID}
        strokeWidth={0.75}
        strokeDasharray="3 2"
      />
      {/* spokes */}
      {vectors.map((_, i) => {
        const [x, y] = radarVertex(1, i, n, R, cx, cy);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth={0.5} />;
      })}
      {/* this person, in red */}
      <polygon points={radarShape(fracs, R, cx, cy)} fill={RED} fillOpacity={0.25} stroke={RED} strokeWidth={2} />
      {vectors.map((v, i) => {
        const [x, y] = radarVertex(fracs[i], i, n, R, cx, cy);
        return <circle key={v.key} cx={x} cy={y} r={2} fill={RED} />;
      })}
    </svg>
  );
}
