import { NextResponse } from "next/server";
import { isAdmin, estimateJobCents } from "@/lib/admin";
import { viewerIsPrivileged } from "@/lib/grants";
import { listLumaEvents, listLumaGuests, linkedinUrlFromGuest } from "@/lib/luma";
import { lumaGuestToAttendeeValues } from "@/lib/event-attendees";
import { matchEvaluationId } from "@/lib/event-attendees-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/admin/events/sync-luma/preview — read-only dry run: how many Luma
// registrants would be NEWLY scored (have a LinkedIn URL + no existing profile)?
// Returns { events, guests, toScore, estimatedCents, willCharge }.
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const lumaEvents = await listLumaEvents();
    const toScore = new Set<string>();
    let guestCount = 0;
    for (const ev of lumaEvents) {
      if (!ev.api_id) continue;
      let guests;
      try {
        guests = await listLumaGuests(ev.api_id);
      } catch {
        continue;
      }
      for (const g of guests) {
        guestCount++;
        const linkedin = linkedinUrlFromGuest(g);
        if (!linkedin) continue;
        const vals = lumaGuestToAttendeeValues(g, { eventId: "", lumaUrl: null });
        const existing = await matchEvaluationId(vals.email, linkedin);
        if (!existing) toScore.add(linkedin);
      }
    }
    const count = toScore.size;
    const estimatedCents = count > 0 ? await estimateJobCents(count, "sonnet") : 0;
    const willCharge = !(await viewerIsPrivileged());
    return NextResponse.json({
      events: lumaEvents.length,
      guests: guestCount,
      toScore: count,
      estimatedCents,
      willCharge,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "preview failed" },
      { status: 502 },
    );
  }
}
