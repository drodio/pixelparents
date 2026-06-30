"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { isFamilyVerified } from "@/lib/directory";
import { getDb } from "@/lib/db";
import { signups, type SignupRow } from "@/lib/db/schema/signups";
import { isStudentAccount } from "@/lib/family-display";
import { createNotification } from "@/lib/db/notifications";
import { getBaseUrl } from "@/lib/url";
import { deriveConnectionParty, buildIntroEmail } from "@/lib/intro";
import { sendConnectionIntro } from "@/lib/email";
import {
  createAsk,
  createResponse,
  countAsksByAuthorSince,
  decideResponse,
  deleteAsk,
  getAskById,
  getResponseById,
  hasResponded,
  setAskResolved,
  updateAsk,
} from "@/lib/db/asks";
import {
  validateAskBody,
  validateAskOffer,
  validateAskTags,
  validateAskTitle,
  validateKind,
  validateProposes,
  validateUrgency,
  validateValidUntil,
} from "@/lib/ask-validate";
import {
  validateSlots,
  validateEaEmail,
  formatSlot,
  sanitizeAttachNote,
} from "@/lib/community-schedule";
import { mentionTargets, normalizeMentions } from "@/lib/mentions";
import {
  searchMentionableMembers,
  resolveMentionables,
  type MentionableMember,
} from "@/lib/db/community-members";
import {
  toggleUpvote,
  toggleAttach,
  saveResponseSchedule,
  listResponseSlots,
  getResponseEaEmail,
} from "@/lib/db/community-engage";

// Server actions for the OHS "Community" connector. Every action authorizes
// ENTIRELY server-side from the Clerk session (never a client-supplied identity),
// and every actor must be a VERIFIED OHS family. Anyone — parent OR student — can
// post Asks AND Offers, and respond to either (the #109 "students can't help"
// restriction is removed). Only the author can edit/delete/resolve their post and
// decide on its responses. Creation is rate-limited per author.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-author post rate limit: at most N new posts in a rolling window.
const ASK_RATE_LIMIT = 5;
const ASK_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

// Resolve the signed-in caller to their VERIFIED OHS family signup, or null.
// The identity is derived from the Clerk session (currentUser → primaryEmail);
// a client can never supply it. A caller with no signup, or whose family isn't
// verified (and isn't grandfathered), resolves null — they can't use the surface.
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

// Live autocomplete for the @-mention picker. Returns VERIFIED, mentionable
// members matching the query (coarsened name + an optional profile token). Caller
// must be a verified OHS family. Never leaks email/phone — only a pickable name.
export async function searchMentionMembersAction(input: {
  query: string;
}): Promise<{ ok: true; results: MentionableMember[] } | { ok: false; error: string }> {
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };
  const q = (input.query ?? "").trim();
  if (q.length < 1) return { ok: true, results: [] };
  try {
    const results = await searchMentionableMembers(q, 8);
    return { ok: true, results };
  } catch (err) {
    console.error("searchMentionMembersAction failed:", err);
    return { ok: false, error: "Couldn't search members." };
  }
}

// Process the @-mentions inside a freshly-written body/offer. We re-resolve every
// referenced id against the DB and (a) re-serialize the body so each marker uses
// the AUTHORITATIVE coarsened name and any unauthorized id collapses to plain text
// (a client can't forge a link to an arbitrary/unverified member), and (b) return
// the set of VERIFIED targets to notify. Self is excluded. Verified-only is the
// privacy gate: an unverified or unknown id is never turned into a live mention or
// notified. Best-effort by design — on any failure we fall back to the raw body
// with no mentions resolved (the post still saves).
async function processMentions(
  body: string,
  selfSignupId: string,
): Promise<{ body: string; targets: { signupId: string; name: string }[] }> {
  try {
    const ids = mentionTargets(body, selfSignupId);
    if (ids.length === 0) return { body, targets: [] };
    const resolved = await resolveMentionables(ids);
    const nameById = new Map<string, string>();
    for (const [id, m] of resolved) nameById.set(id, m.name);
    const normalized = normalizeMentions(body, nameById);
    const targets = Array.from(resolved.values()).map((m) => ({
      signupId: m.signupId,
      name: m.name,
    }));
    return { body: normalized, targets };
  } catch (err) {
    console.error("processMentions failed:", err);
    return { body, targets: [] };
  }
}

// Fan out @-mention notifications to the referenced members (best-effort). The
// title/body carry only the coarsened actor name + the post title — never PII —
// and link to the in-app post. Called from after() so it never blocks the action.
async function notifyMentions(input: {
  targets: { signupId: string; name: string }[];
  actorLabel: string;
  postTitle: string;
  postId: string;
  context: "post" | "response";
}): Promise<void> {
  await Promise.all(
    input.targets.map((t) =>
      createNotification({
        recipientSignupId: t.signupId,
        type: "community_mention",
        title: `${input.actorLabel} mentioned you`,
        body:
          input.context === "response"
            ? `${input.actorLabel} mentioned you in a response on "${input.postTitle}".`
            : `${input.actorLabel} mentioned you in "${input.postTitle}".`,
        link: `/community/${input.postId}`,
      }).catch((err) => {
        console.error("community_mention notification failed:", err);
        return null;
      }),
    ),
  );
}

// Create a post (Ask or Offer). Caller must be a verified OHS family (parent OR
// student — both can post both kinds). Inputs validated + sanitized; creation is
// rate-limited per author.
export async function createAskAction(input: {
  kind: string;
  title: string;
  body: string;
  tags: string[];
  urgency: string;
  validUntil: string | null;
}): Promise<ActionResult> {
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family to post." };

  const kind = validateKind(input.kind);
  if (!kind.ok) return { ok: false, error: kind.error };
  const title = validateAskTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };
  const body = validateAskBody(input.body);
  if (!body.ok) return { ok: false, error: body.error };
  const tags = validateAskTags(input.tags);
  if (!tags.ok) return { ok: false, error: tags.error };
  const urgency = validateUrgency(input.urgency);
  if (!urgency.ok) return { ok: false, error: urgency.error };
  const validUntil = validateValidUntil(input.validUntil);
  if (!validUntil.ok) return { ok: false, error: validUntil.error };

  // Rate limit: count this author's posts in the rolling window.
  const recent = await countAsksByAuthorSince(caller.user.id, Date.now() - ASK_RATE_WINDOW_MS);
  if (recent >= ASK_RATE_LIMIT) {
    return { ok: false, error: "You've posted a lot recently — please try again later." };
  }

  // Resolve @-mentions in the body (re-serialize to authoritative names; collect
  // verified targets to notify). Self is never mentioned/notified.
  const mentioned = await processMentions(body.value, caller.user.id);

  try {
    const ask = await createAsk({
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      kind: kind.value,
      title: title.value,
      body: mentioned.body,
      expertiseTags: tags.value,
      urgency: urgency.value,
      validUntil: validUntil.value,
    });
    revalidatePath("/community");

    // Notify @-mentioned members (best-effort, never blocks the post).
    if (mentioned.targets.length > 0) {
      const actorLabel = notifyLabel(caller.user);
      const postTitle = title.value;
      const postId = ask.id;
      after(async () => {
        await notifyMentions({
          targets: mentioned.targets,
          actorLabel,
          postTitle,
          postId,
          context: "post",
        });
      });
    }
    return { ok: true, id: ask.id };
  } catch (err) {
    console.error("createAskAction failed:", err);
    return { ok: false, error: "Couldn't post. Please try again." };
  }
}

// Edit a post. ONLY the author may edit — enforced by the scoped WHERE in
// updateAsk (a post owned by someone else matches 0 rows → null no-op).
export async function updateAskAction(input: {
  id: string;
  kind: string;
  title: string;
  body: string;
  tags: string[];
  urgency: string;
  validUntil: string | null;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown post." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const kind = validateKind(input.kind);
  if (!kind.ok) return { ok: false, error: kind.error };
  const title = validateAskTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };
  const body = validateAskBody(input.body);
  if (!body.ok) return { ok: false, error: body.error };
  const tags = validateAskTags(input.tags);
  if (!tags.ok) return { ok: false, error: tags.error };
  const urgency = validateUrgency(input.urgency);
  if (!urgency.ok) return { ok: false, error: urgency.error };
  const validUntil = validateValidUntil(input.validUntil);
  if (!validUntil.ok) return { ok: false, error: validUntil.error };

  // Mentions present BEFORE this edit — so we only notify the NEWLY-added ones
  // (an edit shouldn't re-ping everyone who was already mentioned).
  const before = await getAskById(input.id);
  const priorMentionIds = new Set(
    before ? mentionTargets(before.body, caller.user.id) : [],
  );
  const mentioned = await processMentions(body.value, caller.user.id);

  try {
    const updated = await updateAsk({
      id: input.id,
      authorSignupId: caller.user.id,
      kind: kind.value,
      title: title.value,
      body: mentioned.body,
      expertiseTags: tags.value,
      urgency: urgency.value,
      validUntil: validUntil.value,
    });
    if (!updated) return { ok: false, error: "You can only edit your own posts." };
    revalidatePath("/community");
    revalidatePath(`/community/${input.id}`);

    const fresh = mentioned.targets.filter((t) => !priorMentionIds.has(t.signupId));
    if (fresh.length > 0) {
      const actorLabel = notifyLabel(caller.user);
      const postTitle = title.value;
      const postId = updated.id;
      after(async () => {
        await notifyMentions({
          targets: fresh,
          actorLabel,
          postTitle,
          postId,
          context: "post",
        });
      });
    }
    return { ok: true, id: updated.id };
  } catch (err) {
    console.error("updateAskAction failed:", err);
    return { ok: false, error: "Couldn't save your changes. Please try again." };
  }
}

// Delete a post. ONLY the author may delete — enforced by the scoped WHERE.
export async function deleteAskAction(input: { id: string }): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown post." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  try {
    const ok = await deleteAsk({ id: input.id, authorSignupId: caller.user.id });
    if (!ok) return { ok: false, error: "You can only delete your own posts." };
    revalidatePath("/community");
    return { ok: true };
  } catch (err) {
    console.error("deleteAskAction failed:", err);
    return { ok: false, error: "Couldn't delete this post. Please try again." };
  }
}

// Toggle a post resolved ↔ open. ONLY the author may — scoped WHERE in setAskResolved.
export async function setAskResolvedAction(input: {
  id: string;
  resolved: boolean;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) return { ok: false, error: "Unknown post." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  try {
    const updated = await setAskResolved({
      id: input.id,
      authorSignupId: caller.user.id,
      resolved: input.resolved,
    });
    if (!updated) return { ok: false, error: "You can only update your own posts." };
    revalidatePath("/community");
    revalidatePath(`/community/${input.id}`);
    return { ok: true };
  } catch (err) {
    console.error("setAskResolvedAction failed:", err);
    return { ok: false, error: "Couldn't update this post. Please try again." };
  }
}

// Respond to a post. Caller must be a verified OHS family (parent OR student —
// anyone can respond). Can't respond to your own post, and only once per post.
// The post must still be open. For an Ask the response is an OFFER to help; for
// an Offer it's a REQUEST — both stored in ask_responses.
export async function respondToAskAction(input: {
  askId: string;
  offer: string;
  proposes: string;
  // SCHEDULING enrichment (all optional): up to 3 proposed date/time options +
  // an optional executive-assistant email to CC on the intro when accepted.
  slots?: string[];
  eaEmail?: string | null;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.askId)) return { ok: false, error: "Unknown post." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family to respond." };

  const offer = validateAskOffer(input.offer);
  if (!offer.ok) return { ok: false, error: offer.error };
  const proposes = validateProposes(input.proposes);
  if (!proposes.ok) return { ok: false, error: proposes.error };
  const slots = validateSlots(input.slots);
  if (!slots.ok) return { ok: false, error: slots.error };
  const eaEmail = validateEaEmail(input.eaEmail);
  if (!eaEmail.ok) return { ok: false, error: eaEmail.error };

  const ask = await getAskById(input.askId);
  if (!ask) return { ok: false, error: "Unknown post." };
  if (ask.status !== "open") return { ok: false, error: "This post is no longer open." };
  if (ask.authorSignupId === caller.user.id) {
    return { ok: false, error: "You can't respond to your own post." };
  }
  if (await hasResponded(input.askId, caller.user.id)) {
    return { ok: false, error: "You've already responded to this post." };
  }

  // Resolve @-mentions inside the offer text (same rules as a post body).
  const mentioned = await processMentions(offer.value, caller.user.id);

  try {
    const response = await createResponse({
      askId: input.askId,
      responderSignupId: caller.user.id,
      responderClerkId: caller.clerkId,
      offer: mentioned.body,
      proposes: proposes.value,
    });

    // Persist the proposed slots + EA email (if any) alongside the response.
    if (slots.value.length > 0 || eaEmail.value) {
      try {
        await saveResponseSchedule({
          responseId: response.id,
          askId: input.askId,
          proposerSignupId: caller.user.id,
          slots: slots.value,
          eaEmail: eaEmail.value,
        });
      } catch (err) {
        // Scheduling is enrichment — never fail the response if it can't be saved.
        console.error("saveResponseSchedule failed:", err);
      }
    }
    revalidatePath(`/community/${input.askId}`);

    // Notify the post AUTHOR that someone responded. Best-effort (after() — never
    // block/fail the response on the notification). The actor name is the same
    // coarsened label the board already shows (students = first name only); no
    // email/phone/child PII, and the link is the in-app post page.
    after(async () => {
      try {
        await createNotification({
          recipientSignupId: ask.authorSignupId,
          type: "community_response",
          title:
            ask.kind === "offer"
              ? "Someone wants to take you up on your offer"
              : "Someone offered to help with your ask",
          body: `${notifyLabel(caller.user)} responded to "${ask.title}".`,
          link: `/community/${ask.id}`,
        });
      } catch (err) {
        console.error("community_response notification failed:", err);
      }
      // Notify @-mentioned members in the response (excluding the author, who is
      // already notified above only if they weren't mentioned — a mention is a
      // distinct signal, so it's fine for the author to get both).
      if (mentioned.targets.length > 0) {
        await notifyMentions({
          targets: mentioned.targets,
          actorLabel: notifyLabel(caller.user),
          postTitle: ask.title,
          postId: ask.id,
          context: "response",
        });
      }
    });
    return { ok: true };
  } catch (err) {
    console.error("respondToAskAction failed:", err);
    return { ok: false, error: "Couldn't send your response. Please try again." };
  }
}

// Privacy-safe display label for a notification actor — mirrors the directory's
// minor-privacy coarsening (students show first name only; parents show full
// name). Never an email/phone/child full name.
function notifyLabel(s: SignupRow): string {
  if (isStudentAccount(s)) return s.firstName || "A student";
  const full = [s.firstName, s.lastName].filter(Boolean).join(" ");
  return full || s.firstName || "A member";
}

// Accept or decline a response. ONLY the author (the response's parent post's
// author) may decide — enforced in decideResponse's scoped WHERE, which is the
// authorization (a response on someone else's post matches 0 rows → no-op).
export async function decideResponseAction(input: {
  responseId: string;
  decision: "accepted" | "declined";
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.responseId)) return { ok: false, error: "Unknown response." };
  if (input.decision !== "accepted" && input.decision !== "declined") {
    return { ok: false, error: "Invalid decision." };
  }

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  try {
    const updated = await decideResponse({
      responseId: input.responseId,
      askerSignupId: caller.user.id,
      decision: input.decision,
    });
    if (!updated) return { ok: false, error: "You can only decide on responses to your own posts." };
    revalidatePath(`/community/${updated.askId}`);

    // On ACCEPT, the mutual accept is consent to connect: fire the warm double
    // intro email to both parties in the background (after() — never block or
    // fail the accept on email). The reveal/derivation honors the share model +
    // routes minors through a parent (lib/intro). Decline sends nothing.
    if (input.decision === "accepted") {
      after(async () => {
        try {
          await sendConnectionIntroForResponse(updated.id);
        } catch (err) {
          console.error("connection intro email failed:", err);
        }
        // Notify BOTH parties they're connected. The author (caller) is connected
        // with the responder, and vice-versa. Best-effort; coarsened names only,
        // link to the in-app post. We re-load the post + responder from the DB so
        // we use authoritative rows (the connection is consent to be introduced).
        try {
          const ask = await getAskById(updated.askId);
          if (ask) {
            const [responderRow] = await getDb()
              .select()
              .from(signups)
              .where(eq(signups.id, updated.responderSignupId))
              .limit(1);
            if (responderRow) {
              await Promise.all([
                // → the post author (the caller who accepted)
                createNotification({
                  recipientSignupId: ask.authorSignupId,
                  type: "community_connected",
                  title: `You're connected with ${notifyLabel(responderRow)}`,
                  body: `Your connection on "${ask.title}" is confirmed. Check your email for an intro.`,
                  link: `/community/${ask.id}`,
                }),
                // → the responder whose offer/request was accepted
                createNotification({
                  recipientSignupId: updated.responderSignupId,
                  type: "community_connected",
                  title: `You're connected with ${notifyLabel(caller.user)}`,
                  body: `Your response to "${ask.title}" was accepted. Check your email for an intro.`,
                  link: `/community/${ask.id}`,
                }),
              ]);
            }
          }
        } catch (err) {
          console.error("community_connected notification failed:", err);
        }
      });
    }
    return { ok: true };
  } catch (err) {
    console.error("decideResponseAction failed:", err);
    return { ok: false, error: "Couldn't record your decision. Please try again." };
  }
}

// Load both connected parties for an accepted response and send the warm double
// intro email. Runs in the background (after()), so it loads its own data rather
// than trusting anything client-supplied. Best-effort: a missing row / unshared
// contact just narrows the email, it never throws. The asker is the post author;
// the responder is the accepted helper/requester. Both must be verified families
// (they already are — they used the board) but we re-derive their reveal-safe
// contact from the DB here so the email can never leak more than the in-app card.
async function sendConnectionIntroForResponse(responseId: string): Promise<void> {
  const response = await getResponseById(responseId);
  if (!response || response.status !== "accepted") return;
  const ask = await getAskById(response.askId);
  if (!ask) return;

  const db = getDb();
  const [askerRow] = await db
    .select()
    .from(signups)
    .where(eq(signups.id, ask.authorSignupId))
    .limit(1);
  const [responderRow] = await db
    .select()
    .from(signups)
    .where(eq(signups.id, response.responderSignupId))
    .limit(1);
  if (!askerRow || !responderRow) return;

  // The PARENT/guardian signups in each person's family — needed to route a
  // minor's connection through a parent (never the student's raw contact).
  const [askerFamily, responderFamily] = await Promise.all([
    familyParentsOf(askerRow),
    familyParentsOf(responderRow),
  ]);

  const askerParty = deriveConnectionParty(askerRow, askerFamily);
  const responderParty = deriveConnectionParty(responderRow, responderFamily);

  // Proposed scheduling slots + the optional EA email the responder attached.
  const [slots, eaEmail] = await Promise.all([
    listResponseSlots(response.id).catch(() => []),
    getResponseEaEmail(response.id).catch(() => null),
  ]);
  const proposedTimes = slots.map((s) => formatSlot(s.startsAt));

  const { subject, text } = buildIntroEmail({
    asker: askerParty,
    responder: responderParty,
    isOffer: ask.kind === "offer",
    topic: ask.title,
    offerNote: response.offer,
    postUrl: `${getBaseUrl()}/community/${ask.id}`,
    proposedTimes,
  });

  // Deliver to each person's OWN account email (NOT the derived/shared contact —
  // we notify them at the address they signed up with). For a minor with no
  // email, their account row may still carry one; if blank it's skipped, and the
  // intro still reaches the other party + the routed parent below.
  const recipients = [askerRow.email, responderRow.email];
  // Also CC the routed parent so a minor's guardian is looped in on the intro.
  if (askerParty.viaParentName) recipients.push(...askerFamily.map((p) => p.email));
  if (responderParty.viaParentName) recipients.push(...responderFamily.map((p) => p.email));
  // CC the responder's executive assistant, if one was provided. sendConnectionIntro
  // de-dupes + drops blanks, so this is safe even if it matches an existing address.
  if (eaEmail) recipients.push(eaEmail);

  await sendConnectionIntro({ subject, text, recipients });
}

// All signups sharing a person's family_id (the caller + co-parents + linked
// student accounts). lib/intro filters to non-student guardians when routing a
// minor; we pass the whole family so it can pick a reachable parent.
async function familyParentsOf(row: SignupRow): Promise<SignupRow[]> {
  return getDb().select().from(signups).where(eq(signups.familyId, row.familyId));
}

// --- Upvote + attach ---------------------------------------------------------

// Toggle the caller's UPVOTE on a post (one per member, DB-enforced). Caller must
// be a verified OHS family. The post must exist. Returns the post's new vote
// state + count so the client can update without a full refresh.
export async function toggleUpvoteAction(input: {
  askId: string;
}): Promise<{ ok: true; upvoted: boolean; count: number } | { ok: false; error: string }> {
  if (!UUID_RE.test(input.askId)) return { ok: false, error: "Unknown post." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const ask = await getAskById(input.askId);
  if (!ask) return { ok: false, error: "Unknown post." };

  try {
    const res = await toggleUpvote({ askId: input.askId, voterSignupId: caller.user.id });
    revalidatePath("/community");
    revalidatePath(`/community/${input.askId}`);
    return { ok: true, upvoted: res.upvoted, count: res.count };
  } catch (err) {
    console.error("toggleUpvoteAction failed:", err);
    return { ok: false, error: "Couldn't record your upvote. Please try again." };
  }
}

// Toggle the caller's ATTACH/JOIN ("I'd join this too") on a post (one per member,
// DB-enforced), with an optional short note. Caller must be a verified OHS family;
// the post must exist. Returns the new attached state + count. On a NEW attach we
// notify the post author (best-effort) so they see interest building.
export async function toggleAttachAction(input: {
  askId: string;
  note?: string | null;
}): Promise<{ ok: true; attached: boolean; count: number } | { ok: false; error: string }> {
  if (!UUID_RE.test(input.askId)) return { ok: false, error: "Unknown post." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family." };

  const ask = await getAskById(input.askId);
  if (!ask) return { ok: false, error: "Unknown post." };

  // Sanitize the optional note: single line, control chars stripped, capped.
  const note = sanitizeAttachNote(input.note);

  try {
    const res = await toggleAttach({
      askId: input.askId,
      memberSignupId: caller.user.id,
      note,
    });
    revalidatePath("/community");
    revalidatePath(`/community/${input.askId}`);

    // On a fresh JOIN (not an un-join), let the author know interest is building.
    // Never self-notify when the author joins their own post.
    if (res.attached && ask.authorSignupId !== caller.user.id) {
      const actorLabel = notifyLabel(caller.user);
      const postTitle = ask.title;
      const postId = ask.id;
      const recipientId = ask.authorSignupId;
      after(async () => {
        try {
          await createNotification({
            recipientSignupId: recipientId,
            type: "community_response",
            title: "Someone wants to join",
            body: `${actorLabel} said they'd join "${postTitle}".`,
            link: `/community/${postId}`,
          });
        } catch (err) {
          console.error("attach notification failed:", err);
        }
      });
    }
    return { ok: true, attached: res.attached, count: res.count };
  } catch (err) {
    console.error("toggleAttachAction failed:", err);
    return { ok: false, error: "Couldn't update. Please try again." };
  }
}
