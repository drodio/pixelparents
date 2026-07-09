import { describe, it, expect, vi, beforeEach } from "vitest";

// Authorization coverage for the POLL server actions. The core contrast:
//   • createPollAction / closePollAction — PARTY-ONLY (post author or responder).
//   • votePollAction — ANY verified member (public input).
// We mock every collaborator so no network/DB is touched; each test drives who the
// caller is + who the parties are, and asserts the allow/deny decision + that the
// right data fn was (or wasn't) invoked.

// --- Mutable test doubles ---------------------------------------------------
let caller: { id: string; clerkId: string } | null = { id: "author-1", clerkId: "clerk-author" };
let parties: {
  askId: string;
  askStatus: string;
  postAuthorSignupId: string;
  responderSignupId: string;
} | null = {
  askId: "ask-1",
  askStatus: "open",
  postAuthorSignupId: "author-1",
  responderSignupId: "responder-1",
};

// Hoisted so the vi.mock factories (which run before top-level consts) can close
// over them without a TDZ error.
const { addPollMock, castVoteMock, closePollMock, createNotificationMock } = vi.hoisted(() => ({
  addPollMock: vi.fn(async () => ({ id: "poll-msg" })),
  castVoteMock: vi.fn(async () => ({ ok: true, state: "added" as const })),
  closePollMock: vi.fn(async () => ({ id: "poll-msg", poll: { closed: true } })),
  createNotificationMock: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// `after` runs its callback synchronously in tests (fire-and-forget notify).
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => (caller ? { id: caller.clerkId } : null)),
}));
vi.mock("@/lib/clerk", () => ({ primaryEmail: () => "caller@gopixel.org" }));
vi.mock("@/lib/db/signups", () => ({
  getSignupByEmail: vi.fn(async () =>
    caller ? { id: caller.id, firstName: "Cal", lastName: "Ler", extra: {} } : null,
  ),
}));
vi.mock("@/lib/directory", () => ({ isFamilyVerified: () => true }));
vi.mock("@/lib/family-display", () => ({ isStudentAccount: () => false }));
vi.mock("@/lib/db/notifications", () => ({ createNotification: createNotificationMock }));
vi.mock("@/lib/db/events", () => ({ createEvent: vi.fn() }));
vi.mock("@/lib/db/asks", () => ({ getAskById: vi.fn(async () => ({ title: "A post" })) }));

vi.mock("@/lib/db/exchange-thread", () => ({
  getResponseParties: vi.fn(async () => parties),
  getMessageContext: vi.fn(async () =>
    parties ? { ...parties, message: { kind: "poll" } } : null,
  ),
  addResponseMessage: vi.fn(),
  acceptEventProposal: vi.fn(),
  declineEventProposal: vi.fn(),
  deleteResponseMessage: vi.fn(),
  countMessagesByAuthorSince: vi.fn(async () => 0),
  addPoll: addPollMock,
  castVote: castVoteMock,
  closePoll: closePollMock,
}));

import { createPollAction, votePollAction, closePollAction } from "./thread-actions";

const RESP = "11111111-1111-1111-1111-111111111111";
const MSG = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  addPollMock.mockClear();
  castVoteMock.mockClear();
  closePollMock.mockClear();
  createNotificationMock.mockClear();
  caller = { id: "author-1", clerkId: "clerk-author" };
  parties = {
    askId: "ask-1",
    askStatus: "open",
    postAuthorSignupId: "author-1",
    responderSignupId: "responder-1",
  };
});

describe("createPollAction — PARTY-only", () => {
  it("a party (post author) can create a poll", async () => {
    const res = await createPollAction({ responseId: RESP, question: "Q?", options: ["a", "b"] });
    expect(res.ok).toBe(true);
    expect(addPollMock).toHaveBeenCalledOnce();
    // Notifies the OTHER party via community_reply.
    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientSignupId: "responder-1", type: "community_reply" }),
    );
  });

  it("a NON-party is rejected and no poll is created", async () => {
    caller = { id: "stranger-9", clerkId: "clerk-stranger" };
    const res = await createPollAction({ responseId: RESP, question: "Q?", options: ["a", "b"] });
    expect(res.ok).toBe(false);
    expect(addPollMock).not.toHaveBeenCalled();
  });

  it("rejects when the post is closed", async () => {
    parties = { ...parties!, askStatus: "closed" };
    const res = await createPollAction({ responseId: RESP, question: "Q?", options: ["a", "b"] });
    expect(res.ok).toBe(false);
    expect(addPollMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input (only one option)", async () => {
    const res = await createPollAction({ responseId: RESP, question: "Q?", options: ["a"] });
    expect(res.ok).toBe(false);
    expect(addPollMock).not.toHaveBeenCalled();
  });
});

describe("votePollAction — ANY verified member", () => {
  it("a NON-party verified member CAN vote (public input)", async () => {
    caller = { id: "stranger-9", clerkId: "clerk-stranger" };
    const res = await votePollAction({ messageId: MSG, optionIndex: 0 });
    expect(res.ok).toBe(true);
    expect(castVoteMock).toHaveBeenCalledOnce();
    expect(castVoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: MSG, voterSignupId: "stranger-9", optionIndex: 0 }),
    );
    // No per-vote notification.
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("an unverified / signed-out caller cannot vote", async () => {
    caller = null;
    const res = await votePollAction({ messageId: MSG, optionIndex: 0 });
    expect(res.ok).toBe(false);
    expect(castVoteMock).not.toHaveBeenCalled();
  });

  it("surfaces a closed-poll rejection from castVote", async () => {
    castVoteMock.mockResolvedValueOnce({ ok: false, error: "closed" } as never);
    const res = await votePollAction({ messageId: MSG, optionIndex: 0 });
    expect(res.ok).toBe(false);
  });
});

describe("closePollAction — PARTY-only", () => {
  it("a party can close the poll", async () => {
    const res = await closePollAction({ messageId: MSG });
    expect(res.ok).toBe(true);
    expect(closePollMock).toHaveBeenCalledOnce();
  });

  it("a NON-party is rejected", async () => {
    caller = { id: "stranger-9", clerkId: "clerk-stranger" };
    const res = await closePollAction({ messageId: MSG });
    expect(res.ok).toBe(false);
    expect(closePollMock).not.toHaveBeenCalled();
  });
});
