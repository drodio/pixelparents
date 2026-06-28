import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { getExaClient } from "@/lib/exa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/icon-search?q=<name> — candidate logo images for the admin
// IconPicker (Hosts/Sponsors). Uses Exa: query "<q> logo" and collect each
// result's representative image (and favicon as a secondary candidate). These
// are page-preview images, so quality is mixed — the admin picks the good one.
export async function GET(req: Request) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ images: [] });

  try {
    const exa = getExaClient();
    const result = (await exa.search(`${q} logo`, {
      type: "auto",
      numResults: 15,
    })) as unknown as {
      results?: Array<{ image?: string; favicon?: string }>;
    };

    const seen = new Set<string>();
    const images: string[] = [];
    const push = (u?: string) => {
      if (u && /^https?:\/\//i.test(u) && !seen.has(u)) {
        seen.add(u);
        images.push(u);
      }
    };
    // Representative images first (usually larger), then favicons as a fallback.
    for (const r of result.results ?? []) push(r.image);
    for (const r of result.results ?? []) push(r.favicon);

    return NextResponse.json({ images: images.slice(0, 12) });
  } catch (e) {
    console.error("[icon-search] failed:", (e as Error).message);
    return NextResponse.json({ error: "search failed" }, { status: 502 });
  }
}
