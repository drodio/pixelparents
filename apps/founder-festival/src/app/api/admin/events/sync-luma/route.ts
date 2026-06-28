import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdmin } from "@/lib/admin";
import { syncLumaEvents } from "@/lib/luma-sync";
import { syncEventAttendees } from "@/lib/event-attendees-sync";
import { enqueueAttendeeScoring } from "@/lib/attendee-scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/admin/events/sync-luma — admin-only. Pulls every event off the
// Founder Festival Luma calendar and upserts them into the events table, then
// pulls each Luma event's guest list into event_attendees (matched to profiles
// by email or LinkedIn URL). After the data sync, attendees with a captured
// linkedin_url but no matched profile are enqueued for auto-scoring (credit
// hold via holdCreditsForJob — privileged users are exempt).
export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const { synced } = await syncLumaEvents();
    const { attendees, matched, toScoreLinkedinUrls } = await syncEventAttendees();

    // Use only the URLs seen during this sync's live Luma guest loop — exactly
    // the same basis as the preview modal's count. Deduplication happens inside
    // enqueueAttendeeScoring.
    const urls = toScoreLinkedinUrls;

    let scored = 0;
    let jobId: string | null = null;
    if (urls.length > 0) {
      const user = await currentUser();
      const createdByEmail =
        user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "America/Los_Angeles",
      });
      const res = await enqueueAttendeeScoring(urls, {
        clerkUserId: user?.id ?? null,
        createdByEmail,
        title: `Auto-score Luma registrants — ${today}`,
      });
      if (res.kind === "insufficient") {
        return NextResponse.json(
          {
            ok: true,
            synced,
            attendees,
            matched,
            scored: 0,
            error: "insufficient_credits",
            balanceCents: res.balanceCents,
            neededCents: res.neededCents,
            topupUrl: "/admin/credits",
          },
          { status: 402 },
        );
      }
      if (res.kind === "ok") {
        scored = res.count;
        jobId = res.jobId;
      }
    }

    return NextResponse.json({ ok: true, synced, attendees, matched, scored, jobId });
  } catch (err) {
    console.error("[sync-luma] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 502 },
    );
  }
}
