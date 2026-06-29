import { getStats } from "@/lib/db/aggregates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/badge.svg — an embeddable shields-style SVG badge with the live
// family count (a single non-PII headline number, like a README build badge).
// Unauthenticated by design so it can be embedded anywhere.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(): Promise<Response> {
  let n = 0;
  try {
    n = (await getStats()).total_signups ?? 0;
  } catch {
    n = 0;
  }
  const label = "pixel parents";
  const value = `${n} ${n === 1 ? "family" : "families"} building`;
  // Rough text metrics (Verdana 11px ≈ 6.6px/char) + padding.
  const lw = Math.round(label.length * 6.6) + 12;
  const vw = Math.round(value.length * 6.6) + 12;
  const w = lw + vw;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
  <title>${esc(label)}: ${esc(value)}</title>
  <linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#3a3a3a"/>
    <rect x="${lw}" width="${vw}" height="20" fill="#fbbf24"/>
    <rect width="${w}" height="20" fill="url(#g)"/>
  </g>
  <g text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${lw / 2}" y="14" fill="#fff">${esc(label)}</text>
    <text x="${lw + vw / 2}" y="14" fill="#1f1f1f">${esc(value)}</text>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
