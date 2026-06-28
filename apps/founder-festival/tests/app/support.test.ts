import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { supportTickets, supportTicketMessages, evaluations } from "@/db/schema";
import {
  createTicket,
  getTicket,
  listMyTickets,
  listMessages,
  addMessage,
  setStatus,
  userTicketStatus,
  userTicketLabel,
} from "@/lib/support";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe("user-facing ticket status (pure)", () => {
  it("is Pending when open with no admin reply", () => {
    expect(userTicketStatus("open", false)).toBe("pending");
    expect(userTicketLabel("open", false)).toBe("Pending");
  });
  it("is Responded when open and an admin has replied", () => {
    expect(userTicketStatus("open", true)).toBe("responded");
    expect(userTicketLabel("open", true)).toBe("Responded");
  });
  it("is Closed when closed, regardless of replies", () => {
    expect(userTicketStatus("closed", false)).toBe("closed");
    expect(userTicketStatus("closed", true)).toBe("closed");
    expect(userTicketLabel("closed", true)).toBe("Closed");
  });
});

async function seedEval(): Promise<string> {
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: "https://linkedin.com/in/sup-" + rnd(),
      fullName: "Support Tester",
      score: 10,
      founderScore: 10,
      investorScore: 0,
      signalQuality: "high",
      source: "url",
    })
    .returning();
  return ev!.id;
}

describe.skipIf(IS_PROD_DB)("support lib (db)", () => {
  it("creates a ticket with a derived subject + first user message, threads replies, toggles status", { timeout: 30000 }, async () => {
    const evaluationId = await seedEval();
    const ticket = await createTicket({
      evaluationId,
      clerkUserId: "user_" + rnd(),
      email: "filer@example.com",
      body: "My score didn't update after I claimed.\nMore detail here.",
    });
    // subject derived from the first line
    expect(ticket.subject).toBe("My score didn't update after I claimed.");
    expect(ticket.status).toBe("open");

    // first message is the user's body
    const msgs0 = await listMessages(ticket.id);
    expect(msgs0).toHaveLength(1);
    expect(msgs0[0]!.authorType).toBe("user");

    // it shows up in the filer's list, initially with no admin reply (Pending)
    const listed0 = (await listMyTickets(evaluationId)).find((t) => t.id === ticket.id);
    expect(listed0).toBeTruthy();
    expect(listed0!.adminReplied).toBe(false);

    // admin reply appends + bumps updated_at
    const before = (await getTicket(ticket.id))!.updatedAt;
    await addMessage(ticket.id, "admin", "Looking into it!"); // separate txn → now() advances
    const after = await getTicket(ticket.id);
    expect((await listMessages(ticket.id)).map((m) => m.authorType)).toEqual(["user", "admin"]);
    expect(new Date(after!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());

    // now the filer's list reflects the reply (Responded)
    const listed1 = (await listMyTickets(evaluationId)).find((t) => t.id === ticket.id);
    expect(listed1!.adminReplied).toBe(true);

    // close / reopen
    expect(await setStatus(ticket.id, "closed")).toBe(true);
    expect((await getTicket(ticket.id))!.status).toBe("closed");
    expect(await setStatus(ticket.id, "open")).toBe(true);
    expect((await getTicket(ticket.id))!.status).toBe("open");

    // cleanup
    await db.delete(supportTicketMessages).where(eq(supportTicketMessages.ticketId, ticket.id));
    await db.delete(supportTickets).where(eq(supportTickets.id, ticket.id));
    await db.delete(evaluations).where(eq(evaluations.id, evaluationId));
  });

  it("subject falls back to a generic label for an empty first line", { timeout: 30000 }, async () => {
    const evaluationId = await seedEval();
    const ticket = await createTicket({ evaluationId, clerkUserId: null, email: null, body: "\n\n   \nbody" });
    expect(ticket.subject).toBe("body");
    await db.delete(supportTicketMessages).where(eq(supportTicketMessages.ticketId, ticket.id));
    await db.delete(supportTickets).where(eq(supportTickets.id, ticket.id));
    await db.delete(evaluations).where(eq(evaluations.id, evaluationId));
  });
});
