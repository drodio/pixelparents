// GET /api/admin/profiles/list?cursor=<updatedAtIso>|<id>
//
// Keyset-paginated page of scored profiles for the /admin/profiles infinite
// scroll. Mirrors the page's auth + "theirs"-scope. Returns the next page of
// already-serialized ProfileTableRow plus the cursor for the page after it
// (null when exhausted).

import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import { can, getViewerScopes, getViewerEmail, getViewerCostMultiplier } from "@/lib/grants";
import { listScoredProfilesPage, type ProfilesCursor } from "@/lib/profiles-scored";
import { buildProfileTableRows } from "@/lib/admin-profiles-rows";

export const dynamic = "force-dynamic";

const PAGE = 100;

export async function GET(req: Request) {
  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await can("view_profiles"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Same RBAC scope as the page: a "theirs"-scoped role only sees its own jobs'
  // profiles. null email while scoped → "" (matches nothing).
  const scopes = await getViewerScopes();
  const ownerEmail = scopes.users === "theirs" ? (await getViewerEmail()) ?? "" : null;

  const raw = new URL(req.url).searchParams.get("cursor");
  let cursor: ProfilesCursor | null = null;
  if (raw) {
    const sep = raw.lastIndexOf("|");
    if (sep > 0) {
      const updatedAtIso = raw.slice(0, sep);
      const id = raw.slice(sep + 1);
      if (updatedAtIso && id) cursor = { updatedAtIso, id };
    }
  }

  const profiles = await listScoredProfilesPage(cursor, PAGE, ownerEmail);
  const rows = await buildProfileTableRows(profiles, await getViewerCostMultiplier());
  const last = profiles[profiles.length - 1];
  const nextCursor =
    profiles.length === PAGE && last ? `${last.updatedAt.toISOString()}|${last.id}` : null;

  return NextResponse.json({ rows, nextCursor });
}
