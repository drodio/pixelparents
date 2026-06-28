import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { searchLeaderboard, parseLeaderboardFilter } from "@/lib/leaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/members/search?q=<name> — typeahead for @-mentioning a Festival
// member in the email composer body. Returns display name + site-relative profile
// href so the editor can insert a hyperlink to their profile. Any event admin
// (manage_events) — the composer is already behind that gate.
export async function GET(req: Request) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ members: [] });

  let rows;
  try {
    rows = await searchLeaderboard(parseLeaderboardFilter(new URLSearchParams()), q);
  } catch {
    return NextResponse.json({ members: [] });
  }

  const members = rows
    .slice(0, 8)
    .map((r) => ({ name: (r.nickname?.trim() || r.fullName || "").trim(), href: r.profileHref }))
    .filter((m) => m.name && m.href);
  return NextResponse.json({ members });
}
