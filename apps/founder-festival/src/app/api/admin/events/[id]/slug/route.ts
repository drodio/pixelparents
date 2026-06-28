import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { slugifyEvent, isValidEventSlug } from "@/lib/slugify";

export const runtime = "nodejs";

type Body = { slug?: string };

// POST /api/admin/events/:id/slug — change an event's public URL slug
// (/events/<slug>). Normalizes via slugify, enforces the unique index, and
// rejects a collision with a friendly 409 instead of a raw DB error. Mirrors
// the other recap sub-editors.
//
// NOTE: changing the slug breaks any previously shared /events/<old-slug> link
// (there's no slug-history redirect yet) — surfaced to the admin in the editor.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;

  const slug = slugifyEvent((body.slug ?? "").trim());
  if (!slug || !isValidEventSlug(slug)) {
    return NextResponse.json({ error: "Enter a slug using letters, numbers, hyphens, underscores, or plus signs." }, { status: 400 });
  }

  // Uniqueness: anyone else already using this slug?
  const [clash] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.slug, slug), ne(events.id, id)))
    .limit(1);
  if (clash) {
    return NextResponse.json({ error: `"${slug}" is already taken by another event.` }, { status: 409 });
  }

  const [updated] = await db
    .update(events)
    .set({ slug, updatedAt: sql`now()` })
    .where(eq(events.id, id))
    .returning({ id: events.id, slug: events.slug });

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ slug: updated.slug });
}
