"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { isFamilyVerified } from "@/lib/directory";
import { isStudentAccount } from "@/lib/family-display";
import type { SignupRow } from "@/lib/db/schema/signups";
import { createNotification } from "@/lib/db/notifications";
import { createEvent } from "@/lib/db/events";
import {
  getResponseParties,
  getMessageContext,
  addResponseMessage,
  acceptEventProposal,
  declineEventProposal,
  deleteResponseMessage,
  countMessagesByAuthorSince,
  addPoll,
  castVote,
  closePoll,
  type ProposedEvent,
} from "@/lib/db/exchange-thread";
import { getAskById } from "@/lib/db/asks";
import {
  validateReplyBody,
  validateProposalNote,
  validateVisibility,
  validatePollQuestion,
  validatePollOptions,
} from "@/lib/exchange-thread-validate";
import {
  validateEventTitle,
  validateLocation,
  validateOnlineUrl,
  resolveInstant,
  validateRange,
} from "@/lib/events/validate";

// Server actions for the Exchange THREAD — the back-and-forth on a single
// Community response. Every action authorizes ENTIRELY server-side from the Clerk
// session (never a client-supplied identity). The core rule: the caller must be a
// PARTY to the response (the post author OR the responder). A forged responseId /
// messageId resolves 0 rows → the action errors. Notifications always go to the
// OTHER party (never self) and never leak private message text.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-author message rate limit: at most N messages in a rolling window.
const MSG_RATE_LIMIT = 30;
const MSG_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

// Resolve the signed-in caller to their VERIFIED OHS family signup, or null. The
// identity is derived from the Clerk session; a client can never supply it.
async function verifiedCaller(): Promise<{ user: SignupRow; clerkId: string } | null> {
  const user = await currentUser();
  if (!user) return null;
  const email = primaryEmail(user);
  if (!email) return null;
  const signup = await getSignupByEmail(email);
  if (!signup) return null;
  if (!isFamilyVerified(signup)) return null;
  return { user: signup, clerkId: user.id };
}

// Privacy-safe display label for a notification actor — mirrors the directory's
// minor-privacy coarsening (students show first name only; parents show full
// name). Never an email/phone/child full name.
function notifyLabel(s: SignupRow): string {
  if (isStudentAccount(s)) return s.firstName || "A student";
  const full = [s.firstName, s.lastName].filter(Boolean).join(" ");
  return full || s.firstName || "A member";
}

// Whether the caller is a party to the response, and who the OTHER party is.
// This is the single authorization gate reused by every thread action.
function partyRole(
  callerSignupId: string,
  parties: { postAuthorSignupId: string; responderSignupId: string },
): { isParty: boolean; otherSignupId: string | null } {
  if (callerSignupId === parties.postAuthorSignupId) {
    return { isParty: true, otherSignupId: parties.responderSignupId };
  }
  if (callerSignupId === parties.responderSignupId) {
    return { isParty: true, otherSignupId: parties.postAuthorSignupId };
  }
  return { isParty: false, otherSignupId: null };
}

// Post a comment / private note reply to a response's thread. Caller must be a
// PARTY (post author or responder). The post must not be closed. Notifies the
// OTHER party with a generic body that never leaks the private text.
export async function replyToResponseAction(input: {
  responseId: string;
  body: string;
  visibility?: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.responseId)) return { ok: false, error: "Unknown response." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const parties = await getResponseParties(input.responseId);
  if (!parties) return { ok: false, error: "Unknown response." };

  const role = partyRole(caller.user.id, parties);
  if (!role.isParty) {
    return { ok: false, error: "Only the two people in this conversation can reply." };
  }
  if (parties.askStatus === "closed") {
    return { ok: false, error: "This post is closed — the conversation is locked." };
  }

  const body = validateReplyBody(input.body);
  if (!body.ok) return { ok: false, error: body.error };
  const visibility = validateVisibility(input.visibility);

  // Rate limit: count this author's messages in the rolling window.
  const recent = await countMessagesByAuthorSince(caller.user.id, Date.now() - MSG_RATE_WINDOW_MS);
  if (recent >= MSG_RATE_LIMIT) {
    return { ok: false, error: "You've sent a lot of messages recently — please try again later." };
  }

  try {
    await addResponseMessage({
      responseId: input.responseId,
      askId: parties.askId,
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      kind: "comment",
      visibility,
      body: body.value,
    });
    revalidatePath(`/community/${parties.askId}`);

    // Notify the OTHER party — generic body (never the private text). Best-effort.
    const otherId = role.otherSignupId;
    if (otherId) {
      const label = notifyLabel(caller.user);
      const askId = parties.askId;
      after(async () => {
        try {
          const ask = await getAskById(askId);
          const title = ask?.title ?? "your post";
          await createNotification({
            recipientSignupId: otherId,
            type: "community_reply",
            title: `${label} replied to your conversation`,
            body: `${label} replied to your conversation on "${title}".`,
            link: `/community/${askId}`,
          });
        } catch (err) {
          console.error("community_reply notification failed:", err);
        }
      });
    }
    return { ok: true };
  } catch (err) {
    console.error("replyToResponseAction failed:", err);
    return { ok: false, error: "Couldn't send your reply. Please try again." };
  }
}

// Propose a calendar event inside a response's thread. Caller must be a PARTY.
// Validates the event fields via lib/events/validate (reusing the fixed timezone
// logic). Inserts an event_proposal message in 'proposed' state and notifies the
// OTHER party.
export async function proposeEventAction(input: {
  responseId: string;
  visibility?: string;
  note?: string | null;
  title: string;
  date: string;
  time: string | null;
  endDate?: string | null;
  endTime?: string | null;
  tzOffsetMinutes: number;
  isOnline: boolean;
  location?: string | null;
  onlineUrl?: string | null;
  allDay: boolean;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.responseId)) return { ok: false, error: "Unknown response." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const parties = await getResponseParties(input.responseId);
  if (!parties) return { ok: false, error: "Unknown response." };

  const role = partyRole(caller.user.id, parties);
  if (!role.isParty) {
    return { ok: false, error: "Only the two people in this conversation can propose an event." };
  }
  if (parties.askStatus === "closed") {
    return { ok: false, error: "This post is closed — the conversation is locked." };
  }

  const visibility = validateVisibility(input.visibility);
  const note = validateProposalNote(input.note);
  if (!note.ok) return { ok: false, error: note.error };

  // Validate the event fields (same rules + timezone handling as /events).
  const title = validateEventTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };

  const allDay = Boolean(input.allDay);
  const start = resolveInstant(input.date, allDay ? "" : input.time, allDay ? 0 : input.tzOffsetMinutes);
  const end = input.endDate
    ? resolveInstant(input.endDate, allDay ? "" : input.endTime, allDay ? 0 : input.tzOffsetMinutes)
    : null;
  const range = validateRange(start, end, allDay);
  if (!range.ok) return { ok: false, error: range.error };

  const isOnline = Boolean(input.isOnline);
  let location: string | null = null;
  let onlineUrl: string | null = null;
  if (isOnline) {
    const u = validateOnlineUrl(input.onlineUrl);
    if (!u.ok) return { ok: false, error: u.error };
    onlineUrl = u.value;
  } else {
    const l = validateLocation(input.location);
    if (!l.ok) return { ok: false, error: l.error };
    location = l.value;
  }

  const proposed: ProposedEvent = {
    title: title.value,
    startsAt: range.value.startsAt.toISOString(),
    endsAt: range.value.endsAt ? range.value.endsAt.toISOString() : null,
    isOnline,
    location,
    onlineUrl,
    allDay,
  };

  const recent = await countMessagesByAuthorSince(caller.user.id, Date.now() - MSG_RATE_WINDOW_MS);
  if (recent >= MSG_RATE_LIMIT) {
    return { ok: false, error: "You've sent a lot of messages recently — please try again later." };
  }

  try {
    await addResponseMessage({
      responseId: input.responseId,
      askId: parties.askId,
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      kind: "event_proposal",
      visibility,
      body: note.value,
      proposedEvent: proposed,
      eventStatus: "proposed",
    });
    revalidatePath(`/community/${parties.askId}`);

    const otherId = role.otherSignupId;
    if (otherId) {
      const label = notifyLabel(caller.user);
      const askId = parties.askId;
      const eventTitle = title.value;
      after(async () => {
        try {
          await createNotification({
            recipientSignupId: otherId,
            type: "community_event",
            title: `${label} proposed an event`,
            body: `${label} proposed an event: "${eventTitle}".`,
            link: `/community/${askId}`,
          });
        } catch (err) {
          console.error("community_event notification failed:", err);
        }
      });
    }
    return { ok: true };
  } catch (err) {
    console.error("proposeEventAction failed:", err);
    return { ok: false, error: "Couldn't propose the event. Please try again." };
  }
}

// Accept an event proposal → create a REAL user event on /events (the "make it an
// OHS event" flow, i.e. it lands on the shared community calendar). Caller must be
// a PARTY and NOT the proposer (you can't accept your own proposal). Idempotent if
// already accepted. Notifies the proposer.
export async function acceptEventProposalAction(input: {
  messageId: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.messageId)) return { ok: false, error: "Unknown proposal." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const ctx = await getMessageContext(input.messageId);
  if (!ctx) return { ok: false, error: "Unknown proposal." };

  const role = partyRole(caller.user.id, ctx);
  if (!role.isParty) {
    return { ok: false, error: "Only the two people in this conversation can act on this." };
  }
  if (ctx.message.kind !== "event_proposal" || !ctx.message.proposedEvent) {
    return { ok: false, error: "That isn't an event proposal." };
  }
  // Can't accept your OWN proposal.
  if (ctx.message.authorSignupId === caller.user.id) {
    return { ok: false, error: "You can't accept your own proposal — the other person does." };
  }
  // Idempotent: already accepted → success no-op (surface the existing event).
  if (ctx.message.eventStatus === "accepted") {
    return { ok: true, id: ctx.message.eventId ?? undefined };
  }
  if (ctx.message.eventStatus === "declined") {
    return { ok: false, error: "This proposal was declined." };
  }

  const p = ctx.message.proposedEvent;
  try {
    // Create the real user event (shows on /events + the shared community calendar).
    const event = await createEvent({
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      authorLabel: notifyLabel(caller.user),
      title: p.title,
      description: ctx.message.body ?? null,
      startsAt: new Date(p.startsAt),
      endsAt: p.endsAt ? new Date(p.endsAt) : null,
      isOnline: p.isOnline,
      location: p.location,
      onlineUrl: p.onlineUrl,
      allDay: p.allDay,
    });

    const updated = await acceptEventProposal({ messageId: input.messageId, eventId: event.id });
    // A race (accepted between our load + write) → the update matched 0 rows.
    // Treat as idempotent success.
    if (!updated) {
      revalidatePath(`/community/${ctx.askId}`);
      revalidatePath("/events");
      return { ok: true, id: event.id };
    }

    revalidatePath(`/community/${ctx.askId}`);
    revalidatePath("/events");

    // Notify the PROPOSER their event is on the calendar.
    const proposerId = ctx.message.authorSignupId;
    const label = notifyLabel(caller.user);
    after(async () => {
      try {
        await createNotification({
          recipientSignupId: proposerId,
          type: "community_event",
          title: `${label} added your event to the calendar`,
          body: `${label} added your proposed event "${p.title}" to the calendar.`,
          link: "/events",
        });
      } catch (err) {
        console.error("community_event accept notification failed:", err);
      }
    });
    return { ok: true, id: event.id };
  } catch (err) {
    console.error("acceptEventProposalAction failed:", err);
    return { ok: false, error: "Couldn't add the event. Please try again." };
  }
}

// Decline an event proposal. Party-scoped (either party may decline). Notifies the
// proposer. Idempotent-ish: a non-'proposed' proposal matches 0 rows → surfaced.
export async function declineEventProposalAction(input: {
  messageId: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.messageId)) return { ok: false, error: "Unknown proposal." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const ctx = await getMessageContext(input.messageId);
  if (!ctx) return { ok: false, error: "Unknown proposal." };

  const role = partyRole(caller.user.id, ctx);
  if (!role.isParty) {
    return { ok: false, error: "Only the two people in this conversation can act on this." };
  }
  if (ctx.message.kind !== "event_proposal") {
    return { ok: false, error: "That isn't an event proposal." };
  }
  if (ctx.message.eventStatus === "accepted") {
    return { ok: false, error: "This proposal was already added to the calendar." };
  }
  if (ctx.message.eventStatus === "declined") {
    return { ok: true }; // idempotent
  }

  try {
    const updated = await declineEventProposal(input.messageId);
    revalidatePath(`/community/${ctx.askId}`);
    if (!updated) return { ok: true }; // race → treat as declined

    // Notify the proposer (unless they declined their own proposal).
    const proposerId = ctx.message.authorSignupId;
    if (proposerId !== caller.user.id) {
      const label = notifyLabel(caller.user);
      const eventTitle = ctx.message.proposedEvent?.title ?? "the event";
      after(async () => {
        try {
          await createNotification({
            recipientSignupId: proposerId,
            type: "community_event",
            title: `${label} declined your event proposal`,
            body: `${label} declined your proposed event "${eventTitle}".`,
            link: `/community/${ctx.askId}`,
          });
        } catch (err) {
          console.error("community_event decline notification failed:", err);
        }
      });
    }
    return { ok: true };
  } catch (err) {
    console.error("declineEventProposalAction failed:", err);
    return { ok: false, error: "Couldn't decline. Please try again." };
  }
}

// Delete a message — AUTHOR-scoped (a message owned by someone else matches 0
// rows → no-op). Cascades nothing important.
export async function deleteResponseMessageAction(input: {
  messageId: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.messageId)) return { ok: false, error: "Unknown message." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const ctx = await getMessageContext(input.messageId);
  if (!ctx) return { ok: false, error: "Unknown message." };

  try {
    const ok = await deleteResponseMessage({
      messageId: input.messageId,
      authorSignupId: caller.user.id,
    });
    if (!ok) return { ok: false, error: "You can only delete your own messages." };
    revalidatePath(`/community/${ctx.askId}`);
    return { ok: true };
  } catch (err) {
    console.error("deleteResponseMessageAction failed:", err);
    return { ok: false, error: "Couldn't delete this message. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Polls — a party (post author or responder) creates a poll to gauge public
// interest / gather input; ANY verified member may vote; results are public.
// ---------------------------------------------------------------------------

// Create a poll inside a response's thread. Caller must be a PARTY (post author or
// responder). The post must not be closed. Polls are always PUBLIC. Notifies the
// OTHER party via the existing community_reply type.
export async function createPollAction(input: {
  responseId: string;
  question: string;
  options: string[];
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.responseId)) return { ok: false, error: "Unknown response." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const parties = await getResponseParties(input.responseId);
  if (!parties) return { ok: false, error: "Unknown response." };

  const role = partyRole(caller.user.id, parties);
  if (!role.isParty) {
    return { ok: false, error: "Only the two people in this conversation can create a poll." };
  }
  if (parties.askStatus === "closed") {
    return { ok: false, error: "This post is closed — the conversation is locked." };
  }

  const question = validatePollQuestion(input.question);
  if (!question.ok) return { ok: false, error: question.error };
  const options = validatePollOptions(input.options);
  if (!options.ok) return { ok: false, error: options.error };

  const recent = await countMessagesByAuthorSince(caller.user.id, Date.now() - MSG_RATE_WINDOW_MS);
  if (recent >= MSG_RATE_LIMIT) {
    return { ok: false, error: "You've sent a lot of messages recently — please try again later." };
  }

  try {
    await addPoll({
      responseId: input.responseId,
      askId: parties.askId,
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      question: question.value,
      options: options.value,
    });
    revalidatePath(`/community/${parties.askId}`);

    const otherId = role.otherSignupId;
    if (otherId) {
      const label = notifyLabel(caller.user);
      const askId = parties.askId;
      const q = question.value;
      after(async () => {
        try {
          await createNotification({
            recipientSignupId: otherId,
            type: "community_reply",
            title: `${label} started a poll`,
            body: `${label} started a poll: "${q}".`,
            link: `/community/${askId}`,
          });
        } catch (err) {
          console.error("community_reply poll notification failed:", err);
        }
      });
    }
    return { ok: true };
  } catch (err) {
    console.error("createPollAction failed:", err);
    return { ok: false, error: "Couldn't create the poll. Please try again." };
  }
}

// Vote on a poll — ANY verified member may vote (this is public input, not a
// party-only action). Toggles/changes/retracts via castVote. No notification
// (per-vote spam avoidance).
export async function votePollAction(input: {
  messageId: string;
  optionIndex: number;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.messageId)) return { ok: false, error: "Unknown poll." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const res = await castVote({
    messageId: input.messageId,
    voterSignupId: caller.user.id,
    optionIndex: input.optionIndex,
  });
  if (!res.ok) {
    const msg =
      res.error === "closed"
        ? "This poll is closed."
        : res.error === "bad_option"
          ? "That isn't a valid option."
          : "That poll no longer exists.";
    return { ok: false, error: msg };
  }

  // Revalidate the post so the fresh counts render. We resolve the ask id from the
  // message context (cheap join) so we hit the right path.
  const ctx = await getMessageContext(input.messageId);
  if (ctx) revalidatePath(`/community/${ctx.askId}`);
  return { ok: true };
}

// Close a poll — PARTY-scoped (a party of the response the poll lives on). A
// non-party or forged id matches 0 rows in the scoped UPDATE.
export async function closePollAction(input: {
  messageId: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.messageId)) return { ok: false, error: "Unknown poll." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const ctx = await getMessageContext(input.messageId);
  if (!ctx) return { ok: false, error: "Unknown poll." };
  if (ctx.message.kind !== "poll") return { ok: false, error: "That isn't a poll." };

  const role = partyRole(caller.user.id, ctx);
  if (!role.isParty) {
    return { ok: false, error: "Only the two people in this conversation can close this poll." };
  }

  try {
    const updated = await closePoll({ messageId: input.messageId, callerSignupId: caller.user.id });
    revalidatePath(`/community/${ctx.askId}`);
    if (!updated) return { ok: false, error: "Couldn't close the poll." };
    return { ok: true };
  } catch (err) {
    console.error("closePollAction failed:", err);
    return { ok: false, error: "Couldn't close the poll. Please try again." };
  }
}
