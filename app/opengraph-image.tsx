import { ImageResponse } from "next/og";
import { getStats } from "@/lib/db/aggregates";

// DYNAMIC social card. Rendered by a Route Handler at REQUEST time (not a static
// PNG) so the family count is always current as new families complete signup.
// getStats() returns completed-only counts, matching the landing hero + dashboard.
//
// NOTE: social platforms cache the OG image they scrape, so the freshest number
// only surfaces to a given platform when the link is (re-)shared / re-scraped.

// Node.js runtime — getStats() uses the Neon HTTP driver via @/lib/db.
export const runtime = "nodejs";
// Never cache: recompute from live data on every scrape. force-dynamic matches
// the repo convention for live routes; revalidate = 0 is belt-and-suspenders.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const alt = "Pixel Parents — Parents helping OHS students build what they wish existed.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0A0A0B";
const AMBER = "#F5B301";
const INK = "#0A0A0B";

// Read the live family count. Must NEVER throw — the card has to render even if
// the DB is down / the tables don't exist yet. On any error we fall back to
// undefined and the card simply omits the number.
async function liveFamilies(): Promise<number | undefined> {
  try {
    const stats = await getStats();
    const n = stats.total_families;
    return typeof n === "number" && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export default async function Image() {
  const families = await liveFamilies();
  const liveLine =
    families !== undefined
      ? `Join ${families.toLocaleString("en-US")} families building together.`
      : "Join families building together.";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          padding: "72px 80px",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {/* Top amber accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 10,
            background: AMBER,
          }}
        />

        {/* Logo lockup: rounded amber "P" square + wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 22,
              background: AMBER,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: INK,
              fontSize: 62,
              fontWeight: 800,
            }}
          >
            P
          </div>
          <div
            style={{
              marginLeft: 28,
              color: "#FFFFFF",
              fontSize: 52,
              fontWeight: 700,
            }}
          >
            Pixel Parents
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              color: "#F5F5F5",
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              maxWidth: 1000,
            }}
          >
            Parents helping OHS students build what they wish existed.
          </div>

          {/* Live line — reflects current signups */}
          <div
            style={{
              marginTop: 32,
              color: AMBER,
              fontSize: 40,
              fontWeight: 600,
            }}
          >
            {liveLine}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 40,
            color: AMBER,
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          pixelparents.org
        </div>
      </div>
    ),
    { ...size },
  );
}
