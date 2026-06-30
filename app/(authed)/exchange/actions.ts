"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { isFamilyVerified } from "@/lib/directory";
import type { SignupRow } from "@/lib/db/schema/signups";
import {
  createAsk,
  createResponse,
  countAsksByAuthorSince,
  decideResponse,
  deleteAsk,
  getAskById,
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

// Server actions for the OHS "Exchange" connector. Every action authorizes
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

  try {
    const ask = await createAsk({
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      kind: kind.value,
      title: title.value,
      body: body.value,
      expertiseTags: tags.value,
      urgency: urgency.value,
      validUntil: validUntil.value,
    });
    revalidatePath("/exchange");
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

  try {
    const updated = await updateAsk({
      id: input.id,
      authorSignupId: caller.user.id,
      kind: kind.value,
      title: title.value,
      body: body.value,
      expertiseTags: tags.value,
      urgency: urgency.value,
      validUntil: validUntil.value,
    });
    if (!updated) return { ok: false, error: "You can only edit your own posts." };
    revalidatePath("/exchange");
    revalidatePath(`/exchange/${input.id}`);
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
    revalidatePath("/exchange");
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
    revalidatePath("/exchange");
    revalidatePath(`/exchange/${input.id}`);
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
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.askId)) return { ok: false, error: "Unknown post." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family to respond." };

  const offer = validateAskOffer(input.offer);
  if (!offer.ok) return { ok: false, error: offer.error };
  const proposes = validateProposes(input.proposes);
  if (!proposes.ok) return { ok: false, error: proposes.error };

  const ask = await getAskById(input.askId);
  if (!ask) return { ok: false, error: "Unknown post." };
  if (ask.status !== "open") return { ok: false, error: "This post is no longer open." };
  if (ask.authorSignupId === caller.user.id) {
    return { ok: false, error: "You can't respond to your own post." };
  }
  if (await hasResponded(input.askId, caller.user.id)) {
    return { ok: false, error: "You've already responded to this post." };
  }

  try {
    await createResponse({
      askId: input.askId,
      responderSignupId: caller.user.id,
      responderClerkId: caller.clerkId,
      offer: offer.value,
      proposes: proposes.value,
    });
    revalidatePath(`/exchange/${input.askId}`);
    return { ok: true };
  } catch (err) {
    console.error("respondToAskAction failed:", err);
    return { ok: false, error: "Couldn't send your response. Please try again." };
  }
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
    revalidatePath(`/exchange/${updated.askId}`);
    return { ok: true };
  } catch (err) {
    console.error("decideResponseAction failed:", err);
    return { ok: false, error: "Couldn't record your decision. Please try again." };
  }
}
