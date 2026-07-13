import { ImageResponse } from "next/og";
import { getStats } from "@/lib/db/aggregates";

// Shared renderer for the dynamic social card, used by BOTH app/opengraph-image.tsx
// and app/twitter-image.tsx. Each of those route files declares its OWN route
// segment config (runtime/dynamic/revalidate/alt/size/contentType) as literals —
// Next's metadata-route analyzer can't trace those through a re-export, which is
// why the shared piece is only the render function, not the config.

const BG = "#0A0A0B";
const AMBER = "#F5B301";
const INK = "#0A0A0B";

// Read the live family count. Must NEVER throw — the card has to render even if
// the DB is down / the tables don't exist yet. On any error we omit the number.
async function liveFamilies(): Promise<number | undefined> {
  try {
    const stats = await getStats();
    const n = stats.total_families;
    return typeof n === "number" && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export async function renderOgCard(): Promise<ImageResponse> {
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
        <div
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: AMBER }}
        />

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
          <div style={{ marginLeft: 28, color: "#FFFFFF", fontSize: 52, fontWeight: 700 }}>
            GoPixel
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
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
          <div style={{ marginTop: 32, color: AMBER, fontSize: 40, fontWeight: 600 }}>
            {liveLine}
          </div>
        </div>

        <div style={{ marginTop: 40, color: AMBER, fontSize: 30, fontWeight: 700 }}>
          gopixel.org
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
