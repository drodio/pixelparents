"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { isFamilyVerified } from "@/lib/directory";
import { isStudentAccount } from "@/lib/family-display";
import type { SignupRow } from "@/lib/db/schema/signups";
import {
  createAsk,
  createResponse,
  countAsksByAuthorSince,
  decideResponse,
  getAskById,
  hasResponded,
} from "@/lib/db/asks";
import {
  validateAskBody,
  validateAskOffer,
  validateAskTags,
  validateAskTitle,
  validateProposes,
} from "@/lib/ask-validate";

// Server actions for the OHS asks connector. Every action authorizes ENTIRELY
// server-side from the Clerk session (never a client-supplied identity), and
// every actor must be a VERIFIED OHS family. Students may POST asks (they're
// primary askers) but may NEVER be helpers (no responding). Only the asker
// decides on their ask's responses. Creation is rate-limited per author.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-author ask rate limit: at most N new asks in a rolling window.
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

// Create an ask. Caller must be a verified OHS family (parent OR student — both
// can ask). Inputs validated + sanitized; creation is rate-limited per author.
export async function createAskAction(input: {
  title: string;
  body: string;
  tags: string[];
}): Promise<ActionResult> {
  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family to post an ask." };

  const title = validateAskTitle(input.title);
  if (!title.ok) return { ok: false, error: title.error };
  const body = validateAskBody(input.body);
  if (!body.ok) return { ok: false, error: body.error };
  const tags = validateAskTags(input.tags);
  if (!tags.ok) return { ok: false, error: tags.error };

  // Rate limit: count this author's asks in the rolling window.
  const recent = await countAsksByAuthorSince(caller.user.id, Date.now() - ASK_RATE_WINDOW_MS);
  if (recent >= ASK_RATE_LIMIT) {
    return { ok: false, error: "You've posted a lot of asks recently — please try again later." };
  }

  try {
    const ask = await createAsk({
      authorSignupId: caller.user.id,
      authorClerkId: caller.clerkId,
      title: title.value,
      body: body.value,
      expertiseTags: tags.value,
    });
    revalidatePath("/asks");
    return { ok: true, id: ask.id };
  } catch (err) {
    console.error("createAskAction failed:", err);
    return { ok: false, error: "Couldn't post your ask. Please try again." };
  }
}

// Offer to help on an ask. Caller must be a verified OHS family AND NOT a student
// (students seek help, they don't offer it). Can't respond to your own ask, and
// only once per ask. The ask must still be open.
export async function respondToAskAction(input: {
  askId: string;
  offer: string;
  proposes: string;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.askId)) return { ok: false, error: "Unknown ask." };

  const caller = await verifiedCaller();
  if (!caller) return { ok: false, error: "You must be a verified OHS family to offer help." };
  if (isStudentAccount(caller.user)) {
    return { ok: false, error: "Students can ask for help, but only parents can offer to help." };
  }

  const offer = validateAskOffer(input.offer);
  if (!offer.ok) return { ok: false, error: offer.error };
  const proposes = validateProposes(input.proposes);
  if (!proposes.ok) return { ok: false, error: proposes.error };

  const ask = await getAskById(input.askId);
  if (!ask) return { ok: false, error: "Unknown ask." };
  if (ask.status !== "open") return { ok: false, error: "This ask is no longer open." };
  if (ask.authorSignupId === caller.user.id) {
    return { ok: false, error: "You can't offer help on your own ask." };
  }
  if (await hasResponded(input.askId, caller.user.id)) {
    return { ok: false, error: "You've already offered to help on this ask." };
  }

  try {
    await createResponse({
      askId: input.askId,
      responderSignupId: caller.user.id,
      responderClerkId: caller.clerkId,
      offer: offer.value,
      proposes: proposes.value,
    });
    revalidatePath(`/asks/${input.askId}`);
    return { ok: true };
  } catch (err) {
    console.error("respondToAskAction failed:", err);
    return { ok: false, error: "Couldn't send your offer. Please try again." };
  }
}

// Accept or decline a response. ONLY the asker (the response's parent ask's
// author) may decide — enforced in decideResponse's scoped WHERE, which is the
// authorization (a response on someone else's ask matches 0 rows → no-op).
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
    if (!updated) return { ok: false, error: "You can only decide on responses to your own asks." };
    revalidatePath(`/asks/${updated.askId}`);
    return { ok: true };
  } catch (err) {
    console.error("decideResponseAction failed:", err);
    return { ok: false, error: "Couldn't record your decision. Please try again." };
  }
}
