import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computePercentile, ordinal } from "@/lib/leaderboard";
import { isUuid } from "@/lib/canonicalize";

// Dynamic Open Graph image for /profile?e=<id> links. Renders a 1200×630 PNG
// showing the subject's name, combined Festival Score + percentile, and their
// founder/investor scores in the footer. Used
// by the per-page `generateMetadata` to produce link previews in WhatsApp,
// iMessage, Slack, Twitter, etc.
//
// Crawlers can't run JavaScript — this runs server-side and returns a real
// PNG bitmap composed via JSX (via Vercel's satori-based ImageResponse).

export const runtime = "nodejs"; // needs DB access; edge can't reach Neon HTTP driver.

const WIDTH = 1200;
const HEIGHT = 630;

async function getSiteOrigin(req: NextRequest): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = req.headers.get("host");
  if (host) return `${req.nextUrl.protocol}//${host}`;
  return "https://festival.so";
}

function fallback(message: string): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#151515",
          color: "#dfa43a",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 64,
          fontFamily: "sans-serif",
        }}
      >
        {message}
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("e");
  if (!id || !isUuid(id)) return fallback("Founder Festival");

  const [row] = await db.select().from(evaluations).where(eq(evaluations.id, id)).limit(1);
  if (!row) return fallback("Founder Festival");

  // The hero number is the combined Festival Score; founder + investor scores
  // ride along in the footer.
  const combined = row.score;
  const founderScore = row.founderScore;
  const investorScore = row.investorScore;

  const profileFullName = (row.profile as { fullName?: string } | null)?.fullName;
  const fullName =
    (row.fullName && row.fullName.trim()) ||
    (profileFullName && profileFullName.trim()) ||
    "Festival Member";

  const { percentile } = await computePercentile(combined, "combined");
  const percentileText = `${ordinal(percentile)} percentile`;

  const origin = await getSiteOrigin(req);
  const logoUrl = `${origin}/images/founder-festival-logo.png`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#151515",
          color: "#f4f4f5",
          padding: "60px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img
            src={logoUrl}
            width={92}
            height={82}
            alt=""
            style={{ objectFit: "contain" }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 700,
              color: "#dfa43a",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Founder Festival
          </div>
        </div>

        {/* Body — name + score */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-start",
            marginTop: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 72,
              color: "#dfa43a",
              fontWeight: 800,
            }}
          >
            {fullName}&apos;s
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              color: "#e4e4e7",
              fontWeight: 500,
              marginTop: 18,
            }}
          >
            Festival Score
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 28, marginTop: 24 }}>
            <div
              style={{
                fontSize: 260,
                fontWeight: 800,
                lineHeight: 0.9,
                color: "#fff",
              }}
            >
              {combined.toLocaleString("en-US")}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 48,
                color: "#a1a1aa",
                paddingBottom: 24,
              }}
            >
              {percentileText}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 28,
            color: "#71717a",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex" }}>festival.so</div>
          <div style={{ display: "flex", gap: 32 }}>
            <div style={{ display: "flex" }}>Founder: {founderScore.toLocaleString("en-US")}</div>
            <div style={{ display: "flex" }}>Investor: {investorScore.toLocaleString("en-US")}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      // Let social crawlers cache for 1h; on Re-Score the eval id usually
      // stays the same so the image stays current.
      headers: { "cache-control": "public, max-age=3600, s-maxage=3600" },
    },
  );
}
