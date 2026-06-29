import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldData from "@/lib/data/world-110m.json";
import type { Marker } from "@/lib/community-map";

// A real (Natural-Earth 110m) world map, rendered server-side as dark SVG with
// amber pins. The country paths are projected once at module load (the geometry
// never changes); markers are projected per render.

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

export function WorldMap({ markers, accent = "#fbbf24" }: { markers: Marker[]; accent?: string }) {
  const max = Math.max(1, ...markers.map((m) => m.count));
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0d]">
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
        {markers.map((m) => {
          const p = projection([m.lon, m.lat]);
          if (!p) return null;
          const r = 3 + 4 * Math.sqrt(m.count / max);
          return (
            <g key={m.name}>
              <circle cx={p[0]} cy={p[1]} r={r + 2} fill={accent} fillOpacity={0.22} />
              <circle cx={p[0]} cy={p[1]} r={r} fill={accent} stroke="#0a0a0d" strokeWidth={0.7} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
