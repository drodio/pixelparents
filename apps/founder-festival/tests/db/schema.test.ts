import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { events, eventApplicants, eventDecisionLog, eventInvites } from "@/db/schema";

describe("events schema", () => {
  it("events table has required columns", () => {
    expect(events).toBeDefined();
    const cols = Object.keys(getTableColumns(events));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "slug", "title", "hostName", "hostEmail", "startsAt", "endsAt",
        "venue", "capacity", "status", "approvalMode", "criteria", "sponsor",
        "description", "createdByEmail", "createdAt", "updatedAt",
      ]),
    );
  });

  it("event_applicants references events and evaluations", () => {
    expect(eventApplicants).toBeDefined();
    const cols = Object.keys(getTableColumns(eventApplicants));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "eventId", "evaluationId", "linkedinUrl", "fullName", "email",
        "needs", "status", "decisionReason", "adminNote", "bypassCodeId",
        "decidedByEmail", "decidedAt", "createdAt", "updatedAt",
      ]),
    );
  });

  it("event_decision_log captures audit trail", () => {
    expect(eventDecisionLog).toBeDefined();
  });

  it("event_invites supports outbound flow", () => {
    expect(eventInvites).toBeDefined();
  });
});
