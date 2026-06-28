import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations, scoringJobs, scoringJobItems } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

const jobIds: string[] = [];
const eventIds: string[] = [];

afterEach(async () => {
  // FK scoring_job_items.job_id ON DELETE CASCADE handles the items.
  const jIds = jobIds.splice(0);
  if (jIds.length > 0) {
    await db.delete(scoringJobs).where(inArray(scoringJobs.id, jIds));
  }
  const eIds = eventIds.splice(0);
  if (eIds.length > 0) {
    await db.delete(events).where(inArray(events.id, eIds));
  }
});

// Helper to seed a minimal event + evaluation + attendee + job + job item.
async function seedScenario({
  jobStatus = "running" as string,
  itemStatus = "scoring" as string,
  useEvalId = true,
  completedAt = null as Date | null,
} = {}) {
  const [event] = await db
    .insert(events)
    .values({
      slug: "ss-" + rnd(),
      title: "Scoring Status Test",
      startsAt: new Date("2026-06-01"),
      status: "open",
      criteria: {},
      source: "luma",
    })
    .returning();
  eventIds.push(event!.id);

  const linkedinUrl = "https://linkedin.com/in/ss-" + rnd();
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl,
      fullName: "Scoring Status Person",
      score: 50,
      founderScore: 50,
      investorScore: 0,
      signalQuality: "high",
      source: "url",
    })
    .returning();

  const [attendee] = await db
    .insert(eventAttendees)
    .values({
      eventId: event!.id,
      evaluationId: useEvalId ? ev!.id : null,
      lumaGuestApiId: "gst-" + rnd(),
      name: "Scoring Status Person",
      linkedinUrl,
      approvalStatus: "approved",
      source: "luma",
    })
    .returning();

  const [job] = await db
    .insert(scoringJobs)
    .values({
      model: "test-model",
      status: jobStatus,
      totalItems: 1,
      ...(completedAt ? { completedAt } : {}),
    })
    .returning();
  jobIds.push(job!.id);

  await db.insert(scoringJobItems).values({
    jobId: job!.id,
    inputRaw: "test",
    evaluationId: useEvalId ? ev!.id : null,
    linkedinUrl: useEvalId ? null : linkedinUrl,
    status: itemStatus,
  });

  return { eventId: event!.id, attendeeId: attendee!.id, evaluationId: ev!.id, linkedinUrl };
}

describe.skipIf(IS_PROD_DB)("getAttendeeScoringStatuses", () => {
  it("returns 'scoring' for a matched attendee whose job item status is 'scoring'", async () => {
    const { getAttendeeScoringStatuses } = await import("@/lib/event-attendees-admin");

    const { eventId, attendeeId } = await seedScenario({
      jobStatus: "running",
      itemStatus: "scoring",
    });

    const statuses = await getAttendeeScoringStatuses(eventId);
    expect(statuses[attendeeId]).toBe("scoring");
  });

  it("returns 'complete' when the job item status is 'done'", async () => {
    const { getAttendeeScoringStatuses } = await import("@/lib/event-attendees-admin");

    const { eventId, attendeeId } = await seedScenario({
      jobStatus: "completed",
      itemStatus: "done",
      completedAt: new Date(), // just completed — within 15 min window
    });

    const statuses = await getAttendeeScoringStatuses(eventId);
    expect(statuses[attendeeId]).toBe("complete");
  });

  it("does NOT return a chip when the job completed more than 15 minutes ago", async () => {
    const { getAttendeeScoringStatuses } = await import("@/lib/event-attendees-admin");

    const oldCompletedAt = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
    const { eventId, attendeeId } = await seedScenario({
      jobStatus: "completed",
      itemStatus: "done",
      completedAt: oldCompletedAt,
    });

    const statuses = await getAttendeeScoringStatuses(eventId);
    expect(statuses[attendeeId]).toBeUndefined();
  });

  it("returns 'queued' for an attendee whose item status is 'pending'", async () => {
    const { getAttendeeScoringStatuses } = await import("@/lib/event-attendees-admin");

    const { eventId, attendeeId } = await seedScenario({
      jobStatus: "queued",
      itemStatus: "pending",
    });

    const statuses = await getAttendeeScoringStatuses(eventId);
    expect(statuses[attendeeId]).toBe("queued");
  });

  it("returns 'failed' for an attendee whose item status is 'failed'", async () => {
    const { getAttendeeScoringStatuses } = await import("@/lib/event-attendees-admin");

    const { eventId, attendeeId } = await seedScenario({
      jobStatus: "running",
      itemStatus: "failed",
    });

    const statuses = await getAttendeeScoringStatuses(eventId);
    expect(statuses[attendeeId]).toBe("failed");
  });

  it("returns an empty object when the event has no attendees", async () => {
    const { getAttendeeScoringStatuses } = await import("@/lib/event-attendees-admin");

    const [event] = await db
      .insert(events)
      .values({
        slug: "ss-empty-" + rnd(),
        title: "Scoring Status Empty",
        startsAt: new Date("2026-06-01"),
        status: "open",
        criteria: {},
        source: "luma",
      })
      .returning();
    eventIds.push(event!.id);

    const statuses = await getAttendeeScoringStatuses(event!.id);
    expect(statuses).toEqual({});
  });

  it("matches an unmatched attendee by linkedinUrl when evaluationId is null", async () => {
    const { getAttendeeScoringStatuses } = await import("@/lib/event-attendees-admin");

    const { eventId, attendeeId } = await seedScenario({
      jobStatus: "running",
      itemStatus: "scoring",
      useEvalId: false, // attendee has no evaluationId — match by URL
    });

    const statuses = await getAttendeeScoringStatuses(eventId);
    expect(statuses[attendeeId]).toBe("scoring");
  });
});
